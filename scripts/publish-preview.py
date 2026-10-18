"""Publish verified candidates and retain ten prereleases.
发布已验证候选，并保留最近十个预发布；标准库实现。
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

ROOT = Path(__file__).resolve().parents[1]
RUNTIMES = ('win-x64', 'win-arm64', 'linux-x64', 'linux-arm64', 'osx-x64', 'osx-arm64')
RETAIN_PRERELEASES = 10


def collect(root):
    """Require every archive and checksum. / 要求所有压缩包和校验值完整."""
    files = []
    for rid in RUNTIMES:
        suffix = '.zip' if rid.startswith('win-') else '.tar.gz'
        matches = list(root.rglob('Sensa-*-'+rid+suffix))
        if len(matches) != 1:
            raise ValueError('Expected one archive per runtime / 每个平台必须有一个压缩包: ' + rid)
        files.extend(matches)
    unity = list(root.rglob('top.sealoong.sensa-*.zip'))
    if len(unity) != 1:
        raise ValueError('Expected one Unity archive / 必须有一个 Unity 压缩包')
    files.extend(unity)
    for path in files:
        expected = (path.parent / 'SHA256SUMS.txt').read_text(encoding='utf-8').splitlines()
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        if f'{digest}  {path.name}' not in expected:
            raise ValueError('Checksum mismatch / 校验值不一致: ' + path.name)
    return files


def verify_draft(release, tag, sha, assets):
    """Verify the remote identity and every asset before publication.
    发布前核对远端身份及全部资产。
    """
    if (release.get('draft') is not True or release.get('prerelease') is not True
            or release.get('tag_name') != tag or release.get('target_commitish') != sha):
        raise ValueError('Draft identity/state changed / 草稿身份或状态已变更')
    uploaded = release.get('assets', [])
    by_name = {asset['name']: asset for asset in uploaded}
    if len(by_name) != len(uploaded) or set(by_name) != {path.name for path in assets}:
        raise ValueError('Unexpected or missing assets / 资产缺失或含意外资产')
    for path in assets:
        remote = by_name[path.name]
        digest = 'sha256:' + hashlib.sha256(path.read_bytes()).hexdigest()
        if remote.get('state') != 'uploaded' or remote.get('size') != path.stat().st_size or remote.get('digest') != digest:
            raise ValueError('Remote upload verification failed / 远端上传校验失败: ' + path.name)


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

    def create(self, tag, sha, title, notes):
        self._run('release', 'create', tag, '--repo', self.repository, '--target', sha,
                  '--draft', '--prerelease', '--latest=false', '--title', title, '--notes-file', str(notes))

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

    def publish(self, tag):
        self._run('release', 'edit', tag, '--repo', self.repository,
                  '--draft=false', '--prerelease', '--latest=false')

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


def upload_and_publish(tag, sha, assets, releases, *, pause=time.sleep):
    """Keep failed uploads private; publish only after remote verification.
    上传失败时保留私有草稿，仅远端验证成功后发布。
    """
    for path in assets:
        for attempt in range(3):
            try:
                releases.upload(tag, path)
                break
            except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
                if attempt == 2:
                    raise
                print(f'Retrying upload / 重试上传 {path.name} ({attempt + 2}/3)', flush=True)
                pause(3 * (attempt + 1))
    verify_draft(releases.draft(tag), tag, sha, assets)
    releases.publish(tag)


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


def validate_run(environment):
    """Require main-push identity and this commit's full E2E comparison.
    要求 main push 身份及本提交的全量 E2E 比较证据。
    """
    if environment.get('GITHUB_EVENT_NAME') != 'push' or environment.get('GITHUB_REF') != 'refs/heads/main':
        raise ValueError('Automatic prereleases require main push / 自动预发布仅限 main push')
    sha = environment.get('GITHUB_SHA', '')
    number = environment.get('GITHUB_RUN_NUMBER', '')
    attempt = environment.get('GITHUB_RUN_ATTEMPT', '')
    if not re.fullmatch('[0-9a-f]{40}', sha) or not number.isdigit() or not attempt.isdigit():
        raise ValueError('Invalid run identity / 运行身份无效')
    if environment.get('SENSA_E2E_COMPARISON_SHA') != sha:
        raise ValueError('Current-commit full E2E comparison required / 必须通过本提交的全量 E2E 比较')
    return sha, number, attempt


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--prune-only', action='store_true',
                        help='Retain ten prereleases without publishing / 仅保留十个预发布，不发布新版本')
    args = parser.parse_args()
    if args.prune_only:
        removed = prune_prereleases(GitHubReleases(os.environ['GITHUB_REPOSITORY']))
        print(f'Removed old prereleases / 已清理旧预发布: {len(removed)}')
        return
    sha, number, attempt = validate_run(os.environ)
    releases = GitHubReleases(os.environ['GITHUB_REPOSITORY'])
    existing = superseding_preview(releases.list(), sha, number, attempt)
    if existing is not None:
        url = f'https://github.com/{releases.repository}/releases/tag/{existing["tag_name"]}'
        message = f'同一或更新预览已发布，跳过旧候选。 / Identical or newer preview already published; skipping candidate. {url}'
        if os.environ.get('GITHUB_STEP_SUMMARY'):
            with open(os.environ['GITHUB_STEP_SUMMARY'], 'a', encoding='utf-8') as report:
                report.write(message + '\n')
        print(message)
        return
    tag = f'preview-{number}-{attempt}-{sha[:8]}'
    output = ROOT / 'artifacts' / 'preview'
    output.mkdir(parents=True, exist_ok=True)
    archives = collect(ROOT / 'artifacts' / 'downloaded')
    for path in archives:
        shutil.copyfile(path, output / path.name)
    checksums = output / 'SHA256SUMS.txt'
    checksums.write_text(''.join(f'{hashlib.sha256(path.read_bytes()).hexdigest()}  {path.name}\n' for path in archives), encoding='utf-8')
    notes = ROOT / 'artifacts' / 'preview-notes.md'
    notes.write_text(f'''开发预览 / Development preview · `{sha}`

Windows / Linux / macOS 的 x64 与 ARM64 自包含程序，以及独立 Unity 资产包。
Self-contained Windows / Linux / macOS applications for x64 and ARM64, plus the Unity package.

按系统和处理器选择文件。Windows 解压后运行 Sensa.exe；Linux/macOS 解包后运行 ./Sensa。
Select your OS and processor. Extract and run Sensa.exe on Windows or ./Sensa on Linux/macOS.

打开 http://127.0.0.1:5086 。保留完整目录；无需另装 .NET。
Open http://127.0.0.1:5086 . Keep the complete directory; no separate .NET installation is needed.

此候选已通过本提交的全量 E2E 截图比较及各平台隔离冒烟。真实硬件、签名/公证和 PCVR 行为尚未验收。
This candidate passed full E2E screenshot comparisons for this commit and isolated platform smoke checks. Real hardware, signing/notarization and PCVR remain unverified.

Unity Avatar 项目需相应 SDK 和 Modular Avatar/NDMF；SPS 自动配置另需 VRCFury。
Unity Avatar projects need the matching SDK and Modular Avatar/NDMF; SPS automation also needs VRCFury.

此预览不更新 VPM 稳定索引。仅保留最近十个已发布预发布；稳定版、草稿与 Git tag 保留。
This preview does not update the stable VPM index. Only the latest ten published prereleases are retained; stable releases, drafts and Git tags are preserved.

使用文档见压缩包 README 和 docs/；校验值见 SHA256SUMS.txt。
See the packaged README and docs/ for usage, and SHA256SUMS.txt for checksums.
''', encoding='utf-8')
    assets = [output / path.name for path in archives] + [checksums]
    releases.create(tag, sha, f'Sensa 开发预览 / Development preview #{number} ({sha[:8]})', notes)
    upload_and_publish(tag, sha, assets, releases)
    removed = prune_prereleases(releases)
    url = f'https://github.com/{releases.repository}/releases/tag/{tag}'
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        with open(os.environ['GITHUB_STEP_SUMMARY'], 'a', encoding='utf-8') as report:
            report.write(f'[下载开发预览 / Download preview]({url})\n\n')
            report.write(f'Removed old prereleases / 已清理旧预发布: {len(removed)}\n')
    print(url)


if __name__ == '__main__':
    main()
