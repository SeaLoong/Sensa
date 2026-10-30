"""Resolve one build version and commit, or apply it inside a build workspace.
确定一次构建的版本与提交；只在构建工作区同步版本，不创建标签或发布。
"""
import argparse
import json
import os
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
VERSION = r'(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)'
STABLE_TAG = re.compile(r'(?P<prefix>v|unity-v)(?P<version>' + VERSION + r')')
JSON_VERSIONS = ('package.json', 'package-lock.json', 'unity/top.sealoong.sensa/package.json')


def version_parts(value):
    if not isinstance(value, str) or not re.fullmatch(VERSION, value):
        raise ValueError('Version must be X.Y.Z without leading zeroes / 版本须为 X.Y.Z，不能含前导零')
    return tuple(int(part) for part in value.split('.'))


def repository_version(root):
    """Reject stale metadata before planning or modifying any file."""
    versions = {}
    for relative in JSON_VERSIONS:
        data = json.loads((root / relative).read_text(encoding='utf-8-sig'))
        versions[relative] = data.get('version')
        if relative == 'package-lock.json':
            versions['package-lock.json packages[""]'] = data.get('packages', {}).get('', {}).get('version')
    for value in versions.values():
        version_parts(value)
    if len(set(versions.values())) != 1:
        raise ValueError('Repository versions disagree / 仓库版本不一致: '
                         + ', '.join(f'{name}={value}' for name, value in versions.items()))
    return next(iter(versions.values()))


def stable_versions(tags):
    return [(tag, match['prefix'], match['version']) for tag in tags
            if (match := STABLE_TAG.fullmatch(tag))]


def resolve_version(source_version, tags, requested=''):
    """Use an unreleased source version, otherwise increment the highest patch."""
    source = version_parts(source_version)
    published = stable_versions(tags)
    highest = max((version_parts(version) for _, _, version in published), default=None)
    if requested:
        chosen = version_parts(requested)
        if chosen < source:
            raise ValueError('Requested version is below repository version / 指定版本不能低于仓库版本')
        if highest is not None and chosen <= highest:
            raise ValueError('Requested version must exceed existing stable tags / 指定版本必须高于已有正式标签')
        return requested
    if highest is None or source > highest:
        return source_version
    return '.'.join(map(str, (highest[0], highest[1], highest[2] + 1)))


def previous_stable_tag(tags):
    """Use the highest stable version; prefer the canonical name for equal versions."""
    candidates = stable_versions(tags)
    selected = max(candidates, key=lambda entry: (version_parts(entry[2]), entry[1] == 'v'), default=None)
    return selected[0] if selected else ''


def release_plan(root, channel, requested='', environment=None):
    if channel not in ('preview', 'stable'):
        raise ValueError('Unknown release channel / 未知发布类型')
    environment = os.environ if environment is None else environment
    source_version = repository_version(root)
    commit = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip()
    if not re.fullmatch(r'[a-f0-9]{40}', commit):
        raise ValueError('Expected a full commit SHA / 必须取得完整提交 SHA')
    tags = subprocess.check_output(['git', 'tag', '--list'], cwd=root, text=True).splitlines()
    version = resolve_version(source_version, tags, requested)
    if channel == 'stable':
        tag, label = 'v' + version, ''
    else:
        if requested:
            raise ValueError('Version override is only for stable releases / 只有正式发布可指定版本')
        run = environment.get('GITHUB_RUN_NUMBER', '')
        attempt = environment.get('GITHUB_RUN_ATTEMPT', '')
        if not re.fullmatch(r'[1-9][0-9]*', run) or not re.fullmatch(r'[1-9][0-9]*', attempt):
            raise ValueError('Preview needs a positive run number and attempt / 预发布需要有效运行编号与次数')
        tag = f'preview-{run}-{attempt}-{commit[:8]}'
        label = f'preview.{run}.{attempt}.{commit[:8]}'
    return {'commit': commit, 'version': version, 'tag': tag, 'label': label,
            'previous_tag': previous_stable_tag(tags)}


def apply_version(root, version):
    """Update all package identities together without changing dependency versions."""
    version_parts(version)
    repository_version(root)
    replacements = {}
    for relative in JSON_VERSIONS:
        destination = root / relative
        original = destination.read_bytes()
        data = json.loads(original.decode('utf-8-sig'))
        data['version'] = version
        if relative == 'package-lock.json':
            data['packages']['']['version'] = version
        text = json.dumps(data, ensure_ascii=False, indent=2) + '\n'
        replacements[destination] = (b'\xef\xbb\xbf' if original.startswith(b'\xef\xbb\xbf') else b'') + text.encode('utf-8')
    for destination, content in replacements.items():
        destination.write_bytes(content)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--channel', choices=('preview', 'stable'))
    parser.add_argument('--version', default='')
    parser.add_argument('--apply-version')
    args = parser.parse_args(argv)
    if args.apply_version is not None:
        if args.channel is not None or args.version:
            parser.error('--apply-version cannot be combined with release planning')
        apply_version(ROOT, args.apply_version)
        print('Build workspace version / 构建工作区版本: ' + args.apply_version)
        return
    if args.channel is None:
        parser.error('--channel is required when planning a release')
    plan = release_plan(ROOT, args.channel, args.version)
    if os.environ.get('GITHUB_OUTPUT'):
        with open(os.environ['GITHUB_OUTPUT'], 'a', encoding='utf-8') as output:
            output.writelines(f'{key}={value}\n' for key, value in plan.items())
    print(json.dumps(plan, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
