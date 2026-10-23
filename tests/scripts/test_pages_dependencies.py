"""Pages dependency setup uses fake tools; no APT, sudo or browser is launched."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[2]
HELPER = ROOT / 'scripts/install-pages-dependencies.sh'


@unittest.skipUnless(os.name == 'posix' and shutil.which('bash'), 'Pages installer needs Bash')
class PagesDependencyInstallerTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix='sensa-pages-dependencies-')
        self.addCleanup(temporary.cleanup)
        self.directory = Path(temporary.name)
        self.repository = self.directory / 'repository with spaces'
        scripts = self.repository / 'scripts'
        scripts.mkdir(parents=True)
        self.helper = scripts / HELPER.name
        shutil.copyfile(HELPER, self.helper)
        self.cli = self.repository / 'node_modules/playwright/cli.js'
        self.cli.parent.mkdir(parents=True)
        self.cli.write_text('// Fake CLI placeholder.\n', encoding='utf-8')
        self.source = self.directory / 'Ubuntu "signed" sources.sources'
        self.source.write_text('Types: deb\nURIs: http://archive.ubuntu.com/ubuntu\n'
                               'Suites: noble\nComponents: main universe\n', encoding='utf-8')
        self.calls_path = self.directory / 'calls.jsonl'
        self.bin = self.directory / 'bin'
        self.bin.mkdir()
        fake = '''import json
import os
from pathlib import Path
import subprocess
import sys

tool = Path(sys.argv[0]).name
path = Path(os.environ['SENSA_TEST_CALLS'])
previous = [json.loads(line) for line in path.read_text().splitlines()] if path.exists() else []
config = os.environ.get('APT_CONFIG')
entry = {'tool': tool, 'arguments': sys.argv[1:], 'config': config,
         'frontend': os.environ.get('DEBIAN_FRONTEND'),
         'configuration': Path(config).read_text() if config and Path(config).is_file() else None}
with path.open('a') as stream:
    stream.write(json.dumps(entry) + '\\n')
if tool == 'sudo':
    # Simulate sudo stripping caller variables; explicit env assignments must restore them.
    environment = dict(os.environ)
    environment.pop('APT_CONFIG', None)
    environment.pop('DEBIAN_FRONTEND', None)
    os.execvpe(sys.argv[1], sys.argv[1:], environment)
if tool == 'timeout':
    statuses = json.loads(os.environ['SENSA_TEST_TIMEOUT_STATUSES'])
    index = sum(item['tool'] == 'timeout' for item in previous)
    if index < len(statuses) and statuses[index]:
        raise SystemExit(statuses[index])
    os.execvp(sys.argv[3], sys.argv[3:])
if tool == 'node':
    # Reproduce Playwright install-deps' internal update/install in the inherited environment.
    if sys.argv[2:] != ['install-deps', 'chromium']:
        raise SystemExit('Expected install-deps without a browser download')
    for arguments in (['apt-get', 'update'], ['apt-get', 'install', '-y', '--no-install-recommends', 'browser-runtime']):
        result = subprocess.run(arguments, check=False)
        if result.returncode:
            raise SystemExit(result.returncode)
    raise SystemExit(0)
if tool == 'apt-get':
    statuses = json.loads(os.environ['SENSA_TEST_APT_STATUSES'])
    index = sum(item['tool'] == 'apt-get' for item in previous)
    status = statuses[index] if index < len(statuses) else 0
    pending = Path(os.environ['SENSA_TEST_DPKG_PENDING'])
    if os.environ.get('SENSA_TEST_INTERRUPT_DPKG') == '1' and 'install' in sys.argv:
        if pending.exists():
            status = 100
        elif status:
            pending.touch()
    raise SystemExit(status)
if tool == 'dpkg':
    assert sys.argv[1:] == ['--configure', '--pending']
    status = int(os.environ['SENSA_TEST_DPKG_STATUS'])
    if status == 0:
        Path(os.environ['SENSA_TEST_DPKG_PENDING']).unlink(missing_ok=True)
    raise SystemExit(status)
raise SystemExit('Unexpected fake tool')
'''
        for name in ('sudo', 'timeout', 'node', 'apt-get', 'dpkg'):
            executable = self.bin / name
            executable.write_text('#!' + sys.executable + '\n' + fake, encoding='utf-8')
            executable.chmod(0o755)

    def run_installer(self, apt_statuses=(), timeout_statuses=(), *, interrupted=False, recovery_status=0):
        environment = dict(os.environ)
        environment.update({
            'PATH': str(self.bin) + os.pathsep + environment.get('PATH', ''),
            'SENSA_E2E_UBUNTU_SOURCE_FILE': str(self.source),
            'SENSA_TEST_CALLS': str(self.calls_path),
            'SENSA_TEST_APT_STATUSES': json.dumps(apt_statuses),
            'SENSA_TEST_TIMEOUT_STATUSES': json.dumps(timeout_statuses),
            'SENSA_TEST_INTERRUPT_DPKG': str(int(interrupted)),
            'SENSA_TEST_DPKG_PENDING': str(self.directory / 'dpkg-pending'),
            'SENSA_TEST_DPKG_STATUS': str(recovery_status),
            'APT_CONFIG': '/ignored-caller-config',
            'DEBIAN_FRONTEND': 'dialog',
        })
        result = subprocess.run(['bash', str(self.helper)], cwd=self.directory, env=environment,
                                capture_output=True, text=True, timeout=10, check=False)
        calls = [json.loads(line) for line in self.calls_path.read_text().splitlines()] \
            if self.calls_path.exists() else []
        return result, calls

    def apt_commands(self, calls):
        return [call['arguments'][0] for call in calls if call['tool'] == 'apt-get']

    def assert_root_configuration(self, calls):
        privileged = [call for call in calls if call['tool'] != 'sudo']
        for call in privileged:
            self.assertEqual(call['frontend'], 'noninteractive')
            self.assertTrue(Path(call['config']).is_absolute())
            self.assertIn('Dir::Etc::sourcelist "' + str(self.source).replace('"', '\\"') + '";', call['configuration'])
            for directive in ('Dir::Etc::sourceparts "-";', 'Acquire::Retries "1";',
                              'Acquire::http::Timeout "15";', 'Acquire::https::Timeout "15";',
                              'APT::Update::Error-Mode "any";'):
                self.assertIn(directive, call['configuration'])
            self.assertFalse(Path(call['config']).exists(), 'Temporary APT configuration must be cleaned up')
        for call in (item for item in calls if item['tool'] == 'node'):
            self.assertEqual(Path(call['arguments'][0]).resolve(), self.cli)
            self.assertEqual(call['arguments'][1:], ['install-deps', 'chromium'])
        for call in (item for item in calls if item['tool'] == 'timeout'):
            self.assertEqual(call['arguments'][:2], ['--kill-after=5s', '130s'])

    def test_success_preserves_configuration_through_sudo_and_updates_only_once(self):
        result, calls = self.run_installer()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.apt_commands(calls), ['update', 'install', 'install'])
        fonts = [call for call in calls if call['tool'] == 'apt-get'][-1]
        self.assertEqual(fonts['arguments'], ['install', '-y', '--no-install-recommends', 'fonts-noto-cjk'])
        self.assert_root_configuration(calls)

    def test_failed_update_retries_the_entire_bounded_attempt(self):
        result, calls = self.run_installer(apt_statuses=[100, 0, 0, 0])
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.apt_commands(calls), ['update', 'update', 'install', 'install'])
        self.assert_root_configuration(calls)

    def test_failed_font_install_retries_and_persistent_failure_remains_failure(self):
        result, calls = self.run_installer(apt_statuses=[0, 0, 100, 0, 0, 100])
        self.assertEqual(result.returncode, 100)
        self.assertEqual(self.apt_commands(calls), ['update', 'install', 'install'] * 2)
        self.assert_root_configuration(calls)

    def test_retry_repairs_interrupted_dpkg_before_playwright_installs_libraries(self):
        result, calls = self.run_installer(apt_statuses=[0, 100, 0, 0, 0], interrupted=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.apt_commands(calls), ['update', 'install', 'update', 'install', 'install'])
        tools = [call['tool'] for call in calls]
        self.assertEqual(tools.count('dpkg'), 1)
        self.assertLess(tools.index('dpkg'), tools.index('node', tools.index('dpkg')))
        self.assertFalse((self.directory / 'dpkg-pending').exists())
        self.assert_root_configuration(calls)

    def test_failed_package_recovery_remains_a_failure_before_second_install(self):
        result, calls = self.run_installer(apt_statuses=[0, 100], interrupted=True, recovery_status=2)
        self.assertEqual(result.returncode, 2, result.stderr)
        self.assertEqual(self.apt_commands(calls), ['update', 'install'])
        self.assertTrue((self.directory / 'dpkg-pending').exists())
        self.assert_root_configuration(calls)

    def test_timeout_retries_once_without_hiding_persistent_failure(self):
        result, calls = self.run_installer(timeout_statuses=[124, 124])
        self.assertEqual(result.returncode, 124)
        self.assertEqual(self.apt_commands(calls), [])
        self.assertEqual(len([call for call in calls if call['tool'] == 'timeout']), 2)
        self.assert_root_configuration(calls)

    def test_missing_source_fails_before_privileged_tools_run(self):
        self.source.unlink()
        result, calls = self.run_installer()
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(calls, [])

    def test_workflow_bounds_setup_and_downloads_without_sudo(self):
        workflow = (ROOT / '.github/workflows/pages.yml').read_text(encoding='utf-8')
        self.assertIn('timeout-minutes: 15', workflow)
        self.assertIn('timeout-minutes: 5\n        run: bash scripts/install-pages-dependencies.sh', workflow)
        self.assertIn("PLAYWRIGHT_DOWNLOAD_CONNECTION_TIMEOUT: '30000'", workflow)
        self.assertIn('timeout-minutes: 3', workflow)
        self.assertIn('run: npx playwright install --only-shell chromium', workflow)
        self.assertNotIn('--with-deps', workflow)
        self.assertNotIn('apt-get', workflow)
        self.assertNotIn('container:', workflow)


if __name__ == '__main__':
    unittest.main()
