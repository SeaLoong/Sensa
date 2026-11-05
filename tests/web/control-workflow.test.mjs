import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createDefaultConfiguration } from '../../src/core/runtime/configuration.ts';
import { controlReadiness, outputRoutingScope } from '../../src/web/control-workflow.js';

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('../../', import.meta.url));
const compiled = await build({
  absWorkingDir: root,
  stdin: { contents: "export { default as GettingStarted } from './src/web/GettingStarted.jsx'; export { default as ManualControls } from './src/web/ManualControls.jsx'; export { default as Workbench } from './src/web/app.js'; export { setLocale, t } from './src/web/i18n.js';", resolveDir: root },
  bundle: true, write: false, platform: 'node', format: 'esm', jsx: 'automatic', loader: { '.js': 'jsx' },
  plugins: [{ name: 'shared-test-react', setup(builder) {
    builder.onResolve({ filter: /^react(?:\/.*)?$/ }, args => ({ path: pathToFileURL(require.resolve(args.path)).href, external: true }));
  } }],
});
const { GettingStarted, ManualControls, Workbench, setLocale, t } = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const render = (Component, props) => renderToStaticMarkup(React.createElement(Component, props));
function elements(node) {
  if (!React.isValidElement(node)) return [];
  return [node, ...React.Children.toArray(node.props.children).flatMap(elements)];
}

const output = { id: 'udp', type: 'TCodeUdp', enabled: true };
const base = { online: true, runtime: { inputActive: true, manualOverrideEnabled: true },
  outputs: [output], outputStates: [{ ...output, connected: true }] };

test('browsing never describes the running input as stopped; emergency and disconnect take precedence / 浏览不宣称运行输入停止，急停与断线优先', () => {
  const state = controlReadiness({ ...base, mode: 'manual', selectedMode: 'script' });
  assert.equal(state.key, 'browsing'); assert.equal(state.tone, 'info');
  assert.equal(controlReadiness({ ...base, selectedMode: 'script', runtime: { isEmergency: true } }).key, 'emergency');
  assert.equal(controlReadiness({ ...base, online: false }).key, 'offline');
  assert.equal(base.runtime.inputActive, true);
});

test('a connected Intiface service without a capable device is not a usable output / 仅连接Intiface服务不代表已有可用设备', () => {
  const config = { ...output, type: 'Intiface' };
  assert.equal(controlReadiness({ ...base, outputs: [config], outputStates: [{ ...config, connected: true, devices: [] }] }).key, 'outputs-unavailable');
  const ready = controlReadiness({ ...base, outputs: [config], outputStates: [{ ...config, connected: true, devices: [{ vibrateFeatures: 1 }] }] });
  assert.equal(ready.availableOutputs, 1); assert.equal(ready.key, 'enabled');
  assert.equal(controlReadiness({ ...base, outputs: [{ ...output, enabled: false }] }).availableOutputs, 0);
});

test('advanced Intiface readiness requires an exact advertised device, feature and capability match / 高级Intiface可用性精确匹配设备、特征和声明能力', () => {
  const device = { name: 'Rotation device', positionFeatures: 0, vibrateFeatures: 0,
    features: [{ index: 2, outputTypes: ['Rotate'] }] };
  const route = { deviceName: 'Rotation device', featureIndex: 2, outputType: 'Rotate', sourceAxis: 'V0' };
  const config = { ...output, type: 'Intiface', intifaceFeatures: [route] };
  const state = { ...base, outputs: [config], outputStates: [{ ...config, connected: true, devices: [device] }] };
  assert.equal(controlReadiness(state).availableOutputs, 1);
  assert.equal(controlReadiness(state).key, 'enabled');
  for (const patch of [{ deviceName: 'Different device' }, { deviceName: 'rotation device' }, { featureIndex: 1 },
    { outputType: 'Oscillate' }, { outputType: 'Inflate' }]) {
    const result = controlReadiness({ ...state, outputs: [{ ...config, intifaceFeatures: [{ ...route, ...patch }] }] });
    assert.equal(result.key, 'outputs-unavailable', JSON.stringify(patch));
    assert.equal(result.availableOutputs, 0);
  }
  assert.equal(controlReadiness({ ...state, outputs: [{ ...config, intifaceFeatures: [] }] }).key, 'outputs-unavailable');
  assert.equal(controlReadiness({ ...state, outputs: [{ ...config, intifaceFeatures: [{ ...route, deviceName: '', featureIndex: null }] }] }).availableOutputs, 1);
});

