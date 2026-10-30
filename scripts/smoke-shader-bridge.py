"""CI-only diagnostic GPU PNG and synthetic native-codec replay; no capture or device output."""
import argparse
import binascii
from collections import deque
import importlib.util
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


class BridgeStatusObserver:
    """Bounded JSON observations from the actual diagnostic producer, not OSC cache values."""
    def __init__(self, process, max_events=128, clock=time.monotonic):
        if process.stdout is None or type(max_events) is not int or max_events < 1:
            raise ValueError('Choose a producer stdout stream and a positive observation bound')
        self.process, self.clock = process, clock
        self._events = deque(maxlen=max_events)
        self._condition, self._stop = threading.Condition(), threading.Event()
        self._sequence, self._error, self._eof = 0, None, False
        self._started = clock()
        self._thread = threading.Thread(target=self._read, name='shader-status-observer', daemon=True)
        self._thread.start()

    def _read(self):
        try:
            while not self._stop.is_set():
                line = self.process.stdout.readline(16385)
                if not line:
                    break
                if not isinstance(line, str) or len(line) > 16384:
                    raise ValueError('Shader producer observation is not bounded JSON text')
                value = json.loads(line)
                if (not isinstance(value, dict) or type(value.get('valid')) is not bool
                        or not isinstance(value.get('error'), (str, type(None)))
                        or 'sample' not in value):
                    raise ValueError('Shader producer observation has an invalid status shape')
                sample = value['sample']
                if (sample is not None and (not isinstance(sample, dict) or type(sample.get('frame')) is not int
                                           or not 0 <= sample['frame'] <= 65535)) or (value['valid'] and sample is None):
                    raise ValueError('Shader producer observation has an invalid frame')
                with self._condition:
                    self._sequence += 1
                    self._events.append({'sequence': self._sequence,
                                         'observedSeconds': self.clock() - self._started, 'status': value})
                    self._condition.notify_all()
        except (OSError, ValueError) as error:
            with self._condition:
                self._error = str(error)
        finally:
            with self._condition:
                self._eof = True
                self._condition.notify_all()

    def mark(self):
        with self._condition:
            return self._sequence

    def snapshot(self):
        with self._condition:
            return {'cursor': self._sequence, 'lastStatus': self._events[-1]['status'] if self._events else None,
                    'events': list(self._events), 'readerError': self._error, 'eof': self._eof}

    def wait_for(self, predicate, *, after=0, description, timeout=3):
        deadline = self.clock() + timeout
        with self._condition:
            while True:
                if self._error or self._eof or self.process.poll() is not None:
                    raise AssertionError(description + '; producer stopped or status failed: '
                                         + json.dumps(self.snapshot(), ensure_ascii=False))
                latest = self._events[-1] if self._events else None
                # An earlier valid sample cannot acknowledge a newer invalid state.
                if latest and latest['sequence'] > after and predicate(latest['status']):
                    return latest['status']
                remaining = deadline - self.clock()
                if remaining <= 0:
                    raise AssertionError(description + '; producer observation timed out: '
                                         + json.dumps(self.snapshot(), ensure_ascii=False))
                self._condition.wait(min(.05, remaining))

    def close(self):
        self._stop.set()
        self._thread.join(timeout=1)
        if self._thread.is_alive():
            raise RuntimeError('Shader producer observation reader did not stop after producer shutdown')


def fixture_sample(path):
    """Read expected IDs from the pinned PNGs with the same decoder as the producer."""
    from PIL import Image
    spec = importlib.util.spec_from_file_location('sensa_shader_smoke_codec', Path(__file__).with_name('shader-osc-bridge.py'))
    codec = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(codec)
    with Image.open(path) as source:
        with source.convert('RGB') as image:
            return codec.decode_pixels(list(image.get_flattened_data()), *image.size)


def stop_producer(process):
    if process.poll() is None:
        process.terminate()
        try:
            process.wait(timeout=3)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=3)


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


