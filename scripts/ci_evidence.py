"""Read verification intent and prove its product owner through GitHub jobs.
读取验证意图，并通过 GitHub 实际任务确认其产品验证负责人；仅只读操作。
"""
from datetime import datetime, timezone
import io
import json
from pathlib import Path
import re
import subprocess
import zipfile

WORKFLOW = '.github/workflows/ci.yml'
ARTIFACT = 'verification-plan'
RECORD_FILE = 'verification-plan.json'
MAX_ZIP = 128 * 1024
MAX_JSON = 32 * 1024
GATES = ('validate', 'e2e', 'platforms', 'prerelease')
LANES = frozenset(('web', 'backend', 'scripts', 'docs', 'unity', 'dependencies', 'e2e', 'platforms', 'prerelease'))
RUNTIMES = ('win-x64', 'win-arm64', 'linux-x64', 'linux-arm64', 'osx-x64', 'osx-arm64')
COMPARISON_STEP = 'Record successful full comparison / 记录全量比较成功'
PUBLICATION_JOB = 'Publish verified preview / 发布已验证预览'


def _sha(value):
    return isinstance(value, str) and re.fullmatch('[0-9a-f]{40}', value) is not None


def _positive(value):
    return type(value) is int and value > 0


def _validate_run(run, repository, workflow_id=None):
    if (not isinstance(run, dict) or not _positive(run.get('id')) or not _sha(run.get('head_sha'))
            or run.get('event') != 'push' or run.get('head_branch') != 'main'
            or run.get('path') != WORKFLOW or not _positive(run.get('workflow_id'))
            or not _positive(run.get('run_attempt'))
            or not _positive(run.get('repository', {}).get('id'))
            or not _positive(run.get('head_repository', {}).get('id'))
            or run.get('repository', {}).get('full_name', '').lower() != repository.lower()
            or run.get('head_repository', {}).get('full_name', '').lower() != repository.lower()
            or workflow_id is not None and run['workflow_id'] != workflow_id):
        raise ValueError('Run identity mismatch / 运行身份不一致')


def make_record(run, plan, owner, checkpoint_sha):
    """Record intent, never claim completion. / 仅记录意图，不宣称已经完成验证。"""
    return dict(schema=1, repository=run['repository']['full_name'], workflow=WORKFLOW,
                workflow_id=run['workflow_id'], event='push', branch='main', run_id=run['id'],
                run_attempt=run['run_attempt'], head_sha=run['head_sha'], owner=owner,
                required_lanes=sorted(lane for lane in LANES if plan.get(lane)),
                checkpoint_sha=checkpoint_sha, comparison='full')


def _validate_record(record, run):
    expected = {'schema', 'repository', 'workflow', 'workflow_id', 'event', 'branch', 'run_id',
                'run_attempt', 'head_sha', 'owner', 'required_lanes', 'checkpoint_sha', 'comparison'}
    if not isinstance(record, dict) or set(record) != expected or type(record['schema']) is not int or record['schema'] != 1:
        raise ValueError('Unsupported plan schema / 不支持的计划结构')
    for key, value in (('repository', run['repository']['full_name']), ('workflow', WORKFLOW),
                       ('workflow_id', run['workflow_id']), ('event', 'push'), ('branch', 'main'),
                       ('run_id', run['id']), ('run_attempt', run['run_attempt']), ('head_sha', run['head_sha']),
                       ('comparison', 'full')):
        if type(record[key]) is not type(value) or record[key] != value:
            raise ValueError('Plan identity mismatch / 计划身份不一致')
    owner, lanes = record['owner'], record['required_lanes']
    if (not isinstance(owner, dict) or set(owner) != {'run_id', 'head_sha', 'required'}
            or not _positive(owner['run_id']) or owner['run_id'] > run['id'] or not _sha(owner['head_sha'])
            or owner['required'] != list(GATES)
            or not isinstance(lanes, list) or any(not isinstance(lane, str) or lane not in LANES for lane in lanes)
            or len(lanes) != len(set(lanes))
            or record['checkpoint_sha'] is not None and not _sha(record['checkpoint_sha'])):
        raise ValueError('Invalid product owner / 产品验证负责人无效')
    return record


