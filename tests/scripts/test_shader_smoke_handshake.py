"""Isolated producer-observation contracts; no subprocess, capture or network.

Queue barriers acknowledge reader iterations, rather than assuming that a
producer has consumed a PNG after a fixed wall-clock sleep.
"""
import json
import contextlib
import io
from pathlib import Path
import queue
import shutil
import sys
import tempfile
import threading
from types import SimpleNamespace
import unittest
from unittest import mock

from lab_contract_fixtures import load_script


smoke = load_script('smoke-shader-bridge')
bridge = load_script('shader-osc-bridge')


def status(frame, valid=False, error='waiting for a second progressing frame'):
    return {'producerId': None, 'sample': None if frame is None else {'frame': frame, 'xyz': [.06, 0, .12]},
            'valid': valid, 'error': error}


class QueueTextStream:
    """The next readline entry proves the preceding line was processed."""
    def __init__(self):
        self.pending = queue.Queue()
        self.condition = threading.Condition()
        self.reads = 0
        self.ended = False

    def readline(self, limit=-1):
        with self.condition:
            self.reads += 1
            self.condition.notify_all()
        item = self.pending.get()
        if isinstance(item, BaseException):
            raise item
        if item is None:
            return ''
        return item if limit < 0 else item[:limit]

    def wait_for_reads(self, count):
        with self.condition:
            if not self.condition.wait_for(lambda: self.reads >= count, timeout=1):
                raise AssertionError('Producer reader did not reach the expected queue barrier')

    def emit(self, payload):
        with self.condition:
            before = self.reads
        self.pending.put(json.dumps(payload) + '\n')
        self.wait_for_reads(before + 1)

    def end(self):
        if not self.ended:
            self.ended = True
            self.pending.put(None)


class FakeProcess:
    def __init__(self):
        self.stdout = QueueTextStream()
        self.returncode = None

    def poll(self):
        return self.returncode


