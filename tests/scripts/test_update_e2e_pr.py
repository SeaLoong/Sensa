"""Constrained E2E proposals in temporary Git repositories; no browser/network."""
import hashlib
import copy
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location('e2e_proposal', ROOT / 'scripts/update-e2e-pr.py')
proposal = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(proposal)
ENV = {'GITHUB_RUN_ID': '1234', 'GITHUB_RUN_ATTEMPT': '2', 'GITHUB_REPOSITORY': 'Owner/Repo'}
PNG = b'\x89PNG\r\n\x1a\nfixture\x00'
IMAGE = 'tests/e2e/__screenshots__/desktop/view.png'
CASE = 'tests/e2e/sample.spec.js'


def candidate(commit):
    return {'schema': 1, 'commit': commit, 'repository': 'Owner/Repo', 'runId': '1234', 'attempt': '2',
            'suite': 'all', 'baselineMode': 'candidate', 'status': 'passed', 'commandOutcome': 'success',
            'selectionComplete': True, 'projects': ['desktop', 'mobile'], 'globalErrors': [],
            'counts': dict(total=2, passed=2, expectedFailure=0, failed=0, flaky=0, skipped=0, notRun=0, interrupted=0),
            'tests': [{'id': 'site-' + name, 'file': 'tests/e2e/site.spec.js', 'project': name,
                       'outcome': 'passed', 'attempts': [{'status': 'passed', 'attachments': []}]}
                      for name in ('desktop', 'mobile')]}


