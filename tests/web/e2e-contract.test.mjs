import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRigConfiguration } from '../e2e/rig.js';
import { pointSamples, fixedRootSamples, poseSamples, shaderRootSamples, oscBundle } from '../e2e/mocks.js';

const sharedGeometry = (protocol) => {
  const source = readFileSync(new URL('../../unity/top.sealoong.sensa/Runtime/' + protocol, import.meta.url), 'utf8');
  const constant = name => Number(source.match(new RegExp('const float ' + name + '\\s*=\\s*([.\\d]+)f;'))?.[1]);
  const geometry = { radius: constant('ReceiverRadius'), span: constant('AnchorHalfSpan'), marker: constant('MarkerRadius') };
  assert.ok(Object.values(geometry).every(Number.isFinite), protocol);
  return geometry;
};

function reconstruct(proximity, anchors, { radius, span, marker }, center = [0, 0, 0]) {
  assert.ok(proximity.every(value => Number.isFinite(value) && value > 0 && value < 1));
  const squared = proximity.map(value => (radius * (1 - value) + marker) ** 2);
  return center.map((coordinate, axis) => coordinate - anchors.reduce((sum, anchor, index) =>
    sum + (anchor[axis] - coordinate) * squared[index], 0) / (anchors.length * 2 * span ** 2));
}

const assertPosition = (actual, expected) => actual.forEach((value, axis) => assert.ok(Math.abs(value - expected[axis]) < 1e-12,
  `axis ${axis}: ${value} != ${expected[axis]}`));

test('E2E spatial fixtures reconstruct known positions with the shared Unity geometry / E2E 空间夹具匹配共享几何', () => {
  const pose = sharedGeometry('SensaPoseProtocol.cs'), fixed = sharedGeometry('SensaFixedAnchorProtocol.cs');
  const cube = Array.from({ length: 8 }, (_, index) => [1, 2, 4].map(bit => index & bit ? pose.span : -pose.span));
  const tetrahedron = [0, 3, 5, 6].map(index => cube[index]);
  const center = [0, 1, 0], fixedAnchors = [0, 5, 3, 6].map(index => center.map((coordinate, axis) =>
    coordinate + (index & (1 << axis) ? fixed.span : -fixed.span)));
  for (const z of [.05, .15, 1.2]) {
    const pointValues = new Map(pointSamples(z)), fixedValues = new Map(fixedRootSamples(z, 1 / 32));
    const pointRanges = Array.from({ length: 4 }, (_, i) => pointValues.get('Sensa/Handle/v1/LabHandle/Self/Root/A' + i));
    const fixedRanges = Array.from({ length: 4 }, (_, i) => fixedValues.get('Sensa/SPS/CIFixedRoot/P' + i));
    assertPosition(reconstruct(pointRanges, tetrahedron, pose), [.02, 0, z]);
    assertPosition(reconstruct(fixedRanges, fixedAnchors, fixed, center), [.02, 1, z]);
  }
  assert.equal(pointSamples(.15, false).find(([path]) => path.endsWith('/Handle_IsGrabbed'))[1], 0);
  const samples = poseSamples();
  for (const [marker, position] of [['Root', [.02, 0, -.1]], ['Tip', [.02, 0, .1]], ['Side', [.05, 0, -.1]]]) {
    const ranges = samples.filter(([path]) => path.includes('/' + marker + '/'));
    assert.equal(ranges.length, 8);
    const values = new Map(ranges);
    const proximity = Array.from({ length: 8 }, (_, i) => values.get('Sensa/Pose/v1/Demo/Others/' + marker + '/A' + i));
    assertPosition(reconstruct(proximity, cube, pose), position);
  }
});

test('all E2E configurations isolate devices and initialize outputs disabled / 所有 E2E 配置隔离设备且默认关闭输出', () => {
  for (const scenario of ['basic', 'sps', 'query', 'vibration-only', 'rotation-only']) {
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

test('native-root fixture commits twelve ordered fields in one immediate OSC bundle / 原生根夹具以单个bundle按序提交十二字段', () => {
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
  assert.deepEqual(fields.map(([path]) => path), ['Frame', 'X', 'Y', 'Z', 'RightX', 'RightY', 'RightZ',
    'ForwardX', 'ForwardY', 'ForwardZ', 'AvatarScale', 'Valid'].map(name => prefix + name));
  assert.equal(fields[0][1], 27);
  assert.ok(Math.abs(fields[3][1] - .15) < .000001);
  assert.deepEqual(fields.slice(4).map(([, value]) => value), [1, 0, 0, 0, 0, 1, 1, 1]);
  assert.deepEqual(shaderRootSamples(.15, 28, false), [['Sensa/Shader/42/Valid', 0]]);
});
