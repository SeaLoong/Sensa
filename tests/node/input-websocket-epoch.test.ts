import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { createConnection } from 'node:net';
import { createHash } from 'node:crypto';
import { WebSocket, WebSocketServer } from 'ws';
import { WebSocketMessageEpochs } from '../../src/node/inputs/websocket-epoch.ts';
import { createInputCoordinator } from '../../src/node/inputs/coordinator.ts';
import { ExternalControlStore } from '../../src/core/protocols/external-control.ts';
import { defaultProtocolInput } from '../../src/core/protocols/input-types.ts';
import { OscParameterStore } from '../../src/core/protocols/osc.ts';
function frame(opcode: number, size: number, final = true, masked = true): Uint8Array {
  const extra = size < 126 ? 0 : size <= 65535 ? 2 : 8, header = 2 + extra + (masked ? 4 : 0), result = new Uint8Array(header + size);
  result[0] = opcode | (final ? 128 : 0); result[1] = (size < 126 ? size : extra === 2 ? 126 : 127) | (masked ? 128 : 0);
  const view = new DataView(result.buffer); if (extra === 2) view.setUint16(2, size); if (extra === 8) view.setBigUint64(2, BigInt(size)); return result;
}
function textFrame(opcode: number, text: string, final = true, masked = true): Uint8Array {
  const body = Buffer.from(text), packet = frame(opcode, body.length, final, masked); packet.set(body, packet.length - body.length); return packet;
}
async function until(check: () => boolean): Promise<void> { const end = Date.now() + 1500; while (!check()) { if (Date.now() > end) throw new Error('Raw upgrade observation did not arrive.'); await new Promise(resolve => setTimeout(resolve, 5)); } }
const key = 'MDEyMzQ1Njc4OWFiY2RlZg==';
function upgradeRequest(path: string): Buffer { return Buffer.from(`GET ${path} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: ${key}\r\n\r\n`); }
test('server upgrade head accepts a complete valid first frame sent in the handshake TCP write', async () => {
  const config = { ...defaultProtocolInput('input'), type: 'TCodeWebSocket' as const, enabled: true, routeToMotion: false, port: 0 }, external = new ExternalControlStore([config]), coordinator = await createInputCoordinator([config], { external, osc: new OscParameterStore() });
  const socket = createConnection({ host: '127.0.0.1', port: coordinator.snapshot()[0]?.port ?? 0 }); let received = Buffer.alloc(0);
  socket.on('data', chunk => { received = Buffer.concat([received, chunk]); });
  try { await once(socket, 'connect'); socket.write(Buffer.concat([upgradeRequest('/'), textFrame(1, 'L04200 D1\n')]));
    await until(() => received.includes('TCode v0.3')); assert.equal(external.read('input/L0').value, .42); assert.match(received.toString(), /101 Switching Protocols/);
  } finally { socket.destroy(); await coordinator.dispose(); }
});
test('a partial frame header in HTTP upgrade head retains its pre-clear generation', async () => {
  const server = createServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening'); const address = server.address(); assert.ok(address && typeof address !== 'string');
  const config = { ...defaultProtocolInput('input'), type: 'TCodeWebSocket' as const, enabled: true, routeToMotion: false, port: address.port, path: '/tcode' }, external = new ExternalControlStore([config]);
  const coordinator = await createInputCoordinator([config], { external, osc: new OscParameterStore(), sharedServer: { server, host: '127.0.0.1', port: address.port } });
  server.on('upgrade', (request, stream, head) => {
    assert.equal(head.length, 1);
    stream.once('data', () => { external.clearCommands(); stream.write(textFrame(1, 'clear-observed', true, false)); });
    assert.equal(coordinator.handleUpgrade(request, stream, head), true);
  });
  const socket = createConnection({ host: '127.0.0.1', port: address.port }); let received = Buffer.alloc(0); socket.on('data', chunk => { received = Buffer.concat([received, chunk]); });
  try { await once(socket, 'connect'); const packet = textFrame(1, 'L07500\n'); socket.write(Buffer.concat([upgradeRequest('/tcode'), packet.subarray(0, 1)]));
    await until(() => received.includes('clear-observed')); socket.write(packet.subarray(1)); const closed = once(socket, 'close'); socket.resume(); await closed; assert.equal(external.read('input/L0').valid, false);
  } finally { socket.destroy(); await coordinator.dispose(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
test('WSDM handles a complete hardware frame coalesced with the HTTP upgrade response', async () => {
  const server = createServer(); const peers = new Set<import('node:net').Socket>();
  server.on('upgrade', (request, socket) => {
    peers.add(socket as import('node:net').Socket); socket.on('error', () => socket.destroy());
    const accept = createHash('sha1').update((request.headers['sec-websocket-key'] ?? '') + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    socket.write(Buffer.concat([Buffer.from(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`), textFrame(2, 'L06100\n', true, false)]));
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); const address = server.address(); assert.ok(address && typeof address !== 'string');
  const config = { ...defaultProtocolInput('input'), type: 'IntifaceDevice' as const, enabled: true, routeToMotion: false, address: `ws://127.0.0.1:${address.port}` }, external = new ExternalControlStore([config]);
  let coordinator: Awaited<ReturnType<typeof createInputCoordinator>> | undefined;
  try { coordinator = await createInputCoordinator([config], { external, osc: new OscParameterStore() }); await until(() => external.read('input/L0').value === .61); }
  finally { await coordinator?.dispose(); for (const peer of peers) peer.destroy(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
test('RFC frame epoch remembers a first header byte that predates stop, including split extended headers', () => {
  for (const size of [0, 125, 126, 4096, 65536]) {
    let generation = 1; const tracker = new WebSocketMessageEpochs(() => generation), packet = frame(1, size);
    tracker.push(packet.subarray(0, 1)); generation = 2;
    for (let at = 1; at < packet.length; at += 17) assert.equal(tracker.push(packet.subarray(at, at + 17)), true);
    assert.equal(tracker.take(), 1); assert.equal(tracker.take(), undefined);
  }
});
test('RFC continuation frames keep the original message epoch across controls and generation changes', () => {
  let generation = 10; const tracker = new WebSocketMessageEpochs(() => generation);
  tracker.push(frame(2, 8, false, false)); generation = 11; tracker.push(frame(9, 3, true, false)); tracker.push(frame(0, 5, true, false));
  assert.equal(tracker.take(), 10); tracker.push(frame(1, 5)); assert.equal(tracker.take(), 11); assert.equal(tracker.take(), undefined);
});
test('RFC observer bounds aggregate fragments, 64-bit lengths and queued empty messages', () => {
  const tracker = new WebSocketMessageEpochs(() => 0, 16); assert.equal(tracker.push(frame(1, 10, false)), true); assert.equal(tracker.push(frame(0, 10)), false);
  assert.equal(new WebSocketMessageEpochs(() => 0).push(frame(1, 65537)), false);
  const flood = new WebSocketMessageEpochs(() => 0); for (let i = 0; i < 1024; i++) assert.equal(flood.push(frame(1, 0)), true); assert.equal(flood.push(frame(1, 0)), false);
});
for (const type of ['TCodeWebSocket', 'JsonWebSocket'] as const) test(`${type} rejects a pre-stop real fragmented message after stop without accepting stale targets`, async () => {
  const config = { ...defaultProtocolInput('input'), type, enabled: true, routeToMotion: false, port: 0 }, external = new ExternalControlStore([config]), coordinator = await createInputCoordinator([config], { external, osc: new OscParameterStore() });
  const socket = new WebSocket(`ws://127.0.0.1:${coordinator.snapshot()[0]?.port}`);
  try {
    await once(socket, 'open'); const prefix = type === 'TCodeWebSocket' ? 'L04' : '{"channel":"L0","value":0.';
    await new Promise<void>((resolve, reject) => socket.send(prefix, { fin: false }, error => error ? reject(error) : resolve()));
    const pong = once(socket, 'pong'); socket.ping('ingress-barrier'); await pong;
    external.clearCommands(); const closed = once(socket, 'close'); socket.send(type === 'TCodeWebSocket' ? '500\n' : '75}', { fin: true });
    const [code] = await closed; assert.equal(code, 1007); assert.equal(external.read('input/L0').valid, false);
  } finally { socket.terminate(); await coordinator.dispose(); }
});
test('idle TCode WebSocket survives clear and accepts genuinely post-stop messages', async () => {
  const config = { ...defaultProtocolInput('input'), type: 'TCodeWebSocket' as const, enabled: true, routeToMotion: false, port: 0 }, external = new ExternalControlStore([config]), coordinator = await createInputCoordinator([config], { external, osc: new OscParameterStore() });
  const socket = new WebSocket(`ws://127.0.0.1:${coordinator.snapshot()[0]?.port}`);
  try {
    await once(socket, 'open'); external.clearCommands(); socket.send('L07500 D1\n'); const [raw] = await once(socket, 'message'); assert.match(String(raw), /TCode v0.3/); assert.equal(external.read('input/L0').value, .75);
  } finally { socket.terminate(); await coordinator.dispose(); }
});
test('WSDM preserves connection while rejecting an old binary continuation and accepts a new generation', async () => {
  const server = createServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening'); const address = server.address(); assert.ok(address && typeof address !== 'string');
  const wss = new WebSocketServer({ server }), connection = once(wss, 'connection'), config = { ...defaultProtocolInput('input'), type: 'IntifaceDevice' as const, enabled: true, routeToMotion: false, address: `ws://127.0.0.1:${address.port}`, timeoutMs: 1000 }, external = new ExternalControlStore([config]);
  const coordinator = await createInputCoordinator([config], { external, osc: new OscParameterStore() }), socket = (await connection)[0] as WebSocket;
  try {
    await once(socket, 'message');
    await new Promise<void>((resolve, reject) => socket.send(Buffer.from('L04'), { binary: true, fin: false }, error => error ? reject(error) : resolve()));
    const pong = once(socket, 'pong'); socket.ping('ingress-barrier'); await pong; external.clearCommands();
    const error = once(socket, 'message'); socket.send(Buffer.from('500\n'), { binary: true, fin: true }); assert.match(String((await error)[0]), /^ERR /); assert.equal(external.read('input/L0').valid, false);
    const accepted = once(socket, 'message'); socket.send(Buffer.from('L07000 D1\n'), { binary: true }); assert.match(String((await accepted)[0]), /TCode v0.3/); assert.equal(external.read('input/L0').value, .7);
  } finally { socket.terminate(); await coordinator.dispose(); wss.close(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
