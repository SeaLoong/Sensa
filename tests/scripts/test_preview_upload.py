import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location('preview_upload', Path(__file__).resolve().parents[2] / 'scripts/publish-preview.py')
preview = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(preview)


class PreviewUploadTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / 'fixture.zip'
        self.path.write_bytes(b'fixture')
        self.release = {'draft': True, 'prerelease': True, 'tag_name': 'preview-test', 'target_commitish': 'a' * 40,
                        'assets': [{'name': self.path.name, 'size': 7, 'state': 'uploaded',
                                    'digest': 'sha256:' + hashlib.sha256(b'fixture').hexdigest()}]}

    def test_retry_then_publish_only_after_remote_verification(self):
        def run(command, **kwargs):
            if command[2] == 'upload' and len(calls) == 0:
                calls.append(command)
                raise subprocess.CalledProcessError(1, command)
            calls.append(command)
            return subprocess.CompletedProcess(command, 0)
        calls = []
        with patch.object(preview.subprocess, 'run', side_effect=run), \
             patch.object(preview.subprocess, 'check_output', side_effect=[b'https://api.github.com/repos/Owner/Repo/releases/123', json.dumps(self.release).encode()]) as query, \
             patch.object(preview.time, 'sleep'):
            preview.upload_and_publish('preview-test', 'a' * 40, [self.path], 'Owner/Repo')
        self.assertEqual([call[2] for call in calls], ['upload', 'upload', 'edit'])
        self.assertEqual(query.call_count, 2)
        self.assertEqual(query.call_args.args[0][-1], 'repos/Owner/Repo/releases/123')

    def test_exhausted_upload_keeps_draft_unpublished(self):
        for error in [subprocess.CalledProcessError(1, 'gh'), subprocess.TimeoutExpired('gh', 180)]:
            with self.subTest(error=type(error).__name__), \
                 patch.object(preview.subprocess, 'run', side_effect=error) as run, \
                 patch.object(preview.subprocess, 'check_output') as query, \
                 patch.object(preview.time, 'sleep'), self.assertRaises(type(error)):
                preview.upload_and_publish('preview-test', 'a' * 40, [self.path], 'Owner/Repo')
            self.assertEqual(run.call_count, 3)
            self.assertTrue(all(call.args[0][2] == 'upload' for call in run.call_args_list))
            query.assert_not_called()

    def test_wrong_or_incomplete_remote_asset_never_publishes(self):
        for field, value in [('size', 0), ('digest', 'sha256:bad'), ('state', 'starter'), ('name', 'unknown.zip')]:
            release = json.loads(json.dumps(self.release))
            release['assets'][0][field] = value
            with self.subTest(field=field), \
                 patch.object(preview.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0)) as run, \
                 patch.object(preview.subprocess, 'check_output', side_effect=[b'https://api.github.com/repos/Owner/Repo/releases/123', json.dumps(release).encode()]), \
                 self.assertRaises(ValueError):
                preview.upload_and_publish('preview-test', 'a' * 40, [self.path], 'Owner/Repo')
            self.assertEqual(run.call_count, 1)
            self.assertEqual(run.call_args.args[0][2], 'upload')

    def test_missing_duplicate_or_wrong_release_identity_is_rejected(self):
        for change in [{'assets': []}, {'assets': self.release['assets'] * 2}, {'draft': False},
                       {'prerelease': False}, {'target_commitish': 'b' * 40}, {'tag_name': 'v1.0.0'}]:
            with self.subTest(change=change), self.assertRaises(ValueError):
                preview.verify_draft(self.release | change, 'preview-test', 'a' * 40, [self.path])


if __name__ == '__main__':
    unittest.main()
