import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultProtocolInput, validateProtocolInputs } from '../../src/core/protocols/input-types.ts';
import type { ProtocolInputConfig, ProtocolFeatureConfig } from '../../src/core/protocols/input-types.ts';
import { ExternalControlStore } from '../../src/core/protocols/external-control.ts';
import { OscParameterStore, encodeOscMessage, encodeOscBundle, parseOscPacket, matchesOscPath } from '../../src/core/protocols/osc.ts';
import { parseStrictJson } from '../../src/core/protocols/strict-json.ts';
import { parseTCodeLine, TCodeInputSession, TCodeLineFramer } from '../../src/core/protocols/tcode-input.ts';
import { ButtplugInputSession } from '../../src/core/protocols/buttplug-input.ts';
import { parseProtocolScript } from '../../src/core/protocols/script-input.ts';
import { HttpInputSession } from '../../src/node/inputs/http-session.ts';
const encode = (value: string): Uint8Array => new TextEncoder().encode(value);
function config(type: ProtocolInputConfig['type'] = 'Buttplug', features?: ProtocolFeatureConfig[]): ProtocolInputConfig {
  const value = { ...defaultProtocolInput('input'), type, enabled: true, timeoutMs: 1000 }; if (features) value.features = features; return value;
}
const position: ProtocolFeatureConfig = { channel: 'L0', name: 'Stroke', actuator: 'Position', scalarType: 'Vibrate', targetAxis: 'L0' };
const scalar: ProtocolFeatureConfig = { channel: 'V0', name: 'Vibration', actuator: 'Scalar', scalarType: 'Vibrate', targetAxis: 'V0' };
const rotation: ProtocolFeatureConfig = { channel: 'rotation', name: 'Rotation', actuator: 'Rotation', scalarType: 'Vibrate', targetAxis: '' };

