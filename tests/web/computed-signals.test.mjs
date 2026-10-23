import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildComputedDrafts, newComputedDraft, computeComputedHash, computedDraftIncomplete, computedMappingPreview, computedMappingPreviews, stripComputedDraft, expandMappingSources,
  SPATIAL_COMPUTED_OPERATIONS, computedInputLimit, computedVectorGroups, computedVectorBinding, makeComputedVector, changeComputedOperation, newSpatialComputedDraft, followingPlaneDrafts, computedResultUnit } from '../../src/web/computed-signals.js';
import { getLocale, setLocale } from '../../src/web/i18n.js';
import { buildSignalDrafts, editConfiguration } from '../../src/web/configuration.js';
import { controlReadiness } from '../../src/web/control-workflow.js';
import { oscWorkflowHints } from '../../src/web/osc-workflow.js';
import { rankPreview } from '../../src/web/osc-preview.js';

const constant = value => ({ sourceMode: 'Constant', value });
const upstream = { id: 'Blend', name: 'Blend', operation: 'WeightedAverage', inputs: [constant(.2), { ...constant(.8), weight: 3 }], maxAgeMs: 0 };
const downstream = { id: 'Scaled', name: 'Scaled', operation: 'Product', inputs: [{ sourceMode: 'Computed', oscPath: 'Blend' }, constant(2)], maxAgeMs: 0 };
const runtime = [{ id: 'Blend', valid: true, value: .65, sourceKey: 'osc', timestampMs: 10 }, { id: 'Scaled', valid: true, value: 1.3 }];

test('calculation drafts keep nested inputs independent and use reception settings by default / 计算草稿独立复制输入并默认沿用接收设置', () => {
  const source = [upstream], before = JSON.stringify(source), drafts = buildComputedDrafts(source);
  drafts[0].inputs[0].value = .4;
  assert.equal(JSON.stringify(source), before);
  assert.equal(newComputedDraft([{ id: 'Signal1' }, { id: 'Signal3' }]).id, 'Signal2');
  const fresh = newComputedDraft();
  assert.equal(fresh.maxAgeMs, 0); assert.equal(fresh.inputs.length, 2);
  assert.equal(computedDraftIncomplete(fresh), true);
  fresh.inputs = [constant(0), constant(1)];
  assert.equal(computedDraftIncomplete(fresh), false);
  fresh.inputs[0].value = '';
  assert.equal(computedDraftIncomplete(fresh), true);
  assert.equal(computeComputedHash(source), computeComputedHash(buildComputedDrafts(source)));
});

test('mapping and reusable calculations save atomically without mutating the current configuration / 映射与可复用计算一起保存且保持当前配置独立', () => {
  const source = { outputs: [], signals: [], computedSignals: [] }, before = JSON.stringify(source);
  const drafts = buildComputedDrafts([upstream, downstream]);
  const config = editConfiguration(source, { kind: 'mappings', drafts: buildSignalDrafts([{ sourceMode: 'Computed', oscPath: ' Scaled ', role: 'Depth' }]), computedDrafts: drafts });
  assert.equal(JSON.stringify(source), before);
  assert.equal(config.signals[0].oscPath, 'Scaled');
  assert.equal(config.computedSignals[1].inputs[0].oscPath, 'Blend');
  drafts[0].inputs[0].value = 9;
  assert.equal(config.computedSignals[0].inputs[0].value, .2);
  assert.equal(stripComputedDraft({ id: ' ID ', inputs: [{ sourceMode: 'Direct', oscPath: ' CI/A ', weight: '3' }] }).inputs[0].oscPath, 'CI/A');
  assert.throws(() => editConfiguration(config, { kind: 'preset-save', preset: { id: 'bad', mappings: config.signals } }));
});

