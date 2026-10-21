"""Version planning and build-workspace edits, without network or publication."""
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location('prepare_release', ROOT / 'scripts/prepare-release.py')
prepare = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(prepare)


class ReleaseVersionContracts(unittest.TestCase):
    def test_auto_uses_new_source_version_and_otherwise_increments_highest_stable_patch(self):
        for source, tags, expected in (
                ('0.4.0', [], '0.4.0'),
                ('0.4.0', ['v0.3.9'], '0.4.0'),
                ('0.4.0', ['v0.4.0'], '0.4.1'),
                ('0.4.0', ['v1.9.9', 'v1.10.1', 'unity-v1.10.2'], '1.10.3'),
                ('0.4.0', ['v2.0.0-beta.1', 'preview-99-1-aaaaaaaa', 'v01.0.0'], '0.4.0')):
            with self.subTest(source=source, tags=tags):
                self.assertEqual(prepare.resolve_version(source, tags), expected)

    def test_override_is_stable_canonical_and_above_every_existing_stable_tag(self):
        self.assertEqual(prepare.resolve_version('0.4.0', ['v0.4.0', 'unity-v0.4.1'], '0.5.0'), '0.5.0')
        for requested in ('0.4.0', '0.4.1', '0.3.9', 'v0.5.0', '0.5', '0.5.0-beta',
                          '00.5.0', '0.05.0', '0.5.00', '0.5.1٢', '0.5.0\nunsafe=x'):
            with self.subTest(requested=requested), self.assertRaises(ValueError):
                prepare.resolve_version('0.4.0', ['v0.4.0', 'unity-v0.4.1'], requested)
        with self.assertRaises(ValueError):
            prepare.resolve_version('1.0.0', [], '0.9.9')

    def test_notes_base_uses_highest_stable_and_prefers_canonical_tag_on_ties(self):
        self.assertEqual(prepare.previous_stable_tag(['v0.9.0', 'v0.10.0', 'unity-v1.0.0', 'preview-9']), 'unity-v1.0.0')
        self.assertEqual(prepare.previous_stable_tag(['unity-v1.0.0', 'v1.0.0']), 'v1.0.0')
        self.assertEqual(prepare.previous_stable_tag(['unity-v0.4.0', 'unity-v0.3.0']), 'unity-v0.4.0')
        self.assertEqual(prepare.previous_stable_tag(['v0.4.0-beta.1', 'preview-1']), '')


