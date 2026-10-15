import { test, expect, card, enable, mode, active, checkpoint, outputValue } from './fixtures.js';
import { pointSamples, poseSamples } from './mocks.js';
import { readFile } from 'node:fs/promises';

test('manual controls reach all mock transports, record, stop and never auto-resume', async ({ page, rig }) => {
  await enable(page);
  await checkpoint(page, page.locator('.section-card').first(), 'manual-ready');
  await active(page);
  await page.getByRole('button', { name: '录制 L0', exact: true }).click();
  await page.getByRole('slider').first().press('End');
  await page.getByRole('button', { name: '更新位置', exact: true }).click();
  for (const transport of ['udp', 'tcp', 'serial']) await outputValue(rig, transport, 600);
  await expect.poll(() => rig.wire.intiface.some(m => m.OutputCmd?.Command?.HwPositionWithDuration)).toBe(true);
  await expect.poll(() => rig.wire.intiface.some(m => m.OutputCmd?.Command?.Vibrate?.Value === 0)).toBe(true);
  await checkpoint(page, card(page, 'Mock UDP').locator('.output-position-panel'), 'manual-output');
  await page.getByRole('slider').first().press('Home');
  await page.getByRole('button', { name: '更新位置', exact: true }).click();
  await outputValue(rig, 'udp', 400);
  await page.getByRole('button', { name: '停止录制', exact: true }).click();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: /导出录制/ }).click();
  const script = JSON.parse(await readFile(await (await downloaded).path(), 'utf8'));
  expect(script.actions.length).toBeGreaterThanOrEqual(2);
  await page.getByRole('button', { name: '停止输出', exact: true }).click();
  for (const transport of ['udp', 'tcp', 'serial']) await expect.poll(() => rig.wire[transport].at(-1)).toBe('DSTOP');
  await expect.poll(() => rig.wire.intiface.at(-1)?.StopAllDevices !== undefined).toBe(true);
  await checkpoint(page, card(page, 'Mock UDP').locator('.output-position-panel'), 'emergency-output');
  const count = rig.wire.udp.length;
  await page.getByRole('button', { name: '恢复输出', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: '输入开关（关闭停止设备）', exact: true })).not.toBeChecked();
  expect((await rig.overview()).runtime.inputActive).toBe(false);
  expect(rig.wire.udp.length).toBe(count);
});

