"""Negative contracts for measured C# analysis evidence, without running CodeQL."""
import argparse
import copy
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import zipfile

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location('sensa_codeql_quality', ROOT / 'scripts/verify-codeql-csharp.py')
QUALITY = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(QUALITY)
COMMIT = '1' * 40


class CodeQLCSharpEvidenceContracts(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='sensa-codeql-evidence-')
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        # These are source/archive fixtures, not a new Git checkout or database.
        self.repository = self.root / 'checkout'
        self.repository.mkdir()
        self.database = self.root / 'database'
        metrics = self.database / 'results/codeql/csharp-queries/Telemetry'
        metrics.mkdir(parents=True)
        self.bqrs = metrics / 'ExtractorInformation.bqrs'
        self.bqrs.write_bytes(b'synthetic result used only to test the evidence reader')
        self.sources = {'src/Application.cs': b'public class Application {}\n',
                        'unity/Editor/Generator.cs': b'public class Generator {}\n'}
        self.decoded = {'#select': {'columns': [{'name': 'key', 'kind': 'String'},
                                              {'name': 'value', 'kind': 'Float'}],
                                    'tuples': [[QUALITY.METRICS[0], 85.0],
                                               [QUALITY.METRICS[1], 95.0],
                                               [QUALITY.NONE_METRIC, 0]]}}
        self.arguments = argparse.Namespace(database=str(self.database), databases_json=None,
                                            codeql='fixture-codeql', repository=str(self.repository),
                                            expected_commit=COMMIT,
                                            output=str(self.root / 'evidence/quality.json'))
        self.write_archive()
        self.decode_exit_code = 0

    def write_archive(self, sources=None, prefix=None):
        prefix = self.repository.as_posix().lstrip('/') if prefix is None else prefix
        with zipfile.ZipFile(self.database / 'src.zip', 'w') as archive:
            for path, content in (self.sources if sources is None else sources).items():
                archive.writestr(prefix + '/' + path, content)

    def fake_git(self, repository, *arguments):
        self.assertEqual(repository, self.repository)
        if arguments == ('rev-parse', 'HEAD'):
            return (COMMIT + '\n').encode()
        if arguments == ('ls-tree', '-r', '--name-only', '-z', COMMIT):
            return ('\0'.join(self.sources) + '\0').encode()
        if arguments[0] == 'show':
            commit, path = arguments[1].split(':', 1)
            self.assertEqual(commit, COMMIT)
            return self.sources[path]
        self.fail('Unexpected Git fixture command')

    def fake_decode(self, command, **kwargs):
        self.assertEqual(command[:4], ['fixture-codeql', 'bqrs', 'decode', '--format=json'])
        self.assertEqual(command[-1], str(self.bqrs))
        if not self.decode_exit_code:
            output = Path(command[4].removeprefix('--output='))
            output.write_text(json.dumps(self.decoded), encoding='utf-8')
        return argparse.Namespace(returncode=self.decode_exit_code)

    def verify(self):
        with patch.object(QUALITY, 'git', side_effect=self.fake_git), \
             patch.object(QUALITY.subprocess, 'run', side_effect=self.fake_decode):
            return QUALITY.verify(self.arguments)

    def assert_failed(self, report):
        self.assertEqual(report['result'], 'failed')
        self.assertTrue(report['errors'])

    def test_exact_threshold_and_all_tracked_application_and_unity_sources_pass(self):
        report = self.verify()
        self.assertEqual(report['result'], 'passed')
        self.assertEqual(report['threshold'], 85)
        self.assertEqual(report['sourceCoverage']['trackedCSharpCount'], 2)
        self.assertEqual(report['sourceCoverage']['matchedCount'], 2)
        self.assertTrue(report['sourceCoverage']['allTrackedSourcesCovered'])
        self.assertFalse(report['querySuiteRerun'])

    def test_either_quality_metric_below_threshold_fails(self):
        for index in (0, 1):
            with self.subTest(metric=index):
                original = copy.deepcopy(self.decoded)
                self.decoded['#select']['tuples'][index][1] = 84.99
                self.assert_failed(self.verify())
                self.decoded = original

    def test_missing_metric_is_not_treated_as_a_successful_scan(self):
        self.decoded['#select']['tuples'].pop(0)
        self.assert_failed(self.verify())

    def test_malformed_metric_result_produces_failure_instead_of_crashing(self):
        for value in ([], None, {'#select': {'columns': None}},
                      {'#select': {'columns': {}, 'tuples': []}}):
            with self.subTest(value=value):
                self.decoded = value
                self.assert_failed(self.verify())

    def test_duplicate_metric_does_not_allow_choosing_the_better_value(self):
        self.decoded['#select']['tuples'].append([QUALITY.METRICS[0], 100])
        self.assert_failed(self.verify())

    def test_nonfinite_nonnumeric_or_boolean_metrics_fail(self):
        for value in (float('nan'), float('inf'), '100', True):
            with self.subTest(value=str(value)):
                self.decoded['#select']['tuples'][0][1] = value
                self.assert_failed(self.verify())

    def test_none_mode_does_not_pass_as_a_traced_build(self):
        self.decoded['#select']['tuples'][2][1] = 1
        self.assert_failed(self.verify())

    def test_missing_unity_source_is_not_hidden_by_good_metrics(self):
        self.write_archive({'src/Application.cs': self.sources['src/Application.cs']})
        report = self.verify()
        self.assert_failed(report)
        self.assertEqual(report['sourceCoverage']['missing'], ['unity/Editor/Generator.cs'])

    def test_source_content_must_match_the_pinned_git_blob(self):
        sources = dict(self.sources)
        sources['unity/Editor/Generator.cs'] = b'public class FakeGenerator {}\n'
        self.write_archive(sources)
        report = self.verify()
        self.assert_failed(report)
        self.assertEqual(report['sourceCoverage']['contentMismatches'], ['unity/Editor/Generator.cs'])

    def test_foreign_archive_paths_do_not_count_as_repository_sources(self):
        self.write_archive(prefix='some-other-checkout')
        report = self.verify()
        self.assert_failed(report)
        self.assertEqual(report['sourceCoverage']['matchedCount'], 0)

    def test_only_bom_and_newline_normalization_is_allowed(self):
        self.sources['src/Application.cs'] = b'\xef\xbb\xbfpublic class Application {}\r\n'
        sources = dict(self.sources)
        sources['src/Application.cs'] = b'public class Application {}\n'
        self.write_archive(sources)
        report = self.verify()
        self.assertEqual(report['result'], 'passed')
        entry = next(row for row in report['sourceCoverage']['matched']
                     if row['path'] == 'src/Application.cs')
        self.assertEqual(entry['comparison'], 'utf8-bom-or-newlines')

    def test_absent_or_corrupt_archive_produces_failure_evidence(self):
        for content in (None, b'not a zip'):
            with self.subTest(archive='absent' if content is None else 'corrupt'):
                archive = self.database / 'src.zip'
                if content is None:
                    archive.unlink()
                else:
                    archive.write_bytes(content)
                self.assert_failed(self.verify())

    def test_missing_or_duplicate_metric_result_fails_without_rerunning_queries(self):
        self.bqrs.unlink()
        self.assert_failed(self.verify())
        self.bqrs.write_bytes(b'fixture')
        duplicate = self.database / 'results/another-pack/Telemetry/ExtractorInformation.bqrs'
        duplicate.parent.mkdir(parents=True)
        duplicate.write_bytes(b'duplicate')
        self.assert_failed(self.verify())

    def test_decode_failure_or_source_commit_mismatch_fails(self):
        self.decode_exit_code = 2
        self.assert_failed(self.verify())
        self.decode_exit_code = 0
        self.arguments.expected_commit = '2' * 40
        self.assert_failed(self.verify())

    def test_main_writes_a_failure_receipt_when_archive_is_missing(self):
        (self.database / 'src.zip').unlink()
        arguments = ['verify-codeql-csharp.py', '--database', str(self.database),
                     '--repository', str(self.repository), '--codeql', 'fixture-codeql',
                     '--expected-commit', COMMIT, '--output', self.arguments.output]
        with patch.object(QUALITY, 'git', side_effect=self.fake_git), \
             patch.object(QUALITY.subprocess, 'run', side_effect=self.fake_decode), \
             patch.object(QUALITY.sys, 'argv', arguments), \
             patch('sys.stdout', new_callable=io.StringIO):
            self.assertEqual(QUALITY.main(), 1)
        output = json.loads(Path(self.arguments.output).read_text())
        self.assert_failed(output)


if __name__ == '__main__':
    unittest.main()
