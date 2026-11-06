import { test, expect, text, workspace, card } from './fixtures.js';

async function configuration(page, rig) {
  const response = await page.request.get(rig.baseUrl + '/api/config');
  expect(response.ok()).toBe(true);
  return response.json();
}

async function unchanged(page, rig, config, mutations) {
  expect(await configuration(page, rig)).toEqual(config);
  expect(rig.commands.filter(command => command.method !== 'GET')).toHaveLength(mutations);
  expect((await rig.overview()).runtime.inputActive).toBe(false);
  await expect(page.getByRole('switch', { name: await text(page, '输入启用'), exact: true })).not.toBeChecked();
  expect(Object.values(rig.wire).every(lane => lane.length === 0)).toBe(true);
}

async function requireSceneLaunchpad(page) {
  await expect(page.getByTestId('getting-started')).toBeVisible();
  await expect(page.getByTestId('setup-task-script')).toBeVisible();
}

for (const locale of ['zh-CN', 'en-US']) {
  test.describe('Beginner task paths / 新手任务路径 ' + locale, () => {
    test.use({ locale });

    test.describe('empty configuration / 空配置', () => {
      test.use({ scenario: 'first-run' });
      test('first-run tasks reach usable setup without applying a mode or enabling input / 首次使用任务可直达设置且不应用或启用输入',
        { tag: ['@beginner', '@config', '@quality', '@i18n', '@osc-flow-preflight'] }, async ({ page, rig }, info) => {
          const config = await configuration(page, rig), mutations = rig.commands.filter(command => command.method !== 'GET').length;
          const chooser = page.getByTestId('getting-started');
          await expect(chooser).toBeVisible();
          await expect(chooser).toHaveClass(/scene-launchpad--welcome/);
          await expect(chooser.locator('[data-testid^="setup-task-"]')).toHaveCount(4);
          for (const task of ['osc', 'script', 'manual', 'protocol']) await expect(chooser.getByTestId('setup-task-' + task)).toBeVisible();
          await chooser.getByTestId('setup-task-script').click();
          await expect(page.locator('#input-tabs-script')).toBeFocused();
          await expect(page.locator('#input-tabs-script')).toHaveAttribute('aria-selected', 'true');
          await expect(page.getByRole('button', { name: await text(page, '应用输入方式'), exact: true })).toBeVisible();
          expect((await rig.overview()).input.mode).toBe('manual');

          await chooser.getByTestId('setup-task-osc').click();
          await expect(page.locator('#workspace-tabs-osc')).toHaveAttribute('aria-selected', 'true');
          await expect(page.locator('#osc-tabs-setup')).toHaveAttribute('aria-selected', 'true');
          await expect(page.locator('.preset-strip')).toBeInViewport();
          expect(await page.locator('.preset-strip').evaluate(region => region.contains(document.activeElement))).toBe(true);
          await workspace(page, '控制');
          await chooser.getByTestId('setup-task-protocol').click();
          await expect(page.locator('#workspace-tabs-settings')).toHaveAttribute('aria-selected', 'true');
          const protocol = page.getByTestId('protocol-inputs-panel');
          await expect(protocol).toBeInViewport();
          expect(await protocol.evaluate(region => region.contains(document.activeElement))).toBe(true);
          expect((await rig.overview()).input.mode).toBe('manual');
          await workspace(page, '控制');
          await chooser.getByTestId('setup-task-manual').click();
          await expect(page.locator('#input-tabs-manual')).toBeFocused();
          await expect(page.getByRole('slider', { name: await text(page, 'L0 主轴'), exact: true })).toBeVisible();
          await chooser.getByTestId('setup-connect-device').click();
          await expect(page.getByTestId('output-type')).toBeFocused();
          await expect(page.getByTestId('add-output')).toBeInViewport();
          await unchanged(page, rig, config, mutations);
          await info.attach('first-run-task-navigation.json', { body: JSON.stringify({ locale,
            tasks: ['osc', 'script', 'manual', 'protocol'], mode: 'manual', inputActive: false, configUnchanged: true }), contentType: 'application/json' });
        });
    });

    test('existing connections keep task shortcuts compact and return to the selected output without enabling it / 已有连接保留紧凑任务入口且可定位输出而不启用',
      { tag: ['@beginner', '@config', '@quality', '@i18n'] }, async ({ page, rig }, info) => {
        const config = await configuration(page, rig), mutations = rig.commands.filter(command => command.method !== 'GET').length;
        const launchpad = page.getByTestId('getting-started');
        await expect(launchpad).toHaveClass(/scene-launchpad--compact/);
        await requireSceneLaunchpad(page);
        const script = launchpad.getByTestId('setup-task-script');
        await script.focus(); await script.press('Enter');
        await expect(page.locator('#input-tabs-script')).toBeFocused();
        await expect(page.getByRole('button', { name: await text(page, '应用输入方式'), exact: true })).toBeVisible();
        expect((await rig.overview()).input.mode).toBe('manual');
        await requireSceneLaunchpad(page);
        await page.getByTestId('setup-connect-device').click();
        await expect(page.getByTestId('output-type')).toBeFocused();
        await expect(card(page, 'Mock UDP').getByRole('button', { name: await text(page, '启用'), exact: true })).toBeEnabled();
        await unchanged(page, rig, config, mutations);
        await info.attach('scene-shortcut-navigation.json', { body: JSON.stringify({ locale, keyboardActivated: true,
          configurationUnchanged: true, mode: 'manual', inputActive: false }), contentType: 'application/json' });
      });

    test('more motion axes open by keyboard and preserve drafts across disclosure, language and task changes / 更多动作轴键盘展开且跨折叠语言任务保留草稿',
      { tag: ['@beginner', '@input', '@quality', '@i18n'] }, async ({ page, rig }, info) => {
        const config = await configuration(page, rig), mutations = rig.commands.filter(command => command.method !== 'GET').length;
        const manual = page.locator('.manual-workspace'), details = manual.getByTestId('manual-more-axes'), summary = details.locator('summary');
        const l0 = manual.locator('.manual-primary input[type=number]');
        const l1 = manual.locator('input[type=number]').nth(1);
        await expect(manual.getByRole('slider')).toHaveCount(1);
        await expect(details).not.toHaveAttribute('open');
        await summary.focus(); await summary.press('Enter');
        await expect(details).toHaveAttribute('open', '');
        await expect(summary).toBeFocused();
        await expect(manual.getByRole('slider')).toHaveCount(12);
        await l0.fill('615'); await l1.fill('735');
        const r0 = manual.locator('input[type=number]').nth(3);
        await r0.fill('285');
        await summary.focus(); await summary.press('Space');
        await expect(details).not.toHaveAttribute('open');
        await expect(l1).toBeHidden();
        await expect(l0).toHaveValue('615');
        await page.getByLabel('Language / 语言').selectOption(locale === 'zh-CN' ? 'en-US' : 'zh-CN');
        await expect(summary).toContainText(locale === 'zh-CN' ? 'More motion axes' : '更多动作轴');
        await summary.focus(); await summary.press('Enter');
        await expect(l1).toHaveValue('735');
        await expect(manual.locator('input[type=number]').nth(3)).toHaveValue('285');
        await requireSceneLaunchpad(page); await page.getByTestId('setup-task-script').click();
        await requireSceneLaunchpad(page); await page.getByTestId('setup-task-manual').click();
        await expect(l0).toHaveValue('615');
        if (await details.getAttribute('open') === null) await summary.click();
        await expect(l1).toHaveValue('735');
        await expect(manual.locator('input[type=number]').nth(3)).toHaveValue('285');
        await unchanged(page, rig, config, mutations);
        await info.attach('manual-disclosure-drafts.json', { body: JSON.stringify({ locale, visiblePrimaryAxes: 1,
          expandedAxes: 12, drafts: { L0: 615, L1: 735, R0: 285 }, inputActive: false }), contentType: 'application/json' });
      });
  });
}
