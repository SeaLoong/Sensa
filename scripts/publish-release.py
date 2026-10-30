"""Publish checked builds and retain ten prereleases.
发布通过检查的构建产物，并保留最近十个预发布。
"""
import argparse
from datetime import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import time
from html import escape
from release_notes import compose_release_notes

ROOT = Path(__file__).resolve().parents[1]
RUNTIMES = ('win-x64', 'win-arm64', 'linux-x64', 'linux-arm64', 'osx-x64', 'osx-arm64')
RETAIN_PRERELEASES = 10


def regular_artifact(root, path):
    """Read only ordinary files inside the downloaded distribution tree."""
    relative = path.relative_to(root)
    current = root
    for part in ('', *relative.parts):
        current = current / part
        if current.is_symlink():
            raise ValueError('Artifact symlinks are forbidden / 发布产物不接受符号链接')
    if not path.is_file() or not path.resolve().is_relative_to(root.resolve()):
        raise ValueError('Artifact must be a regular file inside its source / 发布产物须为来源目录内的普通文件')
    return path


def collect(root):
    """Require every archive and checksum. / 要求所有压缩包和校验值完整."""
    files = []
    for rid in RUNTIMES:
        suffix = '.zip' if rid.startswith('win-') else '.tar.gz'
        matches = list(root.rglob('Sensa-*-'+rid+suffix))
        if len(matches) != 1:
            raise ValueError('Expected one archive per runtime / 每个平台必须有一个压缩包: ' + rid)
        files.extend(matches)
        desktop_suffix = '.tar.gz' if rid.startswith('linux-') else '.zip'
        desktops = list(root.rglob(f'Sensa-*-{rid}-Desktop{desktop_suffix}'))
        if len(desktops) != 1:
            raise ValueError('Expected one Electron desktop archive per runtime / 每个平台必须有一个 Electron 桌面压缩包: ' + rid)
        files.extend(desktops)
        if rid.startswith('win-'):
            for kind in ('Setup', 'SingleFile'):
                matches = list(root.rglob(f'Sensa-*-{rid}-{kind}.exe'))
                if len(matches) != 1:
                    raise ValueError('Expected one Windows download per format / Windows 每种格式必须有一个文件: ' + rid + ' ' + kind)
                files.extend(matches)
    unity = list(root.rglob('top.sealoong.sensa-*.zip'))
    if len(unity) != 1:
        raise ValueError('Expected one Unity archive / 必须有一个 Unity 压缩包')
    files.extend(unity)
    selected = set(files)
    unexpected = [path for path in root.rglob('*') if path.name.endswith(('.zip', '.tar.gz', '.exe')) and path not in selected]
    if unexpected:
        raise ValueError('Unexpected release archive / 含有意外的发布文件: ' + unexpected[0].name)
    for path in files:
        regular_artifact(root, path)
        expected = regular_artifact(root, path.parent / 'SHA256SUMS.txt').read_text(encoding='utf-8').splitlines()
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        if f'{digest}  {path.name}' not in expected:
            raise ValueError('Checksum mismatch / 校验值不一致: ' + path.name)
    return sorted(files, key=lambda path: (0 if '-Desktop.' in path.name else
                                          1 if path.name.endswith('-Setup.exe') else
                                          2 if path.name.endswith('-SingleFile.exe') else 3, path.name))


def verify_identity(release, tag, sha, channel):
    if (release.get('draft') is not True or release.get('prerelease') is not (channel == 'preview')
            or release.get('tag_name') != tag or release.get('target_commitish') != sha):
        raise ValueError('Draft identity/state changed / 草稿身份或状态已变更')


def verify_assets(release, assets):
    """Match every remote asset to the checked local bytes, including checksums."""
    uploaded = release.get('assets', [])
    by_name = {asset['name']: asset for asset in uploaded}
    if len(by_name) != len(uploaded) or set(by_name) != {path.name for path in assets}:
        raise ValueError('Unexpected or missing assets / 资产缺失或含意外资产')
    for path in assets:
        remote = by_name[path.name]
        digest = 'sha256:' + hashlib.sha256(path.read_bytes()).hexdigest()
        if remote.get('state') != 'uploaded' or remote.get('size') != path.stat().st_size or remote.get('digest') != digest:
            raise ValueError('Remote upload verification failed / 远端上传校验失败: ' + path.name)


