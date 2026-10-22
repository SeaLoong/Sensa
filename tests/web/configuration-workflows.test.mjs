import { test } from 'node:test';
import assert from 'node:assert/strict';
import { editConfiguration, buildOutputDialogDraft, buildOscDraftFromConfig, buildSignalDrafts, computeSignalHash, getOscMappingPresets, buildPresetDialogDraft, createOutputConfig, getOutputTargetConflicts, buildSuggestedOutputTarget, normalizeAxisProfiles } from '../../src/web/configuration.js';
import { computeSignalPreviewOutput } from '../../src/web/osc-workspace.js';

function initial() {
  return { outputs: [], axisProfiles: normalizeAxisProfiles({}), osc: {}, signals: [] };
}

test('profile lifecycle keeps one default and repairs output references without changing the source / 轴配置生命周期保持唯一默认并修复输出引用，原配置不变', () => {
  const source = initial(), saved = JSON.stringify(source);
  const draft = { profileId: 'precise', name: ' Precise ', isDefault: true, profile: source.axisProfiles[0].motion };
  const added = editConfiguration(source, { kind: 'profile-save', draft });
  assert.equal(JSON.stringify(source), saved);
  assert.equal(added.axisProfiles.filter(p => p.isDefault).length, 1);
  assert.equal(added.axisProfiles.find(p => p.isDefault).id, 'precise');
  let config = editConfiguration(added, { kind: 'output-add', output: { id: 'udp', type: 'TCodeUdp', motionProfileId: 'precise' } });
  const originalDefault = source.axisProfiles[0].id;
  config = editConfiguration(config, { kind: 'profile-default', id: originalDefault });
  config = editConfiguration(config, { kind: 'profile-remove', id: 'precise' });
  assert.equal(config.outputs[0].motionProfileId, originalDefault);
  assert.equal(config.axisProfiles.length, 1);
  assert.throws(() => editConfiguration(config, { kind: 'profile-remove', id: originalDefault }));
  assert.throws(() => editConfiguration(config, { kind: 'profile-default', id: 'missing' }));
});

test('all built-ins round-trip as independent drafts; custom presets preserve built-ins / 内置预设可独立转为草稿，自定义预设不修改内置内容', () => {
  const source = initial(), builtIns = getOscMappingPresets(source);
  assert.equal(builtIns.length, 5);
  for (const preset of builtIns) {
    const dialog = buildPresetDialogDraft(source, preset.id);
    assert.equal(dialog.isNew, true); assert.notEqual(dialog.presetId, preset.id);
    const draftSnapshot = computeSignalHash(dialog.mappings);
    const config = editConfiguration(source, { kind: 'preset-save', preset: { id: dialog.presetId, name: 'Custom', mappings: dialog.mappings } });
    const custom = getOscMappingPresets(config).find(p => p.id === dialog.presetId);
    assert.equal(computeSignalHash(buildSignalDrafts(custom.mappings)), draftSnapshot);
    assert.equal(getOscMappingPresets(config).length, 6);
    const removed = editConfiguration(config, { kind: 'preset-remove', id: dialog.presetId });
    assert.equal(getOscMappingPresets(removed).length, 5);
    assert.throws(() => editConfiguration(source, { kind: 'preset-remove', id: preset.id }));
  }
});

test('Contact position and speed presets prepare one explicit target while leaving activation to saving / Contact位置与速度预设准备明确目标草稿', () => {
  const source = initial(), snapshot = JSON.stringify(source), presets = getOscMappingPresets(source);
  for (const [id, metric, role, max] of [['contact-position', 'Z', 'Depth', .2], ['contact-speed', 'Speed', 'V0', 1]]) {
    const preset = presets.find(value => value.id === id);
    assert.equal(preset.mappings.length, 1);
    const [mapping] = preset.mappings;
    assert.deepEqual({ path: mapping.oscPath, mode: mapping.sourceMode, metric: mapping.pointMetric, role: mapping.role, min: mapping.vrchatMin, max: mapping.vrchatMax },
      { path: 'Sensa/Contact/Root/*', mode: 'SensaPoint', metric, role, min: 0, max });
    const dialog = buildPresetDialogDraft(source, id);
    dialog.mappings[0].oscPath = 'Sensa/Contact/ActualTarget/*';
    assert.equal(preset.mappings[0].oscPath, 'Sensa/Contact/Root/*');
  }
  assert.equal(JSON.stringify(source), snapshot);
  assert.equal(buildOscDraftFromConfig(source).allowExperimentalSpatialInput, false);
});

test('mapping drafts discard simulation metadata and preview the same saved travel / 映射保存删除模拟元数据，预览与保存行程一致', () => {
  const drafts = buildSignalDrafts([{ oscPath: ' Device/Z ', vrchatMin: -.1, vrchatMax: .1, mappedMin: 400, mappedMax: 600, invertDirection: true, curve: 'EaseIn' }, { oscPath: '' }]);
  drafts[0].simulateEnabled = true; drafts[0].simulatedValue = .09;
  const config = editConfiguration(initial(), { kind: 'mappings', drafts });
  assert.equal(config.signals.length, 1); assert.equal(config.signals[0].oscPath, 'Device/Z');
  for (const key of ['_draftId', 'simulateEnabled', 'simulatedValue']) assert.equal(key in config.signals[0], false);
  assert.equal(computeSignalHash(drafts), computeSignalHash(buildSignalDrafts(config.signals)));
  assert.equal(computeSignalPreviewOutput(config.signals[0], 0).mappedPosition, 450);
  assert.equal(computeSignalPreviewOutput(config.signals[0], -.2).mappedPosition, 600);
  assert.equal(computeSignalPreviewOutput(config.signals[0], 'invalid'), null);
});