class ProposalContracts(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.area = Path(self.temporary.name)
        self.root = self.area / 'repo'
        self.root.mkdir()
        subprocess.run(['git', 'init', '-q', str(self.root)], check=True)
        proposal.git(self.root, 'config', 'user.email', 'test@example.invalid')
        proposal.git(self.root, 'config', 'user.name', 'Test')
        (self.root / IMAGE).parent.mkdir(parents=True)
        (self.root / IMAGE).write_bytes(PNG)
        (self.root / CASE).write_text("test('sample', () => expect(1).toBe(1));\n", encoding='utf-8')
        (self.root / '.gitignore').write_text('artifacts/\n', encoding='utf-8')
        (self.root / 'production.js').write_text('current production\n', encoding='utf-8')
        for name in proposal.SITE_REVIEW_PATHS:
            file = self.root / name
            file.parent.mkdir(parents=True, exist_ok=True)
            file.write_bytes(PNG + name.encode())
        proposal.git(self.root, 'add', '.')
        proposal.git(self.root, 'commit', '-qm', 'source')
        self.commit = proposal.git(self.root, 'rev-parse', 'HEAD').decode().strip()
        self.output = self.root / 'artifacts/e2e-update'
        self.summary = self.root / 'artifacts/summary.json'
        self.summary.parent.mkdir(parents=True)
        self.environment = dict(ENV, GITHUB_OUTPUT=str(self.area / 'outputs'),
                                GITHUB_STEP_SUMMARY=str(self.area / 'job.md'))
        self.create_site_evidence()

    def create_site_evidence(self):
        report = candidate(self.commit)
        for case in report['tests']:
            project = case['project']
            output = self.root / 'artifacts/e2e/results' / project
            output.mkdir(parents=True, exist_ok=True)
            attachments = case['attempts'][0]['attachments']
            images = []
            for attachment, filename in proposal.SITE_REVIEW_IMAGES.items():
                target = f'tests/e2e/__review__/site/{project}/{filename}'
                data = PNG + target.encode()
                image = output / filename
                image.write_bytes(data)
                attachments.append({'name': attachment, 'contentType': 'image/png',
                                    'path': image.relative_to(self.root).as_posix()})
                images.append({'attachment': attachment, 'sha256': hashlib.sha256(data).hexdigest()})
            manifest = output / 'site-manifest.json'
            manifest.write_text(json.dumps({'commit': self.commit, 'routes': []}), encoding='utf-8')
            source = output / 'site-review-source.json'
            source.write_text(json.dumps({'schema': 1, 'commit': self.commit, 'repository': ENV['GITHUB_REPOSITORY'],
                'runId': ENV['GITHUB_RUN_ID'], 'attempt': ENV['GITHUB_RUN_ATTEMPT'],
                'project': project, 'testId': case['id'],
                'siteManifestSha256': hashlib.sha256(manifest.read_bytes()).hexdigest(), 'images': images}), encoding='utf-8')
            for name, file in (('site-review-manifest', manifest), ('site-review-source', source)):
                attachments.append({'name': name, 'contentType': 'application/json',
                                    'path': file.relative_to(self.root).as_posix()})
        self.summary.write_text(json.dumps(report), encoding='utf-8')
        return report

    def export(self, mode='screenshots'):
        return proposal.export_proposal(self.root, self.commit, mode, self.summary, self.output, self.environment)

    def test_successful_candidate_export_keeps_binary_bytes_and_unreviewed_status(self):
        (self.root / IMAGE).write_bytes(PNG + b'changed')
        manifest = self.export()
        patch_bytes = (self.output / 'proposal.patch').read_bytes()
        self.assertIn(b'GIT binary patch', patch_bytes)
        self.assertEqual(manifest['commit'], self.commit)
        self.assertEqual(manifest['patchSha256'], hashlib.sha256(patch_bytes).hexdigest())
        self.assertEqual(manifest['files'], [{'path': IMAGE, 'sha256': hashlib.sha256(PNG + b'changed').hexdigest()}])
        self.assertEqual({item['path'] for project in manifest['siteReview']['projects'] for item in project['images']},
                         proposal.SITE_REVIEW_PATHS)
        self.assertEqual((self.area / 'outputs').read_text(), 'changed=true\n')
        self.assertIn('unreviewed', (self.area / 'job.md').read_text())
        proposal.git(self.root, 'reset', '--hard', 'HEAD')
        paths = proposal.apply_patch(self.root, patch_bytes, 'screenshots')
        self.assertEqual(paths, [IMAGE])
        self.assertEqual((self.root / IMAGE).read_bytes(), PNG + b'changed')

    def test_no_changes_produces_no_branch_request(self):
        manifest = self.export()
        self.assertEqual(manifest['files'], [])
        self.assertEqual((self.output / 'proposal.patch').read_bytes(), b'')
        self.assertEqual((self.area / 'outputs').read_text(), 'changed=false\n')
        self.assertIn('No changes', (self.area / 'job.md').read_text())

    def test_first_review_export_contains_exactly_eight_current_browser_images(self):
        proposal.git(self.root, 'rm', '-r', 'tests/e2e/__review__')
        proposal.git(self.root, 'commit', '-qm', 'source without review images')
        self.commit = proposal.git(self.root, 'rev-parse', 'HEAD').decode().strip()
        self.create_site_evidence()
        self.assertFalse((self.root / 'tests/e2e/__review__').exists())
        manifest = self.export()
        self.assertEqual({item['path'] for item in manifest['files']}, proposal.SITE_REVIEW_PATHS)
        for record in manifest['siteReview']['projects']:
            for image in record['images']:
                self.assertEqual((self.root / image['path']).read_bytes(), (self.root / image['sourcePath']).read_bytes())
        self.assertEqual(manifest['siteReview']['commit'], self.commit)
        self.assertEqual(manifest['siteReview']['attempt'], ENV['GITHUB_RUN_ATTEMPT'])

    def test_first_eight_review_images_publish_from_a_clean_source_checkout(self):
        proposal.git(self.root, 'rm', '-r', 'tests/e2e/__review__')
        proposal.git(self.root, 'commit', '-qm', 'source before first site capture')
        self.commit = proposal.git(self.root, 'rev-parse', 'HEAD').decode().strip()
        self.create_site_evidence()
        self.export()
        proposal.git(self.root, 'reset', '--hard', 'HEAD')
        self.assertFalse((self.root / 'tests/e2e/__review__').exists())
        origin = self.area / 'origin.git'
        subprocess.run(['git', 'init', '--bare', '-q', str(origin)], check=True)
        proposal.git(self.root, 'remote', 'add', 'origin', str(origin))
        real_query = subprocess.check_output
        def query(command, **kwargs):
            if command[:2] == ['gh', 'api']:
                return '[]'
            if command[:3] == ['gh', 'pr', 'create']:
                return 'https://github.com/Owner/Repo/pull/9\n'
            return real_query(command, **kwargs)
        with patch.object(proposal.subprocess, 'check_output', side_effect=query):
            proposal.publish_proposal(self.root, self.commit, self.output, self.environment)
        self.assertEqual(set(proposal.git(self.root, 'diff', '--name-only', self.commit, 'HEAD').decode().splitlines()),
                         proposal.SITE_REVIEW_PATHS)
        for name in proposal.SITE_REVIEW_PATHS:
            self.assertEqual((self.root / name).read_bytes(), PNG + name.encode())

    def test_site_review_capture_requires_all_images_from_each_current_site_case(self):
        original = self.create_site_evidence()
        changes = []
        report = copy.deepcopy(original); report['tests'][0]['attempts'][0]['attachments'].pop(); changes.append(report)
        report = copy.deepcopy(original); report['tests'][0]['attempts'][0]['attachments'].append(
            report['tests'][0]['attempts'][0]['attachments'][0]); changes.append(report)
        report = copy.deepcopy(original); report['tests'][0]['file'] = CASE; changes.append(report)
        report = copy.deepcopy(original); report['tests'][0]['project'] = 'mobile'; changes.append(report)
        report = copy.deepcopy(original); report['tests'][0]['id'] = 'other-case'; changes.append(report)
        report = copy.deepcopy(original); report['tests'][1]['attempts'][0]['attachments'][0]['path'] = \
            report['tests'][0]['attempts'][0]['attachments'][0]['path']; changes.append(report)
        report = copy.deepcopy(original); report['tests'][0]['attempts'].append(
            {'status': 'passed', 'attachments': []}); changes.append(report)
        for index, report in enumerate(changes):
            with self.subTest(index=index):
                self.summary.write_text(json.dumps(report), encoding='utf-8')
                with self.assertRaises(ValueError):
                    self.export()
                self.assertEqual(proposal.git(self.root, 'diff', '--name-only', 'HEAD'), b'')
                self.assertFalse(self.output.exists())

    def test_site_review_identity_and_manifest_must_match_pinned_source_and_run(self):
        source = self.root / 'artifacts/e2e/results/desktop/site-review-source.json'
        original = json.loads(source.read_text())
        for field, value in (('commit', 'b' * 40), ('runId', '999'), ('attempt', '1'), ('repository', 'Other/Repo'),
                             ('project', 'mobile'), ('testId', 'old-case'), ('siteManifestSha256', 'c' * 64)):
            with self.subTest(field=field):
                source.write_text(json.dumps(original | {field: value}), encoding='utf-8')
                with self.assertRaises(ValueError):
                    self.export()
                self.assertEqual(proposal.git(self.root, 'diff', '--name-only', 'HEAD'), b'')
        source.write_text(json.dumps(original), encoding='utf-8')
        site_manifest = self.root / 'artifacts/e2e/results/desktop/site-manifest.json'
        site_manifest.write_text(json.dumps({'commit': 'b' * 40}), encoding='utf-8')
        source.write_text(json.dumps(original | {'siteManifestSha256': hashlib.sha256(site_manifest.read_bytes()).hexdigest()}), encoding='utf-8')
        with self.assertRaisesRegex(ValueError, 'source or run identity'):
            self.export()

    def test_site_review_sources_reject_escape_links_wrong_type_or_changed_bytes(self):
        original = self.create_site_evidence()
        first = original['tests'][0]['attempts'][0]['attachments'][0]
        for path in ('production.js', '/tmp/image.png', 'artifacts/e2e/results/../../image.png',
                     'artifacts/e2e/results-other/image.png', 'artifacts/e2e/results/./image.png',
                     'artifacts/e2e/results//image.png', 'artifacts\\e2e\\results\\image.png'):
            report = copy.deepcopy(original)
            report['tests'][0]['attempts'][0]['attachments'][0]['path'] = path
            self.summary.write_text(json.dumps(report), encoding='utf-8')
            with self.subTest(path=path), self.assertRaises(ValueError):
                self.export()
        self.summary.write_text(json.dumps(original), encoding='utf-8')
        image = self.root / first['path']
        contents = image.read_bytes()
        image.unlink(); image.symlink_to(self.root / IMAGE)
        with self.assertRaises(ValueError):
            self.export()
        image.unlink(); image.write_bytes(b'not a PNG')
        with self.assertRaises(ValueError):
            self.export()
        image.write_bytes(contents + b'changed')
        with self.assertRaisesRegex(ValueError, 'digest changed'):
            self.export()
        image.write_bytes(contents)
        first['contentType'] = 'text/plain'
        self.summary.write_text(json.dumps(original), encoding='utf-8')
        with self.assertRaises(ValueError):
            self.export()
        self.assertFalse(self.output.exists())

    def test_site_review_source_parent_links_and_review_destination_links_are_rejected(self):
        folder = self.root / 'artifacts/e2e/results/desktop'
        actual = self.area / 'captures'
        folder.rename(actual); folder.symlink_to(actual, target_is_directory=True)
        with self.assertRaises(ValueError):
            self.export()
        folder.unlink(); actual.rename(folder)
        target = self.root / 'tests/e2e/__review__/site/desktop'
        actual = self.area / 'review'
        target.rename(actual); target.symlink_to(actual, target_is_directory=True)
        with self.assertRaises(ValueError):
            self.export()

    def test_site_review_file_size_and_proof_image_digest_set_are_bounded(self):
        report = self.create_site_evidence()
        image = self.root / report['tests'][0]['attempts'][0]['attachments'][0]['path']
        with image.open('r+b') as stream:
            stream.truncate(32 * 1024 * 1024 + 1)
        with self.assertRaises(ValueError):
            self.export()
        self.create_site_evidence()
        source = self.root / 'artifacts/e2e/results/desktop/site-review-source.json'
        original = json.loads(source.read_text())
        for images in (original['images'][:-1], original['images'] + [original['images'][0]],
                       [original['images'][0]] * 4):
            source.write_text(json.dumps(original | {'images': images}), encoding='utf-8')
            with self.assertRaises(ValueError):
                self.export()

    def test_failed_or_comparison_run_cannot_export_site_review_images(self):
        original = self.create_site_evidence()
        for change in ({'status': 'failed'}, {'commandOutcome': 'failure'}, {'baselineMode': 'comparison'},
                       {'suite': 'site'}, {'selectionComplete': False}):
            self.summary.write_text(json.dumps(original | change), encoding='utf-8')
            with self.subTest(change=change), self.assertRaises(ValueError):
                self.export()
            self.assertEqual(proposal.git(self.root, 'diff', '--name-only', 'HEAD'), b'')
        self.assertFalse(self.output.exists())

    def test_container_owned_checkout_can_export_without_changing_global_git_config(self):
        (self.root / IMAGE).write_bytes(PNG + b'changed')
        (self.root / CASE).write_text("test('updated sample', () => expect(1).toBe(1));\n", encoding='utf-8')
        with patch.dict(os.environ, {'GIT_TEST_ASSUME_DIFFERENT_OWNER': '1'}):
            proposal.assert_source(self.root, self.commit)
            manifest = self.export('agent')
        self.assertEqual({item['path'] for item in manifest['files']}, {IMAGE, CASE})

    def test_candidate_proof_rejects_stale_filtered_skipped_and_unexecuted_reports(self):
        for key, value in (('commit', 'b' * 40), ('runId', '999'), ('attempt', '1'), ('suite', 'site'),
                           ('baselineMode', 'comparison'), ('status', 'failed'), ('selectionComplete', False),
                           ('commandOutcome', 'failure'), ('globalErrors', ['worker failure']), ('projects', ['desktop'])):
            report = candidate(self.commit)
            report[key] = value
            with self.subTest(key=key), self.assertRaises(ValueError):
                proposal.validate_candidate(report, self.commit, ENV)
        for key in ('failed', 'skipped', 'notRun', 'expectedFailure', 'flaky', 'interrupted'):
            report = candidate(self.commit)
            report['counts'][key] = 1
            report['counts']['passed'] = 1
            with self.subTest(outcome=key), self.assertRaises(ValueError):
                proposal.validate_candidate(report, self.commit, ENV)
        report = candidate(self.commit)
        report['tests'].pop()
        with self.assertRaises(ValueError):
            proposal.validate_candidate(report, self.commit, ENV)

    def test_paths_cannot_escape_test_tree_or_screenshot_scope(self):
        for name in ('production.js', '.github/workflows/ci.yml', '/tests/e2e/a.js',
                     'tests/e2e/../../production.js', 'tests/e2e/.secret', 'tests\\e2e\\a.js'):
            with self.subTest(name=name), self.assertRaises(ValueError):
                proposal.check_path(name, 'agent')
        with self.assertRaises(ValueError):
            proposal.check_path(CASE, 'screenshots')
        for mode in ('screenshots', 'agent'):
            for name in proposal.SITE_REVIEW_PATHS:
                self.assertEqual(proposal.check_path(name, mode), name)
            for name in ('tests/e2e/__review__/site/tablet/home-en-US.png',
                         'tests/e2e/__review__/site/desktop/extra.png',
                         'tests/e2e/__review__/site/desktop/source.json',
                         'tests/e2e/__review__/site/desktop/nested/home-en-US.png'):
                with self.subTest(mode=mode, name=name), self.assertRaises(ValueError):
                    proposal.check_path(name, mode)
        (self.root / 'production.js').write_text('changed', encoding='utf-8')
        with self.assertRaises(ValueError):
            self.export()
        self.assertFalse(self.output.exists())

    def test_deletions_symlinks_executable_modes_and_invalid_images_are_rejected(self):
        (self.root / IMAGE).unlink()
        with self.assertRaises(ValueError):
            self.export()
        (self.root / IMAGE).symlink_to(self.root / 'production.js')
        with self.assertRaises(ValueError):
            self.export()
        (self.root / IMAGE).unlink()
        (self.root / IMAGE).write_bytes(b'not png')
        with self.assertRaises(ValueError):
            self.export()
        (self.root / IMAGE).write_bytes(PNG + b'changed')
        (self.root / IMAGE).chmod(0o755)
        with self.assertRaises(ValueError):
            self.export()

    def test_agent_patch_is_applied_only_to_test_sources_without_removed_assertions(self):
        updated = "test('updated', () => expect(1).toBe(1));\n"
        (self.root / CASE).write_text(updated, encoding='utf-8')
        patch_bytes = proposal.git(self.root, 'diff', '--binary', 'HEAD')
        proposal.git(self.root, 'reset', '--hard', 'HEAD')
        paths = proposal.apply_agent(self.root, self.commit, json.dumps({'patch': patch_bytes.decode(), 'summary': 'updated title'}))
        self.assertEqual(paths, [CASE])
        self.assertEqual((self.root / CASE).read_text(), updated)
        self.export('agent')

    def test_agent_cannot_supply_images_or_new_skips_or_remove_assertions(self):
        (self.root / IMAGE).write_bytes(PNG + b'changed')
        image_patch = proposal.git(self.root, 'diff', '--binary', 'HEAD')
        proposal.git(self.root, 'reset', '--hard', 'HEAD')
        with self.assertRaises(ValueError):
            proposal.apply_agent(self.root, self.commit, json.dumps({'patch': image_patch.decode()}))
        for text in ("test.skip('sample', () => expect(1).toBe(1));\n",
                     "test.describe.skip('sample', () => expect(1).toBe(1));\n", "test('sample', () => {});\n"):
            (self.root / CASE).write_text(text, encoding='utf-8')
            with self.subTest(text=text), self.assertRaises(ValueError):
                proposal.validate_files(self.root, [CASE], 'agent')

    def test_publisher_can_retry_a_validated_candidate_then_open_one_draft_without_duplicate_ci(self):
        (self.root / IMAGE).write_bytes(PNG + b'changed')
        self.export()
        proposal.git(self.root, 'reset', '--hard', 'HEAD')
        origin = self.area / 'origin.git'
        subprocess.run(['git', 'init', '--bare', '-q', str(origin)], check=True)
        proposal.git(self.root, 'remote', 'add', 'origin', str(origin))
        real_query, real_run = subprocess.check_output, subprocess.run
        commands, bodies = [], []
        def query(command, **kwargs):
            if command[0] == 'gh':
                commands.append(command)
                if command[1] == 'api':
                    return '[]'
                self.assertIn('--draft', command)
                self.assertIn('--body-file', command)
                bodies.append(Path(command[command.index('--body-file') + 1]).read_text(encoding='utf-8'))
                return 'https://github.com/Owner/Repo/pull/9\n'
            return real_query(command, **kwargs)
        def run(command, **kwargs):
            if command[0] == 'gh':
                commands.append(command)
                return subprocess.CompletedProcess(command, 0)
            return real_run(command, **kwargs)
        with patch.object(proposal.subprocess, 'check_output', side_effect=query), \
                patch.object(proposal.subprocess, 'run', side_effect=run):
            url = proposal.publish_proposal(self.root, self.commit, self.output,
                                            self.environment | {'GITHUB_RUN_ATTEMPT': '3'})
        self.assertEqual(url, 'https://github.com/Owner/Repo/pull/9')
        self.assertEqual(commands[0][1], 'api')
        self.assertEqual(commands[1][1:3], ['pr', 'create'])
        self.assertEqual(len(commands), 2, 'PR lookup and creation must not dispatch duplicate CI')
        refs = subprocess.check_output(['git', '--git-dir', str(origin), 'for-each-ref', '--format=%(refname)'], text=True)
        self.assertEqual(refs.strip(), 'refs/heads/codex/e2e-update-1234-2')
        self.assertEqual(proposal.git(self.root, 'diff', '--name-only', self.commit, 'HEAD').decode().strip(), IMAGE)
        commit = proposal.git(self.root, 'rev-parse', 'HEAD').decode().strip()
        self.assertEqual(len(bodies), 1)
        self.assertIn('browser captures for visual review', bodies[0])
        self.assertIn('Attempt: 2', bodies[0])
        self.assertIn('https://github.com/Owner/Repo/actions/runs/1234/attempts/2', bodies[0])
        for name in proposal.SITE_REVIEW_PATHS:
            self.assertIn(f'https://github.com/Owner/Repo/blob/{commit}/{name}', bodies[0])

    def test_blocked_pr_creation_preserves_the_pushed_branch_and_reports_configuration(self):
        (self.root / IMAGE).write_bytes(PNG + b'changed')
        self.export()
        proposal.git(self.root, 'reset', '--hard', 'HEAD')
        origin = self.area / 'origin.git'
        subprocess.run(['git', 'init', '--bare', '-q', str(origin)], check=True)
        proposal.git(self.root, 'remote', 'add', 'origin', str(origin))
        real_query = subprocess.check_output
        def query(command, **kwargs):
            if command[0] == 'gh':
                if command[1] == 'api':
                    return '[]'
                raise subprocess.CalledProcessError(1, command)
            return real_query(command, **kwargs)
        with patch.object(proposal.subprocess, 'check_output', side_effect=query), self.assertRaises(subprocess.CalledProcessError):
            proposal.publish_proposal(self.root, self.commit, self.output, self.environment)
        refs = subprocess.check_output(['git', '--git-dir', str(origin), 'for-each-ref', '--format=%(refname)'], text=True)
        self.assertEqual(refs.strip(), 'refs/heads/codex/e2e-update-1234-2')
        self.assertIn('branch', (self.area / 'job.md').read_text())
        self.assertIn('SENSA_PAT', (self.area / 'job.md').read_text())

    def test_retried_publisher_reuses_verified_remote_branch_and_existing_draft_pr(self):
        (self.root / IMAGE).write_bytes(PNG + b'changed')
        self.export()
        proposal.git(self.root, 'reset', '--hard', 'HEAD')
        origin = self.area / 'origin.git'
        subprocess.run(['git', 'init', '--bare', '-q', str(origin)], check=True)
        proposal.git(self.root, 'remote', 'add', 'origin', str(origin))
        real_query = subprocess.check_output
        def failed_create(command, **kwargs):
            if command[:2] == ['gh', 'api']:
                return '[]'
            if command[:3] == ['gh', 'pr', 'create']:
                raise subprocess.CalledProcessError(1, command)  # response lost after branch push
            return real_query(command, **kwargs)
        with patch.object(proposal.subprocess, 'check_output', side_effect=failed_create), self.assertRaises(subprocess.CalledProcessError):
            proposal.publish_proposal(self.root, self.commit, self.output, self.environment)
        remote_commit = proposal.git(self.root, 'rev-parse', 'HEAD').decode().strip()
        proposal.git(self.root, 'checkout', '--detach', self.commit)
        commands = []
        pull = self.pull(remote_commit)
        def recovered_query(command, **kwargs):
            if command[0] == 'gh':
                commands.append(command)
                self.assertEqual(command[1], 'api', 'Recovery must not create another PR')
                return json.dumps([pull])
            return real_query(command, **kwargs)
        with patch.object(proposal.subprocess, 'check_output', side_effect=recovered_query):
            url = proposal.publish_proposal(self.root, self.commit, self.output,
                                            self.environment | {'GITHUB_RUN_ATTEMPT': '3'})
        self.assertEqual(url, pull['html_url'])
        self.assertEqual(len(commands), 1)
        self.assertIn('Existing E2E proposal', (self.area / 'job.md').read_text())
        self.assertEqual(proposal.remote_branch(self.root, 'codex/e2e-update-1234-2'), remote_commit)
        self.assertIsNone(proposal.remote_branch(self.root, 'codex/e2e-update-1234-3'))

    def pull(self, commit):
        return {'number': 9, 'html_url': 'https://github.com/Owner/Repo/pull/9', 'state': 'open', 'draft': True,
                'head': {'ref': 'codex/e2e-update-1234-2', 'sha': commit, 'repo': {'full_name': 'Owner/Repo'}},
                'base': {'ref': 'main', 'repo': {'full_name': 'Owner/Repo'}}}

    def test_pr_recovery_rejects_foreign_head_changed_sha_and_closed_review(self):
        pull = self.pull(self.commit)
        for change in ({'head': dict(pull['head'], sha='b' * 40)},
                       {'head': dict(pull['head'], repo={'full_name': 'Other/Repo'})},
                       {'base': dict(pull['base'], ref='other')},
                       {'draft': False}, {'state': 'closed', 'merged_at': None}):
            with self.subTest(change=change), \
                    patch.object(proposal.subprocess, 'check_output', return_value=json.dumps([pull | change])), \
                    self.assertRaises(ValueError):
                proposal.existing_pr(self.root, 'Owner/Repo', pull['head']['ref'], self.commit)

    def test_remote_branch_with_different_tree_cannot_be_reused_or_overwritten(self):
        origin = self.area / 'origin.git'
        subprocess.run(['git', 'init', '--bare', '-q', str(origin)], check=True)
        proposal.git(self.root, 'remote', 'add', 'origin', str(origin))
        branch = 'codex/e2e-update-1234-2'
        tree = proposal.git(self.root, 'rev-parse', 'HEAD^{tree}').decode().strip()
        (self.root / IMAGE).write_bytes(PNG + b'other candidate')
        proposal.git(self.root, 'add', IMAGE)
        proposal.git(self.root, 'commit', '-qm', 'other candidate')
        other = proposal.git(self.root, 'rev-parse', 'HEAD').decode().strip()
        proposal.git(self.root, 'push', 'origin', 'HEAD:refs/heads/' + branch)
        with self.assertRaisesRegex(ValueError, 'differs from checked candidate'):
            proposal.verify_remote_proposal(self.root, branch, other, self.commit, tree)
        self.assertEqual(proposal.remote_branch(self.root, branch), other)

    def test_tampered_proposal_is_rejected_before_creating_a_branch(self):
        (self.root / IMAGE).write_bytes(PNG + b'changed')
        self.export()
        proposal.git(self.root, 'reset', '--hard', 'HEAD')
        (self.output / 'proposal.patch').write_bytes(b'changed bytes')
        with self.assertRaises(ValueError):
            proposal.publish_proposal(self.root, self.commit, self.output, self.environment)
        self.assertEqual(proposal.git(self.root, 'rev-parse', 'HEAD').decode().strip(), self.commit)

    def test_future_attempt_or_missing_counts_are_rejected_before_applying_patch(self):
        (self.root / IMAGE).write_bytes(PNG + b'changed')
        original = self.export()
        proposal.git(self.root, 'reset', '--hard', 'HEAD')
        for changes in ({'attempt': '3'}, {'counts': None}, {'counts': dict(original['counts'], passed=0)}):
            (self.output / 'proposal.json').write_text(json.dumps(original | changes), encoding='utf-8')
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                proposal.publish_proposal(self.root, self.commit, self.output, self.environment)
            self.assertEqual(proposal.git(self.root, 'diff', '--name-only', 'HEAD'), b'')

    def test_site_review_manifest_identity_and_fixed_image_list_are_checked_before_publish(self):
        (self.root / IMAGE).write_bytes(PNG + b'changed')
        original = self.export()
        proposal.git(self.root, 'reset', '--hard', 'HEAD')
        changes = [None]
        for field, value in (('commit', 'b' * 40), ('repository', 'Other/Repo'), ('runId', '9'), ('attempt', '1')):
            changes.append(original['siteReview'] | {field: value})
        review = copy.deepcopy(original['siteReview']); review['projects'].pop(); changes.append(review)
        review = copy.deepcopy(original['siteReview']); review['projects'][1] = review['projects'][0]; changes.append(review)
        review = copy.deepcopy(original['siteReview']); review['projects'][0]['images'][0]['path'] = IMAGE; changes.append(review)
        review = copy.deepcopy(original['siteReview']); review['projects'][0]['sourcePath'] = '../proof.json'; changes.append(review)
        review = copy.deepcopy(original['siteReview']); review['projects'][0]['images'][0]['sha256'] = 'invalid'; changes.append(review)
        review = copy.deepcopy(original['siteReview']); review['projects'][0]['images'][1] = review['projects'][0]['images'][0]; changes.append(review)
        for index, review in enumerate(changes):
            (self.output / 'proposal.json').write_text(json.dumps(original | {'siteReview': review}), encoding='utf-8')
            with self.subTest(index=index), self.assertRaises(ValueError):
                proposal.publish_proposal(self.root, self.commit, self.output, self.environment)
            self.assertEqual(proposal.git(self.root, 'diff', '--name-only', 'HEAD'), b'')

    def test_publisher_rechecks_unchanged_site_image_bytes_against_captured_hash(self):
        (self.root / IMAGE).write_bytes(PNG + b'changed')
        manifest = self.export()
        proposal.git(self.root, 'reset', '--hard', 'HEAD')
        manifest['siteReview']['projects'][0]['images'][0]['sha256'] = 'b' * 64
        (self.output / 'proposal.json').write_text(json.dumps(manifest), encoding='utf-8')
        with self.assertRaisesRegex(ValueError, 'differs from capture'):
            proposal.publish_proposal(self.root, self.commit, self.output, self.environment)
        self.assertEqual(proposal.git(self.root, 'rev-parse', 'HEAD').decode().strip(), self.commit)


if __name__ == '__main__':
    unittest.main()
