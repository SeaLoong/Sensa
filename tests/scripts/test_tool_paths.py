"""Portable tool configuration and public documentation privacy contracts."""
from pathlib import Path
import re
import runpy
import subprocess
import sys
import tempfile
import tomllib
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
TEMPLATE = ROOT / 'docs/agents/examples/codex-config.toml'
HTTP_URL = re.compile(r"""https?://[^\s<>"'\x60]+""")
LOCAL_FILE_URL = re.compile(r'file://(?:/|[^/\s])')
WINDOWS_PATH = re.compile(
    r'(?<![A-Za-z0-9])(?:[A-Za-z]:[\\/]|\\{2}[^\\/\s]+[\\/])')
USER_POSIX_PATH = re.compile(
    r"""(?<![\w/])/(?:Users|home|var/home)/[^\s/<>"'\x60{}\[\]$]+"""
    r"""|(?<![\w/])/root(?:/|(?=$|[\s\x60"']))"""
    r"""|(?<![\w/])/(?:mnt/[A-Za-z]|Volumes|media)/[^\s/<>"'\x60{}\[\]$]+""")
GENERATED_DIRECTORIES = {
    '.git', 'artifacts', 'node_modules', 'dist', 'bin', 'obj', 'Library', 'Temp',
}
TOOL_CONFIG_EXTENSIONS = {'.toml', '.yaml', '.yml'}
TOOL_CONFIG_NAMES = {
    '.editorconfig', '.gitattributes', '.gitignore', '.mcp.json', '.npmrc',
    '.xerjignore',
}
TOOL_CONFIG_DIRECTORIES = {'.codex', '.vscode', '.devcontainer'}
CONFIG_SCRIPT = re.compile(r'\.config\.(?:[cm]?js|ts|json)$')


def private_path(text):
    """Ignore remote links, while retaining local file URLs for inspection."""
    text = HTTP_URL.sub('', text)
    return (WINDOWS_PATH.search(text) or USER_POSIX_PATH.search(text)
            or LOCAL_FILE_URL.search(text))


def public_documents_and_tool_configs():
    paths = subprocess.check_output(
        ['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'],
        cwd=ROOT,
    ).decode('utf-8').split('\0')
    for name in sorted(set(filter(None, paths))):
        path = Path(name)
        if GENERATED_DIRECTORIES.intersection(path.parts):
            continue
        if (path.suffix.lower() in {'.md', '.mdx', '.rst'}
                or path.suffix.lower() in TOOL_CONFIG_EXTENSIONS
                or path.name in TOOL_CONFIG_NAMES
                or CONFIG_SCRIPT.search(path.name)
                or (len(path.parts) == 1 and path.suffix.lower() == '.json')
                or (path.parts[0] in TOOL_CONFIG_DIRECTORIES
                    and path.suffix.lower() in {'.json', '.example'})):
            source = ROOT / path
            if source.is_file():
                yield source


class PortableToolPathsTests(unittest.TestCase):
    def setUp(self):
        self.config = tomllib.loads(TEMPLATE.read_text(encoding='utf-8'))
        self.server = self.config['mcp_servers']['xerj-sensa']
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.checkout = Path(self.temporary.name)
        self.script = self.checkout / 'scripts/xerj.py'
        self.script.parent.mkdir()
        self.script.touch()
        (self.checkout / '.xerjignore').touch()

    def bootstrap(self, directory):
        calls = []

        def execute(path, *, run_name):
            calls.append((Path(path), run_name, sys.argv[1:]))

        with patch.object(Path, 'cwd', return_value=directory), \
                patch.object(runpy, 'run_path', side_effect=execute), \
                patch.object(sys, 'argv', ['-c', 'mcp']):
            exec(compile(self.server['args'][1], '<xerj-bootstrap>', 'exec'), {})
        return calls

    def test_template_uses_path_and_session_directory_without_persisted_paths(self):
        self.assertEqual(self.server['command'], 'python')
        self.assertEqual(self.server['args'][0], '-c')
        self.assertEqual(self.server['args'][2:], ['mcp'])
        self.assertNotIn('cwd', self.server)
        self.assertNotIn('XERJ_BIN', self.server.get('env', {}))
        self.assertIn('XERJ_BIN', self.server['env_vars'])
        self.assertIsNone(private_path(TEMPLATE.read_text(encoding='utf-8')))

    def test_all_local_codex_configuration_is_ignored_but_example_is_shared(self):
        paths = ['.codex/config.toml', '.codex/auth.json', '.codex/bin/xerj',
                 '.codex/log/session.log']
        ignored = subprocess.check_output(
            ['git', 'check-ignore', '--no-index', *paths], cwd=ROOT, text=True,
        ).splitlines()
        self.assertEqual(ignored, paths)
        example = subprocess.run(
            ['git', 'check-ignore', '--no-index', TEMPLATE.relative_to(ROOT).as_posix()],
            cwd=ROOT, capture_output=True, check=False,
        )
        self.assertEqual(example.returncode, 1)

    def test_bootstrap_finds_checkout_from_root_and_nested_directory(self):
        nested = self.checkout / 'src/nested'
        nested.mkdir(parents=True)
        for directory in (self.checkout, nested):
            with self.subTest(directory=directory.relative_to(self.checkout)):
                self.assertEqual(
                    self.bootstrap(directory),
                    [(self.script.resolve(), '__main__', ['mcp'])],
                )

    def test_bootstrap_requires_both_checkout_markers(self):
        (self.checkout / '.xerjignore').unlink()
        with self.assertRaisesRegex(SystemExit, 'inside the Sensa checkout'):
            self.bootstrap(self.checkout)

    def test_bootstrap_reports_missing_script_without_executing_anything(self):
        self.script.unlink()
        with self.assertRaisesRegex(SystemExit, 'inside the Sensa checkout'):
            self.bootstrap(self.checkout)

    def test_privacy_detector_rejects_absolute_paths_and_allows_remote_links(self):
        for text in (
            'D:/workspace/project', r'D:\workspace\project',
            r'\\example-server\share\project', '/home/example/project',
            '/Users/example/Library', '/root/project', '/mnt/d/workspace',
            '/Volumes/example/project', 'file:///home/example/project',
        ):
            with self.subTest(text=text):
                self.assertIsNotNone(private_path(text))
        for text in (
            'scripts/xerj.py', '~/.codex/config.toml', '$' + '{HOME}/tools',
            '$env:LOCALAPPDATA', '/api/configuration',
            'https://example.invalid/home/example/project',
            'https://example.invalid/D:/workspace/project',
            'https://example.invalid/Users/example/Library',
        ):
            with self.subTest(text=text):
                self.assertIsNone(private_path(text))

    def test_public_documents_and_tool_configs_contain_no_local_absolute_paths(self):
        violations = []
        sources = list(public_documents_and_tool_configs())
        self.assertIn(TEMPLATE, sources)
        self.assertIn(ROOT / 'docs/agents/xerj.md', sources)
        for source in sources:
            for number, line in enumerate(
                    source.read_text(encoding='utf-8-sig').splitlines(), start=1):
                if private_path(line):
                    violations.append(f'{source.relative_to(ROOT).as_posix()}:{number}')
        self.assertEqual(violations, [], '\n'.join(violations))


if __name__ == '__main__':
    unittest.main()
