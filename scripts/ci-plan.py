"""Choose necessary verification from changed paths. / 按变更路径选择必要验证."""
import argparse
import json
import os
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
FLAGS = ('web', 'backend', 'scripts', 'docs', 'unity', 'dependencies',
         'e2e', 'platforms', 'prerelease')
FULL = set(FLAGS) - {'prerelease'}


def plan_changes(paths, *, event_name='pull_request', ref='', diff_available=True):
    """Return one plan for CI and local callers. / 为 CI 和本地调用者返回同一计划."""
    paths = sorted(set(path.replace('\\', '/') for path in paths))
    enabled = set()
    product_changed = False
    reason = 'Changed paths / 变更路径'
    if not diff_available or event_name == 'workflow_dispatch':
        enabled.update(FULL)
        product_changed = True
        reason = 'Explicit full run or unavailable diff / 显式全量或无法取得差异'
    for path in paths:
        if path.startswith('/') or '..' in path.split('/'):
            enabled.update(FULL)
            product_changed = True
        elif path in ('scripts/verify.py', 'scripts/xerj.py', '.xerjignore') or path.startswith('.codex/'):
            # Development-only tools are not shipped product inputs.
            # 开发专用工具不进入产品包，不触发产品验证与预发布。
            enabled.add('scripts')
            if path.endswith('.md'):
                enabled.add('docs')
        elif path == 'eslint.config.js':
            enabled.add('web')
        elif path.endswith(('.md', '.md.meta')) or path.startswith('docs/') or path in ('LICENSE', '.gitignore'):
            enabled.add('docs')
        elif path.startswith('tests/web/'):
            enabled.add('web')
        elif path.startswith('tests/Sensa.Tests/'):
            enabled.add('backend')
        elif path.startswith('tests/e2e/') or path == 'playwright.config.js':
            enabled.update(('e2e', 'web', 'backend'))
        elif path.startswith('tests/scripts/'):
            enabled.add('scripts')
        elif path.startswith('tests/fixtures/'):
            enabled.update(('scripts', 'backend', 'e2e'))
        elif path.startswith('src/web/') or path == 'scripts/build-web.mjs':
            enabled.update(('web', 'e2e', 'platforms'))
            # Presets are embedded in the backend. / 预设也嵌入后端。
            if path.startswith('src/web/data/'):
                enabled.add('backend')
            product_changed = True
        elif path.startswith('src/'):
            enabled.update(('backend', 'e2e', 'platforms'))
            product_changed = True
        elif path.startswith('unity/'):
            enabled.update(('unity', 'scripts', 'e2e', 'platforms'))
            if path.endswith('/SensaPoseProtocol.cs'):
                enabled.add('backend')
            product_changed = True
        elif path in ('package.json', 'package-lock.json'):
            enabled.update(('web', 'dependencies', 'e2e', 'platforms', 'backend'))
            product_changed = True
        elif path.startswith('scripts/') or path.startswith('tools/'):
            enabled.update(('scripts', 'unity', 'e2e', 'platforms'))
            product_changed = True
            if path == 'scripts/ci-plan.py':
                enabled.update(FULL)
        else:
            # Workflows, SDK/build settings and new paths fail closed.
            # 工作流、SDK/构建设置及未知路径保守使用全量验证。
            enabled.update(FULL)
            product_changed = True
    if 'platforms' in enabled:
        # A complete candidate includes Unity and a current-commit comparison.
        # 完整候选必须包含 Unity 包及当前提交的截图比较。
        enabled.update(('unity', 'e2e'))
    if product_changed and event_name == 'push' and ref == 'refs/heads/main':
        enabled.add('prerelease')
    return {**{flag: flag in enabled for flag in FLAGS}, 'paths': paths,
            'e2e_suite': 'all' if 'e2e' in enabled else 'none', 'reason': reason}


def changed_paths(base, head='HEAD'):
    """Use Git's changed-path interface, including deleted/renamed files.
    使用 Git 变更路径接口，包含删除和重命名。
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
    parser.add_argument('--base', default='')
    parser.add_argument('--head', default='HEAD')
    parser.add_argument('--event', default=os.environ.get('GITHUB_EVENT_NAME', 'pull_request'))
    parser.add_argument('--ref', default=os.environ.get('GITHUB_REF', ''))
    parser.add_argument('--format', choices=('json', 'github'), default='json')
    args = parser.parse_args()
    paths, available = changed_paths(args.base, args.head)
    plan = plan_changes(paths, event_name=args.event, ref=args.ref, diff_available=available)
    if args.format == 'github':
        lines = [f'{key}={str(plan[key]).lower()}' for key in FLAGS]
        lines.append(f'e2e_suite={plan["e2e_suite"]}')
        print('\n'.join(lines))
        if os.environ.get('GITHUB_OUTPUT'):
            with open(os.environ['GITHUB_OUTPUT'], 'a', encoding='utf-8') as output:
                output.write('\n'.join(lines) + '\n')
        if os.environ.get('GITHUB_STEP_SUMMARY'):
            with open(os.environ['GITHUB_STEP_SUMMARY'], 'a', encoding='utf-8') as summary:
                summary.write('### Verification plan / 验证计划\n\n')
                summary.write('\n'.join(f'- {key}: `{str(plan[key]).lower()}`' for key in FLAGS) + '\n')
                summary.write('\n' + plan['reason'] + '\n')
    else:
        print(json.dumps(plan, ensure_ascii=True, indent=2))


if __name__ == '__main__':
    main()