def decode_record(payload, run):
    """Bound compressed and expanded input; never extract archive paths.
    限制压缩及解压输入大小，不将归档路径提取到磁盘。
    """
    if len(payload) > MAX_ZIP:
        raise ValueError('Plan archive exceeds size limit / 计划归档超过大小限制')
    with zipfile.ZipFile(io.BytesIO(payload)) as archive:
        entries = archive.infolist()
        if (len(entries) != 1 or entries[0].filename != RECORD_FILE or entries[0].flag_bits & 1
                or entries[0].file_size > MAX_JSON or entries[0].compress_size > MAX_ZIP):
            raise ValueError('Invalid plan archive / 计划归档无效')
        content = archive.read(entries[0])
        if len(content) > MAX_JSON:
            raise ValueError('Expanded plan exceeds size limit / 解压计划超过大小限制')
    return _validate_record(json.loads(content.decode('utf-8')), run)


class GitHubEvidence:
    """Repository-pinned read-only adapter. / 固定仓库的只读适配器。"""
    def __init__(self, repository, root):
        if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]*/[A-Za-z0-9][A-Za-z0-9_.-]*', repository):
            raise ValueError('Invalid repository / 仓库无效')
        self.repository, self.root = repository, Path(root)

    def _query(self, endpoint):
        return subprocess.check_output(['gh', 'api', f'repos/{self.repository}/{endpoint}'], timeout=60)

    def _pages(self, endpoint, field, limit=100):
        for page in range(1, limit + 1):
            separator = '&' if '?' in endpoint else '?'
            values = json.loads(self._query(f'{endpoint}{separator}per_page=100&page={page}'))[field]
            if not isinstance(values, list):
                raise ValueError('Invalid paginated response / 分页响应无效')
            yield from values
            if len(values) < 100:
                return
        raise ValueError('Pagination limit exceeded / 超过分页限制')

    def run(self, run_id):
        if not _positive(run_id):
            raise ValueError('Invalid run ID / 运行 ID 无效')
        result = json.loads(self._query(f'actions/runs/{run_id}'))
        if result.get('id') != run_id:
            raise ValueError('Run ID changed / 运行 ID 已变更')
        return result

    def previous(self, current):
        # Stop at the nearest ancestor; a missing plan must not hide an intervening failure.
        # 选最近祖先；缺少计划时不能跳过中间失败而借用更老成功。
        for run in self._pages('actions/workflows/ci.yml/runs?branch=main&event=push', 'workflow_runs', limit=5):
            if run.get('id', current['id']) >= current['id']:
                continue
            _validate_run(run, self.repository, current['workflow_id'])
            if self.ancestor(run['head_sha'], current['head_sha']):
                yield run

    def artifacts(self, run_id):
        return self._pages(f'actions/runs/{run_id}/artifacts', 'artifacts')

    def archive(self, artifact_id):
        if not _positive(artifact_id):
            raise ValueError('Invalid artifact ID / 工件 ID 无效')
        return self._query(f'actions/artifacts/{artifact_id}/zip')

    def jobs(self, run_id):
        return list(self._pages(f'actions/runs/{run_id}/jobs?filter=latest', 'jobs'))

    def ancestor(self, older, newer):
        if not _sha(older) or not _sha(newer):
            return False
        return subprocess.run(['git', 'merge-base', '--is-ancestor', older, newer],
                              cwd=self.root, capture_output=True).returncode == 0


def _record_for(adapter, run):
    matches = [artifact for artifact in adapter.artifacts(run['id'])
               if artifact.get('name') == f'{ARTIFACT}-{run["run_attempt"]}']
    if len(matches) != 1:
        raise ValueError('Missing or duplicate plan / 计划缺失或重复')
    artifact = matches[0]
    origin = artifact.get('workflow_run', {})
    if (artifact.get('expired') is not False or not _positive(artifact.get('id'))
            or type(artifact.get('size_in_bytes')) is not int or not 0 < artifact['size_in_bytes'] <= MAX_ZIP
            or datetime.fromisoformat(artifact.get('expires_at', '').replace('Z', '+00:00')) <= datetime.now(timezone.utc)
            or origin.get('id') != run['id'] or origin.get('head_sha') != run['head_sha']
            or origin.get('head_branch') != 'main'
            or origin.get('repository_id') != run['repository']['id']
            or origin.get('head_repository_id') != run['head_repository']['id']):
        raise ValueError('Expired or unrelated plan / 计划已过期或身份不符')
    record = decode_record(adapter.archive(artifact['id']), run)
    if not adapter.ancestor(record['owner']['head_sha'], run['head_sha']):
        raise ValueError('Owner is not an ancestor / 负责人不是祖先提交')
    if record['checkpoint_sha'] and not adapter.ancestor(record['checkpoint_sha'], run['head_sha']):
        raise ValueError('Checkpoint is not an ancestor / 验证检查点不是祖先提交')
    return record


