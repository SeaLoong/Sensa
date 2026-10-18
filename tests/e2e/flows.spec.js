import { test, expect, text, card, enable, mode, active, workspace, oscWorkspace, expand, allowSpatial, checkpoint, checkpointViewport, outputValue } from './fixtures.js';
import { pointSamples, poseSamples } from './mocks.js';
import { assertCalibrationAlignment } from './ui-quality.js';
import { readFile } from 'node:fs/promises';

test('manual controls reach every transport, record, stop and never auto-resume', { tag: ['@transport','@input','@visual'] }, async ({ page, rig }) => {
  await enable(page);
  expect(rig.wire.serial).toEqual(expect.arrayContaining(['D0', 'D1', 'D2']));
  await checkpointViewport(page, 'control-page');
  await checkpoint(page, page.locator('.manual-workspace'), 'manual-ready');
  await active(page);
  await expand(page, '录制 L0 目标');
  await page.getByRole('button', { name: '开始录制', exact: true }).click();
  await page.getByRole('slider', { name: 'L0 主轴', exact: true }).press('End');
  await page.getByRole('button', { name: '发送一次', exact: true }).click();
  for (const transport of ['udp','tcp','serial']) await outputValue(rig, transport, 600);
  await expect.poll(() => rig.wire.intiface.some(m => m.OutputCmd?.Command?.HwPositionWithDuration)).toBe(true);
  await expect.poll(() => rig.wire.intiface.some(m => m.OutputCmd?.Command?.Vibrate?.Value === 0)).toBe(true);
  await checkpoint(page, card(page, 'Mock UDP').locator('.output-position-panel'), 'manual-output');
  await page.getByRole('spinbutton', { name: 'L0 主轴数值', exact: true }).fill('500');
  await page.getByRole('button', { name: '发送一次', exact: true }).click();
  await outputValue(rig, 'udp', 500);
  await page.getByRole('slider', { name: 'L0 主轴', exact: true }).press('Home');
  await page.getByRole('button', { name: '发送一次', exact: true }).click(); await outputValue(rig, 'udp', 400);
  await page.getByRole('button', { name: '停止录制', exact: true }).click();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出录制', exact: true }).click();
  const script = JSON.parse(await readFile(await (await downloaded).path(), 'utf8'));
  await test.info().attach('recorded.funscript', { body: JSON.stringify(script, null, 2), contentType: 'application/json' });
  expect(script.actions.length).toBeGreaterThanOrEqual(2);
  const recordedFrames = (await rig.overview()).recording.frameCount;
  await page.getByRole('button', { name: '重新录制', exact: true }).click();
  const rerecord = page.getByRole('dialog', { name: '重新录制', exact: true });
  await expect(rerecord).toBeVisible();
  await rerecord.getByRole('button', { name: '取消', exact: true }).click();
  expect((await rig.overview()).recording).toMatchObject({ isActive: false, frameCount: recordedFrames });
  await page.getByRole('button', { name: '重新录制', exact: true }).click();
  await rerecord.getByRole('button', { name: '重新录制', exact: true }).click();
  await expect(rerecord).not.toBeVisible();
  await expect.poll(async () => (await rig.overview()).recording).toMatchObject({ isActive: true, frameCount: 0 });
  await page.getByRole('spinbutton', { name: 'L0 主轴数值', exact: true }).fill('500');
  await page.getByRole('button', { name: '发送一次', exact: true }).click();
  await outputValue(rig, 'udp', 500);
  await expect.poll(async () => (await rig.overview()).recording.frameCount).toBeGreaterThan(0);
  const activeDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: '停止录制并导出', exact: true }).click();
  const activeScript = JSON.parse(await readFile(await (await activeDownload).path(), 'utf8'));
  expect(activeScript.actions.length).toBeGreaterThan(0);
  await expect.poll(async () => (await rig.overview()).recording.isActive).toBe(false);

  const continuous = page.getByRole('checkbox', { name: '连续发送', exact: true });
  await continuous.check();
  const manualStopCount = rig.intifaceState.stopCount;
  await page.getByRole('button', { name: '停用手动', exact: true }).click();
  await expect(continuous).not.toBeChecked();
  await expect(page.getByRole('switch', { name: '输入启用', exact: true })).not.toBeChecked();
  await expect.poll(async () => (await rig.overview()).runtime.inputActive).toBe(false);
  for (const transport of ['udp', 'tcp', 'serial']) await expect.poll(() => rig.wire[transport].at(-1)).toBe('DSTOP');
  await expect.poll(() => rig.intifaceState.stopCount).toBeGreaterThan(manualStopCount);
  const stoppedAt = Date.now(), motionCount = rig.wire.udp.filter(line => /L0\d/.test(line)).length;
  const manualRequests = rig.commands.filter(command => command.method === 'PUT' && command.path === '/api/input/manual').length;
  await page.getByRole('spinbutton', { name: 'L0 主轴数值', exact: true }).fill('650');
  // Observe beyond the actual one-second UDP refresh interval after revoking manual input.
  // 撤销手动输入后覆盖真实的一秒 UDP 刷新周期，确认编辑和旧目标都不会续发。
  await expect.poll(() => Date.now() - stoppedAt, { intervals: [100, 250, 500], timeout: 5000 }).toBeGreaterThan(1250);
  expect(rig.wire.udp.filter(line => /L0\d/.test(line))).toHaveLength(motionCount);
  expect(rig.commands.filter(command => command.method === 'PUT' && command.path === '/api/input/manual')).toHaveLength(manualRequests);
  expect((await rig.overview()).runtime.inputActive).toBe(false);
  await active(page);
  await expect(page.locator('.control-readiness').getByText(await text(page, '等待手动目标'), { exact: true })).toBeVisible();
  const reactivatedAt = Date.now();
  await expect.poll(() => Date.now() - reactivatedAt, { intervals: [100, 250, 500], timeout: 5000 }).toBeGreaterThan(1250);
  expect(rig.wire.udp.filter(line => /L0\d/.test(line))).toHaveLength(motionCount);
  expect((await rig.overview()).runtime).toMatchObject({ inputActive: true, manualOverrideEnabled: false });
  await active(page, false);
  const stopCount = rig.intifaceState.stopCount;
  await page.getByRole('button', { name: '紧急停止', exact: true }).click();
  for (const transport of ['udp','tcp','serial']) await expect.poll(() => rig.wire[transport].at(-1)).toBe('DSTOP');
  await expect.poll(() => rig.intifaceState.stopCount).toBeGreaterThan(stopCount);
  const stop = rig.wire.intiface.at(-1)?.StopCmd;
  expect(stop?.Id).toEqual(expect.any(Number));
  expect(stop.DeviceIndex).toBeUndefined(); expect(stop.FeatureIndex).toBeUndefined(); expect(stop.Outputs).not.toBe(false);
  expect(rig.intifaceState.stopped).toBe(true);
  await expect(card(page, 'Mock Intiface').getByText('已请求停止', { exact: true })).toBeVisible();
  await checkpoint(page, card(page, 'Mock UDP').locator('.output-position-panel'), 'emergency-output');
  const count = rig.wire.udp.length;
  await page.getByRole('button', { name: '解除急停', exact: true }).click();
  await expect(page.getByRole('switch', { name: '输入启用', exact: true })).not.toBeChecked();
  expect((await rig.overview()).runtime.inputActive).toBe(false);
  expect(rig.wire.udp.length).toBe(count); expect(rig.intifaceState.stopped).toBe(true);
});

