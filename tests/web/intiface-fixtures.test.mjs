import { test } from 'node:test';
import assert from 'node:assert/strict';
import { largeIntifaceDeviceFixture } from '../e2e/mocks.js';

test('large Intiface peer genuinely exceeds the old receive buffer and can split inside UTF-8', () => {
  const device = largeIntifaceDeviceFixture();
  assert.equal(Object.keys(device.DeviceFeatures).length, 40);
  assert.equal(device.DeviceFeatures['39'].FeatureIndex, 39);
  assert.deepEqual(device.DeviceFeatures['39'].Output.Rotate.Value, [-1000, 1000]);
  const payload = Buffer.from(JSON.stringify([{ DeviceList: { Id: 2, Devices: { '0': device } } }]));
  assert.ok(payload.length > 2048);
  const boundary = payload.findIndex(value => value >= 0x80) + 1;
  assert.ok(boundary > 0);
  assert.throws(() => new TextDecoder('utf-8', { fatal: true }).decode(payload.subarray(0, boundary)));
  assert.equal(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat([
    payload.subarray(0, boundary), payload.subarray(boundary),
  ])))[0].DeviceList.Devices['0'].DeviceName, device.DeviceName);
  device.DeviceFeatures['39'].Output.Rotate.Value[1] = 1;
  assert.equal(largeIntifaceDeviceFixture().DeviceFeatures['39'].Output.Rotate.Value[1], 1000);
});
