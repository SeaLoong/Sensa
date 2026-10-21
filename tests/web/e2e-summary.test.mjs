import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import E2ESummaryReporter from '../../scripts/e2e-summary-reporter.mjs';
import {
  buildE2ESummary,
  finalizeE2ESummary,
  renderE2ESummary,
  verifyComparisonSummary,
} from '../../scripts/e2e-summary-reporter.mjs';

const metadata = {
  commit: 'a'.repeat(40), runId: '12345', attempt: '2', repository: 'SeaLoong/Sensa',
  suite: 'all', baselineMode: 'comparison', projects: ['desktop', 'mobile'], selectionComplete: true,
};
const completed = { status: 'passed', startTime: new Date('2026-10-22T00:00:00Z'), duration: 1250 };
const comparison = { commit: metadata.commit, runId: metadata.runId, attempt: metadata.attempt, suite: 'all' };

function attempt(status = 'passed', options = {}) {
  return { status, retry: 0, duration: 120, errors: [], attachments: [], ...options };
}

function testcase(title = 'works', options = {}) {
  const { outcome = 'expected', project = 'desktop', results = [attempt()], ...rest } = options;
  return {
    id: `${project}:${title}`, title,
    location: { file: 'tests/e2e/example.spec.js', line: 12, column: 1 },
    parent: { project: () => ({ name: project }) },
    titlePath: () => ['', project, 'example.spec.js', title],
    expectedStatus: 'passed', annotations: [], results,
    outcome: () => outcome, ...rest,
  };
}

test('summary keeps passed, expected failures, skips and unexecuted cases distinct', () => {
  const summary = buildE2ESummary([
    testcase('normal'),
    testcase('known failure', { expectedStatus: 'failed', results: [attempt('failed')] }),
    testcase('disabled', { expectedStatus: 'skipped', outcome: 'skipped', results: [attempt('skipped')] }),
    testcase('not reached', { outcome: 'skipped', results: [] }),
  ], completed, metadata);
  assert.deepEqual(summary.counts, {
    total: 4, passed: 1, expectedFailure: 1, failed: 0, flaky: 0, skipped: 1, notRun: 1, interrupted: 0,
  });
  assert.throws(() => verifyComparisonSummary(summary, comparison));
});

test('retries and unexpectedly passing expected failures do not count as clean passes', () => {
  const summary = buildE2ESummary([
    testcase('passes on retry', { outcome: 'flaky', results: [attempt('failed'), attempt('passed', { retry: 1 })] }),
    testcase('unexpected pass', { expectedStatus: 'failed', outcome: 'unexpected' }),
    testcase('times out', { outcome: 'unexpected', results: [attempt('timedOut')] }),
  ], { ...completed, status: 'failed' }, metadata);
  assert.equal(summary.counts.passed, 0);
  assert.equal(summary.counts.flaky, 1);
  assert.equal(summary.counts.failed, 2);
  assert.equal(summary.counts.total, 3);
  assert.throws(() => verifyComparisonSummary(summary, comparison));
});

test('runner-suppressed skipped attempts are unrun rather than explicit skips', () => {
  const summary = buildE2ESummary([
    testcase('serial sibling not reached', { outcome: 'skipped', results: [attempt('skipped')] }),
    testcase('explicit skip', { expectedStatus: 'skipped', outcome: 'skipped', results: [attempt('skipped')] }),
  ], { ...completed, status: 'failed' }, metadata);
  assert.equal(summary.counts.notRun, 1);
  assert.equal(summary.counts.skipped, 1);
  assert.equal(summary.counts.failed, 0);
  assert.throws(() => verifyComparisonSummary(summary, comparison));
});