def verify_draft(release, tag, sha, assets, channel='preview'):
    """Verify the remote identity and every asset before publication.
    发布前核对远端身份及全部资产。
    """
    verify_identity(release, tag, sha, channel)
    verify_assets(release, assets)


class GitHubReleases:
    """GitHub CLI adapter, pinned to one repository. / 固定仓库的 GitHub CLI 适配器."""

    def __init__(self, repository):
        if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]*/[A-Za-z0-9][A-Za-z0-9_.-]*', repository):
            raise ValueError('Invalid repository identity / 仓库身份无效')
        self.repository = repository

    def _query(self, *arguments):
        return subprocess.check_output(['gh', *arguments], timeout=60)

    def _run(self, *arguments, timeout=60):
        return subprocess.run(['gh', *arguments], check=True, timeout=timeout)

    def create(self, tag, sha, title, notes, channel):
        self._run('release', 'create', tag, '--repo', self.repository, '--target', sha,
                  '--draft', '--prerelease=' + str(channel == 'preview').lower(), '--latest=false',
                  '--title', title, '--notes-file', str(notes))

    def upload(self, tag, path):
        self._run('release', 'upload', tag, str(path), '--repo', self.repository, '--clobber', timeout=180)

    def draft(self, tag):
        url = self._query('release', 'view', tag, '--repo', self.repository,
                          '--json', 'apiUrl', '--jq', '.apiUrl').decode().strip()
        prefix = f'https://api.github.com/repos/{self.repository}/releases/'
        if not url.lower().startswith(prefix.lower()) or not url[len(prefix):].isdigit():
            raise ValueError('Invalid draft endpoint / 草稿端点无效')
        return self.get(int(url[len(prefix):]))

    def get(self, release_id):
        if type(release_id) is not int or release_id <= 0:
            raise ValueError('Invalid release ID / 发布 ID 无效')
        release = json.loads(self._query('api', f'repos/{self.repository}/releases/{release_id}'))
        expected = f'https://api.github.com/repos/{self.repository}/releases/{release_id}'
        if release.get('id') != release_id or release.get('url', '').lower() != expected.lower():
            raise ValueError('Remote release identity changed / 远端发布身份已变更')
        return release

    def publish(self, tag, channel='preview'):
        self._run('release', 'edit', tag, '--repo', self.repository,
                  '--draft=false', '--prerelease=' + str(channel == 'preview').lower(),
                  '--latest=' + str(channel == 'stable').lower())

    def generated_notes(self, tag, sha, previous_tag):
        if not re.fullmatch(r'(?:unity-)?v(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)', previous_tag):
            raise ValueError('An explicit stable base is required / 必须明确指定正式版比较起点')
        response = json.loads(self._query('api', '--method', 'POST', f'repos/{self.repository}/releases/generate-notes',
                              '--raw-field', 'tag_name=' + tag, '--raw-field', 'target_commitish=' + sha,
                              '--raw-field', 'previous_tag_name=' + previous_tag))
        if not isinstance(response, dict) or not isinstance(response.get('body'), str):
            raise ValueError('Invalid generated notes / 自动发布说明格式无效')
        return response['body']

    def verify_tag_target(self, tag, sha):
        refs = json.loads(self._query('api', f'repos/{self.repository}/git/matching-refs/tags/{tag}'))
        if not isinstance(refs, list):
            raise ValueError('Invalid tag reference response / 标签引用响应无效')
        matching = [item for item in refs if item.get('ref') == 'refs/tags/' + tag]
        if not matching:
            return
        if len(matching) != 1:
            raise ValueError('Duplicate tag reference / 标签引用重复')
        target = matching[0].get('object', {})
        for _ in range(5):
            if target.get('type') == 'commit' and target.get('sha') == sha:
                return
            if target.get('type') != 'tag' or not re.fullmatch('[0-9a-f]{40}', target.get('sha', '')):
                break
            target = json.loads(self._query('api', f'repos/{self.repository}/git/tags/{target["sha"]}')).get('object', {})
        raise ValueError('Tag points to a different commit / 标签指向其他提交')

    def list(self):
        pages = json.loads(self._query('api', '--paginate', '--slurp',
                                      f'repos/{self.repository}/releases?per_page=100'))
        if not isinstance(pages, list) or any(not isinstance(page, list) for page in pages):
            raise ValueError('Invalid paginated releases / 分页发布数据无效')
        return [release for page in pages for release in page]

    def delete(self, release_id):
        if type(release_id) is not int or release_id <= 0:
            raise ValueError('Invalid release ID / 发布 ID 无效')
        # Delete only the numeric release; its tag is deliberately retained.
        # 仅删除数字 ID 对应的发布；保留其 Git tag。
        self._run('api', '--method', 'DELETE', f'repos/{self.repository}/releases/{release_id}')