class ShaderSmokeObservationContracts(unittest.TestCase):
    def observer(self, *, max_events=128):
        process = FakeProcess()
        observer = smoke.BridgeStatusObserver(process, max_events=max_events)
        process.stdout.wait_for_reads(1)
        self.addCleanup(observer.close)
        self.addCleanup(process.stdout.end)
        return process, observer

    def assert_observation_failure(self, observer, description, *, predicate=lambda _: True, after=0, timeout=1):
        with self.assertRaisesRegex(AssertionError, description):
            observer.wait_for(predicate, after=after, description=description, timeout=timeout)

    def test_recovery_ack_waits_for_new_matching_producer_observation(self):
        process, observer = self.observer()
        process.stdout.emit(status(102, True, None))
        cursor = observer.mark()
        started, saw_wrong_frame, finished = threading.Event(), threading.Event(), threading.Event()
        result, errors = [], []

        def expected_recovery(payload):
            if payload['sample']['frame'] == 102:
                saw_wrong_frame.set()
            return (payload['sample']['frame'] == 103 and payload['valid'] is False
                    and payload['error'] == 'waiting for a second progressing frame')

        def wait_for_recovery():
            started.set()
            try:
                result.append(observer.wait_for(expected_recovery, after=cursor,
                                                description='new recovery frame103', timeout=1))
            except BaseException as error:
                errors.append(error)
            finally:
                finished.set()

        waiter = threading.Thread(target=wait_for_recovery, name='isolated-recovery-waiter', daemon=True)
        waiter.start()
        self.assertTrue(started.wait(1))
        process.stdout.emit(status(102, False, 'invalid telemetry CRC'))
        self.assertTrue(saw_wrong_frame.wait(1))
        self.assertFalse(finished.is_set(), 'An old decoded frame cannot acknowledge frame103')
        expected = status(103)
        process.stdout.emit(expected)
        self.assertTrue(finished.wait(1))
        waiter.join(timeout=1)
        self.assertFalse(waiter.is_alive())
        self.assertEqual(errors, [])
        self.assertEqual(result, [expected])

    def test_observation_before_cursor_cannot_acknowledge_new_image(self):
        process, observer = self.observer()
        process.stdout.emit(status(103))
        cursor = observer.mark()
        self.assert_observation_failure(observer, 'before replacement', after=cursor,
                                        predicate=lambda payload: payload['sample']['frame'] == 103, timeout=.03)
        process.stdout.emit(status(104, True, None))
        result = observer.wait_for(lambda payload: payload['sample']['frame'] == 104 and payload['valid'],
                                   after=cursor, description='new frame104', timeout=.2)
        self.assertEqual(result, status(104, True, None))

    def test_latest_invalidation_prevents_historical_valid_ack(self):
        process, observer = self.observer()
        process.stdout.emit(status(104, True, None))
        process.stdout.emit(status(None, False, 'frozen frame'))
        self.assert_observation_failure(observer, 'latest invalid state', predicate=lambda payload: payload['valid'], timeout=.03)
        self.assertEqual(observer.snapshot()['lastStatus'], status(None, False, 'frozen frame'))

    def test_reader_history_is_bounded_but_cursor_and_latest_continue(self):
        process, observer = self.observer(max_events=2)
        for frame in range(101, 107):
            process.stdout.emit(status(frame, True, None))
        snapshot = observer.snapshot()
        self.assertEqual(snapshot['cursor'], 6)
        self.assertEqual([entry['sequence'] for entry in snapshot['events']], [5, 6])
        self.assertEqual([entry['status']['sample']['frame'] for entry in snapshot['events']], [105, 106])
        self.assertEqual(snapshot['lastStatus'], status(106, True, None))
        times = [entry['observedSeconds'] for entry in snapshot['events']]
        self.assertTrue(all(value >= 0 for value in times))
        self.assertEqual(times, sorted(times))

    def test_child_exit_rejects_even_a_matching_cached_status(self):
        process, observer = self.observer()
        process.stdout.emit(status(104, True, None))
        process.returncode = 1
        self.assert_observation_failure(observer, 'child exited', predicate=lambda payload: payload['valid'])

    def test_eof_rejects_the_previous_matching_status(self):
        process, observer = self.observer()
        process.stdout.emit(status(104, True, None))
        process.stdout.end()
        self.assert_observation_failure(observer, 'observe EOF', predicate=lambda _: False)
        self.assertTrue(observer.snapshot()['eof'])
        self.assert_observation_failure(observer, 'EOF cannot acknowledge', predicate=lambda payload: payload['valid'])

    def test_invalid_json_is_reported_instead_of_reusing_cached_valid(self):
        process, observer = self.observer()
        process.stdout.emit(status(104, True, None))
        process.stdout.pending.put('{not JSON}\n')
        self.assert_observation_failure(observer, 'malformed producer JSON', predicate=lambda _: False)
        snapshot = observer.snapshot()
        self.assertTrue(snapshot['readerError'])
        self.assertTrue(snapshot['eof'])
        self.assert_observation_failure(observer, 'parse failure cannot acknowledge', predicate=lambda payload: payload['valid'])

    def test_malformed_status_shape_or_frame_never_enters_history(self):
        for payload in ([], {'valid': False, 'error': None}, status(103) | {'valid': 0},
                        status(103) | {'error': {}}, status(103) | {'sample': []},
                        status(103) | {'sample': {'frame': True}},
                        status(103) | {'sample': {'frame': -1}},
                        status(103) | {'sample': {'frame': 65536}},
                        status(103) | {'sample': {'frame': 103.0}}, status(None, True, None)):
            with self.subTest(payload=payload):
                process, observer = self.observer()
                process.stdout.pending.put(json.dumps(payload) + '\n')
                self.assert_observation_failure(observer, 'invalid producer status', predicate=lambda _: False)
                snapshot = observer.snapshot()
                self.assertEqual(snapshot['events'], [])
                self.assertEqual(snapshot['cursor'], 0)
                self.assertTrue(snapshot['readerError'])

    def test_oversized_line_is_rejected_without_unbounded_trace(self):
        process, observer = self.observer(max_events=1)
        process.stdout.pending.put(json.dumps(status(103) | {'error': 'x' * 17000}) + '\n')
        self.assert_observation_failure(observer, 'oversized observation', predicate=lambda _: False)
        self.assertIn('bounded', observer.snapshot()['readerError'])
        self.assertEqual(observer.snapshot()['events'], [])

    def test_reader_io_error_is_an_explicit_observation_failure(self):
        process, observer = self.observer()
        process.stdout.pending.put(OSError('isolated closed producer pipe'))
        self.assert_observation_failure(observer, 'failed producer stream', predicate=lambda _: False)
        self.assertIn('isolated closed producer pipe', observer.snapshot()['readerError'])

    def test_alive_but_silent_producer_hits_bounded_wait(self):
        process, observer = self.observer()
        self.assert_observation_failure(observer, 'silent producer', timeout=.03)
        self.assertIsNone(process.poll())
        self.assertFalse(observer.snapshot()['eof'])

    def test_observer_requires_stdout_and_positive_integer_trace_bound(self):
        for invalid in (0, -1, True, 1.5):
            with self.subTest(bound=invalid), self.assertRaises(ValueError):
                smoke.BridgeStatusObserver(FakeProcess(), max_events=invalid)
        process = FakeProcess()
        process.stdout = None
        with self.assertRaises(ValueError):
            smoke.BridgeStatusObserver(process)


