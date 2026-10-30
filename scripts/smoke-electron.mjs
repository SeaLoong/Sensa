/** Exercise an actual packaged window and its owned SEA service in Actions. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { execFileSync, spawn } from 'node:child_process';
import { parseArgs } from 'node:util';
import { chromium } from '@playwright/test';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(callback, timeout = 30000) {
  const deadline = Date.now() + timeout; let last;
  while (Date.now() < deadline) {
    try { const value = await callback(); if (value) return value; } catch (error) { last = error; }
    await delay(100);
  }
  throw last ?? new Error('Desktop smoke timed out.');
}
async function freePort() {
  const server = createServer(); await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address(); const port = typeof address === 'object' && address ? address.port : 0;
  await new Promise(resolve => server.close(resolve)); assert.ok(port > 0); return port;
}
async function exited(child, timeout = 10000) { return until(() => child.exitCode !== null || child.signalCode !== null, timeout); }
export function isolatedDesktopConfig() {
  return { webUi: { host: '127.0.0.1', port: 0, locale: 'en-US' }, osc: { enabled: false, oscQueryEnabled: false },
    protocolInputs: [], outputs: [], signals: [], computedSignals: [] };
}
export async function captureInitialWorkbench(page, path) {
  // The connecting shell already fills #app-root and the service may be ready
  // before React has rendered its first interactive workbench.
  await page.locator('.app-shell').waitFor({ state: 'visible' });
  await page.locator('.manual-workspace').waitFor({ state: 'visible' });
  const activation = page.getByRole('switch', { name: /^(?:Input enabled|输入启用)$/ });
  const sendOnce = page.getByRole('button', { name: /^(?:Send once|发送一次)$/ });
  await activation.waitFor({ state: 'visible' });
  await sendOnce.waitFor({ state: 'visible' });
  await until(async () => await activation.isEnabled() && await sendOnce.isEnabled());
  assert.equal(await activation.isChecked(), false, 'The initial input switch must be disarmed.');
  const manualAxes = {};
  for (const axis of ['L0', 'L1', 'L2']) {
    const slider = page.locator('.manual-primary').getByRole('slider', { name: new RegExp('^' + axis + '\\s') });
    await slider.waitFor({ state: 'visible' });
    const value = await slider.inputValue();
    assert.equal(value, '500', 'The initial ' + axis + ' workbench value must be 500.');
    manualAxes[axis] = Number(value);
  }
  const overview = await page.evaluate(async () => {
    const response = await fetch('/api/state/overview');
    if (!response.ok) throw new Error('The desktop service snapshot is unavailable before capture.');
    return response.json();
  });
  assert.equal(overview.runtime.inputActive, false, 'The service input must remain disarmed before capture.');
  assert.equal(overview.runtime.isEmergency, false, 'Emergency stop must be clear in the initial capture.');
  assert.equal(overview.input.mode, 'manual', 'The initial workbench must use manual input mode.');
  await page.screenshot({ path });
  return { inputActive: false, isEmergency: false, inputMode: 'manual', manualAxes };
}
export async function main(argv = process.argv.slice(2)) {
  if (process.env.GITHUB_ACTIONS !== 'true') throw new Error('Desktop browser/process smoke runs only in GitHub Actions.');
  const { values } = parseArgs({ args: argv, strict: true, options: { executable: { type: 'string' }, runtime: { type: 'string' },
    'report-directory': { type: 'string' }, 'linux-sandbox-profile': { type: 'string' } } });
  if (!values.executable || !/^(win|linux|osx)-(x64|arm64)$/.test(values.runtime ?? '') || !values['report-directory']) throw new Error('Choose a desktop executable, runtime and report directory.');
  const executable = resolve(values.executable), reportDirectory = resolve(values['report-directory']);
  const temporary = await mkdtemp(join(tmpdir(), 'sensa-desktop-smoke-'));
  await mkdir(reportDirectory, { recursive: true });
  const children = [], connections = [], pageErrors = [], diagnostics = [];
  const report = { schema: 1, sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    runId: process.env.GITHUB_RUN_ID, attempt: process.env.GITHUB_RUN_ATTEMPT, runtime: values.runtime,
    actualPackagedElectron: true, hardwareUsed: false, localExecution: false, acceptance: false, checks: {}, captures: [] };
  const launch = async (configPath, debugging = true) => {
    const port = debugging ? await freePort() : undefined;
    const args = [...(port ? [`--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1'] : []), '--config', configPath, '--open-browser', 'false'];
    // Chromium and Node diagnostics may contain test URLs; keep them out of
    // public logs. Assertions/report include origin and booleans only.
    const child = spawn(executable, args, { cwd: dirname(executable), env: process.env, stdio: ['ignore', 'ignore', 'pipe'], windowsHide: false }); children.push(child);
    let diagnostic = '';
    child.stderr.on('data', bytes => { diagnostic = (diagnostic + bytes.toString()).slice(-16384); });
    child.once('exit', () => diagnostics.push(diagnostic.replace(/([?&](?:key|token|secret|password|api[_-]?key)=)[^&\s]+/gi, '$1[redacted]')));
    let launchError; child.once('error', error => { launchError = error; });
    if (!port) return { child };
    const descriptor = await until(async () => {
      if (launchError) throw new Error('Packaged desktop executable could not start.');
      if (child.exitCode !== null) throw new Error('Packaged desktop exited before exposing its renderer.');
      const response = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(1000) });
      return response.ok ? await response.json() : undefined;
    });
    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`); connections.push(browser);
    const page = await until(() => browser.contexts().flatMap(context => context.pages()).find(page => /^http:\/\/127\.0\.0\.1:\d+\//.test(page.url())));
    page.on('pageerror', error => pageErrors.push(error.message.slice(0, 200)));
    await page.waitForFunction(() => document.querySelector('#app-root')?.childElementCount > 0);
    await until(async () => await page.evaluate(async () => (await fetch('/api/state/overview')).ok));
    return { child, browser, page, descriptor };
  };
  try {
    const configPath = join(temporary, 'first', 'config.json'); await mkdir(dirname(configPath), { recursive: true });
    await writeFile(configPath, JSON.stringify(isolatedDesktopConfig()));
    const first = await launch(configPath), page = first.page;
    if (values.runtime.startsWith('linux-')) {
      assert.match(values['linux-sandbox-profile'] ?? '', /^sensa-desktop-[a-f0-9]{64}$/);
      const label = (await readFile(`/proc/${first.child.pid}/attr/current`, 'utf8')).trim();
      assert.equal(label, values['linux-sandbox-profile'] + ' (unconfined)');
      report.linuxSandbox = { processId: first.child.pid, profileName: values['linux-sandbox-profile'], actualProcessLabel: label };
      report.checks.linuxExactAppArmorProfile = true;
    }
    const details = await page.evaluate(async () => ({ origin: location.origin, userAgent: navigator.userAgent,
      requireType: typeof window.require, processType: typeof window.process, shell: window.sensaDesktop,
      overview: await (await fetch('/api/state/overview')).json(), instance: await (await fetch('/api/instance')).json() }));
    assert.match(details.userAgent, /Electron\//); assert.equal(details.requireType, 'undefined'); assert.equal(details.processType, 'undefined');
    assert.deepEqual(details.shell, { host: 'electron', embedded: true }); assert.equal(details.overview.runtime.inputActive, false);
    report.checks.rendererIsolated = true; report.checks.sharedServiceInitiallyInactive = true;
    report.electronUserAgent = details.userAgent; report.serviceOrigin = details.origin;
    const capture = join(reportDirectory, 'desktop-main.png');
    report.workbenchCapture = await captureInitialWorkbench(page, capture);
    report.captures.push({ name: 'desktop-main', sha256: createHash('sha256').update(await readFile(capture)).digest('hex') });
    const emergency = page.getByRole('button', { name: /^(?:Emergency stop|紧急停止)$/ }).first();
    await emergency.click();
    await until(async () => await page.evaluate(async () => (await (await fetch('/api/state/overview')).json()).runtime.isEmergency === true));
    report.checks.realWindowCommandReachedOwnedService = true;
    const duplicate = await launch(configPath, false); await exited(duplicate.child);
    assert.equal(duplicate.child.exitCode, 0);
    const instanceAfter = await page.evaluate(async () => await (await fetch('/api/instance')).json());
    assert.equal(instanceAfter.processId, details.instance.processId); assert.equal(first.browser.contexts().flatMap(context => context.pages()).length, 1);
    report.checks.duplicateLaunchReusesWindowAndService = true;
    const secondConfig = join(temporary, 'second', 'config.json'); await mkdir(dirname(secondConfig), { recursive: true });
    await writeFile(secondConfig, JSON.stringify(isolatedDesktopConfig()));
    const second = await launch(secondConfig);
    const secondInstance = await second.page.evaluate(async () => await (await fetch('/api/instance')).json());
    assert.notEqual(secondInstance.processId, details.instance.processId); assert.notEqual(new URL(second.page.url()).port, new URL(page.url()).port);
    const secondary = await second.page.evaluate(async () => (await (await fetch('/api/state/overview')).json()).runtime);
    assert.equal(secondary.inputActive, false); assert.equal(secondary.isEmergency, false);
    report.checks.independentProfilesHaveIndependentPortsAndState = true;
    const secondOrigin = new URL(second.page.url()).origin;
    await second.page.close(); await exited(second.child);
    await until(async () => { try { await fetch(secondOrigin + '/api/session', { signal: AbortSignal.timeout(300) }); return false; } catch { return true; } });
    const remaining = await page.evaluate(async () => (await (await fetch('/api/state/overview')).json()).runtime.isEmergency);
    assert.equal(remaining, true); report.checks.closingOneProfileLeavesOtherStateIntact = true;
    await page.close(); await exited(first.child);
    await until(async () => { try { await fetch(details.origin + '/api/session', { signal: AbortSignal.timeout(300) }); return false; } catch { return true; } });
    report.checks.windowCloseStopsOwnedService = true;
    assert.deepEqual(pageErrors, []); report.checks.uncaughtRendererErrors = 0;
    report.acceptance = true;
  } finally {
    for (const browser of connections) { try { await browser.close(); } catch { /* It may already have exited. */ } }
    for (const child of children) if (child.exitCode === null && child.signalCode === null) {
      child.kill(); try { await exited(child, 5000); } catch { child.kill('SIGKILL'); await exited(child, 5000); }
    }
    report.pageErrorCount = pageErrors.length;
    if (!report.acceptance) await writeFile(join(reportDirectory, 'desktop-diagnostics.txt'), diagnostics.join('\n').slice(-32768));
    await writeFile(join(reportDirectory, 'desktop-smoke.json'), JSON.stringify(report, null, 2) + '\n');
    await rm(temporary, { recursive: true, force: true });
  }
  console.log('Packaged Electron window, shared Node service, instances and cleanup verified: ' + values.runtime);
  return report;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