def _owner_state(run, jobs):
    groups = {gate: [] for gate in GATES}
    for job in jobs:
        name = job.get('name', '')
        for gate in GATES:
            if name == gate or name.startswith(gate + ' / ') or gate == 'prerelease' and name == PUBLICATION_JOB:
                groups[gate].append(job)
                break
    required = [job for group in groups.values() for job in group]
    if any(job.get('run_id') != run['id'] or job.get('head_sha') != run['head_sha']
           or job.get('run_attempt') != run['run_attempt'] for job in required):
        return 'unknown'
    if any(job.get('conclusion') in ('failure', 'cancelled', 'timed_out', 'action_required', 'skipped') for job in required):
        return 'failed'
    if run.get('status') != 'completed':
        return 'running' if run.get('status') in ('queued', 'in_progress', 'waiting', 'pending', 'requested') else 'unknown'
    if run.get('conclusion') != 'success':
        return 'failed'
    complete = (all(len(groups[gate]) == 1 for gate in ('validate', 'e2e', 'prerelease'))
                and len(groups['platforms']) == len(RUNTIMES)
                and all(sum(job['name'].endswith(', ' + rid + ')') for job in groups['platforms']) == 1 for rid in RUNTIMES)
                and all(job.get('status') == 'completed' and job.get('conclusion') == 'success' for job in required))
    comparison = any(step.get('name') == COMPARISON_STEP and step.get('conclusion') == 'success'
                     for job in groups['e2e'] for step in job.get('steps', []))
    return 'success' if complete and comparison else 'unknown'


def read_evidence(adapter, current_id, head_sha):
    """Resolve one product owner; docs success never pays its verification debt.
    解析一个产品验证负责人；文档任务成功永远不能清偿产品验证债务。
    """
    unknown = dict(state='unknown', owner=None, checkpoint_sha=None)
    current, current_verified = None, False
    try:
        current = adapter.run(current_id)
        _validate_run(current, adapter.repository)
        if current['head_sha'] != head_sha or current['id'] != current_id:
            raise ValueError('Current SHA mismatch / 当前提交不符')
        current_verified = True
        previous = next(iter(adapter.previous(current)), None)
        if previous is None:
            return {**unknown, 'current': current}
        _validate_run(previous, adapter.repository, current['workflow_id'])
        if previous['id'] >= current_id or not adapter.ancestor(previous['head_sha'], head_sha):
            raise ValueError('Previous run is not an earlier ancestor / 上次运行不是较早祖先')
        record = _record_for(adapter, previous)
        owner = record['owner']
        owner_run = previous if owner['run_id'] == previous['id'] else adapter.run(owner['run_id'])
        _validate_run(owner_run, adapter.repository, current['workflow_id'])
        if (owner_run['id'] != owner['run_id'] or owner_run['head_sha'] != owner['head_sha']
                or not adapter.ancestor(owner['head_sha'], head_sha)):
            raise ValueError('Owner SHA mismatch / 负责人提交不符')
        producer = record if owner_run is previous else _record_for(adapter, owner_run)
        if producer['owner'] != owner or producer['run_id'] != owner['run_id'] or not {'e2e', 'platforms', 'prerelease'} <= set(producer['required_lanes']):
            raise ValueError('Docs cannot own product verification / 文档任务不能自任产品验证负责人')
        state = _owner_state(owner_run, adapter.jobs(owner['run_id']))
        return dict(state=state, owner=owner, current=current,
                    checkpoint_sha=owner['head_sha'] if state == 'success' else record['checkpoint_sha'])
    except (OSError, ValueError, KeyError, TypeError, AttributeError, UnicodeError, StopIteration, zipfile.BadZipFile, RuntimeError, subprocess.SubprocessError):
        return {**unknown, **({'current': current} if current_verified else {})}
