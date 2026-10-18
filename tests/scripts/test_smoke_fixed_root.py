"""Fixed-root smoke fixture geometry only; never runs a process or network smoke.
固定根冒烟夹具的几何契约，不运行进程或网络冒烟。
"""
import math
import unittest

from lab_contract_fixtures import load_script

smoke = load_script('smoke')


class FixedRootSmokeFixtureContracts(unittest.TestCase):
    def test_fixed_root_uses_four_known_ranges_and_metadata_below_self(self):
        values = dict(smoke.fixed_root_samples((0, 1, 0)))
        prefix = 'Sensa/SpsRoot/v1/Smoke/Self'
        expected = 1 - (math.sqrt(.75) - .001) / 2.5
        self.assertEqual(len(values), 8)
        for index in range(4):
            self.assertAlmostEqual(values[f'{prefix}/Root/A{index}'], expected)
        self.assertEqual(values[prefix + '/Profile'], 1)
        self.assertEqual(values[prefix + '/Valid'], 1)
        self.assertEqual(values[prefix + '/Scale'], 1)
        self.assertEqual(values[prefix + '/Heartbeat'], 1 / 31)
        self.assertNotIn(prefix + '/Root/Valid', values)
        self.assertFalse(any('/Others/' in path or path.endswith('/A4') for path in values))

    def test_independent_ranges_recover_all_three_avatar_root_local_coordinates(self):
        for expected in ((.025, 1.05, -.1), (-.2, .7, .3)):
            with self.subTest(point=expected):
                values = dict(smoke.fixed_root_samples(expected, instance='Explicit'))
                proximity = [values[f'Sensa/SpsRoot/v1/Explicit/Self/Root/A{i}'] for i in range(4)]
                self.assertTrue(all(0 < value < 1 for value in proximity))
                squared = [(2.5 * (1 - value) + .001) ** 2 for value in proximity]
                a, b, c, d = squared
                actual = ((a - b - c + d) / 4, 1 + (a + b - c - d) / 4, (a - b + c - d) / 4)
                for measured, target in zip(actual, expected):
                    self.assertAlmostEqual(measured, target, places=10)