def upload_and_publish(tag, sha, assets, releases, *, channel='preview', pause=time.sleep):
    """Keep failed uploads private; publish only after remote verification.
    上传失败时保留私有草稿，仅远端验证成功后发布。
    """
    for path in assets:
        for attempt in range(3):
            try:
                current = releases.draft(tag)
                verify_identity(current, tag, sha, channel)
                uploaded = current.get('assets', [])
                allowed = {asset.name for asset in assets}
                names = [item.get('name') for item in uploaded]
                if len(set(names)) != len(names) or not set(names).issubset(allowed):
                    raise ValueError('Unexpected draft assets / 草稿包含意外资产')
                existing = next((item for item in uploaded if item.get('name') == path.name), None)
                if existing and existing.get('state') == 'uploaded':
                    digest = 'sha256:' + hashlib.sha256(path.read_bytes()).hexdigest()
                    if existing.get('size') != path.stat().st_size or existing.get('digest') != digest:
                        raise ValueError('Draft asset changed; refusing overwrite / 草稿资产已变更，拒绝覆盖')
                    break
                releases.upload(tag, path)
                break
            except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
                if attempt == 2:
                    raise
                print(f'Retrying upload / 重试上传 {path.name} ({attempt + 2}/3)', flush=True)
                pause(3 * (attempt + 1))
    verify_draft(releases.draft(tag), tag, sha, assets, channel)
    # target_commitish is draft metadata, not proof of an existing Git tag's
    # current target. Recheck after uploads, immediately before publication.
    releases.verify_tag_target(tag, sha)
    releases.publish(tag, channel)


def _published_identity(release):
    if release.get('prerelease') is not True or release.get('draft') is not False:
        return None
    release_id = release.get('id')
    tag, target, published = (release.get(field) for field in ('tag_name', 'target_commitish', 'published_at'))
    if (type(release_id) is not int or release_id <= 0 or
            not all(isinstance(value, str) and value and not any(c in value for c in '\r\n\0')
                    for value in (tag, target, published))):
        raise ValueError('Invalid prerelease identity / 预发布身份无效')
    timestamp = datetime.fromisoformat(published.replace('Z', '+00:00'))
    if timestamp.tzinfo is None:
        raise ValueError('Publication timestamp needs timezone / 发布时间缺少时区')
    return release_id, tag, target, published, timestamp


def prune_prereleases(releases, *, keep=RETAIN_PRERELEASES):
    """Retain newest published prereleases; recheck identity before deletion.
    保留最新已发布预发布；每次删除前重新核对身份。稳定版与草稿始终保留。
    """
    if type(keep) is not int or keep < 1:
        raise ValueError('Retention must be positive / 保留数量必须为正整数')
    candidates = []
    ids, tags = set(), set()
    for release in releases.list():
        identity = _published_identity(release)
        if identity is None:
            continue
        release_id, tag, _, _, timestamp = identity
        if release_id in ids or tag in tags:
            raise ValueError('Duplicate release identity / 发布身份重复')
        ids.add(release_id)
        tags.add(tag)
        candidates.append((timestamp, release_id, identity))
    candidates.sort(reverse=True)
    removed = []
    for _, release_id, identity in candidates[keep:]:
        fresh = _published_identity(releases.get(release_id))
        if fresh != identity:
            raise ValueError('Prerelease changed; refusing deletion / 预发布已变更，拒绝删除')
        releases.delete(release_id)
        removed.append(release_id)
    return removed


