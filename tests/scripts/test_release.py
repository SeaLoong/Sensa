"""Archive, publication metadata and VPM history contracts.
压缩包、发布元数据与 VPM 历史契约；所有文件和网络适配器均隔离。
"""
import ast
import hashlib
from html.parser import HTMLParser
import importlib.util
import io
import json
import os
from pathlib import Path, PurePosixPath
import runpy
import shutil
import sys
import tarfile
import tempfile
import unittest
from unittest.mock import patch
import urllib.error
from urllib.parse import unquote, urlsplit
import xml.etree.ElementTree as ET
import zipfile

from test_bilingual_docs import relative_links

ROOT = Path(__file__).resolve().parents[2]
PARAMETER_GEOMETRY_FILES = (
    'docs/parameter-geometry.html',
    'docs/assets/osc-parameter-reference.js',
    'docs/assets/parameter-geometry-model.js',
    'docs/assets/parameter-geometry-view.js',
    'docs/assets/parameter-geometry-style.css',
    'docs/assets/parameter-geometry-3d.js',
    'docs/assets/parameter-geometry-3d.LICENSE.txt',
)


def load(name):
    spec = importlib.util.spec_from_file_location('release_contract_' + name, ROOT / 'scripts' / (name + '.py'))
    module = importlib.util.module_from_spec(spec)
    with patch.object(sys, 'path', [str(ROOT / 'scripts'), *sys.path]):
        spec.loader.exec_module(module)
    return module


release = load('release')
preview = load('publish-release')


class ArchiveWorkspace(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)
        self.root = Path(self.folder.name)
        self.repository = self.root / 'repository'
        self.repository.mkdir()
        for name in ('README.md', 'README.zh-CN.md', 'README.en.md', 'GLOSSARY.md', 'LICENSE', 'package.json'):
            shutil.copyfile(ROOT / name, self.repository / name)
        for directory in ('docs', 'unity/top.sealoong.sensa', 'tools/unity-world-lab', 'tools/unity-avatar-lab'):
            shutil.copytree(ROOT / directory, self.repository / directory)
        (self.repository / 'scripts').mkdir()
        for name in ('shader-osc-bridge.py', 'telemetry_qr.py', 'requirements-capture.txt'):
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

    def prepare_app(self, runtime='win-x64'):
        (self.source / ('Sensa.exe' if runtime.startswith('win-') else 'Sensa')).write_bytes(b'fixture apphost')
        (self.source / 'web/app.bundle.js').write_text('fixture bundle', encoding='utf-8')
        for relative in PARAMETER_GEOMETRY_FILES:
            destination = self.source / 'web' / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes((self.repository / relative).read_bytes())

    def app(self, runtime='win-x64'):
        self.prepare_app(runtime)
        self.package('app', '--tag', 'v' + self.version, '--runtime', runtime, '--source', str(self.source))
        archive = next(path for path in self.output.iterdir() if path.name.endswith(('.zip', '.tar.gz')))
        if archive.name.endswith('.zip'):
            with zipfile.ZipFile(archive) as stream:
                files = {name: stream.read(name) for name in stream.namelist()}
        else:
            with tarfile.open(archive) as stream:
                files = {item.name: stream.extractfile(item).read() for item in stream.getmembers() if item.isfile()}
        return archive, files


class AuthoringGeneratorContracts(ArchiveWorkspace):
    def test_rebuilding_authoring_assets_preserves_the_shipped_automatic_setup(self):
        script = self.repository / 'scripts/generate-pose-assets.py'
        shutil.copyfile(ROOT / 'scripts/generate-pose-assets.py', script)
        prefab = self.repository / 'unity/top.sealoong.sensa/Prefabs/SensaAutoSetup.prefab'
        shipped = prefab.read_text(encoding='utf-8')
        runpy.run_path(str(script), run_name='__main__')
        self.assertEqual(prefab.read_text(encoding='utf-8'), shipped)


