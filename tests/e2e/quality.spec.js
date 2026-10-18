import { test, expect, card, text, workspace, oscWorkspace, expand, mode } from './fixtures.js';
import { createUiQualityReport, inspectBasicTargets, inspectFocusIndicator, inspectReflow, inspectManualAlignment, inspectOutputAlignment, inspectMappingAlignment, inspectNarrowFormAlignment } from './ui-quality.js';

const auditStates = [
  'control-manual-expanded',
  'output-settings-dialog',
  'intiface-settings-dialog',
  'control-script-loaded',
  'osc-mappings-expanded',
  'osc-parameters-populated',
  'osc-receiving-and-forwarding-expanded',
  'ogb-control-settings',
  'settings-logs-expanded',
  'axis-profile-dialog',
];
const behaviorChecks = [
  'manual-alignment', 'output-row-alignment', 'mapping-alignment',
  'skip-link-focus-and-target', 'tabs-keyboard-and-control-boundary', 'native-dialog-focus-trap-escape-return',
  'reflow-320-control', 'target-samples-buttons', 'target-samples-toggle-label', 'target-samples-select-and-slider',
  'reflow-320-mapping-expanded', 'target-samples-fields-and-disclosures', 'reflow-320-parameter-scroll-region',
  'reflow-320-settings', 'reflow-320-profile-dialog', 'checks-never-enable-input',
];
const label = (page, zh) => text(page, zh);
async function attachModalFocus(dialog, info, direction) {
  const evidence = await dialog.evaluate(element => {
    const describe = node => node ? {
      tag: node.tagName.toLowerCase(), id: node.id, role: node.getAttribute('role'),
      label: node.getAttribute('aria-label'), text: (node.textContent || '').trim().slice(0, 120),
      disabled: Boolean(node.disabled), tabIndex: node.tabIndex, withinDialog: element.contains(node),
    } : null;
    const targets = [...element.querySelectorAll('button, input, select, textarea, a[href], [tabindex]')]
      .filter(node => !node.disabled && node.tabIndex >= 0 && node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden');
    return { active: describe(document.activeElement), first: describe(targets[0]),
      last: describe(targets.at(-1)), dialogOpen: element.open };
  });
  await info.attach('modal-focus-' + direction + '.json', { body: JSON.stringify(evidence, null, 2), contentType: 'application/json' });
}
async function expandFirstAxis(page, dialog) {
  const axis = dialog.locator('.axis-editor').first();
  if (!await axis.evaluate(element => element.open)) await axis.locator('summary').click();
  await expect(axis).toHaveJSProperty('open', true);
  await expect(axis.getByLabel(await label(page, '轴模式'), { exact: true })).toBeVisible();
}

for (const locale of ['zh-CN', 'en-US']) {
  test.describe('Automated UI floor / 自动可检 UI 底线 ' + locale, () => {
    test.use({ locale });

    test('automatically detectable WCAG rules across key states / 关键状态的自动 WCAG 检查', { tag: ['@quality'] }, async ({ page, rig }, info) => {
      test.setTimeout(180000);
      const report = createUiQualityReport(page, info, { kind: 'automated', plannedStates: auditStates, plannedChecks: ['audits-never-enable-input'] });
      try {
        await expand(page, await label(page, '旋转、震动与辅助轴'));
        await expand(page, await label(page, '发送设置'));
        await expand(page, await label(page, '录制 L0 目标'));
        await report.audit('control-manual-expanded');

        await card(page, 'Mock UDP').getByRole('button', { name: await label(page, '配置'), exact: true }).click();
        const output = page.getByRole('dialog', { name: await label(page, '输出设置'), exact: true });
        await expect(output).toBeVisible();
        await report.audit('output-settings-dialog');
        await output.getByRole('button', { name: await label(page, '取消'), exact: true }).click();

        await card(page, 'Mock Intiface').getByRole('button', { name: await label(page, '配置'), exact: true }).click();
        const intiface = page.getByRole('dialog', { name: await label(page, '输出设置'), exact: true });
        await expect(intiface.getByLabel(await label(page, '振动来源'), { exact: true })).toHaveValue('V0');
        await intiface.getByLabel(await label(page, '连接方式'), { exact: true }).selectOption('managed');
        await expect(intiface.getByRole('spinbutton', { name: await label(page, '引擎端口'), exact: true })).toBeVisible();
        await report.audit('intiface-settings-dialog');
        await intiface.getByRole('button', { name: await label(page, '取消'), exact: true }).click();

        await page.getByRole('tablist', { name: await label(page, '输入方式'), exact: true })
          .getByRole('tab', { name: await label(page, '脚本'), exact: true }).click();
        await page.locator('input[type=file]').setInputFiles({
          name: 'quality-motion.funscript', mimeType: 'application/json',
          buffer: Buffer.from(JSON.stringify({ actions: [{ at: 0, pos: 0 }, { at: 5000, pos: 100 }, { at: 10000, pos: 0 }] })),
        });
        await expect.poll(async () => (await rig.overview()).input.script.loaded).toBe(true);
        await expect(page.getByRole('button', { name: await label(page, '播放'), exact: true })).toBeEnabled();
        await expand(page, await label(page, '定位与 A-B'));
        await report.audit('control-script-loaded');

        await mode(page, 'OSC');
        await oscWorkspace(page, '映射');
        await page.locator('.mapping-row').first().locator('summary').click();
        await expand(page, await label(page, '管理预设'));
        await report.audit('osc-mappings-expanded');

        await oscWorkspace(page, '参数');
        await rig.send([['CI/Depth', .5], ['CI/Other', .2], ['FT/Unlisted', .7], ['v2/Unlisted', .7]]);
        await expect(page.getByRole('button', { name: 'CI/Depth', exact: true })).toBeVisible();
        await expect(page.getByRole('region', { name: await label(page, 'OSC 参数表'), exact: true })).toBeVisible();
        await report.audit('osc-parameters-populated');

        await expand(page, await label(page, '接收与转发设置'));
        await expand(page, 'OSCQuery');
        await expand(page, 'OSC Hub');
        await report.audit('osc-receiving-and-forwarding-expanded');

        await expand(page, await label(page, 'OGB 参数启用'));
        const ogbDraft = page.locator('.ogb-control-settings');
        const activateOgb = ogbDraft.getByRole('checkbox', { name: await label(page, '向 VRChat 启用 OGB 参数'), exact: true });
        await expect(activateOgb).not.toBeChecked();
        await activateOgb.check();
        await expect(ogbDraft.getByRole('textbox', { name: await label(page, 'VRChat 控制 IP'), exact: true })).toBeEnabled();
        await expect(ogbDraft.getByRole('spinbutton', { name: await label(page, 'VRChat 控制端口'), exact: true })).toBeEnabled();
        await ogbDraft.scrollIntoViewIfNeeded();
        await report.audit('ogb-control-settings');
        await activateOgb.uncheck();

        await workspace(page, '设置');
        await expand(page, await label(page, '查看日志'));
        await report.audit('settings-logs-expanded');

        await page.getByRole('button', { name: await label(page, '修改配置'), exact: true }).click();
        const profile = page.getByRole('dialog', { name: await label(page, '轴配置'), exact: true });
        await expect(profile).toBeVisible();
        await expandFirstAxis(page, profile);
        await report.audit('axis-profile-dialog');
        await profile.getByRole('button', { name: await label(page, '取消'), exact: true }).click();
        await report.check('audits-never-enable-input / 检查不会启用输入', async () => {
          const state = (await rig.overview()).runtime;
          expect(state.inputActive).toBe(false);
          expect(rig.wire.udp.filter(line => /L0\d/.test(line))).toHaveLength(0);
          const config = await page.request.get(rig.baseUrl + '/api/config').then(response => response.json());
          const enabledOutputs = config.outputs.filter(output => output.enabled).length;
          expect(enabledOutputs).toBe(0);
          return { inputActive: state.inputActive, enabledOutputs };
        });
      } catch (error) { report.fail(error); throw error; }
      finally { await report.write(); }
    });

    test('keyboard focus, modal boundaries and narrow reflow / 键盘焦点、对话框边界与窄屏重排', { tag: ['@quality'] }, async ({ page, rig }, info) => {
      test.setTimeout(120000);
      const report = createUiQualityReport(page, info, { kind: 'behavior', plannedChecks: behaviorChecks });
      try {
        const layout = info.project.name === 'desktop' ? 'columns' : 'stacked';
        await report.check('manual-alignment / 主轴对齐', () => inspectManualAlignment(page, layout));
        await report.check('output-row-alignment / 输出对应列', () => inspectOutputAlignment(page, layout));
        await report.check('skip-link-focus-and-target / 跳过导航的焦点与目标', async () => {
          const skip = page.getByRole('link', { name: await label(page, '跳到主要内容'), exact: true });
          await page.keyboard.press('Tab');
          await expect(skip).toBeFocused();
          await expect(skip).toBeVisible();
          const indicator = await inspectFocusIndicator(skip);
          await skip.press('Enter');
          const main = page.locator('main.workspace-scroll');
          await expect(main).toBeFocused();
          await info.attach('main-scrollport-focus-viewport', { body: await page.screenshot(), contentType: 'image/png' });
          const canScroll = await main.evaluate(element => element.scrollHeight > element.clientHeight + 1);
          if (canScroll) {
            await page.keyboard.press('End');
            await expect.poll(() => main.evaluate(element => Math.abs(element.scrollHeight - element.clientHeight - element.scrollTop))).toBeLessThanOrEqual(1);
          }
          const firstControl = page.locator('.control-readiness').getByRole('button', { name: await label(page, '配置输出'), exact: true });
          await page.keyboard.press('Tab');
          await expect(firstControl).toBeFocused();
          const bounds = await firstControl.evaluate(element => {
            const target = element.getBoundingClientRect(), port = element.closest('.workspace-scroll');
            const rect = port.getBoundingClientRect(), header = document.querySelector('.app-header').getBoundingClientRect();
            return { target: { top: target.top, bottom: target.bottom, left: target.left, right: target.right },
              port: { top: rect.top + port.clientTop, bottom: rect.top + port.clientTop + port.clientHeight,
                left: rect.left + port.clientLeft, right: rect.left + port.clientLeft + port.clientWidth },
              headerBottom: header.bottom, viewportHeight: innerHeight, workspaceScrollTop: port.scrollTop };
          });
          expect(bounds.target.top).toBeGreaterThanOrEqual(Math.max(bounds.port.top, bounds.headerBottom) - 1);
          expect(bounds.target.bottom).toBeLessThanOrEqual(Math.min(bounds.port.bottom, bounds.viewportHeight) + 1);
          expect(bounds.target.left).toBeGreaterThanOrEqual(bounds.port.left - 1);
          expect(bounds.target.right).toBeLessThanOrEqual(bounds.port.right + 1);
          const emergency = page.locator('.app-header').getByRole('button', { name: await label(page, '紧急停止'), exact: true });
          await expect(emergency).toBeVisible();
          await expect(emergency).toBeInViewport({ ratio: 1 });
          return { indicator, destination: 'main', focusEvidence: 'main-scrollport-focus-viewport', canScroll,
            tabTarget: await firstControl.getAttribute('id'), bounds, emergencyVisible: true };
        });

        await report.check('tabs-keyboard-and-control-boundary / 页签键盘与控制边界', async () => {
          const before = await rig.overview();
          const main = page.locator('main.workspace-scroll');
          await main.focus();
          await page.keyboard.press('End');
          const previousScrollTop = await main.evaluate(element => element.scrollTop);
          const navigation = page.getByRole('tablist', { name: await label(page, '主导航'), exact: true });
          const control = navigation.getByRole('tab', { name: await label(page, '控制'), exact: true });
          await control.focus();
          await control.press('ArrowRight');
          const osc = navigation.getByRole('tab', { name: 'OSC', exact: true });
          await expect(osc).toBeFocused(); await expect(osc).toHaveAttribute('aria-selected', 'true');
          await expect.poll(() => main.evaluate(element => element.scrollTop), { message: 'Workspace navigation returns to top / 工作区导航回到顶部' }).toBe(0);
          const focus = await inspectFocusIndicator(osc);
          const panel = page.locator('#' + await osc.getAttribute('aria-controls'));
          await expect(panel).toHaveAttribute('aria-labelledby', await osc.getAttribute('id'));
          await osc.press('End');
          const settings = navigation.getByRole('tab', { name: await label(page, '设置'), exact: true });
          await expect(settings).toBeFocused();
          await settings.press('Home'); await expect(control).toBeFocused();
          const after = await rig.overview();
          expect(after.input.mode).toBe(before.input.mode);
          expect(after.runtime.inputActive).toBe(false);
          return { beforeMode: before.input.mode, afterMode: after.input.mode, focus, previousScrollTop,
            afterNavigationScrollTop: await main.evaluate(element => element.scrollTop) };
        });

        await report.check('native-dialog-focus-trap-escape-return / 原生对话框焦点圈定、Escape 与焦点恢复', async () => {
          const trigger = card(page, 'Mock UDP').getByRole('button', { name: await label(page, '配置'), exact: true });
          await trigger.click();
          const dialog = page.getByRole('dialog', { name: await label(page, '输出设置'), exact: true });
          const close = dialog.getByRole('button', { name: await label(page, '关闭'), exact: true });
          await expect(close).toBeFocused();
          // The emergency action may precede Close. Test actual tab boundaries, not a fixed DOM order.
          // 急停入口可能在关闭按钮之前；检查真实首尾焦点，而非固定 DOM 顺序。
          const focusable = dialog.locator('button:visible:not([disabled]), input:visible:not([disabled]), select:visible:not([disabled]), textarea:visible:not([disabled]), a[href]:visible, [tabindex="0"]:visible');
          const first = focusable.first(), last = focusable.last();
          await first.focus();
          await first.press('Shift+Tab');
          await attachModalFocus(dialog, info, 'backward-boundary');
          await expect(last).toBeFocused();
          await last.press('Tab');
          await attachModalFocus(dialog, info, 'forward-boundary');
          await expect(first).toBeFocused();
          await close.focus();
          const focus = await inspectFocusIndicator(close);

          const name = dialog.getByRole('textbox', { name: await label(page, '名称'), exact: true });
          await name.fill('Unsaved quality draft');
          const emergency = dialog.getByRole('button', { name: await label(page, '紧急停止'), exact: true });
          await expect(emergency).toBeVisible(); await expect(emergency).toBeEnabled();
          await emergency.click();
          await expect.poll(async () => (await rig.overview()).runtime.isEmergency).toBe(true);
          await expect(dialog).toBeVisible(); await expect(name).toHaveValue('Unsaved quality draft');
          await dialog.getByRole('button', { name: await label(page, '解除急停'), exact: true }).click();
          await expect.poll(async () => (await rig.overview()).runtime.isEmergency).toBe(false);
          expect((await rig.overview()).runtime.inputActive).toBe(false);
          await expect(dialog).toBeVisible(); await expect(name).toHaveValue('Unsaved quality draft');

          await close.press('Escape');
          await expect(dialog).toBeHidden(); await expect(trigger).toBeFocused();
          const config = await page.request.get(rig.baseUrl + '/api/config').then(response => response.json());
          expect(config.outputs.find(output => output.id === 'udp').name).toBe('Mock UDP');
          expect(config.outputs.filter(output => output.enabled)).toHaveLength(0);
          return { focus, emergencyAccessible: true, emergencyCleared: true, inputActive: false,
            draftPreservedDuringStop: true, escapeClosed: true, focusRestored: true };
        });

        await oscWorkspace(page, '映射');
        await report.check('mapping-alignment / 映射控件对齐', () => inspectMappingAlignment(page));
        await workspace(page, '控制');
        await page.setViewportSize({ width: 320, height: 800 });
        await workspace(page, '控制');
        await report.check('reflow-320-control / 控制页 320 CSS px 重排', () => inspectReflow(page));
        await expand(page, await label(page, '发送设置'));
        await report.check('target-samples-buttons / 按钮命中区域抽检', () => inspectBasicTargets(page, page.locator('.app-header button, .manual-workspace button'), 'Button'));
        await report.check('target-samples-toggle-label / 开关标签命中区域抽检', async () => {
          const labels = await inspectBasicTargets(page, page.locator('.app-header .toggle, .manual-workspace .toggle'), 'Toggle label');
          const accessibleName = await label(page, '连续发送');
          const checkbox = page.locator('.manual-workspace').getByRole('checkbox', { name: accessibleName, exact: true });
          await expect(checkbox).toBeEnabled();
          await expect(checkbox).not.toBeChecked();
          await expect(checkbox).toHaveAccessibleName(accessibleName);
          const native = await checkbox.evaluate(element => {
            const rect = element.getBoundingClientRect();
            return { tag: element.tagName.toLowerCase(), type: element.type, tabIndex: element.tabIndex,
              roleAttribute: element.getAttribute('role'), disabled: element.disabled,
              labelTexts: [...element.labels].map(label => label.textContent.trim()),
              width: rect.width, height: rect.height };
          });
          expect(native.tag).toBe('input');
          expect(native.type).toBe('checkbox');
          expect(native.tabIndex).toBeGreaterThanOrEqual(0);
          expect(native.disabled).toBe(false);
          expect(native.labelTexts).toContain(accessibleName);
          const hitArea = await inspectBasicTargets(page, checkbox, 'Native checkbox input');
          const config = await page.request.get(rig.baseUrl + '/api/config').then(response => response.json());
          expect(config.outputs.filter(output => output.enabled)).toHaveLength(0);
          expect((await rig.overview()).runtime.inputActive).toBe(false);

          // Click the real associated text, then use native Space; the painted box size is not a contract.
          // 点击真实关联文字，再用原生 Space 还原；不把绘制方框尺寸当作契约。
          const labelText = checkbox.locator('..').locator(':scope > span');
          await expect(labelText).toHaveText(accessibleName);
          await labelText.click();
          await expect(checkbox).toBeChecked();
          await checkbox.press('Space');
          await expect(checkbox).not.toBeChecked();
          const focus = await inspectFocusIndicator(checkbox);
          let forcedColors;
          try {
            await page.emulateMedia({ forcedColors: 'active' });
            await expect(checkbox).toBeVisible();
            await expect(checkbox).toHaveAccessibleName(accessibleName);
            const mediaActive = await page.evaluate(() => matchMedia('(forced-colors: active)').matches);
            const appearance = await checkbox.evaluate(element => getComputedStyle(element).appearance);
            expect(mediaActive).toBe(true);
            expect(appearance).toBe('auto');
            const hitArea = await inspectBasicTargets(page, checkbox, 'Forced-colors native checkbox');
            await expect(checkbox).not.toBeChecked();
            await labelText.click();
            await expect(checkbox).toBeChecked();
            await checkbox.press('Space');
            await expect(checkbox).not.toBeChecked();
            forcedColors = { mediaActive, appearance, hitArea, labelClickChecked: true, spaceRestoredUnchecked: true,
              focus: await inspectFocusIndicator(checkbox) };
          } finally { await page.emulateMedia({ forcedColors: 'none' }); }
          const inputActive = (await rig.overview()).runtime.inputActive;
          expect(inputActive).toBe(false);
          expect(rig.wire.udp.filter(line => /L0\d/.test(line))).toHaveLength(0);
          return { labels, native, accessibleName, hitArea, labelClickChecked: true, spaceRestoredUnchecked: true,
            focus, forcedColors, inputActive, enabledOutputs: 0 };
        });
        await report.check('target-samples-select-and-slider / 选择框与滑条命中区域抽检', () => inspectBasicTargets(page, page.locator('.manual-workspace select, .manual-primary input[type=range]'), 'Select and slider'));

        await oscWorkspace(page, '映射');
        await page.locator('.mapping-row').first().locator('summary').click();
        await report.check('reflow-320-mapping-expanded / 映射展开时 320 CSS px 重排', async () => ({
          reflow: await inspectReflow(page), alignment: await inspectMappingAlignment(page),
          fields: await inspectNarrowFormAlignment(page.locator('.mapping-row').first()),
        }));
        await report.check('target-samples-fields-and-disclosures / 字段与折叠区命中区域抽检', () => inspectBasicTargets(page, page.locator('.mapping-row').first().locator('input:not([type=checkbox]), select, summary'), 'Field and summary'));

        await mode(page, 'OSC');
        await oscWorkspace(page, '参数');
        await rig.send([['CI/ReflowDepth', .5]]);
        await expect(page.getByRole('button', { name: 'CI/ReflowDepth', exact: true })).toBeVisible();
        await report.check('reflow-320-parameter-scroll-region / 参数滚动区 320 CSS px 重排', async () => {
          const region = page.getByRole('region', { name: await label(page, 'OSC 参数表'), exact: true });
          await region.focus(); await expect(region).toBeFocused();
          return { ...await inspectReflow(page), keyboardRegion: await region.getAttribute('aria-label') };
        });

        await workspace(page, '设置');
        await report.check('reflow-320-settings / 设置页 320 CSS px 重排', () => inspectReflow(page));
        await page.getByRole('button', { name: await label(page, '修改配置'), exact: true }).click();
        const profile = page.getByRole('dialog', { name: await label(page, '轴配置'), exact: true });
        await expandFirstAxis(page, profile);
        await report.check('reflow-320-profile-dialog / 轴配置对话框 320 CSS px 重排', async () => ({
          reflow: await inspectReflow(page), fields: await inspectNarrowFormAlignment(profile),
        }));
        await profile.getByRole('button', { name: await label(page, '取消'), exact: true }).click();
        await report.check('checks-never-enable-input / 检查不会启用输入', async () => {
          const inputActive = (await rig.overview()).runtime.inputActive;
          expect(inputActive).toBe(false);
          expect(rig.wire.udp.filter(line => /L0\d/.test(line))).toHaveLength(0);
          return { inputActive };
        });
      } catch (error) { report.fail(error); throw error; }
      finally { await report.write(); }
    });
  });
}