test('QuickStart OSC steps, FT filtering, preview and gate stop', async ({ page, rig }) => {
  await enable(page, ['Mock UDP', 'Mock TCP']); await mode(page, 'OSC'); await active(page);
  await rig.send(Array.from({ length: 60 }, (_, i) => [`Face/v2/JawOpen${i}`, .7]));
  for (const [depth, target] of [[0, 400], [.25, 450], [.5, 500], [.75, 550], [1, 600]]) {
    await rig.send([['Sensa/QuickStart/Depth', depth], ['Sensa/QuickStart/Active', 1]]);
    await outputValue(rig, 'udp', target); await outputValue(rig, 'tcp', target);
  }
  await expect(page.getByRole('button', { name: 'Sensa/QuickStart/Depth', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Face/v2/JawOpen0', exact: true })).toHaveCount(0);
  await page.getByRole('checkbox', { name: '显示 FT', exact: true }).check();
  await expect(page.getByRole('button', { name: 'Face/v2/JawOpen0', exact: true })).toBeVisible();
  await page.getByRole('checkbox', { name: '显示 FT', exact: true }).uncheck();
  await checkpoint(page, page.locator('table').filter({ has: page.getByRole('button', { name: 'Sensa/QuickStart/Depth', exact: true }) }), 'osc-parameters');
  await rig.send([['Sensa/QuickStart/Active', 0]]);
  await expect.poll(() => rig.wire.udp.at(-1)).toBe('DSTOP');
  await checkpoint(page, page.getByLabel('Avatar 世界 软件联动检查'), 'quickstart-stopped');
});

test('PB two-point calibration replaces the old gate and persists on reload', async ({ page, rig }) => {
  await enable(page, ['Mock UDP']); await mode(page, 'OSC');
  await rig.send(pointSamples(.05)); await page.getByRole('tab', { name: '量程校准', exact: true }).click();
  await expect(page.getByText('当前 Z：5.0 cm', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '采集 0%', exact: true }).click();
  await rig.send(pointSamples(.15)); await expect(page.getByText('当前 Z：15.0 cm', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '采集 100%', exact: true }).click();
  await checkpoint(page, page.locator('.point-calibration'), 'pb-calibration');
  await page.getByRole('button', { name: '替换为校准映射', exact: true }).click();
  await expect(page.getByRole('button', { name: '移除', exact: true })).toHaveCount(5); // one mapping + four mock output cards
  await page.getByRole('button', { name: /保存并应用映射/ }).click();
  await expect(page.getByRole('checkbox', { name: '输入开关（关闭停止设备）', exact: true })).not.toBeChecked();
  await expect.poll(async () => (await rig.overview()).signals.length).toBe(1);
  expect((await rig.overview()).signals[0].signal.oscPath).toBe('Sensa/Handle/v1/LabHandle/Self/**');
  await page.reload(); await expect(page.getByRole('button', { name: '使用帮助', exact: true })).toBeVisible();
  await active(page); await rig.send(pointSamples(.1)); await outputValue(rig, 'udp', 500);
  await checkpoint(page, card(page, 'Mock UDP').locator('.output-position-panel'), 'pb-midpoint');
  await rig.send(pointSamples(.1, false)); await expect.poll(() => rig.wire.udp.at(-1)).toBe('DSTOP');
});

test.describe('native SPS', () => {
  test.use({ scenario: 'sps' });
  test('root/tip learning and offset produce radial output', async ({ page, rig }) => {
    await enable(page, ['Mock UDP']); await mode(page, 'OSC'); await active(page);
    const root = 'OGB/Orf/Test/PenSelfNewRoot', tip = 'OGB/Orf/Test/PenSelfNewTip';
    await rig.send([[root, .77], [tip, .96]]); await outputValue(rig, 'udp', 400);
    await rig.send([[root, .89], [tip, 1]]); await outputValue(rig, 'udp', 480);
    await checkpoint(page, card(page, 'Mock UDP').locator('.output-position-panel'), 'sps-depth');
    await rig.send([[root, 1 - Math.hypot(.12, .06) + .01]]); await outputValue(rig, 'udp', 466);
    await active(page, false);
  });
});

test('funscript import, playback, pause, stepping and unload', async ({ page, rig }) => {
  await enable(page, ['Mock UDP']); await mode(page, '脚本');
  await page.locator('input[type=file]').setInputFiles({ name: 'ci-motion.funscript', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ actions: [{ at: 0, pos: 0 }, { at: 5000, pos: 100 }, { at: 10000, pos: 0 }] })) });
  await expect.poll(async () => (await rig.overview()).input.script.loaded).toBe(true);
  await page.getByRole('checkbox', { name: '循环播放', exact: true }).check();
  await expect.poll(async () => (await rig.overview()).input.script.loop).toBe(true);
  await active(page); await page.locator('.script-player-console__transport-primary').click();
  await expect.poll(async () => (await rig.overview()).input.script.playing).toBe(true);
  await expect.poll(() => rig.wire.udp.some(s => /L0\d/.test(s))).toBe(true);
  await page.locator('.script-player-console__transport-primary').click();
  await expect.poll(async () => (await rig.overview()).input.script.playing).toBe(false);
  await page.getByRole('button', { name: /^下一动作/ }).click(); await outputValue(rig, 'udp', 600);
  await checkpoint(page, page.locator('.script-player-console'), 'script-paused-keyframe');
  await page.getByRole('button', { name: '卸载', exact: true }).click();
  await expect.poll(async () => (await rig.overview()).input.script.loaded).toBe(false);
});

