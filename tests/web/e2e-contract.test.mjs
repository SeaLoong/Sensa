import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRigConfiguration } from '../e2e/rig.js';
import { fixedRootSamples, shaderRootSamples, oscBundle } from '../e2e/mocks.js';

test('all E2E configurations isolate devices and initialize outputs disabled / 所有 E2E 配置隔离设备且默认关闭输出', () => {
  for (const scenario of ['basic', 'sps', 'query', 'vibration-only']) {
    const config = createRigConfiguration(scenario, '/dev/pts/42');
    assert.equal(config.webUi.autoOpenBrowser, false); assert.equal(config.webUi.host, '127.0.0.1');
    for (const output of config.outputs) {
      assert.equal(output.enabled, false); assert.equal(output.motionProfileId, 'test-profile');
      if (output.host) assert.equal(output.host, '127.0.0.1');
      if (output.type === 'Intiface') { assert.equal(output.manageEngineProcess, false); assert.match(output.websocketAddress, /^ws:\/\/127\.0\.0\.1:/); }
      if (output.type === 'TCodeSerial') assert.match(output.comPort, /^\/dev\/pts\//);
    }
    assert.equal(config.osc.allowExperimentalSpatialInput, false);
    assert.equal(config.osc.oscQueryReceiver.enabled, false);
    assert.equal(config.osc.oscQueryEnabled, scenario === 'query');
    config.axisProfiles[0].motion.l0.min = 1;
    assert.notEqual(createRigConfiguration(scenario, '/dev/pts/43').axisProfiles[0].motion.l0.min, 1);
  }
  for (const serial of ['COM3', '/dev/ttyUSB0', '', undefined]) assert.throws(() => createRigConfiguration('basic', serial));
  assert.throws(() => createRigConfiguration('unknown', '/dev/pts/42'));
});

test('fixed SPS fixture exposes only P0–P3 and Sample / 固定SPS夹具仅公开P0–P3和Sample', () => {
  const prefix = 'Sensa/SPS/CIFixedRoot';
  const samples = fixedRootSamples(.05, 7 / 32);
  assert.deepEqual(samples.map(([path]) => path), ['P0', 'P1', 'P2', 'P3', 'Sample'].map(name => prefix + '/' + name));
  assert.ok(samples.slice(0, 4).every(([, value]) => Number.isFinite(value) && value > 0 && value < 1));
  assert.notDeepEqual(fixedRootSamples(.15, 8 / 32).slice(0, 4), samples.slice(0, 4));
  assert.equal(samples[4][1], 7 / 32);
  assert.equal(fixedRootSamples(.05, 8 / 32, false)[4][1], 0);
});

test('native-root fixture commits five ordered fields in one immediate OSC bundle / 原生根夹具以单个bundle按序提交五字段', () => {
  const bytes = oscBundle(shaderRootSamples(.15, 27));
  assert.equal(bytes.subarray(0, 8).toString('ascii'), '#bundle\0');
  assert.equal(bytes.readBigUInt64BE(8), 1n);
  let offset = 16;
  const fields = [];
  while (offset < bytes.length) {
    const size = bytes.readUInt32BE(offset); offset += 4;
    assert.ok(size > 0 && size % 4 === 0);
    const packet = bytes.subarray(offset, offset + size); offset += size;
    const end = packet.indexOf(0);
    const tagOffset = (end + 4) & ~3;
    assert.equal(packet.subarray(tagOffset, tagOffset + 4).toString('ascii'), ',f\0\0');
    assert.equal(packet.length, tagOffset + 8);
    fields.push([packet.subarray(0, end).toString('utf8'), packet.readFloatBE(tagOffset + 4)]);
  }
  assert.equal(offset, bytes.length);
  const prefix = '/avatar/parameters/Sensa/Shader/42/';
  assert.deepEqual(fields.map(([path]) => path), ['Frame', 'X', 'Y', 'Z', 'Valid'].map(name => prefix + name));
  assert.equal(fields[0][1], 27);
  assert.ok(Math.abs(fields[3][1] - .15) < .000001);
  assert.equal(fields[4][1], 1);
  assert.deepEqual(shaderRootSamples(.15, 28, false), [['Sensa/Shader/42/Valid', 0]]);
});
