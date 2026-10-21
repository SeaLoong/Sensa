"""Run only affected local checks; reuse successful content receipts.
仅运行受影响的本地检查，并复用内容一致的成功验证凭据。
"""
import argparse
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import platform
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
_SPEC = importlib.util.spec_from_file_location('sensa_ci_plan', ROOT / 'scripts/ci-plan.py')
CI_PLAN = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(CI_PLAN)
LOCAL_LANES = ('web', 'backend', 'scripts', 'docs', 'unity')
DOC_CHECK_PATTERNS = ('test_bilingual_docs.py', 'test_tool_paths.py')
IGNORED_DIRECTORIES = {'.git', 'node_modules', 'artifacts', '_artifacts', 'bin', 'obj',
                       'build', '_build', '__pycache__', '.venv', '.vs',
                       'playwright-report', 'test-results', '.xerj'}
RECEIPT_VERSION = 1


def discover_changes(root=ROOT, base=None):
    """Compare the requested ref to the working tree, including untracked files.
    比较指定 ref 与工作区，同时纳入未跟踪文件。
    """
    try:
        dirty = subprocess.run(['git', 'diff', '--name-only', '--no-renames', '-z', base or 'HEAD'],
                               cwd=root, check=True, capture_output=True)
        untracked = subprocess.run(['git', 'ls-files', '--others', '--exclude-standard', '-z'],
                                   cwd=root, check=True, capture_output=True)
        paths = (dirty.stdout + untracked.stdout).decode('utf-8', errors='surrogateescape').split('\0')
        return sorted(set(path for path in paths if path)), True
    except (OSError, subprocess.CalledProcessError):
        return [], False


def select_local_lanes(plan):
    """The Python suite already includes documentation checks.
    Python 全套已包含文档检查，无须重复运行。
    """
    return [lane for lane in LOCAL_LANES if plan.get(lane) and not (lane == 'docs' and plan.get('scripts'))]


def resolve_dotnet(root=ROOT, override=None):
    if override:
        return override
    for name in ('dotnet.exe', 'dotnet'):
        bundled = Path(root) / 'artifacts/toolchain/dotnet' / name
        if bundled.is_file():
            return str(bundled.resolve())
    return shutil.which('dotnet') or 'dotnet'


def lane_commands(lane, root=ROOT, dotnet=None):
    python = [sys.executable, '-X', 'utf8']
    commands = {
        'web': [[shutil.which('npm') or 'npm', 'test'], [shutil.which('npm') or 'npm', 'run', 'build:web']],
        'backend': [[resolve_dotnet(root, dotnet), 'test', 'tests/Sensa.Tests/Sensa.Tests.csproj',
                     '-c', 'Release', '-p:SkipWebBuild=true', '-p:RestoreLockedMode=true']],
        'scripts': [python + ['-m', 'unittest', 'discover', '-s', 'tests/scripts']],
        'docs': [python + ['-m', 'unittest', 'discover', '-s', 'tests/scripts', '-p', pattern]
                 for pattern in DOC_CHECK_PATTERNS],
        'unity': [python + ['scripts/release.py', 'check-unity']],
    }
    return commands[lane]


def _native_command(command, platform_name=None):
    # Invoke npm's real JS entry with Node; no cmd.exe quoting or metacharacter expansion.
    # 通过 Node 直接执行 npm 的 JS 入口，避免 cmd.exe 引号层级和元字符展开。
    if (platform_name or os.name) != 'nt' or Path(command[0]).suffix.lower() not in ('.cmd', '.bat'):
        return command
    shim = Path(command[0])
    if shim.name.lower() not in ('npm.cmd', 'npm.bat'):
        raise OSError('Use an executable instead of a Windows command shim / 请使用可执行文件而非 Windows 命令 shim: ' + str(shim))
    cli = shim.parent / 'node_modules/npm/bin/npm-cli.js'
    if not cli.is_file():
        raise FileNotFoundError('npm CLI not found / 找不到 npm CLI: ' + str(cli))
    sibling_node = shim.parent / 'node.exe'
    node = str(sibling_node) if sibling_node.is_file() else shutil.which('node')
    if not node:
        raise FileNotFoundError('Node executable not found / 找不到 Node 可执行文件')
    return [node, str(cli), *command[1:]]


def execute(command, root):
    env = {**os.environ, 'PYTHONUTF8': '1'}
    return subprocess.run(_native_command(command), cwd=root, env=env, check=False).returncode


