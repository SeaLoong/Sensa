import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { test, expect, text, workspace, oscWorkspace } from './fixtures.js';
import { inspectFocusIndicator, inspectReflow } from './ui-quality.js';

async function configuration(page, rig) {
  const response = await page.request.get(rig.baseUrl + '/api/config');
  expect(response.ok()).toBe(true);
  return response.json();
}

async function snapshot(page, rig) {
  return { config: await configuration(page, rig), mutations: rig.commands.filter(command => command.method !== 'GET').length,
    wire: structuredClone(rig.wire) };
}

async function unchanged(page, rig, before) {
  expect(await configuration(page, rig)).toEqual(before.config);
  expect(rig.commands.filter(command => command.method !== 'GET')).toHaveLength(before.mutations);
  expect(rig.wire).toEqual(before.wire);
  expect((await rig.overview()).input.mode).toBe('manual');
  expect((await rig.overview()).runtime).toMatchObject({ inputActive: false, isEmergency: false });
  await expect(page.getByRole('switch', { name: await text(page, '输入启用'), exact: true })).not.toBeChecked();
}

async function attachState(page, info, name, locale, details) {
  await expect(page.locator('.toast[role=alert]')).toHaveCount(0);
  await expect(page.locator('.toast')).toHaveCount(0, { timeout: 10000 });
  const pngPath = info.outputPath(name + '.png');
  await page.screenshot({ path: pngPath, animations: 'disabled', caret: 'hide' });
  const bytes = await readFile(pngPath);
  const proof = { schema: 1, sourceCommit: process.env.SENSA_SOURCE_COMMIT || process.env.GITHUB_SHA,
    runId: process.env.GITHUB_RUN_ID, attempt: process.env.GITHUB_RUN_ATTEMPT, testId: info.testId,
    project: info.project.name, locale, attachment: name, sha256: createHash('sha256').update(bytes).digest('hex'),
    ...details };
  const proofPath = info.outputPath(name + '-source.json');
  await writeFile(proofPath, JSON.stringify(proof, null, 2));
  await info.attach(name, { path: pngPath, contentType: 'image/png' });
  await info.attach(name + '-source', { path: proofPath, contentType: 'application/json' });
}

async function oscTabsGeometry(page) {
  const tabs = page.getByRole('tablist', { name: await text(page, 'OSC 工作区'), exact: true });
  await expect(tabs).toHaveClass(/tabs--segmented/);
  const geometry = await tabs.evaluate(element => {
    const box = node => { const value = node.getBoundingClientRect(); return { left: value.left, right: value.right,
      top: value.top, bottom: value.bottom, width: value.width, height: value.height }; };
    return { viewport: innerWidth, container: box(element), tabs: [...element.querySelectorAll('[role=tab]')].map(node => ({
      ...box(node), id: node.id, text: node.textContent.trim(), selected: node.getAttribute('aria-selected'),
      tabIndex: node.tabIndex, controls: node.getAttribute('aria-controls'),
      clientWidth: node.clientWidth, scrollWidth: node.scrollWidth })) };
  });
  expect(geometry.tabs).toHaveLength(3);
  expect(geometry.tabs.filter(tab => tab.selected === 'true')).toHaveLength(1);
  expect(geometry.tabs.filter(tab => tab.tabIndex === 0)).toHaveLength(1);
  expect(geometry.container.left).toBeGreaterThanOrEqual(0);
  expect(geometry.container.right).toBeLessThanOrEqual(geometry.viewport + 1);
  for (const tab of geometry.tabs) {
    expect(tab.width, 'Segment labels retain usable hit areas / 分段页签标签有可用命中区域').toBeGreaterThanOrEqual(32);
    expect(tab.height).toBeGreaterThanOrEqual(32);
    expect(tab.left).toBeGreaterThanOrEqual(geometry.container.left - 1);
    expect(tab.right).toBeLessThanOrEqual(geometry.container.right + 1);
    expect(tab.text).toBeTruthy();
    expect(tab.controls).toBe('osc-tabs-panel');
    expect(tab.scrollWidth, 'Segment label fits its control / 分段标签完整容纳于控件').toBeLessThanOrEqual(tab.clientWidth + 1);
  }
  return geometry;
}

