"""Validate version tags and package immutable release assets (stdlib only)."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import zipfile

ROOT = Path(__file__).resolve().parents[1]

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

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('kind', choices=['app', 'unity', 'check-unity'])
    parser.add_argument('--tag', default=os.environ.get('GITHUB_REF_NAME', ''))
    parser.add_argument('--source', type=Path)
    parser.add_argument('--output', type=Path, default=ROOT / 'artifacts/release')
    args = parser.parse_args()
    if args.kind == 'check-unity':
        validate_unity(); print('Unity package metadata validated'); return
    version, info = validate_tag(args.kind, args.tag)
    if os.environ.get('GITHUB_OUTPUT'):
        with open(os.environ['GITHUB_OUTPUT'], 'a', encoding='utf-8') as stream:
            stream.write(f'stable={str("-" not in version).lower()}\n')
    output = args.output; output.mkdir(parents=True, exist_ok=True)
    source = args.source or ROOT / 'unity/top.sealoong.sensa'
    if args.kind == 'app':
        if not (source / 'Sensa.exe').is_file() or not (source / 'web/app.bundle.js').is_file():
            raise ValueError('Application output is incomplete')
        for name in ('README.md', 'LICENSE'):
            (source / name).write_bytes((ROOT / name).read_bytes())
    name = f'top.sealoong.sensa-{version}.zip' if args.kind == 'unity' else f'Sensa-{version}-win-x64.zip'
    zip_directory(source, output / name)
    digest = hashlib.sha256((output / name).read_bytes()).hexdigest()
    (output / 'SHA256SUMS.txt').write_text(f'{digest}  {name}\n', encoding='utf-8')
    if args.kind == 'unity':
        info['url'] = f'https://github.com/{os.environ["GITHUB_REPOSITORY"]}/releases/download/{args.tag}/{name}'
        info['sha256'] = digest
        (output / 'vpm-package.json').write_text(json.dumps(info, ensure_ascii=False, indent=2), encoding='utf-8')
    notes = f'{"Unity VPM package" if args.kind == "unity" else "Windows x64 self-contained build"} {version}\n\nSHA256: `{digest}`\n'
    (ROOT / 'artifacts/release-notes.txt').write_text(notes, encoding='utf-8')
    print(name)

if __name__ == '__main__':
    main()
