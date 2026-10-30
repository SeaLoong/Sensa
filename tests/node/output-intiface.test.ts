import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { IntifaceAdapter, IntifacePool } from '../../src/node/outputs/intiface.ts';
import { defaultIntifaceFeatureRoute } from '../../src/core/runtime/configuration-defaults.ts';
import { OutputTelemetry } from '../../src/core/outputs/telemetry.ts';
import { output, frame, FakeSocket, deferred } from './output-support.ts';

function device(index: number, name = 'device', range = [0, 1000]) {
  return { DeviceIndex: index, DeviceName: name, DeviceFeatures: {
    '0': { FeatureIndex: 0, FeatureDescription: 'Position', Output: { HwPositionWithDuration: { Value: range, Duration: [0, 60000] }, Position: { Value: range } } },
    '1': { FeatureIndex: 1, FeatureDescription: 'Vibrate', Output: { Vibrate: { Value: range } } },
    '2': { FeatureIndex: 2, FeatureDescription: 'Rotate', Output: { Rotate: { Value: [-100, 400] } } },
  } };
}
function peer(initial = [device(0)]) {
  let devices = initial, connections = 0;
  const commands: { type: string; body: Record<string, unknown> }[] = [], sockets: FakeSocket[] = [];
  let intercept: ((type: string, body: Record<string, unknown>, socket: FakeSocket) => boolean) | undefined;
  const factory = async (): Promise<FakeSocket> => {
    connections++;
    const socket = new FakeSocket((text, channel) => {
      const rows = JSON.parse(text) as Record<string, Record<string, unknown>>[];
      for (const row of rows) for (const [type, body] of Object.entries(row)) {
        commands.push({ type, body }); if (intercept?.(type, body, channel)) continue;
        const Id = body['Id'];
        if (type === 'RequestServerInfo') channel.emit([{ ServerInfo: { Id, ProtocolVersionMajor: 4, ProtocolVersionMinor: 0, MaxPingTime: 0 } }]);
        else if (type === 'RequestDeviceList') channel.emit([{ DeviceList: { Id, Devices: Object.fromEntries(devices.map(deviceRow => [String(deviceRow.DeviceIndex), deviceRow])) } }]);
        else channel.emit([{ Ok: { Id } }]);
      }
    }); sockets.push(socket); return socket;
  };
  return { factory, commands, sockets, get connections() { return connections; }, setDevices(next: typeof initial) { devices = next; }, intercept(value: typeof intercept) { intercept = value; } };
}
function outputCommands(testPeer: ReturnType<typeof peer>): Record<string, unknown>[] { return testPeer.commands.filter(row => row.type === 'OutputCmd').map(row => row.body); }
function commandValue(command: Record<string, unknown>, type: string): Record<string, unknown> { return (command['Command'] as Record<string, Record<string, unknown>>)[type]!; }

