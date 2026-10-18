"""Smoke lifecycle contracts with mock processes/network and a manual clock.
使用模拟进程、模拟网络和手动时钟的冒烟生命周期契约。
"""
from contextlib import redirect_stderr, redirect_stdout
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import unittest
from unittest.mock import Mock, patch

from lab_contract_fixtures import LabFixture, load_script

support = load_script('process_smoke')
http_smoke = load_script('smoke')
shader_smoke = load_script('smoke-shader-bridge')


class Clock:
    now = 0

    def sleep(self, seconds):
        self.now += seconds


class Process:
    def __init__(self, name, calls, hung=False):
        self.name, self.calls, self.hung = name, calls, hung
        self.returncode, self.killed = None, False
        self.stdout = self.stderr = None

    def poll(self):
        return self.returncode

    def terminate(self):
        self.calls.append(('terminate', self.name))

    def wait(self, timeout):
        self.calls.append(('wait', self.name, timeout))
        if self.hung and not self.killed:
            raise subprocess.TimeoutExpired(self.name, timeout)
        self.returncode = 0

    def kill(self):
        self.calls.append(('kill', self.name))
        self.killed = True


class Response(io.BytesIO):
    def __init__(self, value, headers=None):
        super().__init__(json.dumps(value).encode())
        self.headers = headers or {}


class Environment:
    def __init__(self, *, startup_errors=0, unsafe_outputs=False):
        self.clock, self.calls, self.requests, self.processes = Clock(), [], [], []
        self.startup_errors, self.unsafe_outputs = startup_errors, unsafe_outputs
        self.launches = []
        self.ports = iter((13001, 13002))

    def popen(self, command, **options):
        self.launches.append((command, options))
        process = Process(command[0], self.calls)
        self.processes.append(process)
        if hasattr(options.get('stdout'), 'write'):
            options['stdout'].write('isolated service log')
        return process

    def urlopen(self, request, **options):
        self.requests.append((request, options))
        url = request if isinstance(request, str) else request.full_url
        if url.endswith('/api/session'):
            if self.startup_errors:
                self.startup_errors -= 1
                raise ConnectionError('not ready')
            return Response({}, {'Set-Cookie': 'sensa=test; HttpOnly; SameSite=Strict'})
        if url.endswith('/api/config'):
            return Response({'outputs': ['unsafe'] if self.unsafe_outputs else []})
        return Response({'inputActive': False})

    def adapters(self):
        return support.SmokeAdapters(
            self.popen, self.urlopen, lambda kind: next(self.ports),
            lambda: self.clock.now, self.clock.sleep)


class SmokeLifecycleContracts(LabFixture):
    def setUp(self):
        super().setUp()
        policy = patch.dict(os.environ, {'GITHUB_ACTIONS': 'true'})
        policy.start()
        self.addCleanup(policy.stop)

    def test_isolated_configuration_authentication_children_and_reports_share_one_lifecycle(self):
        environment = Environment(startup_errors=2)
        reports = self.root / 'reports'
        with support.SmokeSession(['fake-sensa'], osc_enabled=True, report_dir=reports, adapters=environment.adapters()) as session:
            temporary = session.root
            command, launch = environment.launches[0]
            self.assertEqual(command, ['fake-sensa'])
            self.assertNotEqual(Path(launch['cwd']), Path.cwd())
            configuration = json.loads(Path(launch['env']['SENSA_CONFIG_PATH']).read_text(encoding='utf-8'))
            self.assertEqual(configuration['outputs'], [])
            self.assertEqual(configuration['webUi']['host'], '127.0.0.1')
            self.assertFalse(configuration['webUi']['autoOpenBrowser'])
            self.assertTrue(configuration['osc']['enabled'])
            self.assertFalse(configuration['osc']['oscQueryEnabled'])
            self.assertFalse(configuration['osc']['oscQueryReceiver']['enabled'])
            self.assertEqual(configuration['osc']['receiverPort'], session.osc_port)
            self.assertEqual(session.cookie, 'sensa=test')
            self.assertGreaterEqual(environment.clock.now, .2)
            session.api('/api/input/active', {'active': False})
            request = environment.requests[-1][0]
            self.assertEqual(request.method, 'PUT')
            self.assertEqual(request.get_header('Cookie'), 'sensa=test')
            self.assertEqual(request.get_header('Origin'), session.base)
            self.assertEqual(json.loads(request.data), {'active': False})
            with session.request('/api/config', authenticated=False):
                pass
            self.assertIsNone(environment.requests[-1][0].get_header('Cookie'))
            session.start_child(['fake-bridge'])
            session.complete()
        self.assertFalse(temporary.exists())
        self.assertEqual([call for call in environment.calls if call[0] == 'terminate'],
                         [('terminate', 'fake-bridge'), ('terminate', 'fake-sensa')])
        result = json.loads((reports / 'result.json').read_text(encoding='utf-8'))
        self.assertTrue(result['passed'])
        self.assertEqual(result['outputs'], [])
        self.assertEqual((reports / 'service.log').read_text(encoding='utf-8'), 'isolated service log')

    def test_failed_assertion_stops_all_children_and_persists_failure(self):
        environment = Environment()
        reports = self.root / 'reports'
        with redirect_stdout(io.StringIO()), self.assertRaisesRegex(AssertionError, 'scenario failure'):
            with support.SmokeSession(['fake-sensa'], report_dir=reports, adapters=environment.adapters()) as session:
                temporary = session.root
                session.start_child(['fake-bridge'])
                session.complete()
                raise AssertionError('scenario failure')
        self.assertFalse(temporary.exists())
        self.assertFalse(json.loads((reports / 'result.json').read_text(encoding='utf-8'))['passed'])
        self.assertEqual(len([call for call in environment.calls if call[0] == 'terminate']), 2)

    def test_hung_children_are_killed_before_the_parent_is_stopped(self):
        environment = Environment()
        with support.SmokeSession(['fake-sensa'], adapters=environment.adapters()) as session:
            bridge = session.start_child(['fake-bridge'])
            bridge.hung = True
        self.assertEqual(environment.calls[:4], [
            ('terminate', 'fake-bridge'), ('wait', 'fake-bridge', 5),
            ('kill', 'fake-bridge'), ('wait', 'fake-bridge', 5)])
        self.assertIn(('terminate', 'fake-sensa'), environment.calls)

    def test_startup_timeout_uses_the_injected_clock_and_cleans_the_process(self):
        environment = Environment(startup_errors=100)
        session = support.SmokeSession(['fake-sensa'], startup_timeout=.2, adapters=environment.adapters())
        with self.assertRaisesRegex(TimeoutError, 'startup failed or timed out'):
            with session:
                self.fail('Startup must fail')
        self.assertFalse(session.root.exists())
        self.assertEqual(len(environment.launches), 1)
        self.assertIn(('terminate', 'fake-sensa'), environment.calls)

    def test_early_process_exit_does_not_wait_for_the_timeout(self):
        environment = Environment(startup_errors=100)
        original = environment.popen
        def exited(*args, **kwargs):
            process = original(*args, **kwargs)
            process.returncode = 1
            return process
        adapters = environment.adapters()
        adapters = support.SmokeAdapters(exited, adapters.urlopen, adapters.reserve_port, adapters.clock, adapters.sleep)
        with self.assertRaises(TimeoutError):
            with support.SmokeSession(['fake-sensa'], adapters=adapters):
                pass
        self.assertEqual(environment.clock.now, 0)

    def test_config_updates_cannot_add_outputs_or_restore_legacy_device_defaults(self):
        environment = Environment()
        with support.SmokeSession(['fake-sensa'], adapters=environment.adapters()) as session:
            before = len(environment.requests)
            for configuration in ({'outputs': ['unsafe']}, {}, []):
                with self.subTest(configuration=configuration), self.assertRaisesRegex(AssertionError, 'outputs='):
                    session.api('/api/config', configuration)
            self.assertEqual(len(environment.requests), before)

    def test_unexpected_outputs_are_rejected_before_the_scenario_can_run(self):
        environment = Environment(unsafe_outputs=True)
        with self.assertRaisesRegex(AssertionError, 'no outputs'):
            with support.SmokeSession(['fake-sensa'], adapters=environment.adapters()):
                self.fail('Unsafe output configuration')
        self.assertIn(('terminate', 'fake-sensa'), environment.calls)


