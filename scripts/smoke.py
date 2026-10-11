"""Run a device-free HTTP/WebSocket smoke test from an unrelated working directory."""
import argparse
import base64
import json
import importlib.util
import os
from pathlib import Path
import socket
import struct
import subprocess
import tempfile
import time
import urllib.error
import urllib.request

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

def main():
    parser = argparse.ArgumentParser(); parser.add_argument('--dotnet', default='dotnet'); parser.add_argument('--dll'); parser.add_argument('--exe')
    args = parser.parse_args()
    with socket.socket() as probe:
        probe.bind(('127.0.0.1', 0)); port = probe.getsockname()[1]
    base = f'http://127.0.0.1:{port}'
    with tempfile.TemporaryDirectory(prefix='sensa-smoke-') as tmp:
        config = Path(tmp) / 'config.json'
        config.write_text(json.dumps({'webUi': {'host':'127.0.0.1', 'port':port, 'autoOpenBrowser':False}, 'osc':{'enabled':False}, 'outputs':[]}))
        env = dict(os.environ, SENSA_CONFIG_PATH=str(config))
        command = [str(Path(args.exe).resolve())] if args.exe else [str(Path(args.dotnet).resolve()) if '/' in args.dotnet or '\\' in args.dotnet else args.dotnet, str(Path(args.dll).resolve())]
        with open(Path(tmp) / 'service.log', 'w+', encoding='utf-8') as log:
            process = subprocess.Popen(command, cwd=tmp, env=env, stdout=log, stderr=log)
            try:
                deadline = time.monotonic() + 25
                while True:
                    try:
                        response = urllib.request.urlopen(base + '/api/session', timeout=1)
                        cookie = response.headers['Set-Cookie'].split(';')[0]; break
                    except (OSError, urllib.error.URLError):
                        if time.monotonic() > deadline or process.poll() is not None:
                            log.seek(0); raise AssertionError(log.read())
                        time.sleep(.1)
                assert b'app.bundle.js' in urllib.request.urlopen(base).read()
                assert len(urllib.request.urlopen(base + '/app.bundle.js').read()) > 1000
                def request(path, headers=None):
                    return urllib.request.urlopen(urllib.request.Request(base + path, headers=headers or {}))
                try: request('/api/config'); raise AssertionError('Missing authentication accepted')
                except urllib.error.HTTPError as error: assert error.code == 401
                try: request('/api/config', {'Cookie':cookie, 'Origin':'http://untrusted.invalid'}); raise AssertionError('Cross origin accepted')
                except urllib.error.HTTPError as error: assert error.code == 403
                snapshot = json.load(request('/api/state/overview', {'Cookie':cookie}))
                assert not snapshot['runtime']['inputActive']
                with socket.create_connection(('127.0.0.1', port), timeout=5) as ws:
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
                        while True:
                            result = read_frame(ws)
                            if result and result.get('id') == marker:
                                assert result['ok'], result
                                return result['data']
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
                        for name, value in [('OGB/Orf/Test/PenOthers', .8)] + [(f'Face/v2/JawOpen{i}', .5) for i in range(300)] + [('InvalidFloat', float('nan'))]:
                            udp.sendto(osc_string('/avatar/parameters/' + name) + osc_string(',f') + struct.pack('!f', value), ('127.0.0.1', osc_port))
                            time.sleep(.001)
                    time.sleep(.1)
                    snapshot = command('/api/state/overview', 'GET')
                    preview = {e['path']: e for e in snapshot['osc']['preview']}
                    assert 'OGB/Orf/Test/PenOthers' in preview
                    assert len(preview) >= 250, len(preview)
                    assert preview['Face/v2/JawOpen1']['classification']['isFaceTracking']
                    assert 'InvalidFloat' not in preview
                    assert not snapshot['runtime']['inputActive']
                    fixture_spec = importlib.util.spec_from_file_location('pose_fixture', Path(__file__).with_name('pose-demo.py'))
                    fixture = importlib.util.module_from_spec(fixture_spec); fixture_spec.loader.exec_module(fixture)
                    configuration = command('/api/config', 'GET')
                    assert not configuration['outputs'], 'Smoke test must never enable hardware'
                    configuration['signals'] = [{'oscPath':'Sensa/Pose/v1/*/*/**','sourceMode':'SensaPose','poseMetric':'Depth','role':'Depth','vrchatMin':0,'vrchatMax':1}]
                    command('/api/config', 'PUT', configuration)
                    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as udp:
                        udp.sendto(fixture.bundle(fixture.samples((.02,0,-.1),(.02,0,.1),(.05,0,-.1))), ('127.0.0.1', osc_port))
                        time.sleep(.1)
                        command('/api/input/active', 'PUT', {'active':True})
                        time.sleep(.1)
                        snapshot = command('/api/state/overview', 'GET')
                        pose = snapshot['poseTracking']['observations'][0]
                        assert pose['valid'] and pose['engaged'] and pose['sampleCount'] == 24
                        assert abs(snapshot['runtime']['command']['l0'] - .5) < .001
                        standard = [(path.replace('Sensa/Pose/v1/', 'Sensa/SpsRoot/v1/'), value)
                                    for path, value in fixture.samples((.025,-.02,-.1),(0,0,0),(0,0,0),radius=.01) if '/Root/' in path]
                        udp.sendto(fixture.bundle(standard), ('127.0.0.1', osc_port))
                        time.sleep(.15)
                        snapshot = command('/api/state/overview', 'GET')
                        root = snapshot['poseTracking']['spsRoots'][0]
                        assert root['valid'] and root['sampleCount'] == 8
                        assert abs(root['position']['x'] - .025) < .0001
                        assert abs(snapshot['runtime']['command']['l0'] - .5) < .001, 'Diagnostic probe changed motion'
                        udp.sendto(fixture.bundle([('Sensa/Pose/v1/Demo/Others/Tip/A0',0)]), ('127.0.0.1', osc_port))
                        deadline = time.monotonic() + 3
                        while True:
                            time.sleep(.05); snapshot = command('/api/state/overview', 'GET')
                            if snapshot['runtime']['poseBlocked']: break
                            assert time.monotonic() < deadline, 'Lost pose did not block motion'
                    command('/api/input/active', 'PUT', {'active':False})
                print('HTTP/WS smoke passed: authentication, FT flood, NaN rejection, pose reconstruction/loss guard and diagnostic SPS root isolation; no devices configured.')
            finally:
                process.terminate()
                try: process.wait(timeout=5)
                except subprocess.TimeoutExpired: process.kill(); process.wait()

if __name__ == '__main__': main()
