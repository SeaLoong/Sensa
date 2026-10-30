import test from 'node:test';
import assert from 'node:assert/strict';
import { createBrowserWorkbench } from '../../src/websensa/browser-runtime.ts';
import { BrowserDevices, BrowserRecordingStore, createBrowserOutputFactory } from '../../src/websensa/browser-outputs.ts';
import { createDefaultConfiguration } from '../../src/core/runtime/configuration.ts';
import { defaultOutputDeviceConfig, defaultSignalOutputBinding } from '../../src/core/runtime/configuration-defaults.ts';
import { RuntimeEngine } from '../../src/core/runtime/runtime.ts';
import { ApplicationFacade } from '../../src/core/runtime/application.ts';
import { OutputCoordinator } from '../../src/core/outputs/coordinator.ts';
import { SignalReplay } from '../../src/core/outputs/recording.ts';
import { neutralValues, sample, invalidSample } from '../../src/core/runtime/model.ts';
import { manualCommandPayload, normalizeScriptSettingsState } from '../../src/web/input-workflows.js';

function clock() { let id = 0; const callbacks = new Map(); return { callbacks,
  setInterval(callback) { const next = ++id; callbacks.set(next, callback); return next; }, clearInterval(value) { callbacks.delete(value); } }; }
function output(type, patch = {}) { return { ...defaultOutputDeviceConfig(), id: 'one', name: 'Output', type,
  enabled: true, websocketAddress: type === 'SensaHttp' || type === 'HttpJson' ? 'http://fixture.invalid/command' : 'ws://fixture.invalid/command', ...patch }; }

test('browser TCode telemetry records the profile-mapped wire target and changes to stopped after DSTOP', async () => {
  const rig = network(), config = createDefaultConfiguration(), target = output('TCodeWebSocket'); config.outputs = [target]; target.motionProfileId = config.axisProfiles[0].id;
  const profile = config.axisProfiles[0].motion; profile.l0.remapMin = 400; profile.l0.remapMax = 600; profile.l0.commandMode = 'None';
  let active = true; const coordinator = new OutputCoordinator(config, { now: () => 2000, canSend: () => active, createAdapter: createBrowserOutputFactory(new BrowserDevices(rig.dependencies)) });
  await coordinator.connectEnabled(); await coordinator.sendFrame({ values: { ...neutralValues(), L0: 1 }, deltaMs: 100, activeAxes: ['L0'] }); await coordinator.flush();
  assert.equal(rig.writes.at(-1).text, 'L0600\n'); assert.deepEqual(coordinator.snapshot()[0].telemetry.targets, [{ key: 'L0', label: 'L0', value: 600, maximum: 999 }]); assert.equal(coordinator.snapshot()[0].telemetry.lastSentAtUtc, '1970-01-01T00:00:02.000Z');
  active = false; await coordinator.emergencyStop(); assert.equal(rig.writes.at(-1).text, 'DSTOP\n'); assert.equal(coordinator.snapshot()[0].telemetry.state, 'stopped'); assert.deepEqual(coordinator.snapshot()[0].telemetry.targets, []); assert.equal(coordinator.snapshot()[0].telemetry.lastSentAtUtc, null); await coordinator.close();
});

