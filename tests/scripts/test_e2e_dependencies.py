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
pending = Path(os.environ['SENSA_TEST_DPKG_PENDING'])
if os.environ.get('SENSA_TEST_INTERRUPT_DPKG') == '1' and 'install' in sys.argv:
    if pending.exists():
        status = 100
    elif status:
        pending.touch()
with path.open('a', encoding='utf-8') as stream:
    source = next(value.split('=', 1)[1] for value in sys.argv if value.startswith('Dir::Etc::sourcelist='))
    stream.write(json.dumps({'arguments': sys.argv[1:],
                             'sourceContents': Path(source).read_text(encoding='utf-8'),
                             'frontend': os.environ.get('DEBIAN_FRONTEND'),
                             'status': status}) + '\\n')
raise SystemExit(status)
''', encoding='utf-8')
        fake.chmod(0o755)
        apt_cache = self.bin / 'apt-cache'
        apt_cache.write_text('#!' + sys.executable + '\n' + '''import json
import os
from pathlib import Path

path = Path(os.environ['SENSA_TEST_APT_CACHE_CALLS'])
calls = int(path.read_text()) if path.exists() else 0
records = json.loads(os.environ['SENSA_TEST_FONT_RECORDS'])
record = records[min(calls, len(records) - 1)]
path.write_text(str(calls + 1))
print('Package: fonts-noto-cjk')
print('Version: ' + record['version'])
print('SHA256: ' + record['sha256'])
''', encoding='utf-8')
        apt_cache.chmod(0o755)
        bounded = self.bin / 'timeout'
        bounded.write_text('#!' + sys.executable + '\n' + '''import json
import os
from pathlib import Path
import sys

with Path(os.environ['SENSA_TEST_TIMEOUT_CALLS']).open('a') as stream:
    stream.write(json.dumps(sys.argv[1:]) + '\\n')
os.execv(''' + repr(shutil.which('timeout')) + ''', ['timeout', *sys.argv[1:]])
''', encoding='utf-8')
        bounded.chmod(0o755)
        dpkg = self.bin / 'dpkg'
        dpkg.write_text('#!' + sys.executable + '\n' + '''import os
from pathlib import Path
import sys

assert sys.argv[1:] == ['--configure', '--pending']
Path(os.environ['SENSA_TEST_DPKG_CALLS']).write_text('configure pending', encoding='utf-8')
status = int(os.environ['SENSA_TEST_DPKG_STATUS'])
if status == 0:
    Path(os.environ['SENSA_TEST_DPKG_PENDING']).unlink(missing_ok=True)
