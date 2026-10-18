"""Native packaging interface contracts with a fake process adapter.
使用伪进程适配器验证原生打包接口；绝不执行本机冒烟。
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
    def test_local_execution_refuses_to_start_any_process(self):
        with patch.dict(os.environ, {'GITHUB_ACTIONS': 'false'}), \
                patch.object(build.subprocess, 'run') as run, \
                patch.object(sys, 'argv', ['build-platform.py', '--runtime', 'linux-x64']), \
                self.assertRaisesRegex(ValueError, 'GitHub Actions'):
            build.main()
        run.assert_not_called()

    def test_native_candidate_is_packaged_only_after_successful_isolated_smoke(self):
        for runtime in build.RUNTIMES:
            with self.subTest(runtime=runtime), \
                    patch.dict(os.environ, {'GITHUB_ACTIONS': 'true', 'GITHUB_REF_TYPE': 'branch'}), \
                    patch.object(build.subprocess, 'run') as run, \
                    patch.object(sys, 'argv', ['build-platform.py', '--runtime', runtime, '--label', 'preview.42']):
                build.main()
                commands = [call.args[0] for call in run.call_args_list]
                self.assertEqual(len(commands), 3)
                self.assertEqual(commands[0][0:2], ('dotnet', 'publish'))
                self.assertEqual(commands[1][1], 'scripts/smoke.py')
                self.assertEqual(commands[2][1:3], ('scripts/release.py', 'app'))
                self.assertEqual(commands[2][commands[2].index('--runtime') + 1], runtime)
                self.assertEqual(commands[2][commands[2].index('--label') + 1], 'preview.42')
                self.assertFalse(any('test' in command for command in commands))

    def test_smoke_failure_never_produces_an_archive(self):
        with patch.dict(os.environ, {'GITHUB_ACTIONS': 'true'}), \
                patch.object(build.subprocess, 'run', side_effect=[
                    subprocess.CompletedProcess([], 0), subprocess.CalledProcessError(1, 'smoke')]) as run, \
                patch.object(sys, 'argv', ['build-platform.py', '--runtime', 'linux-x64']), \
                self.assertRaises(subprocess.CalledProcessError):
            build.main()
        self.assertEqual(run.call_count, 2)

    def test_explicit_release_tag_is_preserved_for_manifest_validation(self):
        with patch.dict(os.environ, {'GITHUB_ACTIONS': 'true', 'GITHUB_REF_TYPE': 'tag', 'GITHUB_REF_NAME': 'v0.4.0'}), \
                patch.object(build.subprocess, 'run') as run, \
                patch.object(sys, 'argv', ['build-platform.py', '--runtime', 'win-x64']):
            build.main()
        command = run.call_args.args[0]
        self.assertEqual(command[command.index('--tag') + 1], 'v0.4.0')


if __name__ == '__main__':
    unittest.main()
