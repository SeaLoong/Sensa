"""Checked publication contracts with fake GitHub and process adapters."""
from datetime import datetime, timedelta, timezone
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import random
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location('release_publication', ROOT / 'scripts/publish-release.py')
preview = importlib.util.module_from_spec(SPEC)
with patch.object(sys, 'path', [str(ROOT / 'scripts'), *sys.path]):
    SPEC.loader.exec_module(preview)
SHA = 'a' * 40
VERSION = '0.4.0'
TAG = 'preview-42-1-aaaaaaaa'
ENV = {'GITHUB_ACTIONS': 'true', 'GITHUB_EVENT_NAME': 'push', 'GITHUB_REF': 'refs/heads/main',
       'GITHUB_SHA': SHA, 'GITHUB_RUN_NUMBER': '42', 'GITHUB_RUN_ATTEMPT': '1',
       'GITHUB_RUN_ID': '123', 'GITHUB_REPOSITORY': 'Owner/Repo', 'SENSA_E2E_COMPARISON_SHA': SHA}


def published(number, **changes):
    timestamp = (datetime(2026, 1, 1, tzinfo=timezone.utc) + timedelta(days=number)).isoformat()
    return dict(id=number, tag_name=f'preview-{number}', target_commitish=SHA,
                published_at=timestamp, created_at='2020-01-01T00:00:00Z',
                draft=False, prerelease=True, **changes)


def asset(path):
    return {'name': path.name, 'size': path.stat().st_size, 'state': 'uploaded',
            'digest': 'sha256:' + hashlib.sha256(path.read_bytes()).hexdigest()}


class FakeReleases:
    repository = 'Owner/Repo'

    def __init__(self, releases=()):
        self.releases = {release['id']: dict(release) for release in releases}
        self.listing = [dict(release) for release in releases]
        self.events = []
        self.upload_errors = []
        self.remote = next((release for release in self.releases.values() if release.get('draft')), None)

    def upload(self, tag, path):
        self.events.append(('upload', tag, path.name))
        if self.upload_errors:
            raise self.upload_errors.pop(0)
        self.remote['assets'] = [item for item in self.remote['assets'] if item['name'] != path.name] + [asset(path)]

    def draft(self, tag):
        self.events.append(('draft', tag))
        return self.remote

    def publish(self, tag, channel='preview'):
        self.events.append(('publish', tag, channel))

    def create(self, tag, sha, title, notes, channel):
        self.events.append(('create', tag, sha, channel))
        self.remote = {'draft': True, 'prerelease': channel == 'preview', 'tag_name': tag,
                       'target_commitish': sha, 'assets': []}

    def generated_notes(self, tag, sha, previous_tag):
        self.events.append(('notes', previous_tag))
        return '* Added a feature in #1 by @author'

    def verify_tag_target(self, tag, sha):
        self.events.append(('tag', tag, sha))

    def list(self):
        self.events.append(('list',))
        return self.listing

    def get(self, release_id):
        self.events.append(('get', release_id))
        return self.releases[release_id]

    def delete(self, release_id):
        self.events.append(('delete', release_id))
        del self.releases[release_id]


class PublicationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / 'fixture.zip'
        self.path.write_bytes(b'fixture')
        self.releases = FakeReleases()
        self.releases.remote = {'draft': True, 'prerelease': True, 'tag_name': TAG,
                                'target_commitish': SHA, 'assets': []}

    def publish(self, channel='preview'):
        preview.upload_and_publish(TAG, SHA, [self.path], self.releases, channel=channel, pause=lambda _: None)

    def test_retry_then_publish_only_after_remote_asset_verification(self):
        self.releases.upload_errors = [subprocess.CalledProcessError(1, 'gh')]
        self.publish()
        self.assertEqual(sum(event[0] == 'upload' for event in self.releases.events), 2)
        self.assertEqual(self.releases.events[-3:], [('draft', TAG), ('tag', TAG, SHA), ('publish', TAG, 'preview')])
        preview.verify_draft(self.releases.remote, TAG, SHA, [self.path])

    def test_exhausted_upload_remains_private(self):
        for error in (subprocess.CalledProcessError(1, 'gh'), subprocess.TimeoutExpired('gh', 180)):
            with self.subTest(error=type(error).__name__):
                self.releases.events.clear()
                self.releases.upload_errors = [error] * 3
                with self.assertRaises(type(error)):
                    self.publish()
                self.assertEqual(sum(event[0] == 'upload' for event in self.releases.events), 3)
                self.assertFalse(any(event[0] == 'publish' for event in self.releases.events))

    def test_already_uploaded_identical_asset_is_not_overwritten(self):
        self.releases.remote['assets'] = [asset(self.path)]
        self.publish()
        self.assertFalse(any(event[0] == 'upload' for event in self.releases.events))
        self.assertEqual(self.releases.events[-1], ('publish', TAG, 'preview'))

    def test_stale_or_unexpected_draft_assets_are_not_overwritten(self):
        good = asset(self.path)
        for assets in ([dict(good, digest='sha256:other')], [dict(good, size=0)],
                       [dict(good, name='unknown.zip')], [good, good]):
            with self.subTest(assets=assets):
                self.releases.remote['assets'] = assets
                self.releases.events.clear()
                with self.assertRaises(ValueError):
                    self.publish()
                self.assertFalse(any(event[0] in ('upload', 'publish') for event in self.releases.events))

    def test_wrong_or_published_release_identity_prevents_any_upload(self):
        original = dict(self.releases.remote)
        for change in ({'draft': False}, {'prerelease': False}, {'target_commitish': 'b' * 40}, {'tag_name': 'v1.0.0'}):
            with self.subTest(change=change):
                self.releases.remote = original | change
                self.releases.events.clear()
                with self.assertRaises(ValueError):
                    self.publish()
                self.assertFalse(any(event[0] in ('upload', 'publish') for event in self.releases.events))

    def test_stable_channel_verifies_stable_draft_before_publishing(self):
        self.releases.remote['prerelease'] = False
        self.publish('stable')
        self.assertEqual(self.releases.events[-1], ('publish', TAG, 'stable'))

    def test_tag_moved_during_upload_prevents_publication_despite_unchanged_draft_metadata(self):
        def changed_target(tag, sha):
            self.assertEqual(self.releases.remote['target_commitish'], SHA)
            self.assertEqual(self.releases.remote['assets'], [asset(self.path)])
            raise ValueError('Tag points to a different commit')
        with patch.object(self.releases, 'verify_tag_target', side_effect=changed_target), \
                self.assertRaisesRegex(ValueError, 'different commit'):
            self.publish()
        self.assertFalse(any(event[0] == 'publish' for event in self.releases.events))

    def test_run_gate_uses_trigger_pinned_source_and_same_commit_comparison(self):
        self.assertEqual(preview.validate_run(ENV, 'preview', VERSION, TAG, SHA), ('42', '1'))
        stable = ENV | {'GITHUB_EVENT_NAME': 'workflow_dispatch', 'GITHUB_SHA': 'b' * 40}
        self.assertEqual(preview.validate_run(stable, 'stable', VERSION, 'v0.4.0', SHA), ('42', '1'))
        for change in ({'GITHUB_ACTIONS': 'false'}, {'GITHUB_EVENT_NAME': 'workflow_dispatch'},
                       {'GITHUB_REF': 'refs/heads/other'}, {'GITHUB_SHA': 'b' * 40},
                       {'GITHUB_RUN_NUMBER': '0'}, {'GITHUB_RUN_ATTEMPT': ''}):
            with self.subTest(change=change), self.assertRaises(ValueError):
                preview.validate_run(ENV | change, 'preview', VERSION, TAG, SHA)

    def test_missing_or_stale_comparison_blocks_both_channels_before_any_process_or_remote_action(self):
        for channel in ('preview', 'stable'):
            for receipt in ('', 'b' * 40):
                environment = ENV | {'GITHUB_EVENT_NAME': 'push' if channel == 'preview' else 'workflow_dispatch',
                                     'SENSA_E2E_COMPARISON_SHA': receipt}
                tag = TAG if channel == 'preview' else 'v' + VERSION
                with self.subTest(channel=channel, receipt=receipt), \
                        patch.dict(preview.os.environ, environment, clear=True), \
                        patch.object(sys, 'argv', ['publish-release.py', '--channel', channel, '--version', VERSION,
                            '--tag', tag, '--commit', SHA, '--assets', 'unused']), \
                        patch.object(preview, 'GitHubReleases') as adapter, \
                        patch.object(preview.subprocess, 'check_output') as process, \
                        self.assertRaisesRegex(ValueError, 'Current-commit full E2E comparison'):
                    preview.main()
                adapter.assert_not_called()
                process.assert_not_called()

    def test_rerun_failed_jobs_reuses_the_successful_plan_attempt(self):
        self.assertEqual(preview.validate_run(ENV | {'GITHUB_RUN_ATTEMPT': '2'},
                                            'preview', VERSION, TAG, SHA), ('42', '1'))
        for tag in ('preview-42-3-aaaaaaaa', 'preview-43-1-aaaaaaaa', 'preview-42-1-bbbbbbbb'):
            with self.subTest(tag=tag), self.assertRaises(ValueError):
                preview.validate_run(ENV | {'GITHUB_RUN_ATTEMPT': '2'}, 'preview', VERSION, tag, SHA)


