"""Validation contracts use a fake Unity process and real isolated report files.
验证契约使用模拟 Unity 进程及真实的隔离报告文件。
"""
import contextlib
import io
import json
import sys
import os
import subprocess
import time
from unittest.mock import patch

from lab_contract_fixtures import LabFixture, load_script

lab = load_script('validate-labs')


class UnityReportProcess:
    def __init__(self, project, suite, *, exit_code=0, report='{"passed":true}', error=None, scene=None):
        self.project, self.suite = project, lab.SUITES[suite]
        self.exit_code, self.report, self.error, self.scene = exit_code, report, error, scene
        self.commands = []

    def __call__(self, command, **options):
        self.commands.append((command, options))
        if self.error:
            raise self.error
        if self.scene:
            self.scene.write_text('unexpected rewrite', encoding='utf-8')
        if self.report is not None:
            for relative in self.suite.reports:
                LabFixture.write(self.project / relative, self.report)
            if self.suite.package_tests:
                result = command[command.index('-testResults') + 1]
                LabFixture.write(lab.Path(result), '<test-run total="23" passed="23" failed="0" skipped="0" result="Passed"/>')
        return subprocess.CompletedProcess(command, self.exit_code)


class LabExecutionContracts(LabFixture):
    def setUp(self):
        super().setUp()
        policy = patch.dict(os.environ, {'GITHUB_ACTIONS': 'true'})
        policy.start()
        self.addCleanup(policy.stop)

    def run_suite(self, suite='world-functional', **options):
        project = self.project(lab.SUITES[suite].project_kind)
        runner = UnityReportProcess(project, suite, **options)
        result = lab.run_suite(suite, project, self.root / 'fake-Unity.exe', self.root / 'output', 17, run_process=runner)
        return project, runner, result

    def test_every_catalog_suite_requires_fresh_reports_and_the_expected_process_contract(self):
        for suite in lab.SUITES:
            with self.subTest(suite=suite):
                _, runner, result = self.run_suite(suite)
                self.assertTrue(result['passed'], result.get('error'))
                self.assertEqual(len(runner.commands), 1)
                command, options = runner.commands[0]
                self.assertEqual(options['timeout'], 17)
                self.assertFalse(options['check'])
                self.assertIn('-batchmode', command)
                self.assertNotIn('-quit', command)
                self.assertNotIn('-nographics', command)
                self.assertEqual(command[command.index('-executeMethod') + 1], lab.SUITES[suite].execute_method)
                self.assertEqual(len(result['reports']), len(lab.SUITES[suite].reports) + int(lab.SUITES[suite].package_tests))
                for copied in result['reports']:
                    self.assertTrue(lab.Path(copied).is_file())
                if lab.SUITES[suite].package_tests:
                    self.assertIn('-runTests', command)
                    self.assertIn('EditMode', command)
                    self.assertIn('UnityBox.Sensa.Tests', command)

    def test_a_zero_exit_cannot_reuse_stale_success(self):
        project = self.project('world')
        for relative in lab.SUITES['world-functional'].reports:
            self.write(project / relative, '{"passed":true}')
        runner = UnityReportProcess(project, 'world-functional', report=None)
        result = lab.run_suite('world-functional', project, lab.Path('Unity.exe'), self.root / 'output', 1, run_process=runner)
        self.assertFalse(result['passed'])
        self.assertIn('Stale report', result['error'])

    def test_failure_exit_is_required_even_with_fresh_success_reports(self):
        _, _, result = self.run_suite(exit_code=1)
        self.assertFalse(result['passed'])
        self.assertEqual(result['exitCode'], 1)
        self.assertIn('exited with code 1', result['error'])

    def test_missing_false_malformed_or_non_boolean_reports_fail(self):
        for index, payload in enumerate((None, '{"passed":false}', '{"passed":"true"}', '[]', '{')):
            project = self.project('world')
            runner = UnityReportProcess(project, 'world-functional', report=payload)
            output = self.root / ('output-' + str(index))
            with self.subTest(payload=payload):
                result = lab.run_suite('world-functional', project, lab.Path('Unity.exe'), output, 1, run_process=runner)
                self.assertFalse(result['passed'])

    def test_timeout_and_launch_errors_are_persisted_as_failed_results(self):
        for suite, error in (('avatar-tests', subprocess.TimeoutExpired('Unity', 1)), ('world-editor', OSError('cannot launch'))):
            with self.subTest(error=error):
                _, _, result = self.run_suite(suite, error=error)
                self.assertFalse(result['passed'])
                persisted = json.loads((self.root / 'output' / suite / 'result.json').read_text())
                self.assertFalse(persisted['passed'])
                self.assertIn('error', persisted)

    def test_changes_to_authoring_scenes_fail_even_when_reports_pass(self):
        project = self.project('world')
        scene = self.write(project / 'Assets/SensaLab/Generated/SensaLab.unity', 'user scene')
        runner = UnityReportProcess(project, 'world-functional', scene=scene)
        result = lab.run_suite('world-functional', project, lab.Path('Unity.exe'), self.root / 'output', 1, run_process=runner)
        self.assertFalse(result['passed'])
        self.assertIn('changed an authoring scene', result['error'])

    def test_reusing_a_result_directory_is_rejected_before_launch(self):
        _, runner, _ = self.run_suite()
        with self.assertRaises(FileExistsError):
            lab.run_suite('world-functional', self.project('world'), lab.Path('Unity.exe'), self.root / 'output', 1, run_process=runner)
        self.assertEqual(len(runner.commands), 1)