test('native Intiface negotiates wire v4, default position inversion and exact zero vibration', async () => {
  const server = peer(), config = output('Intiface'); const adapter = new IntifaceAdapter(config, { socketFactory: server.factory }); await adapter.connect(); await adapter.sendMotion(frame({ L0: .75, V0: 0 }, { deltaMs: 200 }));
  const commands = outputCommands(server); assert.equal(commands.length, 2); assert.deepEqual(commandValue(commands[0]!, 'HwPositionWithDuration'), { Value: 250, Duration: 200 }); assert.deepEqual(commandValue(commands[1]!, 'Vibrate'), { Value: 0 });
  assert.equal(adapter.devices().length, 1); await adapter.stop(); const stop = server.commands.find(row => row.type === 'StopCmd')!; assert.equal('DeviceIndex' in stop.body, false); assert.equal('FeatureIndex' in stop.body, false); assert.equal(stop.body['Outputs'], true); await adapter.close();
});
test('advertised nonzero minima are scaled as explicit steps', async () => {
  const server = peer([device(0, 'ranged', [20, 100])]), adapter = new IntifaceAdapter(output('Intiface'), { socketFactory: server.factory }); await adapter.connect(); await adapter.sendMotion(frame({ V0: .5 }, { activeAxes: ['V0'] })); assert.deepEqual(commandValue(outputCommands(server)[0]!, 'Vibrate'), { Value: 60 }); await adapter.close();
});
test('explicit raw Position mapping is not swallowed by timed-position default preference', async () => {
  const server = peer(), config = output('Intiface'); config.intifaceFeatures = [{ ...defaultIntifaceFeatureRoute(), featureIndex: 0, outputType: 'Position', sourceAxis: 'R1', invert: true }];
  const adapter = new IntifaceAdapter(config, { socketFactory: server.factory }); await adapter.connect(); await adapter.sendMotion(frame({ R1: .2 }, { activeAxes: ['R1'] })); const commands = outputCommands(server); assert.equal(commands.length, 1); assert.deepEqual(commandValue(commands[0]!, 'Position'), { Value: 800 }); await adapter.close();
});
test('rotation uses the advertised signed range and independently selected direction axis', async () => {
  const server = peer(), config = output('Intiface'); config.intifaceFeatures = [{ ...defaultIntifaceFeatureRoute(), featureIndex: 2, outputType: 'Rotate', sourceAxis: 'V1', directionAxis: 'A0' }];
  const adapter = new IntifaceAdapter(config, { socketFactory: server.factory }); await adapter.connect();
  for (const direction of [1, 0]) await adapter.sendMotion(frame({ V1: .5, A0: direction }, { activeAxes: ['V1', 'A0'] }));
  assert.deepEqual(outputCommands(server).map(command => commandValue(command, 'Rotate')['Value']), [200, -50]); await adapter.close();
});
test('default all-device behavior remains even when feature mappings name only one device', async () => {
  const server = peer([device(0, 'first'), device(1, 'second')]), config = output('Intiface'); config.intifaceFeatures = [{ ...defaultIntifaceFeatureRoute(), deviceName: 'first', featureIndex: 2, outputType: 'Rotate', sourceAxis: 'V1' }];
  const adapter = new IntifaceAdapter(config, { socketFactory: server.factory }); await adapter.connect(); await adapter.sendMotion(frame({ L0: .5, V0: .3, V1: .2 }));
  assert.deepEqual([...new Set(outputCommands(server).map(command => command['DeviceIndex']))], [0, 1]); await adapter.close();
});
test('different explicit devices share one connection and stop only their owned device', async () => {
  const server = peer([device(0, 'first'), device(1, 'second')]), pool = new IntifacePool({ socketFactory: server.factory });
  const a = output('Intiface', 'a'), b = output('Intiface', 'b'); a.intifaceDeviceIndex = 0; a.intifaceDeviceName = 'first'; b.intifaceDeviceIndex = 1; b.intifaceDeviceName = 'second';
  const first = new IntifaceAdapter(a, {}, pool), second = new IntifaceAdapter(b, {}, pool); await Promise.all([first.connect(), second.connect()]); assert.equal(server.connections, 1);
  assert.equal(first.devices().length, 2, 'discovery retains all peer devices');
  await first.sendMotion(frame({ V0: .2 }, { activeAxes: ['V0'] })); await second.sendMotion(frame({ V0: .7 }, { activeAxes: ['V0'] })); await first.stop();
  assert.deepEqual(server.commands.filter(row => row.type === 'StopCmd').map(row => row.body['DeviceIndex']), [0]); await first.close(); assert.equal(second.connected, true); await second.sendMotion(frame({ V0: .8 }, { activeAxes: ['V0'] })); await second.close(); assert.equal(server.sockets[0]?.closeCount, 1);
});
test('default all-device stop remains global even with no advertised devices or named feature overrides', async () => {
  for (const devices of [[], [device(0, 'first'), device(1, 'second')]]) {
    const server = peer(devices), config = output('Intiface'); config.intifaceFeatures = [{ ...defaultIntifaceFeatureRoute(), deviceName: 'first', featureIndex: 0 }];
    server.intercept((type, body, socket) => { if (type !== 'StopCmd') return false; socket.emit(body['DeviceIndex'] === undefined && body['FeatureIndex'] === undefined && body['Outputs'] !== false ? [{ Ok: { Id: body['Id'] } }] : [{ Error: { Id: body['Id'], ErrorCode: 3 } }]); return true; });
    const adapter = new IntifaceAdapter(config, { socketFactory: server.factory }); await adapter.connect(); await adapter.stop(); const stops = server.commands.filter(row => row.type === 'StopCmd'); assert.equal(stops.length, 1); assert.equal(stops[0]?.body['DeviceIndex'], undefined); await adapter.close();
  }
});
test('a matching request id on a different message type cannot falsely acknowledge STOP', async () => {
  const server = peer(), adapter = new IntifaceAdapter(output('Intiface'), { socketFactory: server.factory }); await adapter.connect();
  server.intercept((type, body, socket) => { if (type !== 'StopCmd') return false; socket.emit([{ Ping: { Id: body['Id'] } }]); return true; });
  await assert.rejects(adapter.stop(), /unexpected acknowledgement/u); server.intercept(undefined); await adapter.close();
});
test('default-all scope conflicts with any second explicit controller before motion', async () => {
  const server = peer(), pool = new IntifacePool({ socketFactory: server.factory }), first = new IntifaceAdapter(output('Intiface', 'all'), {}, pool), specific = output('Intiface', 'one'); specific.intifaceDeviceIndex = 0;
  await first.connect(); const second = new IntifaceAdapter(specific, {}, pool); await assert.rejects(second.connect(), /overlaps/u); assert.equal(outputCommands(server).length, 0); assert.equal(first.connected, true); await first.close();
});
test('duplicate device names require an explicit index and distinct indexes can coexist', async () => {
  const server = peer([device(0, 'same'), device(1, 'same')]), ambiguous = output('Intiface'); ambiguous.intifaceDeviceName = 'same'; const bad = new IntifaceAdapter(ambiguous, { socketFactory: server.factory }); await assert.rejects(bad.connect(), /specific device index/u);
  const pool = new IntifacePool({ socketFactory: server.factory }), a = output('Intiface', 'a'), b = output('Intiface', 'b'); a.intifaceDeviceName = b.intifaceDeviceName = 'same'; a.intifaceDeviceIndex = 0; b.intifaceDeviceIndex = 1;
  const first = new IntifaceAdapter(a, {}, pool), second = new IntifaceAdapter(b, {}, pool); await first.connect(); await second.connect(); await first.close(); await second.close();
});
test('an index reused for a different name after reconnect is never silently selected', async () => {
  const server = peer(), config = output('Intiface'); config.intifaceDeviceIndex = 0; config.intifaceDeviceName = 'device'; const adapter = new IntifaceAdapter(config, { socketFactory: server.factory }); await adapter.connect(); await server.sockets[0]?.close(); server.setDevices([device(0, 'different')]); await adapter.connect(); await adapter.sendMotion(frame({ V0: 1 })); assert.equal(outputCommands(server).length, 0); await adapter.close();
});
test('old shared consumers do not revive automatically when another consumer reconnects', async () => {
  const server = peer([device(0, 'a'), device(1, 'b')]), pool = new IntifacePool({ socketFactory: server.factory }), a = output('Intiface', 'a'), b = output('Intiface', 'b'); a.intifaceDeviceIndex = 0; b.intifaceDeviceIndex = 1;
  const first = new IntifaceAdapter(a, {}, pool), second = new IntifaceAdapter(b, {}, pool); await first.connect(); await second.connect(); await server.sockets[0]?.close(); assert.equal(first.connected, false); assert.equal(second.connected, false); await first.connect(); assert.equal(first.connected, true); assert.equal(second.connected, false); await second.connect(); assert.equal(second.connected, true); await first.close(); await second.close();
});
test('a stop arriving during a multi-feature frame discards its remaining commands', async () => {
  const server = peer(), acknowledged = deferred<void>(); let firstCommand: Record<string, unknown> | null = null;
  server.intercept((type, body) => { if (type === 'OutputCmd' && !firstCommand) { firstCommand = body; acknowledged.resolve(); return true; } return false; });
  const adapter = new IntifaceAdapter(output('Intiface'), { socketFactory: server.factory }); await adapter.connect(); const sending = adapter.sendMotion(frame({ L0: .2, V0: .7 })); await acknowledged.promise; const stopping = adapter.stop();
  server.sockets[0]!.emit([{ Ok: { Id: firstCommand!['Id'] } }]); await Promise.all([sending, stopping]); assert.equal(outputCommands(server).length, 1); assert.equal(server.commands.at(-1)?.type, 'StopCmd'); await adapter.close();
});
test('partial initialization failure closes the acquired transport and never reports connected', async () => {
  const socket = new FakeSocket((text, channel) => { const messages = JSON.parse(text) as { RequestServerInfo?: { Id: number } }[]; channel.emit([{ ServerInfo: { Id: messages[0]?.RequestServerInfo?.Id, ProtocolVersionMajor: 3 } }]); });
  const adapter = new IntifaceAdapter(output('Intiface'), { socketFactory: async () => socket }); await assert.rejects(adapter.connect(), /wire v4/u); assert.equal(adapter.connected, false); assert.equal(socket.closeCount, 1);
});
test('malformed protocol envelopes close the session and reject pending requests', async () => {
  const server = peer(), adapter = new IntifaceAdapter(output('Intiface'), { socketFactory: server.factory }); await adapter.connect(); server.sockets[0]!.emit('[{"Bad":{},"Other":{}}]'); assert.equal(adapter.connected, false); assert.equal(server.sockets[0]?.closeCount, 1); await adapter.close();
});
test('Intiface device removal, capability replacement and index reuse clear obsolete accepted targets', async () => {
  const server = peer(), telemetry = new OutputTelemetry(() => 1000), adapter = new IntifaceAdapter(output('Intiface'), { socketFactory: server.factory, telemetry }); await adapter.connect();
  await adapter.sendMotion(frame({ V0: .5 }, { activeAxes: ['V0'] })); assert.equal(telemetry.snapshot().targets.length, 1);
  server.sockets[0]!.emit([{ DeviceRemoved: { Id: 0, DeviceIndex: 0 } }]); assert.deepEqual(telemetry.snapshot().targets, []); assert.equal(telemetry.snapshot().state, 'idle');
  server.sockets[0]!.emit([{ DeviceAdded: { Id: 0, ...device(0) } }]); await adapter.sendMotion(frame({ V0: .6 }, { activeAxes: ['V0'] })); assert.equal(telemetry.snapshot().targets.length, 1);
  server.sockets[0]!.emit([{ DeviceList: { Id: 0, Devices: { '0': device(0, 'device', [10, 100]) } } }]); assert.deepEqual(telemetry.snapshot().targets, []); await adapter.sendMotion(frame({ V0: .6 }, { activeAxes: ['V0'] })); assert.equal(telemetry.snapshot().targets.length, 1);
  const changed = device(0); delete (changed.DeviceFeatures as Partial<typeof changed.DeviceFeatures>)['1']; server.sockets[0]!.emit([{ DeviceList: { Id: 0, Devices: { '0': changed } } }]); assert.deepEqual(telemetry.snapshot().targets, []);
  server.sockets[0]!.emit([{ DeviceAdded: { Id: 0, ...device(0) } }]); await adapter.sendMotion(frame({ V0: .7 }, { activeAxes: ['V0'] })); assert.equal(telemetry.snapshot().targets.length, 1);
  server.sockets[0]!.emit([{ DeviceAdded: { Id: 0, ...device(0, 'replacement device') } }]); assert.deepEqual(telemetry.snapshot().targets, []); await adapter.close();
});
test('concurrent managed Intiface owners start one installed engine and stop it only after the last release', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'sensa-engine-')), server = peer(); let starts = 0, stops = 0;
  try {
    await writeFile(path.join(directory, process.platform === 'win32' ? 'intiface-engine.exe' : 'intiface-engine'), 'fixture');
    const pool = new IntifacePool({ baseDirectory: directory, socketFactory: server.factory, engineProcessFactory() { starts++; return { exited: new Promise(() => {}), async stop() { stops++; } }; } });
    await Promise.all([pool.acquire('ws://127.0.0.1:12345', 'a', true), pool.acquire('ws://127.0.0.1:12345', 'b', true)]);
    assert.equal(starts, 1); assert.equal(server.connections, 1); await pool.release('ws://127.0.0.1:12345', 'a'); assert.equal(stops, 0); await pool.release('ws://127.0.0.1:12345', 'b'); assert.equal(stops, 1);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test('a failed managed engine start releases the owner and allows a clean retry', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'sensa-engine-')), server = peer(); let starts = 0, stops = 0;
  try {
    await writeFile(path.join(directory, process.platform === 'win32' ? 'intiface-engine.exe' : 'intiface-engine'), 'fixture');
    const pool = new IntifacePool({ baseDirectory: directory, socketFactory: server.factory, engineProcessFactory() { if (++starts === 1) throw new Error('fixture start rejected'); return { exited: new Promise(() => {}), async stop() { stops++; } }; } });
    await assert.rejects(pool.acquire('ws://127.0.0.1:12345', 'failed', true), /fixture start rejected/u);
    await pool.acquire('ws://127.0.0.1:12345', 'fresh', true); await pool.release('ws://127.0.0.1:12345', 'fresh');
    assert.equal(starts, 2); assert.equal(stops, 1); assert.equal(server.sockets[0]?.closeCount, 1);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test('an existing engine lease includes shared consumers that did not request process management', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'sensa-engine-')), server = peer(); let stops = 0;
  try {
    await writeFile(path.join(directory, process.platform === 'win32' ? 'intiface-engine.exe' : 'intiface-engine'), 'fixture');
    const pool = new IntifacePool({ baseDirectory: directory, socketFactory: server.factory, engineProcessFactory() { return { exited: new Promise(() => {}), async stop() { stops++; } }; } });
    await pool.acquire('ws://127.0.0.1:12345', 'managed', true); await pool.acquire('ws://127.0.0.1:12345', 'shared'); await pool.release('ws://127.0.0.1:12345', 'managed'); assert.equal(stops, 0); await pool.release('ws://127.0.0.1:12345', 'shared'); assert.equal(stops, 1);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
