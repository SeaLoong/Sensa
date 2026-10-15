import { test as base, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ports, startMocks } from './mocks.js';

export { expect };
export const test = base.extend({
  scenario: ['quickstart', { option: true }],
  rig: async ({ scenario }, use, info) => {
    const directory = await mkdtemp(path.join(tmpdir(), 'sensa-e2e-'));
    const mock = await startMocks();
    const presets = JSON.parse(await readFile('src/web/data/osc-presets.json', 'utf8'));
    const motion = JSON.parse(await readFile('src/web/data/first-run-motion.json', 'utf8'));
    const config = { webUi: { host: '127.0.0.1', port: ports.web, autoOpenBrowser: false }, outputs: [
      { id: 'udp', name: 'Mock UDP', type: 'TCodeUdp', host: '127.0.0.1', port: ports.udp },
      { id: 'tcp', name: 'Mock TCP', type: 'TCodeTcp', host: '127.0.0.1', port: ports.tcp },
      { id: 'serial', name: 'Mock Serial', type: 'TCodeSerial', comPort: mock.serialPort },
      { id: 'intiface', name: 'Mock Intiface', type: 'Intiface', manageEngineProcess: false, websocketAddress: `ws://127.0.0.1:${ports.intiface}` },
    ].map(o => ({ ...o, enabled: false, motionProfileId: 'test-profile' })),
    axisProfiles: [{ id: 'test-profile', name: 'CI L0 400-600', isDefault: true, motion }],
    osc: { enabled: true, receiverHost: '127.0.0.1', receiverPort: ports.osc, oscQueryEnabled: scenario === 'query', oscQueryUrl: `http://127.0.0.1:${ports.query}`, oscQueryReceiver: { enabled: false },
      hub: { enabled: scenario === 'query', mode: 'EventDriven', targets: [{ id: 'mock-hub', name: 'Mock Hub', host: '127.0.0.1', port: ports.hub, enabled: true }] } },
    signals: scenario === 'sps' ? [{ oscPath: 'OGB/Orf/Test/PenSelfNewRoot', sourceMode: 'SpsSocketDepth', role: 'Depth' }] :
      scenario === 'query' ? [{ oscPath: 'QueryDepth', role: 'Depth' }] : presets.find(p => p.id === 'sensa-quick-start').mappings };
    const configPath = path.join(directory, 'config.json'); await writeFile(configPath, JSON.stringify(config));
    const logs = [];
    const app = spawn('dotnet', [path.resolve('artifacts/e2e/app/Sensa.dll')], { cwd: directory, env: { ...process.env, SENSA_CONFIG_PATH: configPath }, stdio: ['ignore', 'pipe', 'pipe'] });
    app.stdout.on('data', b => logs.push(b.toString())); app.stderr.on('data', b => logs.push(b.toString()));
    const baseUrl = `http://127.0.0.1:${ports.web}`;
    let cookie;
    try {
      await expect.poll(async () => {
        if (app.exitCode !== null) throw new Error(logs.join(''));
        try { const response = await fetch(baseUrl + '/api/session'); cookie = response.headers.get('set-cookie')?.split(';')[0]; return response.status; } catch { return 0; }
      }, { timeout: 30000 }).toBe(204);
      expect(cookie, 'Session endpoint must issue an authentication cookie').toBeTruthy();
      const overview = async () => (await fetch(baseUrl + '/api/state/overview', { headers: { Cookie: cookie } })).json();
      await use({ ...mock, baseUrl, overview, configPath });
    } finally {
      const exited = once(app, 'exit'); app.kill('SIGTERM');
      await Promise.race([exited, new Promise(r => setTimeout(r, 3000))]); if (app.exitCode === null) app.kill('SIGKILL');
      await info.attach('service.log', { body: logs.join(''), contentType: 'text/plain' });
      await info.attach('mock-wire.json', { body: JSON.stringify(mock.wire, null, 2), contentType: 'application/json' });
      await mock.close(); await rm(directory, { recursive: true, force: true });
    }
  },
  page: async ({ page, rig }, use) => {
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(rig.baseUrl); await expect(page.getByRole('button', { name: '使用帮助', exact: true })).toBeVisible();
    await use(page); expect(errors, 'Browser JavaScript errors').toEqual([]);
  },
});

export const card = (page, name) => page.locator('.output-card').filter({ hasText: name });
export async function enable(page, names = ['Mock UDP', 'Mock TCP', 'Mock Serial', 'Mock Intiface']) {
  for (const name of names) { await card(page, name).getByRole('button', { name: '启用', exact: true }).click(); await expect(card(page, name).getByText('已连接', { exact: true })).toBeVisible(); }
}
export async function mode(page, name) {
  await page.getByRole('tab', { name, exact: true }).click();
  const apply = page.getByRole('button', { name: '应用输入方式', exact: true });
  if (await apply.isEnabled()) await apply.click();
}
export async function active(page, value = true) {
  const toggle = page.getByRole('checkbox', { name: '输入开关（关闭停止设备）', exact: true });
  if (await toggle.isChecked() !== value) await toggle.click();
  await expect(toggle).toBeChecked({ checked: value });
}
export async function checkpoint(page, locator, name) {
  await page.mouse.move(0, 0);
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  await expect(page.locator('.MuiSnackbar-root')).toHaveCount(0, { timeout: 15000 });
  await expect(locator).toHaveScreenshot(name + '.png', { stylePath: 'tests/e2e/screenshot.css' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), 'Horizontal viewport overflow').toBe(true);
}
export async function outputValue(rig, transport, expected) {
  await expect.poll(() => {
    const line = rig.wire[transport].filter(s => /L0\d/.test(s)).at(-1) || '';
    return Math.abs(Number(line.match(/L0(\d+)/)?.[1] ?? -1000) - expected);
  }).toBeLessThanOrEqual(1);
}
