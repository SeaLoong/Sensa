import {
  test, expect, text, enable, mode, active, oscWorkspace, allowSpatial,
  checkpoint, checkpointViewport, outputValue,
} from './fixtures.js';
import { contactRootSamples, fixedRootSamples } from './mocks.js';
import { createUiQualityReport, inspectReflow } from './ui-quality.js';

const savedConfig = async (page, rig) => page.request.get(rig.baseUrl + '/api/config').then(response => response.json());
const computation = async (rig, id) => (await rig.overview()).computedSignals.find(signal => signal.id === id);
const motionLines = rig => rig.wire.udp.filter(line => /L0\d/.test(line));
const mapping = id => ({ sourceMode: 'Computed', oscPath: id, role: 'Depth', vrchatMin: 0, vrchatMax: 1 });
const input = (oscPath, weight = 1) => ({ sourceMode: 'Direct', oscPath, weight });
const reference = oscPath => ({ sourceMode: 'Computed', oscPath });
const constant = value => ({ sourceMode: 'Constant', value });

async function replaceConfig(page, rig, patch) {
  const response = await page.request.put(rig.baseUrl + '/api/config', { data: { ...await savedConfig(page, rig), ...patch } });
  expect(response.ok(), await response.text()).toBe(true);
  await expect.poll(async () => (await rig.overview()).runtime.inputActive).toBe(false);
}

async function saveMappings(page, rig) {
  const before = rig.commands.length;
  const save = page.getByRole('button', { name: await text(page, '保存映射'), exact: true });
  await save.click();
  // The app multiplexes saves over WebSocket or SharedWorker. Observe the
  // corresponding response before reading results or starting another edit.
  await expect.poll(() => rig.commands.slice(before).find(command => command.method === 'PUT'
    && command.path === '/api/config')?.response).toEqual({ ok: true });
  await expect(save).toBeEnabled();
  await expect.poll(async () => (await rig.overview()).runtime.inputActive).toBe(false);
}

async function setVectorConstants(page, group, values) {
  await group.getByRole('combobox', { name: await text(page, '三分量来源'), exact: true }).selectOption('Constant');
  for (let index = 0; index < 3; index++) {
    const label = (await text(page, '{0} 分量')).replace('{0}', ['X', 'Y', 'Z'][index]);
    await group.getByRole('spinbutton', { name: label, exact: true }).fill(String(values[index]));
  }
}