def superseding_preview(releases, sha, number, attempt):
    """Find an already published identical or newer automatic candidate.
    查找已公开的相同或更新自动候选，避免迟到运行重新发布旧产品。
    """
    candidate = (int(number), int(attempt))
    matches = []
    for release in releases:
        tag = release.get('tag_name')
        match = re.fullmatch(r'preview-([1-9][0-9]*)-([1-9][0-9]*)-([0-9a-f]{8})', tag) if isinstance(tag, str) else None
        if not match or release.get('draft') is not False or release.get('prerelease') is not True:
            continue
        identity = _published_identity(release)
        target = identity[2]
        if not re.fullmatch('[0-9a-f]{40}', target) or not target.startswith(match[3]):
            raise ValueError('Published preview identity mismatch / 已发布预览身份不一致')
        order = (int(match[1]), int(match[2]))
        if target == sha or order > candidate:
            matches.append((order, identity[0], release))
        elif order == candidate:
            raise ValueError('Preview run identity conflicts / 预览运行身份冲突')
    return max(matches, key=lambda item: (item[0], item[1]))[2] if matches else None


def validate_run(environment, channel, version, tag, sha):
    """Bind publication to its event, pinned source and same-commit comparison."""
    if environment.get('GITHUB_ACTIONS') != 'true' or environment.get('GITHUB_REF') != 'refs/heads/main':
        raise ValueError('Publication runs from main in Actions / 发布仅从 Actions 的 main 执行')
    expected_event = 'push' if channel == 'preview' else 'workflow_dispatch'
    if channel not in ('preview', 'stable') or environment.get('GITHUB_EVENT_NAME') != expected_event:
        raise ValueError('Release channel does not match its trigger / 发布渠道与触发方式不符')
    number = environment.get('GITHUB_RUN_NUMBER', '')
    attempt = environment.get('GITHUB_RUN_ATTEMPT', '')
    if not re.fullmatch('[0-9a-f]{40}', sha) or not re.fullmatch('[1-9][0-9]*', number) or not re.fullmatch('[1-9][0-9]*', attempt):
        raise ValueError('Invalid run identity / 运行身份无效')
    planned_attempt = attempt
    if channel == 'preview':
        planned = re.fullmatch(r'preview-([1-9][0-9]*)-([1-9][0-9]*)-([0-9a-f]{8})', tag)
        valid_tag = bool(planned and planned[1] == number and int(planned[2]) <= int(attempt)
                         and planned[3] == sha[:8] and sha == environment.get('GITHUB_SHA'))
        if planned:
            planned_attempt = planned[2]
    else:
        valid_tag = tag == 'v' + version
    if not valid_tag:
        raise ValueError('Release tag/source mismatch / 发布标签或源码不符')
    if environment.get('SENSA_E2E_COMPARISON_SHA') != sha:
        raise ValueError('Current-commit full E2E comparison required / 必须通过本提交的全量 E2E 比较')
    # The notes helper also validates the full stable version and repository format.
    compose_release_notes(channel, version, tag, sha, environment['GITHUB_REPOSITORY'], '')
    return number, planned_attempt


