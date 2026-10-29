import test from 'node:test';
import assert from 'node:assert/strict';
import { createOutputTransport, createIntifaceTransport, discoverIntiface, discoverMidi, endpointUrl, signalPacket } from '../../src/websensa/transports.js';

const frame = { values: { L0: .75, L1: .2, R0: .4, V0: .6 }, durationMs: 40, timeMs: 123 };
function socketRig({ devices, errorFor, noResponse, badResponse, maxPing = 0 } = {}) {
  const events = [], sockets = [];
  const available = devices || [
    { DeviceIndex: 0, DeviceName: '动作设备 📡', DeviceMessages: { LinearCmd: [{ ActuatorType: 'Linear', FeatureDescriptor: 'Stroke' }, { ActuatorType: 'Linear', FeatureDescriptor: 'Surge' }], ScalarCmd: [{ ActuatorType: 'Vibrate' }], RotateCmd: [{ ActuatorType: 'Rotate' }] } },
    { DeviceIndex: 1, DeviceName: 'Vibrator', DeviceMessages: { ScalarCmd: [{ ActuatorType: 'Vibrate' }] } },
  ];
  class Socket extends EventTarget {
    constructor(url) { super(); this.url = url; this.readyState = 0; this.bufferedAmount = 0; sockets.push(this); queueMicrotask(() => { this.readyState = 1; this.dispatchEvent(new Event('open')); }); }
    send(value) {
      events.push(value);
      if (value[0] !== '[') { if (value[0] === '{') queueMicrotask(() => { const event = new Event('message'); event.data = JSON.stringify({ ok: true }); this.dispatchEvent(event); }); return; }
      const [name, body] = Object.entries(JSON.parse(value)[0])[0];
      if (name === noResponse) return;
      let response = { Ok: { Id: body.Id } };
      if (name === 'RequestServerInfo') response = { ServerInfo: { Id: body.Id, MessageVersion: 3, MaxPingTime: maxPing } };
      if (name === 'RequestDeviceList') response = { DeviceList: { Id: body.Id, Devices: available } };
      if (name === errorFor) response = { Error: { Id: body.Id, ErrorMessage: 'Mock command rejected' } };
      queueMicrotask(() => { const event = new Event('message'); event.data = name === badResponse ? 'not JSON' : JSON.stringify([response]); this.dispatchEvent(event); });
    }
    close() { if (this.readyState === 3) return; this.readyState = 3; this.dispatchEvent(new Event('close')); }
  }
  return { dependencies: { WebSocket: Socket, pool: new Map(), timeoutMs: 30 }, sockets, events,
    commands: () => events.filter(value => value[0] === '[').flatMap(value => JSON.parse(value)).map(value => Object.entries(value)[0]) };
}

test('endpoint validation preserves path/query and refuses unsupported schemes or URL credentials', () => {
  assert.equal(endpointUrl('ws://localhost:12345/devices?name=one', ['ws:']), 'ws://localhost:12345/devices?name=one');
  for (const value of ['ftp://localhost', 'ws://user:password@localhost', 'wss://host/#fragment', 'invalid']) assert.throws(() => endpointUrl(value, ['ws:', 'wss:']));
});