def toolchain_fingerprint(lane, commands, root):
    result = {'python': sys.version, 'executable': sys.executable, 'platform': platform.platform()}
    probes = []
    if lane == 'web':
        npm_probe = [commands[0][0], '--version']
        try:
            npm_native = _native_command(npm_probe)
        except OSError:
            npm_native = []
        node = npm_native[0] if len(npm_native) > 1 and Path(npm_native[1]).name == 'npm-cli.js' else shutil.which('node') or 'node'
        probes = [[node, '--version'], npm_probe]
    elif lane == 'backend':
        probes = [[commands[0][0], '--version']]
    for command in probes:
        try:
            native = _native_command(command)
            response = subprocess.run(native, cwd=root, check=False,
                                      capture_output=True, text=True, encoding='utf-8',
                                      errors='replace', timeout=30,
                                      env={**os.environ, 'PYTHONUTF8': '1'})
            result[command[0]] = {'command': native, 'exit': response.returncode, 'version': response.stdout.strip(),
                                  'error': response.stderr.strip()}
        except (OSError, subprocess.TimeoutExpired) as error:
            result[command[0]] = {'unavailable': str(error)}
    return result


def source_files(root):
    """Follow Git's source inventory; fall back only outside Git repositories.
    遵循 Git 源码清单，仅在非 Git 工程中回退扫描，排除本机配置。
    """
    root = Path(root)
    try:
        inventory = subprocess.run(
            ['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'],
            cwd=root, check=True, capture_output=True)
        candidates = inventory.stdout.decode('utf-8', errors='surrogateescape').split('\0')
    except (OSError, subprocess.CalledProcessError):
        candidates = []
        for directory, children, names in os.walk(root):
            children[:] = sorted(name for name in children if name not in IGNORED_DIRECTORIES)
            candidates.extend((Path(directory) / name).relative_to(root).as_posix() for name in sorted(names))
    files = {
        name for name in candidates
        if name and name not in ('config.json', '.codex/config.toml', '.codex/auth.json')
        and not Path(name).name.startswith('app.bundle.js')
        and not name.endswith(('.pyc', '.tmp'))
        and (root / name).is_file()
    }
    # Installed dependency metadata matters even though node_modules is ignored.
    # node_modules 不进入源码清单，但实际安装依赖的元数据参与 Web 指纹。
    if (root / 'node_modules/.package-lock.json').is_file():
        files.add('node_modules/.package-lock.json')
    return sorted(files)


def _relevant(path, lane):
    if path in ('scripts/verify.py', 'scripts/ci-plan.py', '.gitignore'):
        return True
    if path == 'node_modules/.package-lock.json':
        return lane == 'web'
    single = CI_PLAN.plan_changes([path])
    # A scripts impact must also invalidate its receipt, including development-only configuration.
    # 包括开发专用配置在内，凡被计划判定影响 scripts 的源码都必须使其凭据失效。
    if lane == 'scripts' and single['scripts']:
        return True
    if all(single[flag] for flag in CI_PLAN.FULL):
        return True
    if lane == 'web':
        return path in CI_PLAN.INTERACTIVE_DOC_INPUTS or path.startswith(('src/web/', 'tests/web/', 'tests/e2e/')) or path in (
            'package.json', 'package-lock.json', 'node_modules/.package-lock.json',
            'eslint.config.js', 'scripts/build-web.mjs', 'scripts/build-pages.mjs', 'GLOSSARY.md') or path.startswith('.github/pages/') or (
                path.endswith('.md') and (Path(path).parent.as_posix() in ('.', 'docs', 'unity/top.sealoong.sensa',
                    'tools/unity-world-lab', 'tools/unity-avatar-lab') and Path(path).name != 'AGENTS.md'
                    or path.startswith('docs/adr/')))
    if lane == 'backend':
        return (path.startswith('src/') and not path.startswith('src/web/')
                or path.startswith(('src/web/data/', 'tests/Sensa.Tests/', 'tests/fixtures/'))
                or path in ('unity/top.sealoong.sensa/Runtime/SensaPoseProtocol.cs',
                            'unity/top.sealoong.sensa/Runtime/SensaFixedAnchorProtocol.cs')
                or path == 'global.json' or path.endswith(('.props', '.targets', '.config', '.sln', '.slnx')))
    if lane == 'scripts':
        return path.startswith(('scripts/', 'tests/scripts/', 'tests/fixtures/', 'tools/', 'unity/', 'docs/', '.github/')) or path.endswith('.md') or path in ('package.json', 'package-lock.json')
    if lane == 'docs':
        file = Path(path)
        return (file.suffix.lower() in ('.md', '.mdx', '.rst', '.toml', '.yaml', '.yml')
                or path.endswith('.md.meta')
                or path in {'tests/scripts/' + pattern for pattern in DOC_CHECK_PATTERNS}
                or file.name in ('.editorconfig', '.gitattributes', '.gitignore', '.mcp.json', '.npmrc', '.xerjignore')
                or '.config.' in file.name
                or len(file.parts) == 1 and file.suffix.lower() == '.json'
                or file.parts[0] in ('.codex', '.vscode', '.devcontainer')
                or path == 'unity/top.sealoong.sensa/Editor/SensaInspectorLabels.cs.meta')
    if lane == 'unity':
        return path.startswith('unity/') or path == 'scripts/release.py'
    return False