def write_archives(root, channel):
    label = '-preview.42.1.aaaaaaaa' if channel == 'preview' else ''
    for runtime in (*preview.RUNTIMES, 'unity'):
        directory = root / runtime
        directory.mkdir(parents=True)
        name = (f'top.sealoong.sensa-{VERSION}{label}.zip' if runtime == 'unity' else
                f'Sensa-{VERSION}{label}-{runtime}' + ('.zip' if runtime.startswith('win-') else '.tar.gz'))
        path = directory / name
        path.write_bytes(runtime.encode())
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        checksums = f'{digest}  {name}\n'
        if runtime.startswith('win-'):
            for kind in ('Setup', 'SingleFile'):
                extra_name = f'Sensa-{VERSION}{label}-{runtime}-{kind}.exe'
                extra = directory / extra_name
                extra.write_bytes((runtime + kind).encode())
                checksums += f'{hashlib.sha256(extra.read_bytes()).hexdigest()}  {extra_name}\n'
        (directory / 'SHA256SUMS.txt').write_text(checksums)
        if runtime == 'unity' and channel == 'stable':
            manifest = {'name': 'top.sealoong.sensa', 'version': VERSION, 'sha256': digest,
                        'url': f'https://github.com/Owner/Repo/releases/download/v{VERSION}/{name}'}
            (directory / 'vpm-package.json').write_text(json.dumps(manifest))


class ReleaseCommandTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.inputs = self.root / 'incoming'

    def main(self, channel, releases, previous=''):
        tag = TAG if channel == 'preview' else 'v' + VERSION
        environment = ENV | {'GITHUB_EVENT_NAME': 'push' if channel == 'preview' else 'workflow_dispatch'}
        if channel == 'stable':
            environment['GITHUB_SHA'] = 'b' * 40  # main may advance after dispatch.
        with patch.dict(preview.os.environ, environment, clear=True), patch.object(preview, 'ROOT', self.root), \
                patch.object(sys, 'argv', ['publish-release.py', '--channel', channel, '--version', VERSION,
                    '--tag', tag, '--commit', SHA, '--previous-tag', previous, '--assets', str(self.inputs)]), \
                patch.object(preview, 'GitHubReleases', return_value=releases), \
                patch.object(preview.subprocess, 'check_output', side_effect=[SHA, SHA + '\0Direct fix <code> #1\n']) as process:
            preview.main()
        return process

    def test_first_stable_release_uploads_all_downloads_without_preview_base(self):
        write_archives(self.inputs, 'stable')
        releases = FakeReleases()
        with patch.object(preview, 'prune_prereleases') as prune:
            self.main('stable', releases)
        prune.assert_not_called()
        self.assertFalse(any(event[0] == 'notes' for event in releases.events))
        self.assertEqual(sum(event[0] == 'upload' for event in releases.events), 13)
        self.assertIn(('publish', 'v0.4.0', 'stable'), releases.events)
        notes = (self.root / 'artifacts/publication/release-notes.md').read_text()
        self.assertIn('Direct fix', notes)
        self.assertNotIn('<code>', notes)
        self.assertIn('passed unit checks and the full browser screenshot comparison', notes)
        self.assertIn('通过单元检查和完整浏览器截图比较', notes)
        checksums = (self.root / 'artifacts/publication/SHA256SUMS.txt').read_text()
        self.assertIn('vpm-package.json', checksums)
        self.assertEqual(len(checksums.splitlines()), 12)

    def test_preview_publishes_installer_links_and_source_without_generating_a_changelog(self):
        write_archives(self.inputs, 'preview')
        releases = FakeReleases([published(1) | {'tag_name': 'v0.3.0', 'prerelease': False}])
        process = self.main('preview', releases, previous='v0.3.0')
        self.assertFalse(any(event[0] == 'notes' for event in releases.events))
        self.assertEqual([call.args[0] for call in process.call_args_list], [['git', 'rev-parse', 'HEAD']])
        self.assertEqual(sum(event[0] == 'upload' for event in releases.events), 12)
        notes = (self.root / 'artifacts/publication/release-notes.md').read_text()
        self.assertEqual(notes,
            'Windows installers (recommended) / Windows 安装器（推荐）: '
            f'[x64](https://github.com/Owner/Repo/releases/download/{TAG}/Sensa-{VERSION}-preview.42.1.aaaaaaaa-win-x64-Setup.exe) · '
            f'[ARM64](https://github.com/Owner/Repo/releases/download/{TAG}/Sensa-{VERSION}-preview.42.1.aaaaaaaa-win-arm64-Setup.exe)\n\n'
            f'Source: [`{SHA}`](https://github.com/Owner/Repo/commit/{SHA})\n')
        for _, _, name in (event for event in releases.events if event[0] == 'upload' and event[2].endswith('-Setup.exe')):
            self.assertIn(f'https://github.com/Owner/Repo/releases/download/{TAG}/{name}', notes)
        self.assertNotIn('Changes', notes)
        self.assertNotIn('Direct fix', notes)
        self.assertNotIn('vpm-package.json', (self.root / 'artifacts/publication/SHA256SUMS.txt').read_text())

    def test_windows_installers_and_single_files_are_required_verified_and_prioritized(self):
        write_archives(self.inputs, 'preview')
        files = preview.release_assets(self.inputs, 'preview', VERSION, TAG, SHA, 'Owner/Repo')
        self.assertTrue(all(path.name.endswith('-Setup.exe') for path in files[:2]))
        self.assertTrue(all(path.name.endswith('-SingleFile.exe') for path in files[2:4]))
        for path in files[:4]:
            original = path.read_bytes()
            path.unlink()
            with self.subTest(name=path.name, case='missing'), self.assertRaisesRegex(ValueError, 'Windows download'):
                preview.release_assets(self.inputs, 'preview', VERSION, TAG, SHA, 'Owner/Repo')
            path.write_bytes(b'changed executable')
            with self.subTest(name=path.name, case='corrupt'), self.assertRaisesRegex(ValueError, 'Checksum mismatch'):
                preview.release_assets(self.inputs, 'preview', VERSION, TAG, SHA, 'Owner/Repo')
            path.write_bytes(original)

    def test_stable_notes_keep_the_published_base_github_changes_and_direct_commits(self):
        write_archives(self.inputs, 'stable')
        releases = FakeReleases([published(1) | {'tag_name': 'v0.3.0', 'prerelease': False}])
        self.main('stable', releases)
        self.assertIn(('notes', 'v0.3.0'), releases.events)
        notes = (self.root / 'artifacts/publication/release-notes.md').read_text()
        self.assertIn('Added a feature', notes)
        self.assertIn('Direct fix', notes)

    def test_notes_base_ignores_unpublished_tag_hints_and_drafts(self):
        write_archives(self.inputs, 'stable')
        releases = FakeReleases([published(1) | {'tag_name': 'unity-v0.2.0', 'prerelease': False},
                                 published(2) | {'tag_name': 'v0.3.0', 'prerelease': False, 'draft': True}])
        self.main('stable', releases, previous='v0.3.0')
        self.assertIn(('notes', 'unity-v0.2.0'), releases.events)
        self.assertNotIn(('notes', 'v0.3.0'), releases.events)

    def test_late_or_duplicate_preview_has_no_publication_mutations(self):
        for tag, target in [('preview-43-1-bbbbbbbb', 'b' * 40), ('preview-41-1-aaaaaaaa', SHA)]:
            releases = FakeReleases([published(50) | {'tag_name': tag, 'target_commitish': target}])
            self.main('preview', releases)
            self.assertEqual(releases.events, [('list',), ('get', 50), ('tag', tag, target), ('list',)])

    def published_current(self):
        write_archives(self.inputs, 'preview')
        files = preview.release_assets(self.inputs, 'preview', VERSION, TAG, SHA, 'Owner/Repo')
        staged = preview.stage_assets(files, self.root / 'expected')
        return published(50) | {'tag_name': TAG, 'assets': [asset(path) for path in staged]}

    def test_retry_after_publication_verifies_all_assets_and_completes_failed_retention(self):
        current = self.published_current()
        releases = FakeReleases([*[published(number) for number in range(1, 11)], current])
        self.main('preview', releases)
        self.assertEqual(len(current['assets']), 12)
        self.assertIn(('delete', 1), releases.events)
        self.assertNotIn(1, releases.releases)
        self.assertFalse(any(event[0] in ('create', 'upload', 'publish') for event in releases.events))

    def test_published_retry_rejects_deleted_changed_or_unexpected_assets_before_cleanup(self):
        current = self.published_current()
        for assets in (current['assets'][:-1],
                       [dict(current['assets'][0], digest='sha256:changed'), *current['assets'][1:]],
                       [*current['assets'], dict(current['assets'][0], name='unexpected.zip')]):
            with self.subTest(assets=assets):
                releases = FakeReleases([current | {'assets': assets}])
                with self.assertRaises(ValueError):
                    self.main('preview', releases)
                self.assertFalse(any(event[0] in ('create', 'upload', 'publish', 'delete') for event in releases.events))

    def test_skip_rechecks_fresh_published_identity_before_cleanup(self):
        releases = FakeReleases([published(50) | {'tag_name': TAG}])
        releases.releases[50]['draft'] = True
        with self.assertRaisesRegex(ValueError, 'preview changed'):
            self.main('preview', releases)
        self.assertEqual(releases.events, [('list',), ('get', 50)])

    def test_published_stable_tag_is_immutable(self):
        releases = FakeReleases([published(50) | {'tag_name': 'v0.4.0', 'prerelease': False}])
        with self.assertRaises(ValueError):
            self.main('stable', releases)
        self.assertFalse(any(event[0] in ('create', 'upload', 'publish') for event in releases.events))

    def test_archive_channel_and_vpm_identity_must_match_resolved_release(self):
        write_archives(self.inputs, 'preview')
        with self.assertRaisesRegex(ValueError, 'version/channel'):
            preview.release_assets(self.inputs, 'stable', VERSION, 'v0.4.0', SHA, 'Owner/Repo')
        manifest = self.inputs / 'unity/vpm-package.json'
        manifest.write_text('{}')
        with self.assertRaisesRegex(ValueError, 'Previews'):
            preview.release_assets(self.inputs, 'preview', VERSION, TAG, SHA, 'Owner/Repo')
        manifest.unlink()
        for path in self.inputs.rglob('*preview.42.1.aaaaaaaa*'):
            path.rename(path.with_name(path.name.replace('-preview.42.1.aaaaaaaa', '')))
        for directory in self.inputs.iterdir():
            paths = sorted(item for item in directory.iterdir() if item.name != 'SHA256SUMS.txt')
            (directory / 'SHA256SUMS.txt').write_text(''.join(f'{hashlib.sha256(path.read_bytes()).hexdigest()}  {path.name}\n' for path in paths))
        with self.assertRaisesRegex(ValueError, 'VPM manifest'):
            preview.release_assets(self.inputs, 'stable', VERSION, 'v0.4.0', SHA, 'Owner/Repo')
        manifest.write_text('{}')
        with self.assertRaisesRegex(ValueError, 'VPM metadata'):
            preview.release_assets(self.inputs, 'stable', VERSION, 'v0.4.0', SHA, 'Owner/Repo')

    @unittest.skipIf(os.name == 'nt', 'Creating test symlinks requires a Unix host')
    def test_publisher_rejects_archive_checksum_and_manifest_symlinks_even_with_matching_bytes(self):
        write_archives(self.inputs, 'stable')
        for name in (f'win-x64/Sensa-{VERSION}-win-x64.zip', f'win-x64/Sensa-{VERSION}-win-x64-Setup.exe',
                     f'win-arm64/Sensa-{VERSION}-win-arm64-SingleFile.exe', 'win-x64/SHA256SUMS.txt', 'unity/vpm-package.json'):
            path = self.inputs / name
            original = path.read_bytes()
            outside = self.root / 'outside-artifact'
            outside.write_bytes(original)
            path.unlink()
            path.symlink_to(outside)
            with self.subTest(name=name), self.assertRaisesRegex(ValueError, 'symlinks'):
                preview.release_assets(self.inputs, 'stable', VERSION, 'v0.4.0', SHA, 'Owner/Repo')
            path.unlink()
            path.write_bytes(original)

    def test_direct_commit_history_is_bounded_with_full_compare_link(self):
        history = ''.join(f'{i:040x}\0Fix {i} [link](bad)\n' for i in range(101))
        with patch.object(preview.subprocess, 'check_output', return_value=history):
            notes = preview.commit_notes('Owner/Repo', SHA, 'v0.3.0')
        self.assertEqual(notes.count('](https://github.com/Owner/Repo/commit/'), 100)
        self.assertIn('latest 100', notes)
        self.assertIn('/compare/v0.3.0...', notes)
        self.assertIn(r'\[link\]', notes)
        with self.assertRaises(ValueError):
            preview.commit_notes('Owner/Repo', SHA, 'preview-41-1-aaaaaaaa')


