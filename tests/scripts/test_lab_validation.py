import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location('lab_validation', Path(__file__).resolve().parents[2] / 'scripts/validate-labs.py')
lab = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(lab)


class LabValidationTests(unittest.TestCase):
    def test_stale_success_is_rejected_even_when_unity_returns_zero(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            for relative in lab.SUITES['world-functional'][3]:
                path = root / relative
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text('{"passed":true}')
            with patch.object(lab.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0)):
                result = lab.run_suite('world-functional', root, Path('Unity.exe'), root / 'output', 1)
            self.assertFalse(result['passed'])
            self.assertIn('Stale report', result['error'])

    def test_fresh_reports_and_zero_exit_are_both_required(self):
        for code in [0, 1]:
            with self.subTest(code=code), tempfile.TemporaryDirectory() as temp:
                root = Path(temp)
                def run(command, **kwargs):
                    self.assertNotIn('-quit', command)
                    self.assertNotIn('-nographics', command)
                    for relative in lab.SUITES['world-functional'][3]:
                        path = root / relative
                        path.parent.mkdir(parents=True, exist_ok=True)
                        path.write_text('{"passed":true}')
                    return subprocess.CompletedProcess(command, code)
                with patch.object(lab.subprocess, 'run', side_effect=run):
                    result = lab.run_suite('world-functional', root, Path('Unity.exe'), root / 'output', 1)
                self.assertEqual(result['passed'], code == 0)

    def test_missing_false_malformed_and_non_boolean_reports_fail(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / 'report.json'
            for data in [None, '{"passed":false}', '{"passed":"true"}', '[]', '{']:
                if data is not None:
                    path.write_text(data)
                with self.subTest(data=data), self.assertRaises(ValueError):
                    lab.validate_report(path, None, time.time_ns())

    def test_rewritten_old_timestamp_is_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / 'report.json'
            path.write_text('{"passed":true}')
            os.utime(path, (1, 1))
            with self.assertRaisesRegex(ValueError, 'Stale'):
                lab.validate_report(path, None, time.time_ns())

    def test_unity_xml_must_contain_passing_executed_tests(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / 'tests.xml'
            for total, passed, result, ok in [(23, 23, 'Passed', True), (0, 0, 'Passed', False),
                                             (23, 22, 'Passed', False), (23, 22, 'Failed', False)]:
                path.write_text(f'<test-run total="{total}" passed="{passed}" result="{result}"/>')
                if ok:
                    lab.validate_report(path, None, time.time_ns())
                else:
                    with self.assertRaises(ValueError):
                        lab.validate_report(path, None, time.time_ns())

    def test_timeout_is_recorded_as_failure(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            with patch.object(lab.subprocess, 'run', side_effect=subprocess.TimeoutExpired('Unity', 1)):
                result = lab.run_suite('avatar-tests', root, Path('Unity.exe'), root / 'output', 1)
            self.assertFalse(result['passed'])
            self.assertIn('timed out', result['error'])
            self.assertFalse(json.loads((root / 'output/avatar-tests/result.json').read_text())['passed'])

    def test_authoring_scene_changes_fail_validation(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            scene = root / 'Assets/SensaLab/Generated/SensaLab.unity'
            scene.parent.mkdir(parents=True)
            scene.write_text('user scene')
            def run(command, **kwargs):
                scene.write_text('unexpected test rewrite')
                return subprocess.CompletedProcess(command, 0)
            with patch.object(lab.subprocess, 'run', side_effect=run):
                result = lab.run_suite('world-functional', root, Path('Unity.exe'), root / 'output', 1)
            self.assertFalse(result['passed'])
            self.assertIn('changed an authoring scene', result['error'])


if __name__ == '__main__':
    unittest.main()
