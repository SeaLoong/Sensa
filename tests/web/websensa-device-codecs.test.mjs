import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BLUETOOTH_PROFILES, createBleCodec, bluetoothRequestOptions, createBluetoothTransport } from '../../src/websensa/device-codecs.ts';

const hex = data => Buffer.from(data).toString('hex');
function mockDevice(profileId, options = {}) {
  const profile = BLUETOOTH_PROFILES.find(item => item.id === profileId);
  const events = [];
  const listeners = new Map();
  const characteristic = {
    properties: { writeWithoutResponse: true, write: false },
    async writeValueWithoutResponse(bytes) {
      events.push(hex(bytes));
      if (options.write) await options.write(bytes, events);
    },
  };
  const pair = profile.pairs[options.pairIndex ?? 0];
  const service = { uuid: pair[0], async getCharacteristic(id) { assert.equal(id, pair[1]); return characteristic; } };
  const server = { async getPrimaryServices() { if (options.services) return options.services(); return [service]; } };
  const device = {
    id: options.id ?? `mock-${profileId}-${Math.random()}`,
    name: `Mock ${profileId}`,
    addEventListener(event, listener) { listeners.set(event, listener); },
    removeEventListener(event) { listeners.delete(event); },
    gatt: {
      connected: false,
      async connect() { events.push('connect'); if (options.connect) await options.connect(); this.connected = true; return server; },
      disconnect() { events.push('disconnect'); this.connected = false; listeners.get('gattserverdisconnected')?.(); },
    },
  };
  const bluetooth = { async requestDevice(request) { events.push('choose'); assert.deepEqual(request, bluetoothRequestOptions(profileId)); return device; } };
  return { device, events, bluetooth, characteristic, listeners, service };
}
const frame = (value, axis = 'V0', durationMs = 0) => ({ values: { [axis]: value }, durationMs, timeMs: 12 });

for (const [id, atHalf, zero] of [
  ['loob', '01f404d2', '00010000'], ['thrust-sync', '5a04d2', '000000'],
  ['svakom-v1', '55040300010a', '550403000000'],
  ['lovense-single', Buffer.from('Vibrate:10;').toString('hex'), Buffer.from('Vibrate:0;').toString('hex')],
]) {
  test(`${id} codec emits verified exact target and zero encoding`, () => {
    const codec = createBleCodec(id);
    assert.equal(hex(codec.encode(.5, codec.profile.axis === 'L0' ? 1234 : 0)), atHalf);
    assert.equal(hex(codec.encode(0, 0)), zero);
    assert.equal(codec.stop() === null, codec.profile.axis === 'L0');
  });
}

test('Youou codec sequence, state and checksum are per connection, wrap and retain zero', () => {
  const codec = createBleCodec('youou-vx001');
  for (let id = 0; id <= 256; id++) {
    const value = id === 256 ? 0 : 1;
    const packet = codec.encode(value);
    assert.equal(packet.length, 17);
    assert.deepEqual([...packet.slice(0, 8)], [0xaa, 0x55, id & 255, 2, 3, 1, value ? 247 : 0, value ? 1 : 0]);
    assert.equal(packet[8], packet.slice(0, 8).reduce((a, b) => a ^ b, 0));
    assert.equal(hex(packet.slice(9)), 'ff00000000000000');
  }
  assert.equal(createBleCodec('youou-vx001').encode(1)[2], 0);
});

test('all BLE codecs bound numeric type, position and duration semantics', () => {
  for (const { id, axis } of BLUETOOTH_PROFILES) {
    const codec = createBleCodec(id);
    for (const invalid of [-1, 2, NaN, Infinity, '0.5', null]) assert.throws(() => codec.encode(invalid));
    for (const invalid of [-1, 65536, 1.5, true]) assert.throws(() => codec.encode(.5, invalid));
    if (axis === 'V0') assert.throws(() => codec.encode(.5, 10));
    else assert.doesNotThrow(() => codec.encode(.5, 65535));
    const packet = codec.encode(1, 0);
    assert.ok(packet.length <= 20, 'no arbitrary splitting of a protocol message');
  }
  assert.throws(() => createBleCodec('unknown'));
});

test('chooser lists actual permitted GATT services and model filters', () => {
  assert.deepEqual(bluetoothRequestOptions('loob').filters, [{ namePrefix: 'LOOB' }]);
  assert.deepEqual(bluetoothRequestOptions('youou-vx001').filters, [{ namePrefix: 'VX001_' }]);
  const lovense = bluetoothRequestOptions('lovense-single');
  assert.equal(lovense.optionalServices.length, 11);
  assert.ok(lovense.optionalServices.includes('53300001-0023-4bd4-bbd5-a6920e4c5653'));
});