class CandidateOrderContracts(unittest.TestCase):
    def test_newer_run_order_wins_even_when_an_older_candidate_finishes_later(self):
        newer = published(1) | {'tag_name': 'preview-43-1-bbbbbbbb', 'target_commitish': 'b' * 40}
        older = published(2) | {'tag_name': 'preview-41-1-cccccccc', 'target_commitish': 'c' * 40}
        self.assertEqual(preview.superseding_preview([older, newer], SHA, '42', '2'), newer)

    def test_older_manual_stable_and_draft_releases_do_not_suppress_a_new_candidate(self):
        older = published(1) | {'tag_name': 'preview-41-1-bbbbbbbb', 'target_commitish': 'b' * 40}
        manual = published(2) | {'tag_name': 'v0.4.0-beta.99'}
        stable = published(3) | {'tag_name': 'preview-99-1-aaaaaaaa', 'prerelease': False}
        draft = published(4) | {'tag_name': 'preview-99-1-aaaaaaaa', 'draft': True}
        self.assertIsNone(preview.superseding_preview([older, manual, stable, draft], SHA, '42', '2'))

    def test_automatic_preview_identity_must_match_its_run_tag_and_commit(self):
        for target, tag in [('main', 'preview-43-1-aaaaaaaa'),
                            ('b' * 40, 'preview-43-1-aaaaaaaa'),
                            ('b' * 40, 'preview-42-2-bbbbbbbb')]:
            with self.subTest(target=target, tag=tag), self.assertRaises(ValueError):
                preview.superseding_preview([published(1) | {'tag_name': tag, 'target_commitish': target}], SHA, '42', '2')


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
            adapter.create('preview-test', SHA, 'Preview / 预览', Path('notes.md'), 'preview')
            adapter.upload('preview-test', Path('asset.zip'))
            adapter.publish('preview-test')
        self.assertEqual(query.call_args.args[0][-1], 'repos/Owner/Repo/releases/123')
        for call in run.call_args_list:
            command = call.args[0]
            self.assertEqual(command[command.index('--repo') + 1], 'Owner/Repo')

    def test_stable_publication_sets_latest_and_preview_never_does(self):
        adapter = preview.GitHubReleases('Owner/Repo')
        for channel, latest in [('stable', 'true'), ('preview', 'false')]:
            with patch.object(preview.subprocess, 'run') as run:
                adapter.publish('v0.4.0', channel)
            self.assertIn('--latest=' + latest, run.call_args.args[0])
            self.assertIn('--prerelease=' + str(channel == 'preview').lower(), run.call_args.args[0])

    def test_generated_notes_always_pass_an_explicit_stable_base(self):
        adapter = preview.GitHubReleases('Owner/Repo')
        for base in ('v0.3.0', 'unity-v0.3.0'):
            with patch.object(preview.subprocess, 'check_output', return_value=b'{"body":"Merged PR #1"}') as query:
                self.assertEqual(adapter.generated_notes(TAG, SHA, base), 'Merged PR #1')
            self.assertIn('previous_tag_name=' + base, query.call_args.args[0])
        for base in ('', TAG, 'v0.3.0-beta.1'):
            with self.subTest(base=base), self.assertRaises(ValueError):
                adapter.generated_notes(TAG, SHA, base)

    def test_existing_lightweight_and_annotated_tags_must_point_to_pinned_source(self):
        adapter = preview.GitHubReleases('Owner/Repo')
        commit_ref = {'ref': 'refs/tags/v0.4.0', 'object': {'type': 'commit', 'sha': SHA}}
        annotation = {'ref': 'refs/tags/v0.4.0', 'object': {'type': 'tag', 'sha': 'b' * 40}}
        for replies in ([[]], [[commit_ref]], [[annotation], {'object': {'type': 'commit', 'sha': SHA}}]):
            with self.subTest(replies=replies), patch.object(preview.subprocess, 'check_output',
                    side_effect=[json.dumps(item).encode() for item in replies]):
                adapter.verify_tag_target('v0.4.0', SHA)
        with patch.object(preview.subprocess, 'check_output', return_value=json.dumps([commit_ref]).encode()), \
                self.assertRaisesRegex(ValueError, 'different commit'):
            adapter.verify_tag_target('v0.4.0', 'c' * 40)

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
