"""Verification-plan interface contracts. / 验证计划接口契约."""
import importlib.util
from pathlib import Path
import subprocess
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
        for product_path in ('scripts/build-web.mjs', 'scripts/ci-plan.py', '.github/workflows/ci.yml'):
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
