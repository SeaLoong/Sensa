import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createDefaultConfiguration, normalizeConfiguration } from '../../src/core/runtime/configuration.ts';

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('../../', import.meta.url));
const compiled = await build({
  absWorkingDir: root,
  stdin: { contents: `
    export {default as Toolbar} from './src/web/SignalDraftToolbar.jsx';
    export {default as Mappings} from './src/web/AxisMappingsPanel.jsx';
    export {default as Pipeline,formatSavedBindingSource} from './src/web/SignalPipelineWorkspace.jsx';
    export {updateComputedView,pruneComputedView} from './src/web/ComputedSignalsPanel.jsx';
    export {default as OutputBindings} from './src/web/OutputBindings.jsx';
    export {setLocale,t} from './src/web/i18n.js';
    export {buildSignalDrafts,createOutputConfig,buildOutputDialogDraft,editConfiguration} from './src/web/configuration.js';
    export {buildComputedDrafts} from './src/web/computed-signals.js';
  `, resolveDir: root },
  bundle: true, write: false, platform: 'node', format: 'esm', jsx: 'automatic',
  plugins: [{ name: 'shared-test-react', setup(builder) {
    builder.onResolve({ filter: /^react(?:\/.*)?$/ }, args => ({ path: pathToFileURL(require.resolve(args.path)).href, external: true }));
  } }],
});
const { Toolbar, Mappings, Pipeline, formatSavedBindingSource, updateComputedView, pruneComputedView, OutputBindings, setLocale, t, buildSignalDrafts, createOutputConfig,
  buildOutputDialogDraft, editConfiguration, buildComputedDrafts } = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const render = (Component, props) => renderToStaticMarkup(React.createElement(Component, props));
const noop = () => {};
function elements(node) {
  if (!React.isValidElement(node)) return [];
  return [node, ...React.Children.toArray(node.props.children).flatMap(elements)];
}
const byId = (tree, id) => elements(tree).find(element => element.props['data-testid'] === id);
const byLabel = (tree, label) => elements(tree).find(element => element.props.children === t(label) && typeof element.props.onClick === 'function');
const buttonTag = (html, id) => {
  const result = [...html.matchAll(/<button\b[^>]*>/g)].find(match => match[0].includes(`data-testid="${id}"`))?.[0];
  assert.ok(result, id);
  return result;
};
const calculation = (id, value = .5) => ({ id, name: id, operation: 'WeightedAverage', maxAgeMs: 0,
  inputs: [{ sourceMode: 'Constant', value, weight: 1 }, { sourceMode: 'Constant', value: .8, weight: 1 }] });
const mappingProps = overrides => ({ toolbar: React.createElement(Toolbar, { workspace: 'osc', online: true }),
  onSelectPreset: noop, onApplyPreset: noop, onOpenPreset: noop, onDeletePreset: noop, onOpenComputations: noop,
  onUpdateMapping: noop, onRemoveMapping: noop, onAddMapping: noop, onClearMappings: noop, ...overrides });
const pipelineProps = overrides => ({ toolbar: React.createElement(Toolbar, { workspace: 'pipeline', online: true }),
  onComputedChange: noop, onMapCalculation: noop, onComputedViewChange: noop, config: createDefaultConfiguration(),
  onEditOutput: noop, onManageOutputs: noop, onSetCombinedInput: noop, onApplyPlan: noop, online: true, ...overrides });