test('Bluetooth missing support, denied chooser and failed discovery do not activate a device', async () => {
  await assert.rejects(createBluetoothTransport('loob', { bluetooth: {} }), /unavailable/);
  await assert.rejects(createBluetoothTransport('loob', { bluetooth: { requestDevice: () => Promise.reject(new Error('denied')) } }), /denied/);
  const rig = mockDevice('lovense-single', { services: () => [] });
  await assert.rejects(createBluetoothTransport('lovense-single', rig), /does not expose/);
  assert.deepEqual(rig.events, ['choose', 'connect', 'disconnect']);
  assert.equal(rig.listeners.size, 0);
});

for (const profile of BLUETOOTH_PROFILES) {
  test(`${profile.id} actual mock GATT selects endpoint, sends only its axis and closes`, async () => {
    const rig = mockDevice(profile.id, { pairIndex: profile.id === 'lovense-single' ? 5 : 0 });
    const transport = await createBluetoothTransport(profile.id, rig);
    assert.deepEqual(rig.events, ['choose', 'connect']);
    await transport.send(frame(.9, 'A0'));
    assert.equal(rig.events.length, 2);
    await transport.send(frame(.5, profile.axis, 1234));
    assert.equal(rig.events.length, 3);
    assert.equal(rig.events[2], hex(createBleCodec(profile.id).encode(.5, profile.axis === 'L0' ? 1234 : 0)));
    await transport.close();
    assert.equal(rig.events.at(-1), 'disconnect');
    if (profile.axis === 'V0') {
      const codec = createBleCodec(profile.id); codec.encode(.5);
      assert.equal(rig.events.at(-2), hex(codec.stop()));
    }
    await assert.rejects(transport.send(frame(.5, profile.axis)), /closed/);
  });
}

test('stop invalidates queued writes, waits the in-flight packet then sends only zero', async () => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const rig = mockDevice('youou-vx001', { write: async (_, events) => { if (events.length === 3) await pending; } });
  const transport = await createBluetoothTransport('youou-vx001', rig);
  const first = transport.send(frame(1));
  await Promise.resolve(); await Promise.resolve();
  const stale = transport.send(frame(.2));
  const stopped = transport.stop();
  release();
  await Promise.all([first, stale, stopped]);
  const packets = rig.events.filter(item => /^[a-f0-9]+$/.test(item));
  assert.equal(packets.length, 2);
  assert.equal(Buffer.from(packets[0], 'hex')[6], 247);
  assert.equal(Buffer.from(packets[1], 'hex')[6], 0);
  assert.equal(Buffer.from(packets[1], 'hex')[2], 1, 'discarded command consumes no sequence');
  await transport.close();
});

test('independent devices retain their own sequence while one connection serializes concurrent commands', async () => {
  const a = mockDevice('youou-vx001'); const b = mockDevice('youou-vx001');
  const first = await createBluetoothTransport('youou-vx001', a);
  const second = await createBluetoothTransport('youou-vx001', b);
  await Promise.all([first.send(frame(.2)), first.send(frame(.5)), second.send(frame(.8))]);
  assert.deepEqual(a.events.filter(x => x.length === 34).map(x => Buffer.from(x, 'hex')[2]), [0, 1]);
  assert.deepEqual(b.events.filter(x => x.length === 34).map(x => Buffer.from(x, 'hex')[2]), [0]);
  await Promise.all([first.close(), second.close()]);
});

test('same physical device cannot acquire competing browser output connections', async () => {
  const rig = mockDevice('svakom-v1');
  const first = await createBluetoothTransport('svakom-v1', rig);
  await assert.rejects(createBluetoothTransport('svakom-v1', rig), /already connected/);
  assert.equal(rig.events.filter(x => x === 'connect').length, 1);
  await first.close();
  const second = await createBluetoothTransport('svakom-v1', rig);
  await second.close();
});

test('write errors disconnect and release a device for explicit new connection', async () => {
  const rig = mockDevice('lovense-single', { write: () => { throw new Error('write failed'); } });
  const transport = await createBluetoothTransport('lovense-single', rig);
  await assert.rejects(transport.send(frame(1)), /write failed/);
  assert.equal(rig.events.at(-1), 'disconnect');
  assert.equal(rig.listeners.size, 0);
  await assert.rejects(transport.send(frame(.5)), /closed/);
  await transport.close();
});

test('bounded connect also cleans a native connection completing after timeout', async () => {
  let release;
  const rig = mockDevice('thrust-sync', { connect: () => new Promise(resolve => { release = resolve; }) });
  await assert.rejects(createBluetoothTransport('thrust-sync', { ...rig, timeoutMs: 5 }), /timed out/);
  assert.equal(rig.events.at(-1), 'disconnect');
  release();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(rig.device.gatt.connected, false);
  assert.equal(rig.events.filter(x => x === 'disconnect').length, 2);
});