test('unmapped position and vibration features retain default routing beside advanced mappings / 未覆盖的位置与振动特征继续使用默认路由', () => {
  const config = { ...output, type: 'Intiface', intifaceFeatures: [{ deviceName: 'Other device', featureIndex: 9, outputType: 'Rotate', sourceAxis: 'V0' }] };
  for (const outputTypes of [['HwPositionWithDuration'], ['Position'], ['Vibrate']]) {
    const state = { ...base, outputs: [config], outputStates: [{ ...config, connected: true,
      devices: [{ name: 'Default device', features: [{ index: 0, outputTypes }] }] }] };
    assert.equal(controlReadiness(state).availableOutputs, 1, outputTypes.join());
  }
  const legacy = { ...base, outputs: [config], outputStates: [{ ...config, connected: true, devices: [{ name: 'Summary', vibrateFeatures: 1 }] }] };
  assert.equal(controlReadiness(legacy).availableOutputs, 1);
});

test('an explicit position mapping overrides its matched position fallback without inventing a capability / 显式位置映射覆盖匹配默认能力但不虚构设备支持', () => {
  const config = { ...output, type: 'Intiface', intifaceFeatures: [{ deviceName: '', featureIndex: 0, outputType: 'HwPositionWithDuration', sourceAxis: 'L0' }] };
  const state = { ...base, outputs: [config], outputStates: [{ ...config, connected: true,
    devices: [{ name: 'Position-only device', positionFeatures: 1, features: [{ index: 0, outputTypes: ['Position'] }] }] }] };
  assert.equal(controlReadiness(state).key, 'outputs-unavailable');
  state.outputStates[0].devices[0].features.push({ index: 1, outputTypes: ['Vibrate'] });
  assert.equal(controlReadiness(state).availableOutputs, 1, 'A separate unconfigured vibration feature remains available.');
});

test('preview, paused script and waiting manual target are distinct from active output / 预览、脚本暂停、等待手动目标与输入启用分别解释', () => {
  assert.equal(controlReadiness({ ...base, outputs: [] }).key, 'no-outputs');
  assert.equal(controlReadiness({ ...base, runtime: { inputActive: false } }).key, 'inactive');
  assert.equal(controlReadiness({ ...base, mode: 'script', script: {} }).key, 'script-empty');
  assert.equal(controlReadiness({ ...base, mode: 'script', script: { loaded: true, playing: false } }).key, 'script-paused');
  assert.equal(controlReadiness({ ...base, mode: 'script', script: { loaded: true, playing: true } }).key, 'enabled');
  assert.equal(controlReadiness({ ...base, runtime: { inputActive: true, manualOverrideEnabled: false } }).key, 'manual-waiting');
});

test('OSC setup, geometry and all-gates state remain separate and never grant permission / OSC设置、空间与门控状态分离且不改变许可', () => {
  const osc = { ...base, mode: 'osc', listening: true, mappings: [{ role: 'Depth' }] };
  assert.equal(controlReadiness({ ...osc, listening: false }).action, 'osc-settings');
  assert.equal(controlReadiness({ ...osc, mappings: [] }).action, 'osc-mappings');
  assert.equal(controlReadiness({ ...osc, runtime: { inputActive: true, poseBlocked: true } }).key, 'geometry');
  assert.equal(controlReadiness({ ...osc, runtime: { inputActive: true, gateClosed: true } }).key, 'gate');
  assert.equal(controlReadiness(osc).key, 'enabled');
});