class BuildWorkspaceContracts(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)
        self.root = Path(self.folder.name)
        (self.root / 'src').mkdir()
        (self.root / 'unity/top.sealoong.sensa').mkdir(parents=True)
        self.package = {'name': 'sensa', 'version': '0.4.0', 'dependencies': {'unchanged': '1.0.0'}}
        (self.root / 'package.json').write_text(json.dumps(self.package), encoding='utf-8')
        (self.root / 'package-lock.json').write_text(json.dumps({
            'version': '0.4.0', 'lockfileVersion': 3,
            'packages': {'': self.package, 'node_modules/unchanged': {'version': '1.0.0'}}}), encoding='utf-8')
        (self.root / 'unity/top.sealoong.sensa/package.json').write_text(json.dumps({
            'name': 'top.sealoong.sensa', 'version': '0.4.0', 'vpmDependencies': {'other': '>=1.0.0'}}), encoding='utf-8')
        self.project = b'\xef\xbb\xbf<Project>\r\n  <PropertyGroup><Version>0.4.0</Version></PropertyGroup>\r\n</Project>\r\n'
        (self.root / 'src/Sensa.csproj').write_bytes(self.project)

    def test_apply_updates_all_build_identities_and_preserves_dependencies_and_project_encoding(self):
        self.assertEqual(prepare.repository_version(self.root), '0.4.0')
        with patch.object(prepare.subprocess, 'check_output', side_effect=AssertionError('No git or network during apply')):
            prepare.apply_version(self.root, '0.5.1')
        self.assertEqual(prepare.repository_version(self.root), '0.5.1')
        package = json.loads((self.root / 'package.json').read_text())
        lock = json.loads((self.root / 'package-lock.json').read_text())
        unity = json.loads((self.root / 'unity/top.sealoong.sensa/package.json').read_text())
        self.assertEqual(package['dependencies'], self.package['dependencies'])
        self.assertEqual(lock['packages']['node_modules/unchanged']['version'], '1.0.0')
        self.assertEqual(unity['vpmDependencies'], {'other': '>=1.0.0'})
        self.assertEqual((self.root / 'src/Sensa.csproj').read_bytes(), self.project.replace(b'0.4.0', b'0.5.1'))
        first = {path: path.read_bytes() for path in self.root.rglob('*') if path.is_file()}
        prepare.apply_version(self.root, '0.5.1')
        self.assertEqual({path: path.read_bytes() for path in first}, first)

    def test_mismatched_or_malformed_metadata_prevents_partial_apply(self):
        for relative, change in (
                ('package.json', lambda value: value.update(version='0.5.0')),
                ('package-lock.json', lambda value: value['packages'][''].update(version='0.5.0')),
                ('unity/top.sealoong.sensa/package.json', lambda value: value.update(version='not-a-version'))):
            destination = self.root / relative
            original = destination.read_bytes()
            value = json.loads(original)
            change(value)
            destination.write_text(json.dumps(value), encoding='utf-8')
            before = {path: path.read_bytes() for path in self.root.rglob('*') if path.is_file()}
            with self.subTest(relative=relative), self.assertRaises(ValueError):
                prepare.apply_version(self.root, '0.6.0')
            self.assertEqual({path: path.read_bytes() for path in before}, before)
            destination.write_bytes(original)

    def test_plan_pins_git_head_once_and_uses_existing_git_tags_for_version(self):
        calls = []
        def git(command, **options):
            calls.append((command, options))
            return 'a' * 40 + '\n' if command[1] == 'rev-parse' else 'v0.4.0\nunity-v0.4.1\n'
        with patch.object(prepare.subprocess, 'check_output', side_effect=git):
            stable = prepare.release_plan(self.root, 'stable')
            preview = prepare.release_plan(self.root, 'preview', environment={
                'GITHUB_RUN_NUMBER': '7', 'GITHUB_RUN_ATTEMPT': '2'})
        self.assertEqual(stable, {'commit': 'a' * 40, 'version': '0.4.2', 'tag': 'v0.4.2',
                                 'label': '', 'previous_tag': 'unity-v0.4.1'})
        self.assertEqual(preview, {'commit': 'a' * 40, 'version': '0.4.2', 'tag': 'preview-7-2-aaaaaaaa',
                                  'label': 'preview.7.2.aaaaaaaa', 'previous_tag': 'unity-v0.4.1'})
        self.assertEqual([command for command, _ in calls].count(['git', 'rev-parse', 'HEAD']), 2)
        self.assertTrue(all(options['cwd'] == self.root for _, options in calls))

    def test_plan_rejects_unidentified_commit_or_invalid_preview_attempt(self):
        with patch.object(prepare.subprocess, 'check_output', return_value='short\n'), self.assertRaises(ValueError):
            prepare.release_plan(self.root, 'stable')
        for environment in ({}, {'GITHUB_RUN_NUMBER': '1', 'GITHUB_RUN_ATTEMPT': '0'},
                            {'GITHUB_RUN_NUMBER': '1\nkey=value', 'GITHUB_RUN_ATTEMPT': '1'}):
            with patch.object(prepare.subprocess, 'check_output', side_effect=['a' * 40 + '\n', '']), \
                    self.subTest(environment=environment), self.assertRaises(ValueError):
                prepare.release_plan(self.root, 'preview', environment=environment)

    def test_cli_writes_only_resolved_safe_values_to_github_outputs(self):
        output = self.root / 'outputs'
        with patch.object(prepare, 'ROOT', self.root), \
                patch.object(prepare.subprocess, 'check_output', side_effect=['b' * 40 + '\n', 'v0.4.0\n']), \
                patch.dict(os.environ, {'GITHUB_OUTPUT': str(output)}):
            prepare.main(['--channel', 'stable', '--version', '0.5.0'])
        self.assertEqual(output.read_text(), 'commit=' + 'b' * 40 + '\nversion=0.5.0\ntag=v0.5.0\nlabel=\nprevious_tag=v0.4.0\n')


if __name__ == '__main__':
    unittest.main()
