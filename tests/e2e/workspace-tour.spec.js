import { test, expect, text, workspace, oscWorkspace } from './fixtures.js';

async function captureSpotlight(page, info, selector, name) {
  const target = page.locator(selector), highlight = page.getByTestId('tour-highlight');
  await expect.poll(async () => {
    const source = await target.boundingBox(), focus = await highlight.boundingBox();
    return Boolean(source && focus && Math.abs(focus.x - Math.max(4, source.x - 6)) < 1
      && Math.abs(focus.y - Math.max(4, source.y - 6)) < 1 && focus.width >= Math.min(source.width, page.viewportSize().width - 8));
  }).toBe(true);
  const next = page.getByTestId('onboarding-next');
  const hit = await next.evaluate(element => {
    const rect = element.getBoundingClientRect();
    return element.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
  });
  expect(hit, 'Next is visible and clickable without scrolling the guide').toBe(true);
  await info.attach(name, { body: await page.screenshot(), contentType: 'image/png' });
}

for (const locale of ['zh-CN', 'en-US']) {
  test.describe('Separate stages and spotlight tour ' + locale, () => {
    test.use({ locale });
    test('real controls remain usable under the spotlight, progress survives Escape, and presets stay drafts',
      { tag: ['@onboarding', '@config', '@i18n'] }, async ({ page, rig }, info) => {
        const before = await page.request.get(rig.baseUrl + '/api/config').then(response => response.json());
        const mutations = rig.commands.filter(command => command.method !== 'GET').length;
        for (const [id, present, absent] of [
          ['control', '.input-section', '.outputs-section'], ['pipeline', '.mapping-workspace', '.input-section'],
          ['axes', '.axis-profiles-section', '.outputs-section'], ['outputs', '.outputs-section', '.input-section'],
        ]) {
          await page.locator('#workspace-tabs-' + id).click();
          await expect(page.locator(present)).toBeVisible(); await expect(page.locator(absent)).toHaveCount(0);
        }
        await workspace(page, '输入'); await page.getByTestId('onboarding-start').click();
        await page.getByTestId('onboarding-goal-manual').click(); await page.getByTestId('onboarding-next').click();
        await expect(page.getByTestId('guided-tour')).toHaveAttribute('data-step', 'input');
        await expect(page.getByTestId('tour-highlight')).toBeVisible();
        await captureSpotlight(page, info, '.manual-primary', 'spotlight-input-' + locale);
        const target = await page.locator('.manual-primary').boundingBox();
        const highlight = await page.getByTestId('tour-highlight').boundingBox();
        expect(highlight.x).toBeLessThanOrEqual(target.x); expect(highlight.y).toBeLessThanOrEqual(target.y);
        expect(highlight.width).toBeGreaterThanOrEqual(target.width);
        const control = page.locator('.manual-primary input[type=range]');
        const value = page.locator('.manual-primary input[type=number]');
        await value.click(); await value.fill('650');
        await expect(control).toHaveValue('650');
        await control.focus(); await page.keyboard.press('Tab');
        await expect(page.getByTestId('guided-tour').locator('.guided-tour__card')).toBeVisible();
        await page.keyboard.press('Escape'); await expect(page.getByTestId('guided-tour')).toHaveCount(0);
        await expect(value).toHaveValue('650');
        await page.getByTestId('onboarding-resume').click();
        await expect(page.getByTestId('guided-tour')).toHaveAttribute('data-step', 'input');
        await page.getByTestId('onboarding-next').click();
        await expect(page.locator('#workspace-tabs-pipeline')).toHaveAttribute('aria-selected', 'true');
        await expect(page.getByTestId('tour-highlight')).toBeVisible();
        await captureSpotlight(page, info, '.preset-strip', 'spotlight-mapping-' + locale);
        await page.getByTestId('onboarding-step-axes').click();
        await expect(page.locator('#workspace-tabs-axes')).toHaveAttribute('aria-selected', 'true');
        await captureSpotlight(page, info, '.axis-profiles-section > .section__header', 'spotlight-axes-' + locale);
        await page.getByTestId('onboarding-panel').getByRole('button', { name: await text(page, '选择设备动作预设'), exact: true }).click();
        await expect(page.getByTestId('scene-presets-dialog')).toBeVisible();
        await expect(page.getByTestId('guided-tour')).toHaveCount(0);
        await page.getByRole('dialog', { name: await text(page, '场景预设'), exact: true }).getByRole('button', { name: await text(page, '关闭预设'), exact: true }).click();
        await expect(page.getByTestId('guided-tour')).toBeVisible();
        await page.getByTestId('onboarding-step-ready').click();
        await page.getByTestId('onboarding-complete').click();
        await expect(page.getByRole('switch', { name: await text(page, '输入启用'), exact: true })).not.toBeChecked();
        expect(rig.commands.filter(command => command.method !== 'GET')).toHaveLength(mutations);
        expect(await page.request.get(rig.baseUrl + '/api/config').then(response => response.json())).toEqual(before);
        await workspace(page, '流程');
        await page.getByRole('button', { name: new RegExp(await text(page, '手动信号平滑')) }).click();
        const draft = page.getByTestId('computed-signal-card'); await expect(draft).toHaveCount(1);
        await expect(draft.getByTestId('computed-operation')).toHaveValue('Smooth');
        await oscWorkspace(page, '映射'); await workspace(page, '轴配置'); await workspace(page, '输出'); await workspace(page, '流程');
        await expect(draft.getByTestId('computed-operation')).toHaveValue('Smooth');
        expect(await page.request.get(rig.baseUrl + '/api/config').then(response => response.json())).toEqual(before);
        await info.attach('separate-workspaces-and-tour', { body: JSON.stringify({ locale, sourceCommit: process.env.SENSA_SOURCE_COMMIT,
          target, highlight, navigationMutations: 0, draftSurvivedNavigation: true, inputActive: (await rig.overview()).runtime.inputActive }), contentType: 'application/json' });
      });
  });
}