class LabCiPolicyContracts(LabFixture):
    def test_world_suites_refuse_local_execution_before_creating_reports_or_launching(self):
        for name, suite in lab.SUITES.items():
            if suite.project_kind != 'world':
                continue
            runner = UnityReportProcess(self.project('world'), name)
            with self.subTest(suite=name), patch.dict(os.environ, {'GITHUB_ACTIONS': 'false'}), self.assertRaisesRegex(RuntimeError, 'GitHub Actions'):
                lab.run_suite(name, self.project('world'), lab.Path('Unity.exe'), self.root / 'output', 1, run_process=runner)
            self.assertEqual(runner.commands, [])
            self.assertFalse((self.root / 'output').exists())

    def test_avatar_editmode_and_sdk_bundle_contracts_are_locally_allowed(self):
        for name in ('avatar-tests', 'avatar-build'):
            runner = UnityReportProcess(self.project('avatar'), name)
            with self.subTest(suite=name), patch.dict(os.environ, {'GITHUB_ACTIONS': 'false'}):
                result = lab.run_suite(name, self.project('avatar'), lab.Path('Unity.exe'), self.root / 'output', 1, run_process=runner)
            self.assertTrue(result['passed'])


class LabCommandContracts(LabFixture):
    def arguments(self, name, *, include_project=True):
        unity = self.write(self.root / 'Unity.exe', 'isolated placeholder')
        suite = lab.SUITES[name]
        args = ['validate-labs.py', '--unity', str(unity), '--suite', name,
                '--output', str(self.root / ('command-' + name))]
        if include_project:
            args += ['--' + suite.project_kind, str(self.project(suite.project_kind))]
        return args

    def test_every_cli_suite_resolves_its_project_and_writes_the_actual_result(self):
        for name, suite in lab.SUITES.items():
            args = self.arguments(name)
            result = {'suite': name, 'passed': True}
            with self.subTest(suite=name), patch.object(sys, 'argv', args), \
                    patch.object(lab, 'require_ci'), \
                    patch.object(lab, 'run_suite', return_value=result) as execute, \
                    contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(lab.main(), 0)
            self.assertEqual(execute.call_args.args[1], self.root / suite.project_kind)
            summary = json.loads((self.root / ('command-' + name) / 'summary.json').read_text())
            self.assertTrue(summary['passed'])
            self.assertEqual(summary['results'], [result])

    def test_missing_project_reports_an_argument_error_without_launching(self):
        for name in lab.SUITES:
            with self.subTest(suite=name), patch.object(sys, 'argv', self.arguments(name, include_project=False)), \
                    patch.object(lab, 'require_ci'), patch.object(lab, 'run_suite') as execute, \
                    contextlib.redirect_stderr(io.StringIO()) as errors, self.assertRaises(SystemExit) as failure:
                lab.main()
            self.assertEqual(failure.exception.code, 2)
            self.assertIn('--' + lab.SUITES[name].project_kind, errors.getvalue())
            execute.assert_not_called()
            self.assertFalse((self.root / ('command-' + name)).exists())

    def test_world_cli_guard_runs_before_output_creation_or_the_process_adapter(self):
        with patch.dict(os.environ, {'GITHUB_ACTIONS': 'false'}), \
                patch.object(sys, 'argv', self.arguments('world-editor')), \
                patch.object(lab, 'run_suite') as execute, contextlib.redirect_stderr(io.StringIO()), \
                self.assertRaises(SystemExit) as failure:
            lab.main()
        self.assertEqual(failure.exception.code, 2)
        execute.assert_not_called()
        self.assertFalse((self.root / 'command-world-editor').exists())


class ReportEvidenceContracts(LabFixture):
    def test_rewritten_old_timestamps_and_unchanged_fingerprints_are_stale(self):
        path = self.write(self.root / 'report.json', '{"passed":true}')
        before = lab.fingerprint(path)
        with self.assertRaisesRegex(ValueError, 'Stale'):
            lab.validate_report(path, before, time.time_ns())
        os.utime(path, (1, 1))
        with self.assertRaisesRegex(ValueError, 'Stale'):
            lab.validate_report(path, None, time.time_ns())

    def test_unity_xml_requires_nonempty_execution_with_no_failures_or_skips(self):
        for index, attributes in enumerate((
                'total="23" passed="23" result="Passed"',
                'total="0" passed="0" result="Passed"',
                'total="23" passed="22" result="Passed"',
                'total="23" passed="22" result="Failed"',
                'total="23" passed="23" skipped="1" result="Passed"',
                'total="23" passed="23" failed="1" result="Passed"',
                'total="23" passed="23" inconclusive="1" result="Passed"')):
            path = self.write(self.root / f'tests-{index}.xml', '<test-run ' + attributes + '/>')
            with self.subTest(attributes=attributes):
                if index == 0:
                    lab.validate_report(path, None, time.time_ns())
                else:
                    with self.assertRaises(ValueError):
                        lab.validate_report(path, None, time.time_ns())
