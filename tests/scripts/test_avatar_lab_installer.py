import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[2] / 'scripts/install-avatar-lab.py'


class AvatarLabInstallerTests(unittest.TestCase):
    def test_preserves_user_scenes_and_package_edits_and_keeps_existing_testables(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / 'ProjectSettings').mkdir()
            (root / 'ProjectSettings/ProjectVersion.txt').write_text('2022.3.22f1')
            (root / 'Packages/com.vrchat.avatars').mkdir(parents=True)
            (root / 'Packages/com.vrchat.avatars/package.json').write_text('{}')
            manifest = root / 'Packages/manifest.json'
            manifest.write_text(json.dumps({'dependencies': {}, 'testables': ['example.tests']}))
            command = [sys.executable, '-X', 'utf8', str(SCRIPT), str(root), '--tests']
            result = subprocess.run(command, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            scene = root / 'Assets/SensaAvatarLab/UserScene.unity'
            scene.write_text('user content')
            self.assertEqual(subprocess.run(command, capture_output=True).returncode, 0)
            self.assertEqual(scene.read_text(), 'user content')
            self.assertEqual(json.loads(manifest.read_text())['testables'], ['example.tests', 'top.sealoong.sensa'])
            edited = root / 'Packages/top.sealoong.sensa/Runtime/SensaAutoSetup.cs'
            edited.write_text('local edits')
            self.assertNotEqual(subprocess.run(command, capture_output=True).returncode, 0)
            self.assertEqual(edited.read_text(), 'local edits')

    def test_rejects_a_world_or_empty_project_before_writing(self):
        with tempfile.TemporaryDirectory() as folder:
            result = subprocess.run([sys.executable, str(SCRIPT), folder], capture_output=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertFalse((Path(folder) / 'Assets').exists())


if __name__ == '__main__':
    unittest.main()