test('a hung native GATT write times out, disconnects and does not block close', async () => {
  const rig = mockDevice('svakom-v1', { write: () => new Promise(() => {}) });
  const transport = await createBluetoothTransport('svakom-v1', { ...rig, timeoutMs: 5 });
  await assert.rejects(transport.send(frame(1)), /timed out/);
  await transport.close();
  assert.equal(rig.device.gatt.connected, false);
});

test('write-with-response-only characteristic is supported', async () => {
  const rig = mockDevice('svakom-v1');
  rig.characteristic.properties = { write: true, writeWithoutResponse: false };
  rig.characteristic.writeValueWithResponse = rig.characteristic.writeValueWithoutResponse;
  const transport = await createBluetoothTransport('svakom-v1', rig);
  await transport.send(frame(1)); await transport.close();
  assert.equal(rig.events[2], '550403000113');
});


test('native disconnect notifies subscribed UI once and old close cannot affect a new owner', async () => {
  const rig = mockDevice('youou-vx001');
  const first = await createBluetoothTransport('youou-vx001', rig);
  let calls = 0;
  const unsubscribe = first.subscribeDisconnect(() => { calls++; });
  const removed = first.subscribeDisconnect(() => { throw new Error('Observer removed'); }); removed();
  rig.device.gatt.disconnect();
  assert.equal(calls, 1);
  assert.equal(first.connected, false);
  unsubscribe();
  const second = await createBluetoothTransport('youou-vx001', rig);
  await first.close();
  assert.equal(second.connected, true);
  await second.close();
});

test('a position stop disconnects instead of disguising zero position as a stop opcode', async () => {
  const rig = mockDevice('loob');
  const transport = await createBluetoothTransport('loob', rig);
  let calls = 0;
  transport.subscribeDisconnect(() => { calls++; });
  await transport.send(frame(.8, 'L0', 500));
  await transport.stop();
  assert.equal(calls, 1);
  assert.equal(rig.events.length, 4);
  assert.equal(rig.events.at(-1), 'disconnect');
  await assert.rejects(transport.send(frame(.2, 'L0')), /closed/);
});


test('browser and actual Python bridge encode the same boundary targets, durations and sequence bytes', () => {
  const cases = BLUETOOTH_PROFILES.flatMap(profile => [0, .025, .1, .5, .9, .999, 1]
    .map((value, packetId) => ({ id: profile.id, value, packetId,
      duration: profile.axis === 'L0' ? packetId * 10001 : 0 })));
  const codecs = new Map();
  const browser = cases.map(item => {
    if (!codecs.has(item.id)) codecs.set(item.id, createBleCodec(item.id));
    return hex(codecs.get(item.id).encode(item.value, item.duration));
  });
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const python = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
  const source = `import sys,json,importlib.util,pathlib
p=pathlib.Path('tools/protocol-bridge/bridge.py')
spec=importlib.util.spec_from_file_location('ble_parity',p)
m=importlib.util.module_from_spec(spec);sys.modules[spec.name]=m;spec.loader.exec_module(m)
cases=json.load(sys.stdin)
print(json.dumps([m.PROTOCOLS[c['id']].encode(c['value'],c['duration'],packet_id=c['packetId']).hex() for c in cases]))
`;
  const actual = JSON.parse(execFileSync(python, ['-c', source], {
    cwd: root, input: JSON.stringify(cases), encoding: 'utf8', timeout: 10000,
  }));
  assert.deepEqual(browser, actual);
});


test('completed failed vibration write attempts exact zero before disconnect, preserving original error', async () => {
  const rig = mockDevice('youou-vx001', { write: (_, events) => {
    if (events.length === 3) throw new Error('Completed native write failed');
  } });
  const transport = await createBluetoothTransport('youou-vx001', rig);
  await assert.rejects(transport.send(frame(1)), /Completed native write failed/);
  const writes = rig.events.filter(item => item.length === 34).map(item => Buffer.from(item, 'hex'));
  assert.deepEqual(writes.map(packet => [packet[2], packet[6]]), [[0, 247], [1, 0]]);
  assert.equal(rig.events.at(-1), 'disconnect');
  await transport.close();
});

test('timed-out native write never starts a concurrent zero command', async () => {
  const rig = mockDevice('youou-vx001', { write: () => new Promise(() => {}) });
  const transport = await createBluetoothTransport('youou-vx001', { ...rig, timeoutMs: 5 });
  await assert.rejects(transport.send(frame(1)), /timed out/);
  assert.equal(rig.events.filter(item => item.length === 34).length, 1);
  assert.equal(rig.events.at(-1), 'disconnect');
  await transport.close();
});
