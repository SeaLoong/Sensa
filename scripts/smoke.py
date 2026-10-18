"""仅在 GitHub Actions 运行无设备 HTTP/WS/OSC 冒烟。 / CI-only device-free HTTP/WS/OSC smoke."""
import argparse
import base64
import json
import importlib.util
import math
import os
from pathlib import Path
import socket
import struct
import time
import urllib.error
import urllib.request

from process_smoke import SmokeSession, require_ci, wait_for_state

def frame(payload):
    data = json.dumps(payload).encode(); mask = os.urandom(4)
    header = bytes([0x81, 0x80 | len(data)]) if len(data) < 126 else bytes([0x81, 0xfe]) + struct.pack('!H', len(data))
    return header + mask + bytes(c ^ mask[i % 4] for i, c in enumerate(data))

def read_exact(sock, size):
    result = bytearray()
    while len(result) < size:
        part = sock.recv(size - len(result))
        if not part: raise AssertionError('Unexpected socket close')
        result.extend(part)
    return result

def read_frame(sock):
    head = read_exact(sock, 2); size = head[1] & 127
    if size == 126: size = struct.unpack('!H', read_exact(sock, 2))[0]
    if size == 127: size = struct.unpack('!Q', read_exact(sock, 8))[0]
    data = read_exact(sock, size)
    return json.loads(data) if head[0] & 15 == 1 else None

