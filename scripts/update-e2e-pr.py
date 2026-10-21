"""Prepare constrained E2E proposals and open an unreviewed draft PR.
仅修改 tests/e2e；候选截图不会自动接受，也不合并或写入 main。
"""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
OUTCOMES = ('passed', 'expectedFailure', 'failed', 'flaky', 'skipped', 'notRun', 'interrupted')
FORBIDDEN = re.compile(r'\b(?:test|[A-Za-z_$][\w$]*Test)(?:\s*\.\s*describe)?\s*\.\s*(?:skip|fixme|only|fail)\s*\(')
ASSERTIONS = re.compile(r'\bexpect(?:\s*\.\s*[A-Za-z_$][\w$]*)?\s*\(')


def git(root, *arguments, input=None):
    return subprocess.check_output(['git', '-c', 'core.hooksPath=/dev/null', *arguments],
                                   cwd=root, input=input)


def sha(value):
    if not re.fullmatch(r'[a-f0-9]{40}', value or ''):
        raise ValueError('Expected full source commit / 必须提供完整源码提交')
    return value


def run_identity(environment):
    run, attempt = environment.get('GITHUB_RUN_ID', ''), environment.get('GITHUB_RUN_ATTEMPT', '')
    if not re.fullmatch(r'[1-9][0-9]*', run) or not re.fullmatch(r'[1-9][0-9]*', attempt):
        raise ValueError('Missing workflow run identity / 缺少工作流运行编号')
    repository = environment.get('GITHUB_REPOSITORY', '')
    if not re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+', repository):
        raise ValueError('Missing repository identity / 缺少仓库身份')
    return run, attempt, repository


def check_path(name, mode):
    parts = PurePosixPath(name).parts
    if ('\\' in name or '\x00' in name or PurePosixPath(name).is_absolute()
            or len(parts) < 3 or parts[:2] != ('tests', 'e2e')
            or any(part in ('.', '..') or part.startswith('.') for part in parts)):
        raise ValueError('Proposal may change tests/e2e only / 只能修改 tests/e2e: ' + name)
    if mode == 'screenshots' and (len(parts) < 5 or parts[2] != '__screenshots__'
                                  or parts[3] not in ('desktop', 'mobile') or not name.endswith('.png')):
        raise ValueError('Screenshot mode may update baseline PNGs only / 截图模式只修改基线 PNG: ' + name)
    return name


def patch_paths(root, patch, mode):
    if not patch:
        return []
    raw = git(root, 'apply', '--numstat', '-z', input=patch)
    paths = []
    for entry in raw.split(b'\x00'):
        if not entry:
            continue
        fields = entry.split(b'\t', 2)
        if len(fields) != 3 or not fields[2]:
            raise ValueError('Renames and malformed patches are unsupported / 不接受重命名或损坏的补丁')
        paths.append(check_path(fields[2].decode('utf-8'), mode))
    if not paths or len(set(paths)) != len(paths):
        raise ValueError('Empty or duplicate patch paths / 补丁路径为空或重复')
    return paths


def changed_paths(root):
    tracked = git(root, 'diff', '--name-only', '-z', '--no-renames', 'HEAD').split(b'\x00')
    untracked = git(root, 'ls-files', '--others', '--exclude-standard', '-z').split(b'\x00')
    return sorted({entry.decode('utf-8') for entry in tracked + untracked if entry})