test('interruption and global errors preserve unfinished scope', () => {
  const summary = buildE2ESummary([
    testcase('stopped', { outcome: 'unexpected', results: [attempt('interrupted')] }),
    testcase('not started', { outcome: 'skipped', results: [] }),
  ], { ...completed, status: 'interrupted' }, metadata, [{ message: 'Worker stopped' }]);
  assert.equal(summary.counts.interrupted, 1);
  assert.equal(summary.counts.notRun, 1);
  assert.equal(summary.counts.passed, 0);
  assert.match(renderE2ESummary(summary), /Worker stopped/);
  assert.throws(() => verifyComparisonSummary(summary, comparison));
});

test('only a positive, complete comparison for the same run and commit can be accepted', () => {
  const summary = buildE2ESummary([
    testcase('desktop'), testcase('mobile', { project: 'mobile' }),
  ], completed, metadata);
  assert.doesNotThrow(() => verifyComparisonSummary(summary, comparison));
  for (const changed of [
    { ...comparison, commit: 'b'.repeat(40) },
    { ...comparison, runId: '54321' },
    { ...comparison, attempt: '3' },
    { ...comparison, suite: 'site' },
  ]) assert.throws(() => verifyComparisonSummary(summary, changed));
  for (const changed of [
    buildE2ESummary([], completed, metadata),
    buildE2ESummary([testcase()], completed, { ...metadata, suite: 'site' }),
    buildE2ESummary([testcase()], completed, { ...metadata, baselineMode: 'candidate' }),
    buildE2ESummary([testcase()], { ...completed, status: 'failed' }, metadata),
    buildE2ESummary([testcase()], completed, metadata, [{ message: 'Teardown failed' }]),
    buildE2ESummary([testcase('expected failure', { expectedStatus: 'failed', results: [attempt('failed')] })], completed, metadata),
  ]) assert.throws(() => verifyComparisonSummary(changed, comparison));
});