test('independent output bindings keep their readiness when legacy motion gates or inputs wait', () => {
  const routed = { id: 'osc-feedback', type: 'OscParameter', enabled: true, signal: { bindings: [{ id: 'Manual', source: { sourceMode: 'Manual', oscPath: 'L0' } }] } };
  const state = { ...base, mode: 'osc', listening: true, mappings: [{ role: 'Depth' }], outputs: [routed],
    outputStates: [{ ...routed, connected: true }] };
  const before = JSON.stringify(state);
  for (const flag of ['gateClosed', 'poseBlocked', 'computedInputBlocked']) {
    const ready = controlReadiness({ ...state, runtime: { ...state.runtime, [flag]: true } });
    assert.equal(ready.key, 'enabled', flag);
    assert.equal(ready.availableOutputs, 1);
  }
  assert.equal(JSON.stringify(state), before);
  assert.equal(outputRoutingScope([routed]).onlyIndependentBindings, true);
});

test('mixed legacy motion and binding outputs scope each waiting state to motion mappings', () => {
  const routed = { id: 'recording', type: 'Recording', enabled: true, signal: { bindings: [{ id: 'Position' }] } };
  const state = { ...base, mode: 'osc', listening: true, mappings: [{ role: 'Depth' }], outputs: [output, routed],
    outputStates: [{ ...output, connected: true }, { ...routed, connected: true }] };
  for (const [flag, key] of [['gateClosed', 'gate'], ['poseBlocked', 'geometry'], ['computedInputBlocked', 'computed']]) {
    const ready = controlReadiness({ ...state, runtime: { ...state.runtime, [flag]: true } });
    assert.equal(ready.key, key);
    assert.match(ready.title, /动作轴映射|Motion axis mapping/);
    assert.match(ready.detail, /独立输出连接|Independent output bindings/);
    assert.equal(ready.availableOutputs, 2);
    assert.equal(ready.tone, 'warning');
  }
  assert.equal(outputRoutingScope(state.outputs).mixed, true);
});

test('disabled binding drafts preserve legacy readiness wording and never supply missing mappings', () => {
  const disabled = { id: 'draft', type: 'OscParameter', enabled: false, signal: { bindings: [{ id: 'Manual' }] } };
  const state = { ...base, mode: 'osc', listening: true, mappings: [{ role: 'Depth' }] };
  for (const flag of ['gateClosed', 'poseBlocked', 'computedInputBlocked']) {
    const runtime = { ...state.runtime, [flag]: true };
    const legacy = controlReadiness({ ...state, runtime });
    const withDraft = controlReadiness({ ...state, runtime, outputs: [output, disabled] });
    for (const key of ['key', 'title', 'detail', 'tone', 'action']) assert.equal(withDraft[key], legacy[key]);
  }
  assert.equal(controlReadiness({ ...state, mappings: [], outputs: [output, disabled] }).key, 'osc-mappings');
  assert.equal(outputRoutingScope([output, disabled]).independentBindings, false);
});

