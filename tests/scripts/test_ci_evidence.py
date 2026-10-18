"""Product-owner evidence contracts with a fake GitHub adapter.
通过伪 GitHub 适配器验证产品负责人证据；不访问网络或运行产品进程。
"""
import copy
from datetime import datetime, timedelta, timezone
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import unittest
from unittest.mock import patch
import zipfile

ROOT = Path(__file__).resolve().parents[2]


def load(name):
    spec = importlib.util.spec_from_file_location(name.replace('-', '_') + '_contracts', ROOT / 'scripts' / (name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


evidence = load('ci_evidence')
policy = load('ci-plan')
SHA_A, SHA_B, SHA_C = ('a' * 40, 'b' * 40, 'c' * 40)


def run(run_id, sha, *, status='completed', conclusion='success', attempt=1):
    return dict(id=run_id, head_sha=sha, head_branch='main', event='push', path=evidence.WORKFLOW,
                status=status, conclusion=conclusion, workflow_id=42, run_attempt=attempt,
                repository={'id': 101, 'full_name': 'Owner/Repo'}, head_repository={'id': 101, 'full_name': 'Owner/Repo'})


def owner(run_id=1, sha=SHA_A):
    return dict(run_id=run_id, head_sha=sha, required=list(evidence.GATES))


def archive(record, name=evidence.RECORD_FILE, *, extra=None):
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, 'w', zipfile.ZIP_DEFLATED) as output:
        output.writestr(name, json.dumps(record).encode() if not isinstance(record, bytes) else record)
        if extra:
            output.writestr(extra, '{}')
    return buffer.getvalue()


def passed_jobs(product):
    names = ['validate / Verify affected interfaces / 验证受影响接口', 'e2e / browser',
             *('platforms / build (runner, ' + runtime + ')' for runtime in evidence.RUNTIMES),
             evidence.PUBLICATION_JOB]
    return [dict(name=name, status='completed', conclusion='success', run_id=product['id'],
                 head_sha=product['head_sha'], run_attempt=product['run_attempt'],
                 steps=[dict(name=evidence.COMPARISON_STEP, conclusion='success')] if name == 'e2e / browser' else [])
            for name in names]


class FakeGitHub:
    repository = 'Owner/Repo'

    def __init__(self):
        self.runs = {1: run(1, SHA_A), 2: run(2, SHA_B), 3: run(3, SHA_C, status='in_progress', conclusion=None)}
        self.previous_ids = [2, 1]
        self.records, self.payloads, self.job_sets = {}, {}, {1: passed_jobs(self.runs[1])}
        self.ancestry = {(older, newer) for older in (SHA_A, SHA_B, SHA_C) for newer in (SHA_A, SHA_B, SHA_C) if older <= newer}
        product = policy.plan_changes(['src/Runtime/MotionRuntime.cs'], event_name='push', ref='refs/heads/main')
        self.put(1, evidence.make_record(self.runs[1], product, owner(), None))
        self.put(2, evidence.make_record(self.runs[2], {'docs': True}, owner(), None))
        self.calls = []

    def put(self, run_id, record):
        current = self.runs[run_id]
        payload = archive(record)
        artifact_id = run_id + 1000
        self.records[run_id] = [dict(id=artifact_id, name=f'verification-plan-{current["run_attempt"]}',
                                    expired=False, size_in_bytes=len(payload), expires_at='2099-01-01T00:00:00Z',
                                    workflow_run={'id': run_id, 'head_sha': current['head_sha'], 'head_branch': 'main',
                                                  'repository_id': 101, 'head_repository_id': 101})]
        self.payloads[artifact_id] = payload

    def run(self, run_id):
        self.calls.append(('run', run_id))
        return copy.deepcopy(self.runs[run_id])

    def previous(self, _current):
        return (copy.deepcopy(self.runs[run_id]) for run_id in self.previous_ids)

    def artifacts(self, run_id):
        self.calls.append(('artifacts', run_id))
        return copy.deepcopy(self.records.get(run_id, []))

    def archive(self, artifact_id):
        self.calls.append(('archive', artifact_id))
        return self.payloads[artifact_id]

    def jobs(self, run_id):
        self.calls.append(('jobs', run_id))
        return copy.deepcopy(self.job_sets[run_id])

    def ancestor(self, older, newer):
        return (older, newer) in self.ancestry


class ProductOwnerContracts(unittest.TestCase):
    def setUp(self):
        self.github = FakeGitHub()

    def read(self):
        return evidence.read_evidence(self.github, 3, SHA_C)

    def plan(self, paths, proof, owner_paths=()):
        return policy.plan_with_evidence(paths, proof, owner_paths=list(owner_paths), event_name='push', ref='refs/heads/main')

    def test_failed_product_then_test_fix_restores_every_required_gate(self):
        self.github.runs[1].update(conclusion='failure')
        self.github.job_sets[1][0]['conclusion'] = 'failure'
        proof = self.read()
        self.assertEqual(proof['state'], 'failed')
        result = self.plan(['tests/Sensa.Tests/Contracts/MotionContracts.cs'], proof)
        self.assertTrue(all(result[lane] for lane in policy.FLAGS))

    def test_docs_chain_retains_running_product_owner_and_docs_success_cannot_pay_its_debt(self):
        self.github.runs[1].update(status='in_progress', conclusion=None)
        self.github.job_sets[1] = []
        proof = self.read()
        self.assertEqual(proof['state'], 'running')
        result = self.plan(['README.md'], proof, ['README.md'])
        self.assertEqual({lane for lane in policy.FLAGS if result[lane]}, {'docs'})
        carried = evidence.make_record(self.github.runs[3], result, proof['owner'], proof['checkpoint_sha'])
        self.assertEqual(carried['owner']['run_id'], 1)
        self.assertIsNone(carried['checkpoint_sha'])
        self.github.put(3, carried)
        self.github.runs[3].update(status='completed', conclusion='success')
        self.github.runs[4] = run(4, 'd' * 40, status='in_progress', conclusion=None)
        self.github.previous_ids = [3, 2, 1]
        self.github.ancestry.update((sha, 'd' * 40) for sha in (SHA_A, SHA_B, SHA_C))
        self.assertEqual(evidence.read_evidence(self.github, 4, 'd' * 40)['state'], 'running')
        self.assertNotIn(('jobs', 3), self.github.calls)

    def test_successful_owner_makes_later_test_only_changes_nonpublishing(self):
        proof = self.read()
        self.assertEqual(proof['state'], 'success')
        self.assertEqual(proof['checkpoint_sha'], SHA_A)
        result = self.plan(['tests/web/configuration-workflows.test.mjs'], proof, ['tests/web/configuration-workflows.test.mjs'])
        self.assertEqual({lane for lane in policy.FLAGS if result[lane]}, {'web'})
        self.assertFalse(result['prerelease'])

    def test_new_product_code_or_tests_during_pending_validation_cannot_hide_behind_docs_owner(self):
        self.github.runs[1].update(status='in_progress', conclusion=None)
        self.github.job_sets[1] = []
        proof = self.read()
        for paths, delta in [(['README.md'], ['src/Program.cs']), (['tests/web/changed.test.mjs'], [])]:
            with self.subTest(paths=paths):
                self.assertTrue(self.plan(paths, proof, delta)['prerelease'])
        verified = {'state': 'success', 'owner': owner()}
        result = self.plan(['src/web/styles.css'], verified, ['src/web/styles.css'])
        self.assertTrue(result['web'] and result['e2e'] and result['platforms'] and result['prerelease'])

    def test_missing_first_migration_artifact_retains_current_identity_for_recovery_record(self):
        self.github.records.pop(2)
        proof = self.read()
        self.assertEqual(proof['state'], 'unknown')
        self.assertEqual(proof['current']['id'], 3)
        result = self.plan(['tests/Sensa.Tests/Contracts/MotionContracts.cs'], proof)
        self.assertTrue(all(result[lane] for lane in policy.FLAGS))

    def test_overall_success_cannot_replace_skipped_missing_or_partial_required_jobs(self):
        for modification in ('skipped', 'missing-rid', 'duplicate-rid', 'comparison-skipped', 'foreign-job'):
            with self.subTest(modification=modification):
                self.github.job_sets[1] = passed_jobs(self.github.runs[1])
                jobs = self.github.job_sets[1]
                if modification == 'skipped':
                    jobs[2]['conclusion'] = 'skipped'
                elif modification == 'missing-rid':
                    del jobs[2]
                elif modification == 'duplicate-rid':
                    jobs[2]['name'] = jobs[3]['name']
                elif modification == 'comparison-skipped':
                    jobs[1]['steps'][0]['conclusion'] = 'skipped'
                else:
                    jobs[2]['head_sha'] = SHA_B
                self.assertNotEqual(self.read()['state'], 'success')

    def test_metadata_owner_artifact_and_schema_mismatches_fail_closed(self):
        changes = [('run', 'event', 'pull_request'), ('run', 'head_branch', 'feature'),
                   ('run', 'path', '.github/workflows/other.yml'), ('run', 'workflow_id', 999),
                   ('artifact', 'expired', True), ('artifact', 'expires_at', '2000-01-01T00:00:00Z'),
                   ('artifact', 'size_in_bytes', evidence.MAX_ZIP + 1)]
        for location, key, value in changes:
            with self.subTest(location=location, key=key):
                self.github = FakeGitHub()
                target = self.github.runs[2] if location == 'run' else self.github.records[2][0]
                target[key] = value
                self.assertEqual(self.read()['state'], 'unknown')
        self.github = FakeGitHub()
        record = evidence.make_record(self.github.runs[2], {'docs': True}, owner(), None)
        record['owner']['run_id'] = 3
        self.github.put(2, record)
        self.assertEqual(self.read()['state'], 'unknown')

    def test_docs_cannot_claim_self_as_product_owner_or_forge_a_verified_checkpoint(self):
        self.github.put(2, evidence.make_record(self.github.runs[2], {'docs': True}, owner(2, SHA_B), SHA_B))
        self.github.job_sets[2] = passed_jobs(self.github.runs[2])
        self.assertEqual(self.read()['state'], 'unknown')
        self.github = FakeGitHub()
        self.github.put(2, evidence.make_record(self.github.runs[2], {'docs': True}, owner(), 'f' * 40))
        self.assertEqual(self.read()['state'], 'unknown')

    def test_nonancestor_cross_repository_and_future_or_cyclic_owner_records_are_rejected(self):
        for change in ('nonancestor', 'repository', 'head_repository', 'owner-cycle', 'wrong-owner-sha'):
            with self.subTest(change=change):
                self.github = FakeGitHub()
                if change == 'nonancestor':
                    self.github.ancestry.remove((SHA_B, SHA_C))
                elif change in ('repository', 'head_repository'):
                    self.github.runs[2][change]['full_name'] = 'Other/Repo'
                else:
                    producer = evidence.make_record(self.github.runs[1], {'e2e': True, 'platforms': True, 'prerelease': True}, owner(), None)
                    producer['owner'] = owner(2, SHA_B) if change == 'owner-cycle' else owner(1, SHA_B)
                    self.github.put(1, producer)
                self.assertEqual(self.read()['state'], 'unknown')

    def test_same_sha_rerun_requires_latest_attempt_intent_and_latest_jobs(self):
        self.github.runs[1]['run_attempt'] = 2
        self.assertEqual(self.read()['state'], 'unknown')
        product = policy.plan_changes([], event_name='push', ref='refs/heads/main', diff_available=False)
        self.github.put(1, evidence.make_record(self.github.runs[1], product, owner(), None))
        self.github.job_sets[1] = passed_jobs(self.github.runs[1])
        self.assertEqual(self.read()['state'], 'success')

    def test_api_failure_and_unknown_state_restore_conservative_checks(self):
        with patch.object(self.github, 'artifacts', side_effect=subprocess.CalledProcessError(1, 'gh')):
            proof = self.read()
        self.assertEqual(proof['state'], 'unknown')
        self.assertEqual(proof['current']['id'], 3)
        self.assertTrue(self.plan(['README.md'], proof)['prerelease'])

    def test_pr_manual_and_local_policy_never_read_github_or_publish_automatically(self):
        with patch.object(policy.subprocess, 'check_output') as query, patch.object(policy.subprocess, 'run') as command:
            for event, ref in [('pull_request', 'refs/pull/1/merge'), ('workflow_dispatch', 'refs/heads/main')]:
                result = policy.plan_with_evidence(['src/Program.cs'], {'state': 'unknown'}, event_name=event, ref=ref)
                self.assertFalse(result['prerelease'])
            policy.plan_changes(['README.md'])
        query.assert_not_called()
        command.assert_not_called()


class ArchiveAndAdapterContracts(unittest.TestCase):
    def test_record_archive_rejects_path_entries_extra_entries_zip_bombs_and_oversized_json(self):
        current = run(1, SHA_A)
        valid = evidence.make_record(current, {'e2e': True, 'platforms': True, 'prerelease': True}, owner(), None)
        payloads = [archive(valid, '../verification-plan.json'), archive(valid, extra='extra.json'),
                    archive(b'x' * (evidence.MAX_JSON + 1)), b'not a zip', b'x' * (evidence.MAX_ZIP + 1)]
        for payload in payloads:
            with self.subTest(size=len(payload)), self.assertRaises((ValueError, zipfile.BadZipFile)):
                evidence.decode_record(payload, current)
        for update in ({'schema': True}, {'schema': 2}, {'head_sha': SHA_B}, {'unexpected': True}):
            with self.subTest(update=update), self.assertRaises(ValueError):
                evidence.decode_record(archive(valid | update), current)

    def test_github_adapter_reads_every_jobs_page_and_never_combines_slurp_with_jq(self):
        adapter = evidence.GitHubEvidence('Owner/Repo', ROOT)
        first = [dict(id=index) for index in range(100)]
        responses = [json.dumps({'jobs': first}).encode(), json.dumps({'jobs': [{'id': 100}]}).encode()]
        with patch.object(evidence.subprocess, 'check_output', side_effect=responses) as query:
            self.assertEqual(len(adapter.jobs(1)), 101)
        commands = [call.args[0] for call in query.call_args_list]
        self.assertTrue(commands[0][-1].endswith('filter=latest&per_page=100&page=1'))
        self.assertTrue(commands[1][-1].endswith('filter=latest&per_page=100&page=2'))
        self.assertTrue(all(command[:2] == ['gh', 'api'] and '--jq' not in command and '--slurp' not in command for command in commands))

    def test_previous_run_selection_ignores_current_and_nonancestors_without_skipping_missing_proof(self):
        adapter = evidence.GitHubEvidence('Owner/Repo', ROOT)
        current, previous = run(3, SHA_C), run(2, SHA_B)
        alien = run(4, 'f' * 40)
        with patch.object(adapter, '_query', return_value=json.dumps({'workflow_runs': [alien, current, previous]}).encode()), \
                patch.object(adapter, 'ancestor', return_value=True):
            self.assertEqual(list(adapter.previous(current)), [previous])
        with patch.object(evidence.subprocess, 'check_output', return_value=b'{"id":2}'), self.assertRaises(ValueError):
            adapter.run(1)


if __name__ == '__main__':
    unittest.main()
