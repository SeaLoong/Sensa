"""Validate version tags and package immutable release assets (stdlib only)."""
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

def validate_unity():
    root = ROOT / 'unity/top.sealoong.sensa'
    info = json.loads((root / 'package.json').read_text(encoding='utf-8'))
    guids = set()
    for item in root.rglob('*'):
        if item.suffix == '.meta':
            match = re.search(r'^guid: ([0-9a-f]{32})$', item.read_text(), re.M)
            if not match or match[1] in guids:
                raise ValueError(f'Invalid or duplicate GUID: {item}')
            guids.add(match[1])
        elif not Path(str(item) + '.meta').is_file():
            raise ValueError(f'Missing .meta: {item}')
    for item in list(root.rglob('*.prefab')) + list(root.rglob('*.asset')):
        text = item.read_text(encoding='utf-8')
        references = re.findall(r'guid: ([0-9a-f]{32})', text)
        if any(reference not in guids for reference in references):
            raise ValueError(f'Unresolved asset/script GUID: {item}')
        definitions = re.findall(r'^--- !u!\d+ &(\d+)', text, re.M)
        if len(definitions) != len(set(definitions)):
            raise ValueError(f'Duplicate file ID: {item}')
        for reference in re.findall(r'\{fileID: (\d+)\}', text):
            if reference != '0' and reference not in definitions:
                raise ValueError(f'Unresolved local reference {reference}: {item}')
    runtime = json.loads((root / 'Runtime/UnityBox.Sensa.asmdef').read_text())
    editor = json.loads((root / 'Editor/UnityBox.Sensa.Editor.asmdef').read_text())
    macro = 'SENSA_HAS_VRCRAYCAST'
    assert [v for v in runtime['versionDefines'] if v['define'] == macro] == [v for v in editor['versionDefines'] if v['define'] == macro]
    return info

def validate_tag(kind, tag):
    prefix = 'unity-v' if kind == 'unity' else 'v'
    if not re.fullmatch(re.escape(prefix) + r'\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?', tag):
        raise ValueError('Tag must contain a complete semantic version')
    version = tag[len(prefix):]
    info = validate_unity() if kind == 'unity' else json.loads((ROOT / 'package.json').read_text(encoding='utf-8'))
    if version != info['version']:
        raise ValueError(f'Tag version {version} differs from manifest {info["version"]}')
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
        validate_unity(); print('Unity package metadata validated'); return
    version, info = validate_tag(args.kind, args.tag)
    if args.label and not re.fullmatch(r'[a-zA-Z0-9][a-zA-Z0-9.-]{0,95}',args.label):
        raise ValueError('Invalid build label')
    archive_version=version+('-'+args.label if args.label else '')
    if os.environ.get('GITHUB_OUTPUT'):
        with open(os.environ['GITHUB_OUTPUT'], 'a', encoding='utf-8') as stream:
            stream.write(f'stable={str("-" not in version).lower()}\n')
    output = args.output; output.mkdir(parents=True, exist_ok=True)
    source = args.source or ROOT / 'unity/top.sealoong.sensa'
    if args.kind == 'app':
        executable='Sensa.exe' if args.runtime.startswith('win-') else 'Sensa'
        if not (source / executable).is_file() or not (source / 'web/app.bundle.js').is_file():
            raise ValueError('Application output is incomplete')
        for name in ('README.md', 'LICENSE'):
            (source / name).write_bytes((ROOT / name).read_bytes())
        # Keep the README's relative documentation links usable in the desktop archive.
        for relative in ('unity/top.sealoong.sensa/AUTOMATION.md', 'unity/top.sealoong.sensa/COMPATIBILITY.md',
                         'unity/top.sealoong.sensa/GPU-TRACKING.md', 'unity/top.sealoong.sensa/README.md',
                         'tools/unity-world-lab/README.md', 'tools/unity-world-lab/DEVELOPMENT.md', 'tools/unity-world-lab/CAMERA-PROTOTYPE.md'):
            destination = source / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes((ROOT / relative).read_bytes())
        if (ROOT/'docs').exists():
            for path in (ROOT/'docs').rglob('*.md'):
                destination=source/path.relative_to(ROOT);destination.parent.mkdir(parents=True,exist_ok=True);destination.write_bytes(path.read_bytes())
        (source/'BUILD-INFO.json').write_text(json.dumps({'version':version,'runtime':args.runtime,'label':args.label,'commit':os.environ.get('GITHUB_SHA','')},indent=2)+'\n',encoding='utf-8')
    suffix='zip' if args.kind=='unity' or args.runtime.startswith('win-') else 'tar.gz'
    name = f'top.sealoong.sensa-{archive_version}.zip' if args.kind == 'unity' else f'Sensa-{archive_version}-{args.runtime}.{suffix}'
    (zip_directory if suffix=='zip' else tar_directory)(source, output / name)
    digest = hashlib.sha256((output / name).read_bytes()).hexdigest()
    (output / 'SHA256SUMS.txt').write_text(f'{digest}  {name}\n', encoding='utf-8')
    if args.kind == 'unity' and not args.label:
        info['url'] = f'https://github.com/{os.environ["GITHUB_REPOSITORY"]}/releases/download/{args.tag}/{name}'
        info['sha256'] = digest
        (output / 'vpm-package.json').write_text(json.dumps(info, ensure_ascii=False, indent=2), encoding='utf-8')
    notes = f'{"Unity VPM package" if args.kind == "unity" else args.runtime+" self-contained build"} {archive_version}\n\nSHA256: `{digest}`\n'
    (ROOT / 'artifacts/release-notes.txt').write_text(notes, encoding='utf-8')
    print(name)

if __name__ == '__main__':
    main()
