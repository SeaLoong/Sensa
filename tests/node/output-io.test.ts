import assert from 'node:assert/strict';
import test from 'node:test';
import dgram from 'node:dgram';
import net from 'node:net';
import http from 'node:http';
import { once } from 'node:events';
import { setImmediate, setTimeout as delay } from 'node:timers/promises';
import { WebSocketServer } from 'ws';
import { TCodeAdapter, SignalAdapter } from '../../src/node/outputs/adapters.ts';
import { nodeSocketFactory, SerialTransport } from '../../src/node/outputs/transports.ts';
import { SharedMidiFactory } from '../../src/node/outputs/midi-pool.ts';
import { IntifaceAdapter } from '../../src/node/outputs/intiface.ts';
import { OutputCoordinator } from '../../src/node/outputs/index.ts';
import { defaultTCodeMotionProfile, defaultIntifaceFeatureRoute } from '../../src/core/runtime/configuration-defaults.ts';
import type { SerialPortHandle, MidiFactory } from '../../src/core/outputs/types.ts';
import { output, frame, deferred, binding, configuration } from './output-support.ts';

async function listen(server: net.Server | http.Server): Promise<number> { server.listen(0, '127.0.0.1'); await once(server, 'listening'); const address = server.address(); if (!address || typeof address === 'string') throw new Error('missing test listener'); return address.port; }
async function close(server: net.Server | http.Server): Promise<void> { if ('closeAllConnections' in server) server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }

test('real loopback UDP TCode datagrams keep framing and whole-device stop', async () => {
  const receiver = dgram.createSocket('udp4'); receiver.bind(0, '127.0.0.1'); await once(receiver, 'listening'); const port = receiver.address().port;
  const config = output('TCodeUdp'); config.host = '127.0.0.1'; config.port = port; const adapter = new TCodeAdapter(config, undefined, { canSend: () => true });
  try { await adapter.connect(); const first = once(receiver, 'message'); await adapter.sendMotion(frame({ L0: .5 }, { activeAxes: ['L0'], requestedCommandMode: 'None' })); assert.equal(String((await first)[0]), 'L0500\n'); const stopped = once(receiver, 'message'); await adapter.stop(); assert.equal(String((await stopped)[0]), 'DSTOP\n'); }
  finally { await adapter.close(); receiver.close(); }
});
test('real loopback TCP output writes complete lines and closes its connection', async () => {
  const lines: string[] = [], received = deferred<void>(); let peer: net.Socket | undefined;
  const server = net.createServer(socket => { peer = socket; let buffer = ''; socket.on('data', value => { buffer += value.toString(); while (buffer.includes('\n')) { const end = buffer.indexOf('\n'); const line = buffer.slice(0, end + 1); buffer = buffer.slice(end + 1); lines.push(line); if (line === 'DSTOP\n') received.resolve(); } }); });
  const port = await listen(server), config = output('TCodeTcp'); config.port = port;
  const adapter = new TCodeAdapter(config, undefined);
  try { await adapter.connect(); await adapter.sendMotion(frame({ L0: .5 }, { activeAxes: ['L0'], requestedCommandMode: 'None' })); await adapter.stop(); await received.promise; assert.deepEqual(lines.slice(0, 2), ['L0500\n', 'DSTOP\n']); }
  finally { await adapter.close(); peer?.destroy(); await close(server); }
});
test('TCP output accepts a bracketed IPv6 host consistently with UDP and configuration ownership', async context => {
  const received = deferred<void>(); let peer: net.Socket | undefined; const server = net.createServer(socket => { peer = socket; socket.on('data', bytes => { if (String(bytes).includes('L0500')) received.resolve(); }); });
  try { server.listen(0, '::1'); await once(server, 'listening'); }
  catch (error) { if (error instanceof Error && 'code' in error && ['EAFNOSUPPORT', 'EADDRNOTAVAIL'].includes(String(error.code))) { context.skip('This test environment does not expose IPv6 loopback.'); return; } throw error; }
  const address = server.address(); assert.ok(address && typeof address !== 'string'); const config = output('TCodeTcp'); config.host = '[::1]'; config.port = address.port; const adapter = new TCodeAdapter(config, undefined);
  try { await adapter.connect(); await adapter.sendMotion(frame({ L0: .5 }, { activeAxes: ['L0'], requestedCommandMode: 'None' })); await received.promise; }
  finally { await adapter.close(); peer?.destroy(); await close(server); }
});
test('real HTTP named-value output preserves integer conversion and content type', async () => {
  const request = deferred<{ body: unknown; type: string | undefined }>();
  const server = http.createServer((req, response) => { let body = ''; req.on('data', value => { body += String(value); }); req.on('end', () => { request.resolve({ body: JSON.parse(body) as unknown, type: req.headers['content-type'] }); response.writeHead(200, { 'content-type': 'application/json' }); response.end('{"ok":true}'); }); });
  const port = await listen(server), config = output('HttpJson'); config.websocketAddress = `http://127.0.0.1:${port}/output`; const adapter = new SignalAdapter(config);
  try { await adapter.connect(); await adapter.sendSignal({ address: 'motor', value: 2.5, type: 'Int' }); const result = await request.promise; assert.equal(result.type, 'application/json'); assert.equal((result.body as { value: number }).value, 3); }
  finally { await adapter.close(); await close(server); }
});
test('the WebSocket channel buffers an early greeting and validates complete fragmented Unicode text', async () => {
  const server = new WebSocketServer({ host: '127.0.0.1', port: 0 }); await once(server, 'listening'); const address = server.address(); assert.ok(typeof address === 'object' && address);
  server.on('connection', socket => { const bytes = Buffer.from('{"name":"设备🎛"}'); const split = bytes.indexOf(Buffer.from('🎛')) + 2; socket.send(bytes.subarray(0, split), { binary: false, fin: false }); socket.send(bytes.subarray(split), { binary: false, fin: true }); });
  const channel = await nodeSocketFactory(`ws://127.0.0.1:${address.port}`, 1000);
  try { await setImmediate(); const messages: string[] = []; channel.onMessage(value => messages.push(value)); await delay(10); assert.deepEqual(messages.map(value => JSON.parse(value) as unknown), [{ name: '设备🎛' }]); }
  finally { await channel.close(); for (const peer of server.clients) peer.terminate(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
for (const invalid of ['binary', 'oversized'] as const) test(`WebSocket ${invalid} inbound data ends the session`, async () => {
  const server = new WebSocketServer({ host: '127.0.0.1', port: 0 }); await once(server, 'listening'); const address = server.address(); assert.ok(typeof address === 'object' && address);
  const connected = deferred<import('ws').default>(); server.on('connection', socket => connected.resolve(socket));
  const channel = await nodeSocketFactory(`ws://127.0.0.1:${address.port}`, 1000), stopped = deferred<void>(); channel.onClose(() => stopped.resolve());
  try { const peer = await connected.promise; if (invalid === 'binary') peer.send(Buffer.from('not JSON'), { binary: true }); else peer.send('x'.repeat(1048577)); await stopped.promise; assert.equal(channel.open, false); }
  finally { await channel.close(); for (const peer of server.clients) peer.terminate(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
test('actual fragmented Intiface device metadata exceeds 2KiB without losing Unicode or feature indexes', async () => {
  const server = new WebSocketServer({ host: '127.0.0.1', port: 0 }); await once(server, 'listening'); const address = server.address(); assert.ok(typeof address === 'object' && address);
  const commands: Record<string, unknown>[] = [];
  server.on('connection', socket => { socket.on('message', bytes => {
    const messages = JSON.parse(bytes.toString()) as Record<string, Record<string, unknown>>[];
    for (const message of messages) for (const [type, body] of Object.entries(message)) {
      const Id = body['Id']; let reply: unknown;
      if (type === 'RequestServerInfo') reply = [{ ServerInfo: { Id, ProtocolVersionMajor: 4, MaxPingTime: 0 } }];
      else if (type === 'RequestDeviceList') reply = [{ DeviceList: { Id, Devices: { '0': { DeviceIndex: 0, DeviceName: '设备🎛', DeviceFeatures: Object.fromEntries(Array.from({ length: 2500 }, (_, index) => [String(index), { FeatureIndex: index, FeatureDescription: 'Rotate', Output: { Rotate: { Value: [-100, 400] } } }])) } } } }];
      else { if (type === 'OutputCmd') commands.push(body); reply = [{ Ok: { Id } }]; }
      const payload = Buffer.from(JSON.stringify(reply)); if (type === 'RequestDeviceList') { const split = payload.indexOf(Buffer.from('🎛')) + 2; socket.send(payload.subarray(0, split), { binary: false, fin: false }); socket.send(payload.subarray(split), { binary: false, fin: true }); } else socket.send(payload, { binary: false });
    }
  }); });
  const config = output('Intiface'); config.websocketAddress = `ws://127.0.0.1:${address.port}`; config.intifaceFeatures = [{ ...defaultIntifaceFeatureRoute(), featureIndex: 2499, outputType: 'Rotate', sourceAxis: 'V0' }];
  const adapter = new IntifaceAdapter(config);
  try { await adapter.connect(); await adapter.sendMotion(frame({ V0: .5 }, { activeAxes: ['V0'] })); assert.equal((adapter.devices()[0] as { name: string }).name, '设备🎛'); assert.equal(commands.length, 1); assert.equal(commands[0]?.['FeatureIndex'], 2499); }
  finally { await adapter.close(); for (const peer of server.clients) peer.terminate(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
test('MQTT clean-session handshake and actual QoS0 publication keep the prefix in topic and JSON payload', async () => {
  const publication = deferred<Buffer>(); let peer: net.Socket | undefined; const server = net.createServer(socket => { peer = socket; socket.on('data', data => { if (data[0] === 0x10) socket.write(Uint8Array.of(0x20, 2, 0, 0)); else if (data[0] === 0x30) publication.resolve(data); }); });
  const port = await listen(server), config = output('Mqtt'); config.port = port; config.signal.mqttTopicPrefix = 'sensa/'; const adapter = new SignalAdapter(config);
  try {
    await adapter.connect(); await adapter.sendSignal({ address: 'motor', value: .4 }); const bytes = await publication.promise;
    let offset = 1; while ((bytes[offset++]! & 128) !== 0) {} const length = bytes.readUInt16BE(offset); const topic = bytes.toString('utf8', offset + 2, offset + 2 + length); const payload = JSON.parse(bytes.toString('utf8', offset + 2 + length)) as { address: string; value: number };
    assert.equal(topic, 'sensa/motor'); assert.equal(payload.address, 'sensa/motor'); assert.ok(Math.abs(payload.value - .4) < .000001); assert.equal(bytes[0], 0x30);
  } finally { await adapter.close(); peer?.destroy(); await close(server); }
});
test('rejected MQTT CONNACK does not leave a connected adapter', async () => {
  let peer: net.Socket | undefined; const server = net.createServer(socket => { peer = socket; socket.once('data', () => socket.write(Uint8Array.of(0x20, 2, 0, 5))); }); const port = await listen(server), config = output('Mqtt'); config.port = port; const adapter = new SignalAdapter(config);
  try { await assert.rejects(adapter.connect()); assert.equal(adapter.connected, false); }
  finally { await adapter.close(); peer?.destroy(); await close(server); }
});
test('serial opening, firmware/version/multiline axes and ordered write/drain are injectable', async () => {
  let listener: ((bytes: Uint8Array) => void) | null = null, opened = 0, closed = 0, drains = 0; const writes: string[] = [];
  const handle: SerialPortHandle = { async write(bytes) { const text = new TextDecoder().decode(bytes); writes.push(text); if (text === 'D0\n') listener?.(Buffer.from('FW v1\n')); else if (text === 'D1\n') listener?.(Buffer.from('v0.3\n')); else if (text === 'D2\n') { listener?.(Buffer.from('L0 Stroke\n')); setTimeout(() => listener?.(Buffer.from('R0 Twist\n')), 2); } }, async drain() { drains++; }, async close() { closed++; }, onData(callback) { listener = callback; return () => { listener = null; }; } };
  const config = output('TCodeSerial'); config.comPort = 'mock-port'; const adapter = new TCodeAdapter(config, defaultTCodeMotionProfile(), { serialFactory: { async list() { return []; }, async open(name, baud) { assert.equal(name, 'mock-port'); assert.equal(baud, 115200); opened++; return handle; } } });
  await adapter.connect(); assert.equal(opened, 1); const info = adapter.devices()[0] as { firmwareVersion: string; tCodeVersion: string; axisDescriptors: string[] }; assert.equal(info.firmwareVersion, 'FW v1'); assert.equal(info.tCodeVersion, 'v0.3'); assert.deepEqual(info.axisDescriptors, ['L0 Stroke', 'R0 Twist']); await adapter.sendMotion(frame({ L0: .5 }, { activeAxes: ['L0'], requestedCommandMode: 'None' })); await adapter.close(); assert.equal(writes.at(-1), 'DSTOP\n'); assert.equal(closed, 1); assert.equal(drains, writes.length);
});
test('a serial native open resolving after its deadline is closed without adoption', async () => {
  const opening = deferred<SerialPortHandle>(); let closed = 0, signal: AbortSignal | undefined;
  const transport = new SerialTransport('mock', { async list() { return []; }, async open(_path, _baud, cancellation) { signal = cancellation; return opening.promise; } }, 10);
  await assert.rejects(transport.connect(), /timed out/u); assert.equal(signal?.aborted, true); opening.resolve({ async write() {}, async drain() {}, async close() { closed++; } }); await setImmediate(); assert.equal(closed, 1); assert.equal(transport.connected, false); await transport.close();
});
test('MIDI port pooling reserves each CC independently and closes only the last holder', async () => {
  let opens = 0, closes = 0; const messages: readonly number[][] = []; const sent = messages as number[][];
  const factory: MidiFactory = { async list() { return ['same port']; }, async open() { opens++; return { async send(bytes) { sent.push([...bytes]); }, async close() { closes++; } }; } };
  const pool = new SharedMidiFactory(factory), first = await pool.open('0'), second = await pool.open('same port'); first.claim?.([Uint8Array.of(0xb0, 1, 0)]); second.claim?.([Uint8Array.of(0xb0, 2, 0)]);
  await first.send([0xb0, 1, 40]); await second.send([0xb0, 2, 50]); assert.equal(opens, 1); await assert.rejects(second.send([0xb0, 1, 20]), /already owned/u); await first.close(); assert.equal(closes, 0); await second.send([0xb0, 2, 0]); await second.close(); assert.equal(closes, 1); assert.deepEqual(sent, [[0xb0, 1, 40], [0xb0, 2, 50], [0xb0, 2, 0]]);
});
test('changing MIDI bindings releases obsolete controller ownership without reopening another shared output', async () => {
  let opens = 0, closes = 0;
  const factory: MidiFactory = { async list() { return ['shared']; }, async open() { opens++; return { async send() {}, async close() { closes++; } }; } };
  const first = output('Midi', 'first'), second = output('Midi', 'second'); first.signal.midiPortName = second.signal.midiPortName = '0'; first.signal.bindings = [binding('a', 'CC/1/1')]; second.signal.bindings = [binding('b', 'CC/1/2')];
  const coordinator = new OutputCoordinator(configuration([first, second]), { midiFactory: factory }); await coordinator.connectEnabled();
  const moved = { ...first, signal: { ...first.signal, bindings: [binding('a', 'CC/1/3')] } }; await coordinator.reconfigure(configuration([moved, second]));
  const reused = { ...second, signal: { ...second.signal, bindings: [binding('b', 'CC/1/1')] } }; await coordinator.reconfigure(configuration([moved, reused]));
  assert.equal(coordinator.isConnected('first'), true); assert.equal(coordinator.isConnected('second'), true); assert.equal(opens, 1); assert.equal(closes, 0); await coordinator.close(); assert.equal(closes, 1);
});
