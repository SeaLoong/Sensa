"""Choose necessary verification from changed paths. / 按变更路径选择必要验证."""
import argparse
import json
import os
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
FLAGS = ('web', 'backend', 'scripts', 'docs', 'unity', 'dependencies',
         'e2e', 'platforms', 'prerelease')
FULL = set(FLAGS) - {'prerelease'}
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
        elif path in INTERACTIVE_DOC_INPUTS:
            # Interactive documentation needs model and browser checks, not native builds.
            # 交互文档需要模型与浏览器验证，不触发原生构建或预发布。
            enabled.update(('web', 'docs', 'e2e'))
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
            if path in ('scripts/ci-plan.py', 'scripts/ci_evidence.py'):
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


def plan_release(target, *, event_name, ref):
    """Choose explicit tag verification without inheriting main's product debt.
    选择显式标签验证，不继承 main 的产品验证债务。
    """
    if target not in ('app', 'unity'):
        raise ValueError('Release target must be app or unity / 发布目标必须是 app 或 unity')
    prefix = 'unity-v' if target == 'unity' else 'v'
    if event_name != 'push' or not re.fullmatch(
            'refs/tags/' + re.escape(prefix) + r'\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?', ref):
        raise ValueError('Release verification requires a matching pushed version tag / 发布验证需要推送匹配的版本标签')
    enabled = FULL - {'platforms'} if target == 'unity' else FULL
    return {**{flag: flag in enabled for flag in FLAGS}, 'paths': [],
            'e2e_suite': 'all', 'reason': f'{target} tag verification / {target} 标签验证'}


def plan_with_evidence(paths, evidence, *, owner_paths=None, event_name='pull_request', ref='', diff_available=True):
    """Resolve inherited product verification debt without network access.
    不访问网络，合并继承的产品验证债务。
    """
    current = plan_changes(paths, event_name=event_name, ref=ref, diff_available=diff_available)
    if event_name != 'push' or ref != 'refs/heads/main':
        return current
    state = evidence.get('state', 'unknown')
    owner = evidence.get('owner')
    if state in ('success', 'running') and owner and owner_paths is not None:
        owner_delta = plan_changes(owner_paths, event_name='push', ref='refs/heads/main')
        if state == 'success' and (current['prerelease'] or not owner_delta['prerelease']):
            return current
        selected = {flag for flag in FLAGS if current[flag]}
        if state == 'running' and selected <= {'docs'} and not owner_delta['prerelease']:
            return {**current, 'reason': 'Product verification still running; retain owner / 产品验证仍在运行，保留负责人'}
    result = plan_changes(paths, event_name=event_name, ref=ref, diff_available=False)
    result['reason'] = 'Unverified product debt; restore complete gate / 产品验证债务未清，恢复完整门禁'
    return result


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
    parser.add_argument('--release-target', choices=('app', 'unity'), help='Verify an explicitly pushed release tag / 验证显式推送的发布标签')
    parser.add_argument('--github-evidence', action='store_true', help='Read main-run verification evidence / 读取 main 运行验证证据')
    parser.add_argument('--record', type=Path, help='Write verification intent artifact / 写入验证意图工件')
    args = parser.parse_args()
    if args.release_target:
        try:
            plan = plan_release(args.release_target, event_name=args.event, ref=args.ref)
        except ValueError as error:
            parser.error(str(error))
    else:
        paths, available = changed_paths(args.base, args.head)
        plan = plan_changes(paths, event_name=args.event, ref=args.ref, diff_available=available)
    if not args.release_target and args.github_evidence and args.event == 'push' and args.ref == 'refs/heads/main':
        from ci_evidence import GitHubEvidence, GATES, make_record, read_evidence
        adapter = GitHubEvidence(os.environ['GITHUB_REPOSITORY'], ROOT)
        evidence = read_evidence(adapter, int(os.environ['GITHUB_RUN_ID']), os.environ['GITHUB_SHA'])
        owner_paths, owner_available = changed_paths(evidence['owner']['head_sha'], args.head) if evidence.get('owner') else ([], False)
        plan = plan_with_evidence(paths, evidence, owner_paths=owner_paths if owner_available else None,
                                  event_name=args.event, ref=args.ref, diff_available=available)
        if args.record and evidence.get('current'):
            run = evidence['current']
            owner = (dict(run_id=run['id'], head_sha=run['head_sha'], required=list(GATES))
                     if plan['prerelease'] else evidence['owner'])
            args.record.parent.mkdir(parents=True, exist_ok=True)
            args.record.write_text(json.dumps(make_record(run, plan, owner, evidence.get('checkpoint_sha')),
                                              ensure_ascii=True, indent=2) + '\n', encoding='utf-8')
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