class DesktopArchiveContracts(ArchiveWorkspace):
    @unittest.skipIf(os.name == 'nt', 'Creating test symlinks requires a Unix host')
    def test_guide_destination_symlink_is_rejected_before_copying_outside_source(self):
        self.prepare_app()
        outside = self.root / 'outside-guide.md'
        outside.write_bytes(b'leave this external file intact')
        (self.source / 'README.md').symlink_to(outside)
        with self.assertRaisesRegex(ValueError, 'symlinks'):
            self.package('app', '--tag', 'v' + self.version, '--source', str(self.source))
        self.assertEqual(outside.read_bytes(), b'leave this external file intact')
        self.assertFalse(any(self.output.glob('*.zip')))

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

    def test_build_identity_uses_resolved_source_instead_of_the_dispatch_commit(self):
        with patch.dict(os.environ, SENSA_SOURCE_COMMIT='b' * 40):
            _, files = self.app()
        self.assertEqual(json.loads(files['BUILD-INFO.json'])['commit'], 'b' * 40)

    def test_invalid_resolved_source_cannot_be_written_to_a_release_archive(self):
        self.prepare_app()
        for commit in ('main', 'abc1234', '../escape', 'z' * 40):
            with self.subTest(commit=commit), patch.dict(os.environ, SENSA_SOURCE_COMMIT=commit), \
                    self.assertRaisesRegex(ValueError, 'Source commit'):
                self.package('app', '--tag', 'v' + self.version, '--source', str(self.source))
        self.assertFalse(self.output.exists())

    def test_desktop_package_contains_both_languages_domain_docs_and_bridge_local_dependencies(self):
        _, files = self.app()
        required = ('README.md', 'README.en.md', 'GLOSSARY.md', 'docs/guide.md', 'docs/guide.en.md',
                    'docs/architecture.md', 'docs/architecture.en.md', 'docs/features.md', 'docs/features.en.md',
                    'docs/lab-workflow.md', 'docs/lab-workflow.en.md', 'docs/images/lab-flow-mobile.jpg',
                    'unity/top.sealoong.sensa/AUTOMATION.md', 'unity/top.sealoong.sensa/AUTOMATION.en.md',
                    'unity/top.sealoong.sensa/COMPATIBILITY.md', 'unity/top.sealoong.sensa/GPU-TRACKING.en.md',
                    'tools/unity-world-lab/README.md', 'tools/unity-world-lab/CAPABILITIES.en.md',
                    'tools/unity-avatar-lab/FULL-FLOW.en.md', 'tools/unity-world-lab/sensa-preview.json',
                    'scripts/shader-osc-bridge.py', 'scripts/telemetry_qr.py', 'scripts/requirements-capture.txt')
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

    def test_interactive_geometry_assets_keep_offline_references_without_packaging_arbitrary_code(self):
        required = PARAMETER_GEOMETRY_FILES
        unrelated = ('docs/unrelated.html', 'docs/assets/unrelated.js', 'docs/assets/unrelated.css',
                     'docs/assets/parameter-geometry-3d-source.js', 'docs/assets/unrelated.LICENSE.txt')
        for name in unrelated:
            path = self.repository / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text('unrelated executable documentation', encoding='utf-8')
        _, files = self.app()
        for name in required:
            with self.subTest(asset=name):
                self.assertEqual(files[name], (self.repository / name).read_bytes())
                self.assertEqual(files['web/' + name], files[name])
        for name in unrelated:
            self.assertNotIn(name, files)

        references = []
        class References(HTMLParser):
            def handle_starttag(self, tag, attrs):
                references.extend(value for key, value in attrs if key in ('href', 'src') and value)
        References().feed(files[required[0]].decode('utf-8'))
        resolved = set()
        for reference in references:
            location = urlsplit(reference)
            if location.scheme or location.netloc or not location.path:
                continue
            target = os.path.normpath(str(PurePosixPath('docs') / unquote(location.path))).replace('\\', '/')
            self.assertIn(target, files, f'Offline HTML reference missing / 离线 HTML 引用缺失: {reference}')
            resolved.add(target)
        runtime_resources = {name for name in required if name.endswith(('.js', '.css'))}
        self.assertTrue(runtime_resources.issubset(resolved), 'The HTML must load its local runtime scripts and stylesheet / HTML 必须加载本地运行脚本与样式')

    def test_missing_published_interactive_assets_are_rejected_before_creating_an_archive(self):
        for relative in PARAMETER_GEOMETRY_FILES:
            with self.subTest(asset=relative):
                self.prepare_app()
                (self.source / 'web' / relative).unlink()
                with self.assertRaisesRegex(ValueError, 'interactive document is missing or stale'):
                    self.package('app', '--tag', 'v' + self.version, '--source', str(self.source))
                self.assertFalse(any(self.output.glob('*.zip')))
                self.assertFalse((self.output / 'SHA256SUMS.txt').exists())

    def test_stale_published_interactive_assets_are_rejected_before_creating_an_archive(self):
        for relative in PARAMETER_GEOMETRY_FILES:
            with self.subTest(asset=relative):
                self.prepare_app()
                published = self.source / 'web' / relative
                published.write_bytes(published.read_bytes() + b'\nstale publish fixture')
                with self.assertRaisesRegex(ValueError, 'interactive document is missing or stale'):
                    self.package('app', '--tag', 'v' + self.version, '--source', str(self.source))
                self.assertFalse(any(self.output.glob('*.zip')))
                self.assertFalse((self.output / 'SHA256SUMS.txt').exists())

    def test_interactive_geometry_publish_items_preserve_the_static_web_paths(self):
        required = {
            '../docs/parameter-geometry.html': 'web/docs/parameter-geometry.html',
            '../docs/assets/osc-parameter-reference.js': 'web/docs/assets/osc-parameter-reference.js',
            '../docs/assets/parameter-geometry-model.js': 'web/docs/assets/parameter-geometry-model.js',
            '../docs/assets/parameter-geometry-view.js': 'web/docs/assets/parameter-geometry-view.js',
            '../docs/assets/parameter-geometry-style.css': 'web/docs/assets/parameter-geometry-style.css',
            '../docs/assets/parameter-geometry-3d.js': 'web/docs/assets/parameter-geometry-3d.js',
            '../docs/assets/parameter-geometry-3d.LICENSE.txt': 'web/docs/assets/parameter-geometry-3d.LICENSE.txt',
        }
        published = {}
        for item in ET.parse(ROOT / 'src/Sensa.csproj').getroot().iter('Content'):
            for source in item.get('Include', '').replace('\\', '/').split(';'):
                if not source.startswith('../docs/'):
                    continue
                self.assertNotIn('*', source, 'Executable docs use an exact asset list / 交互文档使用精确资源列表')
                name = PurePosixPath(source).name
                extension = PurePosixPath(source).suffix
                target = item.get('Link', '').replace('\\', '/').replace('%(Filename)', name[:-len(extension)]).replace('%(Extension)', extension)
                self.assertEqual(item.get('CopyToOutputDirectory'), 'PreserveNewest')
                self.assertEqual(item.get('CopyToPublishDirectory'), 'PreserveNewest')
                self.assertEqual(item.get('ExcludeFromSingleFile'), 'true')
                published[source] = target
        self.assertEqual(published, required)

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


