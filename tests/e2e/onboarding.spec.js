import { test, expect, text, workspace, card, observePageCommands } from './fixtures.js';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

async function configuration(page, rig) {
  const response = await page.request.get(rig.baseUrl + '/api/config');
  expect(response.ok()).toBe(true);
  return response.json();
}

async function disarmed(page, rig) {
  const overview = await rig.overview();
  expect(overview.runtime.inputActive).toBe(false);
  expect(overview.runtime.isEmergency).toBe(false);
  await expect(page.getByRole('switch', { name: await text(page, '输入启用'), exact: true })).not.toBeChecked();
  for (const lane of ['udp', 'tcp', 'serial']) expect(rig.wire[lane].filter(line => /[LRVA]\d\d/.test(line))).toEqual([]);
  expect(rig.wire.intiface.some(message => message.OutputCmd || message.LinearCmd || message.ScalarCmd || message.RotateCmd)).toBe(false);
}

async function passiveSnapshot(page, rig) {
  return { config: await configuration(page, rig), mutations: rig.commands.filter(command => command.method !== 'GET').length,
    wire: structuredClone(rig.wire) };
}

async function unchanged(page, rig, before) {
  expect(await configuration(page, rig)).toEqual(before.config);
  expect(rig.commands.filter(command => command.method !== 'GET')).toHaveLength(before.mutations);
  expect(rig.wire).toEqual(before.wire);
  await disarmed(page, rig);
}

async function step(page, name) {
  await expect(page.getByTestId('onboarding-step-' + name)).toHaveAttribute('aria-current', 'step');
}

async function storedGuide(page) {
  return page.evaluate(() => {
    const keys = Object.keys(localStorage).filter(key => key.startsWith('sensa.onboarding.v1:'));
    if (keys.length !== 1) throw new Error('Expected one instance-scoped guide preference');
    return { key: keys[0], state: JSON.parse(localStorage.getItem(keys[0])) };
  });
}

async function attachState(page, info, name, details, target = page) {
  await expect(page.locator('.toast[role=alert]')).toHaveCount(0);
  await expect(page.locator('.toast')).toHaveCount(0, { timeout: 10000 });
  const imagePath = info.outputPath(name + '.png');
  await target.screenshot({ path: imagePath, animations: 'disabled', caret: 'hide' });
  const bytes = await readFile(imagePath);
  const proof = { schema: 1, sourceCommit: process.env.SENSA_SOURCE_COMMIT || process.env.GITHUB_SHA,
    runId: process.env.GITHUB_RUN_ID, attempt: process.env.GITHUB_RUN_ATTEMPT, testId: info.testId,
    project: info.project.name, attachment: name, sha256: createHash('sha256').update(bytes).digest('hex'), ...details };
  const proofPath = info.outputPath(name + '-source.json');
  await writeFile(proofPath, JSON.stringify(proof, null, 2));
  await info.attach(name, { path: imagePath, contentType: 'image/png' });
  await info.attach(name + '-source', { path: proofPath, contentType: 'application/json' });
}

async function attachOutcome(info, details) {
  const proof = { schema: 1, sourceCommit: process.env.SENSA_SOURCE_COMMIT || process.env.GITHUB_SHA,
    runId: process.env.GITHUB_RUN_ID, attempt: process.env.GITHUB_RUN_ATTEMPT,
    testId: info.testId, project: info.project.name, ...details };
  const output = info.outputPath('onboarding-outcome.json');
  await writeFile(output, JSON.stringify(proof, null, 2));
  await info.attach('onboarding-outcome', { path: output, contentType: 'application/json' });
}

async function openPresets(page) {
  await workspace(page, '控制');
  await page.getByTestId('open-scene-presets').click();
  const dialog = page.getByRole('dialog', { name: await text(page, '场景预设'), exact: true });
  await expect(dialog.getByTestId('scene-presets-dialog')).toBeVisible();
  return dialog;
}

