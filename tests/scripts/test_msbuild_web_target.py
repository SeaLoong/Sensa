"""Exercise frontend target scheduling with real, offline MSBuild projects."""
import copy
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[2]


class WebBuildTargetContracts(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        executable = 'dotnet.exe' if os.name == 'nt' else 'dotnet'
        bundled = ROOT / 'artifacts/toolchain/dotnet' / executable
        cls.dotnet = str(bundled) if bundled.is_file() else shutil.which('dotnet')
        if cls.dotnet is None:
            raise unittest.SkipTest('The pinned .NET SDK is required for MSBuild target scheduling checks')

    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='sensa-msbuild-web-')
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        (self.root / 'src').mkdir()
        (self.root / 'tests').mkdir()
        (self.root / 'empty-path').mkdir()
        shutil.copy2(ROOT / 'global.json', self.root / 'global.json')
        # No external packages or network sources: only SDK dependency discovery runs.
        (self.root / 'NuGet.Config').write_text(
            '<configuration><packageSources><clear /></packageSources></configuration>', encoding='utf-8')
        source = ET.parse(ROOT / 'src/Sensa.csproj').getroot()
        framework = source.findtext('PropertyGroup/TargetFramework')
        self.project = self.root / 'src/MetadataProbe.csproj'
        project = ET.Element('Project', Sdk='Microsoft.NET.Sdk.Web')
        ET.SubElement(ET.SubElement(project, 'PropertyGroup'), 'TargetFramework').text = framework
        project.append(copy.deepcopy(source.find("Target[@Name='BuildWeb']")))
        ET.ElementTree(project).write(self.project, encoding='utf-8')
        (self.root / 'src/Program.cs').write_text(
            'public static class Program { public static void Main() {} }', encoding='utf-8')
        self.reference_project = self.root / 'tests/ReferenceProbe.csproj'
        project = ET.Element('Project', Sdk='Microsoft.NET.Sdk')
        ET.SubElement(ET.SubElement(project, 'PropertyGroup'), 'TargetFramework').text = framework
        ET.SubElement(ET.SubElement(project, 'ItemGroup'), 'ProjectReference', Include='../src/MetadataProbe.csproj')
        ET.ElementTree(project).write(self.reference_project, encoding='utf-8')
        # Dependabot's injected DependencyDiscovery.targets imports these properties.
        # Keep DesignTimeBuild as an imported property, not a command-line override.
        (self.root / 'discovery.props').write_text(
            '<Project><PropertyGroup><DesignTimeBuild>true</DesignTimeBuild>'
            '<GenerateDependencyFile>true</GenerateDependencyFile></PropertyGroup></Project>', encoding='utf-8')
        (self.root / 'discovery.targets').write_text(
            '<Project><Import Project="discovery.props" /></Project>', encoding='utf-8')
        self.environment = {**os.environ, 'PATH': str(self.root / 'empty-path'),
                            'DOTNET_CLI_HOME': str(self.root / 'cli-home'),
                            'DOTNET_CLI_TELEMETRY_OPTOUT': '1', 'DOTNET_NOLOGO': '1'}
        if os.name != 'nt':
            # Exec needs its shell; expose that executable without exposing npm.
            shutil.copy2(shutil.which('sh'), self.root / 'empty-path/sh')
        self.assertIsNone(shutil.which('npm', path=self.environment['PATH']))
        self.assertFalse((self.root / 'node_modules').exists())

    def msbuild(self, project, *arguments):
        return subprocess.run([self.dotnet, 'msbuild', str(project), '-nologo', '-v:minimal',
                               '-noAutoResponse', *arguments], cwd=self.root, env=self.environment,
                              capture_output=True, text=True, timeout=45)

    def test_dependency_discovery_for_application_and_reference_needs_no_npm(self):
        for project in (self.project, self.reference_project):
            with self.subTest(project=project.name):
                result = self.msbuild(project, '/t:Restore,ResolveProjectReferences,GenerateBuildDependencyFile',
                    '/p:ProjectReferenceBuildTargets="Restore;ResolveProjectReferences;GenerateBuildDependencyFile"',
                    '/p:CustomAfterMicrosoftCommonTargets=' + str(self.root / 'discovery.targets'),
                    '/p:CustomAfterMicrosoftCommonCrossTargetingTargets=' + str(self.root / 'discovery.targets'))
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                # Check generated dependency metadata rather than just a successful exit.
                metadata = list((project.parent / 'bin').glob('Debug/*/' + project.stem + '.deps.json'))
                self.assertEqual(len(metadata), 1, result.stdout + result.stderr)
                self.assertIn('runtimeTarget', json.loads(metadata[0].read_text(encoding='utf-8')))
                self.assertNotIn('npm run build:web', result.stdout + result.stderr)

    def test_normal_build_and_publish_still_require_npm_without_node_modules(self):
        for target in ('Build', 'Publish'):
            with self.subTest(target=target):
                result = self.msbuild(self.project, '-restore', '-t:' + target)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn('MSB3073', result.stdout + result.stderr)
                self.assertIn('npm run build:web', result.stdout + result.stderr)

    def test_normal_build_and_publish_execute_web_command(self):
        marker = self.root / 'npm-command.txt'
        self.environment['SENSA_WEB_BUILD_PROBE'] = str(marker)
        executable = self.root / 'empty-path' / ('npm.cmd' if os.name == 'nt' else 'npm')
        if os.name == 'nt':
            executable.write_text('@echo off\necho %*>> "%SENSA_WEB_BUILD_PROBE%"\n', encoding='utf-8')
        else:
            executable.write_text('#!/bin/sh\nprintf \'%s\\n\' "$*" >> "$SENSA_WEB_BUILD_PROBE"\n', encoding='utf-8')
            executable.chmod(0o755)
        for target in ('Build', 'Publish'):
            with self.subTest(target=target):
                marker.unlink(missing_ok=True)
                result = self.msbuild(self.project, '-restore', '-t:' + target, '-p:UseSharedCompilation=false')
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                self.assertEqual(marker.read_text(encoding='utf-8').splitlines(), ['run build:web'])

    def test_explicit_skip_web_build_override_remains_available(self):
        result = self.msbuild(self.project, '-t:PrepareForBuild', '-p:SkipWebBuild=true')
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertNotIn('npm run build:web', result.stdout + result.stderr)


if __name__ == '__main__':
    unittest.main()
