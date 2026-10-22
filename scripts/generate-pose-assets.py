"""Generate Unity authoring prefabs and shared Shader assets for the Sensa build pipeline."""
from pathlib import Path
import re
import uuid

ROOT = Path(__file__).resolve().parents[1]
PACKAGE = ROOT / 'unity/top.sealoong.sensa'

def guid(path):
    meta = Path(str(path) + '.meta')
    if meta.is_file():
        for line in meta.read_text(encoding='utf-8').splitlines():
            if line.startswith('guid: '):
                return line[6:].strip()
    return uuid.uuid5(uuid.NAMESPACE_URL, 'https://github.com/SeaLoong/Sensa/' + path.relative_to(ROOT).as_posix()).hex

def write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(data, encoding='utf-8', newline='\n')

def native_root_shader():
    """Resolve the same shared constants before Unity imports the package.
    在包导入前生成原生 Shader，Avatar 构建只引用包资产，不写入用户 Assets。
    """
    protocol = (PACKAGE / 'Runtime/SensaFixedAnchorProtocol.cs').read_text(encoding='utf-8')
    shader = (PACKAGE / 'Editor/SensaRootTelemetry.shader.txt').read_text(encoding='utf-8')
    for marker, name in (('CENTER_X', 'CenterX'), ('CENTER_Y', 'CenterY'),
                         ('CENTER_Z', 'CenterZ'), ('HALF_RANGE', 'PositionHalfRange')):
        match = re.search(r'public\s+const\s+float\s+' + name + r'\s*=\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)f\s*;', protocol)
        if not match:
            raise ValueError('Missing shared shader constant: ' + name)
        shader = shader.replace('__' + marker + '__', match.group(1))
    if re.search(r'__[A-Z_]+__', shader):
        raise ValueError('Unresolved native root shader constant')
    write(PACKAGE / 'Runtime/Shaders/SensaRootTelemetry.shader', shader)

def obj(number, name, parent=0, children=(), position=(0, 0, 0), script=None, fields=''):
    go = 1000 + number; transform = 4000 + number; mono = 114000 + number
    result = f'''--- !u!1 &{go}
GameObject:
  m_ObjectHideFlags: 0
  m_CorrespondingSourceObject: {{fileID: 0}}
  m_PrefabInstance: {{fileID: 0}}
  m_PrefabAsset: {{fileID: 0}}
  serializedVersion: 6
  m_Component:
  - component: {{fileID: {transform}}}
'''
    if script: result += f'  - component: {{fileID: {mono}}}\n'
    result += f'''  m_Layer: 0
  m_Name: {name}
  m_TagString: Untagged
  m_IsActive: 1
--- !u!4 &{transform}
Transform:
  m_ObjectHideFlags: 0
  m_CorrespondingSourceObject: {{fileID: 0}}
  m_PrefabInstance: {{fileID: 0}}
  m_PrefabAsset: {{fileID: 0}}
  m_GameObject: {{fileID: {go}}}
  serializedVersion: 2
  m_LocalRotation: {{x: 0, y: 0, z: 0, w: 1}}
  m_LocalPosition: {{x: {position[0]}, y: {position[1]}, z: {position[2]}}}
  m_LocalScale: {{x: 1, y: 1, z: 1}}
  m_ConstrainProportionsScale: 1
  m_Children:'''
    result += '\n' + ''.join(f'  - {{fileID: {4000 + child}}}\n' for child in children) if children else ' []\n'
    result += f'  m_Father: {{fileID: {parent}}}\n  m_RootOrder: 0\n  m_LocalEulerAnglesHint: {{x: 0, y: 0, z: 0}}\n'
    if script:
        result += f'''--- !u!114 &{mono}
MonoBehaviour:
  m_ObjectHideFlags: 0
  m_CorrespondingSourceObject: {{fileID: 0}}
  m_PrefabInstance: {{fileID: 0}}
  m_PrefabAsset: {{fileID: 0}}
  m_GameObject: {{fileID: {go}}}
  m_Enabled: 1
  m_EditorHideFlags: 0
  m_Script: {{fileID: 11500000, guid: {guid(PACKAGE / 'Runtime' / (script + '.cs'))}, type: 3}}
  m_Name:
  m_EditorClassIdentifier:
{fields}'''
    return result