for (const locale of ['zh-CN', 'en-US']) {
  test('task setup is immediate without outputs and collapsed for saved setups in ' + locale, () => {
    setLocale(locale);
    const props = { onNavigate() {} };
    const firstRun = render(GettingStarted, props);
    assert.match(firstRun, /data-testid="getting-started"/);
    assert.doesNotMatch(firstRun, /<details/);
    for (const task of ['osc', 'script', 'manual']) assert.ok(firstRun.includes(`data-testid="setup-task-${task}"`), task);
    assert.ok(firstRun.includes(t('准备好后，再打开顶部的“输入启用”。')));
    const saved = render(GettingStarted, { ...props, hasOutputs: true });
    const disclosure = saved.match(/<details\b[^>]*data-testid="quick-setup"[^>]*>/)?.[0];
    assert.ok(disclosure);
    assert.doesNotMatch(disclosure, /\bopen(?:=|\s|>)/);
    assert.ok(saved.includes(t('快速设置')));
    assert.match(saved, /data-testid="setup-connect-device"/);
  });

  test('manual axis details keep all drafts and browser axis selection behind one collapsed control in ' + locale, () => {
    setLocale(locale);
    const draft = { L0: 501, L1: 317, L2: 627, R0: 229, R1: 500, R2: 500, V0: 73, V1: 0, V2: 0, A0: 500, A1: 500, A2: 500 };
    const before = JSON.stringify(draft);
    const html = render(ManualControls, { draft, selectedAxes: ['L0', 'V0'], onChange() {}, onAxesChange() {} });
    const [primary, more] = html.split(/(?=<details\b)/);
    assert.ok(primary.includes(t('L0 主轴')));
    assert.ok(!primary.includes(t('L1 前后')));
    assert.ok(!primary.includes(t('L2 左右')));
    assert.match(more, /^<details\b[^>]*data-testid="manual-more-axes"/);
    assert.doesNotMatch(more.slice(0, more.indexOf('>') + 1), /\bopen(?:=|\s|>)/);
    assert.ok(more.includes(t('更多动作轴')));
    assert.ok(more.includes(t('L1/L2、旋转、振动与辅助轴')));
    assert.ok(more.includes(t('输出动作轴：{0}', ['L0 · V0'])));
    assert.match(more, /role="group" aria-label="/);
    assert.equal((more.match(/type="checkbox"/g) || []).length, 12);
    assert.equal((html.match(/type="range"/g) || []).length, 12);
    for (const value of [317, 627, 229, 73]) assert.ok(more.includes(`value="${value}"`), value);
    assert.equal(JSON.stringify(draft), before);
  });
}

test('task choices only request navigation and filter unavailable host inputs', () => {
  const navigated = [];
  const tree = GettingStarted({ inputModes: ['manual', 'script'], onNavigate: destination => navigated.push(destination) });
  const controls = elements(tree).filter(element => element.props['data-testid']?.startsWith('setup-'));
  assert.deepEqual(controls.map(element => element.props['data-testid']), ['setup-task-script', 'setup-task-manual', 'setup-connect-device']);
  for (const control of controls) control.props.onClick();
  assert.deepEqual(navigated, ['script', 'manual', 'outputs']);
  const empty = render(GettingStarted, { inputModes: [], onNavigate() {} });
  assert.doesNotMatch(empty, /data-testid="setup-task-/);
  assert.match(empty, /data-testid="setup-connect-device"/);
});

test('shared workbench keeps one actual readiness status and output errors visible beside collapsed setup', () => {
  setLocale('en-US');
  const config = createDefaultConfiguration();
  config.outputs = [{ ...config.outputs[0], id: 'saved-device', name: 'Saved device', enabled: true }];
  const client = { kind: 'local', request() { throw new Error('Rendering must not issue runtime commands'); } };
  const overview = { input: { mode: 'manual' }, runtime: { inputActive: false },
    outputs: [{ id: 'saved-device', enabled: true, connected: false, lastError: 'Device connection failed' }] };
  const html = render(Workbench, { client, initialSnapshot: { config, overview, logs: [], serialPorts: [] } });
  assert.equal((html.match(/class="control-readiness control-readiness--/g) || []).length, 1);
  assert.ok(html.includes(t('连接设备 → 选择输入 → 启用输入')));
  assert.match(html, /data-testid="quick-setup"/);
  assert.match(html, /<div class="output-detail"><div class="notice notice--error" role="alert">Device connection failed<\/div><\/div>/);
  assert.ok(html.indexOf('data-testid="quick-setup"') < html.indexOf('class="section input-section"'));
});
