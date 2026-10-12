import importlib.util
from pathlib import Path
import unittest
import json
import subprocess
import sys
import tempfile

spec = importlib.util.spec_from_file_location('gpu_capture', Path(__file__).resolve().parents[2] / 'scripts/analyze-gpu-capture.py')
gpu = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gpu)


def capture(points=None):
    return dict(schema='sensa.sps-gpu-model.v1', valid=True, worldLength=.2,
                entryPosition=dict(x=0, y=0, z=0), entryNormal=dict(x=0, y=0, z=1),
                centerline=points or [dict(x=.01, y=0, z=-.1 + .2 * i / 32) for i in range(33)],
                firstSegmentStrength=[1] * 33)


class GpuCaptureTests(unittest.TestCase):
    def test_cli_accepts_explicit_file_and_rejects_corruption(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'capture.json'
            path.write_text(json.dumps(capture()), encoding='utf-8')
            command = [sys.executable, '-X', 'utf8', spec.origin, str(path)]
            result = subprocess.run(command, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertTrue(json.loads(result.stdout)['diagnosticOnly'])
            path.write_text('{broken', encoding='utf-8')
            result = subprocess.run(command, capture_output=True, text=True)
            self.assertEqual(result.returncode, 2)
            self.assertIn('Invalid capture', result.stderr)

    def test_single_sample_crossing_and_lateral_offset(self):
        result = gpu.analyze(capture())
        self.assertTrue(result['usable'])
        self.assertAlmostEqual(result['materialFractionAfterPlane'], .5)
        self.assertAlmostEqual(result['sampledArcAfterPlaneMeters'], .1)
        self.assertAlmostEqual(result['entryPlaneOffsetMeters'], .01)

    def test_interpolated_crossing(self):
        data = capture()
        data['entryPosition']['z'] = .003
        result = gpu.analyze(data)
        self.assertTrue(result['usable'])
        self.assertAlmostEqual(result['sampledArcAfterPlaneMeters'], .097)

    def test_aperture_incidence_and_sampling_diagnostics(self):
        result=gpu.analyze(capture(), aperture_radius=.02, min_incidence_degrees=10)
        self.assertTrue(result['usable'])
        self.assertAlmostEqual(result['incidenceDegrees'],90)
        self.assertAlmostEqual(result['sampledArcFractionAfterPlane'],.5)
        self.assertAlmostEqual(result['coarseToFineArcDifferenceMeters'],0)
        self.assertFalse(gpu.analyze(capture(),aperture_radius=.005)['usable'])
        shallow=capture([dict(x=-.1+.2*i/32,y=0,z=-.001+.002*i/32) for i in range(33)])
        self.assertFalse(gpu.analyze(shallow,min_incidence_degrees=5)['usable'])
        with self.assertRaises(ValueError):gpu.analyze(capture(),aperture_radius=float('nan'))
        with self.assertRaises(ValueError):gpu.analyze(capture(),min_incidence_degrees=90)

    def test_collapsed_segment_cannot_supply_direction(self):
        data=capture();data['centerline'][3]=data['centerline'][2].copy()
        self.assertFalse(gpu.analyze(data)['usable'])

    def test_curved_length_is_not_straight_chord(self):
        points = [dict(x=.1 * (i / 32) ** 2, y=0, z=-.1 + .2 * i / 32) for i in range(33)]
        result = gpu.analyze(capture(points))
        self.assertTrue(result['usable'])
        self.assertGreater(result['polylineLengthMeters'], (.2**2 + .1**2)**.5)
        self.assertGreater(result['sampledArcAfterPlaneMeters'], .1)

    def test_rejects_partial_blend_missing_target_and_reverse(self):
        data = capture(); data['firstSegmentStrength'][0] = .5
        self.assertFalse(gpu.analyze(data)['usable'])
        data = capture(); data['centerline'].reverse()
        self.assertFalse(gpu.analyze(data)['usable'])
        data['valid'] = False
        with self.assertRaises(ValueError): gpu.analyze(data)

    def test_coplanar_tangent_and_multiple_crossings(self):
        for zs in ([0] * 33, [abs(i - 16) * .01 for i in range(33)],
                   [-.1 if i < 8 or 16 <= i < 24 else .1 for i in range(33)]):
            with self.subTest(zs=zs):
                data = capture([dict(x=0, y=0, z=z) for z in zs])
                self.assertFalse(gpu.analyze(data)['usable'])

    def test_rejects_corruption_and_wrong_schema(self):
        for mutate in (lambda d: d.update(schema='other'),
                       lambda d: d['centerline'].pop(),
                       lambda d: d['centerline'][0].update(z=float('nan')),
                       lambda d: d.update(worldLength=float('inf')),
                       lambda d: d['entryNormal'].update(z=0)):
            data = capture(); mutate(data)
            with self.assertRaises(ValueError): gpu.analyze(data)


if __name__ == '__main__': unittest.main()