for (const locale of ['zh-CN', 'en-US']) {
  test.describe('Computed signal editor / 计算信号编辑器 ' + locale, () => {
    test.use({ locale });

    test('weighted inputs are saved together with an axis mapping / 加权输入与目标轴映射一起保存',
      { tag: ['@osc', '@input', '@config', '@transport', '@i18n', '@visual', '@quality'] }, async ({ page, rig }, info) => {
        await enable(page, ['Mock UDP']); await mode(page, 'OSC');
        await rig.startFeed([['CI/A', .2], ['CI/B', .8], ['CI/Depth', .25], ['CI/Active', 1]]);
        await active(page); await outputValue(rig, 'udp', 450);
        await oscWorkspace(page, '映射');
        await page.getByRole('button', { name: await text(page, '新增计算信号'), exact: true }).click();
        const card = page.getByTestId('computed-signal-card').first();
        await expect(card).toHaveJSProperty('open', true);
        await card.getByRole('textbox', { name: await text(page, '信号名称'), exact: true }).fill('Blend');
        await card.getByRole('combobox', { name: await text(page, '运算方式'), exact: true }).selectOption('WeightedAverage');
        const rows = card.getByTestId('computed-input-row');
        await expect(rows).toHaveCount(2);
        for (const [index, path, weight] of [[0, 'CI/A', 1], [1, 'CI/B', 3]]) {
          await rows.nth(index).getByRole('combobox', { name: await text(page, '输入类型'), exact: true }).selectOption('Direct');
          await rows.nth(index).getByLabel(await text(page, '参数路径'), { exact: true }).fill(path);
          await rows.nth(index).getByRole('spinbutton', { name: await text(page, '权重'), exact: true }).fill(String(weight));
        }
        const mappings = page.locator('.mapping-row');
        await mappings.nth(1).getByRole('button', { name: await text(page, '移除映射'), exact: true }).click();
        await mappings.first().getByRole('combobox', { name: await text(page, '输入类型'), exact: true }).selectOption('Computed');
        await mappings.first().getByRole('combobox', { name: await text(page, '计算信号'), exact: true }).selectOption('Signal1');
        await expect(card.getByTestId('computed-signal-status')).toHaveText(await text(page, '保存后查看结果'));
        expect((await rig.overview()).runtime.inputActive).toBe(true);
        expect((await savedConfig(page, rig)).computedSignals).toHaveLength(0);
        await page.getByRole('button', { name: await text(page, '保存映射'), exact: true }).click();
        await expect.poll(async () => (await savedConfig(page, rig)).computedSignals[0]).toMatchObject({
          id: 'Signal1', name: 'Blend', operation: 'WeightedAverage',
          inputs: [{ sourceMode: 'Direct', oscPath: 'CI/A', weight: 1 }, { sourceMode: 'Direct', oscPath: 'CI/B', weight: 3 }],
        });
        await expect.poll(async () => (await savedConfig(page, rig)).signals).toMatchObject([mapping('Signal1')]);
        await expect.poll(async () => (await rig.overview()).runtime.inputActive).toBe(false);
        await expect.poll(() => rig.wire.udp.at(-1)).toBe('DSTOP');
        await expect.poll(async () => (await computation(rig, 'Signal1'))?.value).toBeCloseTo(.65, 5);
        await expect(card.getByTestId('computed-signal-value')).toContainText('0.65');
        await checkpointViewport(page, 'computed-signal-editor-' + locale);
        await checkpoint(page, card.locator('.computed-signal__settings'), 'computed-signal-settings-' + locale);
        await checkpoint(page, rows.first(), 'computed-signal-input-' + locale);
        const report = createUiQualityReport(page, info, { kind: 'computed-editor',
          plannedStates: ['osc-computed-signal-saved'], plannedChecks: ['computed-editor-reflow-320'] });
        const viewport = page.viewportSize();
        try {
          await report.audit('osc-computed-signal-saved');
          await page.setViewportSize({ ...viewport, width: 320 });
          await report.check('computed-editor-reflow-320 / 计算编辑器 320 CSS px 重排', () => inspectReflow(page));
        } catch (error) { report.fail(error); throw error; }
        finally { await page.setViewportSize(viewport); await report.write(); }
        await active(page); await outputValue(rig, 'udp', 530);
      });

    test('spatial XYZ groups calculate tilted planes, point distance and angles / 空间 XYZ 分组计算倾斜平面、两点距离与夹角',
      { tag: ['@osc', '@input', '@config', '@i18n', '@visual', '@quality'] }, async ({ page, rig }, info) => {
        await mode(page, 'OSC'); await oscWorkspace(page, '映射');
        const presets = page.getByTestId('computed-spatial-presets');
        await presets.locator('summary').click();
        await presets.getByRole('combobox', { name: await text(page, '空间运算'), exact: true }).selectOption('PlaneDepth');
        await presets.getByRole('button', { name: await text(page, '新增空间计算'), exact: true }).click();
        const card = page.getByTestId('computed-signal-card').first();
        await expect(card).toHaveJSProperty('open', true);
        const cases = [
          { operation: 'PlaneDepth', vectors: [[.3, .4, .2], [.1, .1, .1], [0, 3, 4]], expected: .26 },
          { operation: 'PlaneOffset', vectors: [[.3, .4, .2], [.1, .1, .1], [0, 3, 4]], expected: Math.sqrt(.0724) },
          { operation: 'PointDistance', vectors: [[.3, .4, .2], [.1, .1, .1]], expected: Math.sqrt(.14) },
          { operation: 'VectorAngle', vectors: [[1, 1, 0], [1, 0, 0]], expected: 45, angle: true },
          { operation: 'PlaneAngle', vectors: [[1, -1, 0], [0, 1, 0]], expected: -45, angle: true },
          { operation: 'PlaneDepthFromAxes', vectors: [[.3, .4, .2], [.1, .1, .1], [1, 0, 0], [0, .8, -.6]], expected: .26 },
          { operation: 'PlaneOffsetFromAxes', vectors: [[.3, .4, .2], [.1, .1, .1], [1, 0, 0], [0, .8, -.6]], expected: Math.sqrt(.0724) },
        ];
        for (const example of cases) {
          await card.getByRole('combobox', { name: await text(page, '运算方式'), exact: true }).selectOption(example.operation);
          const groups = card.getByTestId('computed-vector-group');
          await expect(groups).toHaveCount(example.vectors.length);
          for (const [index, values] of example.vectors.entries()) await setVectorConstants(page, groups.nth(index), values);
          await expect(card.getByTestId('computed-signal-status')).toHaveText(await text(page, '保存后查看结果'));
          await saveMappings(page, rig);
          const saved = (await savedConfig(page, rig)).computedSignals[0];
          expect(saved.operation).toBe(example.operation);
          expect(saved.inputs).toHaveLength(example.vectors.flat().length);
          expect(saved.inputs.map(input => input.value)).toEqual(example.vectors.flat());
          await expect.poll(async () => (await computation(rig, 'Signal1'))?.valid).toBe(true);
          await expect.poll(async () => (await computation(rig, 'Signal1'))?.value).toBeCloseTo(example.expected, 5);
          await expect(card.getByTestId('computed-signal-value')).toHaveText(Number(example.expected.toFixed(6)).toString() + (example.angle ? '°' : ''));
          if (example.operation === 'PlaneDepth') {
            await checkpoint(page, groups.nth(0), 'computed-plane-point-' + locale);
            await checkpoint(page, groups.nth(2), 'computed-plane-direction-' + locale);
            const report = createUiQualityReport(page, info, { kind: 'computed-spatial-editor',
              plannedStates: ['tilted-plane-saved'], plannedChecks: ['computed-spatial-reflow-320'] });
            const viewport = page.viewportSize();
            try {
              await report.audit('tilted-plane-saved');
              await page.setViewportSize({ ...viewport, width: 320 });
              await report.check('computed-spatial-reflow-320 / 空间计算 320 CSS px 重排', () => inspectReflow(page));
            } catch (error) { report.fail(error); throw error; }
            finally { await page.setViewportSize(viewport); await report.write(); }
          }
        }
        await expect(page.getByRole('switch', { name: await text(page, '输入启用'), exact: true })).not.toBeChecked();
        await info.attach('computed-geometry-examples.json', { body: JSON.stringify({ fixtureOnly: true,
          unityClientExecution: false, hardwareExecution: false, cases,
          fixedCoordinatesHaveNoInferredUnit: true, anglesUseDegrees: true, savesEnableInput: false,
        }), contentType: 'application/json' });
      });
  });
}

