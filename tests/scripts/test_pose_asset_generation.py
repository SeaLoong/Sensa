"""Authoring asset generation contracts; isolated files, no Unity process.
作者资产生成契约；仅操作隔离文件，不启动 Unity。
"""
from pathlib import Path
import runpy

from lab_contract_fixtures import LabFixture, ROOT


class PoseAssetGenerationContracts(LabFixture):
    def prepare_generator(self):
        script = self.write(self.repository / 'scripts/generate-pose-assets.py',
                            (ROOT / 'scripts/generate-pose-assets.py').read_text(encoding='utf-8'))
        package = self.repository / 'unity/top.sealoong.sensa'
        for relative in ('Runtime/SensaFixedAnchorProtocol.cs', 'Editor/SensaRootTelemetry.shader.txt'):
            self.write(package / relative, (ROOT / 'unity/top.sealoong.sensa' / relative).read_text(encoding='utf-8'))
        return script, package

    def test_root_prefab_uses_current_author_and_preserves_existing_script_identity(self):
        script, package = self.prepare_generator()
        identity = '1234567890abcdef1234567890abcdef'
        metadata = self.write(package / 'Runtime/SensaFixedRootProbe.cs.meta',
                              'fileFormatVersion: 2\nguid: ' + identity + '\n')
        before = metadata.read_bytes()
        runpy.run_path(str(script))
        generated = (package / 'Prefabs/SensaSpsRootProbe.prefab').read_text(encoding='utf-8')
        self.assertIn('m_Script: {fileID: 11500000, guid: ' + identity + ', type: 3}', generated)
        self.assertIn('target: {fileID: 0}', generated)
        self.assertIn('instanceName: Root', generated)
        self.assertIn('collisionChannel:\n', generated)
        self.assertNotIn('standardSpsRoot', generated)
        self.assertNotIn('othersDiagnostic', generated)
        self.assertNotIn('  profile:', generated)
        self.assertEqual(metadata.read_bytes(), before)

    def test_contact_prefab_has_explicit_target_and_auto_preset_preserves_four_anchor_default(self):
        script, package = self.prepare_generator()
        identity = 'abcdef1234567890abcdef1234567890'
        self.write(package / 'Runtime/SensaContactRootProbe.cs.meta', 'fileFormatVersion: 2\nguid: ' + identity + '\n')
        runpy.run_path(str(script))
        generated = (package / 'Prefabs/SensaContactRootProbe.prefab').read_text(encoding='utf-8')
        self.assertIn('m_Script: {fileID: 11500000, guid: ' + identity + ', type: 3}', generated)
        self.assertIn('instanceName: Root', generated)
        self.assertIn('target: {fileID: 0}', generated)
        self.assertIn('collisionChannel:\n', generated)
        self.assertIn('rootTrackingMethod: 0', (package / 'Prefabs/SensaAutoSetup.prefab').read_text(encoding='utf-8'))
        self.assertTrue((package / 'Prefabs/SensaContactRootProbe.prefab.meta').is_file())

    def test_shader_prefab_is_editable_and_package_shader_uses_shared_constants_without_project_assets(self):
        script, package = self.prepare_generator()
        protocol = package / 'Runtime/SensaFixedAnchorProtocol.cs'
        protocol.write_text(protocol.read_text(encoding='utf-8').replace('CenterY = 1f;', 'CenterY = 1.25f;')
                            .replace('PositionHalfRange = 2f;', 'PositionHalfRange = 3.5f;'), encoding='utf-8')
        runpy.run_path(str(script))
        prefab = (package / 'Prefabs/SensaShaderCapture.prefab').read_text(encoding='utf-8')
        self.assertIn('target: {fileID: 0}', prefab)
        self.assertIn('producerId: 1', prefab)
        shader = package / 'Runtime/Shaders/SensaRootTelemetry.shader'
        content = shader.read_text(encoding='utf-8')
        self.assertIn('float3 center=float3(0,1.25,0);', content)
        self.assertIn('(input[0].root-center)/3.5;', content)
        self.assertNotIn('__CENTER_', content)
        self.assertNotIn('__HALF_RANGE__', content)
        self.assertIn('ShaderImporter:', shader.with_suffix('.shader.meta').read_text(encoding='utf-8'))
        self.assertFalse((self.repository / 'Assets').exists())
        original_shader, original_metadata = shader.read_bytes(), shader.with_suffix('.shader.meta').read_bytes()
        runpy.run_path(str(script))
        self.assertEqual(original_shader, shader.read_bytes())
        self.assertEqual(original_metadata, shader.with_suffix('.shader.meta').read_bytes())

    def test_shipped_native_shader_matches_its_template_and_current_shared_geometry(self):
        script, package = self.prepare_generator()
        runpy.run_path(str(script))
        generated = package / 'Runtime/Shaders/SensaRootTelemetry.shader'
        shipped = ROOT / 'unity/top.sealoong.sensa/Runtime/Shaders/SensaRootTelemetry.shader'
        self.assertEqual(generated.read_bytes(), shipped.read_bytes(),
                         'Run scripts/generate-pose-assets.py after changing the native shader template or geometry.')