async function profilePreset(page) {
  const library = await openPresets(page);
  await library.locator('#scene-preset-tabs-profile').click();
  await library.getByTestId('scene-axis-preset').selectOption('osr-first-run');
  await library.getByTestId('scene-axis-review').click();
  await expect(library).toBeHidden();
  const dialog = page.getByRole('dialog', { name: await text(page, '轴配置'), exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}

for (const locale of ['zh-CN', 'en-US']) {
  test.describe('Guided setup and real presets / 操作引导与真实预设 ' + locale, () => {
    test.use({ locale });

    test.describe('first use / 首次使用', () => {
      test.use({ scenario: 'first-run' });
      test('a guide configures a device explicitly and completes without enabling input / 引导需明确配置设备且完成不启用输入',
        { tag: ['@onboarding', '@config', '@i18n'] }, async ({ page, rig }, info) => {
          const initial = await passiveSnapshot(page, rig);
          expect(initial.config.outputs).toEqual([]);
          await page.getByTestId('onboarding-start').click();
          await step(page, 'goal');
          await expect(page.getByTestId('onboarding-next')).toBeDisabled();
          await page.getByTestId('onboarding-goal-manual').click();
          await page.getByTestId('onboarding-next').click();
          await step(page, 'device');
          await page.getByTestId('onboarding-step-ready').click();
          await expect(page.getByTestId('onboarding-complete')).toBeDisabled();
          await page.getByTestId('onboarding-step-device').click();
          await page.getByTestId('onboarding-connect-device').click();
          await expect(page.getByTestId('output-type')).toBeFocused();
          await unchanged(page, rig, initial);

          await page.getByTestId('output-type').selectOption('TCodeUdp');
          await page.getByTestId('add-output').click();
          const dialog = page.getByRole('dialog', { name: await text(page, '输出设置'), exact: true });
          await expect(dialog).toBeVisible();
          const added = await passiveSnapshot(page, rig);
          expect(added.config.outputs).toHaveLength(1);
          expect(added.config.outputs[0].enabled).toBe(false);
          const deviceName = 'Guided UDP ' + locale;
          await dialog.getByRole('textbox', { name: await text(page, '名称'), exact: true }).fill(deviceName);
          await dialog.getByRole('textbox', { name: await text(page, '目标地址'), exact: true }).fill('127.0.0.1');
          await dialog.getByRole('spinbutton', { name: await text(page, '目标端口'), exact: true }).fill('19999');
          await unchanged(page, rig, added);
          await dialog.getByRole('button', { name: await text(page, '保存输出'), exact: true }).click();
          await expect(dialog).toBeHidden();
          const configured = await configuration(page, rig);
          expect(configured.outputs[0]).toMatchObject({ name: deviceName, host: '127.0.0.1', port: 19999, enabled: false });
          await disarmed(page, rig);
          await card(page, deviceName).getByRole('button', { name: await text(page, '启用'), exact: true }).click();
          await expect(card(page, deviceName).locator('.output-identity')).toContainText(await text(page, '已连接'));
          const connected = await passiveSnapshot(page, rig);
          await page.getByTestId('onboarding-next').click();
          await step(page, 'input');
          await page.getByTestId('onboarding-prepare-input').click();
          await expect(page.locator('#input-tabs-manual')).toBeFocused();
          await expect(page.getByTestId('onboarding-apply-input')).toHaveCount(0);
          await page.getByTestId('onboarding-next').click();
          await step(page, 'ready');
          await expect(page.getByTestId('onboarding-complete')).toBeEnabled();
          await unchanged(page, rig, connected);
          await attachState(page, info, 'onboarding-ready', { locale, inputActive: false, explicitDeviceSave: true,
            explicitDeviceEnable: true, guideNavigationMutations: 0 }, page.getByTestId('onboarding-panel'));
          await page.getByTestId('onboarding-complete').click();
          await expect(page.getByTestId('onboarding-panel')).toHaveCount(0);
          expect((await storedGuide(page)).state).toMatchObject({ status: 'complete', goal: 'manual', step: 'ready' });
          await page.reload();
          await expect(page.getByTestId('getting-started')).toHaveClass(/scene-launchpad--compact/);
          await expect(page.getByTestId('onboarding-panel')).toHaveCount(0);
          await unchanged(page, rig, connected);
          await page.getByTestId('onboarding-start').click();
          await step(page, 'goal');
          await expect(page.getByTestId('onboarding-goal-manual')).toHaveAttribute('aria-pressed', 'true');
          await unchanged(page, rig, connected);
          await attachOutcome(info, { workflow: 'guide-device-complete', locale, goal: 'manual', completedPersisted: true,
            restartStep: 'goal', inputActive: (await rig.overview()).runtime.inputActive,
            configuredOutput: (await configuration(page, rig)).outputs[0], guideNavigationMutations: 0 });
        });
    });

    test('goal routing, skip and resume preserve progress while actual readiness stays truthful / 场景导航跳过续接保留进度且就绪状态来自实际输入',
      { tag: ['@onboarding', '@config', '@i18n'] }, async ({ page, rig, browser }, info) => {
        const initial = await passiveSnapshot(page, rig);
        await page.getByTestId('onboarding-start').click();
        for (const goal of ['osc', 'script', 'manual', 'protocol']) {
          await page.getByTestId('onboarding-step-goal').click();
          await page.getByTestId('onboarding-goal-' + goal).click();
          await page.getByTestId('onboarding-step-input').click();
          await page.getByTestId('onboarding-prepare-input').click();
          if (goal === 'osc') {
            await expect(page.locator('#workspace-tabs-osc')).toHaveAttribute('aria-selected', 'true');
            await expect(page.locator('.preset-strip')).toBeInViewport();
          } else if (goal === 'protocol') {
            await expect(page.locator('#workspace-tabs-settings')).toHaveAttribute('aria-selected', 'true');
            await expect(page.getByTestId('protocol-inputs-panel')).toBeInViewport();
          } else await expect(page.locator('#input-tabs-' + goal)).toBeFocused();
          expect((await rig.overview()).input.mode).toBe('manual');
          await unchanged(page, rig, initial);
          await page.getByTestId('onboarding-step-ready').click();
          await expect(page.getByTestId('onboarding-complete')).toBeDisabled();
        }
        await page.getByTestId('onboarding-step-goal').click();
        await page.getByTestId('onboarding-goal-script').click();
        await page.getByTestId('onboarding-step-input').click();
        await page.getByTestId('onboarding-prepare-input').click();
        await expect(page.getByTestId('onboarding-apply-input')).toBeEnabled();
        await unchanged(page, rig, initial);
        await page.getByTestId('onboarding-apply-input').click();
        await expect.poll(async () => (await rig.overview()).input.mode).toBe('script');
        await expect(page.getByTestId('onboarding-panel')).toContainText(await text(page, '输入待准备'));
        await page.locator('input[type=file]').setInputFiles({ name: 'guided.funscript', mimeType: 'application/json',
          buffer: Buffer.from(JSON.stringify({ actions: [{ at: 0, pos: 20 }, { at: 1000, pos: 80 }] })) });
        await expect.poll(async () => (await rig.overview()).input.script.loaded).toBe(true);
        await expect(page.getByTestId('onboarding-panel')).toContainText(await text(page, '输入已准备'));
        const prepared = await passiveSnapshot(page, rig);
        expect(prepared.config).toEqual(initial.config);
        await disarmed(page, rig);
        await page.getByTestId('onboarding-skip').click();
        await expect(page.getByTestId('onboarding-panel')).toHaveCount(0);
        const preference = await storedGuide(page);
        expect(preference.key).toBe('sensa.onboarding.v1:remote:' + new URL(page.url()).pathname);
        expect(preference.state).toEqual({ status: 'dismissed', goal: 'script', step: 'input' });
        await page.reload();
        await expect(page.getByTestId('onboarding-panel')).toHaveCount(0);
        await workspace(page, '控制');
        await page.getByTestId('onboarding-resume').click();
        await step(page, 'input');
        await expect(page.getByTestId('onboarding-panel')).toContainText(await text(page, '输入已准备'));
        await unchanged(page, rig, prepared);
        await attachState(page, info, 'onboarding-resumed', { locale, preference, actualMode: 'script', inputActive: false,
          configurationUnchanged: true }, page.getByTestId('onboarding-panel'));

        const fresh = await browser.newContext({ locale, viewport: info.project.use.viewport });
        const isolatedPage = await fresh.newPage();
        const errors = []; isolatedPage.on('pageerror', error => errors.push(error.message));
        await observePageCommands(isolatedPage, command => rig.commands.push(command));
        let freshGuide;
        try {
          await isolatedPage.goto(rig.baseUrl);
          await expect(isolatedPage.getByTestId('onboarding-start')).toBeVisible();
          await expect(isolatedPage.getByTestId('onboarding-resume')).toHaveCount(0);
          await expect(isolatedPage.getByTestId('onboarding-panel')).toHaveCount(0);
          freshGuide = (await storedGuide(isolatedPage)).state;
          expect(freshGuide).toEqual({ status: 'new', goal: null, step: 'goal' });
          expect(errors).toEqual([]);
          await unchanged(page, rig, prepared);
        } finally { await fresh.close(); }
        await attachOutcome(info, { workflow: 'guide-progress-resume', locale, goalsVisited: ['osc', 'script', 'manual', 'protocol'],
          preferenceKey: preference.key, skippedState: preference.state, resumedState: (await storedGuide(page)).state,
          freshContextState: freshGuide, inputMode: (await rig.overview()).input.mode,
          inputActive: (await rig.overview()).runtime.inputActive, scriptLoaded: (await rig.overview()).input.script.loaded,
          configurationUnchanged: true, navigationMutations: 0 });
      });

    test('real OSC presets replace and append drafts before a separate explicit save / 真实OSC预设先替换追加草稿再另行明确保存',
      { tag: ['@onboarding', '@config', '@i18n'] }, async ({ page, rig }, info) => {
        const initial = await passiveSnapshot(page, rig);
        let library = await openPresets(page);
        await library.getByTestId('scene-osc-preset').selectOption('ogb-depth');
        await unchanged(page, rig, initial);
        await attachState(page, info, 'scene-preset-library', { locale, selectedPreset: 'ogb-depth', draftOnly: true }, library);
        await library.getByTestId('scene-osc-replace').click();
        await expect(library).toBeHidden();
        await expect(page.locator('#workspace-tabs-osc')).toHaveAttribute('aria-selected', 'true');
        await expect(page.locator('.mapping-row')).toHaveCount(1);
        await expect(page.locator('.mapping-row__path input')).toHaveValue(/OGB\/Orf\/\*\*\/PenOthersNewRoot/);
        await expect(page.locator('.mapping-row__target select')).toHaveValue('Depth');
        await unchanged(page, rig, initial);
        await page.getByRole('button', { name: await text(page, '保存映射'), exact: true }).click();
        await expect.poll(async () => (await configuration(page, rig)).signals.map(signal => ({ sourceMode: signal.sourceMode, role: signal.role })))
          .toEqual([{ sourceMode: 'OgbDepth', role: 'Depth' }]);
        const depth = await passiveSnapshot(page, rig);
        expect(depth.config.computedSignals).toEqual(initial.config.computedSignals);
        expect(depth.config.outputs).toEqual(initial.config.outputs);
        library = await openPresets(page);
        await library.getByTestId('scene-osc-preset').selectOption('ogb-touch');
        await library.getByTestId('scene-osc-append').click();
        await expect(page.locator('.mapping-row')).toHaveCount(2);
        await expect(page.locator('.mapping-row__target select').nth(1)).toHaveValue('V0');
        await expect(page.locator('.mapping-row__path input').nth(1)).toHaveValue(/TouchOthers/);
        await unchanged(page, rig, depth);
        await page.getByRole('button', { name: await text(page, '保存映射'), exact: true }).click();
        await expect.poll(async () => (await configuration(page, rig)).signals.map(signal => ({ sourceMode: signal.sourceMode, role: signal.role })))
          .toEqual([{ sourceMode: 'OgbDepth', role: 'Depth' }, { sourceMode: 'OgbTouch', role: 'V0' }]);
        const saved = await configuration(page, rig);
        expect(saved.signals[0]).toEqual(depth.config.signals[0]);
        expect(saved.outputs).toEqual(initial.config.outputs);
        expect(saved.computedSignals).toEqual(initial.config.computedSignals);
        expect((await rig.overview()).input.mode).toBe('manual');
        await disarmed(page, rig);
        expect(Object.values(rig.wire).every(lane => lane.length === 0)).toBe(true);
        await attachOutcome(info, { workflow: 'osc-preset-save', locale, presets: ['ogb-depth', 'ogb-touch'],
          signals: saved.signals, draftConfigurationUnchanged: true, computedUnchanged: true, outputsUnchanged: true,
          inputMode: (await rig.overview()).input.mode, inputActive: (await rig.overview()).runtime.inputActive });
      });

    test('a real OSR preset is reviewed as a draft and saved without assigning or activating outputs / 真实OSR预设先审阅草稿再保存且不分配或启用输出',
      { tag: ['@onboarding', '@config', '@i18n'] }, async ({ page, rig }, info) => {
        const initial = await passiveSnapshot(page, rig);
        let dialog = await profilePreset(page);
        const panel = dialog.getByRole('tabpanel');
        const endpoint = async (range, name) => panel.getByRole('spinbutton', { name: (await text(page, range)) + (await text(page, name)), exact: true });
        await expect(await endpoint('映射范围', '起点')).toHaveValue('400');
        await expect(await endpoint('映射范围', '终点')).toHaveValue('600');
        await expect(panel.getByRole('spinbutton', { name: (await text(page, '{0}数值')).replace('{0}', await text(page, '速度限制')), exact: true })).toHaveValue('100');
        await dialog.getByRole('tab', { name: /^L1\s/ }).click();
        await expect(panel.getByLabel(await text(page, '轴模式'), { exact: true })).toHaveValue('Ignored');
        await unchanged(page, rig, initial);
        await dialog.getByRole('button', { name: await text(page, '取消'), exact: true }).click();
        await expect(dialog).toBeHidden();
        await unchanged(page, rig, initial);
        dialog = await profilePreset(page);
        const name = 'Reviewed OSR ' + locale;
        await dialog.getByRole('textbox', { name: await text(page, '配置名称'), exact: true }).fill(name);
        await attachState(page, info, 'scene-profile-review', { locale, preset: 'osr-first-run', draftOnly: true }, dialog);
        await unchanged(page, rig, initial);
        await dialog.getByRole('button', { name: await text(page, '保存轴配置'), exact: true }).click();
        await expect(dialog).toBeHidden();
        const saved = await configuration(page, rig);
        expect(saved.axisProfiles).toHaveLength(initial.config.axisProfiles.length + 1);
        const profile = saved.axisProfiles.find(candidate => candidate.name === name);
        expect(profile).toBeDefined();
        expect(profile.motion.l0).toMatchObject({ mode: 'Normal', min: 400, max: 600, remapMin: 400, remapMax: 600, maxSpeed: 100 });
        for (const axis of ['l1', 'l2', 'r0', 'r1', 'r2', 'v0', 'v1', 'v2', 'a0', 'a1', 'a2']) expect(profile.motion[axis].mode).toBe('Ignored');
        expect(saved.outputs).toEqual(initial.config.outputs);
        expect(saved.signals).toEqual(initial.config.signals);
        await disarmed(page, rig);
        expect(Object.values(rig.wire).every(lane => lane.length === 0)).toBe(true);
        await attachOutcome(info, { workflow: 'axis-preset-save', locale, preset: 'osr-first-run', profile,
          cancelConfigurationUnchanged: true, draftConfigurationUnchanged: true, outputsUnchanged: true,
          inputActive: (await rig.overview()).runtime.inputActive });
      });
  });
}