test('chained calculations stop for zero division, missing and expired input, then recover / 链式计算在除零、缺失和过期时停止并可恢复',
  { tag: ['@osc', '@input', '@config', '@transport'] }, async ({ page, rig }, info) => {
    await enable(page, ['Mock UDP']); await mode(page, 'OSC');
    const computedSignals = [
      { id: 'Blend', name: 'Weighted blend', operation: 'WeightedAverage', maxAgeMs: 500, inputs: [input('CI/A', 1), input('CI/B', 3)] },
      { id: 'Shift', operation: 'Sum', maxAgeMs: 500, inputs: [reference('Blend'), constant(.1)] },
      { id: 'Ratio', operation: 'Ratio', maxAgeMs: 500, inputs: [reference('Shift'), input('CI/Divisor')] },
    ];
    const initial = await savedConfig(page, rig);
    const cyclic = await page.request.put(rig.baseUrl + '/api/config', { data: { ...initial,
      computedSignals: [{ id: 'Loop', operation: 'Sum', inputs: [reference('Loop'), constant(1)] }],
      signals: [mapping('Loop')],
    } });
    expect(cyclic.status()).toBe(400);
    expect((await savedConfig(page, rig)).signals).toEqual(initial.signals);
    expect((await savedConfig(page, rig)).computedSignals).toEqual(initial.computedSignals);
    await replaceConfig(page, rig, { computedSignals, signals: [mapping('Ratio')] });
    await active(page);
    await expect.poll(async () => (await rig.overview()).runtime.computedInputBlocked).toBe(true);
    await expect.poll(() => rig.wire.udp.at(-1)).toBe('DSTOP');
    expect(motionLines(rig)).toHaveLength(0);
    let divisor = 1, includeB = true, batches = 0;
    const feed = await rig.startFeed(() => {
      batches++;
      return [['CI/A', .2], ['CI/Divisor', divisor], ...(includeB ? [['CI/B', .8]] : [])];
    });
    await expect.poll(async () => (await computation(rig, 'Blend'))?.value).toBeCloseTo(.65, 5);
    await expect.poll(async () => (await computation(rig, 'Ratio'))?.value).toBeCloseTo(.75, 5);
    await outputValue(rig, 'udp', 550);

    divisor = 0;
    await expect.poll(async () => (await computation(rig, 'Ratio'))?.valid).toBe(false);
    await expect.poll(() => rig.wire.udp.at(-1)).toBe('DSTOP');
    const zeroMotionCount = motionLines(rig).length, zeroBatches = batches;
    await expect.poll(() => batches).toBeGreaterThan(zeroBatches + 2);
    expect(motionLines(rig)).toHaveLength(zeroMotionCount);
    expect((await rig.overview()).runtime).toMatchObject({ inputActive: true, isEmergency: false, computedInputBlocked: true });
    divisor = 2;
    await expect.poll(async () => (await computation(rig, 'Ratio'))?.value).toBeCloseTo(.375, 5);
    await outputValue(rig, 'udp', 475);

    includeB = false;
    await expect.poll(async () => (await computation(rig, 'Blend'))?.valid, { timeout: 5000 }).toBe(false);
    await expect.poll(async () => (await rig.overview()).runtime.computedInputBlocked).toBe(true);
    await expect.poll(() => rig.wire.udp.at(-1)).toBe('DSTOP');
    const expiredCount = motionLines(rig).length, expiredBatches = batches;
    await expect.poll(() => batches).toBeGreaterThan(expiredBatches + 2);
    expect(motionLines(rig)).toHaveLength(expiredCount);
    expect((await rig.overview()).runtime.isEmergency).toBe(false);
    includeB = true;
    await expect.poll(async () => (await rig.overview()).runtime.computedInputBlocked).toBe(false);
    await expect.poll(() => motionLines(rig).length).toBeGreaterThan(expiredCount);
    await outputValue(rig, 'udp', 475);
    await feed.stop();
    await expect.poll(async () => (await rig.overview()).runtime.computedInputBlocked, { timeout: 5000 }).toBe(true);
    await expect.poll(() => rig.wire.udp.at(-1)).toBe('DSTOP');
    await info.attach('computed-signal-simulation.json', { body: JSON.stringify({ fixtureOnly: true,
      arithmetic: '(.2 * 1 + .8 * 3) / 4 + .1', expectedBlend: .65, expectedShift: .75,
      stoppedOnMissingInput: true, stoppedOnZeroDivision: true, stoppedOnExpiredContributor: true,
      otherChangingInputsRenewExpiredContributor: false,
    }), contentType: 'application/json' });
  });