for (const locale of ['zh-CN', 'en-US']) {
  test('joint draft toolbar exposes separate mapping/computation state and one save scope in ' + locale, () => {
    setLocale(locale);
    const html = render(Toolbar, { workspace: 'osc', mappingCount: 2, computedCount: 3, mappingDirty: false,
      computedDirty: true, online: true, onSave: noop, onRestore: noop });
    assert.match(html, /data-testid="signal-draft-toolbar" data-workspace="osc"/);
    assert.ok(html.includes(t('{0} 条轴映射', [2])));
    assert.ok(html.includes(t('{0} 个计算信号', [3])));
    assert.ok(html.includes(t('已保存')) && html.includes(t('未保存')));
    assert.ok(html.includes(t('计算信号与轴映射一起保存或恢复；输出连接单独保存。')));
    assert.doesNotMatch(buttonTag(html, 'save-signal-drafts'), /disabled=/);
    assert.doesNotMatch(buttonTag(html, 'restore-signal-drafts'), /disabled=/);
    assert.ok(html.includes(t('保存更改')) && html.includes(t('恢复更改')));
  });

  test('OSC composition keeps axis mapping controls and links to the sole graph owner in ' + locale, () => {
    setLocale(locale);
    const computations = buildComputedDrafts([calculation('DraftOnly')]);
    const signals = buildSignalDrafts([{ sourceMode: 'Computed', oscPath: 'DraftOnly', role: 'Depth' }]);
    const html = render(Mappings, mappingProps({ signalDrafts: signals, computedDrafts: computations,
      toolbar: React.createElement(Toolbar, { workspace: 'osc', mappingCount: 1, computedCount: 1, computedDirty: true, online: true }),
      computedGraphDirty: true, savedMappings: [{ oscPath: 'Saved/Depth', role: 'Depth' }], actualInputMode: 'osc', listening: true }));
    assert.match(html, /data-testid="axis-mappings-panel"/);
    assert.match(html, /data-testid="edit-computations"/);
    assert.match(html, /class="mapping-row/);
    assert.match(html, /<option value="DraftOnly"[^>]*selected=""/);
    assert.ok(html.includes(t('未保存')));
    assert.doesNotMatch(html, /data-testid="computed-signals-editor"|data-testid="computed-signal-card"|data-testid="computed-spatial-presets"/);
    const flow = render(Pipeline, pipelineProps({ computedDrafts: computations, computedGraphDirty: true,
      runtimeSignals: [{ id: 'DraftOnly', valid: true, value: .65 }] }));
    assert.equal((flow.match(/data-testid="computed-signals-editor"/g) || []).length, 1);
    assert.equal((flow.match(/data-testid="computed-signal-card"/g) || []).length, 1);
    assert.match(flow, /data-testid="computed-signal-value">—<\/output>/);
    assert.doesNotMatch(flow, /class="mapping-row/);
    assert.match(flow, /data-testid="flow-output-routing"/);
  });
}

test('save guards include incomplete drafts owned by the other workspace without blocking navigation or restoration', () => {
  setLocale('en-US');
  for (const patch of [{ online: false }, { busy: true }, { incompleteMappings: 1 }, { incompleteComputations: 1 }]) {
    const html = render(Toolbar, { workspace: 'osc', online: true, computedDirty: true, ...patch });
    assert.match(buttonTag(html, 'save-signal-drafts'), /disabled=""/, JSON.stringify(patch));
  }
  const opened = [], saves = [], restores = [];
  const props = { workspace: 'osc', online: true, incompleteComputations: 2,
    onSave: () => saves.push('save'), onRestore: () => restores.push('restore'),
    onOpenComputations: () => opened.push('pipeline'), onOpenMappings: () => opened.push('osc') };
  const osc = Toolbar(props);
  assert.equal(byId(osc, 'save-signal-drafts').props.disabled, true);
  assert.equal(byId(osc, 'restore-signal-drafts').props.disabled, false);
  byLabel(osc, '在流程中编辑计算信号').props.onClick();
  assert.deepEqual(opened, ['pipeline']); assert.deepEqual(saves, []); assert.deepEqual(restores, []);
  byId(osc, 'restore-signal-drafts').props.onClick();
  assert.deepEqual(restores, ['restore']);
  const flow = Toolbar({ ...props, workspace: 'pipeline', incompleteComputations: 0, incompleteMappings: 1 });
  byLabel(flow, '前往轴映射').props.onClick();
  assert.deepEqual(opened, ['pipeline', 'osc']);
  const ready = Toolbar({ ...props, incompleteComputations: 0, mappingDirty: true });
  assert.equal(byId(ready, 'save-signal-drafts').props.disabled, false);
  byId(ready, 'save-signal-drafts').props.onClick();
  assert.deepEqual(saves, ['save']);
});

test('axis diagnostics use saved gates while mapping drafts remain independent', () => {
  setLocale('en-US');
  const savedMappings = [{ oscPath: 'Saved/Depth', role: 'Depth' }, { oscPath: 'Saved/Gate', role: 'GateEnable' }];
  const signalDrafts = buildSignalDrafts([{ oscPath: 'Draft/Gate', role: 'GateEnable' }]);
  const html = render(Mappings, mappingProps({ savedMappings, signalDrafts, hasUnsavedMappings: true,
    actualInputMode: 'osc', listening: true, runtime: { inputActive: true, gateClosed: true } }));
  const diagnostics = html.match(/<details class="workflow-details">([\s\S]*?)<\/details>/)?.[1];
  assert.ok(diagnostics);
  assert.ok(diagnostics.includes('Saved/Gate'));
  assert.ok(!diagnostics.includes('Draft/Gate'));
  assert.ok(!diagnostics.includes(t('还没有已保存的映射。选择实际 OGB 参数或自定义映射，替换草稿后保存。')));
  assert.match(html, /value="Draft\/Gate"/);
});

test('axis actions delegate explicit preset, navigation and mapping edits without rendering side effects', () => {
  setLocale('en-US');
  const actions = [];
  const draft = buildSignalDrafts([{ oscPath: 'CI/Depth', role: 'Depth' }])[0];
  const props = mappingProps({ signalDrafts: [draft], computedDrafts: [calculation('Ready')],
    selectedOscPreset: 'ogb-depth', selectedOscPresetConfig: { id: 'ogb-depth', isBuiltIn: true },
    onOpenComputations: () => actions.push(['navigate', 'pipeline']), onApplyPreset: mode => actions.push(['preset', mode]),
    onUpdateMapping: (id, patch) => actions.push(['update', id, patch]), onRemoveMapping: id => actions.push(['remove', id]),
    onAddMapping: () => actions.push(['add']), onClearMappings: () => actions.push(['clear']) });
  render(Mappings, props);
  assert.deepEqual(actions, []);
  const tree = Mappings(props);
  byId(tree, 'edit-computations').props.onClick();
  byLabel(tree, '追加草稿').props.onClick();
  const row = elements(tree).find(element => element.props.draft === draft);
  row.props.onChange({ role: 'V0' }); row.props.onRemove();
  byLabel(tree, '新增映射').props.onClick(); byLabel(tree, '清空映射').props.onClick();
  assert.deepEqual(actions, [['navigate', 'pipeline'], ['preset', 'append'], ['update', draft._draftId, { role: 'V0' }], ['remove', draft._draftId], ['add'], ['clear']]);
  assert.equal(draft.role, 'Depth');
});

const savedOutput = (id, type, enabled = true) => ({ ...createOutputConfig(type, { outputs: [] }), id, name: id, enabled });
function routingFixture() {
  const ready = savedOutput('Ready OSC', 'OscParameter');
  ready.signal.bindings[0] = { ...ready.signal.bindings[0], name: 'Saved route', source: { sourceMode: 'Computed', oscPath: 'SavedGraph' }, address: '/ci/saved' };
  const disabled = savedOutput('Disabled OSC', 'OscParameter', false);
  const unavailable = savedOutput('Unavailable MIDI', 'Midi');
  const failed = savedOutput('Failed recording', 'Recording');
  const legacy = { ...savedOutput('Legacy motion', 'TCodeUdp'), signal: { bindings: [] } };
  return { outputs: [ready, disabled, unavailable, failed, legacy],
    outputAvailability: new Map([['Midi', { available: false, reason: 'MIDI unavailable in this host' }]]),
    overview: { outputs: [
      { id: ready.id, connected: true }, { id: disabled.id, connected: true }, { id: unavailable.id, connected: true },
      { id: failed.id, connected: false, lastError: '<script>transport failed</script>', signalStatus: {
        error: 'Recording directory unavailable', status: 'Awaiting valid samples', routes: [{ valid: false, reason: 'Input value expired' }] } },
      { id: legacy.id, connected: true },
    ] } };
}

test('Flow routing renders saved bindings and keeps unavailable, disabled and error states truthful outside disclosures', () => {
  setLocale('en-US');
  const fixture = routingFixture();
  const before = JSON.stringify(fixture.outputs);
  const html = render(Pipeline, pipelineProps({ ...fixture, computedDrafts: [calculation('UnsavedGraph')], computedGraphDirty: true }));
  const article = id => {
    const result = html.match(new RegExp(`<article[^>]*data-output-id="${id}"[\\s\\S]*?<\\/article>`))?.[0];
    assert.ok(result, id); return result;
  };
  const ready = article('Ready OSC');
  assert.ok(ready.includes('SavedGraph') && ready.includes('/ci/saved'));
  assert.ok(!ready.includes('UnsavedGraph'));
  assert.ok(ready.includes(t('已连接')));
  assert.ok(article('Disabled OSC').includes(t('已禁用')));
  assert.ok(!article('Disabled OSC').includes(t('已连接')));
  const unavailable = article('Unavailable MIDI');
  assert.ok(unavailable.includes(t('当前不可用')) && unavailable.includes('MIDI unavailable in this host'));
  assert.ok(!unavailable.includes(t('已连接')));
  const failed = article('Failed recording');
  assert.ok(failed.includes('&lt;script&gt;transport failed&lt;/script&gt;'));
  assert.ok(!failed.includes('<script>transport failed</script>'));
  for (const message of ['transport failed', 'Recording directory unavailable', 'Input value expired']) {
    assert.ok(failed.indexOf(message) < failed.indexOf('<details>'), message);
  }
  assert.ok(article('Legacy motion').includes(t('使用当前动作目标')));
  assert.ok(!article('Legacy motion').includes(t('{0} 条独立连接', [0])));
  assert.doesNotMatch(html, /data-testid="output-binding"|data-testid="add-output"|role="switch"/);
  assert.equal(JSON.stringify(fixture.outputs), before);
});

test('Flow route editing delegates only the saved output ID and is unavailable while offline or busy', () => {
  const fixture = routingFixture(), actions = [];
  const props = pipelineProps({ ...fixture, onEditOutput: id => actions.push(id), onManageOutputs: () => actions.push('manage') });
  const tree = Pipeline(props);
  const routing = elements(tree).find(element => element.props.outputs === fixture.outputs && element.props.onEditOutput === props.onEditOutput);
  assert.ok(routing);
  // The route-summary component is pure; inspect its actual button callbacks without mounting a browser.
  const summary = routing.type(routing.props);
  const edits = elements(summary).filter(element => element.props['data-testid'] === 'edit-output-bindings');
  assert.equal(edits.length, fixture.outputs.length);
  assert.deepEqual(actions, []);
  edits[0].props.onClick(); edits[2].props.onClick();
  assert.deepEqual(actions, ['Ready OSC', 'Unavailable MIDI']);
  for (const patch of [{ online: false }, { busy: true }]) {
    const html = render(Pipeline, { ...props, ...patch });
    const buttons = [...html.matchAll(/<button\b[^>]*data-testid="edit-output-bindings"[^>]*>/g)];
    assert.equal(buttons.length, fixture.outputs.length);
    assert.ok(buttons.every(button => button[0].includes('disabled=""')));
  }
});

function savedConfiguration() {
  const config = createDefaultConfiguration();
  const output = savedOutput('bound-output', 'OscParameter', false);
  output.signal.bindings[0] = { ...output.signal.bindings[0], source: { sourceMode: 'Computed', oscPath: 'SavedGraph' }, address: '/ci/saved' };
  config.outputs = [output]; config.computedSignals = [calculation('SavedGraph')];
  config.signals = [{ sourceMode: 'Computed', oscPath: 'SavedGraph', role: 'Depth', vrchatMin: 0, vrchatMax: 1 }];
  return normalizeConfiguration(config);
}

test('joint graph and legacy-axis save composes one valid configuration while preserving saved output bindings', () => {
  const config = savedConfiguration(), before = JSON.stringify(config);
  const computations = buildComputedDrafts([...config.computedSignals, calculation('NewGraph', .3)]);
  const mappings = buildSignalDrafts([{ sourceMode: 'Computed', oscPath: 'NewGraph', role: 'V0' }]);
  const next = editConfiguration(config, { kind: 'mappings', drafts: mappings, computedDrafts: computations });
  const validated = normalizeConfiguration(next);
  assert.equal(validated.signals[0].oscPath, 'NewGraph');
  assert.equal(validated.computedSignals.length, 2);
  assert.deepEqual(next.outputs, config.outputs);
  assert.deepEqual(next.axisProfiles, config.axisProfiles);
  assert.equal(JSON.stringify(config), before);
  computations[1].inputs[0].value = .9;
  assert.equal(next.computedSignals[1].inputs[0].value, .3);
});

test('output binding save preserves both saved graph and axis mappings and cannot commit pending workspace drafts', () => {
  const config = savedConfiguration(), before = JSON.stringify(config);
  const computations = buildComputedDrafts([...config.computedSignals, calculation('UnsavedGraph')]);
  const mappings = buildSignalDrafts([{ sourceMode: 'Computed', oscPath: 'UnsavedGraph', role: 'V0' }]);
  const pendingBefore = JSON.stringify({ computations, mappings });
  const outputDraft = buildOutputDialogDraft(config.outputs[0].id, config, []);
  outputDraft.signal.bindings[0].name = 'Changed binding';
  const next = editConfiguration(config, { kind: 'output-save', id: config.outputs[0].id, draft: outputDraft });
  assert.equal(next.outputs[0].signal.bindings[0].name, 'Changed binding');
  assert.deepEqual(next.computedSignals, config.computedSignals);
  assert.deepEqual(next.signals, config.signals);
  assert.equal(JSON.stringify({ computations, mappings }), pendingBefore);
  assert.equal(JSON.stringify(config), before);
});

test('complete configuration validation rejects orphaned graph references across both saved consumers', () => {
  const config = savedConfiguration();
  const withAxisReference = editConfiguration(config, { kind: 'mappings', drafts: buildSignalDrafts(config.signals), computedDrafts: [] });
  assert.throws(() => normalizeConfiguration(withAxisReference), /Mapping references an unknown computed signal/);
  const withOutputReference = editConfiguration(config, { kind: 'mappings', drafts: [], computedDrafts: [] });
  assert.throws(() => normalizeConfiguration(withOutputReference), /Output references an unknown computed signal/);
  assert.equal(config.computedSignals[0].id, 'SavedGraph');
  assert.equal(config.outputs[0].signal.bindings[0].source.oscPath, 'SavedGraph');
});

test('output source selection receives saved graph catalog separately from the OSC draft catalog', () => {
  const config = savedConfiguration();
  const draftGraph = buildComputedDrafts([...config.computedSignals, calculation('UnsavedGraph')]);
  const output = render(OutputBindings, { output: config.outputs[0], signals: config.computedSignals, onChange: noop });
  assert.match(output, /<option value="SavedGraph"[^>]*selected=""/);
  assert.ok(!output.includes('value="UnsavedGraph"'));
  const axes = render(Mappings, mappingProps({ signalDrafts: buildSignalDrafts([{ sourceMode: 'Computed', oscPath: 'UnsavedGraph', role: 'Depth' }]), computedDrafts: draftGraph }));
  assert.match(axes, /<option value="UnsavedGraph"[^>]*selected=""/);
});

test('controlled graph expansion is idempotent on remount and preserves multiple expanded cards and current selection', () => {
  const current = Object.freeze({ selectedId: 'Second', expandedIds: Object.freeze(['First', 'Second']) });
  assert.equal(updateComputedView(current, 'First', true), current,
    'An already-open card receiving its initial native toggle must not take selection from another card.');
  assert.equal(updateComputedView(current, 'Second', true), current);
  assert.equal(updateComputedView(current, 'Absent', false), current);
  const opened = updateComputedView(current, 'Third', true);
  assert.deepEqual(opened, { selectedId: 'Third', expandedIds: ['First', 'Second', 'Third'] });
  assert.deepEqual(updateComputedView(opened, 'First', false), { selectedId: 'Third', expandedIds: ['Second', 'Third'] });
  assert.deepEqual(current, { selectedId: 'Second', expandedIds: ['First', 'Second'] });
});

test('plan or restore pruning removes vanished graph view state without losing surviving cards or reopening reused IDs', () => {
  const current = Object.freeze({ selectedId: 'Removed', expandedIds: Object.freeze(['Keep', 'Removed', 'OtherRemoved']) });
  const restored = [{ id: 'Keep' }, { id: 'New' }];
  const pruned = pruneComputedView(current, restored);
  assert.deepEqual(pruned, { selectedId: '', expandedIds: ['Keep'] });
  assert.equal(pruneComputedView(pruned, restored), pruned,
    'Unchanged surviving view state keeps its reference to avoid unnecessary remount updates.');
  const selectedSurvivor = { selectedId: 'Keep', expandedIds: ['Keep', 'Removed'] };
  assert.deepEqual(pruneComputedView(selectedSurvivor, restored), { selectedId: 'Keep', expandedIds: ['Keep'] });
  assert.deepEqual(pruneComputedView(current), { selectedId: '', expandedIds: [] });
  const reused = pruneComputedView(pruned, [...restored, { id: 'Removed' }]);
  assert.equal(reused, pruned);
  assert.ok(!reused.expandedIds.includes('Removed'));
  assert.equal(reused.selectedId, '');
  assert.deepEqual(updateComputedView(reused, 'Removed', true), { selectedId: 'Removed', expandedIds: ['Keep', 'Removed'] });
  assert.deepEqual(current, { selectedId: 'Removed', expandedIds: ['Keep', 'Removed', 'OtherRemoved'] });
});

test('Flow remounts restore controlled open cards, selection and dirty draft field values without publishing live previews', () => {
  setLocale('en-US');
  const computations = buildComputedDrafts([calculation('First', -.375), calculation('Second', .625), calculation('Closed', .912)]);
  computations[0].name = 'Unsubmitted first graph'; computations[1].name = 'Unsubmitted second graph';
  const computedView = { selectedId: 'Second', expandedIds: ['First', 'Second'] };
  const before = JSON.stringify({ computations, computedView }), changes = [];
  const props = pipelineProps({ computedDrafts: computations, computedGraphDirty: true, computedView,
    onComputedViewChange: update => changes.push(update), runtimeSignals: computations.map(signal => ({ id: signal.id, valid: true, value: 777 })) });
  for (let mount = 0; mount < 2; mount++) {
    const html = render(Pipeline, props);
    const cards = [...html.matchAll(/<details\b[^>]*data-testid="computed-signal-card"[^>]*>/g)].map(match => match[0]);
    assert.equal(cards.length, 3);
    for (const id of ['First', 'Second']) assert.match(cards.find(tag => tag.includes(`data-signal-id="${id}"`)), /\bopen=""/);
    assert.doesNotMatch(cards.find(tag => tag.includes('data-signal-id="Closed"')), /\bopen=/);
    assert.match(cards.find(tag => tag.includes('data-signal-id="Second"')), /data-selected="true"/);
    assert.doesNotMatch(cards.find(tag => tag.includes('data-signal-id="First"')), /data-selected=/);
    for (const value of ['-0.375', '0.625']) assert.ok(html.includes(`value="${value}"`), value);
    assert.match(html, /value="Unsubmitted first graph"/);
    assert.match(html, /value="Unsubmitted second graph"/);
    assert.ok(!html.includes('value="0.912"'));
    assert.equal((html.match(/data-testid="computed-signal-value">—<\/output>/g) || []).length, 3);
    assert.ok(!html.includes('>777</output>'));
  }
  assert.deepEqual(changes, []);
  assert.equal(JSON.stringify({ computations, computedView }), before);
});

for (const locale of ['zh-CN', 'en-US']) {
  test('saved binding sources retain constants, localized kinds and saved graph identity in ' + locale, () => {
    setLocale(locale);
    const binding = source => ({ source });
    assert.equal(formatSavedBindingSource(binding({ sourceMode: 'Constant', value: 0 })), `${t('固定数值')} · 0`);
    assert.equal(formatSavedBindingSource(binding({ sourceMode: 'Constant', value: -.75 })), `${t('固定数值')} · -0.75`);
    for (const [mode, label, path] of [
      ['Direct', 'OSC 参数', 'CI/Depth'], ['Manual', '手动信号', 'L0'], ['Script', '脚本信号', 'Time'],
      ['Protocol', '协议输入', 'website/L0'], ['DeviceFeedback', '设备反馈', 'device/connected'],
      ['RecordingReplay', '录制回放', 'recording/value'],
    ]) assert.equal(formatSavedBindingSource(binding({ sourceMode: mode, oscPath: path })), `${t(label)} · ${path}`);
    const saved = [{ id: 'SavedGraph', name: 'Persisted blend' }];
    assert.equal(formatSavedBindingSource(binding({ sourceMode: 'Computed', oscPath: 'SavedGraph' }), saved), `${t('计算信号')} · Persisted blend (SavedGraph)`);
    assert.equal(formatSavedBindingSource(binding({ sourceMode: 'Computed', oscPath: 'MissingGraph' }), saved), `${t('计算信号')} · MissingGraph`);
  });
}

test('routing resolves names from the saved graph and keeps disabled outputs distinct from stale transport state', () => {
  setLocale('en-US');
  const config = savedConfiguration(); config.computedSignals[0].name = 'Persisted blend';
  const output = config.outputs[0];
  const draftGraph = buildComputedDrafts(config.computedSignals); draftGraph[0].name = 'Unsubmitted renamed graph';
  const html = render(Pipeline, pipelineProps({ config, outputs: [output], computedDrafts: draftGraph, computedGraphDirty: true,
    overview: { outputs: [{ id: output.id, connected: true, signalStatus: { status: 'Connected' } }] } }));
  const route = html.match(/<article[^>]*data-output-id="bound-output"[\s\S]*?<\/article>/)?.[0];
  assert.ok(route);
  assert.ok(route.includes(`${t('计算信号')} · Persisted blend (SavedGraph)`));
  assert.ok(!route.includes('Unsubmitted renamed graph'));
  assert.ok(route.includes(t('已禁用')));
  assert.ok(!route.includes(t('已连接')));
  assert.ok(!route.includes(t('未连接')));
  assert.equal(config.computedSignals[0].name, 'Persisted blend');
  assert.equal(draftGraph[0].name, 'Unsubmitted renamed graph');
});
