"""CI-only diagnostic GPU PNG and synthetic native-codec replay; no capture or device output."""
import argparse
import binascii
import json
import os
from pathlib import Path
import shutil
import subprocess
import struct
import sys
import threading
import time

import telemetry_qr

from process_smoke import SmokeSession, require_ci, wait_for_state

NATIVE_WIDTH = NATIVE_HEIGHT = 196
NATIVE_FIELDS = ('Frame', 'X', 'Y', 'Z', 'RightX', 'RightY', 'RightZ',
                 'ForwardX', 'ForwardY', 'ForwardZ', 'AvatarScale', 'Valid')


def native_fixture():
    return json.loads((Path(__file__).resolve().parents[1] / 'tests/fixtures/shader-native-format1.json').read_text(encoding='utf-8'))


def native_pixels(frame, damaged=False):
    """Render a synthetic QR and optionally erase eight symbols per RS block."""
    packet = bytearray.fromhex(native_fixture()['packetHex'])
    struct.pack_into('<H', packet, 4, frame)
    struct.pack_into('<I', packet, 28, binascii.crc32(packet[:28]))
    image = telemetry_qr.render(packet, NATIVE_WIDTH, NATIVE_HEIGHT)
    if damaged:
        # Interleaving spreads this bounded damage across all four RS blocks.
        # Erasing any module marks its complete codeword as an erasure.
        for byte in range(32):
            x, y = telemetry_qr.data_positions()[byte * 8]
            for py in range((y + 8) * 4, (y + 9) * 4):
                for px in range((x + 8) * 4, (x + 9) * 4):
                    image[py * NATIVE_WIDTH + px] = (128, 128, 128)
    return image


class NativeFrameFeed:
    """One bounded fixture writer atomically replaces frames while the CI bridge reads."""
    def __init__(self, current):
        self.current, self.frame = Path(current), 256
        self._stop, self._error, self._thread = threading.Event(), None, None

    def write(self):
        from PIL import Image
        image = Image.new('RGB', (NATIVE_WIDTH, NATIVE_HEIGHT))
        image.putdata(native_pixels(self.frame, damaged=True))
        pending = self.current.with_name('native-pending.png')
        image.save(pending)
        if self.current.exists(): replace_frame(pending, self.current)
        else: pending.replace(self.current)

    def start(self):
        require_ci()
        self.write()
        def advance():
            try:
                while not self._stop.wait(.08):
                    self.frame = (self.frame + 1) & 65535
                    self.write()
            except BaseException as error:
                self._error = error; self._stop.set()
        self._thread = threading.Thread(target=advance, name='synthetic-native-frames', daemon=True)
        self._thread.start()

    def stop(self):
        self._stop.set()
        if self._thread is not None:
            self._thread.join(timeout=3)
            if self._thread.is_alive(): raise RuntimeError('Synthetic native fixture writer did not stop')
        if self._error is not None: raise RuntimeError('Synthetic native fixture writer failed') from self._error


