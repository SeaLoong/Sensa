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
from urllib.parse import urlencode

ROOT = Path(__file__).resolve().parents[1]
OUTCOMES = ('passed', 'expectedFailure', 'failed', 'flaky', 'skipped', 'notRun', 'interrupted')
FORBIDDEN = re.compile(r'\b(?:test|[A-Za-z_$][\w$]*Test)(?:\s*\.\s*describe)?\s*\.\s*(?:skip|fixme|only|fail)\s*\(')
ASSERTIONS = re.compile(r'\bexpect(?:\s*\.\s*[A-Za-z_$][\w$]*)?\s*\(')
SITE_REVIEW_IMAGES = {f'site-review-{page}-{locale}': f'{page}-{locale}.png'
                     for page in ('home', 'guide') for locale in ('en-US', 'zh-CN')}
SITE_REVIEW_ATTACHMENTS = {*SITE_REVIEW_IMAGES, 'site-review-source', 'site-review-manifest'}
SITE_REVIEW_PATHS = {f'tests/e2e/__review__/site/{project}/{name}'
                     for project in ('desktop', 'mobile') for name in SITE_REVIEW_IMAGES.values()}


def git(root, *arguments, input=None):
    try:
        return subprocess.check_output(['git', '-c', 'safe.directory=' + str(root.resolve()),
                                        '-c', 'core.hooksPath=/dev/null', *arguments],
                                       cwd=root, input=input, stderr=subprocess.PIPE, timeout=120)
    except subprocess.CalledProcessError as error:
        detail = error.stderr.decode('utf-8', errors='replace').strip()[-1500:]
        raise ValueError(f'Git {arguments[0]} failed / Git 操作失败: {detail}') from error


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
    if parts[2] == '__review__' and name not in SITE_REVIEW_PATHS:
        raise ValueError('Unknown site review image / 未知的站点审阅图片: ' + name)
    if mode == 'screenshots' and name not in SITE_REVIEW_PATHS and (
            len(parts) < 5 or parts[2] != '__screenshots__'
            or parts[3] not in ('desktop', 'mobile') or not name.endswith('.png')):
        raise ValueError('Screenshot mode accepts baselines and eight site review PNGs / 截图模式只修改基线与八张站点审阅 PNG: ' + name)
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
            exists = subprocess.run(['git', '-c', 'safe.directory=' + str(root.resolve()),
                                     'cat-file', '-e', 'HEAD:' + name], cwd=root,
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


def attachment_path(name):
    if not isinstance(name, str):
        raise ValueError('Missing site attachment path / 缺少站点附件路径')
    parts = PurePosixPath(name).parts
    if ('\\' in name or '\x00' in name or PurePosixPath(name).as_posix() != name
            or len(parts) < 4 or parts[:3] != ('artifacts', 'e2e', 'results')
            or any(part in ('.', '..') or part.startswith('.') for part in parts)):
        raise ValueError('Site attachments must belong to this browser output / 站点附件必须位于本次浏览器输出目录')
    return name


def read_attachment(root, attachment, content_type):
    name = attachment_path(attachment.get('path'))
    file = root / name
    limit = 32 * 1024 * 1024 if content_type == 'image/png' else 1024 * 1024
    if (attachment.get('contentType') != content_type or not file.is_file()
            or any(parent.is_symlink() for parent in (file, *file.parents))
            or file.stat().st_size > limit):
        raise ValueError('Invalid site attachment / 站点附件无效: ' + name)
    data = file.read_bytes()
    if content_type == 'image/png' and not data.startswith(b'\x89PNG\r\n\x1a\n'):
        raise ValueError('Invalid site review PNG / 站点审阅 PNG 无效: ' + name)
    return data


def collect_site_review(root, summary, source_commit, environment):
    """Collect fixed browser attachments; ordinary CI never writes review files."""
    run, attempt, repository = run_identity(environment)
    review = {'schema': 1, 'commit': source_commit, 'repository': repository,
              'runId': run, 'attempt': attempt, 'projects': []}
    cases, used_paths, images = {}, set(), {}
    for case in summary['tests']:
        attachments = [item for item in case['attempts'][-1].get('attachments', [])
                       if item.get('name') in SITE_REVIEW_ATTACHMENTS]
        if not attachments:
            continue
        project = case.get('project')
        if (case.get('file') != 'tests/e2e/site.spec.js' or project not in ('desktop', 'mobile')
                or project in cases or not isinstance(case.get('id'), str) or not case['id']
                or len(attachments) != len(SITE_REVIEW_ATTACHMENTS)
                or {item['name'] for item in attachments} != SITE_REVIEW_ATTACHMENTS):
            raise ValueError('Incomplete or duplicate site review case / 站点审阅用例缺失或重复')
        cases[project] = case
        attached = {item['name']: item for item in attachments}
        for item in attachments:
            name = attachment_path(item.get('path'))
            if name in used_paths:
                raise ValueError('Site attachment reused across captures / 站点附件被重复使用')
            used_paths.add(name)
        proof_bytes = read_attachment(root, attached['site-review-source'], 'application/json')
        proof = json.loads(proof_bytes)
        manifest_bytes = read_attachment(root, attached['site-review-manifest'], 'application/json')
        manifest_digest = hashlib.sha256(manifest_bytes).hexdigest()
        site_manifest = json.loads(manifest_bytes)
        if (not isinstance(proof, dict) or proof.get('schema') != 1
                or proof.get('commit') != source_commit or proof.get('repository') != repository
                or proof.get('runId') != run or proof.get('attempt') != attempt
                or proof.get('project') != project or proof.get('testId') != case['id']
                or proof.get('siteManifestSha256') != manifest_digest
                or not isinstance(site_manifest, dict) or site_manifest.get('commit') != source_commit):
            raise ValueError('Site capture source or run identity differs / 站点截图的源码或运行身份不符')
        proof_images = proof.get('images')
        if (not isinstance(proof_images, list) or len(proof_images) != len(SITE_REVIEW_IMAGES)
                or any(not isinstance(item, dict) for item in proof_images)
                or {item.get('attachment') for item in proof_images} != set(SITE_REVIEW_IMAGES)):
            raise ValueError('Incomplete site capture image digests / 站点截图摘要不完整')
        digests = {item['attachment']: item.get('sha256') for item in proof_images}
        record = {'project': project, 'testId': case['id'],
                  'sourcePath': attached['site-review-source']['path'],
                  'sourceSha256': hashlib.sha256(proof_bytes).hexdigest(),
                  'siteManifestPath': attached['site-review-manifest']['path'],
                  'siteManifestSha256': manifest_digest, 'images': []}
        for attachment, filename in SITE_REVIEW_IMAGES.items():
            data = read_attachment(root, attached[attachment], 'image/png')
            digest = hashlib.sha256(data).hexdigest()
            if digests[attachment] != digest:
                raise ValueError('Site capture image digest changed / 站点截图摘要已变化')
            target = f'tests/e2e/__review__/site/{project}/{filename}'
            images[target] = data
            record['images'].append({'path': target, 'attachment': attachment,
                                     'sourcePath': attached[attachment]['path'], 'sha256': digest})
        review['projects'].append(record)
    if set(cases) != {'desktop', 'mobile'} or set(images) != SITE_REVIEW_PATHS:
        raise ValueError('All eight current-run site images are required / 需要本次运行的完整八张站点图片')
    review['projects'].sort(key=lambda item: item['project'])
    return review, images


def validate_site_review(review, manifest, root=None):
    if (not isinstance(review, dict) or review.get('schema') != 1
            or any(review.get(key) != manifest.get(key) for key in ('commit', 'repository', 'runId', 'attempt'))
            or not isinstance(review.get('projects'), list) or len(review['projects']) != 2):
        raise ValueError('Site review provenance differs from proposal / 站点审阅来源与候选不符')
    projects, paths, attachments = set(), set(), set()
    for record in review['projects']:
        if (not isinstance(record, dict) or record.get('project') not in ('desktop', 'mobile')
                or record['project'] in projects or not isinstance(record.get('testId'), str) or not record['testId']
                or not isinstance(record.get('images'), list) or len(record['images']) != 4):
            raise ValueError('Invalid site review project / 站点审阅项目无效')
        project = record['project']
        projects.add(project)
        entries = [(record.get('sourcePath'), record.get('sourceSha256')),
                   (record.get('siteManifestPath'), record.get('siteManifestSha256'))]
        for item in record['images']:
            if not isinstance(item, dict) or item.get('attachment') not in SITE_REVIEW_IMAGES:
                raise ValueError('Invalid site review image / 站点审阅图片无效')
            expected = f'tests/e2e/__review__/site/{project}/{SITE_REVIEW_IMAGES[item["attachment"]]}'
            if item.get('path') != expected or expected in paths:
                raise ValueError('Site review paths differ from fixed images / 站点审阅图片路径不符')
            paths.add(expected)
            entries.append((item.get('sourcePath'), item.get('sha256')))
            if root is not None:
                validate_files(root, [expected], 'screenshots')
                if hashlib.sha256((root / expected).read_bytes()).hexdigest() != item.get('sha256'):
                    raise ValueError('Published site image differs from capture / 待发布站点图片与采集内容不同')
        for source, digest in entries:
            attachment_path(source)
            if source in attachments or not isinstance(digest, str) or not re.fullmatch(r'[a-f0-9]{64}', digest):
                raise ValueError('Invalid site review attachment digest / 站点审阅附件摘要无效')
            attachments.add(source)
    if paths != SITE_REVIEW_PATHS:
        raise ValueError('Incomplete site review manifest / 站点审阅清单不完整')


def export_proposal(root, source_commit, mode, summary_path, output, environment):
    assert_source(root, source_commit)
    summary = json.loads(summary_path.read_text(encoding='utf-8'))
    counts = validate_candidate(summary, source_commit, environment)
    review, images = collect_site_review(root, summary, source_commit, environment)
    validate_files(root, changed_paths(root), mode)
    for name, data in images.items():
        target = root / name
        if any(parent.is_symlink() for parent in (target, *target.parents)):
            raise ValueError('Site review destination cannot be a symlink / 站点审阅目标不能是符号链接')
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
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
                'files': [{'path': name, 'sha256': hashlib.sha256((root / name).read_bytes()).hexdigest()} for name in paths],
                'siteReview': review}
    validate_site_review(review, manifest, root)
    (output / 'proposal.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    if environment.get('GITHUB_OUTPUT'):
        with open(environment['GITHUB_OUTPUT'], 'a', encoding='utf-8') as stream:
            stream.write('changed=' + str(bool(paths)).lower() + '\n')
    append_summary(environment, f'### E2E proposal / E2E 候选\n\n{len(paths)} changed files; {counts["passed"]} passing candidate cases. '
                   'Images remain unreviewed; no baseline acceptance or merge occurred. / 图片尚未审阅，未接受基线或合并。'
                   + ('\n\nNo changes; no branch or PR is needed. / 内容未变化，无需分支或 PR。' if not paths else ''))
    return manifest


def remote_branch(root, branch):
    """Resolve exactly one branch; never replace an existing proposal branch."""
    reference = 'refs/heads/' + branch
    output = git(root, 'ls-remote', '--heads', 'origin', reference).decode().splitlines()
    if not output:
        return None
    if len(output) != 1:
        raise ValueError('Duplicate proposal branch / 候选分支重复')
    commit, separator, name = output[0].partition('\t')
    if separator != '\t' or name != reference:
        raise ValueError('Invalid proposal branch identity / 候选分支身份无效')
    return sha(commit)


def verify_remote_proposal(root, branch, commit, source_commit, tree):
    git(root, 'fetch', '--no-tags', '--no-recurse-submodules', 'origin', 'refs/heads/' + branch)
    if git(root, 'rev-parse', 'FETCH_HEAD').decode().strip() != commit:
        raise ValueError('Proposal branch changed during recovery / 恢复时候选分支已变更')
    ancestry = git(root, 'rev-list', '--parents', '-n', '1', commit).decode().strip().split()
    if ancestry != [commit, source_commit] or git(root, 'rev-parse', commit + '^{tree}').decode().strip() != tree:
        raise ValueError('Existing proposal branch differs from checked candidate / 已有分支与已检查候选不同')


def existing_pr(root, repository, branch, commit):
    query = urlencode({'state': 'all', 'head': repository.split('/')[0] + ':' + branch,
                       'base': 'main', 'per_page': '100'})
    response = subprocess.check_output(['gh', 'api', f'repos/{repository}/pulls?{query}'],
                                       cwd=root, text=True, timeout=60)
    pulls = json.loads(response)
    if not isinstance(pulls, list) or len(pulls) > 1:
        raise ValueError('Ambiguous proposal PR identity / 候选 PR 身份不明确')
    if not pulls:
        return None
    pull = pulls[0]
    head, base = pull.get('head', {}), pull.get('base', {})
    number = pull.get('number')
    expected_url = f'https://github.com/{repository}/pull/{number}'
    if (type(number) is not int or number <= 0 or pull.get('html_url', '').lower() != expected_url.lower()
            or head.get('ref') != branch or head.get('sha') != commit or base.get('ref') != 'main'
            or any(part.get('repo', {}).get('full_name', '').lower() != repository.lower() for part in (head, base))):
        raise ValueError('Existing PR differs from checked proposal / 已有 PR 与已检查候选不同')
    if pull.get('state') == 'open' and pull.get('draft') is True:
        return pull['html_url']
    raise ValueError('Existing proposal review state changed; inspect it before retrying / 已有候选评审状态已变更，请先检查')


def publish_proposal(root, source_commit, directory, environment):
    assert_source(root, source_commit)
    run, attempt, repository = run_identity(environment)
    manifest = json.loads((directory / 'proposal.json').read_text(encoding='utf-8'))
    patch = (directory / 'proposal.patch').read_bytes()
    candidate_attempt = str(manifest.get('attempt', ''))
    if (manifest.get('schema') != 1 or manifest.get('commit') != source_commit
            or manifest.get('runId') != run or not re.fullmatch(r'[1-9][0-9]*', candidate_attempt)
            or int(candidate_attempt) > int(attempt)
            or manifest.get('repository') != repository or manifest.get('mode') not in ('screenshots', 'agent')
            or manifest.get('patchSha256') != hashlib.sha256(patch).hexdigest()):
        raise ValueError('Proposal identity or digest changed / 候选身份或摘要已变化')
    counts = manifest.get('counts', {})
    if (not isinstance(counts, dict) or not all(type(counts.get(key)) is int and counts[key] >= 0 for key in ('total', *OUTCOMES))
            or counts['total'] <= 0 or counts['passed'] != counts['total']
            or any(counts[key] for key in OUTCOMES if key != 'passed')):
        raise ValueError('Proposal does not retain successful candidate counts / 候选缺少成功用例计数')
    files = manifest.get('files')
    if not isinstance(files, list) or not files or any(not isinstance(item, dict) for item in files):
        raise ValueError('Proposal has no changed files / 候选没有变化文件')
    validate_site_review(manifest.get('siteReview'), manifest)
    paths = apply_patch(root, patch, manifest['mode'])
    actual = {name: hashlib.sha256((root / name).read_bytes()).hexdigest() for name in paths}
    if len(files) != len(actual) or actual != {item.get('path'): item.get('sha256') for item in files}:
        raise ValueError('Applied files differ from validated candidates / 应用内容与已检查候选不一致')
    validate_site_review(manifest['siteReview'], manifest, root)
    # Re-running only the publisher retains the successful candidate artifact's
    # identity. A full candidate rerun gets its own attempt and review branch.
    branch = f'codex/e2e-update-{run}-{candidate_attempt}'
    tree = git(root, 'write-tree').decode().strip()
    commit = remote_branch(root, branch)
    if commit:
        verify_remote_proposal(root, branch, commit, source_commit, tree)
    else:
        git(root, 'switch', '-c', branch)
        git(root, 'config', 'user.name', 'github-actions[bot]')
        git(root, 'config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com')
        git(root, 'commit', '-m', 'Update E2E candidates for ' + source_commit[:8])
        commit = sha(git(root, 'rev-parse', 'HEAD').decode().strip())
        git(root, 'push', 'origin', 'HEAD:refs/heads/' + branch)
    recovered = existing_pr(root, repository, branch, commit)
    if recovered:
        append_summary(environment, f'### Existing E2E proposal / 已有 E2E 候选\n\n{recovered}\n\n'
                       'The checked candidate is already on this review branch. / 已检查候选已在该评审分支中。')
        return recovered
    url = f'https://github.com/{repository}/actions/runs/{run}'
    body = (f'Candidate updates for `{source_commit}` from [Actions run]({url}), candidate attempt {candidate_attempt}.\n\n'
            f'Candidate cases: {manifest["counts"]["passed"]}/{manifest["counts"]["total"]} passed; '
            'normal comparison and image review are still required. / 候选用例已通过，仍须普通比较与审图。\n\n'
            f'{manifest["counts"]["passed"]} passing candidate cases; {len(files)} changed files.\n\n'
            '**Draft: images and assertion changes require human review. This workflow does not approve baselines or merge.**\n\n'
            'Review expected/actual/diff, behavior assertions and both viewports. The PAT-created pull request starts normal comparison CI automatically.\n\n'
            '**草稿：图片及断言变化须人工审阅；此任务不会批准基线或合并。** 请检查差异图、行为断言与两个视口。\n')
    body += ('\n### Site images for review / 站点审阅原图\n\n'
             'Open each homepage and first-run guide image in both languages and viewports. '
             'These are browser captures for visual review; application baselines retain their normal comparison checks.\n\n'
             '逐张查看两种语言、两个视口的首页和首次使用指南。以下原图用于人工审图；应用基线继续进行普通截图比较。\n\n'
             f'Source / 源码: `{source_commit}` · Run / 运行: [{run}]({url}/attempts/{candidate_attempt}) · Attempt: {candidate_attempt}\n\n')
    for project in manifest['siteReview']['projects']:
        for item in project['images']:
            label = project['project'] + ' · ' + PurePosixPath(item['path']).name
            body += f'- [{label}](https://github.com/{repository}/blob/{commit}/{item["path"]})\n'
    with tempfile.TemporaryDirectory(prefix='sensa-e2e-pr-') as temporary:
        body_file = Path(temporary) / 'body.md'
        body_file.write_text(body, encoding='utf-8')
        try:
            pr_url = subprocess.check_output(['gh', 'pr', 'create', '--repo', repository, '--base', 'main',
                '--head', branch, '--draft', '--title', 'Update E2E candidates for ' + source_commit[:8],
                '--body-file', str(body_file)], cwd=root, text=True, timeout=60).strip()
        except subprocess.CalledProcessError:
            append_summary(environment, f'### Draft PR was not created / 草稿 PR 创建失败\n\n'
                f'The candidate branch `{branch}` was pushed and is retained. / 候选分支已推送并保留。\n\n'
                'GitHub rejected PR creation. Check the failed step and SENSA_PAT configuration. / '
                '请查看失败步骤并检查 SENSA_PAT 配置。')
            raise
    append_summary(environment, f'### Draft E2E proposal / E2E 草稿候选\n\n{pr_url}\n\nBranch: `{branch}`. '
                   'Images remain unreviewed. / 图片仍待人工审阅。')
    # SENSA_PAT-created PRs emit pull_request events. Explicit dispatch would
    # duplicate the normal CI that GitHub starts for the newly opened PR.
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
    try:
        main()
    except Exception as error:
        detail = str(error).replace('%', '%25').replace('\r', '%0D').replace('\n', '%0A')
        print('::error title=E2E proposal::' + detail, flush=True)
        raise