class EnglishReleaseNotesContracts(unittest.TestCase):
    def test_preview_notes_lead_with_exact_installer_links_then_source_without_changes(self):
        module = load('release_notes')
        for version, run, attempt, sha in (('0.4.0', '42', '1', 'a' * 40),
                                           ('12.0.3', '123456', '7', '1234567890abcdef' * 2 + '12345678')):
            with self.subTest(version=version, run=run, attempt=attempt):
                tag = f'preview-{run}-{attempt}-{sha[:8]}'
                notes = module.compose_release_notes('preview', version, tag, sha,
                                                     'Owner/Repo', '## Changes\n\n* Fix a published issue')
                base = f'https://github.com/Owner/Repo/releases/download/{tag}/Sensa-{version}-preview.{run}.{attempt}.{sha[:8]}'
                self.assertEqual(notes,
                    'Windows installers (recommended) / Windows 安装器（推荐）: '
                    f'[x64]({base}-win-x64-Setup.exe) · [ARM64]({base}-win-arm64-Setup.exe)\n\n'
                    f'Source: [`{sha}`](https://github.com/Owner/Repo/commit/{sha})\n')
                self.assertNotIn('Changes', notes)
                self.assertNotIn('Fix a published issue', notes)

    def test_stable_notes_include_both_languages_and_the_automatic_changelog(self):
        module = load('release_notes')
        notes = module.compose_release_notes('stable', '0.4.0', 'v0.4.0', 'b' * 40,
                                             'Owner/Repo', '* Improve publishing (#42)')
        self.assertTrue(notes.startswith(
            'Windows installers (recommended) / Windows 安装器（推荐）: '
            '[x64](https://github.com/Owner/Repo/releases/download/v0.4.0/Sensa-0.4.0-win-x64-Setup.exe) · '
            '[ARM64](https://github.com/Owner/Repo/releases/download/v0.4.0/Sensa-0.4.0-win-arm64-Setup.exe)\n\n'))
        self.assertNotIn('preview.', notes)
        self.assertIn(f'Source commit: [`{"b" * 40}`](https://github.com/Owner/Repo/commit/{"b" * 40})', notes)
        self.assertIn('## 简体中文', notes)
        self.assertIn('127.0.0.1:5086', notes)
        self.assertIn('Improve publishing (#42)', notes)


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

    def test_combined_stable_release_uses_the_canonical_tag_for_vpm_downloads(self):
        self.package('unity', '--tag', 'v' + self.unity_version)
        archive = next(self.output.glob('*.zip'))
        manifest = json.loads((self.output / 'vpm-package.json').read_text(encoding='utf-8'))
        self.assertEqual(manifest['version'], self.unity_version)
        self.assertEqual(manifest['sha256'], hashlib.sha256(archive.read_bytes()).hexdigest())
        self.assertEqual(manifest['url'], f'https://github.com/Owner/Repo/releases/download/v{self.unity_version}/{archive.name}')


