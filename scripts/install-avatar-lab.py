"""Install first-party avatar lab sources; proprietary resources are imported separately in Unity."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('project', type=Path)
    parser.add_argument('--tests', action='store_true', help='Enable Sensa package tests in the Unity Test Runner')
    args = parser.parse_args()
    project = args.project.resolve()
    if not (project / 'ProjectSettings/ProjectVersion.txt').is_file() or not (project / 'Packages/com.vrchat.avatars/package.json').is_file():
        parser.error('Expected an existing VRChat Avatars project')
    ownership = project / 'Assets/SensaAvatarLab/source-manifest.json'
    previous = json.loads(ownership.read_text(encoding='utf-8')) if ownership.exists() else {}
    sources = []
    for source_root, destination in [(ROOT / 'tools/unity-avatar-lab', Path('Assets/SensaAvatarLab')),
                                     (ROOT / 'unity/top.sealoong.sensa', Path('Packages/top.sealoong.sensa'))]:
        sources.extend((p, destination / p.relative_to(source_root)) for p in source_root.rglob('*') if p.is_file())
    for name in ('Telemetry.shader', 'TextureOutput.shader'):
        sources.append((ROOT / 'tools/unity-world-lab/Shaders' / name, Path('Assets/SensaAvatarLab/Shaders') / name))
    for source, relative in sources:
        target = project / relative
        if target.exists() and target.read_bytes() != source.read_bytes():
            digest = hashlib.sha256(target.read_bytes()).hexdigest()
            if previous.get(relative.as_posix()) != digest:
                parser.error(f'Preserve local edits before updating: {target}')
    manifest = {}
    for source, relative in sources:
        target = project / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)
        manifest[relative.as_posix()] = hashlib.sha256(target.read_bytes()).hexdigest()
    ownership.write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    if args.tests:
        path = project / 'Packages/manifest.json'
        value = json.loads(path.read_text(encoding='utf-8-sig'))
        testables = value.setdefault('testables', [])
        if 'top.sealoong.sensa' not in testables:
            testables.append('top.sealoong.sensa')
            path.write_text(json.dumps(value, indent=2) + '\n', encoding='utf-8')
    print(f'Installed {len(sources)} first-party files; no model assets or upload operations included.')


if __name__ == '__main__':
    main()