def validate_files(root, paths, mode):
    for name in paths:
        check_path(name, mode)
        path = root / name
        if not path.is_file() or any(parent.is_symlink() for parent in (path, *path.parents)):
            raise ValueError('Missing files, deletions and symlinks are forbidden / 不接受删除、缺失文件或符号链接: ' + name)
        if path.stat().st_size > 32 * 1024 * 1024:
            raise ValueError('Proposal file exceeds 32 MiB / 候选文件超过 32 MiB: ' + name)
        if name.endswith('.png') and not path.read_bytes().startswith(b'\x89PNG\r\n\x1a\n'):
            raise ValueError('Invalid candidate PNG / 候选 PNG 无效: ' + name)
        if name.endswith('.js'):
            text = path.read_text(encoding='utf-8')
            exists = subprocess.run(['git', 'cat-file', '-e', 'HEAD:' + name], cwd=root,
                                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0
            original = git(root, 'show', 'HEAD:' + name).decode('utf-8') if exists else ''
            if len(FORBIDDEN.findall(text)) > len(FORBIDDEN.findall(original)):
                raise ValueError('New skip/fixme/only/fail calls are forbidden / 不能新增跳过、限定或预期失败: ' + name)
            if len(ASSERTIONS.findall(text)) < len(ASSERTIONS.findall(original)):
                raise ValueError('Removing assertions is forbidden / 不能删除已有断言: ' + name)


def check_index(root, paths):
    indexed = git(root, 'ls-files', '--stage', '-z', '--', *paths)
    seen = set()
    for record in indexed.split(b'\x00'):
        if not record:
            continue
        metadata, name = record.split(b'\t', 1)
        if metadata.split(b' ', 1)[0] != b'100644':
            raise ValueError('Only regular non-executable files are allowed / 只接受普通非执行文件')
        seen.add(name.decode('utf-8'))
    if seen != set(paths):
        raise ValueError('Proposal index differs from checked files / 候选暂存内容不一致')


def assert_source(root, source_commit):
    sha(source_commit)
    if git(root, 'rev-parse', 'HEAD').decode().strip() != source_commit:
        raise ValueError('Checkout does not match pinned source / 工作区与固定源码提交不一致')


def apply_patch(root, patch, mode):
    if changed_paths(root):
        raise ValueError('Apply requires a clean checkout / 应用候选需要干净工作区')
    paths = patch_paths(root, patch, mode)
    if paths:
        git(root, 'apply', '--index', '--binary', input=patch)
        validate_files(root, paths, mode)
        check_index(root, paths)
    return paths


def apply_agent(root, source_commit, proposal):
    assert_source(root, source_commit)
    data = json.loads(proposal)
    patch = data.get('patch')
    if not isinstance(patch, str) or len(patch.encode('utf-8')) > 256 * 1024:
        raise ValueError('Agent must return a patch of at most 256 KiB / 代理须返回不超过 256 KiB 的补丁')
    paths = patch_paths(root, patch.encode('utf-8'), 'agent')
    if any(name.endswith('.png') for name in paths):
        raise ValueError('Agent cannot provide images; the browser creates them / 图片必须由后续浏览器生成')
    return apply_patch(root, patch.encode('utf-8'), 'agent')


def validate_candidate(summary, source_commit, environment):
    run, attempt, repository = run_identity(environment)
    counts = summary.get('counts', {})
    if (summary.get('schema') != 1 or summary.get('commit') != sha(source_commit)
            or summary.get('repository') != repository or summary.get('runId') != run
            or summary.get('attempt') != attempt or summary.get('suite') != 'all'
            or summary.get('baselineMode') != 'candidate' or summary.get('status') != 'passed'
            or summary.get('commandOutcome') != 'success' or summary.get('selectionComplete') is not True
            or sorted(summary.get('projects', [])) != ['desktop', 'mobile']
            or summary.get('globalErrors') != []):
        raise ValueError('No complete current-run candidate evidence / 缺少本次完整候选运行证据')
    cases = summary.get('tests')
    if (not all(type(counts.get(key)) is int and counts[key] >= 0 for key in ('total', *OUTCOMES))
            or counts['total'] <= 0 or counts['passed'] != counts['total']
            or any(counts[key] for key in OUTCOMES if key != 'passed')
            or not isinstance(cases, list) or len(cases) != counts['total']
            or {case.get('project') for case in cases} != {'desktop', 'mobile'}
            or any(case.get('outcome') != 'passed' or not case.get('attempts')
                   or case['attempts'][-1].get('status') != 'passed' for case in cases)):
        raise ValueError('Candidate contains failed, skipped or unrun cases / 候选含失败、跳过或未执行用例')
    return counts


def append_summary(environment, text):
    if environment.get('GITHUB_STEP_SUMMARY'):
        with open(environment['GITHUB_STEP_SUMMARY'], 'a', encoding='utf-8') as stream:
            stream.write(text + '\n')


def export_proposal(root, source_commit, mode, summary_path, output, environment):
    assert_source(root, source_commit)
    counts = validate_candidate(json.loads(summary_path.read_text(encoding='utf-8')), source_commit, environment)
    paths = changed_paths(root)
    validate_files(root, paths, mode)
    if paths:
        git(root, 'add', '--', *paths)
        check_index(root, paths)
        patch = git(root, 'diff', '--cached', '--binary', '--no-renames', 'HEAD', '--', *paths)
    else:
        patch = b''
    run, attempt, repository = run_identity(environment)
    output.mkdir(parents=True, exist_ok=True)
    (output / 'proposal.patch').write_bytes(patch)
    manifest = {'schema': 1, 'commit': source_commit, 'mode': mode, 'runId': run, 'attempt': attempt,
                'repository': repository, 'counts': counts, 'patchSha256': hashlib.sha256(patch).hexdigest(),
                'files': [{'path': name, 'sha256': hashlib.sha256((root / name).read_bytes()).hexdigest()} for name in paths]}
    (output / 'proposal.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    if environment.get('GITHUB_OUTPUT'):
        with open(environment['GITHUB_OUTPUT'], 'a', encoding='utf-8') as stream:
            stream.write('changed=' + str(bool(paths)).lower() + '\n')
    append_summary(environment, f'### E2E proposal / E2E 候选\n\n{len(paths)} changed files; {counts["passed"]} passing candidate cases. '
                   'Images remain unreviewed; no baseline acceptance or merge occurred. / 图片尚未审阅，未接受基线或合并。'
                   + ('\n\nNo changes; no branch or PR is needed. / 内容未变化，无需分支或 PR。' if not paths else ''))
    return manifest


def publish_proposal(root, source_commit, directory, environment):
    assert_source(root, source_commit)
    run, attempt, repository = run_identity(environment)
    manifest = json.loads((directory / 'proposal.json').read_text(encoding='utf-8'))
    patch = (directory / 'proposal.patch').read_bytes()
    if (manifest.get('schema') != 1 or manifest.get('commit') != source_commit
            or manifest.get('runId') != run or manifest.get('attempt') != attempt
            or manifest.get('repository') != repository or manifest.get('mode') not in ('screenshots', 'agent')
            or manifest.get('patchSha256') != hashlib.sha256(patch).hexdigest()):
        raise ValueError('Proposal identity or digest changed / 候选身份或摘要已变化')
    files = manifest.get('files')
    if not isinstance(files, list) or not files or any(not isinstance(item, dict) for item in files):
        raise ValueError('Proposal has no changed files / 候选没有变化文件')
    paths = apply_patch(root, patch, manifest['mode'])
    actual = {name: hashlib.sha256((root / name).read_bytes()).hexdigest() for name in paths}
    if len(files) != len(actual) or actual != {item.get('path'): item.get('sha256') for item in files}:
        raise ValueError('Applied files differ from validated candidates / 应用内容与已检查候选不一致')
    branch = f'codex/e2e-update-{run}-{attempt}'
    git(root, 'switch', '-c', branch)
    git(root, 'config', 'user.name', 'github-actions[bot]')
    git(root, 'config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com')
    git(root, 'commit', '-m', 'Update E2E candidates for ' + source_commit[:8])
    git(root, 'push', 'origin', 'HEAD:refs/heads/' + branch)
    url = f'https://github.com/{repository}/actions/runs/{run}'
    body = (f'Candidate updates for `{source_commit}` from [Actions run]({url}).\n\n'
            f'Candidate cases: {manifest["counts"]["passed"]}/{manifest["counts"]["total"]} passed; '
            'normal comparison and image review are still required. / 候选用例已通过，仍须普通比较与审图。\n\n'
            f'{manifest["counts"]["passed"]} passing candidate cases; {len(files)} changed files.\n\n'
            '**Draft: images and assertion changes require human review. This workflow does not approve baselines or merge.**\n\n'
            'Review expected/actual/diff, behavior assertions and both viewports. A separate normal comparison is dispatched on this branch.\n\n'
            '**草稿：图片及断言变化须人工审阅；此任务不会批准基线或合并。** 请检查差异图、行为断言与两个视口。\n')
    with tempfile.TemporaryDirectory(prefix='sensa-e2e-pr-') as temporary:
        body_file = Path(temporary) / 'body.md'
        body_file.write_text(body, encoding='utf-8')
        try:
            pr_url = subprocess.check_output(['gh', 'pr', 'create', '--repo', repository, '--base', 'main',
                '--head', branch, '--draft', '--title', 'Update E2E candidates for ' + source_commit[:8],
                '--body-file', str(body_file)], cwd=root, text=True).strip()
        except subprocess.CalledProcessError:
            append_summary(environment, f'### Draft PR was not created / 草稿 PR 创建失败\n\n'
                f'The candidate branch `{branch}` was pushed and is retained. / 候选分支已推送并保留。\n\n'
                'GitHub rejected PR creation. Check token pull-request permissions and Settings → Actions → General → '
                'Allow GitHub Actions to create and approve pull requests. No merge or baseline approval occurred. / '
                '请检查令牌权限及仓库允许 Actions 创建 PR 的设置；未合并或批准基线。')
            raise
    append_summary(environment, f'### Draft E2E proposal / E2E 草稿候选\n\n{pr_url}\n\nBranch: `{branch}`. '
                   'Images remain unreviewed. / 图片仍待人工审阅。')
    try:
        subprocess.run(['gh', 'workflow', 'run', 'ci.yml', '--repo', repository, '--ref', branch], cwd=root, check=True)
    except subprocess.CalledProcessError:
        append_summary(environment, 'Normal CI dispatch failed; the draft PR and branch remain available. / '
                       '普通 CI 派发失败，草稿 PR 与分支仍保留。')
        raise
    return pr_url


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    actions = parser.add_subparsers(dest='command', required=True)
    agent = actions.add_parser('apply-agent')
    agent.add_argument('--source-commit', required=True)
    export = actions.add_parser('export')
    export.add_argument('--source-commit', required=True)
    export.add_argument('--mode', choices=('screenshots', 'agent'), required=True)
    export.add_argument('--summary', type=Path, required=True)
    export.add_argument('--output', type=Path, required=True)
    publish = actions.add_parser('publish')
    publish.add_argument('--source-commit', required=True)
    publish.add_argument('--proposal', type=Path, required=True)
    args = parser.parse_args(argv)
    if args.command == 'apply-agent':
        apply_agent(ROOT, args.source_commit, os.environ.get('AGENT_PROPOSAL', ''))
    elif args.command == 'export':
        export_proposal(ROOT, args.source_commit, args.mode, args.summary, args.output, os.environ)
    else:
        publish_proposal(ROOT, args.source_commit, args.proposal, os.environ)


if __name__ == '__main__':
    main()