def release_assets(root, channel, version, tag, sha, repository):
    """Check archive identities and stable Unity metadata before any upload."""
    archives = collect(root)
    label = ''
    if channel == 'preview':
        match = re.fullmatch(r'preview-([1-9][0-9]*)-([1-9][0-9]*)-([0-9a-f]{8})', tag)
        if not match or match[3] != sha[:8]:
            raise ValueError('Invalid preview identity / 预览身份无效')
        label = f'-preview.{match[1]}.{match[2]}.{match[3]}'
    expected = {f'Sensa-{version}{label}-{rid}' + ('.zip' if rid.startswith('win-') else '.tar.gz') for rid in RUNTIMES}
    expected.update(f'Sensa-{version}{label}-{rid}-{kind}.exe'
                    for rid in RUNTIMES if rid.startswith('win-') for kind in ('Setup', 'SingleFile'))
    expected.update(f'Sensa-{version}{label}-{rid}-Desktop' + ('.tar.gz' if rid.startswith('linux-') else '.zip')
                    for rid in RUNTIMES)
    unity_name = f'top.sealoong.sensa-{version}{label}.zip'
    expected.add(unity_name)
    if {path.name for path in archives} != expected:
        raise ValueError('Archive version/channel mismatch / 压缩包版本或渠道不一致')
    manifests = list(root.rglob('vpm-package.json'))
    if channel == 'preview':
        if manifests:
            raise ValueError('Previews must not contain stable VPM metadata / 预览不能包含正式 VPM 元数据')
        return archives
    if len(manifests) != 1:
        raise ValueError('One stable VPM manifest is required / 正式版需要一份 VPM 元数据')
    manifest = json.loads(regular_artifact(root, manifests[0]).read_text(encoding='utf-8'))
    unity = next(path for path in archives if path.name == unity_name)
    if (manifest.get('name') != 'top.sealoong.sensa' or manifest.get('version') != version
            or manifest.get('url') != f'https://github.com/{repository}/releases/download/{tag}/{unity_name}'
            or manifest.get('sha256') != hashlib.sha256(unity.read_bytes()).hexdigest()):
        raise ValueError('Stable VPM metadata mismatch / 正式 VPM 元数据不符')
    return [*archives, manifests[0]]


def commit_notes(repository, sha, previous_tag):
    """Keep direct main commits visible even when GitHub lists only merged PRs."""
    if previous_tag and not re.fullmatch(r'(?:unity-)?v(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)', previous_tag):
        raise ValueError('Previous release must be a stable tag / 比较起点必须是正式版标签')
    revision = f'{previous_tag}..{sha}' if previous_tag else sha
    output = subprocess.check_output(['git', 'log', '--format=%H%x00%s', '--max-count=101', revision, '--'], cwd=ROOT, text=True)
    entries = []
    for line in output.splitlines():
        commit, separator, subject = line.partition('\0')
        if not separator or not re.fullmatch('[0-9a-f]{40}', commit):
            raise ValueError('Invalid commit history / 提交历史格式无效')
        # Render repository-authored titles as text, not HTML or Markdown links.
        subject = escape(' '.join(subject.split())[:300])
        subject = re.sub(r'([\\`*_{}\[\]<>])', r'\\\1', subject)
        entries.append(f'- [{commit[:8]}](https://github.com/{repository}/commit/{commit}) {subject}')
    compare = (f'https://github.com/{repository}/compare/{previous_tag}...{sha}' if previous_tag
               else f'https://github.com/{repository}/commits/{sha}')
    body = '\n'.join(entries[:100]) or 'No new commits in this range. / 此范围没有新提交。'
    if len(entries) > 100:
        body += '\n\nShowing the latest 100 commits. / 仅列出最近 100 个提交。'
    return f'### Commits / 提交\n\n{body}\n\n[Full history / 完整变更]({compare})'


def published_stable_base(releases, version):
    """An unpublished tag is a version reservation, not a release-notes base."""
    target = tuple(map(int, version.split('.')))
    candidates = []
    for release in releases:
        tag = release.get('tag_name', '')
        match = re.fullmatch(r'(unity-)?v((?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*))', tag)
        if match and release.get('draft') is False and release.get('prerelease') is False:
            parts = tuple(map(int, match[2].split('.')))
            if parts < target:
                candidates.append((parts, match[1] is None, tag))
    return max(candidates)[2] if candidates else ''


def record(message):
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        with open(os.environ['GITHUB_STEP_SUMMARY'], 'a', encoding='utf-8') as report:
            report.write(message + '\n')
    print(message)