test('saved results preserve zero and invalid state; editing a dependency hides downstream runtime results / 实时结果保留零与无效状态，改动上游后下游等待保存', () => {
  const saved = [upstream, downstream], drafts = buildComputedDrafts(saved), signal = { oscPath: 'Scaled' };
  assert.equal(computedMappingPreview(signal, drafts, saved, runtime).numericValue, 1.3);
  assert.equal(computedMappingPreview(signal, drafts, saved, [{ id: 'Scaled', valid: true, value: 0 }]).numericValue, 0);
  assert.equal(computedMappingPreview(signal, drafts, saved, [{ id: 'Scaled', valid: false, value: 1.3, reason: 'Expired' }]).numericValue, undefined);
  drafts[0].inputs[0].value = .3;
  assert.equal(computedMappingPreview(signal, drafts, saved, runtime).numericValue, undefined);
  assert.equal(computedMappingPreviews(drafts, saved, runtime, true).get('Scaled').numericValue, undefined);
  assert.equal(computedMappingPreview({ oscPath: 'Deleted' }, drafts, saved, runtime).numericValue, undefined);
});

test('computed input waits appear only for applied OSC mode and keep the backend reason / 计算等待仅影响实际OSC模式并解释后端原因', () => {
  const runtime = { inputActive: true, manualOverrideEnabled: true, computedInputBlocked: true, computedInputBlockedReason: 'Input A has expired' };
  const output = { id: 'mock', type: 'TCodeUdp', enabled: true };
  const state = { online: true, runtime, outputs: [output], outputStates: [{ ...output, connected: true }], listening: true, mappings: [{ sourceMode: 'Computed', oscPath: 'Blend' }] };
  assert.equal(controlReadiness({ ...state, mode: 'osc' }).key, 'computed');
  assert.equal(controlReadiness({ ...state, mode: 'osc' }).detail, runtime.computedInputBlockedReason);
  assert.equal(controlReadiness({ ...state, mode: 'manual' }).key, 'enabled');
  assert.equal(controlReadiness({ ...state, mode: 'script', script: { loaded: true, playing: true } }).key, 'enabled');
  assert.ok(oscWorkflowHints({ ...state, mode: 'osc' }).some(hint => hint.key === 'computed'));
  assert.ok(!oscWorkflowHints({ ...state, mode: 'manual' }).some(hint => hint.key === 'computed'));
  assert.equal(runtime.inputActive, true);
});

test('mapped parameter browsing follows only reachable calculation leaves / 已映射参数浏览跟随实际使用的计算输入', () => {
  const ordinary = { oscPath: 'Raw/Depth', role: 'Depth' };
  const mappings = [ordinary, { sourceMode: 'Computed', oscPath: 'Output' }];
  const definitions = [
    { id: 'Output', operation: 'WeightedAverage', inputs: [
      { sourceMode: 'Computed', oscPath: 'Branch', weight: 2 }, { sourceMode: 'Direct', oscPath: 'Unused/Zero', weight: 0 }, constant(.1),
    ] },
    { id: 'Branch', operation: 'Sum', inputs: [
      { sourceMode: 'Direct', oscPath: 'FT/Contact', weight: 0 }, // Weight only applies to WeightedAverage.
      { sourceMode: 'SensaPoint', oscPath: 'Sensa/SPS/Root/**', pointMetric: 'Z' },
      { sourceMode: 'SensaPose', oscPath: 'Sensa/Pose/v1/Rig/**', poseMetric: 'Depth' },
      { sourceMode: 'Direct', oscPath: 'FT/Contact' },
    ] },
    { id: 'Unused', operation: 'Sum', inputs: [{ sourceMode: 'Direct', oscPath: 'Unused/Definition' }] },
  ];
  const before = JSON.stringify({ mappings, definitions });
  const sources = expandMappingSources(mappings, definitions);
  assert.equal(sources[0], ordinary);
  assert.deepEqual(sources.map(source => source.oscPath), ['Raw/Depth', 'FT/Contact', 'Sensa/SPS/Root/**', 'Sensa/Pose/v1/Rig/**']);
  const paths = ['Raw/Depth', 'FT/Contact', 'Sensa/SPS/Root/P0', 'Sensa/Pose/v1/Rig/Root/A0', 'Unused/Zero', 'Unused/Definition', 'Output'];
  assert.deepEqual(rankPreview(paths.map(path => ({ path })), sources, { category: 'mapped' }).map(row => row.path).sort(), paths.slice(0, 4).sort());
  assert.equal(JSON.stringify({ mappings, definitions }), before);
});

