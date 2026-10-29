"""Optional local check planning; no CI or publication policy.
可选本地检查的规划，不决定 CI 或发布。
"""
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location('local_plan', Path(__file__).resolve().parents[2] / 'scripts/ci-plan.py')
plan = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(plan)


class LocalPlanTests(unittest.TestCase):
    def selected(self, paths):
        result = plan.plan_changes(paths)
        return {flag for flag in plan.FLAGS if result[flag]}

    def test_docs_and_interface_changes_select_only_relevant_local_checks(self):
        cases = [
            (['docs/guide.md', 'README.en.md', 'unity/top.sealoong.sensa/README.en.md.meta'], {'docs'}),
            (['tests/web/output.test.mjs'], {'web'}),
            (['tests/types/core-contracts.ts'], {'web'}),
            (['tests/e2e-types/parameter-detail-screenshot.contract.ts'], {'web'}),
            (['tsconfig.json'], {'web'}),
            (['tsconfig.e2e-types.json'], {'web'}),
            (['playwright.compatibility.config.js'], {'web'}),
            (['tests/fixtures/funscript-interop.json'], {'web', 'backend', 'scripts'}),
            (['tests/Sensa.Tests/OutputTests.cs'], {'backend'}),
            (['tests/scripts/test_release.py'], {'scripts'}),
            (['src/web/app.js'], {'web'}),
            (['src/websensa/WebSensa.tsx'], {'web'}),
            (['src/core/engine.ts'], {'web'}),
            (['src/Program.cs'], {'backend'}),
            (['unity/package.json'], {'scripts', 'unity'}),
            (['scripts/release.py'], {'scripts', 'unity'}),
            (['tools/unity-world-lab/Editor.cs'], {'scripts', 'unity'}),
        ]
        for paths, expected in cases:
            with self.subTest(paths=paths):
                self.assertEqual(self.selected(paths), expected)

    def test_interactive_documents_select_models_and_docs_without_browser_execution(self):
        for path in plan.INTERACTIVE_DOC_INPUTS:
            with self.subTest(path=path):
                self.assertEqual(self.selected([path]), {'web', 'docs'})
        self.assertEqual(self.selected(['docs/other.html', 'docs/assets/other.css']), {'docs'})
        # Old browser fixtures may remain as reference; planning them never launches Playwright.
        self.assertEqual(self.selected(['tests/e2e/flows.spec.js', 'playwright.config.js']), {'web'})

    def test_site_build_inputs_select_static_contracts(self):
        for path in ('.github/pages/index.html', '.github/pages/site.js', '.github/workflows/pages.yml',
                     'scripts/build-pages.mjs', 'scripts/build-websensa.mjs', 'scripts/vpm-index.py', 'scripts/verify-pages-artifact.py', 'tests/e2e/site.spec.js'):
            with self.subTest(path=path):
                self.assertEqual(self.selected([path]), {'web', 'scripts', 'docs'})
        self.assertEqual(self.selected(['.github/workflows/ci.yml']), {'scripts', 'docs'})

    def test_development_tools_and_lint_rules_remain_separate(self):
        cases = [(['scripts/verify.py'], {'scripts'}),
                 (['scripts/xerj.py'], {'scripts'}),
                 (['.xerjignore'], {'scripts'}),
                 (['.codex/config.toml'], {'scripts'}),
                 ([r'.codex\hooks\validate.py'], {'scripts'}),
                 (['.codex/README.md'], {'scripts', 'docs'}),
                 (['eslint.config.js'], {'web'})]
        for paths, expected in cases:
            with self.subTest(paths=paths):
                self.assertEqual(self.selected(paths), expected)

    def test_shared_protocol_and_presets_include_backend_checks(self):
        for path in ('src/web/data/osc-presets.json', 'unity/top.sealoong.sensa/Runtime/SensaPoseProtocol.cs',
                     'unity/top.sealoong.sensa/Runtime/SensaFixedAnchorProtocol.cs',
                     'unity/top.sealoong.sensa/Runtime/SensaContactProtocol.cs'):
            with self.subTest(path=path):
                self.assertTrue(plan.plan_changes([path])['backend'])

    def test_unknown_paths_and_unavailable_diff_select_all_local_lanes(self):
        for paths, available in [(['new-area/file.py'], True), (['../outside'], True),
                                 (['/outside'], True), ([], False), (['scripts/ci-plan.py'], True),
                                 (['package.json'], True)]:
            with self.subTest(paths=paths, available=available):
                result = plan.plan_changes(paths, diff_available=available)
                self.assertTrue(all(result[key] for key in plan.FULL))

    def test_plans_have_no_ci_intent_or_network_dependent_fields(self):
        with patch.dict('os.environ', {'GITHUB_EVENT_NAME': 'push', 'GITHUB_REF': 'refs/heads/main'}, clear=True):
            result = plan.plan_changes(['src/Program.cs'])
        self.assertEqual(set(result), {*plan.FLAGS, 'paths', 'reason'})
        for obsolete in ('e2e', 'platforms', 'prerelease', 'dependencies', 'e2e_suite'):
            self.assertNotIn(obsolete, result)
        self.assertFalse(hasattr(plan, 'plan_release'))
        self.assertFalse(hasattr(plan, 'plan_with_evidence'))

    def test_cli_reads_only_local_diff_and_does_not_write_actions_outputs(self):
        with tempfile.TemporaryDirectory() as directory:
            output_file = Path(directory) / 'actions-output.txt'
            arguments = ['ci-plan.py', '--base', 'base', '--head', 'HEAD']
            with patch('sys.argv', arguments), patch.dict('os.environ', {'GITHUB_OUTPUT': str(output_file)}, clear=True), \
                    patch.object(plan, 'changed_paths', return_value=(['README.md'], True)) as changed, \
                    patch('sys.stdout', new_callable=io.StringIO) as output:
                plan.main()
            changed.assert_called_once_with('base', 'HEAD')
            result = json.loads(output.getvalue())
            self.assertEqual({flag for flag in plan.FLAGS if result[flag]}, {'docs'})
            self.assertFalse(output_file.exists())

    def test_cli_all_selects_every_local_lane(self):
        with patch('sys.argv', ['ci-plan.py', '--base', 'base', '--all']), \
                patch.object(plan, 'changed_paths', return_value=([], True)), \
                patch('sys.stdout', new_callable=io.StringIO) as output:
            plan.main()
        self.assertTrue(all(json.loads(output.getvalue())[key] for key in plan.FULL))

    def test_path_normalization_and_empty_diff(self):
        result = plan.plan_changes([r'tests\web\sample.test.mjs', 'tests/web/sample.test.mjs'])
        self.assertEqual(result['paths'], ['tests/web/sample.test.mjs'])
        self.assertTrue(result['web'])
        self.assertFalse(any(plan.plan_changes([])[key] for key in plan.FLAGS))

    def test_git_adapter_handles_deletion_rename_and_missing_refs(self):
        with patch.object(plan.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0, b'old.cs\0new.cs\0')):
            self.assertEqual(plan.changed_paths('base'), (['old.cs', 'new.cs'], True))
        with patch.object(plan.subprocess, 'run', side_effect=subprocess.CalledProcessError(1, 'git')):
            self.assertEqual(plan.changed_paths('missing'), ([], False))
        with patch.object(plan.subprocess, 'run') as run:
            self.assertEqual(plan.changed_paths('0' * 40), ([], False))
            run.assert_not_called()


if __name__ == '__main__':
    unittest.main()
