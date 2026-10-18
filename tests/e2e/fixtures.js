import { test as base, expect } from '@playwright/test';
import english from '../../src/web/i18n.en.json' with { type: 'json' };
import { startMocks } from './mocks.js';
import { startTestRig } from './rig.js';

export { expect };
export const test = base.extend({
  scenario: ['quickstart', { option: true }],
  // Peers are reusable; every scenario owns its process, config and feeds.
  // 模拟端可复用；场景独占进程、配置和持续输入。
  mockPeers: [async ({}, use) => {
    const peers = await startMocks();
    try { await use(peers); } finally { await peers.close(); }
  }, { scope: 'worker' }],
  rig: async ({ scenario, mockPeers }, use, info) => {
    const rig = await startTestRig(mockPeers, scenario, expect);
    try { await use(rig); } finally { await rig.close(info); }
  },
  page: async ({ page, rig, locale }, use) => {
    const errors = [];
    rig.commands = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('websocket', socket => socket.on('framesent', ({ payload }) => {
      try { const command = JSON.parse(payload.toString()); if (command.method && command.path) rig.commands.push(command); }
      catch { /* Non-command frame / 非命令帧。 */ }
    }));
    await page.goto(rig.baseUrl);
    await expect(page.getByRole('button', { name: locale?.startsWith('en') ? 'Help' : '帮助', exact: true })).toBeVisible();
    await expect.poll(async () => (await rig.overview()).runtime.inputActive).toBe(false);
    try { await use(page); } finally { expect(errors, 'Browser JavaScript errors / 浏览器 JavaScript 错误').toEqual([]); }
  },
});
export async function text(page, zh) {
  return (await page.locator('html').getAttribute('lang'))?.startsWith('en') ? english[zh] || zh : zh;
}
export const card = (page, name) => page.locator('.output-card').filter({ has: page.getByRole('heading', { name, exact: true }) });
export async function workspace(page, name) {
  await page.getByRole('tablist', { name: await text(page, '主导航'), exact: true }).getByRole('tab', { name: await text(page, name), exact: true }).click();
}
export async function oscWorkspace(page, name) {
  await workspace(page, 'OSC');
  await page.getByRole('tablist', { name: await text(page, 'OSC 工作区'), exact: true }).getByRole('tab', { name: await text(page, name), exact: true }).click();
}
export async function expand(page, label) {
  const summary = page.locator('summary').filter({ hasText: label });
  const details = summary.locator('..');
  if (await details.getAttribute('open') === null) await summary.click();
  return details;
}
export async function enable(page, names = ['Mock UDP', 'Mock TCP', 'Mock Serial', 'Mock Intiface']) {
  await workspace(page, '控制');
  for (const name of names) {
    await card(page, name).getByRole('button', { name: await text(page, '启用'), exact: true }).click();
    await expect(card(page, name).getByText(await text(page, '已连接'), { exact: true })).toBeVisible();
  }
}
export async function waitForInputMode(page, expectedMode) {
  await expect.poll(async () => {
    const overview = await page.request.get(new URL('/api/state/overview', page.url()).href).then(response => response.ok() ? response.json() : null);
    return overview?.input?.mode === expectedMode && (expectedMode !== 'osc' || overview.osc?.listening === true);
  }, { message: 'Input mode and receiver ready / 输入方式及接收器已就绪' }).toBe(true);
}
export async function mode(page, name) {
  await workspace(page, '控制');
  await page.getByRole('tablist', { name: await text(page, '输入方式'), exact: true }).getByRole('tab', { name: await text(page, name), exact: true }).click();
  const expectedMode = ({ '手动': 'manual', '脚本': 'script', Manual: 'manual', Script: 'script', OSC: 'osc' })[name] || name.toLowerCase();
  const current = await page.request.get(new URL('/api/state/overview', page.url()).href).then(response => response.json());
  if (current?.input?.mode !== expectedMode) await page.getByRole('button', { name: await text(page, '应用输入方式'), exact: true }).click();
  await waitForInputMode(page, expectedMode);
}
export async function active(page, value = true) {
  const toggle = page.getByRole('switch', { name: await text(page, '输入启用'), exact: true });
  if (await toggle.isChecked() !== value) await toggle.click();
  await expect(toggle).toBeChecked({ checked: value });
}
export async function allowSpatial(page, value = true) {
  await oscWorkspace(page, '实验诊断');
  await page.getByRole('checkbox', { name: await text(page, '允许实验空间输入'), exact: true }).setChecked(value);
  await page.getByRole('button', { name: await text(page, '保存实验设置'), exact: true }).click();
  await expect.poll(async () => page.request.get(new URL('/api/config', page.url()).href).then(response => response.json()).then(config => config.osc.allowExperimentalSpatialInput)).toBe(value);
  await expect(page.getByRole('switch', { name: await text(page, '输入启用'), exact: true })).not.toBeChecked();
}
async function clearScreenshotNotice(page) {
  await page.mouse.move(0, 0);
  const toast = page.locator('.toast');
  await expect(page.locator('.toast[role=alert]'), 'Unexpected UI error / 非预期界面错误').toHaveCount(0);
  if (await toast.isVisible()) await toast.getByRole('button').click();
  await expect(toast).toHaveCount(0);
}
export async function checkpointViewport(page, name) {
  await clearScreenshotNotice(page);
  await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: 'instant' }));
  await expect(page).toHaveScreenshot(name + '.png', { stylePath: 'tests/e2e/screenshot.css' });
  expect(await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) <= document.documentElement.clientWidth), 'Horizontal viewport overflow / 页面横向溢出').toBe(true);
}
export async function checkpoint(page, locator, name) {
  await clearScreenshotNotice(page);
  const box = await locator.boundingBox(), viewport = page.viewportSize();
  if (!box) throw new Error('Checkpoint is not visible / 截图目标不可见: ' + name);
  expect(box.width, 'Checkpoint fits viewport / 截图目标不溢出: ' + name).toBeLessThanOrEqual(viewport.width);
  await expect(locator).toHaveScreenshot(name + '.png', { stylePath: 'tests/e2e/screenshot.css' });
  expect(await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) <= document.documentElement.clientWidth), 'Horizontal viewport overflow / 页面横向溢出').toBe(true);
}
export async function outputValue(rig, transport, expected) {
  await expect.poll(() => {
    const line = rig.wire[transport].filter(s => /L0\d/.test(s)).at(-1) || '';
    return Math.abs(Number(line.match(/L0(\d+)/)?.[1] ?? -1000) - expected);
  }).toBeLessThanOrEqual(1);
}
