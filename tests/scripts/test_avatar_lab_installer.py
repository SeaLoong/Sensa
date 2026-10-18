"""Avatar source ownership and package-test contracts. / Avatar 源文件所有权及包测试契约。"""
import json

from lab_contract_fixtures import LabFixture


class AvatarInstallationContracts(LabFixture):
    def test_install_update_and_reinstall_preserve_scenes_and_testables(self):
        project = self.project('avatar')
        count = self.install(project, 'avatar', enable_tests=True)
        self.assertGreater(count, 0)
        scene = self.write(project / 'Assets/SensaAvatarLab/UserScene.unity', 'user scene')
        package_source = project / 'Packages/top.sealoong.sensa/Runtime/SensaAutoSetup.cs'
        self.write(self.repository / 'unity/top.sealoong.sensa/Runtime/SensaAutoSetup.cs', 'next package source')
        self.install(project, 'avatar', enable_tests=True)
        self.install(project, 'avatar', enable_tests=True)
        self.assertEqual(package_source.read_text(), 'next package source')
        self.assertEqual(scene.read_text(), 'user scene')
        manifest = json.loads((project / 'Packages/manifest.json').read_text())
        self.assertEqual(manifest['dependencies'], {'keep': '1'})
        self.assertEqual(manifest['testables'], ['existing.tests', 'top.sealoong.sensa'])

    def test_collision_preflight_preserves_every_previously_owned_file(self):
        project = self.project('avatar')
        self.install(project, 'avatar')
        edited = self.write(project / 'Packages/top.sealoong.sensa/Runtime/SensaAutoSetup.cs', 'local changes')
        other = project / 'Assets/SensaAvatarLab/Editor/AvatarLab.cs'
        self.write(self.repository / 'tools/unity-avatar-lab/Editor/AvatarLab.cs', 'upstream update')
        ownership = project / 'Assets/SensaAvatarLab/source-manifest.json'
        before = ownership.read_bytes()
        with self.assertRaisesRegex(ValueError, 'Preserve local edits'):
            self.install(project, 'avatar')
        self.assertEqual(edited.read_text(), 'local changes')
        self.assertEqual(other.read_text(), 'avatar source')
        self.assertEqual(ownership.read_bytes(), before)

    def test_invalid_package_manifest_is_rejected_before_copying(self):
        for content in ('{', '[]', '{"testables":"not a list"}', '{"testables":[1]}'):
            project = self.project('avatar')
            self.write(project / 'Packages/manifest.json', content)
            with self.subTest(content=content), self.assertRaises(ValueError):
                self.install(project, 'avatar', enable_tests=True)
            self.assertFalse((project / 'Assets').exists())

    def test_world_and_empty_projects_are_rejected_before_writing(self):
        world = self.project('world')
        for project in (world, self.root / 'empty'):
            with self.subTest(project=project), self.assertRaises(ValueError):
                self.install(project, 'avatar')
            self.assertFalse((project / 'Assets').exists())