test('temporary cyclic or missing draft references remain bounded and preserve valid leaves / 临时循环和缺失引用保持有界并保留可用参数', () => {
  const definitions = [
    { id: 'A', operation: 'Sum', inputs: [{ sourceMode: 'Computed', oscPath: 'B' }, { sourceMode: 'Computed', oscPath: 'Missing' }] },
    { id: 'B', operation: 'Sum', inputs: [{ sourceMode: 'Computed', oscPath: 'A' }, { sourceMode: 'Direct', oscPath: 'Leaf' }] },
  ];
  assert.deepEqual(expandMappingSources([{ sourceMode: 'Computed', oscPath: 'A' }, { sourceMode: 'Computed', oscPath: 'Missing' }], definitions).map(source => source.oscPath), ['Leaf']);
  assert.deepEqual(expandMappingSources([], definitions), []);
  assert.deepEqual(expandMappingSources(null, null), []);
  const oversized = [{ id: 'Root', inputs: Array.from({ length: 17 }, (_, index) => ({ sourceMode: 'Direct', oscPath: `Leaf${index}` })) },
    ...Array.from({ length: 64 }, (_, index) => ({ id: `N${index}`, inputs: [{ sourceMode: 'Direct', oscPath: `Node${index}` }] }))];
  const sources = expandMappingSources([{ sourceMode: 'Computed', oscPath: 'Root' }, { sourceMode: 'Computed', oscPath: 'N63' }], oversized);
  assert.equal(sources.length, 16);
  assert.ok(!sources.some(source => source.oscPath === 'Leaf16' || source.oscPath === 'Node63'));
});

test('spatial editors preserve semantic XYZ groups across related operations and serialize fixed slots', () => {
  const pointPath = 'Sensa/Contact/Target/**';
  for (const operation of SPATIAL_COMPUTED_OPERATIONS) {
    const draft = newSpatialComputedDraft([], operation, pointPath);
    const expected = operation.endsWith('FromAxes') ? 12 : ['PlaneDepth', 'PlaneOffset'].includes(operation) ? 9 : 6;
    assert.equal(computedInputLimit(operation), expected);
    assert.equal(draft.inputs.length, expected);
    assert.equal(computedDraftIncomplete(draft), false);
    assert.equal(stripComputedDraft(draft).inputs.length, expected);
    draft.inputs.pop(); assert.equal(computedDraftIncomplete(draft), true);
  }
  const original = newSpatialComputedDraft([], 'PlaneDepth', pointPath);
  original.inputs[3].value = .25; original.inputs[7].value = 3; original.inputs[8].value = 4;
  const changed = { ...original, ...changeComputedOperation(original, 'PlaneOffset') };
  assert.deepEqual(changed.inputs, original.inputs); assert.notEqual(changed.inputs[0], original.inputs[0]);
  const distance = { ...changed, ...changeComputedOperation(changed, 'PointDistance') };
  assert.deepEqual(distance.inputs, original.inputs.slice(0, 6));
  const axes = { ...distance, ...changeComputedOperation(distance, 'PlaneDepthFromAxes') };
  assert.deepEqual(axes.inputs.slice(0, 6), distance.inputs);
  assert.deepEqual(axes.inputs.slice(6).map(input => input.value), [1, 0, 0, 0, 1, 0]);
  assert.deepEqual(computedVectorGroups('PlaneDepthFromAxes').map(group => group.start), [0, 3, 6, 9]);
  assert.equal(newSpatialComputedDraft([], 'PointDistance').inputs[0].oscPath, '');
  assert.equal(computedDraftIncomplete(newSpatialComputedDraft([], 'PointDistance')), true);
});

