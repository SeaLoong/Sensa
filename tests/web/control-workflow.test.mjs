import { test } from 'node:test';
import assert from 'node:assert/strict';
import { controlReadiness } from '../../src/web/control-workflow.js';

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