test('OSC save rejects receiver feedback and duplicate destinations, then normalizes a valid draft / OSC 保存拒绝回路与重复目标，再规范有效草稿', () => {
  const source = initial(), draft = buildOscDraftFromConfig(source);
  assert.equal(draft.allowExperimentalSpatialInput, false);
  draft.allowExperimentalSpatialInput = true;
  draft.hubEnabled = true;
  draft.hubTargets = [{ _draftId: 'loop', id: 'loop', host: '127.0.0.1', port: draft.receiverPort, enabled: true }];
  assert.throws(() => editConfiguration(source, { kind: 'osc', draft }));
  draft.hubTargets = [{ _draftId: 'a', id: 'a', host: '127.0.0.1', port: 19092, enabled: true }, { _draftId: 'b', id: 'b', host: '127.0.0.1', port: 19092, enabled: true }];
  assert.throws(() => editConfiguration(source, { kind: 'osc', draft }));
  draft.hubTargets.pop(); draft.allowedSourceAddresses = '127.0.0.1; 127.0.0.2'; draft.oscQueryPollingRateHz = 100;
  const config = editConfiguration(source, { kind: 'osc', draft });
  assert.deepEqual(config.osc.allowedSourceAddresses, ['127.0.0.1', '127.0.0.2']);
  assert.equal(config.osc.oscQueryPolling.rateHz, 30);
  assert.equal(config.osc.hub.targets[0]._draftId, undefined);
  assert.equal(config.osc.allowExperimentalSpatialInput, true);
  assert.equal(buildOscDraftFromConfig(config).allowExperimentalSpatialInput, true);
});

test('output lifecycle proposes an unoccupied target, prevents collisions and preserves identity / 输出生命周期建议空闲目标、拒绝冲突并保持标识', () => {
  let config = initial();
  const output = createOutputConfig('TCodeUdp', config);
  config = editConfiguration(config, { kind: 'output-add', output });
  assert.notEqual(buildSuggestedOutputTarget('TCodeUdp', config).port, output.port);
  const another = createOutputConfig('TCodeUdp', config);
  config = editConfiguration(config, { kind: 'output-add', output: another });
  assert.ok(getOutputTargetConflicts(config, another.id, { ...another, port: output.port }).length);
  assert.throws(() => editConfiguration(config, { kind: 'output-save', id: another.id, draft: { ...another, port: output.port } }));
  config = editConfiguration(config, { kind: 'output-save', id: another.id, draft: { ...another, id: 'forged', type: 'Intiface', name: 'Edited' } });
  assert.equal(config.outputs[1].id, another.id); assert.equal(config.outputs[1].type, 'TCodeUdp');
  config = editConfiguration(config, { kind: 'output-enabled', id: another.id, enabled: true });
  assert.equal(config.outputs[1].enabled, true);
  config = editConfiguration(config, { kind: 'output-remove', id: output.id });
  assert.equal(config.outputs.length, 1);
});

test('Intiface starts with Central and explicit vibration routing survives edit/save / Intiface 默认连接 Central，明确振动轴在编辑保存后保留', () => {
  const source = initial();
  const output = createOutputConfig('Intiface', source);
  assert.equal(output.manageEngineProcess, false);
  assert.equal(output.vibrationAxis, 'V0');
  const added = editConfiguration(source, { kind: 'output-add', output });
  for (const [requested, expected] of [['V0', 'V0'], [' v1 ', 'V1'], ['V2', 'V2'], ['L0', 'L0'], ['unknown', 'V0'], [undefined, 'V0']]) {
    const config = { ...added, outputs: [{ ...output, vibrationAxis: requested, manageEngineProcess: true }] };
    const draft = buildOutputDialogDraft(output.id, config, []);
    assert.equal(draft.vibrationAxis, expected);
    assert.equal(draft.manageEngineProcess, true);
    const saved = editConfiguration(config, { kind: 'output-save', id: output.id, draft: { ...draft, vibrationAxis: requested } });
    assert.equal(saved.outputs[0].vibrationAxis, expected);
    assert.equal(saved.outputs[0].manageEngineProcess, true);
    assert.equal(saved.outputs[0].id, output.id);
  }
  const draft = buildOutputDialogDraft(output.id, added, []);
  const saved = editConfiguration(added, { kind: 'output-save', id: output.id, draft });
  assert.equal(saved.outputs[0].manageEngineProcess, false);
  assert.equal(added.outputs[0].vibrationAxis, 'V0');
});

test('OGB activation remains opt-in, preserves its destination and rejects receiver feedback / OGB 参数启用需明确选择，保留目标并拒绝监听回环', () => {
  const source = initial();
  const draft = buildOscDraftFromConfig(source);
  assert.equal(draft.ogbControlEnabled, false);
  assert.equal(draft.ogbControlPort, 9000);
  draft.ogbControlEnabled = true;
  draft.ogbControlHost = '127.0.0.1';
  draft.ogbControlPort = 19092;
  const saved = editConfiguration(source, { kind: 'osc', draft });
  assert.deepEqual(saved.osc.ogbControl, { enabled: true, host: '127.0.0.1', port: 19092 });
  assert.equal(buildOscDraftFromConfig(saved).ogbControlEnabled, true);
  assert.equal(buildOscDraftFromConfig(saved).ogbControlPort, 19092);
  assert.equal(source.osc.ogbControl, undefined);
  draft.ogbControlPort = draft.receiverPort;
  assert.throws(() => editConfiguration(source, { kind: 'osc', draft }));
  draft.receiverHost = '0.0.0.0';
  draft.ogbControlHost = '192.0.2.1';
  assert.throws(() => editConfiguration(source, { kind: 'osc', draft }));
});