for (const locale of ['zh-CN', 'en-US']) {
  test.describe('OSC and Flow ownership / OSC 与流程职责 ' + locale, () => {
    test.use({ locale });

    test('segmented OSC navigation preserves one Flow draft and separate saved output and plan scopes / OSC分段导航保留唯一流程草稿并区分输出和方案保存范围',
      { tag: ['@osc', '@config', '@input', '@i18n', '@osc-flow-preflight'] }, async ({ page, rig }, info) => {
        const initial = await snapshot(page, rig), viewport = page.viewportSize();
        await oscWorkspace(page, '映射');
        const tabs = page.getByRole('tablist', { name: await text(page, 'OSC 工作区'), exact: true });
        await expect(tabs.getByRole('tab')).toHaveText([await text(page, '映射'), await text(page, '参数'), await text(page, '实验诊断')]);
        const map = tabs.locator('#osc-tabs-setup');
        await expect(page.getByTestId('computed-signals-editor')).toHaveCount(0);
        const path = page.locator('.mapping-row').first().getByLabel(await text(page, '参数路径'), { exact: true });
        await path.fill('CI/UncommittedMap');
        await map.focus();
        const sequence = [
          ['ArrowRight', 'parameters'], ['ArrowRight', 'experimental'], ['ArrowRight', 'setup'],
          ['ArrowLeft', 'experimental'], ['Home', 'setup'], ['End', 'experimental'], ['Home', 'setup'],
        ];
        for (const [key, selected] of sequence) {
          await page.keyboard.press(key);
          const tab = tabs.locator('#osc-tabs-' + selected);
          await expect(tab).toBeFocused();
          await expect(tab).toHaveAttribute('aria-selected', 'true');
          await expect(page.locator('#osc-tabs-panel')).toHaveAttribute('aria-labelledby', 'osc-tabs-' + selected);
          await expect(page.getByTestId('computed-signals-editor')).toHaveCount(0);
          if (selected === 'parameters') await expect(page.getByRole('searchbox', { name: await text(page, '搜索参数'), exact: true })).toBeVisible();
          else if (selected === 'experimental') await expect(page.getByRole('checkbox', { name: await text(page, '允许实验空间输入'), exact: true })).toBeVisible();
          else await expect(page.getByTestId('axis-mappings-panel')).toBeVisible();
        }
        await expect(path).toHaveValue('CI/UncommittedMap');
        const focus = await inspectFocusIndicator(map), geometry = [];
        try {
          for (const width of [...new Set([viewport.width, 320, 390])]) {
            await page.setViewportSize({ ...viewport, width });
            geometry.push(await oscTabsGeometry(page));
            if (width === 320) await inspectReflow(page);
          }
        } finally { await page.setViewportSize(viewport); }
        await unchanged(page, rig, initial);

        await page.getByTestId('edit-computations').click();
        await expect(page.locator('#workspace-tabs-pipeline')).toHaveAttribute('aria-selected', 'true');
        const editor = page.getByTestId('computed-signals-editor');
        await expect(editor).toHaveCount(1); await expect(editor).toBeVisible();
        await expect.poll(() => editor.evaluate(element => element.contains(document.activeElement))).toBe(true);
        await expect(page.locator('.output-card')).toHaveCount(0);
        const routing = page.getByTestId('flow-output-routing');
        await expect(routing.locator('[data-output-id]')).toHaveCount(initial.config.outputs.length);
        await expect(routing.getByRole('button', { name: await text(page, '启用'), exact: true })).toHaveCount(0);

        await editor.getByRole('button', { name: await text(page, '新增计算信号'), exact: true }).click();
        const calculation = editor.getByTestId('computed-signal-card');
        await expect(calculation).toHaveCount(1);
        await calculation.getByRole('textbox', { name: await text(page, '信号名称'), exact: true }).fill('Pending blend');
        await workspace(page, 'OSC');
        const toolbar = page.getByTestId('signal-draft-toolbar');
        await expect(toolbar.getByTestId('save-signal-drafts')).toBeDisabled();
        await expect(toolbar).toContainText(await text(page, '待填写'));
        await page.getByTestId('edit-computations').click();
        await expect(calculation).toHaveJSProperty('open', true);
        const inputs = calculation.getByTestId('computed-input-row');
        for (const [index, value] of [[0, '.25'], [1, '.75']]) {
          await inputs.nth(index).getByTestId('signal-source-mode').selectOption('Constant');
          await inputs.nth(index).getByRole('spinbutton', { name: await text(page, '固定数值'), exact: true }).fill(value);
        }
        await calculation.getByRole('button', { name: await text(page, '用于轴映射'), exact: true }).click();
        await expect(page.locator('#osc-tabs-setup')).toHaveAttribute('aria-selected', 'true');
        const mappings = page.locator('.mapping-row');
        await expect(mappings).toHaveCount(initial.config.signals.length + 1);
        await expect(mappings.last().getByRole('combobox', { name: await text(page, '计算信号'), exact: true })).toHaveValue('Signal1');
        await expect.poll(() => mappings.last().evaluate(element => element.contains(document.activeElement))).toBe(true);
        await expect(page.getByTestId('computed-signals-editor')).toHaveCount(0);
        await page.getByTestId('edit-computations').click();
        await expect(calculation).toHaveJSProperty('open', true);
        await expect(calculation.getByRole('textbox', { name: await text(page, '信号名称'), exact: true })).toHaveValue('Pending blend');
        await expect(inputs.nth(0).getByRole('spinbutton', { name: await text(page, '固定数值'), exact: true })).toHaveValue('0.25');
        await expect(inputs.nth(1).getByRole('spinbutton', { name: await text(page, '固定数值'), exact: true })).toHaveValue('0.75');
        await expect(calculation.getByTestId('computed-signal-value')).toHaveText('—');
        await expect(toolbar.getByTestId('save-signal-drafts')).toBeEnabled();
        await expect(toolbar).toContainText(await text(page, '计算信号与轴映射一起保存或恢复；输出连接单独保存。'));
        await unchanged(page, rig, initial);

        const planPanel = page.getByTestId('signal-plan-panel');
        await planPanel.locator(':scope > summary').click();
        await expect(planPanel).toContainText(await text(page, '导出当前已保存的配置，不包含未保存草稿。'));
        const downloadPromise = page.waitForEvent('download');
        await planPanel.getByTestId('signal-plan-export').click();
        const download = await downloadPromise;
        const plan = JSON.parse(await readFile(await download.path(), 'utf8'));
        expect(plan.kind).toBe('SensaSignalPlan');
        expect(plan.computedSignals).toEqual(initial.config.computedSignals);
        expect(plan.signals).toEqual(initial.config.signals);
        expect(plan.axisProfiles).toEqual(initial.config.axisProfiles);
        expect(plan.outputs.every(output => output.enabled === false)).toBe(true);
        await unchanged(page, rig, initial);
        await page.locator('.workspace-scroll').evaluate(element => element.scrollTo({ top: 0, left: 0, behavior: 'instant' }));
        await attachState(page, info, 'osc-flow-drafts', locale, { computedDrafts: 1,
          mappingDrafts: initial.config.signals.length + 1, savedComputations: 0, savedPlanExcludesDrafts: true });

        const route = routing.locator('[data-output-id="udp"]');
        await route.getByTestId('edit-output-bindings').click();
        const dialog = page.getByRole('dialog', { name: await text(page, '输出设置'), exact: true });
        const bindings = dialog.getByTestId('output-bindings-section');
        await expect(bindings).toBeVisible();
        await expect(bindings).toHaveJSProperty('open', true);
        await expect.poll(() => bindings.evaluate(element => element.contains(document.activeElement))).toBe(true);
        await bindings.getByRole('button', { name: await text(page, '新增连接'), exact: true }).click();
        const connection = bindings.getByTestId('output-binding');
        await expect(connection).toHaveCount(1);
        await connection.getByTestId('signal-source-mode').selectOption('Computed');
        await expect(connection.getByRole('combobox', { name: await text(page, '计算信号'), exact: true }).locator('option[value="Signal1"]')).toHaveCount(0);
        await unchanged(page, rig, initial);
        await attachState(page, info, 'osc-flow-output-dialog', locale, { outputId: 'udp', bindingSectionOpen: true,
          pendingCalculationExcluded: true, separateOutputSave: true });
        await dialog.getByRole('button', { name: await text(page, '取消'), exact: true }).click();
        await expect(dialog).toBeHidden();
        await unchanged(page, rig, initial);

        await route.getByTestId('edit-output-bindings').click();
        await expect(dialog.getByTestId('output-binding')).toHaveCount(0);
        await dialog.getByRole('textbox', { name: await text(page, '名称'), exact: true }).fill('Flow UDP ' + locale);
        await dialog.getByRole('button', { name: await text(page, '保存输出'), exact: true }).click();
        await expect(dialog).toBeHidden();
        await expect.poll(async () => (await configuration(page, rig)).outputs.find(output => output.id === 'udp')?.name).toBe('Flow UDP ' + locale);
        await expect.poll(() => rig.commands.filter(command => command.method !== 'GET').length).toBe(initial.mutations + 1);
        await expect.poll(() => rig.commands.filter(command => command.method !== 'GET').at(-1)?.response).toEqual({ ok: true });
        const outputSaved = await snapshot(page, rig);
        expect(outputSaved.mutations).toBe(initial.mutations + 1);
        expect(rig.commands.filter(command => command.method !== 'GET').at(-1)).toMatchObject({ method: 'PUT', path: '/api/config' });
        expect(outputSaved.wire).toEqual(initial.wire);
        expect(outputSaved.config.computedSignals).toEqual(initial.config.computedSignals);
        expect(outputSaved.config.signals).toEqual(initial.config.signals);
        expect(outputSaved.config.outputs.every(output => !output.enabled)).toBe(true);
        await expect(calculation.getByRole('textbox', { name: await text(page, '信号名称'), exact: true })).toHaveValue('Pending blend');
        await oscWorkspace(page, '映射');
        await expect(path).toHaveValue('CI/UncommittedMap');
        await expect(mappings).toHaveCount(initial.config.signals.length + 1);
        await toolbar.getByTestId('restore-signal-drafts').click();
        await expect(path).toHaveValue(initial.config.signals[0].oscPath);
        await expect(mappings).toHaveCount(initial.config.signals.length);
        await page.getByTestId('edit-computations').click();
        await expect(editor.getByTestId('computed-signal-card')).toHaveCount(0);
        await expect(toolbar.getByTestId('restore-signal-drafts')).toBeDisabled();
        await expect(routing.locator('[data-output-id="udp"]')).toContainText('Flow UDP ' + locale);
        await unchanged(page, rig, outputSaved);
        const proof = { schema: 1, sourceCommit: process.env.SENSA_SOURCE_COMMIT || process.env.GITHUB_SHA,
          runId: process.env.GITHUB_RUN_ID, attempt: process.env.GITHUB_RUN_ATTEMPT, testId: info.testId,
          project: info.project.name, locale, keyboardSequence: sequence, focus, geometry,
          soleCalculationEditor: 'pipeline', navigationMutations: 0, draftMapAndGraphRestoredTogether: true,
          outputSavePreservesDrafts: true, outputSelectorUsesSavedGraph: true, planExportUsesSavedConfig: true,
          explicitOutputSaveRequests: 1,
          inputMode: (await rig.overview()).input.mode, inputActive: (await rig.overview()).runtime.inputActive };
        const proofPath = info.outputPath('osc-flow-outcome.json');
        await writeFile(proofPath, JSON.stringify(proof, null, 2));
        await info.attach('osc-flow-outcome', { path: proofPath, contentType: 'application/json' });
      });
  });
}