test('QuickStart steps, literal FT prefix filtering, parameter preview and gate stop', { tag: ['@osc','@transport','@visual'] }, async ({ page, rig }) => {
  await enable(page, ['Mock UDP','Mock TCP']); await mode(page, 'OSC'); await active(page);
  await rig.send([...Array.from({ length: 30 }, (_, i) => ['FT/Unlisted' + i, .7]), ...Array.from({ length: 30 }, (_, i) => ['v2/Unlisted' + i, .7]), ['Custom/Face/JawOpen', .2]]);
  for (const [depth,target] of [[0,400],[.25,450],[.5,500],[.75,550],[1,600]]) {
    await rig.send([['Sensa/QuickStart/Depth', depth],['Sensa/QuickStart/Active',1]]);
    await outputValue(rig, 'udp', target); await outputValue(rig, 'tcp', target);
  }
  await oscWorkspace(page, '参数');
  await expect(page.getByRole('button', { name: 'Sensa/QuickStart/Depth', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Custom/Face/JawOpen', exact: true })).toBeVisible();
  for (const path of ['FT/Unlisted0','v2/Unlisted0']) await expect(page.getByRole('button', { name: path, exact: true })).toHaveCount(0);
  await page.getByRole('checkbox', { name: '显示 FT 参数', exact: true }).check();
  for (const path of ['FT/Unlisted0','v2/Unlisted0']) await expect(page.getByRole('button', { name: path, exact: true })).toBeVisible();
  await page.getByRole('checkbox', { name: '显示 FT 参数', exact: true }).uncheck();
  await checkpoint(page, page.locator('.table-scroll'), 'osc-parameters');
  await rig.send([['Sensa/QuickStart/Active',0]]);
  await expect.poll(() => rig.wire.udp.at(-1)).toBe('DSTOP');
  await workspace(page, '控制'); await checkpoint(page, page.locator('main .section').first(), 'quickstart-stopped');
});

test('PB calibration replaces the previous gate, opts in explicitly and persists', { tag: ['@osc','@config','@visual'] }, async ({ page, rig }) => {
  await enable(page, ['Mock UDP']); await mode(page, 'OSC');
  const feed = await rig.startFeed(pointSamples(.05));
  await allowSpatial(page);
  await expand(page, '本地点与根部'); await expand(page, '两点量程校准');
  await expect.poll(async () => (await rig.overview()).poseTracking.spsRoots.some(p => p.valid && Math.abs(p.position.z-.05)<.001)).toBe(true);
  await expect(page.locator('.point-diagnostic-grid .metrics dd').first()).toHaveText(/^2\.0 \/ -?0\.0 \/ 5\.0 cm$/);
  await expect(page.getByRole('button', { name: '采集 0%', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '采集 0%', exact: true }).click();
  await expect(page.locator('.calibration-grid output').nth(0)).toHaveText('5.0 cm');
  await feed.set(pointSamples(.15));
  await expect.poll(async () => (await rig.overview()).poseTracking.spsRoots.some(p => p.valid && Math.abs(p.position.z-.15)<.001)).toBe(true);
  await expect(page.locator('.point-diagnostic-grid .metrics dd').first()).toHaveText(/^2\.0 \/ -?0\.0 \/ 15\.0 cm$/);
  await page.getByRole('button', { name: '采集 100%', exact: true }).click();
  await expect(page.locator('.calibration-grid output').nth(1)).toHaveText('15.0 cm');
  await expect(page.getByRole('button', { name: '替换草稿', exact: true })).toBeEnabled();
  await assertCalibrationAlignment(page, test.info());
  await checkpoint(page, page.locator('.calibration-grid'), 'pb-calibration');
  await page.getByRole('button', { name: '替换草稿', exact: true }).click();
  await oscWorkspace(page, '映射');
  await expect(page.locator('.mapping-row')).toHaveCount(1);
  await page.getByRole('button', { name: '保存映射', exact: true }).click();
  await expect.poll(async () => (await rig.overview()).signals.length).toBe(1);
  expect((await rig.overview()).signals[0].signal.oscPath).toBe('Sensa/Handle/v1/LabHandle/Self/**');
  await expect(page.getByRole('switch', { name: '输入启用', exact: true })).not.toBeChecked();
  await page.reload(); await expect(page.getByRole('button', { name: '帮助', exact: true })).toBeVisible();
  await mode(page, 'OSC'); await active(page); await feed.set(pointSamples(.1)); await outputValue(rig, 'udp', 500);
  await checkpoint(page, card(page, 'Mock UDP').locator('.output-position-panel'), 'pb-midpoint');
  await feed.set(pointSamples(.1, false)); await expect.poll(() => rig.wire.udp.at(-1)).toBe('DSTOP');
});

test.describe('modern OGB SPS', () => {
  test.use({ scenario: 'sps' });
  test('modern Socket preset uses NewRoot and NewTip for radial learning', { tag: ['@osc','@transport','@visual'] }, async ({ page, rig }) => {
    await enable(page, ['Mock UDP']); await mode(page, 'OSC');
    await oscWorkspace(page, '映射');
    await page.getByLabel('预设方案', { exact: true }).selectOption('sps-socket-depth-others');
    await page.getByRole('button', { name: '替换草稿', exact: true }).click();
    await expect(page.getByText('未保存', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '保存映射', exact: true }).click();
    await expect.poll(async () => (await rig.overview()).signals[0].signal.oscPath).toBe('OGB/Orf/*/PenOthersNewRoot');
    await expect(page.getByText('未保存', { exact: true })).toHaveCount(0);
    await checkpointViewport(page, 'osc-mappings-page');
    await active(page);
    const root = 'OGB/Orf/Test/PenOthersNewRoot', tip = 'OGB/Orf/Test/PenOthersNewTip';
    await rig.send([[root,.77],[tip,.96]]); await outputValue(rig, 'udp', 400);
    await rig.send([[root,.89],[tip,1]]); await outputValue(rig, 'udp', 480);
    await workspace(page, '控制'); await checkpoint(page, card(page, 'Mock UDP').locator('.output-position-panel'), 'sps-depth');
    await rig.send([[root,1-Math.hypot(.12,.06)+.01]]); await outputValue(rig, 'udp', 466); await active(page, false);
  });
});

test('funscript import, playback, pause, stepping and unload', { tag: ['@input','@transport','@visual'] }, async ({ page, rig }) => {
  await enable(page, ['Mock UDP']); await mode(page, '脚本');
  await page.locator('input[type=file]').setInputFiles({ name:'ci-motion.funscript', mimeType:'application/json', buffer:Buffer.from(JSON.stringify({actions:[{at:0,pos:0},{at:5000,pos:100},{at:10000,pos:0}]})) });
  await expect.poll(async () => (await rig.overview()).input.script.loaded).toBe(true);
  expect((await rig.overview()).runtime.inputActive).toBe(false);
  await page.getByRole('checkbox', { name:'循环', exact:true }).check();
  await expect.poll(async () => (await rig.overview()).input.script.loop).toBe(true);
  await active(page); await outputValue(rig, 'udp', 400);
  const playbackStart = rig.wire.udp.length;
  await page.getByRole('button', { name:'播放', exact:true }).click();
  await expect.poll(async () => (await rig.overview()).input.script.playing).toBe(true);
  await expect.poll(() => {
    const line = rig.wire.udp.slice(playbackStart).filter(s => /L0\d/.test(s)).at(-1);
    const value = Number(line?.match(/L0(\d+)/)?.[1]); return value > 400 && value < 600;
  }).toBe(true);
  await page.getByRole('button', { name:'暂停', exact:true }).click();
  await expect.poll(async () => (await rig.overview()).input.script.playing).toBe(false);
  await expect.poll(() => rig.wire.udp.at(-1)).toBe('DSTOP');
  await page.getByRole('button', { name:'下一动作', exact:true }).click(); await outputValue(rig, 'udp', 600);
  await checkpoint(page, page.locator('.script-player__controls'), 'script-paused-keyframe');
  await checkpoint(page, page.locator('.script-player__options'), 'script-options');
  await page.getByRole('button', { name:'卸载', exact:true }).click();
  await expect.poll(async () => (await rig.overview()).input.script.loaded).toBe(false);
  await expect.poll(() => rig.wire.udp.at(-1)).toBe('DSTOP');
});

test('help, output editing, conflicts and profile dialog remain usable', { tag: ['@config','@visual'] }, async ({ page }) => {
  await page.getByRole('button', { name:'帮助', exact:true }).click();
  await checkpoint(page, page.getByRole('dialog', { name:'使用帮助', exact:true }), 'help-workflow');
  await expect(page.getByRole('link', { name:'使用指南', exact:true })).toHaveAttribute('href', /guide\.md$/);
  await page.getByRole('button', { name:'关闭帮助', exact:true }).click();
  await card(page, 'Mock UDP').getByRole('button', { name:'配置', exact:true }).click();
  await checkpoint(page, page.getByRole('dialog'), 'udp-settings');
  await page.getByRole('textbox', { name:'名称', exact:true }).fill('Mock UDP edited');
  await page.getByRole('button', { name:'保存输出', exact:true }).click();
  await expect(card(page, 'Mock UDP edited')).toBeVisible();
  await page.getByLabel('输出类型', { exact:true }).selectOption('TCodeUdp');
  await page.getByRole('button', { name:'添加输出', exact:true }).click();
  await page.getByRole('spinbutton', { name:'目标端口', exact:true }).fill('19999');
  await expect(page.getByRole('button', { name:'保存输出', exact:true })).toBeDisabled();
  await checkpoint(page, page.getByRole('dialog'), 'output-conflict');
  await page.getByRole('button', { name:'取消', exact:true }).click();
  const added = page.locator('.output-card').filter({ hasNotText:'Mock' }); await expect(added).toHaveCount(1);
  await added.getByRole('button', { name:'移除', exact:true }).click(); await expect(page.locator('.output-card')).toHaveCount(4);
  await workspace(page, '设置'); await checkpointViewport(page, 'settings-page');
  await page.getByRole('button', { name:'修改配置', exact:true }).click();
  await page.getByRole('textbox', { name:'配置名称', exact:true }).fill('CI edited profile');
  await checkpoint(page, page.getByRole('dialog'), 'profile-settings');
  await page.getByRole('button', { name:'保存轴配置', exact:true }).click();
  await expect(page.getByRole('heading', { name:/CI edited profile/ })).toBeVisible();
});

test('paired pose is diagnostic by default, explicit opt-in drives, missing landmark stops', { tag: ['@osc','@transport','@visual'] }, async ({ page, rig }) => {
  await enable(page, ['Mock UDP']); await mode(page, 'OSC');
  const feed = await rig.startFeed(poseSamples());
  await expect.poll(async () => (await rig.overview()).poseTracking.observations.some(p => p.valid && p.engaged && p.sampleCount===24 && Math.abs(p.depth-.5)<.001)).toBe(true);
  await oscWorkspace(page, '实验诊断'); await expand(page, '配对三点姿态');
  await checkpoint(page, page.locator('.pose-dashboard'), 'paired-pose');
  await page.getByRole('button', { name:'生成深度草稿', exact:true }).click();
  await oscWorkspace(page, '映射'); await page.getByRole('button', { name:'保存映射', exact:true }).click();
  await expect.poll(async () => (await rig.overview()).signals.length).toBe(1);
  await active(page);
  await expect.poll(async () => (await rig.overview()).runtime.spatialInputBlockedReason).toContain('disabled');
  await expect.poll(() => rig.wire.udp.at(-1)).toBe('DSTOP');
  expect(rig.wire.udp.filter(line => /L0\d/.test(line))).toHaveLength(0);
  await allowSpatial(page); await active(page); await outputValue(rig, 'udp', 500);
  await feed.set(poseSamples().map(([path,value]) => [path,path.endsWith('/Tip/A0') ? 0 : value]));
  await expect.poll(() => rig.wire.udp.at(-1)).toBe('DSTOP');
  await expect.poll(async () => (await rig.overview()).runtime.poseBlocked).toBe(true);
  await workspace(page, '控制'); await checkpoint(page, page.locator('main .section').first(), 'pose-landmark-lost');
});

test.describe('OSCQuery and Hub', () => {
  test.use({ scenario:'query' });
  test('discovery and forwarding use real loopback peers', { tag:['@osc','@visual'] }, async ({ page, rig }) => {
    await mode(page, 'OSC'); await oscWorkspace(page, '参数');
    await expand(page, '接收与转发设置'); await expand(page, 'OSCQuery');
    const polling = page.getByRole('checkbox', { name:'轮询回退', exact:true }); await polling.check();
    await page.getByRole('button', { name:'保存 OSC 设置', exact:true }).click();
    await expect(page.getByRole('button', { name:'QueryDepth', exact:true })).toBeVisible({timeout:20000});
    await expect.poll(() => rig.wire.hub.length).toBeGreaterThan(0);
    await polling.uncheck(); await page.getByRole('button', { name:'保存 OSC 设置', exact:true }).click();
    await expect.poll(async () => page.request.get(rig.baseUrl + '/api/config').then(response => response.json()).then(config => config.osc.oscQueryPolling.enabled)).toBe(false);
    await expect(page.getByRole('button', { name:'保存 OSC 设置', exact:true })).toBeEnabled();
    await page.locator('summary').filter({ hasText: /^OSCQuery$/ }).click();
    await checkpoint(page, page.locator('.osc-receiver-settings'), 'osc-receiver-settings');
    await expand(page, 'OSC Hub');
    await checkpoint(page, page.locator('.osc-forwarding-settings'), 'osc-hub');
  });
});

test('API session boundary and disabled input cannot command mocks', { tag:['@transport','@input','@visual'] }, async ({ page, rig }) => {
  expect((await fetch(rig.baseUrl + '/api/config')).status).toBe(401);
  const session = await fetch(rig.baseUrl + '/api/session');
  expect((await fetch(rig.baseUrl + '/api/config', { headers:{Cookie:session.headers.get('set-cookie').split(';')[0],Origin:'http://untrusted.invalid'} })).status).toBe(403);
  await enable(page, ['Mock UDP']);
  const before = rig.wire.udp.filter(line => /L0\d/.test(line)).length;
  await page.getByRole('slider', { name:'L0 主轴', exact:true }).press('End');
  await page.getByRole('button', { name:'发送一次', exact:true }).click();
  await expect(page.getByText(await text(page, '手动目标已更新'), { exact:true })).toBeVisible();
  expect((await rig.overview()).runtime.inputActive).toBe(false);
  expect(rig.wire.udp.filter(line => /L0\d/.test(line)).length).toBe(before);
  await checkpoint(page, card(page, 'Mock UDP').locator('.output-position-panel'), 'disabled-input');
});
