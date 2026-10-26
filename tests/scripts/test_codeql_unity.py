"""Negative integrity, archive and source-coverage checks for the CodeQL helper."""
import argparse
import importlib.util
import io
import json
from pathlib import Path
import stat
import tarfile
import tempfile
import unittest
from unittest.mock import patch
import zipfile
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location('codeql_unity', ROOT / 'scripts/codeql-unity.py')
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class CodeQLUnityContracts(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='sensa-codeql-contract-')
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)

    def test_all_pinned_digests_and_size_are_required_before_reusing_an_archive(self):
        archive = self.root / 'input.zip'
        archive.write_bytes(b'actual package bytes')
        spec = {'bytes': archive.stat().st_size,
                **{algorithm: MODULE.digest(archive, algorithm) for algorithm in ['sha256', 'sha1', 'md5']}}
        self.assertTrue(MODULE.verify_archive(archive, spec))
        for key in spec:
            with self.subTest(field=key):
                changed = {**spec, key: spec[key] + 1 if key == 'bytes' else '0' * len(spec[key])}
                self.assertFalse(MODULE.verify_archive(archive, changed))
        archive.write_bytes(b'mutated package data')
        self.assertFalse(MODULE.verify_archive(archive, spec))

    def test_zip_rejects_traversal_links_and_case_collisions(self):
        for name in ['../escape.cs', '/absolute.cs', 'C:/drive.cs', r'folder\escape.cs']:
            with self.subTest(name=name):
                archive = self.root / 'hostile.zip'
                with zipfile.ZipFile(archive, 'w') as stream:
                    stream.writestr(name, 'not a valid package member')
                with self.assertRaises(ValueError):
                    MODULE.extract_package(archive, self.root / 'output', 'zip')
                self.assertFalse((self.root / 'escape.cs').exists())
        archive = self.root / 'link.zip'
        with zipfile.ZipFile(archive, 'w') as stream:
            member = zipfile.ZipInfo('link.cs')
            member.external_attr = (stat.S_IFLNK | 0o777) << 16
            stream.writestr(member, '../outside.cs')
        with self.assertRaises(ValueError):
            MODULE.extract_package(archive, self.root / 'output', 'zip')
        with zipfile.ZipFile(archive, 'w') as stream:
            stream.writestr('same.cs', 'first')
            stream.writestr('SAME.cs', 'second')
        with self.assertRaises(ValueError):
            MODULE.extract_package(archive, self.root / 'collision', 'zip')

    def test_tar_rejects_links_and_expansion_over_the_limit(self):
        archive = self.root / 'input.tgz'
        with tarfile.open(archive, 'w:gz') as stream:
            member = tarfile.TarInfo('link.cs')
            member.type = tarfile.SYMTYPE
            member.linkname = '../outside.cs'
            stream.addfile(member)
        with self.assertRaises(ValueError):
            MODULE.extract_package(archive, self.root / 'output', 'tar.gz')
        with tarfile.open(archive, 'w:gz') as stream:
            member = tarfile.TarInfo('ordinary.cs')
            member.size = 4
            stream.addfile(member, io.BytesIO(b'data'))
        with patch.object(MODULE, 'MAX_EXPANDED_BYTES', 3), self.assertRaises(ValueError):
            MODULE.extract_package(archive, self.root / 'limited', 'tar.gz')
        self.assertFalse((self.root / 'limited/ordinary.cs').exists())

    def test_source_plan_includes_new_nested_files_and_rejects_unmapped_assemblies(self):
        runtime = self.root / 'Runtime'
        runtime.mkdir()
        (runtime / 'Runtime.asmdef').write_text(json.dumps({'name': 'Runtime'}), encoding='utf-8')
        first = runtime / 'First.cs'
        first.write_text('class First {}', encoding='utf-8')
        nested = runtime / 'Nested'
        nested.mkdir()
        second = nested / 'Second.cs'
        second.write_text('class Second {}', encoding='utf-8')
        self.assertEqual(MODULE.sources(runtime, 'Runtime'), [first, second])
        (nested / 'Unexpected.asmdef').write_text(json.dumps({'name': 'Unexpected'}), encoding='utf-8')
        with self.assertRaises(ValueError):
            MODULE.sources(runtime, 'Runtime')
        self.assertEqual(MODULE.sources(runtime, 'Runtime', dependencies=True), [first])

    def test_tampered_prepared_dll_is_rejected_before_a_compiler_runs(self):
        prepared = self.root / 'prepared'
        prepared.mkdir()
        reference = prepared / 'Reference.dll'
        reference.write_bytes(b'original verified assembly')
        state = {'schema': 2, 'sourceLockSha256': MODULE.digest(MODULE.LOCK),
                 'sdkVersion': 'unused', 'references': {'avatar': {'Reference.dll': MODULE.digest(reference)}}}
        (prepared / 'prepared.json').write_text(json.dumps(state), encoding='utf-8')
        reference.write_bytes(b'tampered assembly')
        with patch.object(MODULE, 'compiler', side_effect=AssertionError('must not execute')):
            with self.assertRaisesRegex(ValueError, 'integrity'):
                MODULE.build(argparse.Namespace(prepared=prepared, dotnet='unused'))

    def test_prepared_manifest_cannot_reference_an_external_path(self):
        prepared = self.root / 'prepared'
        prepared.mkdir()
        with self.assertRaises(ValueError):
            MODULE.inside(prepared, '../Reference.dll')

    def test_both_labs_include_new_files_and_fail_on_new_assembly_definitions(self):
        for relative in ['tools/unity-avatar-lab/Editor', 'tools/unity-world-lab/Runtime',
                         'tools/unity-world-lab/Editor']:
            with self.subTest(directory=relative):
                directory = self.root / relative
                directory.mkdir(parents=True)
                source = directory / 'NewEditor.cs'
                source.write_text('class NewEditor {}', encoding='utf-8')
                plan = {'assembly': 'Assembly-CSharp-Editor', 'directories': [relative]}
                with patch.object(MODULE, 'ROOT', self.root):
                    self.assertEqual(MODULE.owned_sources(plan), [source])
                    (directory / 'Unexpected.asmdef').write_text('{"name":"Unexpected"}', encoding='utf-8')
                    with self.assertRaisesRegex(ValueError, 'new lab assembly'):
                        MODULE.owned_sources(plan)

    def test_owned_output_does_not_follow_replaced_generated_child_links(self):
        output = self.root / 'generated'
        MODULE.initialize_output(output)
        external = self.root / 'external'
        external.mkdir()
        try:
            (output / 'sdk').symlink_to(external, target_is_directory=True)
        except OSError as exc:
            self.skipTest('Creating a local symlink is unavailable: ' + str(exc))
        with self.assertRaisesRegex(ValueError, 'symbolic links'):
            MODULE.initialize_output(output)
        self.assertEqual(list(external.iterdir()), [])

    def test_reference_downloads_refuse_https_to_http_redirects(self):
        handler = MODULE.HttpsOnlyRedirect()
        request = urllib.request.Request('https://github.com/example/reference.zip')
        with self.assertRaisesRegex(ValueError, 'retain HTTPS'):
            handler.redirect_request(request, None, 302, '', {}, 'http://example.org/reference.zip')

    def test_an_unowned_output_directory_is_never_overwritten(self):
        output = self.root / 'existing'
        output.mkdir()
        user_file = output / 'keep.txt'
        user_file.write_text('keep this content', encoding='utf-8')
        with self.assertRaises(ValueError):
            MODULE.initialize_output(output)
        self.assertEqual(user_file.read_text(), 'keep this content')


if __name__ == '__main__':
    unittest.main()