test('browser Intiface telemetry waits for the real feature ACK and removes targets when that device disappears', async () => {
  const rig = intifaceRig([{ DeviceIndex: 0, DeviceName: 'Telemetry device', DeviceMessages: { LinearCmd: [{ FeatureDescriptor: 'position' }] } }]), config = createDefaultConfiguration(), target = output('Intiface'); config.outputs = [target];
  const coordinator = new OutputCoordinator(config, { now: () => 3000, canSend: () => true, createAdapter: createBrowserOutputFactory(new BrowserDevices(rig.dependencies)) }); await coordinator.connectEnabled();
  const socket = rig.sockets[0], original = socket.send.bind(socket); let acknowledge, began; const started = new Promise(resolve => { began = resolve; });
  socket.send = text => { const [name, body] = Object.entries(JSON.parse(text)[0])[0]; if (name === 'LinearCmd') { rig.commands.push({ name, body }); acknowledge = () => socket.receive([{ Ok: { Id: body.Id } }]); began(); } else original(text); };
  await coordinator.sendFrame({ values: { ...neutralValues(), L0: .75 }, deltaMs: 100, activeAxes: ['L0'] }); await started;
  assert.deepEqual(coordinator.snapshot()[0].telemetry.targets, []); assert.equal(coordinator.snapshot()[0].telemetry.state, 'idle'); acknowledge(); await coordinator.flush(); assert.equal(coordinator.snapshot()[0].telemetry.targets[0].value, 25); assert.equal(coordinator.snapshot()[0].telemetry.lastSentAtUtc, '1970-01-01T00:00:03.000Z');
  socket.receive([{ DeviceRemoved: { Id: 0, DeviceIndex: 0 } }]); await new Promise(resolve => setImmediate(resolve)); assert.deepEqual(coordinator.snapshot()[0].telemetry.targets, []); assert.equal(coordinator.snapshot()[0].telemetry.state, 'idle'); await coordinator.close();
});
function network() {
  const writes = [], sockets = [], requests = [];
  class Socket extends EventTarget {
    constructor(address) { super(); this.address = address; this.readyState = 0; this.bufferedAmount = 0; sockets.push(this);
      queueMicrotask(() => { this.readyState = 1; this.dispatchEvent(new Event('open')); }); }
    send(text) { writes.push({ address: this.address, text }); if (text.startsWith('{')) queueMicrotask(() => {
      const event = new Event('message'); event.data = JSON.stringify({ ok: true }); this.dispatchEvent(event);
    }); }
    close() { if (this.readyState === 3) return; this.readyState = 3; this.dispatchEvent(new Event('close')); }
  }
  const fetch = async (address, options) => { requests.push({ address, options, body: JSON.parse(options.body) }); return { ok: true }; };
  return { writes, sockets, requests, dependencies: { WebSocket: Socket, fetch, timeoutMs: 50 }, environment: { WebSocket: Socket, fetch } };
}
async function hostWith(outputs, rig = network(), rest = {}) {
  const config = createDefaultConfiguration(); config.outputs = outputs;
  const host = createBrowserWorkbench({ config, storage: null, page: null, dependencies: rig.dependencies, environment: rig.environment, timers: clock(), ...rest });
  host.client.start(); for (const target of outputs) await host.client.request(`/api/control/output/${target.id}/connect`, { method: 'POST' });
  return { host, rig };
}
async function settle(host) { await host.runtime.flush(); await host.outputs.flush(); }

test('browser host instantiates the identical application, signal engine and output coordinator', async () => {
  const { host } = await hostWith([]);
  assert.ok(host.runtime instanceof RuntimeEngine); assert.ok(host.facade instanceof ApplicationFacade); assert.ok(host.outputs instanceof OutputCoordinator);
  const data = await host.client.request('/api/state/overview');
  assert.equal(data.input.mode, 'manual'); assert.equal(data.runtime.inputActive, false);
  assert.equal(host.platform.name, 'WebSensa'); assert.equal(host.platform.supportsListeners, false);
  await host.client.dispose();
});

test('the actual uppercase workbench manual payload reaches HTTP signal and ordered stop', async () => {
  const { host, rig } = await hostWith([output('SensaHttp')]);
  const prepared = manualCommandPayload({ L0: 730 }, 'Default', 999, ['L0']);
  await host.client.request('/api/input/manual', { method: 'PUT', body: prepared });
  await host.client.request('/api/input/active', { method: 'PUT', body: { active: true } }); await settle(host);
  const frames = rig.requests.filter(row => row.body.type === 'signal');
  assert.ok(frames.length); assert.deepEqual(frames.at(-1).body.values, { L0: .73 });
  assert.deepEqual(frames.at(-1).body.commands.map(row => row.channel), ['L0']);
  assert.equal(rig.requests.at(-1).options.credentials, 'omit'); assert.equal(rig.requests.at(-1).options.redirect, 'error');
  host.client.stop(); await settle(host); assert.equal(rig.requests.at(-1).body.type, 'stop');
  host.client.start(); assert.equal(host.runtime.getSnapshot().inputActive, false); await host.client.dispose();
});

test('twelve-axis workbench frames use the shared TCode encoder and explicit active mask', async () => {
  const { host, rig } = await hostWith([output('TCodeWebSocket')]);
  await host.client.request('/api/input/manual', { method: 'PUT', body: manualCommandPayload({ L0: 200, A2: 600, V2: 700 }, 'None', 0, ['A2', 'V2']) });
  await host.client.request('/api/input/active', { method: 'PUT', body: { active: true } }); await settle(host);
  const line = rig.writes.find(row => row.text.includes('A2') && row.text.includes('V2'))?.text;
  assert.ok(line, JSON.stringify(rig.writes)); assert.doesNotMatch(line, /L0|L1|L2|R0|R1|R2|A0|A1|V0|V1/);
  await host.client.request('/api/input/active', { method: 'PUT', body: { active: false } }); await settle(host);
  assert.equal(rig.writes.at(-1).text, 'DSTOP\n'); await host.client.dispose();
});