def diagnostic_replay(session, args, current, *, observer_factory=BridgeStatusObserver):
    """Advance each pinned fixture only after its actual capture has been observed."""
    api, root, prefix = session.api, session.root, 'Sensa/Diagnostics/Shader/0/'
    expected = {name: fixture_sample(path)['frame'] for name, path in
                (('first', args.first), ('next', args.next), ('recover_first', args.recover_first),
                 ('recover_next', args.recover_next)) if path is not None}
    trace = {'phase': 'start', 'acknowledgements': []}
    bridge = session.start_child([sys.executable, str(Path(__file__).with_name('shader-osc-bridge.py')),
                                  '--image', str(current), '--port', str(session.osc_port), '--watch',
                                  '--status-every-frame', '--duration', '45', '--timeout', '.8'],
                                 stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding='utf-8')
    observer = observer_factory(bridge)
    def preview():
        return {item['path']: item['numericValue'] for item in api('/api/state/overview')['osc']['preview']}
    def wait_gate(value):
        assert bridge.poll() is None, 'Producer exit cannot establish a transport-gate transition'
        return wait_for_state(preview, lambda values: values.get(prefix + 'Valid') == value,
                              f'Missing diagnostic Valid gate={value} during {trace["phase"]}', timeout=3)
    def observed(phase, frame, valid, after, reason=None):
        trace['phase'] = phase
        def matches(status):
            sample = status['sample']
            return (status['valid'] is valid and (sample is None if frame is None else
                    sample is not None and sample['frame'] == frame)
                    and (reason is None or reason in (status['error'] or '')))
        status = observer.wait_for(matches, after=after, description='Shader producer did not consume ' + phase)
        trace['acknowledgements'].append({'phase': phase, 'afterCursor': after, 'status': status})
        return status
    def replace_image(path):
        after = observer.mark()
        next_file = root / 'next.png'
        shutil.copyfile(path, next_file)
        replace_frame(next_file, current)
        return after
    try:
        observed('initial fixture', expected['first'], False, 0, 'waiting for two progressing frames')
        wait_gate(0)
        after = replace_image(args.next)
        observed('initial advancing fixture', expected['next'], True, after)
        fresh = wait_gate(1)
        for axis, value in zip('XYZ', (.06, 0, .12)):
            assert abs(fresh[prefix + axis] - value) < .00005
        assert not any(path.startswith('Sensa/Shader/') for path in fresh), 'Diagnostic PNGs must not enter the native motion namespace'
        assert not api('/api/state/overview')['runtime']['inputActive']
        if args.corrupt:
            after = replace_image(args.corrupt)
            observed('CRC failure', None, False, after, 'CRC')
            wait_gate(0)
            after = replace_image(args.next)
            observed('old good fixture after CRC failure', expected['next'], False, after, 'CRC')
            assert preview()[prefix + 'Valid'] == 0, 'An old good frame reopened the gate after CRC failure'
            after = replace_image(args.recover_first)
            observed('first recovery fixture', expected['recover_first'], False, after, 'waiting for a second progressing frame')
            assert preview()[prefix + 'Valid'] == 0, 'One recovery frame reopened the gate'
            after = replace_image(args.recover_next)
            observed('second recovery fixture', expected['recover_next'], True, after)
            wait_gate(1)
        trace['phase'] = 'freeze watchdog'
        stale = wait_gate(0)
        assert bridge.poll() is None, 'Producer exit cannot establish frozen-frame watchdog invalidation'
        assert not any(path.startswith('Sensa/Shader/') for path in stale)
        assert not api('/api/state/overview')['runtime']['inputActive']
        assert not api('/api/config')['outputs']
        return {'fresh': fresh, 'afterFreeze': stale, 'trace': trace}
    except BaseException as error:
        trace['failure'] = str(error)
        raise
    finally:
        stop_producer(bridge)
        observer.close()
        trace['producerObservations'] = observer.snapshot()
        args.report.parent.mkdir(parents=True, exist_ok=True)
        (args.report.parent / 'shader-diagnostic-trace.json').write_text(json.dumps(trace, indent=2) + '\n', encoding='utf-8')


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
        diagnostic = diagnostic_replay(session, args, current)
        native = native_smoke(session)
        report={'passed':True,'source':'Unity diagnostic PNG and synthetic native-codec PNG replay; no native GPU/client capture or motion evidence','timeoutSeconds':.8,'fresh':diagnostic['fresh'],'diagnosticOnly':False,'inputActive':False,'crcClosesTransportGate':bool(args.corrupt),'oldFrameRejected':bool(args.corrupt),'twoFrameRecoveryVerified':bool(args.corrupt),'transportGateClosedAfterFreeze':True,'afterFreeze':diagnostic['afterFreeze'],'diagnosticTrace':diagnostic['trace'],'outputs':[], 'nativeSynthetic': native}
        args.report.parent.mkdir(parents=True,exist_ok=True);args.report.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print('诊断与合成原生 PNG → bridge → OSC 通过；输入保持关闭。 / Diagnostic and synthetic native PNG -> bridge -> OSC passed; input stayed disarmed.')
        session.complete()


if __name__ == '__main__':
    main()
