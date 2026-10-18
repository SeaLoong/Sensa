"""Preview lifecycle and retention contracts using a fake GitHub adapter.
使用伪 GitHub 适配器验证预览生命周期与保留契约；绝不访问远端。
"""
from datetime import datetime, timedelta, timezone
import hashlib
import importlib.util
import json
from pathlib import Path
import random
import subprocess
import tempfile
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location('preview_upload', Path(__file__).resolve().parents[2] / 'scripts/publish-preview.py')
preview = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(preview)
SHA = 'a' * 40


def published(number, **changes):
    timestamp = (datetime(2026, 1, 1, tzinfo=timezone.utc) + timedelta(days=number)).isoformat()
    return dict(id=number, tag_name=f'preview-{number}', target_commitish=SHA,
                published_at=timestamp, created_at='2020-01-01T00:00:00Z',
                draft=False, prerelease=True, **changes)


class FakeReleases:
    """In-memory adapter records observable mutations. / 内存适配器记录可观察变更."""
    repository = 'Owner/Repo'

    def __init__(self, releases=()):
        self.releases = {release['id']: dict(release) for release in releases}
        self.listing = [dict(release) for release in releases]
        self.events = []
        self.upload_errors = []
        self.remote = None

    def upload(self, tag, path):
        self.events.append(('upload', tag, path.name))
        if self.upload_errors:
            raise self.upload_errors.pop(0)

    def draft(self, tag):
        self.events.append(('draft', tag))
        return self.remote

    def publish(self, tag):
        self.events.append(('publish', tag))

    def list(self):
        self.events.append(('list',))
        return self.listing

    def get(self, release_id):
        self.events.append(('get', release_id))
        return self.releases[release_id]

    def delete(self, release_id):
        self.events.append(('delete', release_id))
        del self.releases[release_id]


class PreviewPublicationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / 'fixture.zip'
        self.path.write_bytes(b'fixture')
        self.releases = FakeReleases()
        self.releases.remote = {
            'draft': True, 'prerelease': True, 'tag_name': 'preview-test', 'target_commitish': SHA,
            'assets': [{'name': self.path.name, 'size': 7, 'state': 'uploaded',
                        'digest': 'sha256:' + hashlib.sha256(b'fixture').hexdigest()}]}

    def publish(self):
        preview.upload_and_publish('preview-test', SHA, [self.path], self.releases, pause=lambda _: None)

    def test_retry_then_publish_only_after_remote_asset_verification(self):
        self.releases.upload_errors = [subprocess.CalledProcessError(1, 'gh')]
        self.publish()
        self.assertEqual([event[0] for event in self.releases.events], ['upload', 'upload', 'draft', 'publish'])

    def test_exhausted_upload_remains_private(self):
        for error in (subprocess.CalledProcessError(1, 'gh'), subprocess.TimeoutExpired('gh', 180)):
            with self.subTest(error=type(error).__name__):
                self.releases.events.clear()
                self.releases.upload_errors = [error] * 3
                with self.assertRaises(type(error)):
                    self.publish()
                self.assertEqual([event[0] for event in self.releases.events], ['upload'] * 3)

    def test_wrong_incomplete_or_duplicate_remote_asset_prevents_publication(self):
        original = json.loads(json.dumps(self.releases.remote))
        cases = [{**original, 'assets': []}, {**original, 'assets': original['assets'] * 2}]
        for field, value in [('size', 0), ('digest', 'sha256:bad'), ('state', 'starter'), ('name', 'unknown.zip')]:
            release = json.loads(json.dumps(original))
            release['assets'][0][field] = value
            cases.append(release)
        for release in cases:
            with self.subTest(release=release):
                self.releases.remote = release
                self.releases.events.clear()
                with self.assertRaises(ValueError):
                    self.publish()
                self.assertNotIn('publish', [event[0] for event in self.releases.events])

    def test_wrong_release_identity_prevents_publication(self):
        for change in ({'draft': False}, {'prerelease': False}, {'target_commitish': 'b' * 40}, {'tag_name': 'v1.0.0'}):
            with self.subTest(change=change), self.assertRaises(ValueError):
                preview.verify_draft(self.releases.remote | change, 'preview-test', SHA, [self.path])

    def test_run_gate_requires_main_push_and_same_commit_comparison(self):
        valid = {'GITHUB_EVENT_NAME': 'push', 'GITHUB_REF': 'refs/heads/main', 'GITHUB_SHA': SHA,
                 'GITHUB_RUN_NUMBER': '42', 'GITHUB_RUN_ATTEMPT': '1', 'SENSA_E2E_COMPARISON_SHA': SHA}
        self.assertEqual(preview.validate_run(valid), (SHA, '42', '1'))
        for change in ({'GITHUB_EVENT_NAME': 'workflow_dispatch'}, {'GITHUB_REF': 'refs/heads/other'},
                       {'GITHUB_SHA': 'invalid'}, {'GITHUB_RUN_NUMBER': 'invalid'},
                       {'GITHUB_RUN_ATTEMPT': ''}, {'SENSA_E2E_COMPARISON_SHA': ''},
                       {'SENSA_E2E_COMPARISON_SHA': 'b' * 40}):
            with self.subTest(change=change), self.assertRaises(ValueError):
                preview.validate_run(valid | change)