test('script playback, selected axis and axis changes are the real application/core behavior', async () => {
  let now = 0;
  const { host, rig } = await hostWith([output('SensaWebSocket')], network(), { now: () => now });
  await host.client.request('/api/input/script/load', { method: 'POST', body: { fileName: 'fixture.funscript', content: JSON.stringify({ actions: [{ at: 0, pos: 20 }, { at: 1000, pos: 80 }] }) } });
  await host.client.request('/api/input/script/configure', { method: 'PUT', body: { axis: 'A2', speed: 1, loop: false } });
  await host.client.request('/api/input/active', { method: 'PUT', body: { active: true } });
  await host.client.request('/api/input/script/play', { method: 'POST', body: { restart: true } }); now = 500; host.runtime.tick(); await settle(host);
  const packets = rig.writes.filter(row => row.text.startsWith('{')).map(row => JSON.parse(row.text));
  assert.ok(packets.some(row => row.values?.A2 > .2 && row.values.A2 < .8), JSON.stringify(packets));
  await host.client.request('/api/input/script/configure', { method: 'PUT', body: { axis: 'V2' } });
  assert.equal(host.runtime.getSnapshot().inputActive, false); await settle(host);
  assert.equal(JSON.parse(rig.writes.at(-1).text).type, 'stop'); await host.client.dispose();
});

test('configuration writes preserve a shared validated schema and load in an inactive state', async () => {
  const values = new Map(), storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const { host } = await hostWith([], network(), { storage });
  const config = await host.client.request('/api/config'); config.outputs = [output('SensaHttp')];
  await host.client.request('/api/config', { method: 'PUT', body: config });
  assert.equal(host.runtime.getConfig().outputs[0].enabled, true); assert.equal(host.runtime.getSnapshot().inputActive, false);
  await host.client.dispose();
  const restored = createBrowserWorkbench({ storage, page: null, timers: clock() });
  assert.equal(restored.runtime.getConfig().outputs[0].enabled, false); assert.equal(restored.runtime.getSnapshot().inputActive, false);
  await restored.client.dispose();
});

test('browser device discovery never requests serial permission before explicit selection', async () => {
  let prompts = 0;
  const port = { writable: { getWriter() { return { async write() {}, releaseLock() {} }; } }, async open() {}, async close() {} };
  const devices = new BrowserDevices({ navigator: { serial: { getPorts: async () => [], requestPort: async () => { prompts++; return port; } } } });
  assert.deepEqual(await devices.listSerialPorts(), []); assert.equal(prompts, 0);
  await devices.selectSerialPort(); const [selected] = await devices.listSerialPorts(); assert.equal(prompts, 1); assert.match(selected.portName, /^webserial-/);
  assert.equal(await devices.selectedSerial(selected.portName).navigator.serial.requestPort(), port); assert.equal(prompts, 1);
});

test('completed browser recording downloads contain actual shared segment data and remain script-loadable', async () => {
  let now = 0; const cfg = output('Recording'); cfg.signal.bindings = [{ ...defaultSignalOutputBinding(), id: 'stroke', address: 'L0', source: { sourceMode: 'Manual', oscPath: 'L0', pointMetric: 'X', poseMetric: 'Depth', value: 0, weight: 1 } }];
  const { host } = await hostWith([cfg], network(), { now: () => now });
  await host.client.request('/api/input/manual', { method: 'PUT', body: manualCommandPayload({ L0: 250 }) });
  await host.client.request('/api/input/active', { method: 'PUT', body: { active: true } });
  host.outputs.updateBindings(now, value => host.runtime.resolveSignalInput(value)); await settle(host);
  now = 250; await host.client.request('/api/input/manual', { method: 'PUT', body: manualCommandPayload({ L0: 750 }) });
  host.outputs.updateBindings(now, value => host.runtime.resolveSignalInput(value)); await settle(host);
  now = 500; await host.client.request('/api/input/active', { method: 'PUT', body: { active: false } }); await settle(host);
  const files = await host.client.request('/api/output/recordings'); assert.equal(files.length, 1);
  const response = await host.client.fetch(`/api/output/recordings/${encodeURIComponent(files[0].fileName)}/download`), content = await response.json();
  assert.deepEqual(content.actions, [{ at: 0, pos: 25 }, { at: 250, pos: 75 }, { at: 500, pos: 75 }]);
  await host.client.request('/api/input/script/load-recording', { method: 'POST', body: { fileName: files[0].fileName } });
  assert.equal(host.runtime.getScriptSnapshot().loaded, true); await host.client.dispose();
});

