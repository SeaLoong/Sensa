import { test, expect, text, workspace } from './fixtures.js';
import { inspectModalFrame } from './ui-quality.js';

async function openProfile(page) {
  await workspace(page, '设置');
  await page.getByRole('button', { name: await text(page, '修改配置'), exact: true }).click();
  const dialog = page.getByRole('dialog', { name: await text(page, '轴配置'), exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('tabpanel')).toHaveCount(1);
  return dialog;
}

async function valueName(page, label) {
  return (await text(page, '{0}数值')).replace('{0}', await text(page, label));
}

async function rangeEndpoint(page, panel, range, endpoint) {
  return panel.getByRole('spinbutton', { name: (await text(page, range)) + (await text(page, endpoint)), exact: true });
}

async function readConfig(page, rig) {
  const response = await page.request.get(rig.baseUrl + '/api/config');
  expect(response.ok()).toBe(true);
  return response.json();
}

for (const locale of ['zh-CN', 'en-US']) {
  test.describe('Axis profile layout / 轴配置布局 ' + locale, () => {
    test.use({ locale });

    test('axis navigation preserves independent drafts and saves modes without activating output / 切换轴保留独立草稿并保存且不启用输出',
      { tag: ['@config', '@quality'] }, async ({ page, rig }, info) => {
        const original = await readConfig(page, rig);
        const dialog = await openProfile(page);
        const tabs = dialog.getByRole('tablist', { name: await text(page, '选择轴'), exact: true });
        const panel = dialog.getByRole('tabpanel');
        const l0 = tabs.getByRole('tab', { name: /^L0\s/ });
        await expect(tabs.getByRole('tab')).toHaveCount(12);
        await expect(l0).toHaveAttribute('aria-selected', 'true');
        await expect(panel.locator('.axis-editor')).toHaveAttribute('data-axis-key', 'l0');
        const name = 'Axis layout ' + locale;
        await dialog.getByRole('textbox', { name: await text(page, '配置名称'), exact: true }).fill(name);
        await panel.getByLabel(await text(page, '轴模式'), { exact: true }).selectOption('NormalInverted');
        await (await rangeEndpoint(page, panel, '映射范围', '起点')).fill('200');
        await (await rangeEndpoint(page, panel, '映射范围', '终点')).fill('800');
        await (await rangeEndpoint(page, panel, '边界范围', '起点')).fill('100');
        await (await rangeEndpoint(page, panel, '边界范围', '终点')).fill('900');
        await panel.getByRole('spinbutton', { name: await valueName(page, '速度限制'), exact: true }).fill('339');
        await panel.getByLabel(await text(page, '斜率方式'), { exact: true }).selectOption('None');
        await expect(panel.getByRole('spinbutton', { name: await valueName(page, '速度限制'), exact: true })).toHaveValue('339');

        await l0.focus();
        await page.keyboard.press('ArrowRight');
        const l1 = tabs.getByRole('tab', { name: /^L1\s/ });
        await expect(l1).toBeFocused();
        await expect(l1).toHaveAttribute('aria-selected', 'true');
        await expect(panel.locator('.axis-editor')).toHaveAttribute('data-axis-key', 'l1');
        await panel.getByLabel(await text(page, '轴模式'), { exact: true }).selectOption('LockedInverted');
        const locked = panel.getByRole('spinbutton', { name: await valueName(page, '锁定位置'), exact: true });
        await expect(locked).toHaveAttribute('min', '0');
        await expect(locked).toHaveAttribute('max', '1');
        await expect(locked).toHaveAttribute('step', '0.01');
        await locked.fill('0.62');
        await panel.getByLabel(await text(page, '斜率方式'), { exact: true }).selectOption('Speed');
        await panel.getByLabel(await text(page, '斜率曲线'), { exact: true }).selectOption('EaseOut');
        await panel.getByRole('spinbutton', { name: await valueName(page, '速度限制'), exact: true }).fill('222');
        await expect(panel.locator('.range-field')).toHaveCount(0);

        await l0.click();
        await expect(await rangeEndpoint(page, panel, '映射范围', '起点')).toHaveValue('200');
        await expect(await rangeEndpoint(page, panel, '映射范围', '终点')).toHaveValue('800');
        await expect(await rangeEndpoint(page, panel, '边界范围', '起点')).toHaveValue('100');
        await expect(await rangeEndpoint(page, panel, '边界范围', '终点')).toHaveValue('900');
        await expect(panel.getByLabel(await text(page, '轴模式'), { exact: true })).toHaveValue('NormalInverted');
        await expect(panel.getByLabel(await text(page, '斜率方式'), { exact: true })).toHaveValue('None');
        await expect(panel.getByRole('spinbutton', { name: await valueName(page, '速度限制'), exact: true })).toHaveValue('339');
        await l0.focus();
        await page.keyboard.press('End');
        const a2 = tabs.getByRole('tab', { name: /^A2\s/ });
        await expect(a2).toBeFocused();
        await expect(panel.locator('.axis-editor')).toHaveAttribute('data-axis-key', 'a2');
        await panel.getByLabel(await text(page, '轴模式'), { exact: true }).selectOption('Ignored');
        await expect(panel.getByText(await text(page, '该轴已忽略，不会参与输出。'), { exact: true })).toBeVisible();
        await expect(panel.locator('input')).toHaveCount(0);
        await a2.focus();
        await page.keyboard.press('Home');
        await expect(l0).toBeFocused();
        await l1.click();
        await expect(locked).toHaveValue('0.62');
        await expect(panel.getByLabel(await text(page, '斜率曲线'), { exact: true })).toHaveValue('EaseOut');
        await info.attach('axis-editor-' + locale + '-' + info.project.name, { body: await dialog.screenshot(), contentType: 'image/png' });
        await dialog.getByRole('button', { name: await text(page, '保存轴配置'), exact: true }).click();
        await expect(dialog).toBeHidden();

        const saved = await readConfig(page, rig);
        const profile = saved.axisProfiles.find(candidate => candidate.id === 'test-profile');
        expect(profile.name).toBe(name);
        expect(profile.motion.l0).toMatchObject({ mode: 'Normal', invert: true, remapMin: 200, remapMax: 800,
          min: 100, max: 900, commandMode: 'None', maxSpeed: 339 });
        expect(profile.motion.l1).toMatchObject({ mode: 'Locked', invert: true, lockValue: .62,
          commandMode: 'Speed', rampType: 'EaseOut', maxSpeed: 222 });
        for (const key of Object.keys(profile.motion).filter(key => !['l0', 'l1', 'a2'].includes(key))) {
          expect(profile.motion[key]).toEqual(original.axisProfiles[0].motion[key]);
        }
        expect(profile.motion.a2.mode).toBe('Ignored');
        expect(saved.outputs.every(output => !output.enabled)).toBe(true);
        expect((await rig.overview()).runtime.inputActive).toBe(false);
        expect(Object.values(rig.wire).every(lane => lane.length === 0)).toBe(true);
        await info.attach('axis-profile-save-' + locale + '.json', { body: JSON.stringify({ locale, profile,
          inputActive: false, enabledOutputs: 0, deviceWire: rig.wire }), contentType: 'application/json' });
      });

    test('axis panel reflows and its scroll body keeps header and save actions visible / 轴编辑重排且正文滚动保留标题和保存操作',
      { tag: ['@config', '@quality'] }, async ({ page, rig }, info) => {
        const dialog = await openProfile(page);
        const evidence = { locale, initial: await inspectModalFrame(dialog) };
        const groups = await dialog.locator('.axis-editor__group').evaluateAll(elements => elements.map(element => {
          const box = element.getBoundingClientRect(); return { top: box.top, right: box.right, bottom: box.bottom, left: box.left };
        }));
        expect(groups).toHaveLength(2);
        if (page.viewportSize().width > 700) {
          expect(Math.abs(groups[0].top - groups[1].top)).toBeLessThanOrEqual(1);
          expect(groups[0].right).toBeLessThanOrEqual(groups[1].left);
        } else expect(groups[0].bottom).toBeLessThanOrEqual(groups[1].top);
        await info.attach('axis-profile-frame-' + locale + '-' + info.project.name, { body: await dialog.screenshot(), contentType: 'image/png' });

        await page.setViewportSize({ width: 320, height: 740 });
        const body = dialog.locator('.modal__body');
        await body.evaluate(element => { element.scrollTop = element.scrollHeight; });
        evidence.narrowScrolled = await inspectModalFrame(dialog);
        const speed = dialog.getByRole('spinbutton', { name: await valueName(page, '速度限制'), exact: true });
        await speed.focus();
        await expect(speed).toBeFocused();
        evidence.narrowFocused = await inspectModalFrame(dialog);
        expect(evidence.narrowFocused.focused.top).toBeGreaterThanOrEqual(evidence.narrowFocused.body.top - 1);
        expect(evidence.narrowFocused.focused.bottom).toBeLessThanOrEqual(evidence.narrowFocused.body.bottom + 1);
        const navigation = dialog.getByRole('tablist', { name: await text(page, '选择轴'), exact: true });
        const first = navigation.getByRole('tab', { name: /^L0\s/ });
        await first.focus();
        await page.keyboard.press('End');
        await expect(navigation.getByRole('tab', { name: /^A2\s/ })).toBeFocused();
        await expect(dialog.locator('.axis-editor')).toHaveCount(1);
        evidence.narrowLastAxis = await inspectModalFrame(dialog);
        await dialog.getByRole('button', { name: await text(page, '取消'), exact: true }).click();
        await expect(dialog).toBeHidden();
        expect((await rig.overview()).runtime.inputActive).toBe(false);
        expect(Object.values(rig.wire).every(lane => lane.length === 0)).toBe(true);
        await info.attach('axis-profile-frame-' + locale + '.json', { body: JSON.stringify(evidence), contentType: 'application/json' });
      });
  });
}
