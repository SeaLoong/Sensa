"""Constrained E2E proposals in temporary Git repositories; no browser/network."""
import hashlib
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
            'tests': [{'project': name, 'outcome': 'passed', 'attempts': [{'status': 'passed'}]}
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
        proposal.git(self.root, 'add', '.')
        proposal.git(self.root, 'commit', '-qm', 'source')
        self.commit = proposal.git(self.root, 'rev-parse', 'HEAD').decode().strip()
        self.output = self.root / 'artifacts/e2e-update'
        self.summary = self.root / 'artifacts/summary.json'
        self.summary.parent.mkdir(parents=True)
        self.summary.write_text(json.dumps(candidate(self.commit)), encoding='utf-8')
        self.environment = dict(ENV, GITHUB_OUTPUT=str(self.area / 'outputs'),
                                GITHUB_STEP_SUMMARY=str(self.area / 'job.md'))

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
        commands = []
        def query(command, **kwargs):
            if command[0] == 'gh':
                commands.append(command)
                if command[1] == 'api':
                    return '[]'
                self.assertIn('--draft', command)
                self.assertIn('--body-file', command)
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


if __name__ == '__main__':
    unittest.main()
