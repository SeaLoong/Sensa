"""Native packaging interface contracts with a fake process adapter.
使用伪进程适配器验证原生打包接口；不启动程序或设备。
"""
import importlib.util
import os
from pathlib import Path
import subprocess
import sys
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
RELEASE_SPEC = importlib.util.spec_from_file_location('release', ROOT / 'scripts/release.py')
release = importlib.util.module_from_spec(RELEASE_SPEC)
RELEASE_SPEC.loader.exec_module(release)
SPEC = importlib.util.spec_from_file_location('build_platform', ROOT / 'scripts/build-platform.py')
build = importlib.util.module_from_spec(SPEC)
with patch.dict(sys.modules, release=release):
    SPEC.loader.exec_module(build)


class NativeCandidateTests(unittest.TestCase):
    def test_native_build_only_publishes_and_packages_without_smoke_or_tests(self):
        for runtime in build.RUNTIMES:
            with self.subTest(runtime=runtime), \
                    patch.object(build.subprocess, 'run') as run, \
                    patch.object(sys, 'argv', ['build-platform.py', '--runtime', runtime, '--version', '0.4.0', '--label', 'preview.42']):
                build.main()
                commands = [call.args[0] for call in run.call_args_list]
                self.assertEqual(len(commands), 2)
                self.assertEqual(commands[0][0:2], ('dotnet', 'publish'))
                self.assertEqual(commands[0][commands[0].index('-r') + 1], runtime)
                self.assertEqual(commands[1][1:3], ('scripts/release.py', 'app'))
                self.assertEqual(commands[1][commands[1].index('--runtime') + 1], runtime)
                self.assertEqual(commands[1][commands[1].index('--label') + 1], 'preview.42')
                self.assertFalse(any('smoke' in str(part) or part == 'test' for command in commands for part in command))

    def test_build_failure_never_produces_an_archive(self):
        with patch.object(build.subprocess, 'run', side_effect=subprocess.CalledProcessError(1, 'publish')) as run, \
                patch.object(sys, 'argv', ['build-platform.py', '--runtime', 'linux-x64', '--version', '0.4.0']), \
                self.assertRaises(subprocess.CalledProcessError):
            build.main()
        self.assertEqual(run.call_count, 1)

    def test_ci_smoke_runs_the_target_binary_before_packaging_on_every_platform(self):
        for runtime in build.RUNTIMES:
            with self.subTest(runtime=runtime), patch.dict(os.environ, GITHUB_ACTIONS='true'), \
                    patch.object(build.subprocess, 'run') as run, \
                    patch.object(sys, 'argv', ['build-platform.py', '--runtime', runtime, '--version', '0.4.0', '--smoke']):
                build.main()
                commands = [call.args[0] for call in run.call_args_list]
                self.assertEqual(len(commands), 3)
                self.assertEqual(commands[0][:2], ('dotnet', 'publish'))
                self.assertEqual(commands[1][1], 'scripts/smoke.py')
                executable = 'Sensa.exe' if runtime.startswith('win-') else 'Sensa'
                self.assertEqual(commands[1][commands[1].index('--exe') + 1],
                                 str(build.ROOT / 'artifacts/publish' / runtime / executable))
                self.assertEqual(commands[1][commands[1].index('--report-dir') + 1],
                                 str(build.ROOT / 'artifacts/test-results' / runtime / 'smoke'))
                self.assertEqual(commands[2][1:3], ('scripts/release.py', 'app'))

    def test_smoke_failure_does_not_package_an_unverified_binary(self):
        with patch.dict(os.environ, GITHUB_ACTIONS='true'), \
                patch.object(build.subprocess, 'run', side_effect=[subprocess.CompletedProcess([], 0),
                             subprocess.CalledProcessError(1, 'smoke')]) as run, \
                patch.object(sys, 'argv', ['build-platform.py', '--runtime', 'linux-x64', '--version', '0.4.0', '--smoke']), \
                self.assertRaises(subprocess.CalledProcessError):
            build.main()
        self.assertEqual(run.call_count, 2)

    def test_local_smoke_is_rejected_before_starting_any_process(self):
        with patch.dict(os.environ, GITHUB_ACTIONS='false'), \
                patch.object(build.subprocess, 'run') as run, \
                patch.object(sys, 'argv', ['build-platform.py', '--runtime', 'linux-x64', '--version', '0.4.0', '--smoke']), \
                self.assertRaisesRegex(ValueError, 'GitHub Actions'):
            build.main()
        run.assert_not_called()

    def test_selected_version_is_used_instead_of_the_workflow_branch_or_tag(self):
        with patch.dict(os.environ, {'GITHUB_ACTIONS': 'false', 'GITHUB_REF_TYPE': 'tag', 'GITHUB_REF_NAME': 'v99.0.0'}), \
                patch.object(build.subprocess, 'run') as run, \
                patch.object(sys, 'argv', ['build-platform.py', '--runtime', 'win-x64', '--version', '0.4.0']):
            build.main()
        command = run.call_args.args[0]
        self.assertEqual(command[command.index('--tag') + 1], 'v0.4.0')

    def test_invalid_or_unapplied_version_fails_before_building(self):
        for version in ('../escape', '0.4', '99.0.0'):
            with self.subTest(version=version), \
                    patch.object(build.subprocess, 'run') as run, \
                    patch.object(sys, 'argv', ['build-platform.py', '--runtime', 'linux-x64', '--version', version]), \
                    self.assertRaises(ValueError):
                build.main()
            run.assert_not_called()


if __name__ == '__main__':
    unittest.main()
