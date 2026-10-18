import { test, expect, text, card, enable, mode, active, workspace, oscWorkspace, expand, allowSpatial, checkpoint, outputValue } from './fixtures.js';
import { ports, fixedRootSamples, shaderRootSamples } from './mocks.js';

async function savedConfiguration(page, rig) {
  const response = await page.request.get(rig.baseUrl + '/api/config');
  expect(response.ok()).toBe(true);
  return response.json();
}

test('unrelated saves preserve mapping and receiver drafts / 跨区域保存保留映射与接收草稿', { tag: ['@config', '@osc'] }, async ({ page, rig }) => {
  const initial = await savedConfiguration(page, rig);
  await oscWorkspace(page, '映射');
  const path = page.locator('.mapping-row').first().getByLabel('参数路径', { exact: true });
  const draftPath = 'Custom/WorkflowDepth';
  await path.fill(draftPath);
  await expect(page.locator('.mapping-toolbar').getByText('未保存', { exact: true })).toBeVisible();

  await workspace(page, '控制');
  await card(page, 'Mock UDP').getByRole('button', { name: '配置', exact: true }).click();
  const output = page.getByRole('dialog', { name: '输出设置', exact: true });
  await output.getByRole('textbox', { name: '名称', exact: true }).fill('Workflow UDP');
  await output.getByRole('button', { name: '保存输出', exact: true }).click();
  await expect(output).not.toBeVisible();
  await expect(card(page, 'Workflow UDP')).toBeVisible();
  await oscWorkspace(page, '映射');
  await expect(path).toHaveValue(draftPath);
  await expect(page.locator('.mapping-toolbar').getByText('未保存', { exact: true })).toBeVisible();
  expect((await savedConfiguration(page, rig)).signals[0].oscPath).toBe(initial.signals[0].oscPath);

  await expand(page, '接收与转发设置');
  const receiverPort = page.getByRole('spinbutton', { name: '监听端口', exact: true });
  const draftPort = 19094;
  await receiverPort.fill(String(draftPort));
  const saveMappings = page.getByRole('button', { name: '保存映射', exact: true });
  await saveMappings.click();
  await expect.poll(async () => (await savedConfiguration(page, rig)).signals[0].oscPath).toBe(draftPath);
  await expect(saveMappings).toBeEnabled();
  await expect(page.locator('.mapping-toolbar').getByText('未保存', { exact: true })).toHaveCount(0);
  await expect(path).toHaveValue(draftPath);
  await expand(page, '接收与转发设置');
  await expect(receiverPort).toHaveValue(String(draftPort));
  const saved = await savedConfiguration(page, rig);
  expect(saved.osc.receiverPort).toBe(initial.osc.receiverPort);
  expect(saved.outputs.every(output => !output.enabled)).toBe(true);
  expect((await rig.overview()).runtime.inputActive).toBe(false);
  expect(rig.wire.udp.filter(line => /L0\d/.test(line))).toHaveLength(0);
});

