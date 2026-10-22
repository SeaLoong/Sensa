"""Select optional local checks from changed paths.
按变更路径选择可选的本地检查；不规划 CI、发布或读取 GitHub 状态。
"""
import argparse
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
FLAGS = ('web', 'backend', 'scripts', 'docs', 'unity')
FULL = set(FLAGS)
INTERACTIVE_DOC_ASSETS = frozenset((
    'docs/parameter-geometry.html',
    'docs/assets/parameter-geometry-model.js',
    'docs/assets/parameter-geometry-view.js',
    'docs/assets/parameter-geometry-style.css',
    'docs/assets/parameter-geometry-3d.js',
    'docs/assets/parameter-geometry-3d.LICENSE.txt',
))
INTERACTIVE_DOC_INPUTS = INTERACTIVE_DOC_ASSETS | frozenset((
    'docs/assets/parameter-geometry-3d-source.js',
    'scripts/build-parameter-geometry.mjs',
))


def plan_changes(paths, *, diff_available=True):
    """Choose local lanes without any release or CI side effects.
    仅选择本地检查类别，不决定发布，也不接续历史 CI 任务。
    """
    paths = sorted(set(path.replace('\\', '/') for path in paths))
    enabled = set() if diff_available else set(FULL)
    reason = 'Changed paths / 变更路径' if diff_available else 'All local checks / 全部本地检查'
    for path in paths:
        if path.startswith('/') or '..' in path.split('/'):
            enabled.update(FULL)
        elif path in ('scripts/verify.py', 'scripts/xerj.py', '.xerjignore') or path.startswith('.codex/'):
            enabled.add('scripts')
            if path.endswith('.md'):
                enabled.add('docs')
        elif path.startswith('.github/pages/') or path in (
                '.github/workflows/pages.yml', 'scripts/build-pages.mjs', 'scripts/vpm-index.py',
                'tests/web/site.test.mjs', 'tests/e2e/site.spec.js'):
            enabled.update(('web', 'scripts', 'docs'))
        elif path.startswith('.github/'):
            enabled.update(('scripts', 'docs'))
        elif path == 'eslint.config.js':
            enabled.add('web')
        elif path in INTERACTIVE_DOC_INPUTS:
            enabled.update(('web', 'docs'))
        elif path.endswith(('.md', '.md.meta')) or path.startswith('docs/') or path in ('LICENSE', '.gitignore'):
            enabled.add('docs')
        elif path.startswith('tests/web/') or path.startswith('tests/e2e/') or path == 'playwright.config.js':
            # These optional checks never start the browser runner.
            # 本地类别仅包含静态／隔离单元检查，不启动浏览器测试。
            enabled.add('web')
        elif path.startswith('tests/Sensa.Tests/'):
            enabled.add('backend')
        elif path.startswith('tests/scripts/'):
            enabled.add('scripts')
        elif path.startswith('tests/fixtures/'):
            enabled.update(('scripts', 'backend'))
        elif path.startswith('src/web/') or path == 'scripts/build-web.mjs':
            enabled.add('web')
            if path.startswith('src/web/data/'):
                enabled.add('backend')
        elif path.startswith('src/'):
            enabled.add('backend')
        elif path.startswith('unity/'):
            enabled.update(('unity', 'scripts'))
            if path.endswith(('/SensaPoseProtocol.cs', '/SensaFixedAnchorProtocol.cs', '/SensaContactProtocol.cs')):
                enabled.add('backend')
        elif path in ('package.json', 'package-lock.json', 'scripts/ci-plan.py'):
            enabled.update(FULL)
        elif path.startswith('scripts/') or path.startswith('tools/'):
            enabled.update(('scripts', 'unity'))
        else:
            # Unknown build settings and new areas conservatively check locally.
            # 未知构建配置和新增目录保守选择全部本地检查。
            enabled.update(FULL)
    return {**{flag: flag in enabled for flag in FLAGS}, 'paths': paths, 'reason': reason}


def changed_paths(base, head='HEAD'):
    """Read local Git differences, including deleted and renamed paths.
    读取本地 Git 差异，包含删除和重命名的文件。
    """
    if not base or set(base) == {'0'}:
        return [], False
    try:
        result = subprocess.run(
            ['git', 'diff', '--name-only', '--no-renames', '-z', base, head],
            cwd=ROOT, check=True, capture_output=True)
    except (OSError, subprocess.CalledProcessError):
        return [], False
    return [path for path in result.stdout.decode('utf-8', errors='surrogateescape').split('\0') if path], True


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base', default='', help='Compare local Git references / 比较本地 Git 引用')
    parser.add_argument('--head', default='HEAD')
    parser.add_argument('--all', action='store_true', help='Select every local lane / 选择全部本地类别')
    args = parser.parse_args()
    paths, available = changed_paths(args.base, args.head)
    print(json.dumps(plan_changes(paths, diff_available=available and not args.all), ensure_ascii=True, indent=2))


if __name__ == '__main__':
    main()