test('vector shortcuts retain XYZ order while mixed sources remain explicitly configurable', () => {
  for (const [mode, path, metrics] of [
    ['Position', 'Sensa/SPS/Target/**', ['X', 'Y', 'Z']],
    ['Forward', 'Sensa/Shader/42/**', ['ForwardX', 'ForwardY', 'ForwardZ']],
    ['Right', 'Sensa/Shader/42/**', ['RightX', 'RightY', 'RightZ']],
    ['Velocity', 'Sensa/Contact/Target/**', ['VelocityX', 'VelocityY', 'VelocityZ']],
  ]) {
    const inputs = makeComputedVector(mode, path);
    assert.deepEqual(inputs.map(input => input.pointMetric), metrics);
    assert.deepEqual(computedVectorBinding(inputs), { mode, path });
    inputs[1].oscPath = 'Sensa/Shader/Other/**';
    assert.equal(computedVectorBinding(inputs).mode, 'Components');
  }
  assert.deepEqual(makeComputedVector('Constant', '', [0, -2, 4]).map(input => input.value), [0, -2, 4]);
  assert.equal(computedVectorBinding([constant(0), constant(0), constant(1)]).mode, 'Constant');
  assert.equal(computedVectorBinding([{ sourceMode: 'Computed', oscPath: 'X' }]).mode, 'Components');
});

test('following-plane templates create bounded references without changing saved definitions', () => {
  const saved = [{ id: 'Signal1', operation: 'Sum', inputs: [constant(1)] }], before = JSON.stringify(saved);
  const options = { pointPath: 'Sensa/Contact/Target/**', originPath: 'Sensa/Contact/Guide_Origin/**', includeDistance: true };
  const drafts = followingPlaneDrafts(saved, options);
  assert.equal(JSON.stringify(saved), before);
  assert.deepEqual(drafts.map(draft => draft.id), ['Signal2', 'Signal3', 'Signal4', 'Signal5', 'Signal6', 'Signal7']);
  assert.deepEqual(drafts.map(draft => draft.operation), ['Difference', 'Difference', 'Difference', 'PlaneDepth', 'PlaneOffset', 'PointDistance']);
  for (let index = 0; index < 3; index++) {
    assert.deepEqual(drafts[index].inputs.map(input => input.oscPath), ['Sensa/Contact/Guide_Forward/**', options.originPath]);
    assert.ok(drafts[index].inputs.every(input => input.pointMetric === ['X', 'Y', 'Z'][index]));
  }
  assert.deepEqual(drafts[3].inputs.slice(6).map(input => [input.sourceMode, input.oscPath]), [['Computed', 'Signal2'], ['Computed', 'Signal3'], ['Computed', 'Signal4']]);
  assert.deepEqual(drafts[4].inputs, drafts[3].inputs);
  drafts[4].inputs[0].oscPath = 'Changed'; assert.equal(drafts[3].inputs[0].oscPath, options.pointPath);
  assert.ok(drafts.every(draft => !computedDraftIncomplete(draft)));
  const shader = followingPlaneDrafts([], { ...options, mode: 'Shader', originPath: 'Sensa/Shader/7/**', includeDistance: false });
  assert.deepEqual(shader.map(draft => draft.operation), ['PlaneDepth', 'PlaneOffset']);
  assert.deepEqual(computedVectorBinding(shader[0].inputs.slice(6)), { mode: 'Forward', path: 'Sensa/Shader/7/**' });
  for (const originPath of ['', 'Sensa/Contact/Guide/**', 'Sensa/Shader/7/**']) {
    assert.deepEqual(followingPlaneDrafts([], { ...options, originPath }), []);
  }
  assert.deepEqual(followingPlaneDrafts(Array.from({ length: 60 }, (_, index) => ({ id: 'Signal' + index })), options), []);
});

test('spatial result labels keep degrees distinct and only show known position units', () => {
  const previous = getLocale(); setLocale('en-US');
  try {
    assert.equal(computedResultUnit('VectorAngle', { coordinateFrame: 'AvatarRootLocal:Angle' }), '°');
    assert.equal(computedResultUnit('PlaneAngle', null), '°');
    assert.equal(computedResultUnit('PlaneDepth', { coordinateFrame: 'AvatarRootMeters' }), 'm');
    assert.equal(computedResultUnit('PlaneDepthFromAxes', { coordinateFrame: 'AvatarRootLocal' }), 'local units');
    assert.equal(computedResultUnit('PlaneOffset', { coordinateFrame: 'ReferenceLocal:Guide' }), 'local units');
    assert.equal(computedResultUnit('PointDistance', {}), '');
    assert.equal(computedResultUnit('Product', { coordinateFrame: 'AvatarRootMeters' }), '');
  } finally { setLocale(previous); }
});