test('SPS four-anchor solved coordinates feed calculations with spatial permission and freshness / SPS 四点解算坐标参与计算并保留空间许可与时效',
  { tag: ['@osc', '@input', '@config', '@transport'] }, async ({ page, rig }, info) => {
    await enable(page, ['Mock UDP']); await mode(page, 'OSC');
    const id = 'RootBlend', prefix = 'Sensa/SPS/CIFixedRoot';
    await replaceConfig(page, rig, { computedSignals: [{ id, operation: 'WeightedAverage', maxAgeMs: 1000,
      inputs: [{ sourceMode: 'SensaPoint', oscPath: prefix + '/**', pointMetric: 'Z', weight: 3 }, { ...constant(.3), weight: 1 }],
    }], signals: [{ ...mapping(id), vrchatMax: .3 }] });
    // Reload binds the browser's saved configuration before the permission form is used.
    await page.reload();
    let sample = 0, sequence = 0, frozen = false, z = .1;
    const feed = await rig.startFeed(() => {
      if (!frozen) sample = (sequence++ % 32 + 1) / 32;
      return fixedRootSamples(z, sample);
    });
    await expect.poll(async () => (await rig.overview()).poseTracking.spsRoots.find(root => root.prefix === prefix)?.valid).toBe(true);
    await active(page);
    await expect.poll(async () => (await rig.overview()).runtime.computedInputBlocked).toBe(true);
    expect(motionLines(rig)).toHaveLength(0);
    await oscWorkspace(page, '映射');
    const rootCalculation = page.getByTestId('computed-signal-card').first();
    await rootCalculation.locator('summary').click();
    const trackedInput = rootCalculation.getByTestId('computed-input-row').first();
    await expect(trackedInput.getByRole('combobox', { name: await text(page, '已识别的测量对象'), exact: true })).toHaveValue(prefix + '/**');
    await expect(trackedInput.getByRole('combobox', { name: await text(page, '测量指标'), exact: true })).toHaveValue('Z');
    await expect(trackedInput.getByLabel(await text(page, '参数路径'), { exact: true })).toHaveValue(prefix + '/**');
    await allowSpatial(page);
    await expect.poll(async () => (await computation(rig, id))?.value).toBeCloseTo(.15, 5);
    await active(page); await outputValue(rig, 'udp', 500);
    frozen = true; z = .11;
    await expect.poll(async () => (await computation(rig, id))?.valid, { timeout: 5000 }).toBe(false);
    await expect.poll(() => rig.wire.udp.at(-1)).toBe('DSTOP');
    expect((await rig.overview()).runtime.isEmergency).toBe(false);
    const frozenMotionCount = motionLines(rig).length;
    frozen = false; z = .1;
    await expect.poll(async () => (await rig.overview()).runtime.computedInputBlocked).toBe(false);
    await expect.poll(() => motionLines(rig).length).toBeGreaterThan(frozenMotionCount);
    await outputValue(rig, 'udp', 500);
    await feed.stop();
    await info.attach('computed-spatial-simulation.json', { body: JSON.stringify({ fixtureOnly: true,
      unityClientExecution: false, input: 'SPS four-anchor solved Z', coordinateFrame: 'AvatarRootLocal',
      expectedValue: .15, rawProximitiesAveraged: false, spatialPermissionRequired: true,
      changingDistancesRenewFrozenSample: false,
    }), contentType: 'application/json' });
  });

