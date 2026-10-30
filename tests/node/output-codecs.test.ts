import assert from 'node:assert/strict';
import test from 'node:test';
import { encodeOsc, encodeMidi, encodeJson, typedValue, encodeMqttConnect, encodeMqttPublish, TCodeEncoder, durationFor, dglabOperation, dglabPulse, dglabReset } from '../../src/core/outputs/codecs.ts';
import { defaultTCodeMotionProfile, defaultIntifaceFeatureRoute } from '../../src/core/runtime/configuration-defaults.ts';
import { resolveFeatureRoute, overridesDefaultFeature, resolveFeatureRouteValue, defaultIntifaceFeatureRoute as defaultActuatorRoute } from '../../src/core/outputs/intiface-routing.ts';
import { output, frame } from './output-support.ts';

test('OSC scalar vectors retain big-endian float32, int32 and zero-payload booleans', () => {
  assert.equal(Buffer.from(encodeOsc({ address: '/x', value: .5 })).toString('hex'), '2f7800002c6600003f000000');
  assert.equal(Buffer.from(encodeOsc({ address: '/x', value: -2, type: 'Int' })).toString('hex'), '2f7800002c690000fffffffe');
  assert.equal(Buffer.from(encodeOsc({ address: '/x', value: 1, type: 'Bool' })).toString('hex'), '2f7800002c540000');
  assert.equal(Buffer.from(encodeOsc({ address: '/x', value: 0, type: 'Bool' })).toString('hex'), '2f7800002c460000');
});
for (const address of ['/', '/a*', '/a b', '/a#', '/a,', '/a\0']) test(`OSC rejects nonconcrete path ${JSON.stringify(address)}`, () => assert.throws(() => encodeOsc({ address, value: 0 })));
test('typed signal values preserve away-from-zero integer and float32 bounds', () => {
  assert.equal(typedValue({ address: 'x', value: -1.5, type: 'Int' }), -2);
  assert.equal(typedValue({ address: 'x', value: .5, type: 'Int' }), 1);
  assert.equal(typedValue({ address: 'x', value: .499, type: 'Bool' }), false);
  for (const value of [NaN, Infinity, -Infinity, 1e100]) assert.throws(() => typedValue({ address: 'x', value }));
  assert.throws(() => typedValue({ address: 'x', value: 2147483648, type: 'Int' }));
});
test('JSON named-signal envelope retains type and sample metadata', () => {
  assert.deepEqual(JSON.parse(new TextDecoder().decode(encodeJson({ address: 'motor', value: 2.5, type: 'Int', signalId: 's', timestampMs: 4, coordinateFrame: 'AvatarRootMeters' }))), { address: 'motor', value: 3, type: 'Int', signalId: 's', timestampMs: 4, unit: '', coordinateFrame: 'AvatarRootMeters' });
});
test('native MIDI CC uses established CC/channel/controller numeric 0–127 contract', () => {
  assert.deepEqual([...encodeMidi({ address: 'CC/1/0', value: .5 })], [0xb0, 0, 1]);
  assert.deepEqual([...encodeMidi({ address: 'cc/016/127', value: 42.5 })], [0xbf, 127, 43]);
  assert.deepEqual([...encodeMidi({ address: 'CC/01/002', value: 127 })], [0xb0, 2, 127]);
  for (const address of ['CC/0/1', 'CC/17/1', 'CC/1/128', '1:2']) assert.throws(() => encodeMidi({ address, value: 1 }));
  for (const value of [-.1, 127.1, NaN]) assert.throws(() => encodeMidi({ address: 'CC/1/2', value }));
  assert.throws(() => encodeMidi({ address: 'CC/1/2', value: 1, type: 'Bool' }));
});
test('MQTT clean-session/QoS0 wire vectors and no-retain semantics', () => {
  assert.equal(Buffer.from(encodeMqttConnect('Sensa')).toString('hex'), '101100044d5154540402001e000553656e7361');
  assert.equal(Buffer.from(encodeMqttPublish('a', Uint8Array.of(1, 2))).toString('hex'), '30050001610102');
  for (const topic of ['a/#', 'a/+', 'a\0', '']) assert.throws(() => encodeMqttPublish(topic, new Uint8Array()));
  assert.throws(() => encodeMqttConnect('Sensa', 9));
  assert.throws(() => encodeMqttConnect('Sensa', 30, undefined, 'password'));
});
test('TCode profile remap, bounds, inversion, ignored and locked axes remain effective', () => {
  const profile = defaultTCodeMotionProfile(); profile.l0.remapMin = 100; profile.l0.remapMax = 900; profile.l0.min = 200; profile.l0.max = 800; profile.l0.commandMode = 'None';
  profile.l1.mode = 'Ignored'; profile.r0.mode = 'Locked'; profile.r0.lockValue = .25; profile.r0.commandMode = 'None';
  const encoder = new TCodeEncoder();
  assert.equal(encoder.encode(frame({ L0: 0, R0: 1 }, { activeAxes: ['L0', 'L1', 'R0'] }), profile), 'L0200 R0250\n');
  profile.l0.invert = true;
  assert.equal(new TCodeEncoder().encode(frame({ L0: 0 }, { activeAxes: ['L0'] }), profile), 'L0800\n');
});
test('TCode explicit duration, speed units, ramps and active-axis replay retain independent metadata', () => {
  const profile = defaultTCodeMotionProfile(), config = output('TCodeTcp'); profile.l0.rampType = 'EaseInOut';
  assert.equal(new TCodeEncoder().encode(frame({ L0: .5 }, { activeAxes: ['L0'], requestedCommandMode: 'Interval', requestedMotionValue: 321 }), profile, config), 'L0500I321<>\n');
  config.speedUnitBase = 'PerSecond'; profile.l0.maxSpeed = 100;
  assert.equal(new TCodeEncoder().encode(frame({ L0: .5 }, { activeAxes: ['L0'], requestedCommandMode: 'Speed', requestedMotionValue: 20 }), profile, config), 'L0500S200<>\n');
  assert.equal(durationFor(frame({}, { requestedCommandMode: 'None', requestedMotionValue: 900 })), 0);
  assert.throws(() => durationFor(frame({}, { deltaMs: NaN })));
});
test('TCode estimated speed initializes at zero and tracks the 999-unit stroke/100ms model', () => {
  const profile = defaultTCodeMotionProfile(); profile.l0.commandMode = 'Speed';
  const encoder = new TCodeEncoder();
  assert.equal(encoder.encode(frame({ L0: 0 }, { activeAxes: ['L0'] }), profile), 'L0000S0\n');
  assert.equal(encoder.encode(frame({ L0: 1 }, { activeAxes: ['L0'], deltaMs: 1000 }), profile), 'L0999S100\n');
});
test('TCode preserves float32 remapping and ties-to-even magnitudes from the existing native encoder', () => {
  const profile = defaultTCodeMotionProfile(); profile.l0.commandMode = 'None';
  profile.l0.remapMin = 2; profile.l0.remapMax = 3; assert.equal(new TCodeEncoder().encode(frame({ L0: .5 }, { activeAxes: ['L0'] }), profile), 'L0002\n');
  profile.l0.remapMin = 3; profile.l0.remapMax = 4; assert.equal(new TCodeEncoder().encode(frame({ L0: .5 }, { activeAxes: ['L0'] }), profile), 'L0004\n');
  assert.equal(new TCodeEncoder().encode(frame({ L0: .5 }, { activeAxes: ['L0'], requestedCommandMode: 'Interval', requestedMotionValue: 0, deltaMs: 10.5 }), profile), 'L0004I10\n');
});
test('Intiface route matching keeps exact names and distinct timed/raw position capabilities', () => {
  const route = { ...defaultIntifaceFeatureRoute(), deviceName: 'device · name', featureIndex: 4, outputType: 'Position' };
  assert.equal(resolveFeatureRoute([route], 'device · name', 4, 'Position'), route);
  assert.equal(resolveFeatureRoute([route], 'DEVICE · name', 4, 'Position'), undefined);
  assert.equal(resolveFeatureRoute([route], 'device · name', 4, 'HwPositionWithDuration'), undefined);
  assert.equal(overridesDefaultFeature([route], 'device · name', 4, 'HwPositionWithDuration'), true);
  assert.deepEqual(resolveFeatureRouteValue({ ...route, invert: true, sourceAxis: 'V0', directionAxis: 'A0' }, frame({ V0: .3, A0: 0 }, { activeAxes: ['A0'] })), { active: true, value: .7, clockwise: false });
});
test('shared default Intiface routes invert L0 position, preserve selected vibration and leave rotation explicit', () => {
  for (const type of ['Position', 'HwPositionWithDuration']) { const route = defaultActuatorRoute('device', 1, type); assert.ok(route); assert.equal(route.sourceAxis, 'L0'); assert.equal(resolveFeatureRouteValue(route, frame({ L0: .2 })).value, .8); }
  const route = defaultActuatorRoute('device', 2, 'Vibrate', 'V2'); assert.ok(route); assert.equal(route.sourceAxis, 'V2'); assert.equal(resolveFeatureRouteValue(route, frame({ V2: 0 })).value, 0); assert.equal(defaultActuatorRoute('device', 3, 'Rotate'), undefined);
});
test('DG-LAB uses native intensity units and finite non-looping task vectors', () => {
  const target = { clientId: 'app', slotId: 'slot', channel: 1 };
  assert.deepEqual(dglabOperation(target, 37, 250), { s: 'slot', c: 1, t: 4, v: 37, d: 250, im: true, p: 1 });
  assert.deepEqual(dglabReset(target), { s: 'slot', c: 1, t: 7, v: 0, im: true, p: 2 });
  assert.deepEqual(dglabPulse(target, ['abcdef'], 250, 2)['v'], ['ABCDEF']);
  assert.throws(() => dglabPulse(target, ['abcdef'], 250, 3));
  for (const value of [-1, NaN, Infinity]) assert.throws(() => dglabOperation(target, value, 250));
});