test('failure details remain readable without introducing raw HTML into the summary', () => {
  const summary = buildE2ESummary([testcase('bad <script>alert(1)</script> | title', {
    outcome: 'unexpected', results: [attempt('failed', {
      errors: [{ message: '\u001b[31mExpected <b>safe</b>\u001b[0m\nreceived ```\n::error::text' }],
      attachments: [{ name: 'actual image', contentType: 'image/png', path: 'artifacts/e2e/results/actual.png' }],
    })],
  })], { ...completed, status: 'failed' }, metadata);
  const text = renderE2ESummary(summary);
  assert.match(text, /bad /);
  assert.match(text, /Expected/);
  assert.match(text, /received/);
  assert.doesNotMatch(text, /<script>|<b>|\u001b\[/);
});

test('inconsistent or empty evidence cannot be promoted by changing aggregate counters', () => {
  const summary = buildE2ESummary([testcase('desktop'), testcase('mobile', { project: 'mobile' })], completed, metadata);
  for (const change of [
    value => { value.counts.total = 3; value.counts.passed = 3; },
    value => { value.counts.passed = -1; },
    value => { value.tests[0].outcome = 'failed'; },
    value => { value.tests[0].attempts = []; },
    value => { value.tests[0].attempts[0].status = 'failed'; },
    value => { value.globalErrors = undefined; },
  ]) {
    const changed = structuredClone(summary);
    change(changed);
    assert.throws(() => verifyComparisonSummary(changed, comparison));
  }
  for (const missing of ['commit', 'runId', 'attempt']) {
    const changed = { ...comparison };
    delete changed[missing];
    assert.throws(() => verifyComparisonSummary(summary, changed));
  }
});

test('partial projects and filtered or sharded runs cannot produce a full comparison receipt', () => {
  const cases = [testcase('desktop'), testcase('mobile', { project: 'mobile' })];
  for (const summary of [
    buildE2ESummary([cases[0]], completed, metadata),
    buildE2ESummary(cases, completed, { ...metadata, projects: ['desktop'] }),
    buildE2ESummary([testcase('unknown project', { project: '' })], completed, metadata),
    buildE2ESummary(cases, completed, { ...metadata, selectionComplete: false }),
    buildE2ESummary(cases, completed, { ...metadata, selectionComplete: undefined }),
  ]) assert.throws(() => verifyComparisonSummary(summary, comparison));
});

test('finalization keeps current observations and publishes the command result once', () => {
  const directory = mkdtempSync(join(tmpdir(), 'sensa-e2e-finalize-'));
  try {
    for (const commandOutcome of ['success', 'failure', 'skipped']) {
      const reportPath = join(directory, commandOutcome, 'summary.json');
      const stepSummary = join(directory, `${commandOutcome}-job.md`);
      const original = buildE2ESummary([
        testcase('desktop'), testcase('mobile', { project: 'mobile' }),
      ], completed, { ...metadata, viewports: [{ name: 'desktop', width: 1280, height: 900 }] });
      mkdirSync(join(directory, commandOutcome), { recursive: true });
      writeFileSync(reportPath, JSON.stringify(original));
      writeFileSync(stepSummary, 'Existing job summary\n\n');
      const result = finalizeE2ESummary(reportPath, { metadata, commandOutcome, stepSummary });
      assert.deepEqual(result, { ...original, commandOutcome });
      assert.deepEqual(JSON.parse(readFileSync(reportPath, 'utf8')), result);
      const markdown = readFileSync(join(directory, commandOutcome, 'summary.md'), 'utf8');
      assert.match(markdown, new RegExp(`Command: \\*\\*${commandOutcome}\\*\\*`));
      assert.equal(readFileSync(stepSummary, 'utf8'), `Existing job summary\n\n${markdown}`);
      assert.equal(markdown.match(/## Browser verification/g)?.length, 1);
      if (commandOutcome === 'success') assert.equal(verifyComparisonSummary(result, comparison), true);
      else assert.throws(() => verifyComparisonSummary(result, comparison));
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('missing, stale and malformed reports become zero-observation current-run summaries', () => {
  const directory = mkdtempSync(join(tmpdir(), 'sensa-e2e-fallback-'));
  const original = buildE2ESummary([
    testcase('desktop'), testcase('mobile', { project: 'mobile' }),
  ], completed, metadata);
  try {
    for (const [name, content] of [
      ['missing', undefined],
      ['stale-commit', JSON.stringify({ ...original, commit: 'b'.repeat(40) })],
      ['other-repository', JSON.stringify({ ...original, repository: 'Other/Sensa' })],
      ['stale-run', JSON.stringify({ ...original, runId: '99999' })],
      ['stale-attempt', JSON.stringify({ ...original, attempt: '1' })],
      ['other-suite', JSON.stringify({ ...original, suite: 'site' })],
      ['candidate', JSON.stringify({ ...original, baselineMode: 'candidate' })],
      ['malformed-json', '{"schema":'],
      ['malformed-counts', JSON.stringify({ ...original, counts: { ...original.counts, passed: -1 } })],
      ['inconsistent-counts', JSON.stringify({ ...original, counts: { ...original.counts, total: 99, passed: 99 } })],
      ['malformed-tests', JSON.stringify({ ...original, tests: null })],
      ['malformed-attempt', JSON.stringify({ ...original,
        counts: { ...original.counts, passed: 1, failed: 1 },
        tests: [{ ...original.tests[0], outcome: 'failed', attempts: [null] }, original.tests[1]],
      })],
    ]) {
      const reportPath = join(directory, name, 'summary.json');
      if (content !== undefined) {
        mkdirSync(join(directory, name), { recursive: true });
        writeFileSync(reportPath, content);
      }
      const result = finalizeE2ESummary(reportPath, { metadata, commandOutcome: 'failure', stepSummary: '' });
      assert.equal(result.commit, metadata.commit, name);
      assert.equal(result.runId, metadata.runId, name);
      assert.equal(result.attempt, metadata.attempt, name);
      assert.equal(result.suite, metadata.suite, name);
      assert.equal(result.baselineMode, metadata.baselineMode, name);
      assert.equal(result.commandOutcome, 'failure', name);
      assert.equal(result.status, 'not-run', name);
      assert.equal(result.startTime, null, name);
      assert.equal(result.durationMs, 0, name);
      assert.deepEqual(result.tests, [], name);
      assert.ok(Object.values(result.counts).every(count => count === 0), name);
      assert.equal(result.globalErrors.length, 1, name);
      assert.match(result.globalErrors[0], /No current-run browser report/, name);
      assert.deepEqual(JSON.parse(readFileSync(reportPath, 'utf8')), result, name);
      assert.match(readFileSync(join(directory, name, 'summary.md'), 'utf8'), /Tests cannot be counted as passed/, name);
      assert.throws(() => verifyComparisonSummary(result, comparison), name);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('a skipped candidate command keeps its requested target without claiming executed cases', () => {
  const directory = mkdtempSync(join(tmpdir(), 'sensa-e2e-candidate-fallback-'));
  try {
    const result = finalizeE2ESummary(join(directory, 'summary.json'), {
      metadata: { ...metadata, suite: 'site', baselineMode: 'candidate', projects: [], selectionComplete: false },
      commandOutcome: 'skipped', stepSummary: '',
    });
    assert.equal(result.suite, 'site');
    assert.equal(result.baselineMode, 'candidate');
    assert.equal(result.commandOutcome, 'skipped');
    assert.equal(result.status, 'not-run');
    assert.deepEqual(result.projects, []);
    assert.ok(Object.values(result.counts).every(count => count === 0));
    assert.deepEqual(result.tests, []);
    assert.match(renderE2ESummary(result), /Candidate images only/);
    assert.match(renderE2ESummary(result), /Coverage is incomplete/);
    assert.throws(() => verifyComparisonSummary(result, comparison));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('cancellation without a report records an interrupted run without inventing interrupted cases', () => {
  const directory = mkdtempSync(join(tmpdir(), 'sensa-e2e-cancelled-'));
  try {
    const result = finalizeE2ESummary(join(directory, 'summary.json'), {
      metadata, commandOutcome: 'cancelled', stepSummary: '',
    });
    assert.equal(result.status, 'interrupted');
    assert.equal(result.commandOutcome, 'cancelled');
    assert.ok(Object.values(result.counts).every(count => count === 0));
    assert.deepEqual(result.tests, []);
    assert.match(result.globalErrors[0], /command outcome: cancelled/);
    assert.throws(() => verifyComparisonSummary(result, comparison));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('reporter replaces stale output and preserves the runner failure instead of overriding it', () => {
  const directory = mkdtempSync(join(tmpdir(), 'sensa-e2e-summary-'));
  const originalDirectory = process.cwd();
  const names = ['GITHUB_SHA', 'GITHUB_REPOSITORY', 'GITHUB_RUN_ID', 'GITHUB_RUN_ATTEMPT',
    'E2E_SUITE', 'E2E_UPDATE_SNAPSHOTS', 'GITHUB_STEP_SUMMARY'];
  const oldEnvironment = Object.fromEntries(names.map(name => [name, process.env[name]]));
  const originalLog = console.log, annotations = [];
  try {
    process.chdir(directory);
    Object.assign(process.env, {
      GITHUB_SHA: metadata.commit, GITHUB_REPOSITORY: metadata.repository,
      GITHUB_RUN_ID: metadata.runId, GITHUB_RUN_ATTEMPT: metadata.attempt,
      E2E_SUITE: 'all', E2E_UPDATE_SNAPSHOTS: 'false', GITHUB_STEP_SUMMARY: join(directory, 'job-summary.md'),
    });
    mkdirSync('artifacts/e2e', { recursive: true });
    writeFileSync('artifacts/e2e/summary.json', '{"commit":"old"}');
    writeFileSync('artifacts/e2e/summary.md', 'old summary');
    const reporter = new E2ESummaryReporter();
    const cases = [testcase('bad\n::error::title', { outcome: 'unexpected',
      results: [attempt('failed', { errors: [{ message: 'Expected value\nreceived other value' }] })] })];
    reporter.onBegin({ projects: [{ name: 'desktop', use: { viewport: { width: 1280, height: 900 } } }] },
      { allTests: () => cases });
    assert.equal(existsSync('artifacts/e2e/summary.json'), false);
    assert.equal(existsSync('artifacts/e2e/summary.md'), false);
    reporter.onError({ message: 'Worker error' });
    console.log = value => annotations.push(value);
    const result = reporter.onEnd({ ...completed, status: 'failed' });
    assert.equal(result, undefined, 'Only the runner decides its process result');
    const report = JSON.parse(readFileSync('artifacts/e2e/summary.json', 'utf8'));
    assert.equal(report.commit, metadata.commit);
    assert.equal(report.status, 'failed');
    assert.equal(report.counts.failed, 1);
    assert.deepEqual(report.globalErrors, ['Worker error']);
    assert.equal(existsSync('job-summary.md'), false, 'Only finalization publishes the job summary');
    const finalized = finalizeE2ESummary('artifacts/e2e/summary.json', {
      metadata, commandOutcome: 'failure', stepSummary: 'job-summary.md',
    });
    assert.deepEqual(finalized, { ...report, commandOutcome: 'failure' });
    const jobSummary = readFileSync('job-summary.md', 'utf8');
    assert.match(jobSummary, /Worker error/);
    assert.match(jobSummary, /Command: \*\*failure\*\*/);
    assert.equal(jobSummary.match(/## Browser verification/g)?.length, 1);
    assert.ok(annotations.some(value => value.startsWith('::error title=Browser test::')));
    assert.ok(annotations.every(value => !value.includes('\n')), 'Annotation data cannot inject another workflow command');
    assert.ok(annotations.some(value => value.includes('%0A')));
    const earlyFailure = new E2ESummaryReporter();
    earlyFailure.onError({ message: 'Configuration could not load' });
    assert.equal(earlyFailure.onEnd({ ...completed, status: 'failed' }), undefined);
    const failedBeforeBegin = JSON.parse(readFileSync('artifacts/e2e/summary.json', 'utf8'));
    assert.equal(failedBeforeBegin.counts.total, 0);
    assert.deepEqual(failedBeforeBegin.globalErrors, ['Configuration could not load']);
    assert.throws(() => verifyComparisonSummary(failedBeforeBegin, comparison));
    const completeConfig = { grep: /.*/, grepInvert: null, shard: null,
      projects: ['desktop', 'mobile'].map(name => ({ name, grep: /.*/, grepInvert: null,
        use: { viewport: { width: name === 'desktop' ? 1280 : 390, height: 900 } } })) };
    const fullSuite = { allTests: () => [testcase('desktop'), testcase('mobile', { project: 'mobile' })] };
    for (const [config, complete] of [
      [completeConfig, true],
      [{ ...completeConfig, shard: { current: 1, total: 2 } }, false],
      [{ ...completeConfig, grep: /one-test/ }, false],
      [{ ...completeConfig, grepInvert: /excluded/ }, false],
      [{ ...completeConfig, projects: completeConfig.projects.map(project => ({ ...project, grep: /limited/ })) }, false],
    ]) {
      const scoped = new E2ESummaryReporter();
      scoped.onBegin(config, fullSuite);
      assert.equal(scoped.onEnd(completed), undefined);
      const report = JSON.parse(readFileSync('artifacts/e2e/summary.json', 'utf8'));
      assert.equal(report.selectionComplete, complete);
      if (complete) assert.doesNotThrow(() => verifyComparisonSummary(report, comparison));
      else assert.throws(() => verifyComparisonSummary(report, comparison));
    }
  } finally {
    console.log = originalLog;
    process.chdir(originalDirectory);
    for (const name of names) {
      if (oldEnvironment[name] === undefined) delete process.env[name];
      else process.env[name] = oldEnvironment[name];
    }
    rmSync(directory, { recursive: true, force: true });
  }
});