class PreviewCommandTests(unittest.TestCase):
    def test_prune_only_does_not_create_upload_or_publish_a_release(self):
        releases = FakeReleases([published(number) for number in range(1, 12)])
        with patch.dict(preview.os.environ, GITHUB_REPOSITORY='Owner/Repo'), \
                patch('sys.argv', ['publish-preview.py', '--prune-only']), \
                patch.object(preview, 'GitHubReleases', return_value=releases):
            preview.main()
        self.assertEqual([event for event in releases.events if event[0] == 'delete'], [('delete', 1)])
        self.assertFalse(any(event[0] in ('upload', 'publish') for event in releases.events))

    def test_missing_current_commit_evidence_prevents_any_remote_action(self):
        environment = {'GITHUB_EVENT_NAME': 'push', 'GITHUB_REF': 'refs/heads/main',
                       'GITHUB_SHA': SHA, 'GITHUB_RUN_NUMBER': '42', 'GITHUB_RUN_ATTEMPT': '1'}
        with patch.dict(preview.os.environ, environment, clear=True), \
                patch('sys.argv', ['publish-preview.py']), \
                patch.object(preview, 'GitHubReleases') as adapter, \
                self.assertRaises(ValueError):
            preview.main()
        adapter.assert_not_called()


class PrereleaseRetentionTests(unittest.TestCase):
    def test_retains_ten_newest_by_publication_time_including_manual_prereleases(self):
        listing = [published(number) for number in range(1, 16)]
        listing[0]['tag_name'] = 'v0.4.0-beta.1'
        listing[0]['created_at'] = '2099-01-01T00:00:00Z'
        listing += [published(16) | {'prerelease': False}, published(17) | {'draft': True}]
        random.Random(42).shuffle(listing)
        releases = FakeReleases(listing)
        removed = preview.prune_prereleases(releases)
        self.assertEqual(removed, [5, 4, 3, 2, 1])
        self.assertEqual(set(releases.releases), set(range(6, 18)))
        self.assertEqual(sum(release['prerelease'] and not release['draft']
                             for release in releases.releases.values()), 10)
        for index, event in enumerate(releases.events):
            if event[0] == 'delete':
                self.assertEqual(releases.events[index - 1], ('get', event[1]))

    def test_ten_or_fewer_published_prereleases_requires_no_mutations(self):
        for count in (0, 1, 10):
            with self.subTest(count=count):
                releases = FakeReleases([published(number) for number in range(1, count + 1)])
                self.assertEqual(preview.prune_prereleases(releases), [])
                self.assertEqual(releases.events, [('list',)])

    def test_changed_identity_stable_transition_and_draft_transition_abort_deletion(self):
        for change in ({'prerelease': False}, {'draft': True}, {'tag_name': 'renamed'},
                       {'target_commitish': 'changed'}, {'published_at': '2026-01-01T00:00:00Z'}, {'id': 100}):
            with self.subTest(change=change):
                releases = FakeReleases([published(number) for number in range(1, 12)])
                releases.releases[1].update(change)
                with self.assertRaises(ValueError):
                    preview.prune_prereleases(releases)
                self.assertFalse(any(event[0] == 'delete' for event in releases.events))

    def test_duplicate_or_invalid_listing_fails_before_any_deletion(self):
        valid = [published(number) for number in range(1, 12)]
        for bad in (valid + [valid[0]], valid + [published(20) | {'tag_name': valid[0]['tag_name']}],
                    valid + [published(20) | {'published_at': 'invalid'}],
                    valid + [published(20) | {'published_at': '2026-01-01T00:00:00'}],
                    valid + [published(20) | {'id': True}]):
            with self.subTest(listing=bad):
                releases = FakeReleases()
                releases.listing = bad
                with self.assertRaises(ValueError):
                    preview.prune_prereleases(releases)
                self.assertEqual(releases.events, [('list',)])

    def test_retention_limit_cannot_delete_every_release(self):
        for keep in (0, -1, True):
            with self.subTest(keep=keep), self.assertRaises(ValueError):
                preview.prune_prereleases(FakeReleases(), keep=keep)