test('memory recordings reject unrelated filenames and never expose browser or server files', () => {
  const store = new BrowserRecordingStore();
  for (const name of ['../config.json', '/etc/passwd', 'other.funscript']) assert.throws(() => store.read(name), /completed recording/);
});

test('browser funscript recording exposes active clips and restores independent track metadata on recovery', async () => {
  let now = 1000; const config = createDefaultConfiguration(), target = output('Recording'), store = new BrowserRecordingStore();
  target.signal.bindings = ['L0', 'R0'].map((address, index) => ({ ...defaultSignalOutputBinding(), id: 'track' + index, address }));
  const adapter = createBrowserOutputFactory(new BrowserDevices(), store, () => now)(target, { configuration: () => config, canSend: () => true });
  const files = () => adapter.snapshot().recordingFiles;
  try {
    await adapter.connect(); await adapter.recordSample('L0', sample(.25, now), .25, now); await adapter.recordSample('R0', sample(.44, now), .44, now);
    assert.deepEqual(files().map(file => [file.signalId, file.axis, file.segment, file.completed]), [['L0', 'L0', 1, false], ['R0', 'R0', 1, false]]);
    assert.deepEqual(store.list(), []); assert.throws(() => store.read(files()[0].fileName), /completed recording/);
    const firstName = files().find(file => file.signalId === 'R0').fileName;
    now = 4000; await adapter.recordSample('R0', invalidSample('Expired source'), null, now);
    assert.equal(files().find(file => file.fileName === firstName).completed, true); assert.equal(store.list()[0].fileName, firstName);
    now = 4600; await adapter.recordSample('R0', sample(.5, now), .5, now);
    const resumed = files().find(file => file.signalId === 'R0' && file.segment === 2);
    assert.deepEqual([resumed.completed, resumed.timeOffsetMs, resumed.axis], [false, 3600, 'R0']);
    assert.notEqual(resumed.fileName, firstName); assert.throws(() => store.read(resumed.fileName), /completed recording/);
    now = 6700; await adapter.stop(); assert.equal(files().every(file => file.completed), true); assert.equal(store.list().length, 3);
    const content = JSON.parse(store.read(resumed.fileName));
    assert.deepEqual(content.metadata, { signalId: 'R0', segment: 2, startOffsetMs: 3600 });
    assert.deepEqual(content.actions, [{ at: 0, pos: 50 }, { at: 2100, pos: 50 }]);
    assert.equal(files().find(file => file.signalId === 'R0' && file.segment === 2).fileName, resumed.fileName);
  } finally { await adapter.close(); }
});

test('all browser output choices reflect callable platform capabilities and registered factories', () => {
  const devices = new BrowserDevices();
  assert.deepEqual(devices.outputTypes({}), ['Recording']);
  assert.deepEqual(devices.outputTypes({ fetch() {} }), ['SensaHttp', 'HttpJson', 'Recording']);
  assert.ok(!devices.outputTypes({ isSecureContext: false, navigator: { serial: { requestPort() {} } } }).includes('TCodeSerial'));
});

test('selected motion axes and script-axis normalization preserve explicit choices and reject invalid masks', () => {
  assert.deepEqual(manualCommandPayload({ A2: 999 }, 'None', 0, ['A2']).axes, ['A2']);
  for (const axes of [[], ['L0', 'L0'], ['L3'], ['L0', 7]]) assert.throws(() => manualCommandPayload({}, 'None', 0, axes));
  assert.equal(normalizeScriptSettingsState({ axis: 'V2' }).axis, 'V2');
  assert.throws(() => normalizeScriptSettingsState({ axis: 'wrong' }));
});

