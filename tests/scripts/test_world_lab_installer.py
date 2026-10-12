import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[2] / 'scripts/install-world-lab.py'


class WorldLabInstallerTests(unittest.TestCase):
    def test_owned_sync_preserves_generated_assets_and_rejects_local_source_edits(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / 'ProjectSettings').mkdir()
            (root / 'ProjectSettings/ProjectVersion.txt').write_text('m_EditorVersion: 2022.3.22f1')
            (root / 'Packages/com.vrchat.worlds').mkdir(parents=True)
            (root / 'Packages/com.vrchat.worlds/package.json').write_text('{}')
            command = [sys.executable, '-X', 'utf8', str(SCRIPT), str(root)]
            result = subprocess.run(command, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            generated = root / 'Assets/SensaLab/Generated'
            generated.mkdir(); (generated / 'UserScene.unity').write_text('user content')
            self.assertEqual(subprocess.run(command, capture_output=True).returncode, 0)
            self.assertEqual((generated / 'UserScene.unity').read_text(), 'user content')
            edited = root / 'Assets/SensaLab/Runtime/LabController.cs'
            edited.write_text('local user edit')
            self.assertNotEqual(subprocess.run(command, capture_output=True).returncode, 0)
            self.assertEqual(edited.read_text(), 'local user edit')

    def test_refuses_non_world_project(self):
        with tempfile.TemporaryDirectory() as folder:
            result = subprocess.run([sys.executable, str(SCRIPT), folder], capture_output=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertFalse((Path(folder) / 'Assets').exists())