test('Intiface v3 performs real JSON handshake/discovery and shares a single socket across different devices', async () => {
  const r = socketRig(), discovery = await discoverIntiface('ws://localhost:12345', r.dependencies);
  assert.equal(discovery.features.length, 5); assert.match(discovery.features[0].name, /📡/);
  const first = await createIntifaceTransport({ url: 'ws://localhost:12345', featureId: '0:LinearCmd:0', axis: 'L0' }, r.dependencies);
  const second = await createIntifaceTransport({ url: 'ws://localhost:12345', featureId: '1:ScalarCmd:0', axis: 'V0' }, r.dependencies);
  discovery.close(); assert.equal(r.sockets.length, 1);
  await first.send(frame); await second.send(frame);
  assert.deepEqual(r.commands().find(([name]) => name === 'LinearCmd')[1].Vectors, [{ Index: 0, Position: .75, Duration: 40 }]);
  assert.deepEqual(r.commands().find(([name]) => name === 'ScalarCmd')[1].Scalars, [{ Index: 0, Scalar: .6, ActuatorType: 'Vibrate' }]);
  await first.stop(); await first.close(); assert.equal(r.sockets[0].readyState, 1);
  await second.send(frame); await second.stop(); await second.close(); assert.equal(r.sockets[0].readyState, 3);
  const stops = r.commands().filter(([name]) => name === 'StopDeviceCmd').map(([, body]) => body.DeviceIndex);
  assert.deepEqual(stops, [0, 1]);
  assert.equal(r.commands().filter(([name]) => name === 'RequestServerInfo').length, 1);
});

test('Intiface rejects a competing device output and does not close the original owner connection', async () => {
  const r = socketRig(), config = { url: 'ws://localhost:12345', featureId: '0:LinearCmd:0' };
  const owner = await createIntifaceTransport(config, r.dependencies);
  await assert.rejects(createIntifaceTransport({ ...config, featureId: '0:ScalarCmd:0' }, r.dependencies), /already has an output/);
  assert.equal(r.sockets[0].readyState, 1); await owner.send(frame); await owner.close();
  const replacement = await createIntifaceTransport(config, r.dependencies); await replacement.close(); assert.equal(r.sockets.length, 2);
});

test('one Intiface device output groups all feature commands with exact indices, types and source axes', async () => {
  const r = socketRig(), output = await createIntifaceTransport({ url: 'ws://localhost', featureId: '0:LinearCmd:0', mapDevice: true }, r.dependencies);
  await output.send(frame);
  const linear = r.commands().find(([name]) => name === 'LinearCmd')[1];
  assert.deepEqual(linear.Vectors, [{ Index: 0, Position: .75, Duration: 40 }, { Index: 1, Position: .2, Duration: 40 }]);
  assert.deepEqual(r.commands().find(([name]) => name === 'RotateCmd')[1].Rotations, [{ Index: 0, Speed: .4, Clockwise: true }]);
  await output.stop(); await output.close();
});

test('Intiface respects explicit counterclockwise rotation and ignores a missing source axis', async () => {
  const r = socketRig(), output = await createIntifaceTransport({ url: 'ws://localhost', featureId: '0:RotateCmd:0', axis: 'V0', clockwise: false }, r.dependencies);
  await output.send({ ...frame, values: { L0: .5 } }); assert.equal(r.commands().filter(([name]) => name === 'RotateCmd').length, 0);
  await output.send(frame); assert.deepEqual(r.commands().find(([name]) => name === 'RotateCmd')[1].Rotations, [{ Index: 0, Speed: .6, Clockwise: false }]);
  await output.close();
});

test('Intiface negative acknowledgements, malformed JSON and response timeouts reject without leaking sockets', async () => {
  for (const options of [{ errorFor: 'RequestServerInfo' }, { noResponse: 'RequestServerInfo' }, { badResponse: 'RequestServerInfo' }, { devices: [] }]) {
    const r = socketRig(options);
    await assert.rejects(createIntifaceTransport({ url: 'ws://localhost' }, r.dependencies));
    assert.equal(r.sockets[0].readyState, 3); assert.equal(r.dependencies.pool.size, 0);
  }
  const r = socketRig({ errorFor: 'LinearCmd' }), output = await createIntifaceTransport({ url: 'ws://localhost' }, r.dependencies);
  await assert.rejects(output.send(frame), /rejected/); await output.close();
});

