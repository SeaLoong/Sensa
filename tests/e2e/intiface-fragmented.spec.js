import { test, expect, text, card, active, enable, expand } from './fixtures.js';

// Uses the actual C# client and a fragmented, >2KiB loopback DeviceList. No engine/hardware.
test('large UTF-8 Intiface capabilities remain configurable and drive the selected feature / 大型UTF8设备列表可配置并驱动所选特征',
  { tag: ['@input', '@config', '@transport'] }, async ({ page, rig }, info) => {
    rig.reset({ intifaceProfile: 'large-fragmented' });
    await enable(page, ['Mock Intiface']);
    const device = async () => (await rig.overview()).outputs.find(output => output.id === 'intiface')?.devices[0];
    await expect.poll(async () => (await device())?.features.length).toBe(40);
    expect((await device()).name).toBe('CI 多特征设备 😀');
    expect(rig.intifaceState.deviceListBytes).toBeGreaterThan(2048);
    expect(rig.intifaceState.deviceListFrames).toBe(2);
    expect(rig.intifaceState.utf8Split).toBeGreaterThan(0);
    expect((await rig.overview()).runtime.inputActive).toBe(false);
    expect(rig.wire.intiface.some(message => message.OutputCmd)).toBe(false);

    const output = card(page, 'Mock Intiface');
    await output.locator('summary').filter({ hasText: await text(page, '设备扫描') }).click();
    await output.getByRole('button', { name: await text(page, '开始扫描'), exact: true }).click();
    await expect.poll(() => rig.wire.intiface.some(message => message.StartScanning)).toBe(true);

    await output.getByRole('button', { name: await text(page, '配置'), exact: true }).click();
    const dialog = page.getByRole('dialog', { name: await text(page, '输出设置'), exact: true });
    const mappings = dialog.getByTestId('intiface-feature-mappings');
    await mappings.locator('summary').click();
    await expect(mappings.getByTestId('intiface-advertised-features').locator('li')).toHaveCount(40);
    await mappings.getByRole('button', { name: await text(page, '添加执行器映射'), exact: true }).click();
    const route = mappings.getByTestId('intiface-feature-route');
    await route.getByLabel(await text(page, '匹配设备名称'), { exact: true }).fill('CI 多特征设备 😀');
    await route.getByRole('spinbutton', { name: await text(page, '特征索引'), exact: true }).fill('39');
    await route.getByRole('combobox', { name: await text(page, '执行器类型'), exact: true }).selectOption('Rotate');
    await route.getByRole('combobox', { name: await text(page, '来源轴'), exact: true }).selectOption('V0');
    await dialog.getByRole('button', { name: await text(page, '保存输出'), exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect.poll(async () => (await device())?.features.length).toBe(40);
    expect((await rig.overview()).runtime.inputActive).toBe(false);

    await active(page);
    await expand(page, await text(page, '旋转、震动与辅助轴'));
    await page.getByRole('spinbutton', { name: 'V0 震动数值', exact: true }).fill('400');
    await page.getByRole('button', { name: await text(page, '发送一次'), exact: true }).click();
    await expect.poll(() => rig.wire.intiface.filter(message => message.OutputCmd?.Command?.Rotate)
      .map(message => message.OutputCmd.Command.Rotate.Value).at(-1)).toBe(400);
    const sent = rig.wire.intiface.filter(message => message.OutputCmd);
    expect(sent.every(message => message.OutputCmd.FeatureIndex === 39)).toBe(true);
    await active(page, false);
    await expect.poll(() => rig.intifaceState.stopped).toBe(true);
    await info.attach('intiface-fragmented.json', { body: JSON.stringify({ fixtureOnly: true, hardwareExecution: false,
      deviceListBytes: rig.intifaceState.deviceListBytes, frames: rig.intifaceState.deviceListFrames,
      splitInsideUtf8: rig.intifaceState.utf8Split, capabilities: (await device()).features,
      wire: rig.wire.intiface }), contentType: 'application/json' });
  });
