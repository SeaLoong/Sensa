import json
from pathlib import Path
import re
import unittest


ROOT = Path(__file__).resolve().parents[2]
WORLD = ROOT / 'tools/unity-world-lab'


class LabPresetRoutes(unittest.TestCase):
    def test_all_builtin_mapping_presets_have_a_world_route_in_both_languages(self):
        catalog = json.loads((ROOT / 'src/web/data/osc-presets.json').read_text(encoding='utf-8'))
        ids = {preset['id'] for preset in catalog}
        for filename in ('CAPABILITIES.md', 'CAPABILITIES.en.md'):
            with self.subTest(filename=filename):
                guide = (WORLD / filename).read_text(encoding='utf-8')
                self.assertEqual(ids, ids.intersection(re.findall(r'`([a-z0-9-]+)`', guide)))
        panels = '\n'.join((WORLD / filename).read_text(encoding='utf-8') for filename in (
            'Editor/InteractiveLab.cs', 'Runtime/QuickStartStation.cs', 'Runtime/CapabilityStation.cs'))
        self.assertEqual(ids, ids.intersection(re.findall(r'[a-z][a-z0-9]*(?:-[a-z0-9]+)+', panels)))