class ReproducibleArchiveContracts(unittest.TestCase):
    @unittest.skipIf(os.name == 'nt', 'Creating test symlinks requires a Unix host')
    def test_zip_and_tar_reject_external_file_and_directory_symlinks_before_writing(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            source = root / 'source'
            source.mkdir()
            outside = root / 'outside'
            outside.mkdir()
            (outside / 'secret.txt').write_bytes(b'outside bytes must not be packaged')
            for target in (outside / 'secret.txt', outside):
                link = source / 'public'
                link.symlink_to(target, target_is_directory=target.is_dir())
                for extension, package in (('zip', release.zip_directory), ('tar.gz', release.tar_directory)):
                    output = root / ('archive.' + extension)
                    with self.subTest(target=target, extension=extension), self.assertRaisesRegex(ValueError, 'symlinks'):
                        package(source, output)
                    self.assertFalse(output.exists())
                link.unlink()

    @unittest.skipIf(os.name == 'nt', 'Unsafe portable names are Unix-only filesystem fixtures')
    def test_zip_and_tar_reject_windows_traversal_stream_and_control_character_paths(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            source = root / 'source'
            source.mkdir()
            for name in ('nested\\..\\..\\outside.txt', 'C:payload.txt', 'line\nbreak.txt'):
                path = source / name
                path.write_bytes(b'payload')
                for extension, package in (('zip', release.zip_directory), ('tar.gz', release.tar_directory)):
                    output = root / ('archive.' + extension)
                    with self.subTest(name=name, extension=extension), self.assertRaisesRegex(ValueError, 'Unsafe archive path'):
                        package(source, output)
                    self.assertFalse(output.exists())
                path.unlink()

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
                checksums = f'{digest}  {name}\n'
                if runtime.startswith('win-'):
                    for kind in ('Setup', 'SingleFile'):
                        extra_name = f'Sensa-0.4.0-preview-{runtime}-{kind}.exe'
                        (directory / extra_name).write_bytes(kind.encode())
                        checksums += f'{hashlib.sha256(kind.encode()).hexdigest()}  {extra_name}\n'
                (directory / 'SHA256SUMS.txt').write_text(checksums, encoding='utf-8')
            self.assertEqual(len(preview.collect(root)), 11)
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

    def build(self, *, allow_empty=False):
        original = Path.cwd()
        try:
            os.chdir(self.root)
            with patch.dict(os.environ, GITHUB_REPOSITORY='Owner/Repo', PAGES_BASE_URL=self.base), \
                    patch('urllib.request.urlopen', side_effect=self.fetch), \
                    patch('subprocess.check_output', return_value=json.dumps(self.pages)) as query, \
                    patch('sys.argv', ['vpm-index.py', *(['--allow-empty'] if allow_empty else [])]):
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
        self.assertFalse((self.root / 'artifacts/pages/index.html').exists())

    def test_combined_stable_release_supplies_the_same_verified_vpm_history(self):
        legacy_host = self.host
        self.host = self.host.replace('/unity-v0.2.0', '/v0.2.0')
        self.release['tag_name'] = 'v0.2.0'
        self.current['url'] = self.current['url'].replace(legacy_host, self.host)
        for asset in self.release['assets']:
            asset['browser_download_url'] = asset['browser_download_url'].replace(legacy_host, self.host)
        self.responses[self.current['url']] = self.package
        index = self.build()
        self.assertEqual(set(index['packages']['top.sealoong.sensa']['versions']), {'0.1.0', '0.2.0'})
        self.assertEqual(index['packages']['top.sealoong.sensa']['versions']['0.2.0']['url'], self.current['url'])

    def test_canonical_tag_cannot_publish_a_manifest_for_another_version(self):
        self.release['tag_name'] = 'v0.3.0'
        with self.assertRaisesRegex(ValueError, 'identity'):
            self.build()

    def test_documentation_site_can_explicitly_publish_an_empty_stable_index(self):
        self.history = {}
        self.pages = []
        index = self.build(allow_empty=True)
        self.assertEqual(index['packages']['top.sealoong.sensa']['versions'], {})
        self.assertFalse((self.root / 'artifacts/pages/index.html').exists())

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
