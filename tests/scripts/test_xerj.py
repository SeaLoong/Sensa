"""XERJ lifecycle contracts using mock processes and temporary state only."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location('sensa_xerj', ROOT / 'scripts/xerj.py')
xerj = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(xerj)


def process(exit_code=None):
    child = Mock()
    child.returncode = exit_code
    child.poll.return_value = exit_code
    return child


class XerjTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.state = Path(self.temporary.name)
        self.patcher = patch.object(xerj, 'STATE', self.state)
        self.patcher.start()
        self.addCleanup(self.patcher.stop)

    def marker(self, **overrides):
        value = {'root': str(xerj.ROOT), 'url': xerj.URL, **overrides}
        (self.state / 'ready.json').write_text(json.dumps(value), encoding='utf-8')

    def test_requires_explicit_absolute_installed_binary(self):
        for value in ('', 'xerj', str(self.state / 'missing')):
            with self.subTest(value=value), patch.dict(os.environ, {'XERJ_BIN': value}), \
                    self.assertRaisesRegex(RuntimeError, 'absolute path'):
                xerj.executable()
        binary = self.state / 'xerj.exe'
        binary.touch()
        with patch.dict(os.environ, {'XERJ_BIN': str(binary)}):
            self.assertEqual(xerj.executable(), str(binary))

    def test_shared_service_lock_excludes_another_owner(self):
        guard = xerj.acquire_lock()
        self.assertIsNotNone(guard)
        try:
            self.assertIsNone(xerj.acquire_lock())
        finally:
            guard.close()
        next_guard = xerj.acquire_lock()
        self.assertIsNotNone(next_guard)
        next_guard.close()

    def test_stale_readiness_is_removed_without_contacting_its_node(self):
        self.marker()
        with patch.object(xerj, 'healthy') as health:
            self.assertFalse(xerj.ready())
        self.assertFalse((self.state / 'ready.json').exists())
        health.assert_not_called()

    def test_readiness_requires_live_owner_correct_repository_and_node_health(self):
        with patch.object(xerj, 'acquire_lock', return_value=None), \
                patch.object(xerj, 'healthy', return_value=True) as health:
            self.assertFalse(xerj.ready())
            self.marker(root='another-repository')
            self.assertFalse(xerj.ready())
            health.assert_not_called()
            self.marker()
            self.assertTrue(xerj.ready())
            health.return_value = False
            self.assertFalse(xerj.ready())

    def test_occupied_port_never_launches_or_adopts_a_node(self):
        guard = Mock()
        self.marker()
        with patch.object(xerj, 'executable', return_value='xerj'), \
                patch.object(xerj, 'acquire_lock', return_value=guard), \
                patch.object(xerj.socket, 'socket') as socket_factory, \
                patch.object(xerj.subprocess, 'Popen') as launch, \
                self.assertRaisesRegex(RuntimeError, 'occupied'):
            socket_factory.return_value.__enter__.return_value.bind.side_effect = OSError('busy')
            xerj.serve()
        launch.assert_not_called()
        guard.close.assert_called_once()
        self.assertFalse((self.state / 'ready.json').exists())

    def test_initial_index_failure_cleans_owned_children_and_never_publishes_ready(self):
        node, initial = process(), process(2)
        with patch.object(xerj, 'executable', return_value='xerj'), \
                patch.object(xerj.socket, 'socket'), \
                patch.object(xerj, 'healthy', return_value=True), \
                patch.object(xerj.subprocess, 'Popen', side_effect=[node, initial]), \
                self.assertRaisesRegex(RuntimeError, 'Initial XERJ indexing failed'):
            xerj.serve()
        node.terminate.assert_called_once()
        initial.terminate.assert_not_called()
        self.assertFalse((self.state / 'ready.json').exists())
        guard = xerj.acquire_lock()
        self.assertIsNotNone(guard)
        guard.close()

    def test_initial_index_precedes_readiness_and_stop_cleans_both_owned_children(self):
        for index_exit in (0, 3):
            with self.subTest(index_exit=index_exit):
                node, initial, watcher = process(), process(index_exit), process()
                saw_ready = []

                def launch_child(command, **_kwargs):
                    self.assertFalse((self.state / 'ready.json').exists())
                    if '--watch' in command:
                        with (self.state / 'autoindex.log').open('ab') as log:
                            log.write(b'watch: 12 directories watched, waiting for changes\n')
                        return watcher
                    return initial if 'autoindex' in command else node

                def stop_when_ready(_seconds):
                    saw_ready.append((self.state / 'ready.json').is_file())
                    (self.state / 'stop').touch()

                with patch.object(xerj, 'executable', return_value='xerj'), \
                        patch.object(xerj.socket, 'socket'), \
                        patch.object(xerj, 'healthy', return_value=True), \
                        patch.object(xerj.subprocess, 'Popen', side_effect=launch_child) as launch, \
                        patch.object(xerj.time, 'sleep', side_effect=stop_when_ready), \
                        patch('sys.stderr'):
                    self.assertEqual(xerj.serve(), 0)
                self.assertEqual(saw_ready, [True])
                self.assertEqual(len(launch.call_args_list), 3)
                node_command, index_command, watch_command = [
                    call.args[0] for call in launch.call_args_list]
                self.assertIn('--no-auto-port', node_command)
                self.assertEqual(node_command[node_command.index('--bind') + 1], '127.0.0.1')
                self.assertEqual(node_command[node_command.index('--embed-mode') + 1], 'lexical')
                self.assertNotIn('--watch', index_command)
                self.assertIn('--watch', watch_command)
                self.assertIn(str(self.state / 'autoindex'), index_command)
                self.assertEqual(index_command[index_command.index('--prefix') + 1], 'sensa')
                self.assertEqual((self.state / 'xerj.toml').read_text(), '[rerank]\nenabled = false\n')
                node.terminate.assert_called_once()
                watcher.terminate.assert_called_once()
                initial.terminate.assert_not_called()
                self.assertFalse((self.state / 'ready.json').exists())

    def test_concurrent_supervisor_does_not_launch_children(self):
        with patch.object(xerj, 'executable', return_value='xerj'), \
                patch.object(xerj, 'acquire_lock', return_value=None), \
                patch.object(xerj.subprocess, 'Popen') as launch:
            self.assertEqual(xerj.serve(), 0)
        launch.assert_not_called()

    def test_wait_rejects_failed_owned_node_before_successful_health(self):
        with self.assertRaisesRegex(RuntimeError, 'child exited'):
            xerj.wait_until(lambda: True, [process(1)], 100)

    def test_wait_times_out_and_obeys_stop_without_launching_anything(self):
        with patch.object(xerj.time, 'monotonic', return_value=2), \
                self.assertRaisesRegex(RuntimeError, 'timed out'):
            xerj.wait_until(lambda: False, [], 1)
        (self.state / 'stop').touch()
        with self.assertRaisesRegex(RuntimeError, 'stop requested'):
            xerj.wait_until(lambda: True, [], 100)

    def test_stubborn_child_is_killed_after_graceful_shutdown_timeout(self):
        child = process()
        child.wait.side_effect = [subprocess.TimeoutExpired('xerj', 10), 0]
        xerj.stop_child(child)
        child.terminate.assert_called_once()
        child.kill.assert_called_once()
        self.assertEqual(child.wait.call_count, 2)

    def test_mcp_reuses_ready_service_and_inherits_protocol_stdio(self):
        with patch.object(xerj, 'executable', return_value='xerj'), \
                patch.object(xerj, 'ready', return_value=True), \
                patch.object(xerj.subprocess, 'Popen') as launch, \
                patch.object(xerj.subprocess, 'run', return_value=Mock(returncode=7)) as run, \
                patch.object(sys, 'argv', ['xerj.py', 'mcp']):
            self.assertEqual(xerj.main(), 7)
        launch.assert_not_called()
        self.assertEqual(run.call_args.args[0], ['xerj', 'mcp'])
        for stream in ('stdin', 'stdout', 'stderr'):
            self.assertIs(run.call_args.kwargs[stream], getattr(sys, stream))
        self.assertEqual(run.call_args.kwargs['env']['XERJ_URL'], xerj.URL)

    def test_startup_redirects_detached_supervisor_output_to_logs(self):
        with patch.object(xerj, 'executable', return_value='xerj'), \
                patch.object(xerj, 'ready', side_effect=[False, False, True]), \
                patch.object(xerj.subprocess, 'Popen', return_value=process()) as launch, \
                patch.object(xerj.time, 'sleep'):
            xerj.ensure_service()
        self.assertEqual(launch.call_args.args[0][-1], 'serve')
        self.assertEqual(launch.call_args.kwargs['stdin'], subprocess.DEVNULL)
        self.assertEqual(launch.call_args.kwargs['stdout'].name, str(self.state / 'launcher.log'))
        self.assertIs(launch.call_args.kwargs['stdout'], launch.call_args.kwargs['stderr'])

    def test_watcher_readiness_cannot_reuse_an_old_launch_or_initial_index_log(self):
        log = self.state / 'autoindex.log'
        log.write_bytes(b'watch: 4 directories watched\n')
        offset = log.stat().st_size
        with log.open('ab') as output:
            output.write(b'phase B: indexing\n')
        self.assertFalse(xerj.watcher_ready(offset))
        with log.open('ab') as output:
            output.write(b'watch: 12 directories watched, waiting for changes\n')
        self.assertTrue(xerj.watcher_ready(offset))

    def test_health_request_explicitly_bypasses_host_proxies(self):
        with patch.object(xerj, 'ProxyHandler') as proxy, \
                patch.object(xerj, 'build_opener') as opener:
            opener.return_value.open.return_value.__enter__.return_value.status = 200
            self.assertTrue(xerj.healthy())
        proxy.assert_called_once_with({})
        opener.return_value.open.assert_called_once_with(xerj.URL + '/_cluster/health', timeout=1)

    def test_inherited_auth_remote_configuration_and_proxies_cannot_change_local_service(self):
        with patch.dict(os.environ, {'XERJ_CONFIG': 'remote.toml', 'XERJ_AUTH': 'secret',
                                     'XERJ_API_KEY': 'secret', 'TYPESAFE_API_KEY': 'secret',
                                     'HTTP_PROXY': 'http://remote', 'https_proxy': 'http://remote',
                                     'ALL_PROXY': 'socks5://remote', 'NO_PROXY': 'other-host'}):
            environment = xerj.child_environment()
        for key in ('XERJ_CONFIG', 'XERJ_AUTH', 'XERJ_API_KEY', 'TYPESAFE_API_KEY',
                    'HTTP_PROXY', 'https_proxy', 'ALL_PROXY'):
            self.assertNotIn(key, environment)
        self.assertEqual(environment['XERJ_DISABLE_FEEDBACK'], 'true')
        self.assertEqual(environment['NO_PROXY'], '127.0.0.1,localhost,::1')
        self.assertEqual(environment['no_proxy'], environment['NO_PROXY'])


if __name__ == '__main__':
    unittest.main()
