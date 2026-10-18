"""Archive, publication metadata and VPM history contracts.
压缩包、发布元数据与 VPM 历史契约；所有文件和网络适配器均隔离。
"""
import ast
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path, PurePosixPath
import runpy
import shutil
import tarfile
import tempfile
import unittest
from unittest.mock import patch
import urllib.error
import zipfile

from test_bilingual_docs import relative_links

ROOT = Path(__file__).resolve().parents[2]


def load(name):
    spec = importlib.util.spec_from_file_location('release_contract_' + name, ROOT / 'scripts' / (name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


release = load('release')
preview = load('publish-preview')


class ArchiveWorkspace(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)
        self.root = Path(self.folder.name)
        self.repository = self.root / 'repository'
        self.repository.mkdir()
        for name in ('README.md', 'README.en.md', 'GLOSSARY.md', 'LICENSE', 'package.json'):
            shutil.copyfile(ROOT / name, self.repository / name)
        for directory in ('docs', 'unity/top.sealoong.sensa', 'tools/unity-world-lab', 'tools/unity-avatar-lab'):
            shutil.copytree(ROOT / directory, self.repository / directory)
        (self.repository / 'scripts').mkdir()
        for name in ('shader-osc-bridge.py', 'requirements-capture.txt'):
            shutil.copyfile(ROOT / 'scripts' / name, self.repository / 'scripts' / name)
        self.source = self.root / 'app'
        (self.source / 'web').mkdir(parents=True)
        self.output = self.root / 'output'
        self.version = json.loads((self.repository / 'package.json').read_text(encoding='utf-8'))['version']
        self.unity_version = json.loads((self.repository / 'unity/top.sealoong.sensa/package.json').read_text(encoding='utf-8'))['version']
        repository_scope = patch.object(release, 'ROOT', self.repository)
        repository_scope.start()
        self.addCleanup(repository_scope.stop)

    def package(self, kind, *arguments):
        with patch.dict(os.environ, {'GITHUB_REPOSITORY': 'Owner/Repo', 'GITHUB_SHA': 'a' * 40}), \
                patch('sys.argv', ['release.py', kind, '--output', str(self.output), *arguments]):
            release.main()

    def app(self, runtime='win-x64'):
        (self.source / ('Sensa.exe' if runtime.startswith('win-') else 'Sensa')).write_bytes(b'fixture apphost')
        (self.source / 'web/app.bundle.js').write_text('fixture bundle', encoding='utf-8')
        self.package('app', '--tag', 'v' + self.version, '--runtime', runtime, '--source', str(self.source))
        archive = next(path for path in self.output.iterdir() if path.name.endswith(('.zip', '.tar.gz')))
        if archive.name.endswith('.zip'):
            with zipfile.ZipFile(archive) as stream:
                files = {name: stream.read(name) for name in stream.namelist()}
        else:
            with tarfile.open(archive) as stream:
                files = {item.name: stream.extractfile(item).read() for item in stream.getmembers() if item.isfile()}
        return archive, files


class DesktopArchiveContracts(ArchiveWorkspace):
    def test_every_runtime_has_a_complete_self_contained_archive_and_verified_build_identity(self):
        for runtime in release.RUNTIMES:
            with self.subTest(runtime=runtime):
                self.output = self.root / runtime
                self.source = self.root / 'publish' / runtime
                (self.source / 'web').mkdir(parents=True)
                archive, files = self.app(runtime)
                self.assertEqual(archive.name.endswith('.zip'), runtime.startswith('win-'))
                info = json.loads(files['BUILD-INFO.json'])
                self.assertEqual(info, {'version': self.version, 'runtime': runtime, 'label': '', 'commit': 'a' * 40})
                digest = hashlib.sha256(archive.read_bytes()).hexdigest()
                self.assertEqual((self.output / 'SHA256SUMS.txt').read_text(encoding='utf-8'), f'{digest}  {archive.name}\n')
                self.assertEqual(files['web/app.bundle.js'], b'fixture bundle')
                self.assertIn('Sensa.exe' if runtime.startswith('win-') else 'Sensa', files)

    def test_desktop_package_contains_both_languages_domain_docs_and_bridge_local_dependencies(self):
        _, files = self.app()
        required = ('README.md', 'README.en.md', 'GLOSSARY.md', 'docs/guide.md', 'docs/guide.en.md',
                    'docs/architecture.md', 'docs/architecture.en.md', 'docs/features.md', 'docs/features.en.md',
                    'docs/lab-workflow.md', 'docs/lab-workflow.en.md', 'docs/images/lab-flow-mobile.jpg',
                    'unity/top.sealoong.sensa/AUTOMATION.md', 'unity/top.sealoong.sensa/AUTOMATION.en.md',
                    'unity/top.sealoong.sensa/COMPATIBILITY.md', 'unity/top.sealoong.sensa/GPU-TRACKING.en.md',
                    'tools/unity-world-lab/README.md', 'tools/unity-world-lab/CAPABILITIES.en.md',
                    'tools/unity-avatar-lab/FULL-FLOW.en.md', 'tools/unity-world-lab/sensa-preview.json',
                    'scripts/shader-osc-bridge.py', 'scripts/requirements-capture.txt')
        for name in required:
            with self.subTest(asset=name):
                self.assertEqual(files[name], (self.repository / name).read_bytes())
        for name, contents in files.items():
            if not name.startswith('scripts/') or not name.endswith('.py'):
                continue
            tree = ast.parse(contents.decode('utf-8'), filename=name)
            for node in ast.walk(tree):
                imports = ([alias.name for alias in node.names] if isinstance(node, ast.Import)
                           else [node.module] if isinstance(node, ast.ImportFrom) and node.module else [])
                for module in imports:
                    local = 'scripts/' + module.split('.')[0] + '.py'
                    if (ROOT / local).is_file():
                        self.assertIn(local, files, f'{name} needs local module / 需要本地模块: {local}')

    def test_packaged_public_documentation_links_work_without_a_source_checkout(self):
        _, files = self.app()
        public_pages = [name for name in files if name.endswith('.md') and not name.startswith('docs/agents/')]
        missing = []
        for name in public_pages:
            for link in relative_links(files[name].decode('utf-8')):
                resolved = os.path.normpath(str(PurePosixPath(name).parent / link)).replace('\\', '/')
                if resolved not in files and not any(path.startswith(resolved.rstrip('/') + '/') for path in files):
                    missing.append(f'{name}: {link}')
        self.assertEqual(len(missing), 0, f'Broken offline documentation links / 离线文档链接失效 ({len(missing)}):\n' + '\n'.join(sorted(set(missing))[:30]))

    def test_backend_only_output_without_browser_bundle_is_not_a_publishable_desktop_candidate(self):
        (self.source / 'Sensa.exe').write_bytes(b'backend-only fixture')
        (self.source / 'web/index.html').write_text('shell', encoding='utf-8')
        (self.source / 'web/styles.css').write_text('styles', encoding='utf-8')
        with self.assertRaisesRegex(ValueError, 'incomplete'):
            self.package('app', '--tag', 'v' + self.version, '--source', str(self.source))
        self.assertFalse(any(self.output.glob('*.zip')))
        self.assertFalse((self.output / 'SHA256SUMS.txt').exists())

    def test_version_mismatch_and_unsafe_tags_or_build_labels_never_create_release_assets(self):
        for tag in ('v99.0.0', 'v../../escape', 'v0.4', '0.4.0'):
            with self.subTest(tag=tag), self.assertRaises(ValueError):
                self.package('app', '--tag', tag, '--source', str(self.source))
        for label in ('../escape', 'has space', 'x' * 97):
            with self.subTest(label=label), self.assertRaises(ValueError):
                self.package('unity', '--tag', 'unity-v' + self.unity_version, '--label', label)
        self.assertFalse(self.output.exists())


class UnityPublicationMetadataContracts(ArchiveWorkspace):
    def test_preview_unity_candidate_never_advertises_a_stable_vpm_package(self):
        metadata = self.root / 'outputs.txt'
        with patch.dict(os.environ, GITHUB_OUTPUT=str(metadata)):
            self.package('unity', '--tag', 'unity-v' + self.unity_version, '--label', 'manual.42.test')
        self.assertIn('stable=false', metadata.read_text(encoding='utf-8'))
        self.assertFalse((self.output / 'vpm-package.json').exists())
        self.assertEqual(len(list(self.output.glob('*-manual.42.test.zip'))), 1)
        notes = (self.repository / 'artifacts/release-notes.txt').read_text(encoding='utf-8')
        self.assertIn('Unity VPM package', notes)
        self.assertIn('Unity VPM 资产包', notes)

    def test_stable_unity_metadata_identifies_the_exact_archive_and_preserves_source_manifest(self):
        manifest_path = self.repository / 'unity/top.sealoong.sensa/package.json'
        original = manifest_path.read_bytes()
        metadata = self.root / 'outputs.txt'
        with patch.dict(os.environ, GITHUB_OUTPUT=str(metadata)):
            self.package('unity', '--tag', 'unity-v' + self.unity_version)
        self.assertIn('stable=true', metadata.read_text(encoding='utf-8'))
        archive = next(self.output.glob('*.zip'))
        manifest = json.loads((self.output / 'vpm-package.json').read_text(encoding='utf-8'))
        self.assertEqual(manifest['version'], self.unity_version)
        self.assertEqual(manifest['sha256'], hashlib.sha256(archive.read_bytes()).hexdigest())
        self.assertEqual(manifest['url'], f'https://github.com/Owner/Repo/releases/download/unity-v{self.unity_version}/{archive.name}')
        self.assertEqual(manifest_path.read_bytes(), original)


class ReproducibleArchiveContracts(unittest.TestCase):
    def test_zip_and_unix_archives_are_reproducible_filter_hidden_files_and_preserve_launcher_mode(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            source = root / 'source'
            source.mkdir()
            (source / 'Sensa').write_bytes(b'apphost')
            (source / 'README.md').write_bytes(b'guide')
            (source / '.secret').write_bytes(b'excluded')
            (source / 'nested').mkdir()
            (source / 'nested/data.txt').write_bytes(b'fixture')
            for extension, package in (('zip', release.zip_directory), ('tar.gz', release.tar_directory)):
                with self.subTest(extension=extension):
                    first, second = root / ('first.' + extension), root / ('second.' + extension)
                    package(source, first)
                    package(source, second)
                    self.assertEqual(first.read_bytes(), second.read_bytes())
                    if extension == 'zip':
                        with zipfile.ZipFile(first) as archive:
                            self.assertNotIn('.secret', archive.namelist())
                            self.assertEqual(archive.read('nested/data.txt'), b'fixture')
                    else:
                        with tarfile.open(first) as archive:
                            self.assertEqual(archive.getmember('Sensa').mode, 0o755)
                            self.assertNotIn('.secret', archive.getnames())
                            self.assertEqual(archive.extractfile('nested/data.txt').read(), b'fixture')

    def test_preview_requires_one_archive_per_runtime_and_unity_with_valid_checksums(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            with self.assertRaises(ValueError):
                preview.collect(root)
            for runtime in (*preview.RUNTIMES, 'unity'):
                directory = root / runtime
                directory.mkdir()
                name = ('top.sealoong.sensa-0.4.0-preview.zip' if runtime == 'unity' else
                        'Sensa-0.4.0-preview-' + runtime + ('.zip' if runtime.startswith('win-') else '.tar.gz'))
                (directory / name).write_bytes(runtime.encode())
                digest = hashlib.sha256(runtime.encode()).hexdigest()
                (directory / 'SHA256SUMS.txt').write_text(f'{digest}  {name}\n', encoding='utf-8')
            self.assertEqual(len(preview.collect(root)), 7)
            duplicate = root / 'extra'
            duplicate.mkdir()
            (duplicate / 'Sensa-0.4.0-preview-win-x64.zip').write_bytes(b'duplicate')
            with self.assertRaises(ValueError):
                preview.collect(root)
            (duplicate / 'Sensa-0.4.0-preview-win-x64.zip').unlink()
            (root / 'linux-x64/Sensa-0.4.0-preview-linux-x64.tar.gz').write_bytes(b'corrupt')
            with self.assertRaisesRegex(ValueError, 'Checksum'):
                preview.collect(root)


class VpmHistoryContracts(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)
        self.root = Path(self.folder.name)
        (self.root / '.github/pages').mkdir(parents=True)
        (self.root / '.github/pages/index.html').write_text('version=__VERSION__', encoding='utf-8')
        self.package = b'fixture zip bytes'
        digest = hashlib.sha256(self.package).hexdigest()
        self.base = 'https://Owner.github.io/Repo'
        self.host = 'https://github.com/Owner/Repo/releases/download/unity-v0.2.0'
        self.current = {'name': 'top.sealoong.sensa', 'version': '0.2.0', 'url': self.host + '/package.zip', 'sha256': digest}
        self.previous = dict(self.current, version='0.1.0', url=self.base + '/packages/top.sealoong.sensa/0.1.0/top.sealoong.sensa.zip')
        self.release = {'draft': False, 'prerelease': False, 'tag_name': 'unity-v0.2.0', 'assets': [
            {'name': 'vpm-package.json', 'browser_download_url': self.host + '/vpm-package.json'},
            {'name': 'package.zip', 'browser_download_url': self.current['url']}]}
        self.pages = [[self.release]]
        self.history = {'packages': {'top.sealoong.sensa': {'versions': {'0.1.0': self.previous}}}}
        self.responses = {self.current['url']: self.package, self.previous['url']: self.package}
        self.requested = []

    def fetch(self, url, **_):
        self.requested.append(url)
        if url == self.host + '/vpm-package.json':
            return io.BytesIO(json.dumps(self.current).encode())
        if url == self.base + '/vpm.json':
            return io.BytesIO(json.dumps(self.history).encode())
        return io.BytesIO(self.responses[url])

    def build(self):
        original = Path.cwd()
        try:
            os.chdir(self.root)
            with patch.dict(os.environ, GITHUB_REPOSITORY='Owner/Repo', PAGES_BASE_URL=self.base), \
                    patch('urllib.request.urlopen', side_effect=self.fetch), \
                    patch('subprocess.check_output', return_value=json.dumps(self.pages)) as query:
                runpy.run_path(str(ROOT / 'scripts/vpm-index.py'))
            command = query.call_args.args[0]
            self.assertIn('--paginate', command)
            self.assertIn('--slurp', command)
            return json.loads((self.root / 'artifacts/pages/vpm.json').read_text(encoding='utf-8'))
        finally:
            os.chdir(original)

    def test_verified_release_and_historical_package_survive_without_previews_or_drafts(self):
        self.pages += [[dict(self.release, draft=True, assets=[]), dict(self.release, prerelease=True, assets=[])]]
        index = self.build()
        versions = index['packages']['top.sealoong.sensa']['versions']
        self.assertEqual(set(versions), {'0.1.0', '0.2.0'})
        copied = self.root / 'artifacts/pages/packages/top.sealoong.sensa/0.1.0/top.sealoong.sensa.zip'
        self.assertEqual(copied.read_bytes(), self.package)
        self.assertEqual(versions['0.1.0']['url'], self.previous['url'])
        self.assertEqual((self.root / 'artifacts/pages/index.html').read_text(encoding='utf-8'), 'version=0.2.0')

    def test_corrupt_current_or_historical_archive_aborts_index_generation(self):
        for location in (self.current['url'], self.previous['url']):
            with self.subTest(location=location):
                self.responses[location] = b'corrupt'
                with self.assertRaisesRegex(ValueError, 'checksum'):
                    self.build()
                self.responses[location] = self.package
                self.assertFalse((self.root / 'artifacts/pages/vpm.json').exists())

    def test_manifest_identity_and_duplicate_versions_cannot_replace_verified_history(self):
        self.current['name'] = 'unexpected.package'
        with self.assertRaisesRegex(ValueError, 'identity'):
            self.build()
        self.current['name'] = 'top.sealoong.sensa'
        self.pages.append([self.release])
        with self.assertRaisesRegex(ValueError, 'Duplicate'):
            self.build()

    def test_foreign_historical_host_is_rejected_before_downloading_and_empty_index_is_never_deployed(self):
        self.previous['url'] = 'https://untrusted.test/package.zip'
        with self.assertRaisesRegex(ValueError, 'Unrecognized'):
            self.build()
        self.assertNotIn(self.previous['url'], self.requested)
        self.history = {}
        self.pages = []
        with self.assertRaisesRegex(ValueError, 'empty'):
            self.build()
        self.assertFalse((self.root / 'artifacts/pages/vpm.json').exists())


if __name__ == '__main__':
    unittest.main()