test('the paired browser source uses the shared lease and disables input on expiry and explicit stop', async () => {
  let now = 0;
  const posted = [], opener = { postMessage: (...args) => posted.push(args) }, session = 'a'.repeat(32);
  const page = { opener, location: { origin: 'http://fixture.invalid', search: '?session=' + session }, addEventListener() {}, removeEventListener() {} };
  const { host, rig } = await hostWith([output('SensaHttp')], network(), { now: () => now, page });
  await host.platform.connectExplorer(); assert.equal(posted[0][0].type, 'sensa.signal.ready.v1');
  const message = (sequence, axes, stop = false) => ({ source: opener, origin: page.location.origin,
    data: { type: stop ? 'sensa.signal.stop.v1' : 'sensa.signal.v1', session, sequence, timestamp: now, ...(axes ? { axes } : {}) } });
  assert.equal(host.handleExplorer(message(1, { L0: .72 })), true); await settle(host);
  assert.equal((await host.client.request('/api/state/overview')).protocolInputs[0].values.L0, .72);
  assert.equal(host.runtime.getSnapshot().inputActive, false); assert.equal(rig.requests.some(row => row.body.type === 'signal'), false);
  await host.client.request('/api/input/active', { method: 'PUT', body: { active: true } });
  host.handleExplorer(message(2, { L0: .74 })); await settle(host); assert.equal(rig.requests.at(-1).body.values.L0, .74);
  now = 1001; host.runtime.tick(); await settle(host);
  assert.equal(host.runtime.getSnapshot().inputActive, false); assert.equal(rig.requests.at(-1).body.type, 'stop');
  host.handleExplorer(message(3, { L0: .9 })); await settle(host);
  assert.equal(host.runtime.externalControls.getStatus('browser-explorer').session, session);
  assert.equal(host.runtime.getSnapshot().inputActive, false); assert.equal(rig.requests.at(-1).body.type, 'stop');
  await host.client.request('/api/input/active', { method: 'PUT', body: { active: true } });
  host.handleExplorer(message(4, { L0: .81 })); await settle(host);
  host.handleExplorer(message(5, null, true)); await settle(host);
  assert.equal(host.runtime.getSnapshot().inputActive, false); assert.equal(rig.requests.at(-1).body.type, 'stop');
  const initial = host.initialSnapshot(); initial.config.webUi.title = 'Uncommitted draft';
  assert.notEqual(host.runtime.getConfig().webUi.title, 'Uncommitted draft'); await host.client.dispose();
});

function intifaceRig(devices) {
  const commands = [], sockets = [];
  class Socket extends EventTarget {
    constructor(address) { super(); this.address = address; this.readyState = 0; this.bufferedAmount = 0; sockets.push(this); queueMicrotask(() => { this.readyState = 1; this.dispatchEvent(new Event('open')); }); }
    receive(value) { const event = new Event('message'); event.data = JSON.stringify(value); this.dispatchEvent(event); }
    send(text) {
      const [name, body] = Object.entries(JSON.parse(text)[0])[0]; commands.push({ name, body });
      const reply = name === 'RequestServerInfo' ? { ServerInfo: { Id: body.Id, MessageVersion: 3, MaxPingTime: 0 } }
        : name === 'RequestDeviceList' ? { DeviceList: { Id: body.Id, Devices: devices } } : { Ok: { Id: body.Id } };
      queueMicrotask(() => this.receive([reply]));
    }
    close() { if (this.readyState === 3) return; this.readyState = 3; this.dispatchEvent(new Event('close')); }
  }
  return { commands, sockets, dependencies: { WebSocket: Socket, pool: new Map(), timeoutMs: 100 }, environment: { WebSocket: Socket } };
}
const positionDevice = (index, name = 'Position · precise') => ({ DeviceIndex: index, DeviceName: name, DeviceMessages: { LinearCmd: [{ ActuatorType: 'Linear', FeatureDescriptor: 'Stroke' }] } });
const scalarDevice = (index, name = 'Vibration') => ({ DeviceIndex: index, DeviceName: name, DeviceMessages: { ScalarCmd: [{ ActuatorType: 'Vibrate', FeatureDescriptor: 'Motor' }] } });