def verification_key(root, lane, commands, toolchain, files):
    digest = hashlib.sha256()
    digest.update(json.dumps({'format': RECEIPT_VERSION, 'lane': lane, 'commands': commands,
                              'toolchain': toolchain}, sort_keys=True).encode('utf-8'))
    # Documentation checks follow links, so path existence also affects their result.
    # 文档检查会解析链接，故文件路径的存在性也影响结果。
    if lane in ('docs', 'scripts'):
        digest.update(json.dumps(files, ensure_ascii=True).encode('utf-8'))
    for name in files:
        if _relevant(name, lane):
            digest.update(name.encode('utf-8', errors='surrogateescape') + b'\0')
            digest.update((Path(root) / name).read_bytes())
            digest.update(b'\0')
    return digest.hexdigest()


def run_verification(plan, *, root=ROOT, force=False, dotnet=None,
                     runner=None, tools=None, output=print):
    """Run selected interfaces; never run E2E, smoke, screenshots or publishing.
    执行选中的本地 interface；绝不执行 E2E、完整冒烟、截图或发布。
    """
    runner = runner or execute
    tools = tools or toolchain_fingerprint
    root = Path(root)
    files = source_files(root)
    cache = root / 'artifacts/verification'
    for lane in select_local_lanes(plan):
        commands = lane_commands(lane, root, dotnet)
        key = verification_key(root, lane, commands, tools(lane, commands, root), files)
        receipt = cache / (lane + '.json')
        try:
            cached = json.loads(receipt.read_text(encoding='utf-8'))
        except (OSError, ValueError):
            cached = {}
        if not force and cached.get('key') == key and cached.get('format') == RECEIPT_VERSION:
            output(f'Cached / 已验证缓存: {lane}')
            continue
        # Remove the old success before attempting a different or forced check.
        # 在执行新内容或强制重跑前删除旧成功凭据，失败不能复用。
        receipt.unlink(missing_ok=True)
        output(f'Checking / 正在检查: {lane}')
        try:
            for command in commands:
                if runner(command, root) != 0:
                    output(f'Failed / 检查失败: {lane}')
                    return False
        except OSError as error:
            output(f'Unable to run / 无法执行: {lane}: {error}')
            return False
        # A writer may have changed inputs while checks were running.
        # 检查过程中可能有其他写入者改变源码；变化时不保存成功凭据。
        current_files = source_files(root)
        if verification_key(root, lane, commands, tools(lane, commands, root), current_files) != key:
            output(f'Inputs changed; receipt not saved / 输入已变化，不保存凭据: {lane}')
            return False
        cache.mkdir(parents=True, exist_ok=True)
        temporary = receipt.with_suffix('.tmp')
        temporary.write_text(json.dumps({'format': RECEIPT_VERSION, 'key': key, 'lane': lane,
                                         'commands': commands, 'verified_at': datetime.now(timezone.utc).isoformat()},
                                        ensure_ascii=True, indent=2) + '\n', encoding='utf-8')
        temporary.replace(receipt)
    return True


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base', help='Compare ref to working tree / 比较 ref 与工作区')
    parser.add_argument('--all', action='store_true', help='Select all checks / 选择全部检查')
    parser.add_argument('--force', action='store_true', help='Ignore success receipts / 忽略成功缓存')
    parser.add_argument('--plan', action='store_true', help='Print JSON only; execute nothing / 仅输出 JSON，不执行检查')
    parser.add_argument('--dotnet', help='Use this .NET executable / 使用指定 .NET 可执行文件')
    args = parser.parse_args(argv)
    paths, available = discover_changes(ROOT, args.base)
    plan = CI_PLAN.plan_changes(paths, diff_available=available and not args.all)
    summary = {**plan, 'local_lanes': select_local_lanes(plan)}
    print(json.dumps(summary, ensure_ascii=True, indent=2))
    if args.plan:
        return 0
    if not summary['local_lanes']:
        print('No affected local checks / 没有受影响的本地检查')
        return 0
    return 0 if run_verification(plan, force=args.force, dotnet=args.dotnet) else 1


if __name__ == '__main__':
    raise SystemExit(main())
