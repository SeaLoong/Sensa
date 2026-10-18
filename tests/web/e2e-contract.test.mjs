import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRigConfiguration } from '../e2e/rig.js';

test('all E2E configurations isolate devices and initialize outputs disabled / 所有 E2E 配置隔离设备且默认关闭输出', () => {
  for (const scenario of ['quickstart', 'sps', 'query']) {
    const config = createRigConfiguration(scenario, '/dev/pts/42');
    assert.equal(config.webUi.autoOpenBrowser, false); assert.equal(config.webUi.host, '127.0.0.1');
    for (const output of config.outputs) {
      assert.equal(output.enabled, false); assert.equal(output.motionProfileId, 'test-profile');
      if (output.host) assert.equal(output.host, '127.0.0.1');
      if (output.type === 'Intiface') { assert.equal(output.manageEngineProcess, false); assert.match(output.websocketAddress, /^ws:\/\/127\.0\.0\.1:/); }
      if (output.type === 'TCodeSerial') assert.match(output.comPort, /^\/dev\/pts\//);
    }
    assert.equal(config.osc.oscQueryReceiver.enabled, false);
    assert.equal(config.osc.oscQueryEnabled, scenario === 'query');
    config.axisProfiles[0].motion.l0.min = 1;
    assert.notEqual(createRigConfiguration(scenario, '/dev/pts/43').axisProfiles[0].motion.l0.min, 1);
  }
  for (const serial of ['COM3', '/dev/ttyUSB0', '', undefined]) assert.throws(() => createRigConfiguration('quickstart', serial));
  assert.throws(() => createRigConfiguration('unknown', '/dev/pts/42'));
});