test('OSC wire codec uses network byte order and retains fractional float, signed int and bool tags', () => {
  for (const [value, type] of [[.25, 'Float'], [-25, 'Int'], [true, 'Bool'], [false, 'Bool']] as const) {
    const packet = encodeOscMessage('/avatar/parameters/Test', value, type), parsed = parseOscPacket(packet);
    assert.equal(parsed.handled, true); assert.deepEqual(parsed.values, [{ path: 'Test', value, valueType: type }]);
  }
});
test('mixed OSC bundles preserve exact timetag and raw-message order', () => {
  const first = encodeOscMessage('/tracking/vrsystem/head/position', .5), second = encodeOscMessage('/avatar/parameters/Known', .75), third = encodeOscMessage('/other', 2, 'Int');
  const tag = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]), parsed = parseOscPacket(encodeOscBundle([first, second, third], tag));
  assert.equal(parsed.values[0]?.value, .75); assert.equal(parsed.unhandled.length, 1);
  assert.deepEqual(parsed.unhandled[0], encodeOscBundle([first, third], tag));
});
test('OSC malformed lengths and nonfinite values never reach the value store', () => {
  const packet = encodeOscMessage('/avatar/parameters/Test', 1); new DataView(packet.buffer).setFloat32(packet.length - 4, Number.NaN);
  assert.equal(parseOscPacket(packet).handled, false);
  assert.equal(parseOscPacket(new Uint8Array([0, 1, 2])).handled, false);
  assert.throws(() => encodeOscMessage('/bad\0address', .5));
});
test('OSC source catalog preserves content age across replay and source selection across timestamp ties', () => {
  let now = 100; const store = new OscParameterStore(() => now), source = { key: 'A', label: 'A', persistentId: null, address: '127.0.0.1', port: 1 };
  store.set('A/Value', .5, source, 'Float'); now = 500; store.set('A/Value', .5, source, 'Float');
  assert.equal(store.tryGetLatest('A/Value')?.entry.changedAtMs, 100); assert.equal(store.tryGetLatest('A/Value')?.entry.timestampMs, 500);
  store.set('A/Value', .9, { ...source, key: 'B' }, 'Float'); assert.equal(store.snapshotSources().length, 2);
  assert.equal(store.tryGetLatest('A/Value', 'B')?.entry.value, .9); assert.equal(store.tryGetLatest('A/Value', 'missing'), undefined);
  store.clearSource('B'); assert.equal(store.tryGetLatest('A/Value')?.entry.value, .5);
});
test('OSC catalog prunes idle sources without deleting fresh metadata and bounds source count', () => {
  let now = 0; const store = new OscParameterStore(() => now);
  for (let i = 0; i < 32; i++) assert.equal(store.set(`v${i}`, i, { key: `${i}`, label: `${i}`, persistentId: null, address: '', port: 0 }), true);
  assert.equal(store.set('extra', 1, { key: '33', label: '33', persistentId: null, address: '', port: 0 }), false);
  now = 300001; assert.equal(store.set('new', .7, { key: 'new', label: 'new', persistentId: null, address: '', port: 0 }), true); assert.equal(store.sourceCount, 1);
});
test('OSC path glob uses whole segments, bounded deep wildcards and multiple exact alternatives', () => {
  assert.equal(matchesOscPath('Sensa/**/X', 'Sensa/Contact/A/X'), true); assert.equal(matchesOscPath('Sensa/*/X', 'Sensa/Contact/A/X'), false);
  assert.equal(matchesOscPath('one; two\nthree', 'two'), true); assert.equal(matchesOscPath('Dep*', 'Depth'), false);
  assert.equal(matchesOscPath(Array(65).fill('**').join('/'), 'a'), false);
});
for (const raw of ['{"x":1,"x":2}', '{"x":1,"\\u0078":2}', '[{"nested":{"x":1,"x":2}}]', '['.repeat(18) + '0' + ']'.repeat(18), '{"x":1,}', '{"x":1} trailing']) {
  test(`strict JSON rejects duplicate/invalid/deep payload ${raw.slice(0, 35)}`, () => assert.throws(() => parseStrictJson(raw)));
}
test('strict JSON handles escaped quotes, arrays and prototype-looking data without prototype mutation', () => {
  const value = parseStrictJson('{"__proto__":{"polluted":true},"quote":"a\\\"b","list":[1,true,null]}') as Record<string, unknown>;
  assert.equal(value['quote'], 'a"b'); assert.equal(Object.hasOwn(value, '__proto__'), true); assert.equal(Object.hasOwn({}, 'polluted'), false);
});
test('external control batches are all-or-nothing and retain typed target and direction metrics', () => {
  let now = 0; const input = config('Buttplug', [position, scalar, rotation]), store = new ExternalControlStore([input], () => now);
  assert.equal(store.tryAcquire('input', 'owner').ok, true);
  assert.equal(store.publish('input', 'owner', [{ channel: 'L0', value: .25 }, { channel: 'bad', value: .7 }]).ok, false); assert.equal(store.read('input/L0').valid, false);
  assert.equal(store.publish('input', 'owner', [{ channel: 'L0', value: .25 }, { channel: 'rotation', value: .4, clockwise: false }]).ok, true);
  assert.equal(store.read('input/rotation/clockwise').value, 0); assert.equal(store.read('input/L0/target').value, .25); now = 1000; store.expire(); assert.equal(store.getStatus('input')?.session, null);
});
test('unknown initial trajectories remain invalid until arrival; finite TCode commands extend only through arrival plus idle', () => {
  let now = 0; const store = new ExternalControlStore([config('TCodeTcp')], () => now); store.tryAcquire('input', 'a'); store.publish('input', 'a', [{ channel: 'L0', value: .8, durationMs: 5000 }]);
  now = 2000; assert.equal(store.read('input/L0').valid, false); assert.equal(store.read('input/L0/target').value, .8); store.expire(); assert.equal(store.getStatus('input')?.session, 'a');
  now = 5000; assert.equal(store.read('input/L0').value, .8); now = 6000; store.expire(); assert.equal(store.getStatus('input')?.session, null);
});
test('external command and stop observers receive ordered generations; clear invalidates in-flight batches', () => {
  const store = new ExternalControlStore([config()]); const events: string[] = []; let batch: Parameters<Parameters<typeof store.onBatch.add>[0]>[0] | undefined;
  store.onBatch.add(value => { batch = value; events.push('batch'); }); store.onStop.add(() => events.push('stop')); store.onCommandsCleared.add(() => events.push('clear'));
  store.tryAcquire('input', 'a'); store.publish('input', 'a', [{ channel: 'L0', value: .5 }]); assert.ok(batch); assert.equal(store.isCurrent(batch, 'L0'), true);
  store.clearCommands(); assert.equal(store.isCurrent(batch, 'L0'), false); store.stop('input', 'a'); store.release('input', 'a'); assert.deepEqual(events, ['batch', 'clear', 'stop', 'stop']);
});
test('protocol configuration preserves all twelve direct axes and disallows scalar/rotation unit confusion', () => {
  for (const axis of ['L0', 'L1', 'L2', 'R0', 'R1', 'R2', 'V0', 'V1', 'V2', 'A0', 'A1', 'A2']) assert.equal(validateProtocolInputs([config('Buttplug', [{ ...position, targetAxis: axis }])])[0]?.features[0]?.targetAxis, axis);
  assert.throws(() => validateProtocolInputs([config('Buttplug', [{ ...scalar, targetAxis: 'L0' }])])); assert.throws(() => validateProtocolInputs([config('Buttplug', [{ ...rotation, targetAxis: 'R0' }])]));
});
test('TCode magnitude is a decimal fraction and last duplicate channel wins', () => {
  assert.deepEqual(parseTCodeLine('l05 L01234I100 r0999s1000 D1').commands, [{ channel: 'L0', value: .1234, intervalMs: 100, speed: null }, { channel: 'R0', value: .999, intervalMs: null, speed: 1000 }]);
  assert.ok((parseTCodeLine('L0' + '9'.repeat(300)).commands[0]?.value ?? 1) < 1);
});
for (const line of ['L0500 DSTOP', 'L0500G1', 'L0500I60001', 'L0500S0', 'L0500\x7f', 'L0500\nL0600', 'L0', 'not-a-command']) {
  test(`TCode rejects unsupported or ambiguous instruction ${JSON.stringify(line)}`, () => assert.throws(() => parseTCodeLine(line)));
}
test('TCode framing discards invalid partial data until its boundary, then accepts a clean subsequent line', () => {
  const framer = new TCodeLineFramer(); assert.deepEqual(framer.push(encode('L050')), []); assert.throws(() => framer.push(new Uint8Array([255])));
  assert.deepEqual(framer.push(encode('0\nL0750\r\n')), ['L0750']); assert.equal(framer.pendingBytes, 0);
});
test('TCode speed uses the known commanded position; reset drops pre-clear speed baselines', () => {
  let now = 0; const input = config('TCodeTcp'), store = new ExternalControlStore([input], () => now), session = new TCodeInputSession(input, store, 'a', () => now);
  assert.match(session.processLine('L0500S1000'), /^ERR /); assert.equal(store.read('input/L0').valid, false);
  assert.equal(session.processLine('L0000'), ''); assert.equal(session.processLine('L0500S1000'), ''); assert.equal(store.motionFrame().durations['L0'], 500);
  now = 250; assert.equal(store.read('input/L0').value, .25); const epoch = session.epoch; session.resetCommands(); assert.match(session.processLine('L0750', epoch), /^ERR /); assert.match(session.processLine('L0750S1000'), /^ERR /);
});
for (const version of [2, 3, 4]) test(`Buttplug v${version} negotiates truthful feature metadata and device controls`, () => {
  const input = config('Buttplug', [position, scalar, rotation]), store = new ExternalControlStore([input]); const session = new ButtplugInputSession(input, store);
  const handshake = version < 4 ? { MessageVersion: version } : { ProtocolVersionMajor: 4, ProtocolVersionMinor: 0 };
  const call = (body: unknown): Record<string, unknown>[] => JSON.parse(session.process(JSON.stringify(body))) as Record<string, unknown>[];
  assert.ok(call([{ RequestServerInfo: { Id: 1, ClientName: 'fixture', ...handshake } }])[0]?.['ServerInfo']);
  const devices = call([{ RequestDeviceList: { Id: 2 } }]); assert.ok(devices[0]?.['DeviceList']);
  const command = version === 2 ? { VibrateCmd: { Id: 3, DeviceIndex: 0, Speeds: [{ Index: 0, Speed: .6 }] } }
    : version === 3 ? { ScalarCmd: { Id: 3, DeviceIndex: 0, Scalars: [{ Index: 0, Scalar: .6, ActuatorType: 'Vibrate' }] } }
      : { OutputCmd: { Id: 3, DeviceIndex: 0, FeatureIndex: 1, Command: { Vibrate: { Value: 600 } } } };
  assert.ok(call([command])[0]?.['Ok']); assert.equal(store.read('input/V0').value, .6);
  const stop = version < 4 ? { StopAllDevices: { Id: 4 } } : { StopCmd: { Id: 4, Outputs: true } }; call([stop]); assert.equal(store.read('input/V0').valid, false); session.dispose();
});
test('Buttplug rejects duplicate actuator indices atomically and requires Ping even during activity', () => {
  let now = 0; const input = config('Buttplug', [position, scalar]), store = new ExternalControlStore([input], () => now), session = new ButtplugInputSession(input, store, () => now);
  session.process('[{"RequestServerInfo":{"Id":1,"ClientName":"fixture","MessageVersion":3}}]');
  const reply = session.process('[{"LinearCmd":{"Id":2,"DeviceIndex":0,"Vectors":[{"Index":0,"Position":0.4,"Duration":0},{"Index":0,"Position":0.9,"Duration":0}]}}]');
  assert.match(reply, /Repeated actuator/); assert.equal(store.read('input/L0').valid, false);
  now = 800; session.process('[{"RequestDeviceList":{"Id":3}}]'); now = 1001; assert.match(session.process('[{"Ping":{"Id":4}}]'), /timed out/); assert.equal(store.getStatus('input')?.session, null);
});
test('Buttplug v4 signed rotation is not an absolute position and StopCmd respects outputs=false', () => {
  const input = config('Buttplug', [position, rotation]), store = new ExternalControlStore([input]), session = new ButtplugInputSession(input, store);
  session.process('[{"RequestServerInfo":{"Id":1,"ClientName":"fixture","ProtocolVersionMajor":4,"ProtocolVersionMinor":0}}]');
  session.process('[{"OutputCmd":{"Id":2,"DeviceIndex":0,"FeatureIndex":1,"Command":{"Rotate":{"Value":-750}}}}]'); assert.equal(store.read('input/rotation/speed').value, .75); assert.equal(store.read('input/rotation/clockwise').value, 0);
  session.process('[{"StopCmd":{"Id":3,"Outputs":false,"Inputs":true}}]'); assert.equal(store.read('input/rotation').valid, true);
  session.process('[{"StopCmd":{"Id":4,"DeviceIndex":0,"FeatureIndex":1,"Outputs":true}}]'); assert.equal(store.read('input/rotation').valid, false); session.dispose();
});
test('protocol script parser preserves inverted units and CSV timing while rejecting duplicate samples', () => {
  const script = parseProtocolScript(encode('{"inverted":true,"actions":[{"at":0,"pos":20},{"at":1000,"pos":80}]}'), false); assert.equal(script.sample(500), .5);
  assert.equal(parseProtocolScript(encode('0,0\n1000,100\n'), true).speedPerSecond(500), 1);
  for (const text of ['{"actions":[{"at":0,"pos":0},{"at":0,"pos":100}]}', '{"actions":[],"actions":[]}']) assert.throws(() => parseProtocolScript(encode(text), false));
  assert.throws(() => parseProtocolScript(encode('0,0\n1000,100'), true)); assert.throws(() => parseProtocolScript(new Uint8Array([255]), false));
});
test('Lovense finite effects heartbeat only until their task deadline and leave position units untouched', async () => {
  let now = 0; const input = config('LovenseHttp', [position, scalar]), store = new ExternalControlStore([input], () => now), session = new HttpInputSession(input, store, { now: () => now });
  await session.process('/command', 'POST', { command: 'Function', action: 'Vibrate:12', timeSec: 5 }, 'a');
  now = 900; session.tick(); now = 1800; session.tick(); assert.equal(store.read('input/V0').value, .6); assert.equal(store.read('input/L0').valid, false);
  now = 5000; session.tick(); assert.equal(store.read('input/V0').valid, false); session.dispose();
});
test('Handy modes keep unknown starts explicit, clamp slide and reject late preparation after stop', async () => {
  const input = config('HandyHttp'), store = new ExternalControlStore([input]); let complete: ((script: ReturnType<typeof parseProtocolScript>) => void) | undefined;
  const session = new HttpInputSession(input, store, { downloadScript: async () => await new Promise(resolve => { complete = resolve; }) });
  await session.process('/mode', 'PUT', { mode: 2 }, 'a'); await assert.rejects(session.process('/hdsp/xpvp', 'PUT', { position: 50, velocity: 20 }, 'a'), /known commanded/);
  await session.process('/slide', 'PUT', { min: 20, max: 80 }, 'a'); await session.process('/hdsp/xpt', 'PUT', { position: 95, duration: 0 }, 'a'); assert.equal(store.read('input/L0').value, .8);
  await session.process('/mode', 'PUT', { mode: 1 }, 'a'); const pending = session.process('/hssp/setup', 'PUT', { url: 'https://example.com/a.csv' }, 'a');
  await session.process('/hssp/stop', 'PUT', {}, 'a'); assert.ok(complete); complete(parseProtocolScript(encode('0,0\n1000,100\n'), true)); await assert.rejects(pending, /superseded/); session.dispose();
});
test('disposed JSON sessions cannot reacquire a reconfigured source from a late callback', () => {
  const input = config('JsonWebSocket'), store = new ExternalControlStore([input]), session = new HttpInputSession(input, store);
  session.dispose(); store.configure([input]);
  assert.throws(() => session.processJson('/', 'POST', { channel: 'L0', value: .7 }, 'stale-client'), /stopped/);
  assert.equal(store.getStatus('input')?.session, null); assert.equal(store.getStatus('input')?.receivedCommands, 0);
});
test('Lovense rejects duplicate query values before accepting a target', async () => {
  const input = config('LovenseHttp', [scalar]), store = new ExternalControlStore([input]), session = new HttpInputSession(input, store);
  await assert.rejects(session.process('/Vibrate', 'GET', {}, 'a', new URLSearchParams('v=10&v=20')), /Repeated/);
  assert.equal(store.getStatus('input')?.receivedCommands, 0); session.dispose();
});
test('Handy alternating mode revalidates the complete sweep after slide settings change', async () => {
  const input = { ...config('HandyHttp'), maxSpeedPerSecond: .01 }, store = new ExternalControlStore([input]), session = new HttpInputSession(input, store);
  await session.process('/mode', 'PUT', { mode: 2 }, 'a'); await session.process('/hdsp/xpt', 'PUT', { position: 50, duration: 0 }, 'a');
  await session.process('/mode', 'PUT', { mode: 0 }, 'a'); await session.process('/slide', 'PUT', { min: 49, max: 51 }, 'a');
  await session.process('/hamp/velocity', 'PUT', { velocity: 1 }, 'a'); await session.process('/slide', 'PUT', { min: 0, max: 100 }, 'a');
  await assert.rejects(session.process('/hamp/start', 'PUT', {}, 'a'), /full alternating sweep/); assert.equal(store.read('input/L0').valid, false); session.dispose();
});