test('browser Intiface uses one socket, exact device scopes and mapped twelve-axis position', async () => {
  const rig = intifaceRig([positionDevice(0), scalarDevice(1)]);
  const first = output('Intiface', { id: 'position', intifaceDeviceIndex: 0, intifaceFeatures: [{ deviceName: 'Position · precise', featureIndex: 0, outputType: 'Position', sourceAxis: 'A2', directionAxis: '', clockwise: true, invert: true }] });
  const second = output('Intiface', { id: 'vibration', intifaceDeviceIndex: 1, vibrationAxis: 'V2' });
  const { host } = await hostWith([first, second], rig);
  assert.equal(rig.sockets.length, 1);
  assert.deepEqual(host.outputs.snapshot().map(row => row.devices.map(device => device.name)), [['Position · precise', 'Vibration'], ['Position · precise', 'Vibration']]);
  await host.client.request('/api/input/manual', { method: 'PUT', body: manualCommandPayload({ A2: 250, V2: 600 }, 'Interval', 40, ['A2', 'V2']) });
  await host.client.request('/api/input/active', { method: 'PUT', body: { active: true } }); await settle(host);
  assert.deepEqual(rig.commands.find(row => row.name === 'LinearCmd').body.Vectors, [{ Index: 0, Position: .75, Duration: 40 }]);
  assert.deepEqual(rig.commands.find(row => row.name === 'ScalarCmd').body.Scalars, [{ Index: 0, Scalar: .6, ActuatorType: 'Vibrate' }]);
  await host.outputs.disconnect('position'); const before = rig.commands.filter(row => row.name === 'ScalarCmd').length;
  await host.client.request('/api/input/manual', { method: 'PUT', body: manualCommandPayload({ V2: 700 }, 'None', 0, ['V2']) }); await settle(host);
  assert.ok(rig.commands.filter(row => row.name === 'ScalarCmd').length > before);
  assert.equal(rig.sockets[0].readyState, 1); assert.equal(rig.sockets.length, 1);
  assert.equal(rig.commands.filter(row => row.name === 'StopDeviceCmd').at(-1).body.DeviceIndex, 0);
  await host.client.dispose(); assert.equal(rig.sockets[0].readyState, 3);
});

test('default Intiface scope includes every device and rebuilds live feature metadata', async () => {
  const rig = intifaceRig([positionDevice(0), scalarDevice(1)]);
  const { host } = await hostWith([output('Intiface')], rig);
  await host.client.request('/api/input/manual', { method: 'PUT', body: manualCommandPayload({ L0: 400, V0: 700 }, 'None', 0, ['L0', 'V0']) });
  await host.client.request('/api/input/active', { method: 'PUT', body: { active: true } }); await settle(host);
  assert.ok(rig.commands.some(row => row.name === 'LinearCmd' && row.body.DeviceIndex === 0));
  assert.ok(rig.commands.some(row => row.name === 'ScalarCmd' && row.body.DeviceIndex === 1));
  const before = rig.commands.length;
  rig.sockets[0].receive([{ DeviceAdded: { ...scalarDevice(0, 'Replacement'), Id: 0 } }]);
  await host.client.request('/api/input/manual', { method: 'PUT', body: manualCommandPayload({ V0: 800 }, 'None', 0, ['V0']) }); await settle(host);
  assert.ok(rig.commands.slice(before).some(row => row.name === 'ScalarCmd' && row.body.DeviceIndex === 0 && row.body.Scalars[0].Scalar === .8));
  assert.equal(rig.commands.slice(before).some(row => row.name === 'LinearCmd'), false);
  assert.equal(rig.sockets.length, 1); await host.client.dispose();
});

test('browser Bluetooth honors the active mask and maps auxiliary axes without synthetic motion', async () => {
  const writes = [], listeners = new Map();
  const device = { id: 'isolated-ble', addEventListener: (name, callback) => listeners.set(name, callback), removeEventListener: name => listeners.delete(name),
    gatt: { connected: false, async connect() { this.connected = true; return { async getPrimaryServices() { return [{ uuid: '53300001-0023-4bd4-bbd5-a6920e4c5653', async getCharacteristic() { return { properties: { writeWithoutResponse: true }, async writeValueWithoutResponse(bytes) { writes.push(new TextDecoder().decode(bytes)); } }; } }]; } }; }, disconnect() { this.connected = false; listeners.get('gattserverdisconnected')?.(); } } };
  const devices = new BrowserDevices({ navigator: { bluetooth: { requestDevice: async () => device } } });
  const configuration = createDefaultConfiguration(), target = output('Bluetooth', { bridge: { protocol: 'lovense-single', device: '' } }); target.device.axis = 'A2';
  const adapter = await createBrowserOutputFactory(devices, new BrowserRecordingStore())(target, { configuration: () => configuration, canSend: () => true });
  await adapter.connect();
  await adapter.sendMotion({ values: { ...neutralValues(), A2: .5 }, deltaMs: 20, activeAxes: ['L0'] }); assert.deepEqual(writes, []);
  await adapter.sendMotion({ values: { ...neutralValues(), A2: .5 }, deltaMs: 20, activeAxes: ['A2'] }); assert.deepEqual(writes, ['Vibrate:10;']);
  device.gatt.disconnect(); assert.equal(adapter.connected, false);
  await adapter.close(); assert.equal(listeners.size, 0);
});