test('following-plane drafts use live tracking-frame markers and stop for lost orientation / 跟随平面草稿读取实时定位标记并在朝向失效时停止',
  { tag: ['@osc', '@input', '@config', '@transport'] }, async ({ page, rig }, info) => {
    await enable(page, ['Mock UDP']); await mode(page, 'OSC'); await allowSpatial(page);
    let sequence = 0, forwardSample = 0, frozen = false, direction = 1, batches = 0;
    const marker = (name, position, sample) => contactRootSamples(position[2], sample, true, { x: position[0], y: position[1] })
      .map(([path, value]) => [path.replace('CIContactRoot', name), value]);
    const feed = await rig.startFeed(() => {
      const sample = (sequence++ % 32 + 1) / 32; batches++;
      if (!frozen) forwardSample = sample;
      return [
        ...marker('Target', [.3, .4, .2], sample),
        ...marker('Guide_Origin', [.1, .1, .1], sample),
        ...marker('Guide_Forward', [.1, .1 + .12 * direction, .1 + .16 * direction], forwardSample),
      ];
    });
    await oscWorkspace(page, '映射');
    const presets = page.getByTestId('computed-spatial-presets');
    await presets.locator('summary').click();
    await presets.getByLabel(await text(page, '测量对象路径'), { exact: true }).fill('Sensa/Contact/Target/**');
    await presets.getByLabel(await text(page, '平面参考对象路径'), { exact: true }).fill('Sensa/Contact/Guide_Origin/**');
    await presets.getByRole('button', { name: await text(page, '添加跟随平面草稿'), exact: true }).click();
    await expect(page.getByTestId('computed-signal-card')).toHaveCount(5);
    expect((await savedConfig(page, rig)).computedSignals).toHaveLength(0);
    expect((await rig.overview()).runtime.inputActive).toBe(false);
    const depth = page.locator('[data-signal-id="Signal4"]');
    await expect(depth).toHaveJSProperty('open', true);
    await saveMappings(page, rig);
    const saved = (await savedConfig(page, rig)).computedSignals;
    expect(saved.map(signal => signal.operation)).toEqual(['Difference', 'Difference', 'Difference', 'PlaneDepth', 'PlaneOffset']);
    for (let index = 0; index < 3; index++) expect(saved[index].inputs).toMatchObject([
      { sourceMode: 'SensaPoint', oscPath: 'Sensa/Contact/Guide_Forward/**', pointMetric: ['X', 'Y', 'Z'][index] },
      { sourceMode: 'SensaPoint', oscPath: 'Sensa/Contact/Guide_Origin/**', pointMetric: ['X', 'Y', 'Z'][index] },
    ]);
    expect(saved[3].inputs.slice(6).map(input => input.oscPath)).toEqual(['Signal1', 'Signal2', 'Signal3']);
    await expect.poll(async () => (await computation(rig, 'Signal4'))?.value).toBeCloseTo(.26, 5);
    await expect.poll(async () => (await computation(rig, 'Signal5'))?.value).toBeCloseTo(Math.sqrt(.0724), 5);
    await expect(depth.getByTestId('computed-signal-value')).toHaveText('0.26 m');
    await replaceConfig(page, rig, { signals: [{ ...mapping('Signal4'), vrchatMin: -1, vrchatMax: 1 }] });
    await page.reload(); await active(page); await outputValue(rig, 'udp', 526);

    direction = -1;
    await expect.poll(async () => (await computation(rig, 'Signal4'))?.value).toBeCloseTo(-.26, 5);
    await expect.poll(async () => (await computation(rig, 'Signal5'))?.value).toBeCloseTo(Math.sqrt(.0724), 5);
    await outputValue(rig, 'udp', 474);
    direction = 0;
    await expect.poll(async () => (await computation(rig, 'Signal4'))?.valid).toBe(false);
    await expect.poll(() => rig.wire.udp.at(-1)).toBe('DSTOP');
    const invalidCount = motionLines(rig).length, invalidBatch = batches;
    await expect.poll(() => batches).toBeGreaterThan(invalidBatch + 3);
    expect(motionLines(rig)).toHaveLength(invalidCount);
    expect((await rig.overview()).runtime).toMatchObject({ inputActive: true, isEmergency: false, computedInputBlocked: true });
    direction = 1;
    await expect.poll(async () => (await rig.overview()).runtime.computedInputBlocked).toBe(false);
    await outputValue(rig, 'udp', 526);

    frozen = true;
    await expect.poll(async () => (await computation(rig, 'Signal4'))?.valid, { timeout: 5000 }).toBe(false);
    await expect.poll(() => rig.wire.udp.at(-1)).toBe('DSTOP');
    const frozenCount = motionLines(rig).length, frozenBatch = batches;
    await expect.poll(() => batches).toBeGreaterThan(frozenBatch + 3);
    expect(motionLines(rig)).toHaveLength(frozenCount);
    expect((await rig.overview()).runtime.isEmergency).toBe(false);
    frozen = false;
    await expect.poll(async () => (await rig.overview()).runtime.computedInputBlocked).toBe(false);
    await expect.poll(() => motionLines(rig).length).toBeGreaterThan(frozenCount);
    await outputValue(rig, 'udp', 526);
    await feed.stop();
    await info.attach('following-plane-simulation.json', { body: JSON.stringify({ fixtureOnly: true,
      unityClientExecution: false, hardwareExecution: false, coordinateFrame: 'AvatarRootMeters',
      point: [.3, .4, .2], origin: [.1, .1, .1], forward: [.1, .22, .26],
      expectedDepth: .26, expectedOffset: Math.sqrt(.0724), markerDirectionNormalized: true,
      stoppedOnZeroNormal: true, stoppedOnFrozenForwardSample: true, changingOtherMarkersRenewForward: false,
      createdDraftsEnableInput: false, savedDraftsEnableInput: false,
    }), contentType: 'application/json' });
  });
