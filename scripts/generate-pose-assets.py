"""Reproducible Unity authoring prefabs; native VRC components are baked by SensaPoseBuilder."""
from pathlib import Path
import uuid

ROOT = Path(__file__).resolve().parents[1]
PACKAGE = ROOT / 'unity/top.sealoong.sensa'

def guid(path):
    return uuid.uuid5(uuid.NAMESPACE_URL, 'https://github.com/SeaLoong/Sensa/' + path.relative_to(ROOT).as_posix()).hex

def write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(data, encoding='utf-8', newline='\n')

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
write(PACKAGE / 'Prefabs/SensaSpsRootProbe.prefab', header + obj(0, 'SensaSpsRootProbe', script='SensaPoseSocket', fields=profile + '  instanceName: SpsRoot\n  standardSpsRoot: 1\n'))
write(PACKAGE / 'Prefabs/SensaPosePlug.prefab', header + obj(0, 'SensaPosePlug', children=(1, 2), script='SensaPosePlug', fields=profile + '  rootMarker: {fileID: 4000}\n  tipMarker: {fileID: 4001}\n  sideMarker: {fileID: 4002}\n')
      + obj(1, 'Tip', parent=4000, position=(0, 0, .15)) + obj(2, 'Side', parent=4000, position=(.03, 0, 0)))

for path in list(PACKAGE.rglob('*')):
    if path.suffix == '.meta' or Path(str(path) + '.meta').exists(): continue
    meta = f'fileFormatVersion: 2\nguid: {guid(path)}\n'
    if path.is_dir(): meta += 'folderAsset: yes\nDefaultImporter:\n  externalObjects: {}\n'
    elif path.suffix == '.cs': meta += 'MonoImporter:\n  externalObjects: {}\n  serializedVersion: 2\n  defaultReferences: []\n  executionOrder: 0\n'
    elif path.suffix == '.asset': meta += 'NativeFormatImporter:\n  externalObjects: {}\n  mainObjectFileID: 11400000\n'
    elif path.suffix == '.prefab': meta += 'PrefabImporter:\n  externalObjects: {}\n'
    elif path.suffix == '.asmdef': meta += 'AssemblyDefinitionImporter:\n  externalObjects: {}\n'
    else: meta += 'DefaultImporter:\n  externalObjects: {}\n'
    write(Path(str(path) + '.meta'), meta)