test.describe('vibration-only Intiface peer / 纯振动 Intiface 模拟端', () => {
  test.use({ scenario: 'vibration-only' });
  test('OGB Touch uses V0 and L0 vibration requires explicit selection / OGB 触碰使用 V0，L0 振动须明确选择', { tag: ['@transport', '@input', '@osc', '@config'] }, async ({ page, rig }) => {
    expect(rig.intifaceState.profile).toBe('vibration-only');
    expect((await savedConfiguration(page, rig)).outputs.every(output => !output.enabled)).toBe(true);
    await enable(page, ['Mock Intiface']);
    const vibrationValues = () => rig.wire.intiface
      .filter(message => message.OutputCmd?.Command?.Vibrate)
      .map(message => message.OutputCmd.Command.Vibrate.Value);
    const positionCommands = () => rig.wire.intiface.filter(message =>
      message.OutputCmd?.Command?.HwPositionWithDuration || message.OutputCmd?.Command?.Position);
    const selectedAxis = async () => (await savedConfiguration(page, rig)).outputs.find(output => output.id === 'intiface').vibrationAxis;
    expect(await selectedAxis()).toBe('V0');
    await expect(page.getByRole('spinbutton', { name: 'L0 主轴数值', exact: true })).toHaveValue('500');
    await expand(page, '旋转、震动与辅助轴');
    await expect(page.getByRole('spinbutton', { name: 'V0 震动数值', exact: true })).toHaveValue('0');
    await active(page);
    await page.getByRole('button', { name: '发送一次', exact: true }).click();
    await expect.poll(() => vibrationValues().length).toBeGreaterThan(0);
    expect(vibrationValues().every(value => value === 0)).toBe(true);
    expect(positionCommands()).toHaveLength(0);
    await active(page, false);

    await oscWorkspace(page, '映射');
    await page.getByLabel('预设方案', { exact: true }).selectOption('ogb-touch');
    await page.getByRole('button', { name: '替换草稿', exact: true }).click();
    await page.getByRole('button', { name: '保存映射', exact: true }).click();
    await expect.poll(async () => (await savedConfiguration(page, rig)).signals.map(signal => signal.role)).toEqual(['V0']);
    await mode(page, 'OSC');
    await rig.send([['OGB/Orf/Test/TouchOthers', .7], ['OGB/Orf/Test/TouchOthersClose', 1]]);
    await active(page);
    await expect.poll(() => Math.abs((vibrationValues().at(-1) ?? -1000) - 700)).toBeLessThanOrEqual(2);
    expect(positionCommands()).toHaveLength(0);
    await active(page, false);

    await mode(page, '手动');
    await card(page, 'Mock Intiface').getByRole('button', { name: '配置', exact: true }).click();
    const output = page.getByRole('dialog', { name: '输出设置', exact: true });
    await output.getByLabel('振动来源', { exact: true }).selectOption('L0');
    const beforeSave = rig.wire.intiface.length;
    await output.getByRole('button', { name: '保存输出', exact: true }).click();
    await expect(output).not.toBeVisible();
    await expect.poll(selectedAxis).toBe('L0');
    expect((await rig.overview()).runtime.inputActive).toBe(false);
    await page.getByRole('spinbutton', { name: 'L0 主轴数值', exact: true }).fill('500');
    await page.getByRole('button', { name: '发送一次', exact: true }).click();
    await expect(page.getByText(await text(page, '手动目标已更新'), { exact: true })).toBeVisible();
    expect(rig.wire.intiface.slice(beforeSave).filter(message => message.OutputCmd)).toHaveLength(0);
    const beforeActivation = rig.wire.intiface.length;
    await active(page);
    await expect.poll(() => rig.wire.intiface.slice(beforeActivation).some(message =>
      Math.abs((message.OutputCmd?.Command?.Vibrate?.Value ?? -1000) - 500) <= 1)).toBe(true);
    expect(positionCommands()).toHaveLength(0);
    await active(page, false);
    await expect.poll(() => rig.intifaceState.stopped).toBe(true);
    await test.info().attach('vibration-values.json', { body: JSON.stringify(vibrationValues()), contentType: 'application/json' });
  });
});

for (const producer of [
  { kind: 'SpsRoot', prefix: 'Sensa/SpsRoot/v1/CIFixedRoot/Self', screenshot: 'fixed-root-position', sample: fixedRootSamples },
  { kind: 'ShaderRoot', prefix: 'Sensa/Shader/v1/42', screenshot: 'shader-root-position', sample: shaderRootSamples },
]) {
  test(producer.kind + ' protocol simulation calibrates, requires permission and stops on invalid / 根点协议模拟校准、许可与失效停止',
    { tag: ['@osc', '@input', '@config', '@transport', '@visual'] }, async ({ page, rig }, info) => {
      await enable(page, ['Mock UDP']);
      await mode(page, 'OSC');
      let z = .05, valid = true, sequence = 0;
      const samples = () => producer.sample(z, producer.kind === 'SpsRoot' ? sequence++ % 32 / 31 : sequence++ % 65536, valid);
      const feed = await rig.startFeed(samples, 80, { bundle: producer.kind === 'ShaderRoot' });
      const observation = async () => (await rig.overview()).poseTracking.spsRoots.find(root => root.kind === producer.kind && root.prefix === producer.prefix);
      await expect.poll(async () => (await observation())?.valid).toBe(true);
      await oscWorkspace(page, '实验诊断');
      await expand(page, '本地点与根部');
      const panel = page.locator('#sensa-spatial-root');
      await panel.getByLabel('测量对象', { exact: true }).selectOption((await observation()).key);
      await expand(page, '两点量程校准');
      await expect(panel.locator('.point-diagnostic-grid .metrics dd').first()).toHaveText('0.020 / 1.000 / 0.050 本地单位');
      await panel.getByRole('button', { name: '采集 0%', exact: true }).click();
      await expect(panel.locator('.calibration-grid output').nth(0)).toHaveText('0.050 本地单位');
      z = .15; await feed.set(samples);
      await expect(panel.locator('.point-diagnostic-grid .metrics dd').first()).toHaveText('0.020 / 1.000 / 0.150 本地单位');
      await panel.getByRole('button', { name: '采集 100%', exact: true }).click();
      await expect(panel.locator('.calibration-grid output').nth(1)).toHaveText('0.150 本地单位');
      await checkpoint(page, panel.locator('.point-diagnostic-grid'), producer.screenshot);
      await panel.getByRole('button', { name: '替换草稿', exact: true }).click();
      await oscWorkspace(page, '映射');
      await expect(page.locator('.mapping-row')).toHaveCount(1);
      await page.getByRole('button', { name: '保存映射', exact: true }).click();
      await expect.poll(async () => (await savedConfiguration(page, rig)).signals[0]?.sourceMode).toBe('SensaPoint');
      const saved = await savedConfiguration(page, rig);
      expect(saved.signals[0]).toMatchObject({ oscPath: producer.prefix + '/**', role: 'Depth', pointMetric: 'Z' });
      expect(saved.signals[0].vrchatMin).toBeCloseTo(.05, 5);
      expect(saved.signals[0].vrchatMax).toBeCloseTo(.15, 5);
      expect(saved.osc.allowExperimentalSpatialInput).toBe(false);

      z = .1; await feed.set(samples);
      await active(page);
      await expect.poll(async () => (await rig.overview()).runtime.poseBlocked).toBe(true);
      expect((await rig.overview()).runtime.spatialInputBlockedReason).toContain('disabled');
      await expect.poll(async () => (await observation())?.position.z).toBeCloseTo(.1, 5);
      expect(rig.wire.udp.filter(line => /L0\d/.test(line))).toHaveLength(0);
      await allowSpatial(page);
      await active(page);
      await outputValue(rig, 'udp', 500);
      expect((await rig.overview()).runtime.poseBlocked).toBe(false);
      valid = false; await feed.set(samples);
      await expect.poll(async () => (await observation())?.valid).toBe(false);
      await expect.poll(() => rig.wire.udp.at(-1)).toBe('DSTOP');
      await info.attach('protocol-simulation.json', { body: JSON.stringify({
        producer: producer.kind, prefix: producer.prefix, fixtureOnly: true,
        realUnityOrGpuCapture: false, calibration: [.05, .15], midpoint: .1,
        permissionRequired: true, invalidStops: true,
      }, null, 2), contentType: 'application/json' });
    });
}