def native_smoke(session):
    require_ci()
    prefix = 'Sensa/Shader/42/'
    feed = NativeFrameFeed(session.root / 'native-frame.png')
    try:
        feed.start()
        native_bridge = session.start_child([sys.executable, str(Path(__file__).with_name('shader-osc-bridge.py')),
                                            '--image', str(feed.current), '--producer-id', '42', '--port', str(session.osc_port),
                                            '--watch', '--duration', '12', '--timeout', '.35'], stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        def inspect():
            state = session.api('/api/state/overview')
            assert not state['runtime']['inputActive'], 'Native fixture replay must keep input disabled'
            values = {item['path']: item['numericValue'] for item in state['osc']['preview']}
            root = next((item for item in state['poseTracking']['spsRoots'] if item['prefix'] == 'Sensa/Shader/42'), None)
            return {'values': values, 'root': root, 'inputActive': False}
        fresh = wait_for_state(inspect, lambda state: state['values'].get(prefix + 'Valid') == 1
                               and state['root'] is not None and state['root']['valid'],
                               'Synthetic native PNG did not produce a valid twelve-field root', timeout=5)
        assert native_bridge.poll() is None, 'Native bridge exited before the live-frame assertion'
        expected = native_fixture()['expected']
        assert all(prefix + field in fresh['values'] for field in NATIVE_FIELDS)
        for key, stem in (('xyz', ''), ('right', 'Right'), ('forward', 'Forward')):
            for axis, value in zip('XYZ', expected[key]):
                assert abs(fresh['values'][prefix + stem + axis] - value) < .000001
        assert abs(fresh['values'][prefix + 'AvatarScale'] - expected['avatarScale']) < .000001
        for key in ('right', 'forward'):
            for axis, value in zip('xyz', expected[key]): assert abs(fresh['root'][key][axis] - value) < .000001
        assert abs(fresh['root']['avatarScale'] - expected['avatarScale']) < .000001
        assert fresh['root']['kind'] == 'ShaderRoot'
    finally:
        feed.stop()
    stale = wait_for_state(inspect, lambda state: state['values'].get(prefix + 'Valid') == 0
                           and state['root'] is not None and not state['root']['valid'],
                           'Frozen synthetic native PNG did not invalidate transport and root', timeout=3)
    assert native_bridge.poll() is None, 'Native bridge exit cannot establish freeze watchdog invalidation'
    assert not session.api('/api/config')['outputs']
    return {'passed': True, 'synthetic': True, 'source': 'Synthetic native format-1 PNG; not a GPU/client capture',
            'erasedSymbolsPerBlock': 8, 'qrVersion': 4, 'errorCorrection': 'H', 'packetBytes': 32, 'oscFields': list(NATIVE_FIELDS), 'fresh': fresh,
            'afterFreeze': stale, 'inputActive': False, 'outputs': []}

def replace_frame(source, target):
    """Use the same replacement primitive as the Unity File.Replace exporter."""
    if os.name != 'nt':
        Path(source).replace(target)
        return
    import ctypes
    from ctypes import wintypes
    replace = ctypes.WinDLL('kernel32', use_last_error=True).ReplaceFileW
    replace.argtypes = [wintypes.LPCWSTR, wintypes.LPCWSTR, wintypes.LPCWSTR,
                        wintypes.DWORD, wintypes.LPVOID, wintypes.LPVOID]
    replace.restype = wintypes.BOOL
    if not replace(str(Path(target).resolve()), str(Path(source).resolve()), None, 0, None, None):
        raise ctypes.WinError(ctypes.get_last_error())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--exe', required=True, type=Path, help='Sensa 可执行文件。 / Sensa executable.')
    parser.add_argument('--first', required=True, type=Path, help='首个 Unity PNG。 / First Unity PNG.')
    parser.add_argument('--next', required=True, type=Path, help='后继 Unity PNG。 / Next Unity PNG.')
    parser.add_argument('--report', required=True, type=Path, help='结果 JSON 路径。 / Result JSON path.')
    parser.add_argument('--corrupt', type=Path, help='CRC 损坏帧。 / Corrupt CRC frame.')
    parser.add_argument('--recover-first', type=Path, help='首个恢复帧。 / First recovery frame.')
    parser.add_argument('--recover-next', type=Path, help='第二个恢复帧。 / Second recovery frame.')
    args = parser.parse_args()
    try:
        require_ci()
    except RuntimeError as error:
        parser.error(str(error))
    if any((args.corrupt, args.recover_first, args.recover_next)) and not all((args.corrupt, args.recover_first, args.recover_next)):
        parser.error('故障恢复需要全部三个帧参数。 / Fault recovery needs --corrupt, --recover-first and --recover-next together.')
    with SmokeSession([str(args.exe.resolve())], osc_enabled=True, report_dir=args.report.parent / 'process') as session:
        root, osc, api = session.root, session.osc_port, session.api
        current = root / 'frame.png'
        shutil.copyfile(args.first, current)
        configuration=api('/api/config')
        assert not configuration['outputs'], 'Only an isolated, device-free configuration is allowed'
        configuration['signals'] = []
        api('/api/config', configuration)
        assert not api('/api/state/overview')['runtime']['inputActive'], '诊断回放必须保持输入关闭。 / Diagnostic replay must keep input disarmed.'
        # Enabling OSC in configuration does not select the actual input mode. / 开启 OSC 配置不等于选择实际输入方式。
        api('/api/input/mode', {'mode': 'Osc'})
        listening = wait_for_state(lambda: api('/api/state/overview'),
                                   lambda state: state['input']['mode'] == 'osc' and state['osc']['listening'],
                                   'OSC 接收未就绪。 / OSC receiver is not ready.', timeout=3)
        assert not listening['runtime']['inputActive'], '选择 OSC 不能启用输入。 / Selecting OSC must not arm input.'
        prefix = 'Sensa/Diagnostics/Shader/0/'
        bridge=session.start_child([sys.executable,str(Path(__file__).with_name('shader-osc-bridge.py')),'--image',str(current),'--port',str(osc),'--watch','--duration','12','--timeout','.8'],stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
        def preview():return {x['path']:x['numericValue'] for x in api('/api/state/overview')['osc']['preview']}
        def wait_gate(value, timeout=3):
            return wait_for_state(preview, lambda values: values.get(prefix + 'Valid') == value,
                                  f'未收到 Valid 门控 / Missing Valid gate={value}', timeout=timeout)
        wait_gate(0)
        # Atomically replace the source, matching the editor PNG exporter.
        def replace_image(path):
            next_file=root/'next.png';shutil.copyfile(path,next_file);replace_frame(next_file,current)
        replace_image(args.next)
        fresh=wait_gate(1)
        expected=(.06,0,.12)
        for axis,value in zip('XYZ',expected): assert abs(fresh[prefix + axis]-value)<.00005
        assert not any(path.startswith('Sensa/Shader/') for path in fresh), 'Diagnostic PNGs must not enter the native motion namespace'
        assert not api('/api/state/overview')['runtime']['inputActive']
        if args.corrupt:
            replace_image(args.corrupt);wait_gate(0)
            replace_image(args.next);time.sleep(.12)
            assert preview()[prefix + 'Valid']==0,'An old good frame reopened the gate after CRC failure'
            replace_image(args.recover_first);time.sleep(.12)
            assert preview()[prefix + 'Valid']==0,'One recovery frame reopened the gate'
            replace_image(args.recover_next);wait_gate(1)
        stale=wait_gate(0)
        assert not any(path.startswith('Sensa/Shader/') for path in stale)
        assert not api('/api/state/overview')['runtime']['inputActive']
        assert not api('/api/config')['outputs']
        # Finish the diagnostic producer before the separate pinned native case.
        bridge.terminate()
        try: bridge.wait(timeout=3)
        except subprocess.TimeoutExpired: bridge.kill(); bridge.wait(timeout=3)
        native = native_smoke(session)
        report={'passed':True,'source':'Unity diagnostic PNG and synthetic native-codec PNG replay; no native GPU/client capture or motion evidence','timeoutSeconds':.8,'fresh':fresh,'diagnosticOnly':False,'inputActive':False,'crcClosesTransportGate':bool(args.corrupt),'oldFrameRejected':bool(args.corrupt),'twoFrameRecoveryVerified':bool(args.corrupt),'transportGateClosedAfterFreeze':True,'afterFreeze':stale,'outputs':[], 'nativeSynthetic': native}
        args.report.parent.mkdir(parents=True,exist_ok=True);args.report.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print('诊断与合成原生 PNG → bridge → OSC 通过；输入保持关闭。 / Diagnostic and synthetic native PNG -> bridge -> OSC passed; input stayed disarmed.')
        session.complete()


if __name__ == '__main__':
    main()
