"""Isolated lab fixtures; no Unity process or proprietary assets.
隔离实验夹具，不启动 Unity，也不使用专有资源。
"""
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT / 'scripts') not in sys.path:
    sys.path.insert(0, str(ROOT / 'scripts'))


def load_script(name):
    spec = importlib.util.spec_from_file_location('sensa_test_' + name.replace('-', '_'), ROOT / 'scripts' / (name + '.py'))
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


installation = load_script('lab_installation')


class LabFixture(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)
        self.root = Path(self.folder.name)
        self.repository = self.root / 'repository'
        for relative, content in {
            'tools/unity-avatar-lab/Editor/AvatarLab.cs': 'avatar source',
            'tools/unity-world-lab/Runtime/LabController.cs': 'world source',
            'tools/unity-world-lab/Shaders/Telemetry.shader': 'telemetry',
            'tools/unity-world-lab/Shaders/TextureOutput.shader': 'texture',
            'unity/top.sealoong.sensa/Runtime/SensaAutoSetup.cs': 'package source',
            'unity/top.sealoong.sensa/Runtime/SensaPoseProtocol.cs': 'pose protocol',
            'unity/top.sealoong.sensa/Runtime/SensaQuickStartProtocol.cs': 'quick start protocol',
            'unity/top.sealoong.sensa/Editor/SensaGpuProbe.cs': 'gpu reader',
            'unity/top.sealoong.sensa/Editor/SensaEditorLocalization.cs': 'editor localization',
            'unity/top.sealoong.sensa/Editor/SpsGpuProbe.shader.txt': 'gpu shader',
            'unity/top.sealoong.sensa/Editor/SpsGpuDependencies.sha256.txt': 'dependencies',
        }.items():
            self.write(self.repository / relative, content)

    @staticmethod
    def write(path, content):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding='utf-8')
        return path

    def project(self, kind):
        project = self.root / kind
        self.write(project / 'ProjectSettings/ProjectVersion.txt', 'm_EditorVersion: 2022.3.22f1')
        self.write(project / f'Packages/com.vrchat.{kind}s/package.json', '{}')
        self.write(project / 'Packages/manifest.json', json.dumps({'dependencies': {'keep': '1'}, 'testables': ['existing.tests']}))
        return project

    def install(self, project, kind, **options):
        return installation.install_lab(project, kind, repository=self.repository, **options)
