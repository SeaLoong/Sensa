/** Current-run evidence for Playwright; recording never changes the runner's result. */
import { appendFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUTCOMES = ['passed', 'expectedFailure', 'failed', 'flaky', 'skipped', 'notRun', 'interrupted'];
const clean = value => String(value ?? '').replace(/\u001b\[[0-9;]*m/g, '');
const html = value => clean(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const messageOf = error => clean(error?.message || error?.stack || error).slice(0, 6000);

function classify(test, last) {
  if (!last) return 'notRun';
  const outcome = test.outcome();
  if (outcome === 'flaky') return 'flaky';
  if (last.status === 'interrupted') return 'interrupted';
  if (last.status === 'skipped') return test.expectedStatus === 'skipped' ? 'skipped' : 'notRun';
  if (outcome === 'unexpected') return 'failed';
  if (outcome === 'expected' && test.expectedStatus === 'passed' && last.status === 'passed') return 'passed';
  if (outcome === 'expected' && test.expectedStatus === 'failed' && last.status === 'failed') return 'expectedFailure';
  return 'failed';
}

export function buildE2ESummary(tests, result, metadata, globalErrors = []) {
  const counts = Object.fromEntries(['total', ...OUTCOMES].map(key => [key, 0]));
  const cases = tests.map(test => {
    const attempts = test.results.map(attempt => ({
      retry: attempt.retry, status: attempt.status, durationMs: attempt.duration,
      errors: (attempt.errors?.length ? attempt.errors : attempt.error ? [attempt.error] : []).map(messageOf),
      attachments: (attempt.attachments || []).map(item => ({ name: item.name, contentType: item.contentType,
        ...(item.path ? { path: relative(process.cwd(), item.path).replaceAll('\\', '/') } : {}) })),
    }));
    const outcome = classify(test, test.results.at(-1));
    counts.total++;
    counts[outcome]++;
    return { id: test.id, title: test.titlePath().filter(Boolean).join(' › '),
      project: test.parent.project()?.name || '', file: relative(process.cwd(), test.location.file).replaceAll('\\', '/'),
      line: test.location.line, expectedStatus: test.expectedStatus, outcome, attempts };
  });
  const { commit, repository, runId, attempt, suite, baselineMode, projects, viewports, selectionComplete } = metadata;
  const runUrl = /^[\w.-]+\/[\w.-]+$/.test(repository || '') && /^[1-9]\d*$/.test(String(runId || ''))
    ? `https://github.com/${repository}/actions/runs/${runId}` : null;
  return { schema: 1, commit, repository, runId: String(runId || ''), attempt: String(attempt || ''), runUrl,
    suite, baselineMode, projects: projects || [], viewports: viewports || [], selectionComplete: selectionComplete === true, status: result.status,
    startTime: result.startTime instanceof Date ? result.startTime.toISOString() : null,
    durationMs: result.duration, counts, globalErrors: globalErrors.map(messageOf), tests: cases };
}

export function renderE2ESummary(summary) {
  const counts = summary.counts;
  const rows = OUTCOMES.map(key => `| ${key} | ${counts[key]} |`).join('\n');
  const failures = summary.tests.filter(test => ['failed', 'flaky', 'interrupted'].includes(test.outcome));
  const details = failures.slice(0, 30).map(test => {
    const errors = test.attempts.flatMap(attempt => attempt.errors).join('\n\n') || 'No assertion details were emitted.';
    return `<details><summary>${html(test.project)}: ${html(test.title)} (${html(test.outcome)})</summary>\n\n<pre>${html(errors)}</pre>\n\n</details>`;
  }).join('\n\n');
  return `## Browser verification / 浏览器验证\n\n`
    + `Commit: <code>${html(summary.commit || 'unavailable')}</code> · Suite: <code>${html(summary.suite)}</code> · Mode: <code>${html(summary.baselineMode)}</code>\n\n`
    + `Runner: **${html(summary.status)}** · Total: **${counts.total}** · Run attempt: ${html(summary.attempt)}${summary.commandOutcome ? ` · Command: **${html(summary.commandOutcome)}**` : ''}\n\n`
    + `| Outcome | Count |\n| --- | ---: |\n${rows}\n\n`
    + `Projects: ${summary.projects.map(html).join(', ') || 'none'}\n\n`
    + `Viewports: ${summary.viewports.map(item => `${html(item.name)} ${html(item.width)}×${html(item.height)}`).join(', ') || 'not configured'}\n\n`
    + (summary.runUrl ? `[Actions run](${summary.runUrl})\n\n` : '')
    + (summary.baselineMode === 'candidate' ? '**Candidate images only; this is not a normal-comparison receipt. / 仅生成待审图片，不是普通比较通过凭据。**\n\n' : '')
    + (counts.total === 0 || counts.notRun || counts.skipped || counts.interrupted ? '**Coverage is incomplete; zero, skipped, unrun and interrupted cases are not passes. / 覆盖不完整，空运行、跳过、未运行和中断不计为通过。**\n\n' : '')
    + (summary.globalErrors.length ? `### Runner errors\n\n<pre>${html(summary.globalErrors.join('\n\n'))}</pre>\n\n` : '')
    + details + (failures.length > 30 ? '\n\nFurther failures are retained in summary.json.\n' : '\n')
    + '\nCounts are current-run observations. Image acceptance requires inspection of expected/actual/diff; this summary does not approve baselines or real hardware. / 数量来自本次运行；图片须另行审阅，本摘要不接受基线或证明真实硬件。\n';
}

export function verifyComparisonSummary(summary, expected) {
  if (summary.schema !== 1 || !/^[a-f0-9]{40}$/.test(expected.commit || '')
      || !/^[1-9]\d*$/.test(String(expected.runId || '')) || !/^[1-9]\d*$/.test(String(expected.attempt || ''))
      || summary.commit !== expected.commit || summary.runId !== String(expected.runId)
      || summary.attempt !== String(expected.attempt) || expected.repository && summary.repository !== expected.repository
      || summary.suite !== 'all' || expected.suite && expected.suite !== summary.suite
      || summary.baselineMode !== 'comparison' || summary.status !== 'passed')
    throw new Error('E2E report identity, suite, mode or runner result does not prove this comparison');
  const counts = summary.counts;
  const requiredProjects = ['desktop', 'mobile'];
  const observedProjects = new Set(summary.tests?.map(test => test.project));
  if (!summary.selectionComplete || summary.projects?.length !== requiredProjects.length
      || !requiredProjects.every(project => summary.projects.includes(project) && observedProjects.has(project))
      || observedProjects.size !== requiredProjects.length
      || Object.hasOwn(summary, 'commandOutcome') && summary.commandOutcome !== 'success')
    throw new Error('E2E comparison does not cover the required unfiltered desktop and mobile targets');
  if (!counts || !['total', ...OUTCOMES].every(key => Number.isInteger(counts[key]) && counts[key] >= 0)
      || counts.total === 0 || counts.passed !== counts.total || !Array.isArray(summary.globalErrors)
      || summary.globalErrors.length || OUTCOMES.filter(key => key !== 'passed').some(key => counts[key] !== 0)
      || !Array.isArray(summary.tests) || summary.tests.length !== counts.total
      || summary.tests.some(test => test.outcome !== 'passed' || !test.attempts?.length || test.attempts.at(-1).status !== 'passed'))
    throw new Error('E2E comparison is incomplete or contains non-passing cases');
  return true;
}

function annotation(value) {
  return clean(value).replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
}

function environmentMetadata(config) {
  const projects = config?.projects || [];
  const all = value => Array.isArray(value) ? value.length === 1 && all(value[0]) : value?.source === '.*' && value.flags === '';
  const none = value => value == null || Array.isArray(value) && value.length === 0;
  return {
    commit: process.env.GITHUB_SHA || null, repository: process.env.GITHUB_REPOSITORY || null,
    runId: process.env.GITHUB_RUN_ID, attempt: process.env.GITHUB_RUN_ATTEMPT,
    suite: process.env.E2E_SUITE || 'all', baselineMode: process.env.E2E_UPDATE_SNAPSHOTS === 'true' ? 'candidate' : 'comparison',
    projects: projects.map(project => project.name),
    viewports: projects.filter(project => project.use.viewport).map(project => ({ name: project.name, ...project.use.viewport })),
    selectionComplete: Boolean(config && !config.shard && all(config.grep) && none(config.grepInvert)
      && projects.every(project => all(project.grep) && none(project.grepInvert))),
  };
}

function hasConsistentObservations(summary) {
  if (!Array.isArray(summary.tests) || !Array.isArray(summary.projects) || !Array.isArray(summary.viewports)
      || !Array.isArray(summary.globalErrors) || !summary.counts
      || !['total', ...OUTCOMES].every(key => Number.isInteger(summary.counts[key]) && summary.counts[key] >= 0)
      || summary.counts.total !== summary.tests.length
      || !summary.viewports.every(item => item && typeof item === 'object')) return false;
  const observed = Object.fromEntries(OUTCOMES.map(key => [key, 0]));
  for (const test of summary.tests) {
    if (!test || !OUTCOMES.includes(test.outcome) || !Array.isArray(test.attempts)
        || !test.attempts.every(item => item && typeof item.status === 'string'
          && Array.isArray(item.errors) && item.errors.every(error => typeof error === 'string'))) return false;
    observed[test.outcome]++;
  }
  return OUTCOMES.every(key => summary.counts[key] === observed[key]);
}

export function finalizeE2ESummary(reportPath, { metadata = environmentMetadata(), commandOutcome = '', stepSummary = process.env.GITHUB_STEP_SUMMARY } = {}) {
  let summary, current = false;
  try {
    summary = JSON.parse(readFileSync(reportPath, 'utf8'));
    current = summary.schema === 1 && summary.commit === metadata.commit && summary.runId === String(metadata.runId || '')
      && summary.repository === metadata.repository && summary.attempt === String(metadata.attempt || '')
      && summary.suite === metadata.suite && summary.baselineMode === metadata.baselineMode && hasConsistentObservations(summary);
  } catch { /* A missing/invalid report means no completed run evidence. */ }
  const markdownPath = resolve(dirname(reportPath), 'summary.md');
  if (!current) summary = buildE2ESummary([], { status: commandOutcome === 'cancelled' ? 'interrupted' : 'not-run', duration: 0 }, metadata,
    [{ message: `No current-run browser report was produced; command outcome: ${commandOutcome || 'unavailable'}. Tests cannot be counted as passed.` }]);
  summary.commandOutcome = commandOutcome;
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, JSON.stringify(summary, null, 2) + '\n');
  const markdown = renderE2ESummary(summary);
  writeFileSync(markdownPath, markdown);
  if (stepSummary) appendFileSync(stepSummary, markdown);
  return summary;
}

export default class E2ESummaryReporter {
  onBegin(config, suite) {
    this.suite = suite;
    this.config = config;
    this.errors = [];
    this.output = resolve('artifacts/e2e/summary.json');
    mkdirSync(dirname(this.output), { recursive: true });
    rmSync(this.output, { force: true });
    rmSync(resolve('artifacts/e2e/summary.md'), { force: true });
  }
  onError(error) { (this.errors ||= []).push(error); }
  onEnd(result) {
    const summary = buildE2ESummary(this.suite?.allTests() || [], result, environmentMetadata(this.config), this.errors || []);
    const output = this.output || resolve('artifacts/e2e/summary.json');
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, JSON.stringify(summary, null, 2) + '\n');
    const markdown = renderE2ESummary(summary);
    writeFileSync(resolve('artifacts/e2e/summary.md'), markdown);
    for (const test of summary.tests.filter(item => ['failed', 'flaky', 'interrupted'].includes(item.outcome)).slice(0, 20)) {
      const detail = test.attempts.flatMap(item => item.errors).join('\n').slice(0, 1500);
      console.log(`::error title=Browser test::${annotation(`[${test.project}] ${test.title}: ${detail || test.outcome}`)}`);
    }
    // Do not return a status override. Playwright owns the underlying exit code.
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv[2] === '--finalize-report' && process.argv[3]) {
      finalizeE2ESummary(resolve(process.argv[3]), { commandOutcome: process.env.E2E_COMMAND_OUTCOME });
    } else {
      if (process.argv[2] !== '--verify-comparison' || !process.argv[3]) throw new Error('Usage: --verify-comparison <summary.json> | --finalize-report <summary.json>');
      verifyComparisonSummary(JSON.parse(readFileSync(process.argv[3], 'utf8')), {
        commit: process.env.GITHUB_SHA, repository: process.env.GITHUB_REPOSITORY,
        runId: process.env.GITHUB_RUN_ID, attempt: process.env.GITHUB_RUN_ATTEMPT, suite: process.env.E2E_SUITE,
      });
      console.log('Current-commit full browser comparison verified / 当前提交完整浏览器比较已确认');
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
