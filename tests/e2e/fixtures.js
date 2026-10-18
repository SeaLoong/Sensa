import { test as base, expect } from '@playwright/test';
import { startMocks } from './mocks.js';
import { startTestRig } from './rig.js';

export { expect };
export const test = base.extend({
  scenario: ['quickstart', { option: true }],
  // Reuse loopback peers; every test still gets a fresh process and config.
  // 复用回环模拟端，但每个测试仍使用独立进程与配置，避免状态串扰。
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
      catch { /* Ignore non-command frames / 忽略非命令帧。 */ }
    }));
    await page.goto(rig.baseUrl);
    await expect(page.getByRole('button', { name: locale?.startsWith('en') ? 'Help' : '使用帮助', exact: true })).toBeVisible();
    try { await use(page); } finally { expect(errors, 'Browser JavaScript errors / 浏览器 JavaScript 错误').toEqual([]); }
  },
});

export const card = (page, name) => page.locator('.output-card').filter({ hasText: name });
export async function enable(page, names = ['Mock UDP', 'Mock TCP', 'Mock Serial', 'Mock Intiface']) {
  for (const name of names) { await card(page, name).getByRole('button', { name: '启用', exact: true }).click(); await expect(card(page, name).getByText('已连接', { exact: true })).toBeVisible(); }
}
async function authenticatedOverview(page) {
  const response = await page.request.get(new URL('/api/state/overview', page.url()).href);
  return response.ok() ? response.json() : null;
}
export async function waitForInputMode(page, expectedMode) {
  await expect.poll(async () => {
    const overview = await authenticatedOverview(page);
    return overview?.input?.mode === expectedMode && (expectedMode !== 'osc' || overview.osc?.listening === true);
  }, { message: 'Input mode and receiver ready / 输入方式及接收器已就绪' }).toBe(true);
}
export async function mode(page, name) {
  await page.getByRole('tab', { name, exact: true }).click();
  const apply = page.getByRole('button', { name: '应用输入方式', exact: true });
  const expectedMode = ({ '手动': 'manual', '脚本': 'script', Manual: 'manual', Script: 'script', OSC: 'osc' })[name] || name.toLowerCase();
  const readMode = async () => (await authenticatedOverview(page))?.input?.mode || null;
  let currentMode;
  await expect.poll(async () => { currentMode = await readMode(); return currentMode; }, { message: 'Authenticated overview ready / 认证后的状态接口就绪' }).not.toBeNull();
  if (currentMode !== expectedMode) { await expect(apply).toBeEnabled(); await apply.click(); }
  await waitForInputMode(page, expectedMode);
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
  const box = await locator.boundingBox(), viewport = page.viewportSize();
  if (!box) throw new Error(`Checkpoint is not visible: ${name}`);
  expect(box.width, `Checkpoint must fit the viewport, not be clipped by an ancestor: ${name}`).toBeLessThanOrEqual(viewport.width);
  if (box.height > viewport.height) {
    // Sensa scrolls the body inside a height-limited html element. Capturing an
    // oversized locator would include clipped blank areas, not what users see.
    const stride = viewport.height - 100;
    for (let offset = 0, part = 1; offset < box.height; offset += stride, part++) {
      await locator.evaluate((element, y) => {
        document.body.scrollTo({ top: document.body.scrollTop + element.getBoundingClientRect().top + y - 64, behavior: 'instant' });
      }, offset);
      await expect(page).toHaveScreenshot(`${name}-part-${part}.png`, { stylePath: 'tests/e2e/screenshot.css' });
    }
  } else await expect(locator).toHaveScreenshot(name + '.png', { stylePath: 'tests/e2e/screenshot.css' });
  expect(await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) <= document.documentElement.clientWidth), 'Horizontal viewport overflow').toBe(true);
}
export async function outputValue(rig, transport, expected) {
  await expect.poll(() => {
    const line = rig.wire[transport].filter(s => /L0\d/.test(s)).at(-1) || '';
    return Math.abs(Number(line.match(/L0(\d+)/)?.[1] ?? -1000) - expected);
  }).toBeLessThanOrEqual(1);
}