class WaitForObservedStateContracts(unittest.TestCase):
    def test_delayed_state_does_not_resend_input_or_sleep_in_real_time(self):
        clock = Clock()
        fetch = Mock(side_effect=[{'blocked': True}, {'blocked': True}, {'blocked': False}])
        result = support.wait_for_state(fetch, lambda state: not state['blocked'], 'expected input',
                                        clock=lambda: clock.now, sleep=clock.sleep)
        self.assertEqual(result, {'blocked': False})
        self.assertEqual(fetch.call_count, 3)
        self.assertAlmostEqual(clock.now, .1)

    def test_failure_includes_the_last_observed_state(self):
        with self.assertRaisesRegex(AssertionError, 'expected input.*blocked.*true'):
            support.wait_for_state(lambda: {'blocked': True}, lambda state: not state['blocked'], 'expected input', timeout=0)

    def test_transport_errors_are_not_hidden_as_state_delays(self):
        fetch = Mock(side_effect=ConnectionError('disconnected'))
        with self.assertRaises(ConnectionError):
            support.wait_for_state(fetch, lambda state: True, 'expected input')
        fetch.assert_called_once()


class SmokeCiPolicyContracts(unittest.TestCase):
    def test_session_and_both_cli_adapters_reject_local_execution_before_launch(self):
        environment = Environment()
        with patch.dict(os.environ, {'GITHUB_ACTIONS': 'false'}), self.assertRaisesRegex(RuntimeError, 'GitHub Actions'):
            with support.SmokeSession(['fake-sensa'], adapters=environment.adapters()):
                pass
        self.assertEqual(environment.launches, [])
        for module, arguments in (
                (http_smoke, ['--exe', 'unused']),
                (shader_smoke, ['--exe', 'unused', '--first', 'first.png', '--next', 'next.png', '--report', 'report.json'])):
            with self.subTest(module=module.__name__), patch.dict(os.environ, {'GITHUB_ACTIONS': 'false'}), \
                    patch.object(sys, 'argv', [module.__file__, *arguments]), patch.object(module, 'SmokeSession') as session, \
                    redirect_stderr(io.StringIO()), self.assertRaises(SystemExit) as error:
                module.main()
            self.assertEqual(error.exception.code, 2)
            session.assert_not_called()

    def test_help_stays_available_locally_without_creating_a_session(self):
        for module in (http_smoke, shader_smoke):
            with self.subTest(module=module.__name__), patch.dict(os.environ, {'GITHUB_ACTIONS': 'false'}), \
                    patch.object(sys, 'argv', [module.__file__, '--help']), patch.object(module, 'SmokeSession') as session, \
                    redirect_stdout(io.StringIO()), self.assertRaises(SystemExit) as error:
                module.main()
            self.assertEqual(error.exception.code, 0)
            session.assert_not_called()
