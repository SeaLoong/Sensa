"""Verification-plan interface contracts. / 验证计划接口契约."""
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location('ci_plan', Path(__file__).resolve().parents[2] / 'scripts/ci-plan.py')
plan = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(plan)


class VerificationPlanTests(unittest.TestCase):
    def test_documentation_change_avoids_runtime_checks_and_publication(self):
        result = plan.plan_changes(['docs/guide.md', 'README.en.md', 'unity/top.sealoong.sensa/README.en.md.meta'], event_name='push', ref='refs/heads/main')
        self.assertEqual({flag for flag in plan.FLAGS if result[flag]}, {'docs'})
        self.assertEqual(result['e2e_suite'], 'none')

    def test_interactive_geometry_documents_require_browser_and_model_checks_without_native_publication(self):
        assets = [
            'docs/parameter-geometry.html',
            'docs/assets/parameter-geometry-model.js',
            'docs/assets/parameter-geometry-view.js',
            'docs/assets/parameter-geometry-style.css',
            'docs/assets/parameter-geometry-3d.js',
            'docs/assets/parameter-geometry-3d.LICENSE.txt',
        ]
        inputs = assets + ['docs/assets/parameter-geometry-3d-source.js', 'scripts/build-parameter-geometry.mjs']
        for paths in [[path] for path in inputs] + [inputs, [inputs[-1].replace('/', '\\'), 'docs/guide.md']]:
            with self.subTest(paths=paths):
                result = plan.plan_changes(paths, event_name='push', ref='refs/heads/main')
                self.assertEqual({flag for flag in plan.FLAGS if result[flag]}, {'web', 'docs', 'e2e'})
                self.assertEqual(result['e2e_suite'], 'all')
        other = plan.plan_changes(['docs/other.html', 'docs/assets/other.js', 'docs/assets/other.css'],
                                  event_name='push', ref='refs/heads/main')
        self.assertEqual({flag for flag in plan.FLAGS if other[flag]}, {'docs'})
        for integration in ('src/Sensa.csproj', 'scripts/release.py', 'scripts/build-web.mjs'):
            with self.subTest(integration=integration):
                result = plan.plan_changes(inputs + [integration], event_name='push', ref='refs/heads/main')
                self.assertTrue(all(result[key] for key in ('e2e', 'unity', 'platforms', 'prerelease')))

    def test_standalone_site_uses_local_contracts_without_product_publication(self):
        for path in ('.github/pages/index.html', '.github/pages/site.js', '.github/workflows/pages.yml',
                     'scripts/build-pages.mjs', 'scripts/vpm-index.py', 'tests/e2e/site.spec.js'):
            with self.subTest(path=path):
                result = plan.plan_changes([path], event_name='push', ref='refs/heads/main')
                self.assertEqual({flag for flag in plan.FLAGS if result[flag]}, {'web', 'scripts', 'docs'})
                self.assertEqual(result['e2e_suite'], 'none')

    def test_tests_only_exercise_their_interface_without_publication(self):
        cases = [('tests/web/output.test.mjs', {'web'}),
                 ('tests/Sensa.Tests/OutputTests.cs', {'backend'}),
                 ('tests/scripts/test_release.py', {'scripts'}),
                 ('tests/e2e/flows.spec.js', {'e2e', 'web', 'backend'})]
        for path, expected in cases:
            with self.subTest(path=path):
                result = plan.plan_changes([path], event_name='push', ref='refs/heads/main')
                self.assertEqual({flag for flag in plan.FLAGS if result[flag]}, expected)

    def test_development_tools_and_lint_rules_check_their_contracts_without_product_work(self):
        cases = [(['scripts/verify.py'], {'scripts'}),
                 (['scripts/xerj.py'], {'scripts'}),
                 (['.xerjignore'], {'scripts'}),
                 (['.codex/config.toml'], {'scripts'}),
                 ([r'.codex\hooks\validate.py'], {'scripts'}),
                 (['.codex/README.md'], {'scripts', 'docs'}),
                 (['eslint.config.js'], {'web'}),
                 (['scripts/xerj.py', 'docs/agents/xerj.md', 'eslint.config.js'],
                  {'scripts', 'docs', 'web'})]
        for paths, expected in cases:
            with self.subTest(paths=paths):
                result = plan.plan_changes(paths, event_name='push', ref='refs/heads/main')
                self.assertEqual({flag for flag in plan.FLAGS if result[flag]}, expected)
                self.assertEqual(result['e2e_suite'], 'none')

    def test_build_tool_changes_keep_the_full_product_gate_even_alongside_development_tools(self):
        for product_path in ('scripts/build-web.mjs', 'scripts/ci-plan.py', 'scripts/ci_evidence.py', '.github/workflows/ci.yml'):
            with self.subTest(path=product_path):
                result = plan.plan_changes(['scripts/verify.py', 'eslint.config.js', product_path],
                                           event_name='push', ref='refs/heads/main')
                self.assertTrue(all(result[key] for key in ('e2e', 'unity', 'platforms', 'prerelease')))

    def test_product_changes_require_current_e2e_and_complete_artifacts(self):
        for path in ('src/Program.cs', 'src/web/app.jsx', 'unity/package.json',
                     'scripts/release.py', 'tools/unity-world-lab/Editor.cs'):
            with self.subTest(path=path):
                result = plan.plan_changes([path], event_name='push', ref='refs/heads/main')
                self.assertTrue(all(result[key] for key in ('e2e', 'unity', 'platforms', 'prerelease')))
                self.assertEqual(result['e2e_suite'], 'all')

    def test_embedded_presets_and_shared_pose_protocol_also_verify_backend(self):
        for path in ('src/web/data/osc-presets.json', 'unity/top.sealoong.sensa/Runtime/SensaPoseProtocol.cs'):
            with self.subTest(path=path):
                self.assertTrue(plan.plan_changes([path])['backend'])

    def test_pr_branch_and_manual_runs_never_publish_automatic_prereleases(self):
        for event, ref in (('pull_request', 'refs/pull/1/merge'), ('push', 'refs/heads/feature'),
                           ('workflow_dispatch', 'refs/heads/main'), ('push', 'refs/tags/v0.4.0')):
            with self.subTest(event=event, ref=ref):
                self.assertFalse(plan.plan_changes(['src/Program.cs'], event_name=event, ref=ref)['prerelease'])

    def test_release_tags_select_full_comparison_and_only_the_required_platforms(self):
        for target, prefix in (('app', 'v'), ('unity', 'unity-v')):
            for version in ('1.2.3', '1.2.3-rc.1'):
                with self.subTest(target=target, version=version):
                    result = plan.plan_release(target, event_name='push', ref='refs/tags/' + prefix + version)
                    expected = plan.FULL if target == 'app' else plan.FULL - {'platforms'}
                    self.assertEqual({flag for flag in plan.FLAGS if result[flag]}, expected)
                    self.assertEqual(result['e2e_suite'], 'all')
                    self.assertEqual(result['paths'], [])
                    self.assertFalse(result['prerelease'])

    def test_release_plan_rejects_unknown_targets(self):
        for target in ('', 'desktop', None):
            with self.subTest(target=target), self.assertRaises(ValueError):
                plan.plan_release(target, event_name='push', ref='refs/tags/v1.2.3')

    def test_release_plan_requires_a_matching_complete_tag_from_a_push(self):
        cases = [
            ('app', 'pull_request', 'refs/tags/v1.2.3'),
            ('app', 'workflow_dispatch', 'refs/tags/v1.2.3'),
            ('app', 'workflow_call', 'refs/tags/v1.2.3'),
            ('app', 'push', 'refs/heads/v1.2.3'),
            ('app', 'push', 'v1.2.3'),
            ('app', 'push', 'refs/tags/unity-v1.2.3'),
            ('unity', 'push', 'refs/tags/v1.2.3'),
            ('app', 'push', 'refs/tags/v1.2'),
            ('app', 'push', 'refs/tags/v1.2.3-'),
            ('app', 'push', 'refs/tags/v1.2.3+build.4'),
            ('app', 'push', 'refs/tags/v1.2.3/extra'),
            ('unity', 'push', 'refs/tags/unity-v1.2.3\n'),
            ('unity', 'push', ''),
        ]
        for target, event, ref in cases:
            with self.subTest(target=target, event=event, ref=ref), self.assertRaises(ValueError):
                plan.plan_release(target, event_name=event, ref=ref)

    def test_release_cli_bypasses_diffs_and_main_evidence_without_writing_intent(self):
        with tempfile.TemporaryDirectory() as directory:
            record = Path(directory) / 'verification-plan.json'
            arguments = ['ci-plan.py', '--release-target', 'unity', '--github-evidence', '--record', str(record)]
            environment = {'GITHUB_EVENT_NAME': 'push', 'GITHUB_REF': 'refs/tags/unity-v1.2.3'}
            with patch('sys.argv', arguments), patch.dict(plan.os.environ, environment, clear=True), \
                    patch.object(plan, 'changed_paths', side_effect=AssertionError('Tag plans must not inspect a diff')), \
                    patch.object(plan, 'plan_changes', side_effect=AssertionError('Tag plans have an explicit scope')), \
                    patch.object(plan, 'plan_with_evidence', side_effect=AssertionError('Tag plans must not inherit main debt')), \
                    patch('sys.stdout', new_callable=io.StringIO) as output:
                plan.main()
            result = json.loads(output.getvalue())
            self.assertFalse(result['platforms'])
            self.assertTrue(result['e2e'])
            self.assertFalse(record.exists())

    def test_release_cli_reports_invalid_event_without_falling_back_to_a_path_plan(self):
        arguments = ['ci-plan.py', '--release-target', 'app', '--event', 'workflow_dispatch', '--ref', 'refs/tags/v1.2.3']
        with patch('sys.argv', arguments), patch('sys.stderr', new_callable=io.StringIO) as output, \
                patch.object(plan, 'changed_paths') as changed_paths:
            with self.assertRaises(SystemExit) as error:
                plan.main()
        self.assertEqual(error.exception.code, 2)
        self.assertIn('matching pushed version tag', output.getvalue())
        changed_paths.assert_not_called()

    def test_normal_cli_retains_path_based_scope(self):
        arguments = ['ci-plan.py', '--base', 'base', '--event', 'push', '--ref', 'refs/heads/main']
        with patch('sys.argv', arguments), patch.dict(plan.os.environ, {}, clear=True), \
                patch.object(plan, 'changed_paths', return_value=(['README.md'], True)) as changed_paths, \
                patch('sys.stdout', new_callable=io.StringIO) as output:
            plan.main()
        changed_paths.assert_called_once_with('base', 'HEAD')
        result = json.loads(output.getvalue())
        self.assertEqual({flag for flag in plan.FLAGS if result[flag]}, {'docs'})

    def test_unknown_paths_workflows_and_unavailable_diff_fail_closed(self):
        for paths, available in [(['new-area/file.py'], True), (['.github/workflows/ci.yml'], True),
                                 (['../outside'], True), ([], False)]:
            with self.subTest(paths=paths, available=available):
                result = plan.plan_changes(paths, diff_available=available)
                self.assertTrue(all(result[key] for key in plan.FULL))

    def test_normalizes_windows_paths_and_empty_known_diff_does_nothing(self):
        self.assertTrue(plan.plan_changes([r'tests\web\sample.test.mjs'])['web'])
        self.assertFalse(any(plan.plan_changes([])[key] for key in plan.FLAGS))

    def test_git_adapter_handles_deletion_rename_and_failure(self):
        with patch.object(plan.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0, b'old.cs\0new.cs\0')):
            self.assertEqual(plan.changed_paths('base'), (['old.cs', 'new.cs'], True))
        with patch.object(plan.subprocess, 'run', side_effect=subprocess.CalledProcessError(1, 'git')):
            self.assertEqual(plan.changed_paths('missing'), ([], False))
        with patch.object(plan.subprocess, 'run') as run:
            self.assertEqual(plan.changed_paths('0' * 40), ([], False))
            run.assert_not_called()


if __name__ == '__main__':
    unittest.main()
