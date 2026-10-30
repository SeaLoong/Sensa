import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createSocket } from 'node:dgram';
import { createConnection } from 'node:net';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { startSensa } from '../../src/node/host/start.ts';
import { normalizeConfiguration } from '../../src/core/runtime/configuration.ts';
import { defaultOutputDeviceConfig, defaultSignalOutputBinding } from '../../src/core/runtime/configuration-defaults.ts';
import { defaultProtocolInput } from '../../src/core/protocols/input-types.ts';
import { parseFunscript } from '../../src/core/funscript.ts';
import { record } from '../../src/core/runtime/application.ts';
import type { OutputDeviceConfig } from '../../src/core/runtime/model.ts';

/** Actual host/core/adapters in one process; only isolated loopback peers replace devices. */
async function fixture(t: TestContext, outputs: OutputDeviceConfig[], protocol = false) {
  const directory = await mkdtemp(join(tmpdir(), 'sensa-host-integration-'));
  const configPath = join(directory, 'config.json'), recordings = join(directory, 'recordings');
  let clock = 10_000;
  await writeFile(configPath, JSON.stringify({ webUi: { host: '127.0.0.1', port: 0 },
    osc: { enabled: false, oscQueryEnabled: false }, signals: [], computedSignals: [], outputs,
    protocolInputs: protocol ? [{ ...defaultProtocolInput('source'), type: 'TCodeTcp', enabled: true, port: 0, timeoutMs: 1000 }] : [] }));
  const host = await startSensa({ configPath, port: 0, openBrowser: false, coordinateInstances: false,
    privateDirectory: join(directory, 'ipc'), recordingDirectory: recordings, now: () => clock,
    resourceReader: () => undefined,
    outputDependencies: { serialFactory: { list: async () => [], open: async () => { throw new Error('No hardware in integration units.'); } },
      midiFactory: { list: async () => [], open: async () => { throw new Error('No hardware in integration units.'); } },
      bridgeDiagnostics: async () => ({ hardwareProbed: false, dependencies: { bleak: false } }) } });
  t.after(async () => { await host.close(); await rm(directory, { recursive: true, force: true }); });
  const bootstrap = await fetch(host.url + '/api/session'); assert.equal(bootstrap.status, 204);
  const cookie = bootstrap.headers.get('set-cookie')!.split(';')[0]!;
  const call = (path: string, method = 'GET', body?: unknown) => fetch(host.url + path, { method,
    headers: { Cookie: cookie, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const command = async (path: string, method: string, body?: unknown) => {
    const response = await call(path, method, body); assert.equal(response.status, 200, await response.text());
  };
  // The real launch contract disarms saved outputs. Enable through the durable API transaction.
  const config = normalizeConfiguration(await (await call('/api/config')).json());
  for (const output of config.outputs) output.enabled = true;
  await command('/api/config', 'PUT', config);
  return { host, call, command, cookie, recordings, advance: (ms: number) => { clock += ms; } };
}
async function until(predicate: () => boolean | Promise<boolean>, message: string): Promise<void> {
  const deadline = Date.now() + 2500;
  do { if (await predicate()) return; await delay(5); } while (Date.now() < deadline);
  assert.fail(message);
}
async function udpPeer(t: TestContext) {
  const socket = createSocket('udp4'), packets: string[] = [];
  socket.on('message', bytes => packets.push(bytes.toString('ascii')));
  await new Promise<void>((resolve, reject) => { socket.once('error', reject); socket.bind(0, '127.0.0.1', resolve); });
  t.after(() => { socket.close(); });
  return { port: socket.address().port, packets };
}
function udpOutput(port: number): OutputDeviceConfig {
  return { ...defaultOutputDeviceConfig(), id: 'destination', name: 'Loopback device', type: 'TCodeUdp', port, enabled: false };
}
async function protocolSocket(t: TestContext, port: number) {
  const socket = createConnection({ host: '127.0.0.1', port });
  t.after(() => socket.destroy());
  await new Promise<void>((resolve, reject) => { socket.once('connect', resolve); socket.once('error', reject); });
  return socket;
}

test('TCode TCP input traverses the real host to UDP and disconnect emits DSTOP', async t => {
  const peer = await udpPeer(t), { call, command, host } = await fixture(t, [udpOutput(peer.port)], true);
  await command('/api/input/mode', 'PUT', { mode: 'Protocol' });
  await command('/api/input/active', 'PUT', { active: true });
  const config = normalizeConfiguration(await (await call('/api/config')).json());
  const socket = await protocolSocket(t, config.protocolInputs[0]!.port);
  const start = peer.packets.length;
  socket.write('L0730I40\n');
  await until(() => peer.packets.slice(start).includes('L0729I40\n'), 'The TCP command never reached the actual UDP destination.');
  const received = peer.packets.length;
  socket.destroy();
  await until(() => peer.packets.slice(received).includes('DSTOP\n'), 'Disconnect did not stop the actual output.');
  const beforeShutdown = peer.packets.length; await host.close();
  await until(() => peer.packets.slice(beforeShutdown).includes('DSTOP\n'), 'Host shutdown did not send the physical stop command.');
  const stopped = peer.packets.length; await delay(40);
  assert.ok(peer.packets.slice(stopped).every(packet => packet === 'DSTOP\n'), 'Shutdown must not revive a retired motion frame.');
});

test('a protocol lease expires in the host scheduler and a replacement socket can drive again', async t => {
  const peer = await udpPeer(t), { call, command, advance } = await fixture(t, [udpOutput(peer.port)], true);
  await command('/api/input/mode', 'PUT', { mode: 'Protocol' }); await command('/api/input/active', 'PUT', { active: true });
  const config = normalizeConfiguration(await (await call('/api/config')).json());
  const first = await protocolSocket(t, config.protocolInputs[0]!.port);
  first.write('L0250\n'); await until(() => peer.packets.includes('L0250\n'), 'Initial lease did not deliver a frame.');
  const beforeExpiry = peer.packets.length; advance(1001);
  await until(() => peer.packets.slice(beforeExpiry).includes('DSTOP\n'), 'Expired lease did not emit an actual stop.');
  first.destroy();
  const replacement = await protocolSocket(t, config.protocolInputs[0]!.port);
  replacement.write('L0900\n');
  await until(() => peer.packets.slice(beforeExpiry).includes('L0899\n'), 'Expired ownership blocked the replacement socket.');
});

test('manual HTTP commands reach UDP and concurrent late commands cannot cross the emergency stop', async t => {
  const peer = await udpPeer(t), { command } = await fixture(t, [udpOutput(peer.port)]);
  await command('/api/input/manual', 'PUT', { Enabled: true, L0: 250, axes: ['L0'], motionMode: 'None' });
  await command('/api/input/active', 'PUT', { active: true });
  await until(() => peer.packets.includes('L0250\n'), 'Manual HTTP target did not reach the UDP device.');
  const start = peer.packets.length;
  const pending = [400, 650, 900].map(L0 => command('/api/input/manual', 'PUT', { enabled: true, L0, axes: ['L0'], motionMode: 'None' }));
  await command('/api/control/runtime/emergency-stop', 'POST'); await Promise.all(pending);
  await until(() => peer.packets.slice(start).includes('DSTOP\n'), 'Emergency stop did not reach the UDP device.');
  const fence = peer.packets.findIndex((packet, index) => index >= start && packet === 'DSTOP\n');
  await command('/api/input/manual', 'PUT', { enabled: true, L0: 999, axes: ['L0'], motionMode: 'None' });
  await command('/api/input/active', 'PUT', { active: true });
  // Also cross the UDP adapter's one-second refresh interval.
  await delay(1100);
  assert.ok(peer.packets.slice(fence + 1).every(packet => packet === 'DSTOP\n'), 'A queued or post-stop command moved the device while emergency remained latched.');
});

test('multipart playback records real signal samples and serves matching GET, HEAD and byte ranges', async t => {
  const output = { ...defaultOutputDeviceConfig(), id: 'capture', name: 'Capture', type: 'Recording' as const };
  output.signal.bindings = [{ ...defaultSignalOutputBinding(), id: 'script-depth', address: 'L0',
    source: { ...defaultSignalOutputBinding().source, sourceMode: 'Script', oscPath: 'L0' }, rateHz: 100 }];
  const { host, call, command, cookie, recordings, advance } = await fixture(t, [output]);
  const form = new FormData();
  form.append('file', new Blob([JSON.stringify({ actions: [{ at: 0, pos: 20 }, { at: 800, pos: 68 }, { at: 1200, pos: 68 }] })], { type: 'application/json' }), 'ascending.funscript');
  const loaded = await fetch(host.url + '/api/input/script/load', { method: 'POST', headers: { Cookie: cookie }, body: form });
  assert.equal(loaded.status, 200, await loaded.text());
  await command('/api/input/active', 'PUT', { active: true }); await command('/api/input/script/play', 'POST', { restart: true });
  // Let each host scheduling turn record its own sample at a deterministic monotonic time.
  await delay(25); advance(400); await delay(25); advance(400); await delay(25);
  advance(200); await delay(25);
  await command('/api/input/script/pause', 'POST');
  await command('/api/input/active', 'PUT', { active: false });
  await until(async () => (await readdir(recordings)).some(name => name.endsWith('.funscript')), 'Recording adapter never published its actual file.');
  const files = (await readdir(recordings)).filter(name => name.endsWith('.funscript'));
  assert.equal(files.length, 1, 'One uninterrupted signal should create one segment.');
  const filename = files[0]!, disk = await readFile(join(recordings, filename));
  const parsed = parseFunscript(disk.toString('utf8'));
  assert.equal(parsed.actions[0]!.pos, 20); assert.equal(parsed.actions.at(-1)!.pos, 68);
  assert.ok(parsed.actions.some(action => action.pos === 44), 'The midpoint must come from script interpolation, not a fabricated endpoint.');
  assert.ok(parsed.actions.every((action, index) => index === 0 || action.pos >= parsed.actions[index - 1]!.pos), 'Recording reversed the source direction.');
  assert.equal(parsed.durationMs, 1000);
  assert.deepEqual(parsed.actions.slice(-2), [{ at: 800, pos: 68 }, { at: 1000, pos: 68 }], 'Stopping must preserve the duration of the final held value.');
  const address = '/api/output/recordings/' + encodeURIComponent(filename) + '/download';
  const get = await call(address); assert.equal(get.status, 200); assert.deepEqual(Buffer.from(await get.arrayBuffer()), disk);
  const head = await fetch(host.url + address, { method: 'HEAD', headers: { Cookie: cookie } });
  assert.equal(head.status, 200); assert.equal(head.headers.get('content-length'), String(disk.length)); assert.equal(await head.text(), '');
  const range = await fetch(host.url + address, { headers: { Cookie: cookie, Range: 'bytes=0-31' } });
  assert.equal(range.status, 206); assert.equal(range.headers.get('content-range'), `bytes 0-31/${disk.length}`); assert.deepEqual(Buffer.from(await range.arrayBuffer()), disk.subarray(0, 32));
  const inventory: unknown = await (await call('/api/output/recordings')).json();
  assert.ok(Array.isArray(inventory) && inventory.some((row: unknown) => record(row)['fileName'] === filename));
});