def stage_assets(files, output):
    """Stage checked bytes and the exact checksum asset used by the publisher."""
    if output.exists():
        shutil.rmtree(output)
    output.mkdir(parents=True)
    assets = []
    for path in files:
        destination = output / path.name
        shutil.copyfile(path, destination)
        assets.append(destination)
    checksums = output / 'SHA256SUMS.txt'
    checksums.write_text(''.join(f'{hashlib.sha256(path.read_bytes()).hexdigest()}  {path.name}\n' for path in assets), encoding='utf-8')
    return [*assets, checksums]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--channel', choices=('preview', 'stable'), required=True)
    parser.add_argument('--version', required=True)
    parser.add_argument('--tag', required=True)
    parser.add_argument('--commit', required=True)
    parser.add_argument('--previous-tag', default='')
    parser.add_argument('--assets', type=Path, required=True)
    args = parser.parse_args()
    number, attempt = validate_run(os.environ, args.channel, args.version, args.tag, args.commit)
    local_commit = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
    if local_commit != args.commit:
        raise ValueError('Checkout differs from pinned release source / 检出内容与固定发布源码不符')
    releases = GitHubReleases(os.environ['GITHUB_REPOSITORY'])
    listing = releases.list()
    previous_tag = published_stable_base(listing, args.version) if args.channel == 'stable' else ''
    if args.channel == 'preview':
        existing = superseding_preview(listing, args.commit, number, attempt)
        if existing is not None:
            fresh = releases.get(existing['id'])
            if _published_identity(fresh) != _published_identity(existing):
                raise ValueError('Published preview changed / 已发布预览已变更')
            releases.verify_tag_target(existing['tag_name'], existing['target_commitish'])
            if existing['tag_name'] == args.tag:
                # A retry after successful publication must not silently accept
                # deleted or replaced assets on its already published release.
                files = release_assets(args.assets, args.channel, args.version, args.tag, args.commit, releases.repository)
                verify_assets(fresh, stage_assets(files, ROOT / 'artifacts' / 'publication'))
            # Publication may have succeeded before retention failed. A rerun
            # still completes cleanup without republishing or overwriting assets.
            removed = prune_prereleases(releases)
            record('Identical or newer preview already published / 相同或更新预览已发布: '
                   f'https://github.com/{releases.repository}/releases/tag/{existing["tag_name"]}'
                   f'\n\nRemoved old prereleases / 已清理旧预发布: {len(removed)}')
            return
    matching = [item for item in listing if item.get('tag_name') == args.tag]
    if len(matching) > 1:
        raise ValueError('Duplicate release tag / 发布标签重复')
    if matching:
        verify_identity(releases.get(matching[0]['id']), args.tag, args.commit, args.channel)
    releases.verify_tag_target(args.tag, args.commit)
    files = release_assets(args.assets, args.channel, args.version, args.tag, args.commit, releases.repository)
    output = ROOT / 'artifacts' / 'publication'
    assets = stage_assets(files, output)
    changes = ''
    if args.channel == 'stable':
        generated = releases.generated_notes(args.tag, args.commit, previous_tag) if previous_tag else ''
        history = commit_notes(releases.repository, args.commit, previous_tag)
        changes = generated + ('\n\n' if generated else '') + history
    run_id = os.environ.get('GITHUB_RUN_ID', '')
    if not re.fullmatch('[1-9][0-9]*', run_id):
        raise ValueError('Invalid Actions run ID / Actions 运行 ID 无效')
    run_url = f'https://github.com/{releases.repository}/actions/runs/{run_id}'
    notes = output / 'release-notes.md'
    notes.write_text(compose_release_notes(args.channel, args.version, args.tag, args.commit,
                                         releases.repository, changes, run_url), encoding='utf-8')
    if not matching:
        title = f'Sensa {args.version}' if args.channel == 'stable' else f'Sensa Development Preview #{number} ({args.commit[:8]})'
        releases.create(args.tag, args.commit, title, notes, args.channel)
    upload_and_publish(args.tag, args.commit, assets, releases, channel=args.channel)
    removed = prune_prereleases(releases) if args.channel == 'preview' else None
    url = f'https://github.com/{releases.repository}/releases/tag/{args.tag}'
    cleanup = f'\n\nRemoved old prereleases / 已清理旧预发布: {len(removed)}' if removed is not None else ''
    record(f'[Release {args.tag}]({url}) · [Download / 下载](https://github.com/SeaLoong/Sensa/releases/latest){cleanup}')


if __name__ == '__main__':
    main()
