"""Local verification workflow contracts. / 本地验证工作流契约。"""
import contextlib
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import shutil
import tempfile
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location('sensa_verify', Path(__file__).resolve().parents[2] / 'scripts/verify.py')
verify = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(verify)


class LocalVerificationTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.write('src/web/app.js', 'const version = 1;')
        self.write('src/Program.cs', 'class Program {}')
        self.commands = []
        self.toolchain = {'version': 'test-toolchain'}

    def write(self, name, content):
        file = self.root / name
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_text(content, encoding='utf-8')

    def runner(self, command, root):
        self.assertEqual(root, self.root)
        self.commands.append(command)
        return 0

    def run_plan(self, paths, **kwargs):
        return verify.run_verification(
            verify.CI_PLAN.plan_changes(paths), root=self.root,
            runner=kwargs.pop('runner', self.runner),
            tools=lambda *_: self.toolchain, output=lambda _: None, **kwargs)

    def receipt(self, lane):
        return self.root / 'artifacts/verification' / (lane + '.json')

    def test_success_is_cached_by_content_command_and_toolchain(self):
        self.assertTrue(self.run_plan(['tests/web/example.test.mjs']))
        self.assertEqual(len(self.commands), 2)
        self.assertTrue(self.receipt('web').is_file())
        self.commands.clear()
        self.assertTrue(self.run_plan(['tests/web/example.test.mjs']))
        self.assertEqual(self.commands, [])
        self.write('src/Program.cs', 'class ChangedBackend {}')
        self.assertTrue(self.run_plan(['tests/web/example.test.mjs']))
        self.assertEqual(self.commands, [])
        self.write('src/web/app.js', 'const version = 2;')
        self.assertTrue(self.run_plan(['tests/web/example.test.mjs']))
        self.assertEqual(len(self.commands), 2)
        self.commands.clear()
        self.toolchain = {'version': 'next-toolchain'}
        self.assertTrue(self.run_plan(['tests/web/example.test.mjs']))
        self.assertEqual(len(self.commands), 2)
        self.commands.clear()
        with patch.object(verify, 'lane_commands', return_value=[['different-command']]):
            self.assertTrue(self.run_plan(['tests/web/example.test.mjs']))
        self.assertEqual(self.commands, [['different-command']])

    def test_force_repeats_success_but_failure_removes_receipt_and_stops_lane(self):
        self.assertTrue(self.run_plan(['tests/web/example.test.mjs']))
        self.commands.clear()
        self.assertTrue(self.run_plan(['tests/web/example.test.mjs'], force=True))
        self.assertEqual(len(self.commands), 2)
        calls = []
        self.assertFalse(self.run_plan(['tests/web/example.test.mjs'], force=True,
                                      runner=lambda command, _: calls.append(command) or 1))
        self.assertEqual(len(calls), 1)
        self.assertFalse(self.receipt('web').exists())
        self.commands.clear()
        self.assertTrue(self.run_plan(['tests/web/example.test.mjs']))
        self.assertEqual(len(self.commands), 2)

    def test_source_changes_during_validation_are_not_cached_as_current(self):
        def changing_runner(command, root):
            self.write('src/web/app.js', 'changed while checking')
            return 0
        self.assertFalse(self.run_plan(['tests/web/example.test.mjs'], runner=changing_runner))
        self.assertFalse(self.receipt('web').exists())

    def test_selected_lanes_deduplicate_docs_and_keep_backend_independent_of_node(self):
        plan = verify.CI_PLAN.plan_changes(['tests/Sensa.Tests/Test.cs', 'tests/scripts/test_one.py', 'README.md'])
        self.assertEqual(verify.select_local_lanes(plan), ['backend', 'scripts'])
        self.assertTrue(verify.run_verification(plan, root=self.root, runner=self.runner,
                                              tools=lambda *_: self.toolchain, output=lambda _: None,
                                              dotnet='chosen-dotnet'))
        self.assertEqual(self.commands[0][0], 'chosen-dotnet')
        self.assertIn('-p:SkipWebBuild=true', self.commands[0])
        self.assertFalse(any('npm' in argument or 'node' == argument for command in self.commands for argument in command))
        self.assertIn('utf8', self.commands[1])
        self.assertNotIn('test_bilingual_docs.py', self.commands[1])

    def test_unknown_paths_conservatively_select_all_local_lanes(self):
        plan = verify.CI_PLAN.plan_changes(['new-area/new-file.xyz'])
        self.assertEqual(verify.select_local_lanes(plan), ['web', 'backend', 'scripts', 'unity'])
        self.assertTrue(all(plan[lane] for lane in verify.CI_PLAN.FULL))
        self.write('new-area/new-file.xyz', 'first')
        self.assertTrue(self.run_plan(['new-area/new-file.xyz']))
        self.commands.clear()
        self.write('new-area/new-file.xyz', 'second')
        self.assertTrue(self.run_plan(['new-area/new-file.xyz']))
        self.assertEqual(len(self.commands), 5)

    def test_ci_only_plan_and_no_changes_execute_nothing(self):
        for plan in ({'e2e': True, 'platforms': True, 'prerelease': True}, verify.CI_PLAN.plan_changes([])):
            with self.subTest(plan=plan):
                self.assertTrue(verify.run_verification(plan, root=self.root, runner=self.runner,
                                                      tools=lambda *_: self.fail('Toolchain probe forbidden / 禁止探测工具')))
                self.assertEqual(self.commands, [])
        with patch.object(verify, 'discover_changes', return_value=([], True)), patch.object(verify, 'run_verification') as run:
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(verify.main([]), 0)
            run.assert_not_called()

    def test_plan_option_only_prints_json_and_all_includes_ci_requirements(self):
        with patch.object(verify, 'discover_changes', return_value=(['README.md'], True)), patch.object(verify, 'run_verification') as run:
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertEqual(verify.main(['--all', '--plan']), 0)
            summary = json.loads(output.getvalue())
            self.assertEqual(summary['local_lanes'], ['web', 'backend', 'scripts', 'unity'])
            self.assertIn('e2e', summary['github_actions_only'])
            self.assertIn('platforms', summary['github_actions_only'])
            run.assert_not_called()

    def test_git_changes_include_dirty_staged_untracked_and_requested_base(self):
        result = [subprocess.CompletedProcess([], 0, b'src/changed.cs\0deleted.cs\0'),
                  subprocess.CompletedProcess([], 0, b'src/new.cs\0')]
        with patch.object(verify.subprocess, 'run', side_effect=result) as run:
            paths, available = verify.discover_changes(self.root, 'base-ref')
            self.assertTrue(available)
            self.assertEqual(paths, ['deleted.cs', 'src/changed.cs', 'src/new.cs'])
            self.assertEqual(run.call_args_list[0].args[0][-1], 'base-ref')
        with patch.object(verify.subprocess, 'run', side_effect=OSError('missing git')):
            self.assertEqual(verify.discover_changes(self.root), ([], False))

    def test_local_sdk_precedes_path_and_explicit_override_precedes_both(self):
        self.write('artifacts/toolchain/dotnet/dotnet.exe', 'fake SDK executable')
        with patch.object(verify.shutil, 'which', return_value='path-dotnet'):
            self.assertEqual(verify.resolve_dotnet(self.root), str((self.root / 'artifacts/toolchain/dotnet/dotnet.exe').resolve()))
            self.assertEqual(verify.resolve_dotnet(self.root, 'explicit-sdk'), 'explicit-sdk')

    def test_generated_outputs_and_local_hardware_config_do_not_invalidate_web_receipt(self):
        self.assertTrue(self.run_plan(['tests/web/example.test.mjs']))
        self.commands.clear()
        self.write('artifacts/other/output.json', 'output')
        self.write('src/web/app.bundle.js', 'generated')
        self.write('config.json', '{"real_device":"must_not_read"}')
        self.assertTrue(self.run_plan(['tests/web/example.test.mjs']))
        self.assertEqual(self.commands, [])
        self.write('node_modules/.package-lock.json', '{"changed":true}')
        self.assertTrue(self.run_plan(['tests/web/example.test.mjs']))
        self.assertEqual(len(self.commands), 2)

    def test_development_configuration_content_changes_invalidate_scripts_receipts(self):
        for name in ('.xerjignore', '.codex/project.json'):
            with self.subTest(name=name):
                self.write(name, 'first development configuration')
                self.commands.clear()
                self.assertTrue(self.run_plan([name]))
                self.assertEqual(len(self.commands), 1)
                self.commands.clear()
                self.assertTrue(self.run_plan([name]))
                self.assertEqual(self.commands, [])
                self.write(name, 'changed development configuration')
                self.assertTrue(self.run_plan([name]))
                self.assertEqual(len(self.commands), 1)

    @unittest.skipUnless(shutil.which('git'), 'Git is required for inventory contract / 源码清单契约需要 Git')
    def test_git_inventory_excludes_ignored_build_and_machine_configuration(self):
        subprocess.run(['git', 'init', '--quiet', str(self.root)], check=True, capture_output=True)
        self.write('.gitignore', 'generated/\nlocal-machine.ini\n.codex/config.toml\nnode_modules/\nartifacts/\n')
        self.write('generated/output.py', 'ignored generated code')
        self.write('local-machine.ini', 'placeholder machine configuration')
        self.write('.codex/config.toml', 'placeholder local MCP configuration')
        self.write('.codex/project.json', '{"shared_project_setting":true}')
        self.write('node_modules/.package-lock.json', '{"installed_dependencies":true}')
        self.write('docs/config.json', '{"fixture":true}')
        subprocess.run(['git', 'add', 'src/Program.cs'], cwd=self.root, check=True, capture_output=True)
        (self.root / 'src/Program.cs').unlink()
        files = verify.source_files(self.root)
        for excluded in ('generated/output.py', 'local-machine.ini', '.codex/config.toml', 'src/Program.cs'):
            self.assertNotIn(excluded, files)
        for included in ('src/web/app.js', '.codex/project.json', 'node_modules/.package-lock.json', 'docs/config.json'):
            self.assertIn(included, files)
        self.assertTrue(self.run_plan(['tests/scripts/test_one.py']))
        self.commands.clear()
        self.write('generated/output.py', 'changed ignored generated code')
        self.write('local-machine.ini', 'changed machine configuration')
        self.write('.codex/config.toml', 'changed local MCP configuration')
        self.assertTrue(self.run_plan(['tests/scripts/test_one.py']))
        self.assertEqual(self.commands, [])

    def test_windows_npm_shim_with_spaces_uses_node_cli_without_a_shell(self):
        shim = self.root / 'Node Runtime With Spaces/npm.CMD'
        node = shim.parent / 'node.exe'
        cli = shim.parent / 'node_modules/npm/bin/npm-cli.js'
        self.write(shim.relative_to(self.root), 'unused command shim')
        self.write(node.relative_to(self.root), 'fake node executable')
        self.write(cli.relative_to(self.root), 'fake npm CLI')
        args = [str(shim), 'run', 'literal & value', 'dollar$()', 'two words']
        native = verify._native_command(args, platform_name='nt')
        self.assertEqual(native, [str(node), str(cli), *args[1:]])
        self.assertFalse(any('cmd.exe' in part.lower() for part in native))
        self.assertEqual(verify._native_command(['node', '--version'], platform_name='nt'), ['node', '--version'])
        with self.assertRaises(FileNotFoundError):
            verify._native_command([str(self.root / 'Missing npm/npm.cmd')], platform_name='nt')

    def test_toolchain_fingerprint_runs_the_same_native_npm_command(self):
        shim = str(self.root / 'Node With Spaces/npm.CMD')
        node = str(self.root / 'Node With Spaces/node.exe')
        cli = str(self.root / 'Node With Spaces/node_modules/npm/bin/npm-cli.js')

        def native(command):
            return [node, cli, *command[1:]] if command[0] == shim else command

        with patch.object(verify, '_native_command', side_effect=native), patch.object(
                verify.subprocess, 'run', side_effect=[
                    subprocess.CompletedProcess([], 0, 'v24.0.0\n', ''),
                    subprocess.CompletedProcess([], 0, '11.0.0\n', '')]) as run:
            result = verify.toolchain_fingerprint('web', [[shim, 'test']], self.root)
        self.assertEqual(run.call_args_list[0].args[0], [node, '--version'])
        self.assertEqual(run.call_args_list[1].args[0], [node, cli, '--version'])
        self.assertEqual(result[shim]['command'], [node, cli, '--version'])
        self.assertEqual(result[shim]['version'], '11.0.0')
        self.assertEqual(result[node]['version'], 'v24.0.0')
        self.assertEqual(result[shim]['exit'], 0)

    def test_failed_startup_and_corrupt_receipts_are_retried(self):
        self.write('artifacts/verification/web.json', '{broken')
        self.assertFalse(self.run_plan(['tests/web/example.test.mjs'],
                                      runner=lambda *_: (_ for _ in ()).throw(OSError('tool missing'))))
        self.assertFalse(self.receipt('web').exists())
        self.assertTrue(self.run_plan(['tests/web/example.test.mjs']))
        self.assertTrue(self.receipt('web').is_file())


if __name__ == '__main__':
    unittest.main()
