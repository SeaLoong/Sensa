"""Copy first-party lab sources into an existing standalone Unity world project. Does not install SDKs or change Git remotes."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[1]

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('project', type=Path)
    args = parser.parse_args()
    project = args.project.resolve()
    if not (project / 'ProjectSettings/ProjectVersion.txt').is_file() or not (project / 'Packages/com.vrchat.worlds/package.json').is_file():
        parser.error('Expected an existing VRChat Worlds project')
    target = project / 'Assets/SensaLab'
    ownership = target / 'source-manifest.json'
    if target.exists() and not ownership.exists():
        parser.error('Refusing to overwrite an unowned Assets/SensaLab directory')
    sources = [(p, p.relative_to(ROOT / 'tools/unity-world-lab')) for p in (ROOT / 'tools/unity-world-lab').rglob('*') if p.is_file()]
    for name in ['SensaGpuProbe.cs', 'SpsGpuProbe.shader.txt', 'SpsGpuDependencies.sha256.txt']:
        sources.append((ROOT / 'unity/top.sealoong.sensa/Editor' / name, Path('Editor') / name))
    sources.append((ROOT / 'unity/top.sealoong.sensa/Runtime/SensaPoseProtocol.cs', Path('Shared/SensaPoseProtocol.cs')))
    previous = json.loads(ownership.read_text(encoding='utf-8')) if ownership.exists() else {}
    for source, relative in sources:
        destination = target / relative
        if destination.exists() and relative.as_posix() in previous:
            current = hashlib.sha256(destination.read_bytes()).hexdigest()
            if current != previous[relative.as_posix()] and destination.read_bytes() != source.read_bytes():
                parser.error(f'Lab source edited locally; preserve changes first: {destination}')
        elif destination.exists() and destination.read_bytes() != source.read_bytes():
            parser.error(f'Untracked source collision: {destination}')
    manifest = {}
    for source, relative in sources:
        destination = target / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, destination)
        manifest[relative.as_posix()] = hashlib.sha256(destination.read_bytes()).hexdigest()
    ownership.write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    print(f'Installed {len(sources)} lab source files into {target}')

if __name__ == '__main__': main()