test('browser MIDI output bindings share a port with independent controllers and close the final owner', async () => {
  const packets = [], events = [];
  const port = { id: 'mock-midi', name: 'Shared MIDI', state: 'connected', async open() { events.push('open'); }, send(bytes) { packets.push([...bytes]); }, async close() { events.push('close'); } };
  const dependencies = { navigator: { requestMIDIAccess: async () => ({ outputs: new Map([[port.id, port]]) }) } };
  const makeMidi = (id, controller) => {
    const target = output('Midi', { id }); target.signal.midiPortName = port.id;
    target.signal.bindings = [{ ...defaultSignalOutputBinding(), id: 'cc', address: 'CC/1/' + controller, outputMax: 127, valueType: 'Int' }]; return target;
  };
  const { host } = await hostWith([makeMidi('a', 10), makeMidi('b', 11)], { dependencies, environment: { navigator: dependencies.navigator } });
  await host.client.request('/api/input/manual', { method: 'PUT', body: manualCommandPayload({ L0: 500 }) });
  await host.client.request('/api/input/active', { method: 'PUT', body: { active: true } }); host.outputs.updateBindings(Date.now(), input => host.runtime.resolveSignalInput(input)); await settle(host);
  assert.ok(packets.some(packet => JSON.stringify(packet) === '[176,10,64]')); assert.ok(packets.some(packet => JSON.stringify(packet) === '[176,11,64]'));
  await host.outputs.disconnect('a'); assert.equal(events.includes('close'), false); assert.deepEqual(packets.at(-1), [176, 10, 0]);
  await host.outputs.disconnect('b'); assert.deepEqual(packets.at(-1), [176, 11, 0]); assert.deepEqual(events.filter(event => event === 'close'), ['close']);
  await host.client.dispose();
});

test('browser Intiface keeps mapped rotation speed when only its twelve-axis direction source changes', async () => {
  const rig = intifaceRig([{ DeviceIndex: 4, DeviceName: 'Rotator', DeviceMessages: { RotateCmd: [{ ActuatorType: 'Rotate' }] } }]);
  const target = output('Intiface', { intifaceDeviceIndex: 4, intifaceFeatures: [{ deviceName: 'Rotator', featureIndex: 0,
    outputType: 'Rotate', sourceAxis: 'V2', directionAxis: 'A2', clockwise: true, invert: true }] });
  const { host } = await hostWith([target], rig);
  await host.client.request('/api/input/manual', { method: 'PUT', body: manualCommandPayload({ V2: 200, A2: 100 }, 'Default', 999, ['V2', 'A2']) });
  await host.client.request('/api/input/active', { method: 'PUT', body: { active: true } }); await settle(host);
  assert.deepEqual(rig.commands.filter(row => row.name === 'RotateCmd').at(-1).body.Rotations, [{ Index: 0, Speed: .8, Clockwise: false }]);
  await host.client.request('/api/input/manual', { method: 'PUT', body: manualCommandPayload({ A2: 900 }, 'Default', 999, ['A2']) }); await settle(host);
  assert.deepEqual(rig.commands.filter(row => row.name === 'RotateCmd').at(-1).body.Rotations, [{ Index: 0, Speed: .8, Clockwise: true }]);
  await host.client.dispose();
});

test('browser Intiface rejects ambiguous name scopes before owning either device', async () => {
  const rig = intifaceRig([positionDevice(1, 'Same name'), positionDevice(2, 'Same name')]);
  const target = output('Intiface', { intifaceDeviceName: 'Same name' });
  const configuration = createDefaultConfiguration(); configuration.outputs = [target];
  const adapter = await createBrowserOutputFactory(new BrowserDevices(rig.dependencies), new BrowserRecordingStore())(target, { configuration: () => configuration, canSend: () => true });
  await assert.rejects(adapter.connect(), /share this name.*specific device index/);
  assert.equal(adapter.connected, false); assert.equal(rig.commands.some(row => ['LinearCmd', 'ScalarCmd', 'RotateCmd'].includes(row.name)), false);
  await adapter.close(); assert.equal(rig.sockets[0].readyState, 3);
});

