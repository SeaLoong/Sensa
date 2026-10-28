import { test } from 'node:test';
import assert from 'node:assert/strict';
import { controlReadiness, outputRoutingScope } from '../../src/web/control-workflow.js';

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
