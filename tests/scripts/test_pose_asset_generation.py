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

    def test_contact_prefab_has_explicit_target_and_auto_preset_preserves_four_anchor_default(self):
        script = self.write(self.repository / 'scripts/generate-pose-assets.py',
                            (ROOT / 'scripts/generate-pose-assets.py').read_text(encoding='utf-8'))
        package = self.repository / 'unity/top.sealoong.sensa'
        identity = 'abcdef1234567890abcdef1234567890'
        self.write(package / 'Runtime/SensaContactRootProbe.cs.meta', 'fileFormatVersion: 2\nguid: ' + identity + '\n')
        runpy.run_path(str(script))
        generated = (package / 'Prefabs/SensaContactRootProbe.prefab').read_text(encoding='utf-8')
        self.assertIn('m_Script: {fileID: 11500000, guid: ' + identity + ', type: 3}', generated)
        self.assertIn('instanceName: Root', generated)
        self.assertIn('target: {fileID: 0}', generated)
        self.assertIn('collisionChannel: ContactRootProbe', generated)
        self.assertIn('rootTrackingMethod: 0', (package / 'Prefabs/SensaAutoSetup.prefab').read_text(encoding='utf-8'))
        self.assertTrue((package / 'Prefabs/SensaContactRootProbe.prefab.meta').is_file())