test('generic WebSocket outputs reject duplicate physical endpoints and separate protocol/path ownership', async () => {
  const r = socketRig();
  const a = await createOutputTransport({ type: 'tcode-ws', url: 'ws://localhost/shared' }, r.dependencies);
  await assert.rejects(createOutputTransport({ type: 'tcode-ws', url: 'ws://localhost/shared' }, r.dependencies), /already has an output/);
  const json = await createOutputTransport({ type: 'json-ws', url: 'ws://localhost/shared' }, r.dependencies);
  const path = await createOutputTransport({ type: 'tcode-ws', url: 'ws://localhost/another' }, r.dependencies);
  assert.equal(r.sockets.length, 3); await a.send(frame); await json.send(frame);
  assert.equal(r.events[0], 'L07499I40 L12000I40 R04000I40 V05999I40\n');
  assert.deepEqual(JSON.parse(r.events[1]), signalPacket(frame));
  await a.stop(); await a.close(); assert.equal(r.sockets[0].readyState, 3); assert.equal(r.events.at(-1), 'DSTOP\n');
  await json.stop(); assert.deepEqual(JSON.parse(r.events.at(-1)), { command: 'stop', type: 'stop' }); await json.close(); await path.close();
});

test('WebSocket output rejects oversized backpressure or disconnected sockets', async () => {
  const r = socketRig(), output = await createOutputTransport({ type: 'json-ws', url: 'ws://localhost' }, r.dependencies);
  r.sockets[0].bufferedAmount = 1048577; await assert.rejects(output.send(frame), /not reading/);
  r.sockets[0].close(); await assert.rejects(output.send(frame), /disconnected/); await output.close();
});

test('HTTP sends explicit signal/stop bodies with omitted credentials and no redirects', async () => {
  const requests = [];
  const output = await createOutputTransport({ type: 'http', url: 'https://example.test/control' }, { fetch: async (url, options) => { requests.push({ url, ...options, body: JSON.parse(options.body) }); return { ok: true }; } });
  await output.send(frame); await output.stop(); await output.close();
  assert.equal(requests[0].credentials, 'omit'); assert.equal(requests[0].redirect, 'error'); assert.equal(requests[0].method, 'POST');
  assert.deepEqual(requests[0].body, signalPacket(frame)); assert.deepEqual(requests[1].body, { command: 'stop', type: 'stop' });
  const bad = await createOutputTransport({ type: 'http', url: 'https://example.test' }, { fetch: async () => ({ ok: false, status: 403 }) }); await assert.rejects(bad.send(frame), /403/);
});

test('Web Serial requests explicit permission, writes complete TCode frames and releases the writer', async () => {
  const events = [];
  const port = { async open(options) { events.push(options); }, writable: { getWriter() { return { async write(bytes) { events.push(new TextDecoder().decode(bytes)); }, releaseLock() { events.push('release'); } }; } }, async close() { events.push('close'); } };
  const output = await createOutputTransport({ type: 'serial', baudRate: 115200 }, { navigator: { serial: { async requestPort() { events.push('permission'); return port; } } } });
  await assert.rejects(createOutputTransport({ type: 'serial', baudRate: 115200 }, { navigator: { serial: { async requestPort() { return port; } } } }), /already has an output/);
  await output.send(frame); await output.stop(); await output.close(); await output.close();
  assert.deepEqual(events, ['permission', { baudRate: 115200 }, 'L07499I40 L12000I40 R04000I40 V05999I40\n', 'DSTOP\n', 'release', 'close']);
  await assert.rejects(createOutputTransport({ type: 'serial' }, { navigator: {} }), /Web Serial/);
});

test('Web Serial failed-open cleanup and invalid baud rates do not leave resources behind', async () => {
  let closed = 0, requested = 0;
  const navigator = { serial: { async requestPort() { requested++; return { async open() { throw new Error('busy'); }, async close() { closed++; } }; } } };
  await assert.rejects(createOutputTransport({ type: 'serial', baudRate: -1 }, { navigator })); assert.equal(requested, 0);
  await assert.rejects(createOutputTransport({ type: 'serial', baudRate: 115200 }, { navigator }), /busy/); assert.equal(closed, 1);
});