test('browser Intiface default features use executable L0 inversion and require explicit rotation mapping', async () => {
  const device = positionDevice(0); device.DeviceMessages.LinearCmd.push({ ActuatorType: 'Linear', FeatureDescriptor: 'Second position' });
  device.DeviceMessages.RotateCmd = [{ ActuatorType: 'Rotate' }];
  device.DeviceMessages.ScalarCmd = [{ ActuatorType: 'Vibrate' }, { ActuatorType: 'Oscillate' }];
  const rig = intifaceRig([device]); const { host } = await hostWith([output('Intiface', { vibrationAxis: 'V2' })], rig);
  await host.client.request('/api/input/manual', { method: 'PUT', body: manualCommandPayload({ L0: 250, L1: 600, V2: 800, R0: 900 }, 'Interval', 40, ['L0', 'L1', 'V2', 'R0']) });
  await host.client.request('/api/input/active', { method: 'PUT', body: { active: true } }); await settle(host);
  assert.deepEqual(rig.commands.find(row => row.name === 'LinearCmd').body.Vectors, [{ Index: 0, Position: .75, Duration: 40 }, { Index: 1, Position: .75, Duration: 40 }]);
  assert.deepEqual(rig.commands.find(row => row.name === 'ScalarCmd').body.Scalars, [{ Index: 0, Scalar: .8, ActuatorType: 'Vibrate' }]);
  assert.equal(rig.commands.some(row => row.name === 'RotateCmd'), false);
  await host.client.dispose();
});

test('a live duplicate Intiface name blocks motion but cannot prevent an existing owner from stopping', async () => {
  const rig = intifaceRig([positionDevice(1, 'One name')]);
  const { host } = await hostWith([output('Intiface', { intifaceDeviceName: 'One name' })], rig);
  await host.client.request('/api/input/manual', { method: 'PUT', body: manualCommandPayload({ L0: 250 }, 'Interval', 40, ['L0']) });
  await host.client.request('/api/input/active', { method: 'PUT', body: { active: true } }); await settle(host);
  rig.sockets[0].receive([{ DeviceAdded: { ...positionDevice(2, 'One name'), Id: 0 } }]);
  await host.client.request('/api/input/manual', { method: 'PUT', body: manualCommandPayload({ L0: 400 }, 'Interval', 40, ['L0']) }); await settle(host);
  assert.match(host.outputs.snapshot()[0].lastError, /share this name/);
  assert.equal(rig.commands.some(row => row.name === 'LinearCmd' && row.body.DeviceIndex === 2), false);
  await host.client.request('/api/input/active', { method: 'PUT', body: { active: false } }); await settle(host);
  assert.equal(rig.commands.filter(row => row.name === 'StopDeviceCmd').at(-1).body.DeviceIndex, 1);
  await host.client.dispose();
});

test('browser input setup is ordered across asynchronous recording reads and later configuration', async () => {
  const { host } = await hostWith([]);
  let enterRead, releaseRead;
  const entered = new Promise(resolve => { enterRead = resolve; });
  const content = new Promise(resolve => { releaseRead = resolve; });
  host.facade.services.readRecording = () => { enterRead(); return content; };
  const load = host.client.request('/api/input/script/load-recording', { method: 'POST', body: { fileName: 'slow.funscript' } });
  await entered;
  const configure = host.client.request('/api/input/script/configure', { method: 'PUT', body: { axis: 'A2' } });
  await Promise.resolve(); assert.equal(host.runtime.getScriptSnapshot().loaded, false);
  releaseRead(JSON.stringify({ actions: [{ at: 0, pos: 20 }, { at: 1000, pos: 80 }] }));
  await load; await configure;
  assert.equal(host.runtime.getScriptSnapshot().axis, 'A2'); assert.equal(host.runtime.getSnapshot().inputActive, false);
  await host.client.dispose();
});

test('browser CSV recording reaches the shared replay row ceiling without producing an unloadable extra row', async () => {
  let now = 0; const config = createDefaultConfiguration(), target = output('Recording'); target.signal.recordingFormat = 'Csv';
  const store = new BrowserRecordingStore();
  const adapter = await createBrowserOutputFactory(new BrowserDevices(), store, () => now)(target, { configuration: () => config, canSend: () => true });
  await adapter.connect();
  for (let timestampMs = 0; timestampMs <= 250000; timestampMs++) await adapter.sendSignal({ address: 'stroke', value: .5, timestampMs });
  assert.equal(adapter.snapshot().recordingFull, true);
  now = 250001; await adapter.stop(); const [file] = store.list(), data = store.read(file.fileName);
  assert.equal(data.trimEnd().split('\n').length, 250001);
  assert.equal(data.includes('250000,"stroke"'), false);
  assert.ok(data.trimEnd().split('\n').at(-1).startsWith('249999,'));
  const replay = new SignalReplay(); replay.load(file.fileName, data);
  assert.equal(replay.durationMs, 249999);
  await adapter.close();
});
