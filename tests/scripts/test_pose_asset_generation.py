"""Authoring asset generation contracts; isolated files, no Unity process.
作者资产生成契约；仅操作隔离文件，不启动 Unity。
"""
from pathlib import Path
import runpy

from lab_contract_fixtures import LabFixture, ROOT


class PoseAssetGenerationContracts(LabFixture):
    def test_root_prefab_uses_current_author_and_preserves_existing_script_identity(self):
        script = self.write(self.repository / 'scripts/generate-pose-assets.py',
                            (ROOT / 'scripts/generate-pose-assets.py').read_text(encoding='utf-8'))
        package = self.repository / 'unity/top.sealoong.sensa'
        identity = '1234567890abcdef1234567890abcdef'
        metadata = self.write(package / 'Runtime/SensaFixedRootProbe.cs.meta',
                              'fileFormatVersion: 2\nguid: ' + identity + '\n')
        before = metadata.read_bytes()
        runpy.run_path(str(script))
        generated = (package / 'Prefabs/SensaSpsRootProbe.prefab').read_text(encoding='utf-8')
        self.assertIn('m_Script: {fileID: 11500000, guid: ' + identity + ', type: 3}', generated)
        self.assertIn('target: {fileID: 0}', generated)
        self.assertIn('collisionChannel: SpsRootProbe', generated)
        self.assertNotIn('standardSpsRoot', generated)
        self.assertNotIn('othersDiagnostic', generated)
        self.assertNotIn('  profile:', generated)
        self.assertEqual(metadata.read_bytes(), before)
