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

test('fixed-root fixture publishes independent known ranges with party-level metadata / 固定根夹具提供独立已知距离及正确元数据层级', () => {
  const prefix = 'Sensa/SpsRoot/v1/CIFixedRoot/Self';
  const samples = fixedRootSamples(.05, 7 / 31);
  assert.deepEqual(samples.map(([path]) => path), [
    prefix + '/Root/A0', prefix + '/Root/A1', prefix + '/Root/A2', prefix + '/Root/A3',
    prefix + '/Profile', prefix + '/Valid', prefix + '/Scale', prefix + '/Heartbeat',
  ]);
  assert.ok(samples.slice(0, 4).every(([, value]) => Number.isFinite(value) && value > 0 && value < 1));
  assert.notDeepEqual(fixedRootSamples(.15, 8 / 31).slice(0, 4), samples.slice(0, 4));
  assert.deepEqual(samples.slice(4).map(([, value]) => value), [1, 1, 1, 7 / 31]);
  assert.equal(fixedRootSamples(.05, 8 / 31, false)[5][1], 0);
});

test('native-root fixture sends seven ordered fields in one immediate OSC bundle / 原生根夹具在单个立即执行 bundle 中发送有序七字段', () => {
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
  const prefix = '/avatar/parameters/Sensa/Shader/v1/42/';
  assert.deepEqual(fields.map(([path]) => path), ['Valid', 'Frame', 'X', 'Y', 'Z', 'Producer', 'Profile'].map(name => prefix + name));
  assert.equal(fields[0][1], 1); assert.equal(fields[1][1], 27);
  assert.ok(Math.abs(fields[4][1] - .15) < .000001);
  assert.equal(fields[5][1], 42); assert.equal(fields[6][1], 1);
  assert.equal(shaderRootSamples(.15, 28, false)[0][1], 0);
});