def fixed_root_samples(point, instance='Smoke'):
    """Independent fixed-four-anchor fixture / 独立的固定四锚点夹具。"""
    prefix = f'Sensa/SpsRoot/v1/{instance}/Self'
    # Deliberately separate from Pose's 8 corners, .35 m receiver and moving frame.
    # 明确独立于 Pose 八点、.35 半径与移动参考框；这里使用 AvatarRootLocal。
    anchors = ((-.5, .5, -.5), (.5, .5, .5), (.5, 1.5, -.5), (-.5, 1.5, .5))
    result = []
    for index, anchor in enumerate(anchors):
        distance = math.sqrt(sum((point[axis] - anchor[axis]) ** 2 for axis in range(3)))
        proximity = max(0, min(1, 1 - max(0, distance - .001) / 2.5))
        result.append((f'{prefix}/Root/A{index}', proximity))
    return result + [(prefix + '/Profile', 1), (prefix + '/Valid', 1),
                     (prefix + '/Scale', 1), (prefix + '/Heartbeat', 1 / 31)]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dotnet', default='dotnet', help='dotnet 可执行文件。 / dotnet executable.')
    executable = parser.add_mutually_exclusive_group(required=True)
    executable.add_argument('--dll', help='待验证的 Sensa DLL。 / Sensa DLL to verify.')
    executable.add_argument('--exe', help='待验证的 Sensa 可执行文件。 / Sensa executable to verify.')
    parser.add_argument('--report-dir', type=Path, help='诊断输出目录。 / Diagnostic output directory.')
    args = parser.parse_args()
    try:
        require_ci()
    except RuntimeError as error:
        parser.error(str(error))
    report_dir = args.report_dir.resolve() if args.report_dir else None
    dotnet = str(Path(args.dotnet).resolve()) if '/' in args.dotnet or '\\' in args.dotnet else args.dotnet
    launch_command = [str(Path(args.exe).resolve())] if args.exe else [dotnet, str(Path(args.dll).resolve())]
    with SmokeSession(launch_command, report_dir=report_dir) as session:
        base, port, cookie = session.base, session.port, session.cookie
        assert b'app.bundle.js' in session.request('/', authenticated=False).read()
        assert len(session.request('/app.bundle.js', authenticated=False).read()) > 1000
        def request(path, headers=None):
            return session.request(path, headers=headers, authenticated=False)
        try: request('/api/config'); raise AssertionError('Missing authentication accepted')
        except urllib.error.HTTPError as error: assert error.code == 401
        try: request('/api/config', {'Cookie':cookie, 'Origin':'http://untrusted.invalid'}); raise AssertionError('Cross origin accepted')
        except urllib.error.HTTPError as error: assert error.code == 403
        snapshot = json.load(request('/api/state/overview', {'Cookie':cookie}))
        assert not snapshot['runtime']['inputActive']
        assert isinstance(json.load(request('/api/meta/serial-ports', {'Cookie':cookie})), list)
        with socket.create_connection(('127.0.0.1', port), timeout=15) as ws:
            key = base64.b64encode(os.urandom(16)).decode()
            ws.sendall((f'GET /api/ws HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\nOrigin: {base}\r\nCookie: {cookie}\r\n\r\n').encode())
            headers = bytearray()
            while not headers.endswith(b'\r\n\r\n'): headers.extend(read_exact(ws, 1))
            assert b'101' in headers
            for i in range(30): ws.sendall(frame({'id':str(i), 'method':'GET', 'path':'/api/state/overview'}))
            received = set()
            while len(received) < 30:
                message = read_frame(ws)
                if message and message.get('id') is not None:
                    assert message['ok']; received.add(message['id'])
            def command(path, method='POST', body=None):
                marker = 'cmd-' + path
                ws.sendall(frame({'id':marker,'method':method,'path':path,'body':body}))
                deadline=time.monotonic()+30
                while True:
                    if time.monotonic()>deadline:raise TimeoutError('No WebSocket response for '+method+' '+path)
                    result = read_frame(ws)
                    if result and result.get('id') == marker:
                        assert result['ok'], result
                        return result['data']
            def wait_overview(predicate, description):
                return wait_for_state(lambda: command('/api/state/overview', 'GET'), predicate, description)
            configuration = command('/api/config', 'GET')
            with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as udp:
                udp.bind(('127.0.0.1', 0)); osc_port = udp.getsockname()[1]
            configuration['osc'].update(enabled=True, receiverHost='127.0.0.1', receiverPort=osc_port, oscQueryEnabled=False)
            command('/api/config', 'PUT', configuration)
            command('/api/input/mode', 'PUT', {'mode':'osc'})
            def osc_string(value):
                data = value.encode() + b'\0'
                return data + b'\0' * (-len(data) % 4)
            with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as udp:
                controls = [('OGB/Orf/Test/PenOthers', .8), ('Face/v2/JawOpen', .5), ('JawOpen', .5), ('Custom/FT/Control', .5)]
                ft_flood = [(f'FT/UnknownControl{i}', .5) for i in range(150)] + [(f'v2/UnknownControl{i}', .5) for i in range(150)]
                for name, value in controls + ft_flood + [('InvalidFloat', float('nan'))]:
                    udp.sendto(osc_string('/avatar/parameters/' + name) + osc_string(',f') + struct.pack('!f', value), ('127.0.0.1', osc_port))
                    time.sleep(.001)
            snapshot = wait_overview(lambda s: len(s['osc']['preview']) >= 250 and any(e['path'] == 'OGB/Orf/Test/PenOthers' for e in s['osc']['preview']), 'OSC flood was not received')
            preview = {e['path']: e for e in snapshot['osc']['preview']}
            assert 'OGB/Orf/Test/PenOthers' in preview
            assert len(preview) >= 250, len(preview)
            assert preview['FT/UnknownControl1']['classification']['isFaceTracking']
            assert preview['v2/UnknownControl1']['classification']['isFaceTracking']
            for path in ('Face/v2/JawOpen', 'JawOpen', 'Custom/FT/Control'):
                assert not preview[path]['classification']['isFaceTracking'], 'Only FT namespace prefixes are hidden / 仅按 FT 命名空间前缀隐藏'
            assert 'InvalidFloat' not in preview
            assert not snapshot['runtime']['inputActive']
            fixture_spec = importlib.util.spec_from_file_location('pose_fixture', Path(__file__).with_name('pose-demo.py'))
            fixture = importlib.util.module_from_spec(fixture_spec); fixture_spec.loader.exec_module(fixture)
            configuration = command('/api/config', 'GET')
            assert not configuration['outputs'], 'Smoke test must never enable hardware'
            configuration['signals'] = [{'oscPath': 'CI/Depth', 'role': 'Depth'}, {'oscPath': 'CI/Active', 'role': 'GateEnable'}]
            command('/api/input/active', 'PUT', {'active':True})
            command('/api/config', 'PUT', configuration)
            assert not command('/api/state/overview', 'GET')['runtime']['inputActive'], 'Saving mappings must close input'
            with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as udp:
                command('/api/input/active', 'PUT', {'active':True})
                for depth in (0, .25, .5, .75, 1):
                    udp.sendto(fixture.bundle([('CI/Depth', depth), ('CI/Active', 1)]), ('127.0.0.1', osc_port))
                    wait_overview(lambda s: not s['runtime']['gateClosed'] and abs(s['runtime']['command']['l0'] - depth) <= .0011, f'OSC scalar step {depth} did not reach Sensa')
                udp.sendto(fixture.bundle([('CI/Active', 0)]), ('127.0.0.1', osc_port))
                wait_overview(lambda s: s['runtime']['gateClosed'], 'Fixture STOP did not close the OSC scalar gate')
            configuration['osc']['allowExperimentalSpatialInput'] = True
            configuration['osc']['inputTimeoutMs'] = 5000
            configuration['signals'] = [{'oscPath':'Sensa/Pose/v1/*/*/**','sourceMode':'SensaPose','poseMetric':'Depth','role':'Depth','vrchatMin':0,'vrchatMax':1}]
            command('/api/config', 'PUT', configuration)
            assert not command('/api/state/overview', 'GET')['runtime']['inputActive'], 'Switching away from OSC scalar must leave input closed'
            with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as udp:
                udp.sendto(fixture.bundle(fixture.samples((.02,0,-.1),(.02,0,.1),(.05,0,-.1))), ('127.0.0.1', osc_port))
                command('/api/input/active', 'PUT', {'active':True})
                snapshot = wait_overview(lambda s: len(s['poseTracking']['observations']) > 0 and abs(s['runtime']['command']['l0'] - .5) < .001 and not s['runtime']['poseBlocked'], 'Paired pose did not produce expected L0')
                pose = snapshot['poseTracking']['observations'][0]
                assert pose['valid'] and pose['engaged'] and pose['sampleCount'] == 24
                assert abs(snapshot['runtime']['command']['l0'] - .5) < .001
                standard = fixed_root_samples((.025, 1.05, -.1))
                udp.sendto(fixture.bundle(standard), ('127.0.0.1', osc_port))
                def fixed_root(state):
                    return next((point for point in state['poseTracking']['spsRoots']
                                 if point['kind'] == 'SpsRoot' and point['instance'] == 'Smoke'
                                 and point['party'] == 'Self'), None)
                snapshot = wait_overview(lambda s: fixed_root(s) is not None
                                         and fixed_root(s)['valid']
                                         and fixed_root(s)['sampleCount'] == 4
                                         and fixed_root(s)['coordinateFrame'] == 'AvatarRootLocal'
                                         and abs(fixed_root(s)['position']['x'] - .025) < .0001,
                                         'Fixed four-anchor root samples missing / 缺少固定四锚点根采样')
                root = fixed_root(snapshot)
                assert root['valid'] and root['sampleCount'] == 4
                assert root['coordinateFrame'] == 'AvatarRootLocal'
                assert abs(root['position']['x'] - .025) < .0001
                assert abs(root['position']['y'] - 1.05) < .0001
                assert abs(root['position']['z'] + .1) < .0001
                assert abs(snapshot['runtime']['command']['l0'] - .5) < .001, 'Unmapped root probe changed pose motion'
                udp.sendto(fixture.bundle([('Sensa/Pose/v1/Demo/Others/Tip/A0',0)]), ('127.0.0.1', osc_port))
                wait_overview(lambda s: s['runtime']['poseBlocked'], 'Lost pose did not block motion')
            configuration = command('/api/config', 'GET')
            configuration['signals'] = [{'oscPath':'Sensa/Handle/v1/Grip/Self/**','sourceMode':'SensaPoint','pointMetric':'Z','role':'Depth','vrchatMin':0,'vrchatMax':.2}]
            command('/api/config', 'PUT', configuration)
            assert not command('/api/state/overview', 'GET')['runtime']['inputActive'], 'Switching to PB must leave input closed'
            handle_prefix = 'Sensa/Handle/v1/Grip/Self'
            root_values = [value for path, value in fixture.samples((.02,0,.1),(0,0,0),(0,0,0)) if '/Root/' in path]
            values = [(handle_prefix + f'/Root/A{i}', root_values[anchor]) for i, anchor in enumerate((0,3,5,6))]
            with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as udp:
                udp.sendto(fixture.bundle(values + [(handle_prefix+'/Handle_IsGrabbed',1)]), ('127.0.0.1',osc_port))
                command('/api/input/active','PUT',{'active':True})
                snapshot = wait_overview(lambda s: not s['runtime']['poseBlocked'] and any(p['kind'] == 'Handle' and p['valid'] for p in s['poseTracking']['spsRoots']) and abs(s['runtime']['command']['l0'] - .5) < .001, 'PB input did not produce expected L0')
                assert abs(snapshot['runtime']['command']['l0']-.5)<.001
                assert any(p['kind']=='Handle' and p['valid'] for p in snapshot['poseTracking']['spsRoots'])
                udp.sendto(fixture.bundle([(handle_prefix+'/Handle_IsGrabbed',0)]), ('127.0.0.1',osc_port))
                wait_overview(lambda s: s['runtime']['poseBlocked'], 'PB release did not stop point input')
            command('/api/input/active','PUT',{'active':False})
        print('HTTP/WS 冒烟通过：身份验证、FT、OSC scalar 五档/STOP、保存后关闭输入、Pose/Root 隔离及 PB 释放。 / HTTP/WS smoke passed: authentication, FT flood, OSC scalar five steps/STOP, mapping-save disarm, pose/root isolation and PB release; no devices configured.')
        session.complete()


if __name__ == '__main__':
    main()