test('OGB control sends explicit enable and final disable without activating input / OGB 控制明确启用并撤销，保持设备输入关闭',
  { tag: ['@osc', '@input', '@transport', '@visual'] }, async ({ page, rig }) => {
    expect((await savedConfiguration(page, rig)).outputs.every(output => !output.enabled)).toBe(true);
    await mode(page, 'OSC');
    await oscWorkspace(page, '映射');
    await expand(page, '接收与转发设置');
    await expand(page, 'OGB 参数启用');
    const settings = page.locator('.ogb-control-settings');
    const activateOgb = settings.getByRole('checkbox', { name: '向 VRChat 启用 OGB 参数', exact: true });
    await expect(activateOgb).not.toBeChecked();
    await activateOgb.check();
    await settings.getByRole('textbox', { name: 'VRChat 控制 IP', exact: true }).fill('127.0.0.1');
    await settings.getByRole('spinbutton', { name: 'VRChat 控制端口', exact: true }).fill(String(ports.hub));
    const save = page.getByRole('button', { name: '保存 OSC 设置', exact: true });
    await save.click();
    await expect.poll(async () => (await savedConfiguration(page, rig)).osc.ogbControl).toEqual({ enabled: true, host: '127.0.0.1', port: ports.hub });
    await expect(save).toBeEnabled();
    const packet = enabled => {
      const address = Buffer.from('/avatar/parameters/OGB_ENABLED\0');
      return Buffer.concat([address, Buffer.alloc((4 - address.length % 4) % 4), Buffer.from(enabled ? ',T\0\0' : ',F\0\0')]).toString('hex');
    };
    await expect.poll(() => rig.wire.hub.includes(packet(true))).toBe(true);
    await expect(settings.getByText('正在发送启用心跳', { exact: true })).toBeVisible();
    expect((await rig.overview()).runtime.inputActive).toBe(false);
    await checkpoint(page, settings, 'ogb-control-settings');
    await mode(page, '手动');
    await expect.poll(() => rig.wire.hub.at(-1)).toBe(packet(false));
    const disabledAt = Date.now(), enabledCount = rig.wire.hub.filter(message => message === packet(true)).length;
    // Observe beyond the real five-second heartbeat, not an arbitrary UI settling delay. / 跨过实际五秒心跳周期。
    await expect.poll(() => Date.now() - disabledAt, { intervals: [250, 500, 1000], timeout: 8000 }).toBeGreaterThan(5250);
    expect(rig.wire.hub.filter(message => message === packet(true))).toHaveLength(enabledCount);
    expect(rig.wire.hub.at(-1)).toBe(packet(false));
    expect((await rig.overview()).runtime.inputActive).toBe(false);
    expect((await savedConfiguration(page, rig)).outputs.every(output => !output.enabled)).toBe(true);
    for (const transport of ['udp', 'tcp', 'serial']) expect(rig.wire[transport].filter(line => /L0\d/.test(line))).toHaveLength(0);
    expect(rig.wire.intiface.filter(message => message.OutputCmd)).toHaveLength(0);
  });
