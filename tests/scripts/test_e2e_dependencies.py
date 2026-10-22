"""Bounded E2E dependency setup with a fake APT process; no package installation.
E2E 依赖安装的隔离验证；使用模拟 APT，不安装系统软件包。
"""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[2]
HELPER = ROOT / 'scripts/install-e2e-dependencies.sh'


@unittest.skipUnless(os.name == 'posix' and shutil.which('bash') and shutil.which('timeout'),
                     'Dependency installer needs Bash and GNU timeout')
class E2EDependencyInstallerTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix='sensa-e2e-dependencies-')
        self.addCleanup(temporary.cleanup)
        self.directory = Path(temporary.name)
        self.source = self.directory / 'Ubuntu sources with spaces.sources'
        self.source.write_text('Types: deb\nURIs: http://archive.ubuntu.com/ubuntu\n'
                               'Suites: noble\nComponents: main universe\n', encoding='utf-8')
        self.calls_path = self.directory / 'apt-calls.jsonl'
        self.bin = self.directory / 'bin'
        self.bin.mkdir()
        fake = self.bin / 'apt-get'
        fake.write_text('#!' + sys.executable + '\n' + '''import json
import os
from pathlib import Path
import sys

path = Path(os.environ['SENSA_TEST_APT_CALLS'])
previous = path.read_text(encoding='utf-8').splitlines() if path.exists() else []
statuses = json.loads(os.environ['SENSA_TEST_APT_STATUSES'])
status = statuses[len(previous)] if len(previous) < len(statuses) else 0
with path.open('a', encoding='utf-8') as stream:
    stream.write(json.dumps({'arguments': sys.argv[1:],
                             'frontend': os.environ.get('DEBIAN_FRONTEND'),
                             'status': status}) + '\\n')
raise SystemExit(status)
''', encoding='utf-8')
        fake.chmod(0o755)

    def run_installer(self, statuses=()):
        environment = dict(os.environ)
        environment.update({
            'PATH': str(self.bin) + os.pathsep + environment.get('PATH', ''),
            'SENSA_E2E_UBUNTU_SOURCE_FILE': str(self.source),
            'SENSA_TEST_APT_CALLS': str(self.calls_path),
            'SENSA_TEST_APT_STATUSES': json.dumps(statuses),
            'DEBIAN_FRONTEND': 'dialog',
        })
        result = subprocess.run(['bash', str(HELPER)], cwd=self.directory,
                                env=environment, capture_output=True, text=True,
                                timeout=10, check=False)
        calls = [json.loads(line) for line in self.calls_path.read_text(encoding='utf-8').splitlines()] \
            if self.calls_path.exists() else []
        return result, calls

    def commands(self, calls):
        return [next(argument for argument in call['arguments']
                     if argument in ('update', 'install')) for call in calls]

    def assert_ubuntu_only(self, calls):
        expected_options = {
            'Dir::Etc::sourcelist=' + str(self.source),
            'Dir::Etc::sourceparts=-',
            'Acquire::Retries=1',
            'Acquire::http::Timeout=15',
            'Acquire::https::Timeout=15',
            'APT::Update::Error-Mode=any',
        }
        for call in calls:
            with self.subTest(call=call):
                arguments = call['arguments']
                options = {arguments[index + 1] for index, argument in enumerate(arguments)
                           if argument == '-o'}
                self.assertTrue(expected_options <= options)
                self.assertEqual(call['frontend'], 'noninteractive')
                if 'install' in arguments:
                    self.assertIn('-y', arguments)
                    self.assertIn('--no-install-recommends', arguments)
                    self.assertIn('fonts-noto-cjk', arguments)
                    self.assertIn('python3', arguments)

    def test_success_limits_update_and_install_to_the_selected_ubuntu_source(self):
        result, calls = self.run_installer()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.commands(calls), ['update', 'install'])
        self.assert_ubuntu_only(calls)

    def test_failed_update_restarts_the_whole_attempt_before_installing(self):
        result, calls = self.run_installer([100, 0, 0])
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.commands(calls), ['update', 'update', 'install'])
        self.assert_ubuntu_only(calls)

    def test_failed_install_retries_with_a_fresh_update(self):
        result, calls = self.run_installer([0, 100, 0, 0])
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.commands(calls), ['update', 'install', 'update', 'install'])
        self.assert_ubuntu_only(calls)

    def test_persistent_update_failure_stops_after_two_attempts(self):
        result, calls = self.run_installer([100, 100])
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.commands(calls), ['update', 'update'])
        self.assert_ubuntu_only(calls)

    def test_persistent_install_failure_is_not_reported_as_success(self):
        result, calls = self.run_installer([0, 100, 0, 100])
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.commands(calls), ['update', 'install', 'update', 'install'])
        self.assert_ubuntu_only(calls)

    def test_missing_ubuntu_source_fails_before_invoking_apt(self):
        self.source.unlink()
        result, calls = self.run_installer()
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(calls, [])


if __name__ == '__main__':
    unittest.main()
