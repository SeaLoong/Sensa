"""Exercise Pages artifact handoff using local tar fixtures; no browser or service."""
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location('pages_artifact', ROOT / 'scripts/verify-pages-artifact.py')
pages = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(pages)
COMMIT = 'a' * 40


class PagesArtifactTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.archive = self.root / 'artifact.tar'
        self.output = self.root / 'pages'
        self.receipt = self.root / 'evidence' / 'pages-artifact.json'

    def fixture(self, extra=(), *, manifest=None):
        manifest = {'commit': COMMIT, 'locales': ['zh', 'en']} if manifest is None else manifest
        entries = [('.', None), ('./index.html', b'<!doctype html><title>Sensa</title>'),
                   ('./site-manifest.json', json.dumps(manifest).encode()),
                   ('./assets', None), ('./assets/site.js', b'export const site = "Sensa";'), *extra]
        with tarfile.open(self.archive, 'w') as archive:
            for name, content in entries:
                info = name if isinstance(name, tarfile.TarInfo) else tarfile.TarInfo(name)
                if content is None and not isinstance(name, tarfile.TarInfo):
                    info.type = tarfile.DIRTYPE
                elif content is not None:
                    info.size = len(content)
                archive.addfile(info, io.BytesIO(content) if content is not None else None)
        return hashlib.sha256(self.archive.read_bytes()).hexdigest()

    def stage(self, **kwargs):
        options = dict(commit=COMMIT, sha256=pages.fingerprint(self.archive), artifact_id='123',
                       artifact_name='github-pages-456-2', receipt=self.receipt)
        options.update(kwargs)
        return pages.extract_archive(self.archive, self.output, **options)

    def assert_rejected(self, message, **kwargs):
        with self.assertRaisesRegex((ValueError, tarfile.TarError), message):
            self.stage(**kwargs)
        self.assertFalse(self.output.exists())
        self.assertFalse(self.receipt.exists())
        self.assertEqual(list(self.root.glob('.pages-*')), [])

    def test_stages_exact_archive_and_records_source_identity(self):
        digest = self.fixture()
        self.assertEqual(pages.fingerprint(self.archive), digest)
        evidence = self.stage()
        self.assertEqual(evidence, json.loads(self.receipt.read_text()))
        self.assertEqual(evidence['commit'], COMMIT)
        self.assertEqual(evidence['artifactId'], '123')
        self.assertEqual(evidence['artifactName'], 'github-pages-456-2')
        self.assertEqual(evidence['archiveSha256'], digest)
        self.assertEqual(evidence['siteManifestSha256'],
                         hashlib.sha256((self.output / 'site-manifest.json').read_bytes()).hexdigest())
        self.assertEqual(evidence['fileCount'], 3)
        self.assertEqual(evidence['totalBytes'], sum(file.stat().st_size for file in self.output.rglob('*') if file.is_file()))
        self.assertEqual((self.output / 'assets/site.js').read_bytes(), b'export const site = "Sensa";')

    def test_mismatched_bytes_and_source_fail_before_staging(self):
        self.fixture()
        self.assert_rejected('SHA-256 does not match', sha256='0' * 64)
        self.assert_rejected('manifest commit', commit='b' * 40)
        for manifest in ([], {'commit': 'main'}, {'locales': ['en']}):
            with self.subTest(manifest=manifest):
                self.fixture(manifest=manifest)
                self.assert_rejected('manifest commit')

    def test_requires_full_source_digest_and_unique_artifact_identity(self):
        self.fixture()
        for field, value in (('commit', 'main'), ('commit', 'a' * 39), ('sha256', 'abc'),
                             ('artifact_id', '0'), ('artifact_id', '-1'), ('artifact_id', '1\n'),
                             ('artifact_name', 'github-pages'), ('artifact_name', 'github-pages-1-0')):
            with self.subTest(field=field, value=value):
                self.assert_rejected('Pages', **{field: value})

    def test_rejects_path_escape_windows_paths_and_control_characters(self):
        for path in ('../outside', './assets/../../outside', '/outside', 'C:/outside',
                     'assets\\outside', './assets/../outside', 'assets/line\nbreak'):
            with self.subTest(path=path):
                self.fixture([(path, b'no')])
                self.assert_rejected('unsafe path')
        self.assertFalse((self.root / 'outside').exists())

    def test_rejects_links_devices_and_fifos_even_when_targets_are_inside(self):
        for kind in (tarfile.SYMTYPE, tarfile.LNKTYPE, tarfile.CHRTYPE, tarfile.BLKTYPE, tarfile.FIFOTYPE):
            with self.subTest(kind=kind):
                member = tarfile.TarInfo('assets/link')
                member.type = kind
                member.linkname = 'index.html'
                self.fixture([(member, None)])
                self.assert_rejected('regular files or directories')

    def test_rejects_duplicate_paths_and_file_directory_collisions(self):
        for entries, message in (([('index.html', b'replaced')], 'duplicate paths'),
                                 ([('./assets/site.js/child', b'no')], 'below a file'),
                                 ([('assets//site.js', b'replaced')], 'duplicate paths')):
            with self.subTest(entries=entries):
                self.fixture(entries)
                self.assert_rejected(message)

    def test_rejects_sparse_files_before_extraction(self):
        self.fixture()
        with patch.object(tarfile.TarInfo, 'issparse', return_value=True):
            self.assert_rejected('regular files or directories')

    def test_caps_archive_expansion_member_count_and_manifest_size(self):
        self.fixture()
        for constant, limit, message in (('MAX_ARCHIVE_BYTES', 100, 'archive size'),
                                         ('MAX_EXPANDED_BYTES', 10, 'expands'),
                                         ('MAX_MEMBERS', 2, 'too many entries'),
                                         ('MAX_MANIFEST_BYTES', 2, 'manifest is too large')):
            with self.subTest(constant=constant), patch.object(pages, constant, limit):
                # The expected hash is a trusted Build output, computed outside the limit check.
                with self.assertRaisesRegex(ValueError, message):
                    pages.extract_archive(self.archive, self.output, commit=COMMIT,
                                          sha256=hashlib.sha256(self.archive.read_bytes()).hexdigest(),
                                          artifact_id='123', artifact_name='github-pages-456-2', receipt=self.receipt)
                self.assertFalse(self.output.exists())
                self.assertFalse(self.receipt.exists())
                self.assertEqual(list(self.root.glob('.pages-*')), [])

    def test_requires_site_entrypoint_and_manifest(self):
        for missing in ('index.html', 'site-manifest.json'):
            self.fixture()
            with tarfile.open(self.archive) as archive:
                members = [member for member in archive if member.name != './' + missing]
                with self.assertRaisesRegex(ValueError, 'missing the regular file'):
                    pages.validate_members(members)

    def test_existing_output_or_receipt_is_never_overwritten(self):
        self.fixture()
        self.output.mkdir()
        marker = self.output / 'marker'
        marker.write_text('preserve')
        with self.assertRaisesRegex(ValueError, 'must not already exist'):
            self.stage()
        self.assertEqual(marker.read_text(), 'preserve')
        marker.unlink()
        self.output.rmdir()
        self.receipt.parent.mkdir()
        self.receipt.write_text('preserve')
        with self.assertRaisesRegex(ValueError, 'receipt must not already exist'):
            self.stage()
        self.assertEqual(self.receipt.read_text(), 'preserve')

    def test_symlink_archive_and_broken_output_are_rejected(self):
        self.fixture()
        alias = self.root / 'alias.tar'
        alias.symlink_to(self.archive)
        with self.assertRaisesRegex(ValueError, 'regular file'):
            pages.fingerprint(alias)
        self.output.symlink_to(self.root / 'absent')
        with self.assertRaisesRegex(ValueError, 'must not already exist'):
            self.stage()
        self.assertTrue(self.output.is_symlink())

    def test_malformed_tar_and_json_never_leave_a_site(self):
        self.archive.write_bytes(b'not a tar archive')
        self.assert_rejected('truncated|header')
        self.fixture()
        with patch.object(pages.json, 'loads', side_effect=ValueError('invalid JSON')):
            self.assert_rejected('invalid JSON')

    def test_cli_fingerprint_prints_only_digest(self):
        digest = self.fixture()
        with patch('sys.argv', ['verify-pages-artifact.py', 'fingerprint', '--archive', str(self.archive)]), \
                patch('sys.stdout', new_callable=io.StringIO) as output:
            pages.main()
        self.assertEqual(output.getvalue(), digest + '\n')


if __name__ == '__main__':
    unittest.main()
