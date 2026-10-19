"""Fixed-root smoke fixture geometry only; never runs a process or network smoke.
固定根冒烟夹具的几何契约，不运行进程或网络冒烟。
"""
import math
import unittest

from lab_contract_fixtures import load_script

smoke = load_script('smoke')


class FixedRootSmokeFixtureContracts(unittest.TestCase):
    def test_fixed_root_exposes_only_four_P_ranges_and_active_sample(self):
        values = dict(smoke.fixed_root_samples((0, 1, 0)))
        prefix = 'Sensa/SPS/Smoke'
        expected = 1 - (math.sqrt(.75) - .001) / 2.5
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
                squared = [(2.5 * (1 - value) + .001) ** 2 for value in proximity]
                a, b, c, d = squared
                actual = ((a - b - c + d) / 4, 1 + (a + b - c - d) / 4, (a - b + c - d) / 4)
                for measured, target in zip(actual, expected):
                    self.assertAlmostEqual(measured, target, places=10)
