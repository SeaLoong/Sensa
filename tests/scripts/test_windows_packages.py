"""Windows distribution contracts with isolated files and fake process adapters."""
import importlib.util
import os
from pathlib import Path
import shutil
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[2]


def load(name):
    spec = importlib.util.spec_from_file_location('windows_package_' + name, ROOT / 'scripts' / (name + '.py'))
    module = importlib.util.module_from_spec(spec)
    with patch.object(sys, 'path', [str(ROOT / 'scripts'), *sys.path]):
        spec.loader.exec_module(module)
    return module


release = load('release')
build = load('build-platform')
installer = load('build-windows-installer')
installer_smoke = load('smoke-windows-installer')


class WindowsPackageContracts(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.source = self.root / 'single'
        self.source.mkdir()
        (self.source / 'Sensa.exe').write_bytes(b'MZ fixture self-contained bundle')
        self.output = self.root / 'output'
        self.output.mkdir()

    def test_single_exe_is_copied_without_an_archive_and_combines_platform_checksums(self):
        (self.output / 'Sensa-0.4.0-win-x64.zip').write_bytes(b'portable')
        destination = release.single_file(self.source, self.output, '0.4.0-preview.42.1.aaaaaaaa', 'win-x64')
        self.assertEqual(destination.name, 'Sensa-0.4.0-preview.42.1.aaaaaaaa-win-x64-SingleFile.exe')
        self.assertEqual(destination.read_bytes(), (self.source / 'Sensa.exe').read_bytes())
        self.assertEqual(len((self.output / 'SHA256SUMS.txt').read_text().splitlines()), 2)

    def test_single_file_packaging_rejects_sidecars_and_non_windows_targets(self):
        for extra in ('Sensa.dll', 'web/index.html', '.hidden'):
            path = self.source / extra
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(b'sidecar')
            with self.subTest(extra=extra), self.assertRaisesRegex(ValueError, 'only Sensa.exe'):
                release.single_file(self.source, self.output, '0.4.0', 'win-x64')
            path.unlink()
            if path.parent != self.source: path.parent.rmdir()
        with self.assertRaisesRegex(ValueError, 'Windows'):
            release.single_file(self.source, self.output, '0.4.0', 'linux-x64')
        self.assertFalse(list(self.output.glob('*.exe')))

    def test_installer_payload_contains_complete_guides_but_never_a_prior_configuration_or_runtime_sidecars(self):
        portable = self.root / 'portable'
        portable.mkdir()
        for name in installer.GUIDE_FILES:
            (portable / name).write_text(name, encoding='utf-8')
        for name in installer.GUIDE_DIRECTORIES:
            (portable / name).mkdir()
            (portable / name / 'guide.txt').write_text(name, encoding='utf-8')
        for name in release.PROTOCOL_BRIDGE_ASSETS:
            path = portable / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes((ROOT / name).read_bytes())
        for name in ('config.json', 'Sensa.dll'):
            (portable / name).write_text('do not include', encoding='utf-8')
        (portable / 'docs/.hidden').write_text('do not include hidden data', encoding='utf-8')
        (portable / 'recordings').mkdir()
        payload = self.root / 'payload'
        installer.prepare_payload(portable, self.source / 'Sensa.exe', payload)
        self.assertEqual((payload / 'Sensa.exe').read_bytes(), (self.source / 'Sensa.exe').read_bytes())
        self.assertEqual({item.name for item in payload.iterdir()}, {'Sensa.exe', *installer.GUIDE_FILES, *installer.GUIDE_DIRECTORIES})
        self.assertEqual((payload / 'docs/guide.txt').read_text(), 'docs')
        self.assertFalse((payload / 'docs/.hidden').exists())
        for name in release.PROTOCOL_BRIDGE_ASSETS:
            self.assertEqual((payload / name).read_bytes(), (ROOT / name).read_bytes())

    def test_windows_ci_builds_smokes_and_packages_both_standalone_and_installed_binaries(self):
        for runtime in ('win-x64', 'win-arm64'):
            with self.subTest(runtime=runtime), patch.dict(os.environ, GITHUB_ACTIONS='true', SENSA_ISCC='verified/ISCC.exe'), \
                    patch.object(build, 'ROOT', self.root), \
                    patch.object(build.subprocess, 'run') as run, \
                    patch.object(sys, 'argv', ['build-platform.py', '--runtime', runtime, '--version', '0.4.0', '--smoke', '--windows-extras']):
                build.main()
            commands = [call.args[0] for call in run.call_args_list]
            self.assertEqual(len(commands), 8)
            self.assertIn('--self-contained', commands[3])
            self.assertEqual(commands[3][commands[3].index('--self-contained') + 1], 'true')
            self.assertIn('-p:PublishSingleFile=true', commands[3])
            self.assertEqual(commands[4][1:3], ('scripts/release.py', 'single-file'))
            self.assertEqual(commands[5][1], 'scripts/smoke.py')
            self.assertIn('publish-single', commands[5][commands[5].index('--exe') + 1])
            self.assertEqual(commands[6][1], 'scripts/build-windows-installer.py')
            self.assertEqual(commands[7][1], 'scripts/smoke-windows-installer.py')

    def test_windows_extras_fail_before_any_build_without_the_pinned_compiler(self):
        for runtime in ('win-x64', 'linux-x64'):
            with self.subTest(runtime=runtime), patch.dict(os.environ, SENSA_ISCC=''), \
                    patch.object(build.subprocess, 'run') as run, \
                    patch.object(sys, 'argv', ['build-platform.py', '--runtime', runtime, '--version', '0.4.0', '--windows-extras']), \
                    self.assertRaisesRegex(ValueError, 'SENSA_ISCC'):
                build.main()
            run.assert_not_called()

    def test_installer_compiler_receives_the_matching_architecture_and_preview_identity(self):
        portable = self.root / 'portable'
        portable.mkdir()
        for name in installer.GUIDE_FILES: (portable / name).write_text(name, encoding='utf-8')
        for name in installer.GUIDE_DIRECTORIES: (portable / name).mkdir()
        commands = []
        def fake_compile(command, **options):
            commands.append(command)
            output = Path(next(value[2:] for value in command if value.startswith('/O')))
            name = next(value[2:] for value in command if value.startswith('/F'))
            (output / (name + '.exe')).write_bytes(b'MZ fixture installer')
        with patch.object(installer, 'ROOT', self.root), patch.object(installer.subprocess, 'run', side_effect=fake_compile), \
                patch.object(sys, 'argv', ['build-windows-installer.py', '--runtime', 'win-arm64', '--version', '0.4.0',
                    '--label', 'preview.42.1.aaaaaaaa', '--portable', str(portable), '--single-file', str(self.source / 'Sensa.exe'),
                    '--output', str(self.output), '--compiler', 'verified/ISCC.exe']):
            installer.main()
        self.assertIn('/DTargetArch=arm64', commands[0])
        self.assertIn('/DAppVersion=0.4.0', commands[0])
        self.assertIn('/DAppDisplayVersion=0.4.0-preview.42.1.aaaaaaaa', commands[0])
        self.assertTrue((self.output / 'Sensa-0.4.0-preview.42.1.aaaaaaaa-win-arm64-Setup.exe').is_file())
        self.assertIn('win-arm64-Setup.exe', (self.output / 'SHA256SUMS.txt').read_text())

    def test_installer_smoke_cannot_install_anything_outside_actions(self):
        with patch.dict(os.environ, GITHUB_ACTIONS='false'), patch.object(installer_smoke.subprocess, 'run') as run, \
                self.assertRaisesRegex(RuntimeError, 'GitHub Actions'):
            installer_smoke.verify_installer(self.source / 'Sensa.exe', self.source / 'Sensa.exe', self.root / 'report')
        run.assert_not_called()

    def test_uninstaller_cleanup_waits_for_delayed_self_removal(self):
        uninstaller = self.root / 'unins000.exe'
        uninstaller.write_bytes(b'helper still running')
        elapsed = [0.0]
        def sleep(interval):
            elapsed[0] += interval
            if elapsed[0] >= .15:
                uninstaller.unlink()
        installer_smoke.wait_for_uninstaller(uninstaller, timeout=1,
                                            clock=lambda: elapsed[0], sleep=sleep)
        self.assertGreaterEqual(elapsed[0], .15)
        self.assertFalse(uninstaller.exists())

    def test_uninstaller_cleanup_fails_if_helper_never_finishes(self):
        uninstaller = self.root / 'unins000.exe'
        uninstaller.write_bytes(b'helper still running')
        elapsed = [0.0]
        def sleep(interval):
            elapsed[0] += interval
        with self.assertRaisesRegex(AssertionError, 'Uninstaller self-removal did not finish'):
            installer_smoke.wait_for_uninstaller(uninstaller, timeout=.1,
                                                clock=lambda: elapsed[0], sleep=sleep)
        self.assertGreaterEqual(elapsed[0], .1)
        self.assertLess(elapsed[0], .2)
        self.assertEqual(uninstaller.read_bytes(), b'helper still running')

    def test_installer_smoke_checks_the_installed_binary_reinstall_and_data_preserving_uninstall(self):
        setup = self.root / 'Setup.exe'
        setup.write_bytes(b'fixture setup')
        calls = []
        def fake_run(command, **options):
            calls.append(command)
            if command[0] == str(setup.resolve()):
                directory = Path(next(value.removeprefix('/DIR=') for value in command if value.startswith('/DIR=')))
                directory.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(self.source / 'Sensa.exe', directory / 'Sensa.exe')
                for name in ('docs/parameter-geometry.html', 'scripts/shader-osc-bridge.py', 'scripts/telemetry_qr.py', 'LICENSE', 'unins000.exe'):
                    path = directory / name
                    path.parent.mkdir(parents=True, exist_ok=True)
                    path.write_bytes(b'fixture offline file')
                for name in release.PROTOCOL_BRIDGE_ASSETS:
                    path = directory / name
                    path.parent.mkdir(parents=True, exist_ok=True)
                    path.write_bytes((ROOT / name).read_bytes())
            elif Path(command[0]).name == 'unins000.exe':
                directory = Path(command[0]).parent
                for path in tuple(directory.iterdir()):
                    if path.name in ('config.json', 'recordings', 'unins000.exe'): continue
                    if path.is_dir(): shutil.rmtree(path)
                    else: path.unlink()
            else:
                self.assertEqual(Path(command[1]).name, 'smoke.py')
                self.assertNotIn('--open-browser=true', command)
        wait_for_uninstaller = installer_smoke.wait_for_uninstaller
        def finish_self_removal(uninstaller):
            self.assertTrue(uninstaller.is_file())
            wait_for_uninstaller(uninstaller, sleep=lambda _: uninstaller.unlink())
        with patch.dict(os.environ, GITHUB_ACTIONS='true'), \
                patch.object(installer_smoke, 'os', SimpleNamespace(name='nt')), \
                patch.object(installer_smoke.subprocess, 'run', side_effect=fake_run), \
                patch.object(installer_smoke, 'wait_for_uninstaller', side_effect=finish_self_removal) as wait:
            installer_smoke.verify_installer(setup, self.source / 'Sensa.exe', self.root / 'report')
        wait.assert_called_once()
        self.assertEqual(len(calls), 4)
        self.assertEqual([Path(command[0]).name for command in calls], ['Setup.exe', Path(sys.executable).name, 'Setup.exe', 'unins000.exe'])
        self.assertTrue((self.root / 'report/result.txt').is_file())

    def test_single_file_project_embeds_the_exact_web_and_offline_document_allowlist(self):
        project = ET.parse(ROOT / 'src/Sensa.csproj').getroot()
        group = next(item for item in project.findall('ItemGroup') if item.get('Condition') == "'$(PublishSingleFile)' == 'true'")
        resources = {}
        for item in group.findall('EmbeddedResource'):
            for source in item.get('Include').split(';'):
                name = Path(source).name
                resources[source] = item.get('LogicalName').replace('%(Filename)%(Extension)', name)
        self.assertEqual(set(resources), {
            'web/index.html', 'web/styles.css', 'web/app.bundle.js', 'web/app.bundle.js.LEGAL.txt', 'web/realtime-worker.bundle.js',
            'websensa/index.html', 'websensa/app.bundle.js', 'websensa/app.bundle.css', 'websensa/app.bundle.js.LEGAL.txt',
            '../docs/parameter-geometry.html', '../docs/assets/osc-parameter-reference.js', '../docs/assets/parameter-geometry-model.js',
            '../docs/assets/parameter-geometry-view.js', '../docs/assets/parameter-geometry-signal.js', '../docs/assets/parameter-geometry-style.css',
            '../docs/assets/parameter-geometry-3d.js', '../docs/assets/parameter-geometry-3d.LICENSE.txt'})
        self.assertEqual(resources['../docs/assets/parameter-geometry-model.js'], 'Sensa.Web.docs.assets.parameter-geometry-model.js')
        self.assertNotIn('IncludeAllContentForSelfExtract', (ROOT / 'src/Sensa.csproj').read_text(encoding='utf-8-sig'))

    def test_installer_is_per_user_and_preserves_user_generated_data(self):
        text = (ROOT / 'installer/Sensa.iss').read_text(encoding='utf-8')
        for directive in ('PrivilegesRequired=lowest', 'DefaultDirName={localappdata}\\Programs\\Sensa', 'skipifsilent'):
            self.assertIn(directive, text)
        self.assertNotIn('[UninstallDelete]', text)
        self.assertNotIn('runascurrentuser', text)

    def test_bootstrap_pins_official_compiler_bytes_and_checks_signature_before_execution(self):
        text = (ROOT / 'scripts/install-inno-setup.ps1').read_text(encoding='utf-8')
        self.assertIn('https://github.com/jrsoftware/issrc/releases/download/is-6_7_3/', text)
        self.assertIn('9c73c3bae7ed48d44112a0f48e66742c00090bdb5bef71d9d3c056c66e97b732', text)
        self.assertLess(text.index('Get-FileHash'), text.index('Start-Process'))
        self.assertLess(text.index('Get-AuthenticodeSignature'), text.index('Start-Process'))
        self.assertIn('Pyrsys B.V.', text)


if __name__ == '__main__':
    unittest.main()
