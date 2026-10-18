import { test, expect, text, card, enable, mode, active, workspace, oscWorkspace, expand } from './fixtures.js';

async function savedConfiguration(page, rig) {
  const response = await page.request.get(rig.baseUrl + '/api/config');
  expect(response.ok()).toBe(true);
  return response.json();
}

test('unrelated saves preserve mapping and receiver drafts / 跨区域保存保留映射与接收草稿', { tag: ['@config', '@osc'] }, async ({ page, rig }) => {
  const initial = await savedConfiguration(page, rig);
  await oscWorkspace(page, '映射');
  const path = page.locator('.mapping-row').first().getByRole('textbox', { name: '参数路径', exact: true });
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
    await page.getByLabel('预设方案', { exact: true }).selectOption('sps-touch');
    await page.getByRole('button', { name: '替换草稿', exact: true }).click();
    await page.getByRole('button', { name: '保存映射', exact: true }).click();
    await expect.poll(async () => (await savedConfiguration(page, rig)).signals.map(signal => signal.role)).toEqual(['V0']);
    await mode(page, 'OSC');
    await rig.send([['OGB/Orf/Test/TouchOthers', .7]]);
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
