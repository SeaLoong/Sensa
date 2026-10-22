"""Validate tags and package immutable assets. / 验证标签并打包不可变资产；仅标准库."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import zipfile
import gzip
import tarfile
import io

ROOT = Path(__file__).resolve().parents[1]
RUNTIMES = ('win-x64','win-arm64','linux-x64','linux-arm64','osx-x64','osx-arm64')
PARAMETER_GEOMETRY_ASSETS = (
    'docs/parameter-geometry.html',
    'docs/assets/osc-parameter-reference.js',
    'docs/assets/parameter-geometry-model.js',
    'docs/assets/parameter-geometry-view.js',
    'docs/assets/parameter-geometry-style.css',
    'docs/assets/parameter-geometry-3d.js',
    'docs/assets/parameter-geometry-3d.LICENSE.txt',
)

def validate_unity():
    root = ROOT / 'unity/top.sealoong.sensa'
    info = json.loads((root / 'package.json').read_text(encoding='utf-8'))
    guids = set()
    for item in root.rglob('*'):
        if item.suffix == '.meta':
            match = re.search(r'^guid: ([0-9a-f]{32})$', item.read_text(), re.M)
            if not match or match[1] in guids:
                raise ValueError(f'Invalid or duplicate GUID / GUID 无效或重复: {item}')
            guids.add(match[1])
        elif not Path(str(item) + '.meta').is_file():
            raise ValueError(f'Missing .meta / 缺少 .meta: {item}')
    for item in list(root.rglob('*.prefab')) + list(root.rglob('*.asset')):
        text = item.read_text(encoding='utf-8')
        references = re.findall(r'guid: ([0-9a-f]{32})', text)
        if any(reference not in guids for reference in references):
            raise ValueError(f'Unresolved asset/script GUID / 资产或脚本 GUID 无法解析: {item}')
        definitions = re.findall(r'^--- !u!\d+ &(\d+)', text, re.M)
        if len(definitions) != len(set(definitions)):
            raise ValueError(f'Duplicate file ID / 文件 ID 重复: {item}')
        for reference in re.findall(r'\{fileID: (\d+)\}', text):
            if reference != '0' and reference not in definitions:
                raise ValueError(f'Unresolved local reference / 本地引用无法解析 {reference}: {item}')
    runtime = json.loads((root / 'Runtime/UnityBox.Sensa.asmdef').read_text())
    editor = json.loads((root / 'Editor/UnityBox.Sensa.Editor.asmdef').read_text())
    macro = 'SENSA_HAS_VRCRAYCAST'
    assert [v for v in runtime['versionDefines'] if v['define'] == macro] == [v for v in editor['versionDefines'] if v['define'] == macro]
    return info

def validate_tag(kind, tag):
    # Combined releases use vX.Y.Z; existing unity-vX.Y.Z packages remain readable.
    # 统一发布使用 vX.Y.Z，同时保留旧 Unity 标签的打包入口。
    prefix = 'unity-v' if kind == 'unity' and tag.startswith('unity-v') else 'v'
    if not re.fullmatch(re.escape(prefix) + r'\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?', tag):
        raise ValueError('Tag must contain a complete semantic version / 标签必须包含完整语义版本')
    version = tag[len(prefix):]
    info = validate_unity() if kind == 'unity' else json.loads((ROOT / 'package.json').read_text(encoding='utf-8'))
    if version != info['version']:
        raise ValueError(f'Tag/manifest versions differ / 标签与清单版本不一致: {version} / {info["version"]}')
    return version, info

def zip_directory(root, output):
    with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(root.rglob('*')):
            if path.is_file() and not any(part.startswith('.') for part in path.relative_to(root).parts):
                # Fixed timestamps make archives reproducible for identical input bytes.
                item = zipfile.ZipInfo(path.relative_to(root).as_posix(), (2020, 1, 1, 0, 0, 0))
                item.compress_type = zipfile.ZIP_DEFLATED
                archive.writestr(item, path.read_bytes())

def tar_directory(root, output):
    with output.open('wb') as raw, gzip.GzipFile(filename='',mode='wb',fileobj=raw,mtime=0) as compressed:
        with tarfile.open(fileobj=compressed,mode='w',format=tarfile.PAX_FORMAT) as archive:
            for path in sorted(root.rglob('*')):
                if path.is_file() and not any(part.startswith('.') for part in path.relative_to(root).parts):
                    data=path.read_bytes();item=tarfile.TarInfo(path.relative_to(root).as_posix());item.size=len(data)
                    item.mode=0o755 if path.name=='Sensa' or path.stat().st_mode & 0o111 else 0o644
                    archive.addfile(item,io.BytesIO(data))

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('kind', choices=['app', 'unity', 'check-unity'])
    parser.add_argument('--tag', default=os.environ.get('GITHUB_REF_NAME', ''))
    parser.add_argument('--source', type=Path)
    parser.add_argument('--output', type=Path, default=ROOT / 'artifacts/release')
    parser.add_argument('--runtime', choices=RUNTIMES, default='win-x64')
    parser.add_argument('--label', default='')
    args = parser.parse_args()
    if args.kind == 'check-unity':
        validate_unity(); print('Unity package metadata validated / Unity 包元数据验证通过'); return
    version, info = validate_tag(args.kind, args.tag)
    source_commit = os.environ.get('SENSA_SOURCE_COMMIT') or os.environ.get('GITHUB_SHA', '')
    if source_commit and not re.fullmatch(r'[0-9a-f]{40}', source_commit):
        raise ValueError('Source commit must be a full SHA / 源码提交必须是完整 SHA')
    if args.label and not re.fullmatch(r'[a-zA-Z0-9][a-zA-Z0-9.-]{0,95}',args.label):
        raise ValueError('Invalid build label / 构建标识无效')
    archive_version=version+('-'+args.label if args.label else '')
    if os.environ.get('GITHUB_OUTPUT'):
        with open(os.environ['GITHUB_OUTPUT'], 'a', encoding='utf-8') as stream:
            stream.write(f'stable={str("-" not in archive_version).lower()}\n')
    output = args.output; output.mkdir(parents=True, exist_ok=True)
    source = args.source or ROOT / 'unity/top.sealoong.sensa'
    if args.kind == 'app':
        executable='Sensa.exe' if args.runtime.startswith('win-') else 'Sensa'
        if not (source / executable).is_file() or not (source / 'web/app.bundle.js').is_file():
            raise ValueError('Application output is incomplete / 程序输出不完整')
        for relative in PARAMETER_GEOMETRY_ASSETS:
            published = source / 'web' / relative
            if not published.is_file() or published.read_bytes() != (ROOT / relative).read_bytes():
                raise ValueError('Published interactive document is missing or stale / 发布目录的交互文档缺失或过期: ' + relative)
        for name in ('README.md', 'README.zh-CN.md', 'README.en.md', 'GLOSSARY.md', 'LICENSE'):
            (source / name).write_bytes((ROOT / name).read_bytes())
        # Keep the README's relative documentation links usable in the desktop archive.
        for relative in ('unity/top.sealoong.sensa/AUTOMATION.md', 'unity/top.sealoong.sensa/COMPATIBILITY.md',
                         'unity/top.sealoong.sensa/GPU-TRACKING.md', 'unity/top.sealoong.sensa/README.md',
                         'tools/unity-world-lab/README.md', 'tools/unity-world-lab/DEVELOPMENT.md', 'tools/unity-world-lab/CAMERA-PROTOTYPE.md'):
            destination = source / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes((ROOT / relative).read_bytes())
        for relative in ('tools/unity-world-lab/CAPABILITIES.md', 'tools/unity-avatar-lab/README.md', 'tools/unity-avatar-lab/CAPABILITIES.md', 'tools/unity-avatar-lab/FULL-FLOW.md',
                         'scripts/shader-osc-bridge.py', 'scripts/requirements-capture.txt', 'tools/unity-world-lab/sensa-preview.json'):
            destination = source / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes((ROOT / relative).read_bytes())
        # Include canonical READMEs and every paired guide. / 包含正式 README 与全部双语指南。
        for folder in ('unity/top.sealoong.sensa', 'tools/unity-world-lab', 'tools/unity-avatar-lab'):
            for path in (ROOT / folder).glob('*.md'):
                destination = source / path.relative_to(ROOT)
                destination.parent.mkdir(parents=True, exist_ok=True)
                destination.write_bytes(path.read_bytes())
        if (ROOT/'docs').exists():
            for path in (ROOT/'docs').rglob('*'):
                if not path.is_file() or path.suffix.lower() not in ('.md', '.png', '.jpg', '.jpeg'):
                    continue
                destination=source/path.relative_to(ROOT);destination.parent.mkdir(parents=True,exist_ok=True);destination.write_bytes(path.read_bytes())
        # Keep this executable-document allowlist narrow and preserve offline relative paths.
        # 仅复制明确允许的交互文档，保留离线相对路径。
        for relative in PARAMETER_GEOMETRY_ASSETS:
            destination = source / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes((ROOT / relative).read_bytes())
        (source/'BUILD-INFO.json').write_text(json.dumps({'version':version,'runtime':args.runtime,'label':args.label,'commit':source_commit},indent=2)+'\n',encoding='utf-8')
    suffix='zip' if args.kind=='unity' or args.runtime.startswith('win-') else 'tar.gz'
    name = f'top.sealoong.sensa-{archive_version}.zip' if args.kind == 'unity' else f'Sensa-{archive_version}-{args.runtime}.{suffix}'
    (zip_directory if suffix=='zip' else tar_directory)(source, output / name)
    digest = hashlib.sha256((output / name).read_bytes()).hexdigest()
    (output / 'SHA256SUMS.txt').write_text(f'{digest}  {name}\n', encoding='utf-8')
    if args.kind == 'unity' and not args.label:
        info['url'] = f'https://github.com/{os.environ["GITHUB_REPOSITORY"]}/releases/download/{args.tag}/{name}'
        info['sha256'] = digest
        (output / 'vpm-package.json').write_text(json.dumps(info, ensure_ascii=False, indent=2), encoding='utf-8')
    label = 'Unity VPM package' if args.kind == 'unity' else args.runtime + ' self-contained build'
    chinese = 'Unity VPM 资产包' if args.kind == 'unity' else args.runtime + ' 自包含程序'
    notes = f'''{label} {archive_version}

See the [installation and usage guides](https://sealoong.github.io/Sensa/). The [interactive parameter explorer](https://sealoong.github.io/Sensa/parameter-geometry.html?lang=en-US) works without installing Sensa.

SHA256: `{digest}`

## 简体中文

{chinese} {archive_version}

请阅读[安装与使用文档](https://sealoong.github.io/Sensa/?lang=zh-CN)。[交互参数图解](https://sealoong.github.io/Sensa/parameter-geometry.html?lang=zh-CN)无需安装 Sensa。

SHA256 校验值：`{digest}`
'''
    notes_path=ROOT/'artifacts/release-notes.txt';notes_path.parent.mkdir(parents=True,exist_ok=True)
    notes_path.write_text(notes, encoding='utf-8')
    print(name)

if __name__ == '__main__':
    main()