test('MIDI explicitly selects a port, shares different CC ownership and stops only its CC', async () => {
  const sent = []; let opens = 0, closes = 0;
  const output = { id: 'port-one', name: 'Synth', async open() { opens++; }, async close() { closes++; }, send(bytes) { sent.push(bytes); } };
  const nav = { async requestMIDIAccess(options) { assert.deepEqual(options, { sysex: false }); return { outputs: new Map([[output.id, output]]) }; } };
  assert.deepEqual(await discoverMidi({ navigator: nav }), [{ id: output.id, name: 'Synth' }]);
  const a = await createOutputTransport({ type: 'midi', channel: 2, cc: 10, axis: 'V0' }, { navigator: nav });
  const b = await createOutputTransport({ type: 'midi', channel: 2, cc: 11, axis: 'L0' }, { navigator: nav });
  await assert.rejects(createOutputTransport({ type: 'midi', channel: 2, cc: 10 }, { navigator: nav }), /already/);
  await a.send(frame); await b.send(frame); await a.stop(); await a.close(); assert.equal(closes, 0);
  await b.stop(); await b.close(); assert.equal(closes, 1); assert.equal(opens, 2);
  assert.deepEqual(sent, [[0xb1, 10, 76], [0xb1, 11, 95], [0xb1, 10, 0], [0xb1, 11, 0]]);
});

test('MIDI unsupported, absent, ambiguous and invalid mappings fail before sending', async () => {
  await assert.rejects(createOutputTransport({ type: 'midi' }, { navigator: {} }), /Web MIDI/);
  for (const outputs of [new Map(), new Map([['a', {}], ['b', {}]])]) {
    await assert.rejects(createOutputTransport({ type: 'midi' }, { navigator: { async requestMIDIAccess() { return { outputs }; } } }));
  }
  const navigator = { async requestMIDIAccess() { return { outputs: new Map([['a', {}]]) }; } };
  for (const config of [{ channel: 0 }, { cc: 128 }, { channel: 1.2 }]) await assert.rejects(createOutputTransport({ type: 'midi', ...config }, { navigator }));
});

test('Intiface interruption abandons a pending correlated frame but preserves ordered stop and connection ownership', async () => {
  const r = socketRig({ noResponse: 'LinearCmd' });
  const output = await createIntifaceTransport({ url: 'ws://localhost' }, r.dependencies);
  const writing = output.send(frame); output.interrupt();
  await assert.rejects(writing, { name: 'AbortError' }); await output.stop();
  assert.deepEqual(r.commands().slice(-2).map(([name]) => name), ['LinearCmd', 'StopDeviceCmd']);
  assert.equal(r.sockets[0].readyState, 1); await output.close();
});

test('a discovery subscriber receives devices arriving after the initial empty list and scans only once', async () => {
  const r = socketRig({ devices: [] }), discovery = await discoverIntiface('ws://localhost', r.dependencies);
  const updates = []; discovery.subscribeFeatures(features => updates.push(features));
  assert.deepEqual(updates, [[]]);
  const event = new Event('message'); event.data = JSON.stringify([{ DeviceAdded: { Id: 0, DeviceIndex: 9, DeviceName: 'Late toy', DeviceMessages: { ScalarCmd: [{ ActuatorType: 'Vibrate' }] } } }]);
  r.sockets[0].dispatchEvent(event);
  assert.equal(updates.at(-1)[0].id, '9:ScalarCmd:0');
  assert.equal(r.commands().filter(([name]) => name === 'StartScanning').length, 1);
  discovery.close();
});