header = '%YAML 1.1\n%TAG !u! tag:unity3d.com,2011:\n'
for name, channel, others, own in [('DefaultPair', 'Pair01', 1, 0), ('SelfTest', 'SensaCalibration', 0, 1)]:
    write(PACKAGE / 'Profiles' / (name + '.asset'), header + f'''--- !u!114 &11400000
MonoBehaviour:
  m_ObjectHideFlags: 0
  m_CorrespondingSourceObject: {{fileID: 0}}
  m_PrefabInstance: {{fileID: 0}}
  m_PrefabAsset: {{fileID: 0}}
  m_GameObject: {{fileID: 0}}
  m_Enabled: 1
  m_EditorHideFlags: 0
  m_Script: {{fileID: 11500000, guid: {guid(PACKAGE / 'Runtime/SensaPoseProfile.cs')}, type: 3}}
  m_Name: {name}
  m_EditorClassIdentifier:
  channel: {channel}
  receiveOthers: {others}
  receiveSelf: {own}
''')
profile = f'  profile: {{fileID: 11400000, guid: {guid(PACKAGE / "Profiles/DefaultPair.asset")}, type: 2}}\n'
write(PACKAGE / 'Prefabs/SensaPoseSocket.prefab', header + obj(0, 'SensaPoseSocket', script='SensaPoseSocket', fields=profile + '  instanceName: Main\n'))
write(PACKAGE / 'Prefabs/SensaSpsRootProbe.prefab', header + obj(0, 'SensaSpsRootProbe', script='SensaFixedRootProbe', fields='  instanceName: Root\n  target: {fileID: 0}\n  collisionChannel:\n'))
write(PACKAGE / 'Prefabs/SensaContactRootProbe.prefab', header + obj(0, 'SensaContactRootProbe', script='SensaContactRootProbe', fields='  instanceName: Root\n  target: {fileID: 0}\n  collisionChannel:\n'))
write(PACKAGE / 'Prefabs/SensaShaderCapture.prefab', header + obj(0, 'SensaShaderCapture', script='SensaShaderCapture', fields='  target: {fileID: 0}\n  spsTarget: {fileID: 0}\n  producerId: 1\n  desktopViewport: {x: 0, y: 0, width: 0.25, height: 0.15}\n'))
write(PACKAGE / 'Prefabs/SensaLocalPoint.prefab', header + obj(0, 'SensaLocalPoint', children=(1,), script='SensaPointProbe', fields='  instanceName: Point\n  reference: {fileID: 4000}\n  target: {fileID: 4001}\n  createGrabHandle: 0\n  handleLength: 0.1\n') + obj(1, 'Target', parent=4000, position=(0,0,.1)))
write(PACKAGE / 'Prefabs/SensaGrabHandle.prefab', header + obj(0, 'SensaGrabHandle', script='SensaPointProbe', fields='  instanceName: Handle\n  reference: {fileID: 4000}\n  target: {fileID: 0}\n  createGrabHandle: 1\n  handleLength: 0.1\n'))
write(PACKAGE / 'Prefabs/SensaAutoSetup.prefab', header + obj(0, 'SensaAutoSetup', script='SensaAutoSetup', fields='  groupName: Auto\n  discoverAll: 1\n  selectedTargets: []\n  excludedTargets: []\n  socketRootTracking: 1\n  rootTrackingMethod: 0\n  pairedSocketTracking: 0\n  pairedPlugMarkers: 0\n  localPlugTipTracking: 0\n  localReferenceSocket: {fileID: 0}\n  createPlugGrabHandles: 0\n  pairChannel: Pair01\n  arrayPolicy: 1\n'))
write(PACKAGE / 'Prefabs/SensaPosePlug.prefab', header + obj(0, 'SensaPosePlug', children=(1, 2), script='SensaPosePlug', fields=profile + '  rootMarker: {fileID: 4000}\n  tipMarker: {fileID: 4001}\n  sideMarker: {fileID: 4002}\n')
      + obj(1, 'Tip', parent=4000, position=(0, 0, .15)) + obj(2, 'Side', parent=4000, position=(.03, 0, 0)))

native_root_shader()

for path in list(PACKAGE.rglob('*')):
    if path.suffix == '.meta' or Path(str(path) + '.meta').exists(): continue
    meta = f'fileFormatVersion: 2\nguid: {guid(path)}\n'
    if path.is_dir(): meta += 'folderAsset: yes\nDefaultImporter:\n  externalObjects: {}\n'
    elif path.suffix == '.cs': meta += 'MonoImporter:\n  externalObjects: {}\n  serializedVersion: 2\n  defaultReferences: []\n  executionOrder: 0\n'
    elif path.suffix == '.asset': meta += 'NativeFormatImporter:\n  externalObjects: {}\n  mainObjectFileID: 11400000\n'
    elif path.suffix == '.prefab': meta += 'PrefabImporter:\n  externalObjects: {}\n'
    elif path.suffix == '.asmdef': meta += 'AssemblyDefinitionImporter:\n  externalObjects: {}\n'
    elif path.suffix == '.txt': meta += 'TextScriptImporter:\n  externalObjects: {}\n'
    elif path.suffix == '.shader': meta += 'ShaderImporter:\n  externalObjects: {}\n  defaultTextures: []\n  nonModifiableTextures: []\n'
    else: meta += 'DefaultImporter:\n  externalObjects: {}\n'
    write(Path(str(path) + '.meta'), meta)