class DiagnosticReplayContracts(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.fixtures = Path(bridge.__file__).parents[1] / 'tests/fixtures/shader'
        self.args = SimpleNamespace(first=self.fixtures / 'sps-telemetry.png',
                                    next=self.fixtures / 'sps-telemetry-next.png',
                                    corrupt=self.fixtures / 'corrupt-telemetry.png',
                                    recover_first=self.fixtures / 'sps-recovery-first.png',
                                    recover_next=self.fixtures / 'sps-recovery-next.png',
                                    report=self.root / 'report' / 'shader-bridge.json')
        self.current = self.root / 'frame.png'
        shutil.copyfile(self.args.first, self.current)

    def test_actual_fixture_skip103_reproduces_closed_gate_and_acknowledged103_recovers(self):
        from PIL import Image
        def replay(paths):
            source, results = bridge.CaptureSource(timeout=.8), []
            for index, path in enumerate(paths):
                with Image.open(path) as image:
                    with image.convert('RGB') as rgb:
                        results.append(source.decode(list(rgb.get_flattened_data()), *rgb.size, index * .05))
            return results
        prefix = [self.args.first, self.args.next, self.args.corrupt, self.args.next]
        missed = replay(prefix + [self.args.recover_next, self.args.recover_next])
        acknowledged = replay(prefix + [self.args.recover_first, self.args.recover_next])
        self.assertEqual([item['valid'] for item in missed], [False, True, False, False, False, False])
        self.assertEqual([item['valid'] for item in acknowledged], [False, True, False, False, False, True])
        self.assertEqual(missed[-1]['sample']['frame'], 104)
        self.assertEqual(acknowledged[-2]['sample']['frame'], 103)
        self.assertEqual(acknowledged[-2]['error'], 'waiting for a second progressing frame')

    def replay_session(self, *, malformed_recovery=False):
        case = self
        from PIL import Image
        from test_shader_bridge import osc_values

        class Producer(FakeProcess):
            def __init__(self):
                super().__init__()
                self.source = bridge.CaptureSource(timeout=.8)
                self.now, self.consumed, self.values, self.last, self.read104 = 0, [], {}, None, 0

            def capture(self, *, freeze=False):
                self.now += .9 if freeze else .05
                with Image.open(case.current) as image:
                    with image.convert('RGB') as rgb:
                        item = self.source.decode(list(rgb.get_flattened_data()), *rgb.size, self.now)
                self.last = item
                self.consumed.append(item['sample']['frame'] if item['sample'] else None)
                for name, value in osc_values(self.source.bundle(item)).items():
                    self.values[name.removeprefix('/avatar/parameters/')] = value
                if malformed_recovery and item['sample'] and item['sample']['frame'] == 103:
                    self.stdout.pending.put('{malformed observation}\n')
                else:
                    self.stdout.emit(item)

            def terminate(self):
                self.returncode = 0
                self.stdout.end()

            def wait(self, timeout):
                return self.returncode

            def kill(self):
                self.terminate()

        producer = Producer()

        class Session:
            root, osc_port = case.root, 19001
            def start_child(self, command, **options):
                case.assertIn('--status-every-frame', command)
                case.assertEqual(command[command.index('--timeout') + 1], '.8')
                case.assertTrue(options['text'])
                return producer

            def api(self, path):
                if path == '/api/config':
                    return {'outputs': []}
                case.assertEqual(path, '/api/state/overview')
                if producer.last and producer.last['sample'] and producer.last['sample']['frame'] == 104 and producer.last['valid']:
                    producer.read104 += 1
                    if producer.read104 > 1:
                        producer.capture(freeze=True)
                return {'runtime': {'inputActive': False},
                        'osc': {'preview': [{'path': key, 'numericValue': value} for key, value in producer.values.items()]}}

        class CaptureOnObservation(smoke.BridgeStatusObserver):
            def __init__(self, process):
                super().__init__(process)
                process.stdout.wait_for_reads(1)

            def wait_for(self, predicate, **options):
                # A capture is scheduled only when the caller waits for its acknowledgement.
                # Writing103 then104 without this wait would present104 as the next baseline.
                producer.capture()
                return super().wait_for(predicate, **options)

        return Session(), producer, CaptureOnObservation

    def test_replay_consumes_each_replaced_png_before_next_and_freezes_with_live_producer(self):
        session, producer, observer = self.replay_session()
        result = smoke.diagnostic_replay(session, self.args, self.current, observer_factory=observer)
        self.assertEqual(producer.consumed, [101, 102, None, 102, 103, 104, 104])
        self.assertEqual([row['status']['sample']['frame'] if row['status']['sample'] else None
                          for row in result['trace']['acknowledgements']], [101, 102, None, 102, 103, 104])
        self.assertEqual(result['fresh']['Sensa/Diagnostics/Shader/0/Valid'], 1)
        self.assertEqual(result['afterFreeze']['Sensa/Diagnostics/Shader/0/Valid'], 0)
        self.assertEqual(producer.poll(), 0, 'Producer is stopped after watchdog assertions, not to establish invalidation')
        trace = json.loads((self.args.report.parent / 'shader-diagnostic-trace.json').read_text())
        self.assertEqual(trace['phase'], 'freeze watchdog')
        self.assertNotIn('failure', trace)

    def test_failure_retains_step_and_bounded_status_trace_then_closes_producer(self):
        session, producer, observer = self.replay_session(malformed_recovery=True)
        with self.assertRaisesRegex(AssertionError, 'first recovery fixture'):
            smoke.diagnostic_replay(session, self.args, self.current, observer_factory=observer)
        trace = json.loads((self.args.report.parent / 'shader-diagnostic-trace.json').read_text())
        self.assertEqual(trace['phase'], 'first recovery fixture')
        self.assertTrue(trace['failure'])
        self.assertTrue(trace['producerObservations']['readerError'])
        self.assertLessEqual(len(trace['producerObservations']['events']), 128)
        self.assertEqual(producer.poll(), 0)

    def test_every_frame_option_changes_only_logging_and_preserves_default_suppression(self):
        emitted = []
        for extra, line_count in (([], 1), (['--status-every-frame'], 2)):
            udp = mock.MagicMock()
            udp.__enter__.return_value = udp
            output = io.StringIO()
            with mock.patch.object(sys, 'argv', ['bridge', '--image', str(self.args.first), '--watch',
                                               '--port', '19001', '--timeout', '.8', '--duration', '.01', *extra]), \
                    mock.patch.object(bridge.socket, 'socket', return_value=udp), \
                    mock.patch.object(bridge.time, 'monotonic', side_effect=[0, 0, 0, 0, .005, .005, .02]), \
                    mock.patch.object(bridge.time, 'sleep'), contextlib.redirect_stdout(output):
                bridge.main()
            self.assertEqual(len(output.getvalue().splitlines()), line_count)
            emitted.append([call.args[0] for call in udp.sendto.call_args_list])
        self.assertEqual(emitted[0], emitted[1])
        self.assertEqual(len(emitted[0]), 3)


if __name__ == '__main__':
    unittest.main()
