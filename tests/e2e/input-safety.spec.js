import { test, expect, card, enable, mode, active, outputValue } from './fixtures.js';

const scriptFile = name => ({ name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ actions: [{ at: 0, pos: 0 }, { at: 60000, pos: 100 }] })) });

test('mode changes and script replacement require explicit input enable / 切换输入方式及替换脚本需要显式开启输入', { tag: ['@input', '@transport'] }, async ({ page, rig }) => {
  await enable(page, ['Mock UDP']); await active(page);
  await page.getByRole('slider').first().press('End');
  await page.getByRole('button', { name: '更新位置', exact: true }).click();
  await outputValue(rig, 'udp', 600);
  await mode(page, 'OSC');
  await expect.poll(async () => (await rig.overview()).runtime.inputActive).toBe(false);
  await expect.poll(() => rig.wire.udp.at(-1)).toBe('DSTOP');

  await page.getByRole('tab', { name: '脚本', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles(scriptFile('first.funscript'));
  await expect.poll(async () => (await rig.overview()).input.script.loaded).toBe(true);
  await expect.poll(async () => (await rig.overview()).runtime.inputActive).toBe(false);
  await active(page); await page.locator('.script-player-console__transport-primary').click();
  await expect.poll(async () => (await rig.overview()).input.script.playing).toBe(true);
  await page.locator('input[type=file]').setInputFiles(scriptFile('replacement.funscript'));
  await expect.poll(async () => (await rig.overview()).input.script.fileName).toBe('replacement.funscript');
  await expect.poll(async () => (await rig.overview()).runtime.inputActive).toBe(false);
  await expect.poll(() => rig.wire.udp.at(-1)).toBe('DSTOP');
  await expect(page.getByRole('checkbox', { name: '输入开关（关闭停止设备）', exact: true })).not.toBeChecked();
  await expect(card(page, 'Mock UDP').getByText('已请求停止', { exact: true })).toBeVisible();
});

test('paused scripts stop transport, while explicit stepping still inspects a target / 暂停脚本停止传输，显式步进仍可检查目标', { tag: ['@input', '@transport'] }, async ({ page, rig }) => {
  await enable(page, ['Mock UDP']); await mode(page, '脚本');
  await page.locator('input[type=file]').setInputFiles(scriptFile('inspect.funscript'));
  await expect.poll(async () => (await rig.overview()).input.script.loaded).toBe(true);
  await active(page); await page.locator('.script-player-console__transport-primary').click();
  await expect.poll(async () => (await rig.overview()).input.script.playing).toBe(true);
  await page.locator('.script-player-console__transport-primary').click();
  await expect.poll(() => rig.wire.udp.at(-1)).toBe('DSTOP');
  await expect.poll(async () => (await rig.overview()).runtime.inputActive).toBe(true);
  await page.getByRole('button', { name: /^下一动作/ }).click();
  await outputValue(rig, 'udp', 600);
  await page.getByRole('button', { name: '卸载', exact: true }).click();
  await expect.poll(() => rig.wire.udp.at(-1)).toBe('DSTOP');
});
