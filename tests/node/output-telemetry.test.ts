import assert from 'node:assert/strict';
import test from 'node:test';
import { once } from 'node:events';
import { WebSocketServer } from 'ws';
import { OutputCoordinator as SharedCoordinator } from '../../src/core/outputs/coordinator.ts';
import { OutputCoordinator } from '../../src/node/outputs/index.ts';
import { OutputTelemetry } from '../../src/core/outputs/telemetry.ts';
import { TCodeAdapter } from '../../src/node/outputs/adapters.ts';
import { sample } from '../../src/core/runtime/model.ts';
import type { OutputTarget } from '../../src/core/outputs/telemetry.ts';
import { output, configuration, frame, binding, deferred, MemoryAdapter } from './output-support.ts';

interface View { connected: boolean; lastError: string | null; telemetry: { state: string; lastSentAtUtc: string | null; targets: OutputTarget[]; requestedTargets: OutputTarget[]; sendCount: number } }
function view(coordinator: SharedCoordinator): View { return coordinator.snapshot()[0] as View; }
test('motion telemetry reports actual accepted encoding after completion and confirms stop only after its acknowledgement', async () => {
  let now = 1000, active = true; const written = deferred<void>(), began = deferred<void>(), stopped = deferred<void>(), stopping = deferred<void>();
  const coordinator = new SharedCoordinator(configuration([output('TCodeTcp')]), { now: () => now, canSend: () => active, createAdapter(_config, context) {
    const adapter = new MemoryAdapter(); adapter.sendMotion = async () => { began.resolve(); await written.promise; context.telemetry?.recordTCode('L0600I100'); }; adapter.stop = async () => { stopping.resolve(); await stopped.promise; }; return adapter;
  } });
  await coordinator.connectEnabled(); await coordinator.sendFrame(frame({ L0: 1 }, { activeAxes: ['L0'] })); await began.promise;
  assert.equal(view(coordinator).telemetry.state, 'idle'); assert.deepEqual(view(coordinator).telemetry.targets, []); assert.equal(view(coordinator).telemetry.requestedTargets[0]?.value, 1);
  now = 2000; written.resolve(); await coordinator.flush(); assert.deepEqual(view(coordinator).telemetry.targets, [{ key: 'L0', label: 'L0', value: 600, maximum: 999 }]); assert.equal(view(coordinator).telemetry.lastSentAtUtc, '1970-01-01T00:00:02.000Z');
  active = false; const stop = coordinator.emergencyStop(); await stopping.promise; assert.equal(view(coordinator).telemetry.state, 'sent'); stopped.resolve(); await stop; assert.equal(view(coordinator).telemetry.state, 'stopped'); assert.deepEqual(view(coordinator).telemetry.targets, []); assert.deepEqual(view(coordinator).telemetry.requestedTargets, []); assert.equal(view(coordinator).telemetry.lastSentAtUtc, null); await coordinator.close();
});
test('an unconfirmed motion adapter keeps requests separate from accepted target telemetry', async () => {
  const coordinator = new SharedCoordinator(configuration([output('SensaHttp')]), { createAdapter: () => new MemoryAdapter(), canSend: () => true }); await coordinator.connectEnabled(); await coordinator.sendFrame(frame({ A2: .7 }, { activeAxes: ['A2'] })); await coordinator.flush();
  assert.equal(view(coordinator).telemetry.state, 'idle'); assert.equal(view(coordinator).telemetry.sendCount, 0); assert.deepEqual(view(coordinator).telemetry.targets, []); assert.deepEqual(view(coordinator).telemetry.requestedTargets, [{ key: 'A2', label: 'A2', value: .7, maximum: 1 }]); await coordinator.close();
});
test('failed stop remains error with its last accepted target and never claims stopped', async () => {
  const coordinator = new SharedCoordinator(configuration([output('TCodeTcp')]), { canSend: () => true, createAdapter(_config, context) { const adapter = new MemoryAdapter(); adapter.sendMotion = async () => { context.telemetry?.recordTCode('L0500'); }; adapter.stop = async () => { throw new Error('stop was not acknowledged'); }; return adapter; } });
  await coordinator.connectEnabled(); await coordinator.sendFrame(frame()); await coordinator.flush(); await coordinator.emergencyStop(); assert.equal(view(coordinator).telemetry.state, 'error'); assert.equal(view(coordinator).telemetry.targets[0]?.value, 500); assert.match(view(coordinator).lastError ?? '', /not acknowledged/u); await coordinator.close();
});
test('named signal telemetry records typed values only after the adapter accepted the operation', async () => {
  const config = output('HttpJson'), route = binding('motor', 'throttle'); route.valueType = 'Int'; route.outputMax = 10; config.signal.bindings = [route]; const written = deferred<void>(), began = deferred<void>(), adapter = new MemoryAdapter();
  adapter.sendSignal = async () => { began.resolve(); await written.promise; };
  const coordinator = new SharedCoordinator(configuration([config]), { now: () => 3000, canSend: () => true, createAdapter: () => adapter }); await coordinator.connectEnabled(); coordinator.updateBindings(3000, () => sample(.25, 3000)); await began.promise; assert.deepEqual(view(coordinator).telemetry.targets, []); written.resolve(); await coordinator.flush();
  assert.deepEqual(view(coordinator).telemetry.targets, [{ key: 'throttle', label: route.name || 'throttle', value: 3, maximum: 10 }]); assert.equal(view(coordinator).telemetry.lastSentAtUtc, '1970-01-01T00:00:03.000Z'); await coordinator.close();
});
test('TCode telemetry preserves successful profile-mapped wire targets and ignores failed or suppressed writes', async () => {
  const config = output('TCodeTcp'), app = configuration([config]), profile = app.axisProfiles[0]!.motion; profile.l0.min = 400; profile.l0.max = 600; profile.l0.remapMin = 400; profile.l0.remapMax = 600; profile.l0.commandMode = 'None'; let now = 1000, connected = false, fail = false; const writes: string[] = [], telemetry = new OutputTelemetry(() => now);
  for (const [axis, settings] of Object.entries(profile)) if (axis !== 'l0' && typeof settings === 'object') settings.mode = 'Ignored';
  const adapter = new TCodeAdapter(config, profile, { telemetry }, { get connected() { return connected; }, async connect() { connected = true; }, async send(bytes) { if (fail) throw new Error('write rejected'); writes.push(new TextDecoder().decode(bytes)); }, async close() { connected = false; } });
  await adapter.connect(); await adapter.sendMotion(frame({ L0: 1 }, { activeAxes: ['L0'] })); assert.equal(writes.at(-1), 'L0600\n'); assert.deepEqual(telemetry.snapshot().targets, [{ key: 'L0', label: 'L0', value: 600, maximum: 999 }]);
  now = 2000; await adapter.sendMotion(frame({ L0: 1 }, { activeAxes: ['L0'] })); assert.equal(telemetry.snapshot().lastSentAtUtc, '1970-01-01T00:00:02.000Z'); now = 2500; const count = writes.length; await adapter.sendMotion(frame({ L0: 1 })); assert.equal(writes.length, count); assert.equal(telemetry.snapshot().lastSentAtUtc, '1970-01-01T00:00:02.000Z'); now = 3000; fail = true; await assert.rejects(adapter.sendMotion(frame({ L0: 0 }, { activeAxes: ['L0'] })), /write rejected/u); assert.equal(telemetry.snapshot().targets[0]?.value, 600); assert.equal(telemetry.snapshot().lastSentAtUtc, '1970-01-01T00:00:02.000Z'); fail = false; await adapter.close();
});
test('telemetry target retention is bounded and removing a device never leaves stale targets or hides an error', () => {
  const telemetry = new OutputTelemetry(() => 1000); for (let index = 0; index < 5000; index++) telemetry.recordTarget(`#${index}/Feature0/Vibrate`, 'vibration', index % 101);
  assert.equal(telemetry.snapshot().targets.length, 4096); telemetry.retainTargets(new Set(['#4999/Feature0/Vibrate'])); assert.equal(telemetry.snapshot().targets.length, 1); telemetry.setState('error'); telemetry.removePrefix('#4999/'); assert.equal(telemetry.snapshot().state, 'error'); assert.deepEqual(telemetry.snapshot().targets, []); assert.equal(telemetry.snapshot().lastSentAtUtc, null);
});
test('actual Intiface v4 wire reaches strict all-device STOP after manual disable and publishes acknowledged feature telemetry', async () => {
  const server = new WebSocketServer({ host: '127.0.0.1', port: 0 }); await once(server, 'listening'); const address = server.address(); assert.ok(address && typeof address !== 'string'); let stopCount = 0;
  server.on('connection', socket => socket.on('message', bytes => {
    for (const row of JSON.parse(String(bytes)) as Record<string, Record<string, unknown>>[]) for (const [name, body] of Object.entries(row)) {
      const response = name === 'RequestServerInfo' ? { ServerInfo: { Id: body['Id'], ProtocolVersionMajor: 4, ProtocolVersionMinor: 0 } } : name === 'RequestDeviceList' ? { DeviceList: { Id: body['Id'], Devices: { '0': { DeviceIndex: 0, DeviceName: 'CI device', DeviceFeatures: { '0': { FeatureIndex: 0, Output: { HwPositionWithDuration: { Value: [20, 100], Duration: [0, 60000] } } } } } } } } : name === 'OutputCmd' ? { Ok: { Id: body['Id'] } } : name === 'StopCmd' && body['DeviceIndex'] === undefined && body['FeatureIndex'] === undefined && body['Outputs'] !== false ? (++stopCount, { Ok: { Id: body['Id'] } }) : { Error: { Id: body['Id'], ErrorCode: 3 } };
      socket.send(JSON.stringify([response]));
    }
  }));
  let active = true; const target = output('Intiface'); target.websocketAddress = `ws://127.0.0.1:${address.port}`; const coordinator = new OutputCoordinator(configuration([target]), { canSend: () => active, now: () => 5000 });
  try { await coordinator.connectEnabled(); await coordinator.sendFrame(frame({ L0: .75 }, { activeAxes: ['L0'] })); await coordinator.flush(); assert.equal(view(coordinator).telemetry.state, 'sent'); assert.equal(view(coordinator).telemetry.targets[0]?.value, 25); assert.equal(view(coordinator).telemetry.targets[0]?.maximum, 100); assert.equal(view(coordinator).telemetry.lastSentAtUtc, '1970-01-01T00:00:05.000Z');
    active = false; await coordinator.emergencyStop(); assert.equal(stopCount, 1); assert.equal(view(coordinator).lastError, null); assert.equal(view(coordinator).telemetry.state, 'stopped'); assert.deepEqual(view(coordinator).telemetry.targets, []);
  } finally { await coordinator.close(); for (const socket of server.clients) socket.terminate(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
