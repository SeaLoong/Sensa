"""Electron archive identities and confined framework links; no app execution."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import stat
import tarfile
import tempfile
import unittest
from unittest.mock import patch
import zipfile

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location('desktop_release', ROOT / 'scripts/release.py')
release = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(release)


class DesktopReleaseContracts(unittest.TestCase):
    def setUp(self):
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        self.root = Path(folder.name)
        self.source = self.root / 'desktop'
        self.source.mkdir()
        (self.root / 'package.json').write_text(json.dumps({'version': '0.4.0', 'devDependencies': {'electron': '45.1.0'}}))
        scope = patch.object(release, 'ROOT', self.root)
        scope.start()
        self.addCleanup(scope.stop)

    def prepare(self, runtime='osx-arm64'):
        entry, cli, app = release.desktop_layout(runtime)
        for name, content in [(entry, b'electron fixture'), (cli, b'node SEA fixture'), (app, b'ASAR fixture')]:
            path = self.source / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(content)
        independent = self.root / 'artifacts/publish' / runtime / ('Sensa.exe' if runtime.startswith('win-') else 'Sensa')
        independent.parent.mkdir(parents=True, exist_ok=True)
        independent.write_bytes(b'node SEA fixture')
        (self.source / cli).with_name('BUILD-INFO.json').write_text(json.dumps({
            'version': '0.4.0', 'runtime': runtime, 'label': 'preview.1.1.aaaaaaaa', 'commit': 'a' * 40}))
        info = {'schema': 1, 'version': '0.4.0', 'runtime': runtime, 'label': 'preview.1.1.aaaaaaaa',
                'commit': 'a' * 40, 'entry': entry, 'electronVersion': '45.1.0',
                'cliSha256': hashlib.sha256(b'node SEA fixture').hexdigest()}
        (self.source / 'SENSA-DESKTOP-INFO.json').write_text(json.dumps(info))
        return info

    def validate(self, runtime='osx-arm64'):
        return release.validate_desktop(self.source, '0.4.0', runtime, 'preview.1.1.aaaaaaaa', 'a' * 40)

    def test_all_six_layouts_bind_desktop_to_independent_cli_bytes_and_source(self):
        for runtime in release.RUNTIMES:
            with self.subTest(runtime=runtime):
                self.prepare(runtime)
                entries = self.validate(runtime)
                self.assertTrue(any(name == 'SENSA-DESKTOP-INFO.json' for _, name, _, _ in entries))
                independent = self.root / 'artifacts/publish' / runtime / ('Sensa.exe' if runtime.startswith('win-') else 'Sensa')
                independent.write_bytes(b'changed CLI')
                with self.assertRaisesRegex(ValueError, 'independent native'):
                    self.validate(runtime)

    def test_manifest_cannot_change_version_source_entry_or_electron_identity(self):
        original = self.prepare()
        for key, wrong in [('version', '99.0.0'), ('commit', 'b' * 40), ('entry', '../outside'),
                           ('runtime', 'win-x64'), ('electronVersion', '0.0.0'), ('cliSha256', 'c' * 64)]:
            (self.source / 'SENSA-DESKTOP-INFO.json').write_text(json.dumps(original | {key: wrong}))
            with self.subTest(key=key), self.assertRaises(ValueError):
                self.validate()

    @unittest.skipIf(os.name == 'nt', 'POSIX framework symlink representation; exercised on the Linux checks runner')
    def test_relative_framework_aliases_remain_inside_app_and_preserve_archive_link_types(self):
        self.prepare()
        framework = self.source / 'Sensa.app/Contents/Frameworks/Example.framework'
        (framework / 'Versions/A').mkdir(parents=True)
        (framework / 'Versions/A/Example').write_bytes(b'framework fixture')
        (framework / 'Versions/Current').symlink_to('A', target_is_directory=True)
        (framework / 'Example').symlink_to('Versions/Current/Example')
        entries = self.validate()
        for suffix in ('zip', 'tar.gz'):
            output = self.root / ('desktop.' + suffix)
            release.archive_desktop(entries, output, suffix)
            name = 'Sensa.app/Contents/Frameworks/Example.framework/Versions/Current'
            if suffix == 'zip':
                with zipfile.ZipFile(output) as archive:
                    self.assertEqual(stat.S_IFMT(archive.getinfo(name).external_attr >> 16), stat.S_IFLNK)
                    self.assertEqual(archive.read(name), b'A')
            else:
                with tarfile.open(output) as archive:
                    self.assertTrue(archive.getmember(name).issym())
                    self.assertEqual(archive.getmember(name).linkname, 'A')

    @unittest.skipIf(os.name == 'nt', 'POSIX malformed symlink fixtures; exercised on the Linux checks runner')
    def test_escaping_missing_and_directory_cycle_links_are_rejected(self):
        outside = self.root / 'outside'
        outside.mkdir()
        path = self.source / 'alias'
        for target in (str(outside), '../outside', 'missing'):
            path.symlink_to(target, target_is_directory=True)
            with self.subTest(target=target), self.assertRaises(ValueError):
                release.desktop_entries(self.source)
            path.unlink()
        (self.source / 'A').mkdir()
        (self.source / 'B').mkdir()
        (self.source / 'A/link').symlink_to('../B', target_is_directory=True)
        (self.source / 'B/link').symlink_to('../A', target_is_directory=True)
        with self.assertRaisesRegex(ValueError, 'cycle'):
            release.desktop_entries(self.source)

    @unittest.skipIf(os.name == 'nt', 'POSIX symlink fixture; exercised on the Linux checks runner')
    def test_existing_cli_archiver_still_forbids_links(self):
        (self.source / 'directory').mkdir()
        (self.source / 'alias').symlink_to(self.source / 'directory', target_is_directory=True)
        with self.assertRaisesRegex(ValueError, 'symlinks'):
            release.archive_files(self.source)


if __name__ == '__main__':
    unittest.main()
