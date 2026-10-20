"""Owned Unity lab installation. / 受所有权清单保护的 Unity 实验工具安装。"""
import hashlib
import json
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[1]


def install_lab(project, lab, *, enable_tests=False, repository=ROOT):
    """Install validated first-party sources, preserving scenes and local edits.
    安装校验后的自有源文件，保留场景和本地修改。
    """
    if lab not in ('avatar', 'world'):
        raise ValueError('未知实验类型。 / Unknown lab kind.')
    project, repository = Path(project).resolve(), Path(repository).resolve()
    package = 'avatars' if lab == 'avatar' else 'worlds'
    if not (project / 'ProjectSettings/ProjectVersion.txt').is_file() or not (project / f'Packages/com.vrchat.{package}/package.json').is_file():
        raise ValueError(f'需要现有 VRChat {package} 工程。 / Expected an existing VRChat {package} project.')
    target = project / ('Assets/SensaAvatarLab' if lab == 'avatar' else 'Assets/SensaLab')
    ownership = target / 'source-manifest.json'
    if lab == 'world' and target.exists() and not ownership.exists():
        raise ValueError('拒绝覆盖无所有权清单的目录。 / Refusing to overwrite an unowned Assets/SensaLab directory.')
    previous = json.loads(ownership.read_text(encoding='utf-8')) if ownership.exists() else {}
    if not isinstance(previous, dict) or any(not isinstance(k, str) or not isinstance(v, str) for k, v in previous.items()):
        raise ValueError('源文件所有权清单无效。 / Invalid source ownership manifest.')

    sources = []
    roots = [(repository / f'tools/unity-{lab}-lab', target)]
    if lab == 'avatar':
        roots.append((repository / 'unity/top.sealoong.sensa', project / 'Packages/top.sealoong.sensa'))
    for source_root, destination in roots:
        if not source_root.is_dir():
            raise ValueError(f'缺少源目录 / Missing source directory: {source_root}')
        sources.extend((p, destination / p.relative_to(source_root)) for p in sorted(source_root.rglob('*')) if p.is_file())
    if lab == 'avatar':
        sources.extend((repository / 'tools/unity-world-lab/Shaders' / name, target / 'Shaders' / name)
                       for name in ('Telemetry.shader', 'TextureOutput.shader'))
    else:
        editor = repository / 'unity/top.sealoong.sensa/Editor'
        sources.extend((editor / name, target / 'Editor' / name)
                       for name in ('SensaGpuProbe.cs', 'SensaEditorLocalization.cs', 'SpsGpuProbe.shader.txt', 'SpsGpuDependencies.sha256.txt'))
        runtime = repository / 'unity/top.sealoong.sensa/Runtime'
        sources.extend((runtime / name, target / 'Shared' / name)
                       for name in ('SensaPoseProtocol.cs', 'SensaQuickStartProtocol.cs'))

    package_manifest = project / 'Packages/manifest.json'
    manifest_value = None
    if enable_tests:
        if lab != 'avatar':
            raise ValueError('仅 Avatar 实验支持包测试开关。 / Package tests are supported by the avatar lab.')
        manifest_value = json.loads(package_manifest.read_text(encoding='utf-8-sig'))
        if not isinstance(manifest_value, dict) or not isinstance(manifest_value.get('testables', []), list) or any(
                not isinstance(item, str) for item in manifest_value.get('testables', [])):
            raise ValueError('Unity 包清单 testables 无效。 / Invalid Unity package manifest testables.')
        testables = manifest_value.setdefault('testables', [])
        if 'top.sealoong.sensa' not in testables:
            testables.append('top.sealoong.sensa')

    # Check the complete plan before the first write. / 写入前检查全部计划。
    plan = []
    for source, destination in sources:
        content = source.read_bytes()
        relative = destination.relative_to(project).as_posix()
        key = relative if lab == 'avatar' else destination.relative_to(target).as_posix()
        if destination.exists() and destination.read_bytes() != content:
            digest = hashlib.sha256(destination.read_bytes()).hexdigest()
            if previous.get(key) != digest:
                raise ValueError(f'请先保留本地修改。 / Preserve local edits before updating: {destination}')
        plan.append((source, destination, key, hashlib.sha256(content).hexdigest()))

    for source, destination, _, _ in plan:
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, destination)
    ownership.parent.mkdir(parents=True, exist_ok=True)
    ownership.write_text(json.dumps({key: digest for _, _, key, digest in plan}, indent=2) + '\n', encoding='utf-8')
    if manifest_value is not None:
        package_manifest.write_text(json.dumps(manifest_value, indent=2) + '\n', encoding='utf-8')
    return len(plan)
