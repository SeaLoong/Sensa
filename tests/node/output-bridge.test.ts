import assert from 'node:assert/strict';
import test from 'node:test';
import net from 'node:net';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { BleBridgeAdapter, resolveBridgeScript } from '../../src/node/outputs/bridge.ts';
import { detectNodeCapabilities } from '../../src/node/outputs/capabilities.ts';
import { output, configuration, frame, deferred } from './output-support.ts';
import type { OutputDependencies } from '../../src/core/outputs/types.ts';

function nativeFactories(): OutputDependencies { return { serialFactory: { async list() { throw new Error('Must not enumerate serial ports.'); }, async open() { throw new Error('Must not open serial ports.'); } }, midiFactory: { async list() { throw new Error('Must not enumerate MIDI ports.'); }, async open() { throw new Error('Must not open MIDI ports.'); } } }; }
test('public bridge executable and script fields are rejected before spawn or diagnostic', async () => {
  for (const field of ['python', 'scriptPath']) {
    const config = output('BleBridge'); config.bridge = { protocol: 'loob', device: 'mock', [field]: 'sh' };
    let spawned = 0, diagnostics = 0;
    const dependencies: OutputDependencies = { ...nativeFactories(), bridgeProcessFactory() { spawned++; throw new Error('Must not run a public executable.'); }, async bridgeDiagnostics() { diagnostics++; return { hardwareProbed: false, dependencies: { bleak: true } }; } };
    const adapter = new BleBridgeAdapter(config, dependencies); await assert.rejects(adapter.connect(), /trusted host settings/u);
    const capabilities = await detectNodeCapabilities(configuration([config]), dependencies);
    assert.equal(capabilities.outputs.find(row => row.type === 'BleBridge')?.available, false); assert.equal(spawned, 0); assert.equal(diagnostics, 0);
  }
});
test('bridge diagnostics use trusted installed paths and never enumerate hardware', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'sensa-bridge-'));
  try {
    await mkdir(path.join(directory, 'tools/protocol-bridge'), { recursive: true }); const installed = path.join(directory, 'tools/protocol-bridge/bridge.py'); await writeFile(installed, '# fixture');
    assert.equal(await resolveBridgeScript({ baseDirectory: directory }), installed);
    const calls: { executable: string; args: readonly string[] }[] = [];
    const capabilities = await detectNodeCapabilities(configuration([]), { ...nativeFactories(), baseDirectory: directory, bridgePython: '/trusted/python', async bridgeDiagnostics(executable, args) { calls.push({ executable, args }); return { hardwareProbed: false, dependencies: { bleak: true } }; } });
    assert.deepEqual(calls, [{ executable: '/trusted/python', args: ['-u', installed, '--check'] }]); assert.equal(capabilities.hardwareProbed, false);
    for (const type of ['TCodeSerial', 'Midi', 'BleBridge', 'Bluetooth']) assert.equal(capabilities.outputs.find(row => row.type === type)?.available, true);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
for (const protocol of ['loob', 'thrust-sync', 'svakom-v1', 'lovense-single', 'youou-vx001'] as const) test(`native BLE ${protocol} owns its child and forwards motion and stop to its loopback bridge`, async () => {
  const exited = deferred<number | null>(), lines: string[] = [], received = deferred<void>(); let childStops = 0;
  const server = net.createServer(socket => { let pending = ''; socket.on('data', bytes => { pending += bytes.toString('utf8'); let end: number; while ((end = pending.indexOf('\n')) >= 0) { const line = pending.slice(0, end); pending = pending.slice(end + 1); lines.push(line); if (line === 'DSTOP') { exited.resolve(0); socket.end(); } else received.resolve(); } }); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve)); const address = server.address(); assert.ok(address && typeof address !== 'string');
  const config = output('BleBridge'); const scalar = !['loob', 'thrust-sync'].includes(protocol); config.device.axis = scalar ? 'V0' : 'L0'; config.bridge = { protocol, device: 'test-device', listenPort: address.port };
  const calls: { executable: string; args: readonly string[] }[] = [];
  const adapter = new BleBridgeAdapter(config, { bridgePython: '/trusted/python', bridgeScriptPath: path.resolve('tools/protocol-bridge/bridge.py'), bridgeProcessFactory(executable, args) { calls.push({ executable, args }); return { exited: exited.promise, ready: Promise.resolve(), async stop() { childStops++; exited.resolve(0); } }; } });
  try { await adapter.connect(); assert.equal(adapter.connected, true); await adapter.sendMotion(frame({ L0: .25, V0: .25 }, { deltaMs: 120 })); await received.promise; await adapter.stop();
    assert.equal(lines[0], scalar ? 'V0250' : 'L0250I120'); assert.equal(lines.at(-1), 'DSTOP'); assert.equal(adapter.connected, false); assert.equal(childStops, 1); assert.equal(calls[0]?.executable, '/trusted/python'); assert.ok(calls[0]?.args.includes(protocol));
  } finally { await adapter.close(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