test('help, output editing and profile dialog render without overflow', async ({ page }) => {
  await page.getByRole('button', { name: '使用帮助', exact: true }).click();
  await checkpoint(page, page.getByRole('dialog'), 'help-workflow');
  await page.getByRole('tab', { name: '预设选择', exact: true }).click();
  await page.getByRole('textbox', { name: '搜索预设', exact: true }).fill('PB');
  await checkpoint(page, page.getByRole('dialog'), 'help-presets');
  await page.getByRole('button', { name: '关闭帮助', exact: true }).click();
  await card(page, 'Mock UDP').getByRole('button', { name: '配置', exact: true }).click();
  await checkpoint(page, page.getByRole('dialog'), 'udp-settings');
  await page.getByRole('dialog').getByRole('textbox').first().fill('Mock UDP edited');
  await page.getByRole('dialog').getByRole('button', { name: '保存', exact: true }).click();
  await expect(card(page, 'Mock UDP edited')).toBeVisible();
  await page.getByRole('button', { name: /\+ TCode UDP/i }).click();
  await page.getByRole('dialog').getByRole('spinbutton').fill('19999');
  await expect(page.getByRole('dialog').getByRole('button', { name: '保存', exact: true })).toBeDisabled();
  await checkpoint(page, page.getByRole('dialog'), 'output-conflict');
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await page.getByRole('button', { name: '修改配置', exact: true }).click();
  await page.getByRole('textbox', { name: '配置名称', exact: true }).fill('CI edited profile');
  await checkpoint(page, page.getByRole('dialog'), 'profile-settings');
  await page.getByRole('dialog').getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByText('CI edited profile', { exact: true }).first()).toBeVisible();
});

test('paired pose reconstruction, mapping and lost landmark stop', async ({ page, rig }) => {
  await enable(page, ['Mock UDP']); await mode(page, 'OSC'); await rig.send(poseSamples());
  await page.getByRole('tab', { name: '空间诊断', exact: true }).click();
  await expect(page.getByRole('button', { name: '替换为此对象深度', exact: true })).toBeVisible();
  await checkpoint(page, page.locator('.pose-dashboard'), 'paired-pose');
  await page.getByRole('button', { name: '替换为此对象深度', exact: true }).click();
  await page.getByRole('button', { name: /保存并应用映射/ }).click();
  await expect.poll(async () => (await rig.overview()).signals.length).toBe(1);
  await active(page); await outputValue(rig, 'udp', 500);
  await rig.send([['Sensa/Pose/v1/Demo/Others/Tip/A0', 0]]);
  await expect.poll(() => rig.wire.udp.at(-1)).toBe('DSTOP');
  await checkpoint(page, page.getByLabel('Avatar 世界 软件联动检查'), 'pose-landmark-lost');
});

test.describe('OSCQuery and Hub', () => {
  test.use({ scenario: 'query' });
  test('discovery and forwarding use real loopback peers', async ({ page, rig }) => {
    await mode(page, 'OSC');
    await page.getByRole('tab', { name: 'OSCQuery', exact: true }).click();
    const polling = page.getByRole('checkbox', { name: /轮询回退|当对端不支持 LISTEN/ });
    await polling.check();
    await page.locator('.osc-settings-panel').getByRole('button', { name: '保存', exact: true }).click();
    await expect(page.getByRole('button', { name: 'QueryDepth', exact: true })).toBeVisible({ timeout: 20000 });
    await expect.poll(() => rig.wire.hub.length).toBeGreaterThan(0);
    await polling.uncheck();
    await page.locator('.osc-settings-panel').getByRole('button', { name: '保存', exact: true }).click();
    await page.getByRole('tab', { name: 'Hub', exact: true }).click();
    await checkpoint(page, page.locator('.osc-settings-panel'), 'osc-hub');
  });
});

test('API session boundary and disabled input cannot command mocks', async ({ page, rig }) => {
  expect((await fetch(rig.baseUrl + '/api/config')).status).toBe(401);
  const session = await fetch(rig.baseUrl + '/api/session');
  expect((await fetch(rig.baseUrl + '/api/config', { headers: { Cookie: session.headers.get('set-cookie').split(';')[0], Origin: 'http://untrusted.invalid' } })).status).toBe(403);
  await enable(page, ['Mock UDP']);
  const before = rig.wire.udp.filter(s => /L0\d/.test(s)).length;
  await page.getByRole('slider').first().press('End'); await page.getByRole('button', { name: '更新位置', exact: true }).click();
  expect((await rig.overview()).runtime.inputActive).toBe(false);
  expect(rig.wire.udp.filter(s => /L0\d/.test(s)).length).toBe(before);
  await checkpoint(page, card(page, 'Mock UDP').locator('.output-position-panel'), 'disabled-input');
});