raise SystemExit(status)
''', encoding='utf-8')
        dpkg.chmod(0o755)

    def run_installer(self, statuses=(), *, interrupted=False, recovery_status=0, font_records=None,
                      arguments=(), state=None, without_python=False):
        environment = dict(os.environ)
        environment.update({
            'PATH': str(self.bin) + os.pathsep + environment.get('PATH', ''),
            'SENSA_E2E_UBUNTU_SOURCE_FILE': str(self.source),
            'SENSA_TEST_APT_CALLS': str(self.calls_path),
            'SENSA_TEST_APT_STATUSES': json.dumps(statuses),
            'SENSA_TEST_APT_CACHE_CALLS': str(self.directory / 'apt-cache-calls'),
            'SENSA_TEST_TIMEOUT_CALLS': str(self.directory / 'timeout-calls'),
            'SENSA_TEST_FONT_RECORDS': json.dumps(font_records or [{'version': '1:20230817+repack1-3', 'sha256': 'a' * 64}]),
            'SENSA_TEST_INTERRUPT_DPKG': str(int(interrupted)),
            'SENSA_TEST_DPKG_PENDING': str(self.directory / 'dpkg-pending'),
            'SENSA_TEST_DPKG_CALLS': str(self.directory / 'dpkg-calls'),
            'SENSA_TEST_DPKG_STATUS': str(recovery_status),
            'DEBIAN_FRONTEND': 'dialog',
        })
        environment.pop('SENSA_E2E_APT_STATE', None)
        if state is not None:
            environment['SENSA_E2E_APT_STATE'] = str(state)
        if without_python:
            (self.bin / 'bash').symlink_to(shutil.which('bash'))
            environment['PATH'] = str(self.bin)
        result = subprocess.run(['bash', str(HELPER), *arguments], cwd=self.directory,
                                env=environment, capture_output=True, text=True,
                                timeout=10, check=False)
        calls = [json.loads(line) for line in self.calls_path.read_text(encoding='utf-8').splitlines()] \
            if self.calls_path.exists() else []
        return result, calls

    def commands(self, calls):
        return [next(argument for argument in call['arguments']
                     if argument in ('update', 'install')) for call in calls]

    def assert_ubuntu_only(self, calls, *, mirror=False):
        expected_options = {
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
                selected = next(option.split('=', 1)[1] for option in options if option.startswith('Dir::Etc::sourcelist='))
                if mirror:
                    self.assertEqual(Path(selected).name, 'ubuntu-fallback.sources')
                    self.assertFalse(Path(selected).exists(), 'The temporary source should be cleaned up')
                else:
                    self.assertEqual(selected, str(self.source))
                self.assertEqual(call['frontend'], 'noninteractive')
                if 'install' in arguments:
                    self.assertIn('-y', arguments)
                    self.assertIn('--no-install-recommends', arguments)
                    self.assertIn('fonts-noto-cjk=1:20230817+repack1-3', arguments)
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

    def test_retry_completes_interrupted_dpkg_configuration_before_install(self):
        result, calls = self.run_installer([0, 100, 0, 0], interrupted=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.commands(calls), ['update', 'install', 'update', 'install'])
        self.assertTrue((self.directory / 'dpkg-calls').exists())
        self.assertFalse((self.directory / 'dpkg-pending').exists())
        self.assert_ubuntu_only(calls)

    def test_failed_dpkg_recovery_does_not_continue_or_report_success(self):
        result, calls = self.run_installer([0, 100], interrupted=True, recovery_status=2)
        self.assertEqual(result.returncode, 2, result.stderr)
        self.assertEqual(self.commands(calls), ['update', 'install'])
        self.assertTrue((self.directory / 'dpkg-pending').exists())

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

    def test_control_characters_in_source_path_are_rejected_before_apt(self):
        self.source = self.directory / 'Ubuntu\nsources.sources'
        self.source.write_text('Types: deb\n', encoding='utf-8')
        result, calls = self.run_installer()
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(calls, [])

    def test_second_attempt_uses_only_the_official_mirror_and_preserves_package_and_source_identity(self):
        original = ('# Azure reference stays in comments: http://azure.archive.ubuntu.com/ubuntu\n'
                    'Types: deb\nURIs: http://azure.archive.ubuntu.com/ubuntu/\n'
                    ' https://azure.archive.ubuntu.com/ubuntu\n'
                    'Suites: noble noble-updates noble-backports\n'
                    'Components: main restricted universe multiverse\n'
                    'Signed-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg\n\n'
                    'Types: deb\nURIs: http://security.ubuntu.com/ubuntu/\n'
                    'Suites: noble-security\nComponents: main universe\n'
                    'Signed-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg\n')
        self.source.write_text(original, encoding='utf-8')
        result, calls = self.run_installer([0, 100, 0, 0])
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.commands(calls), ['update', 'install', 'update', 'install'])
        self.assert_ubuntu_only(calls[:2])
        self.assert_ubuntu_only(calls[2:], mirror=True)
        expected = original.replace('URIs: http://azure.archive.ubuntu.com/ubuntu/', 'URIs: https://archive.ubuntu.com/ubuntu/') \
            .replace('\n https://azure.archive.ubuntu.com/ubuntu\n', '\n https://archive.ubuntu.com/ubuntu\n')
        self.assertEqual([call['sourceContents'] for call in calls], [original, original, expected, expected])
        self.assertEqual(self.source.read_text(encoding='utf-8'), original)
        self.assertIn('retrying the same Ubuntu packages through archive.ubuntu.com', result.stdout)
        budgets = [json.loads(line)[:2] for line in (self.directory / 'timeout-calls').read_text().splitlines()]
        self.assertEqual(budgets, [['--kill-after=5s', '130s'], ['--kill-after=5s', '130s']])

    def test_mirror_rejects_a_changed_font_version_before_the_second_install(self):
        records = [{'version': '1:20230817+repack1-3', 'sha256': 'a' * 64},
                   {'version': '1:20230817+repack1-4', 'sha256': 'b' * 64}]
        result, calls = self.run_installer([0, 100, 0], font_records=records)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.commands(calls), ['update', 'install', 'update'])
        self.assertIn('different font package version or SHA256', result.stderr)

    def test_mirror_rejects_changed_font_bytes_even_when_the_version_matches(self):
        records = [{'version': '1:20230817+repack1-3', 'sha256': 'a' * 64},
                   {'version': '1:20230817+repack1-3', 'sha256': 'b' * 64}]
        result, calls = self.run_installer([0, 100, 0], font_records=records)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.commands(calls), ['update', 'install', 'update'])
        self.assertIn('different font package version or SHA256', result.stderr)

    def test_similar_hosts_and_unrelated_repository_paths_are_left_unchanged(self):
        original = ('Types: deb\nURIs: https://azure.archive.ubuntu.com.example/ubuntu '
                    'https://azure.archive.ubuntu.com/ubuntu-extra\nSuites: noble\nComponents: main\n')
        self.source.write_text(original, encoding='utf-8')
        result, calls = self.run_installer([0, 100, 0, 0])
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assert_ubuntu_only(calls)
        self.assertTrue(all(call['sourceContents'] == original for call in calls))
        self.assertEqual(self.source.read_text(encoding='utf-8'), original)

    def test_font_without_a_signed_index_checksum_is_never_installed(self):
        result, calls = self.run_installer(font_records=[{'version': '1:20230817+repack1-3', 'sha256': ''}])
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.commands(calls), ['update', 'update'])
        self.assertIn('font package metadata is incomplete', result.stderr)

    def test_internal_attempt_requires_the_parent_owned_state_directory(self):
        for state in (None, 'relative-state', self.directory / 'missing-state', self.source):
            with self.subTest(state=state):
                result, calls = self.run_installer(arguments=['--attempt'], state=state)
                self.assertEqual(result.returncode, 2, result.stderr)
                self.assertEqual(calls, [])
                self.assertIn('Internal dependency attempts require', result.stderr)

    def test_the_image_python_prerequisite_is_checked_before_package_operations(self):
        result, calls = self.run_installer(without_python=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(calls, [])
        self.assertIn('pinned Playwright image must provide Python 3', result.stderr)


if __name__ == '__main__':
    unittest.main()
