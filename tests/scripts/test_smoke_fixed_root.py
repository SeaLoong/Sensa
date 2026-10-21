"""Fixed-root smoke fixture geometry only; never runs a process or network smoke.
固定根冒烟夹具的几何契约，不运行进程或网络冒烟。
"""
import math
from pathlib import Path
import re
import unittest

from lab_contract_fixtures import load_script

smoke = load_script('smoke')
pose_demo = load_script('pose-demo')
ROOT = Path(__file__).resolve().parents[2]


class FixedRootSmokeFixtureContracts(unittest.TestCase):
    def test_fixed_root_exposes_only_four_P_ranges_and_active_sample(self):
        values = dict(smoke.fixed_root_samples((0, 1, 0)))
        prefix = 'Sensa/SPS/Smoke'
        expected = 1 - (math.sqrt(3 * .35 ** 2) - .001) / 2
        self.assertEqual(len(values), 5)
        for index in range(4):
            self.assertAlmostEqual(values[f'{prefix}/P{index}'], expected)
        self.assertEqual(values[prefix + '/Sample'], 1 / 32)
        self.assertEqual(set(values), {f'{prefix}/{field}' for field in ('P0', 'P1', 'P2', 'P3', 'Sample')})

    def test_independent_ranges_recover_all_three_avatar_root_local_coordinates(self):
        for expected in ((.025, 1.05, -.1), (-.2, .7, .3)):
            with self.subTest(point=expected):
                values = dict(smoke.fixed_root_samples(expected, instance='Explicit'))
                proximity = [values[f'Sensa/SPS/Explicit/P{i}'] for i in range(4)]
                self.assertTrue(all(0 < value < 1 for value in proximity))
                squared = [(2 * (1 - value) + .001) ** 2 for value in proximity]
                a, b, c, d = squared
                actual = ((a - b - c + d) / 2.8, 1 + (a + b - c - d) / 2.8, (a - b + c - d) / 2.8)
                for measured, target in zip(actual, expected):
                    self.assertAlmostEqual(measured, target, places=10)

    def test_independent_fixtures_match_the_current_shared_geometry(self):
        for protocol in ('SensaFixedAnchorProtocol.cs', 'SensaPoseProtocol.cs'):
            text = (ROOT / 'unity/top.sealoong.sensa/Runtime' / protocol).read_text()
            for name, expected in (('ReceiverRadius', 2), ('AnchorHalfSpan', .35), ('MarkerRadius', .001)):
                with self.subTest(protocol=protocol, constant=name):
                    match = re.search(r'const float ' + name + r'\s*=\s*([.\d]+)f;', text)
                    self.assertIsNotNone(match)
                    self.assertEqual(float(match[1]), expected)

    def test_pose_demo_ranges_recover_each_marker_inside_the_expanded_volume(self):
        expected = ((.1, .05, .8), (.1, .05, 1), (.13, .05, .8))
        values = dict(pose_demo.samples(*expected))
        self.assertEqual(len(values), 24)
        for marker, point in zip(('Root', 'Tip', 'Side'), expected):
            sums = [0., 0., 0.]
            for index in range(8):
                proximity = values[f'Sensa/Pose/v1/Demo/Others/{marker}/A{index}']
                self.assertTrue(0 < proximity < 1)
                squared = (2 * (1 - proximity) + .001) ** 2
                for axis in range(3):
                    sums[axis] -= (.35 if index & (1 << axis) else -.35) * squared
            for actual, target in zip(sums, point):
                self.assertAlmostEqual(actual / (16 * .35 ** 2), target, places=10)