test('JSON websocket requires a successful acknowledgement and surfaces the actual Sensa error body', async () => {
  class Socket extends EventTarget {
    constructor() { super(); this.readyState = 0; this.bufferedAmount = 0; queueMicrotask(() => { this.readyState = 1; this.dispatchEvent(new Event('open')); }); }
    send() { queueMicrotask(() => { const message = new Event('message'); message.data = JSON.stringify({ error: { code: 400, message: 'This channel is not configured for the input.' } }); this.dispatchEvent(message); }); }
    close() { this.readyState = 3; this.dispatchEvent(new Event('close')); }
  }
  const output = await createOutputTransport({ type: 'json-ws', url: 'ws://localhost' }, { WebSocket: Socket, pool: new Map(), timeoutMs: 20 });
  await assert.rejects(output.send(frame), /channel is not configured/); await output.close();
});

test('JSON websocket missing acknowledgement closes the uncertain session instead of accepting later work', async () => {
  const r = socketRig();
  class Silent extends r.dependencies.WebSocket { send(value) { r.events.push(value); } }
  const output = await createOutputTransport({ type: 'json-ws', url: 'ws://localhost' }, { ...r.dependencies, WebSocket: Silent, timeoutMs: 5 });
  await assert.rejects(output.send(frame), /acknowledgement timed out/); assert.equal(r.sockets[0].readyState, 3); await output.close();
});

test('serial write and cleanup deadlines settle even when native writes never complete', async () => {
  const events = [];
  const port = { async open() {}, writable: { getWriter() { return { write() { events.push('write'); return new Promise(() => {}); }, abort() { events.push('abort'); return new Promise(() => {}); }, releaseLock() { events.push('release'); } }; } }, async close() { events.push('close'); } };
  const output = await createOutputTransport({ type: 'serial' }, { navigator: { serial: { async requestPort() { return port; } } }, timeoutMs: 5 });
  await assert.rejects(output.send(frame), /timed out/); await assert.rejects(output.stop(), /timed out/); await output.close();
  assert.deepEqual(events, ['write', 'abort', 'write', 'abort', 'release', 'close']);
});

test('a late successful serial open is closed before its lease can be reused', async () => {
  let resolveOpen, opens = 0, closes = 0;
  const port = { open() { opens++; return new Promise(resolve => { resolveOpen = resolve; }); }, async close() { closes++; }, writable: { getWriter() { return { async write() {}, releaseLock() {} }; } } };
  const dependencies = { navigator: { serial: { async requestPort() { return port; } } }, timeoutMs: 5 };
  await assert.rejects(createOutputTransport({ type: 'serial' }, dependencies), /timed out/);
  await assert.rejects(createOutputTransport({ type: 'serial' }, dependencies), /already has an output/); assert.equal(opens, 1);
  resolveOpen(); for (let index = 0; index < 12; index++) await Promise.resolve(); assert.equal(closes, 1);
  port.open = async () => { opens++; }; const replacement = await createOutputTransport({ type: 'serial' }, dependencies); await replacement.close();
  assert.equal(opens, 2); assert.equal(closes, 2);
});

test('MIDI stop does not clear messages owned by another channel or controller', async () => {
  const output = { id: 'uncleared', async open() {}, async close() {}, send() {}, clear() { throw new Error('Must not clear another CC queue.'); } };
  const transport = await createOutputTransport({ type: 'midi' }, { navigator: { async requestMIDIAccess() { return { outputs: new Map([[output.id, output]]) }; } } });
  await transport.stop(); await transport.close();
});

test('HTTP stop waits for the acknowledged prior request rather than treating fetch abort as server cancellation', async () => {
  const { OutputLane } = await import('../../src/core/index.js');
  let release; const events = [], gate = new Promise(resolve => { release = resolve; });
  const transport = await createOutputTransport({ type: 'http', url: 'https://ordered.test/control' }, { fetch: async (_, options) => {
    const body = JSON.parse(options.body); events.push(body.type); if (body.type === 'signal') await gate; return { ok: true };
  } });
  const lane = new OutputLane(transport), writing = lane.send(frame), stopped = lane.stop();
  assert.deepEqual(events, ['signal']); release(); await Promise.all([writing, stopped]); assert.deepEqual(events, ['signal', 'stop']); await lane.close();
});