class GitHubAdapterTests(unittest.TestCase):
    def test_lists_all_pages_and_pins_repository(self):
        pages = [[published(number) for number in range(1, 101)], [published(101)]]
        with patch.object(preview.subprocess, 'check_output', return_value=json.dumps(pages).encode()) as query:
            releases = preview.GitHubReleases('Owner/Repo').list()
        self.assertEqual(len(releases), 101)
        self.assertEqual(query.call_args.args[0],
                         ['gh', 'api', '--paginate', '--slurp', 'repos/Owner/Repo/releases?per_page=100'])

    def test_delete_addresses_numeric_release_only_and_keeps_tags(self):
        with patch.object(preview.subprocess, 'run') as run:
            preview.GitHubReleases('Owner/Repo').delete(123)
        self.assertEqual(run.call_args.args[0],
                         ['gh', 'api', '--method', 'DELETE', 'repos/Owner/Repo/releases/123'])

    def test_rejects_cross_repository_draft_lookup_and_response_identity(self):
        adapter = preview.GitHubReleases('Owner/Repo')
        for url in ('https://api.github.com/repos/Other/Repo/releases/123',
                    'https://api.github.com/repos/Owner/Repo/releases/123/../4'):
            with self.subTest(url=url), patch.object(preview.subprocess, 'check_output', return_value=url.encode()), self.assertRaises(ValueError):
                adapter.draft('preview-test')
        for response in ({'id': 124, 'url': 'https://api.github.com/repos/Owner/Repo/releases/123'},
                         {'id': 123, 'url': 'https://api.github.com/repos/Other/Repo/releases/123'}):
            with self.subTest(response=response), patch.object(preview.subprocess, 'check_output', return_value=json.dumps(response).encode()), self.assertRaises(ValueError):
                adapter.get(123)

    def test_mutations_pin_repository_and_remote_draft_query_uses_numeric_identity(self):
        adapter = preview.GitHubReleases('Owner/Repo')
        response = {'id': 123, 'url': 'https://api.github.com/repos/Owner/Repo/releases/123'}
        with patch.object(preview.subprocess, 'check_output', side_effect=[
                response['url'].encode(), json.dumps(response).encode()]) as query, \
                patch.object(preview.subprocess, 'run') as run:
            self.assertEqual(adapter.draft('preview-test'), response)
            adapter.create('preview-test', SHA, 'Preview / 预览', Path('notes.md'))
            adapter.upload('preview-test', Path('asset.zip'))
            adapter.publish('preview-test')
        self.assertEqual(query.call_args.args[0][-1], 'repos/Owner/Repo/releases/123')
        for call in run.call_args_list:
            command = call.args[0]
            self.assertEqual(command[command.index('--repo') + 1], 'Owner/Repo')

    def test_invalid_repository_and_release_ids_are_rejected(self):
        for repository in ('../Repo', 'Owner/../Repo', 'Owner/Repo?other=1', 'Owner', '/Repo'):
            with self.subTest(repository=repository), self.assertRaises(ValueError):
                preview.GitHubReleases(repository)
        for release_id in (-1, 0, True, '123'):
            adapter = preview.GitHubReleases('Owner/Repo')
            with self.subTest(release_id=release_id), self.assertRaises(ValueError):
                adapter.get(release_id)


if __name__ == '__main__':
    unittest.main()
