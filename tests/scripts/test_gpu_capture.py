"""Offline GPU geometry contracts. / 离线 GPU 几何契约。"""
from contextlib import redirect_stderr, redirect_stdout
import io
import json
import math
import sys
import unittest
from unittest.mock import patch

from lab_contract_fixtures import LabFixture, load_script

gpu = load_script('analyze-gpu-capture')


def capture(points=None):
    return dict(schema='sensa.sps-gpu-model.v1', valid=True, worldLength=.2,
                entryPosition=dict(x=0, y=0, z=0), entryNormal=dict(x=0, y=0, z=1),
                centerline=points if points is not None else [dict(x=.01, y=0, z=-.1 + .2 * i / 32) for i in range(33)],
                firstSegmentStrength=[1] * 33)


class ModelPlaneCrossingContracts(unittest.TestCase):
    def test_sampled_and_interpolated_forward_crossings_remain_diagnostic_only(self):
        for plane_z, expected_arc in ((0, .1), (.003, .097)):
            with self.subTest(plane_z=plane_z):
                data = capture()
                data['entryPosition']['z'] = plane_z
                result = gpu.analyze(data)
                self.assertTrue(result['usable'])
                self.assertTrue(result['diagnosticOnly'])
                self.assertAlmostEqual(result['sampledArcAfterPlaneMeters'], expected_arc)
                self.assertAlmostEqual(result['materialFractionAfterPlane'], expected_arc / .2)
                self.assertAlmostEqual(result['entryPlaneOffsetMeters'], .01)
                self.assertAlmostEqual(result['incidenceDegrees'], 90)
                self.assertAlmostEqual(result['coarseToFineArcDifferenceMeters'], 0)

    def test_aperture_and_incidence_are_explicit_acceptance_constraints(self):
        result = gpu.analyze(capture(), aperture_radius=.02, min_incidence_degrees=10)
        self.assertTrue(result['usable'])
        self.assertAlmostEqual(result['sampledArcFractionAfterPlane'], .5)
        self.assertFalse(gpu.analyze(capture(), aperture_radius=.005)['usable'])
        shallow = capture([dict(x=-.1 + .2 * i / 32, y=0, z=-.001 + .002 * i / 32) for i in range(33)])
        self.assertFalse(gpu.analyze(shallow, min_incidence_degrees=5)['usable'])

    def test_curved_sampling_uses_arc_length_instead_of_the_endpoint_chord(self):
        points = [dict(x=.1 * (i / 32) ** 2, y=0, z=-.1 + .2 * i / 32) for i in range(33)]
        result = gpu.analyze(capture(points))
        self.assertTrue(result['usable'])
        self.assertGreater(result['polylineLengthMeters'], math.hypot(.2, .1))
        self.assertGreater(result['sampledArcAfterPlaneMeters'], .1)

    def test_collapsed_blended_or_reversed_paths_cannot_claim_usable_geometry(self):
        cases = {
            'collapsed': lambda data: data['centerline'].__setitem__(3, data['centerline'][2].copy()),
            'partial blend': lambda data: data['firstSegmentStrength'].__setitem__(0, .5),
            'reverse': lambda data: data['centerline'].reverse(),
        }
        for name, mutate in cases.items():
            data = capture()
            mutate(data)
            with self.subTest(case=name):
                self.assertFalse(gpu.analyze(data)['usable'])

    def test_coplanar_tangent_multiple_crossings_and_endpoint_contacts_are_not_entry(self):
        cases = (
            [0] * 33,
            [abs(i - 16) * .01 for i in range(33)],
            [-.1 if i < 8 or 16 <= i < 24 else .1 for i in range(33)],
            [.2 * i / 32 for i in range(33)],
        )
        for values in cases:
            with self.subTest(values=values):
                self.assertFalse(gpu.analyze(capture([dict(x=0, y=0, z=value) for value in values]))['usable'])


class CaptureValidationContracts(unittest.TestCase):
    def test_schema_shape_vectors_lengths_and_strengths_are_validated(self):
        cases = {
            'schema': lambda data: data.update(schema='other'),
            'missing target': lambda data: data.update(valid=False),
            'sample count': lambda data: data['centerline'].pop(),
            'strength count': lambda data: data['firstSegmentStrength'].pop(),
            'sample NaN': lambda data: data['centerline'][0].update(z=float('nan')),
            'sample bound': lambda data: data['centerline'][0].update(x=1000001),
            'length infinity': lambda data: data.update(worldLength=float('inf')),
            'length bool': lambda data: data.update(worldLength=True),
            'zero normal': lambda data: data['entryNormal'].update(z=0),
            'strength infinity': lambda data: data['firstSegmentStrength'].__setitem__(0, float('inf')),
            'strength bool': lambda data: data['firstSegmentStrength'].__setitem__(0, True),
        }
        for name, mutate in cases.items():
            data = capture()
            mutate(data)
            with self.subTest(case=name), self.assertRaises(ValueError):
                gpu.analyze(data)

    def test_nonfinite_or_out_of_range_calibration_options_are_rejected(self):
        for radius in (0, -1, True, float('nan'), float('inf')):
            with self.subTest(radius=radius), self.assertRaises(ValueError):
                gpu.analyze(capture(), aperture_radius=radius)
        for incidence in (-1, 90, True, float('nan'), float('inf')):
            with self.subTest(incidence=incidence), self.assertRaises(ValueError):
                gpu.analyze(capture(), min_incidence_degrees=incidence)


class AnalyzerCommandContracts(LabFixture):
    def test_cli_reads_only_the_explicit_file_and_emits_diagnostic_json(self):
        path = self.write(self.root / 'capture.json', json.dumps(capture()))
        output = io.StringIO()
        with patch.object(sys, 'argv', ['analyze-gpu-capture.py', str(path)]), redirect_stdout(output):
            gpu.main()
        self.assertTrue(json.loads(output.getvalue())['diagnosticOnly'])

    def test_cli_reports_corruption_wrong_shape_and_oversize_without_a_subprocess(self):
        for content in ('{broken', '[]', 'x' * 65537):
            path = self.write(self.root / 'capture.json', content)
            error = io.StringIO()
            with self.subTest(size=len(content)), patch.object(sys, 'argv', ['analyze-gpu-capture.py', str(path)]), redirect_stderr(error):
                with self.assertRaises(SystemExit) as exited:
                    gpu.main()
                self.assertEqual(exited.exception.code, 2)
                self.assertIn('Invalid capture', error.getvalue())
