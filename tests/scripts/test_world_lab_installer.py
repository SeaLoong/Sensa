"""World source ownership and shared-protocol contracts. / World 源文件所有权及共享协议契约。"""
import json

from lab_contract_fixtures import LabFixture


class WorldInstallationContracts(LabFixture):
    def test_updates_preserve_generated_assets_and_share_the_same_protocol_sources(self):
        project = self.project('world')
        self.install(project, 'world')
        scene = self.write(project / 'Assets/SensaLab/Generated/UserScene.unity', 'user scene')
        upstream = self.repository / 'tools/unity-world-lab/Runtime/LabController.cs'
        self.write(upstream, 'new world source')
        self.install(project, 'world')
        self.install(project, 'world')
        self.assertEqual(scene.read_text(), 'user scene')
        self.assertEqual((project / 'Assets/SensaLab/Runtime/LabController.cs').read_bytes(), upstream.read_bytes())
        self.assertEqual((project / 'Assets/SensaLab/Editor/SensaEditorLocalization.cs').read_bytes(),
                         (self.repository / 'unity/top.sealoong.sensa/Editor/SensaEditorLocalization.cs').read_bytes())
        for name in ('SensaPoseProtocol.cs', 'SensaQuickStartProtocol.cs'):
            self.assertEqual((project / 'Assets/SensaLab/Shared' / name).read_bytes(),
                             (self.repository / 'unity/top.sealoong.sensa/Runtime' / name).read_bytes())

    def test_local_edits_and_unknown_source_collisions_are_preserved(self):
        project = self.project('world')
        self.install(project, 'world')
        edited = self.write(project / 'Assets/SensaLab/Runtime/LabController.cs', 'local edit')
        with self.assertRaisesRegex(ValueError, 'Preserve local edits'):
            self.install(project, 'world')
        self.assertEqual(edited.read_text(), 'local edit')
        ownership = project / 'Assets/SensaLab/source-manifest.json'
        ownership.write_text(json.dumps({}), encoding='utf-8')
        with self.assertRaises(ValueError):
            self.install(project, 'world')
        self.assertEqual(edited.read_text(), 'local edit')

    def test_unowned_directory_is_rejected_without_deleting_user_assets(self):
        project = self.project('world')
        scene = self.write(project / 'Assets/SensaLab/Generated/UserScene.unity', 'unowned user scene')
        with self.assertRaisesRegex(ValueError, 'unowned'):
            self.install(project, 'world')
        self.assertEqual(scene.read_text(), 'unowned user scene')
        self.assertFalse((project / 'Assets/SensaLab/source-manifest.json').exists())

    def test_avatar_and_empty_projects_are_rejected_without_writes(self):
        for project in (self.project('avatar'), self.root / 'empty'):
            with self.subTest(project=project), self.assertRaises(ValueError):
                self.install(project, 'world')
            self.assertFalse((project / 'Assets').exists())

    def test_missing_shared_source_rejects_the_whole_plan_before_writing(self):
        project = self.project('world')
        (self.repository / 'unity/top.sealoong.sensa/Runtime/SensaQuickStartProtocol.cs').unlink()
        with self.assertRaises(FileNotFoundError):
            self.install(project, 'world')
        self.assertFalse((project / 'Assets').exists())
