import test from 'node:test';
import assert from 'node:assert/strict';
import { once, EventEmitter } from 'node:events';
import { createServer as createHttpServer } from 'node:http';
import { request as httpRequest } from 'node:http';
import type { Server as HttpServer } from 'node:http';
import { createConnection } from 'node:net';
import { createSocket } from 'node:dgram';
import { Duplex } from 'node:stream';
import { WebSocket, WebSocketServer } from 'ws';
import type Bonjour from 'bonjour-service';
import type { ServiceConfig, Service as BonjourService } from 'bonjour-service';
import { defaultProtocolInput } from '../../src/core/protocols/input-types.ts';
import type { ProtocolInputConfig } from '../../src/core/protocols/input-types.ts';
import { ExternalControlStore } from '../../src/core/protocols/external-control.ts';
import { OscParameterStore, encodeOscMessage, parseOscPacket } from '../../src/core/protocols/osc.ts';
import { createInputCoordinator } from '../../src/node/inputs/coordinator.ts';
import { OscServices, createOscServices, normalizeOscQueryUrl, parseOscQueryNodes, classifyOscPath } from '../../src/node/inputs/osc-services.ts';
import type { OscServicesConfig } from '../../src/node/inputs/osc-services.ts';
import { downloadProtocolScript, publicScriptAddress } from '../../src/node/inputs/http-utils.ts';
function input(type: ProtocolInputConfig['type'], id = 'input', path = '/'): ProtocolInputConfig { return { ...defaultProtocolInput(id), type, enabled: true, port: 0, path, routeToMotion: false }; }
async function port(server: HttpServer): Promise<number> { server.listen(0, '127.0.0.1'); await once(server, 'listening'); const address = server.address(); assert.ok(address && typeof address !== 'string'); return address.port; }
async function close(server: HttpServer): Promise<void> { if (!server.listening) return; server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
async function until(check: () => boolean, timeout = 2000): Promise<void> { const deadline = Date.now() + timeout; while (!check()) { if (Date.now() >= deadline) throw new Error('Expected isolated transport observation did not arrive.'); await new Promise(resolve => setTimeout(resolve, 5)); } }
function reply(socket: WebSocket): Promise<string> { return new Promise((resolve, reject) => {
  const timer = setTimeout(() => { cleanup(); reject(new Error('WebSocket reply timed out.')); }, 2000);
  const message = (data: Buffer): void => { cleanup(); resolve(data.toString()); }; const error = (reason: Error): void => { cleanup(); reject(reason); };
  const cleanup = (): void => { clearTimeout(timer); socket.off('message', message); socket.off('error', error); };
  socket.once('message', message); socket.once('error', error);
}); }
async function wsSend(socket: WebSocket, data: string | Buffer): Promise<string> { const pending = reply(socket); socket.send(data); return await pending; }
function oscConfig(): OscServicesConfig { return { enabled: true, receiverHost: '127.0.0.1', receiverPort: 0, inputTimeoutMs: 1000,
  oscQueryEnabled: false, oscQueryUrl: '', preferredSourcePersistentId: '', oscQueryPolling: { enabled: false, rateHz: 10 },
  oscQueryReceiver: { enabled: false, serviceName: 'Sensa fixture', httpPort: 0, advertiseAvatar: true, advertiseTracking: true },
  ogbControl: { enabled: false, host: '127.0.0.1', port: 9000 }, hub: { enabled: false, mode: 'EventDriven', fixedRateHz: 10, forwardAvatarChange: false, targets: [] } }; }
function discovery() {
  const browser = new EventEmitter() as EventEmitter & { stop(): void }; let stopped = false, destroyed = false, unpublished = false;
  browser.stop = (): void => { stopped = true; };
  const published: ServiceConfig[] = []; let up: ((service: BonjourService) => void) | undefined;
  const fake = { find: (_options: unknown, onup: (service: BonjourService) => void) => { up = onup; return browser; },
    publish: (options: ServiceConfig) => { published.push(options); return new EventEmitter(); },
    unpublishAll: (callback: () => void) => { unpublished = true; callback(); }, destroy: (callback: () => void) => { destroyed = true; callback(); } } as unknown as Bonjour;
  return { fake, published, browser, emit: (service: BonjourService): void => { up?.(service); }, state: () => ({ stopped, destroyed, unpublished }) };
}

test('OSC automatic source selection stays automatic while the hub reports its effective source separately', async () => {
  const store = new OscParameterStore(), config = oscConfig(), services = new OscServices(config, store);
  const first = { key: 'first', label: 'First', persistentId: null, address: '127.0.0.1', port: 9001 };
  const second = { ...first, key: 'second', label: 'Second', port: 9002 };
  try {
    store.set('CI/Depth', .25, first, 'Float');
    assert.equal(services.snapshot()['selectedSourceKey'], '');
    assert.equal(store.preferredSourceKey, null);
    assert.equal((services.snapshot()['hub'] as Record<string, unknown>)['effectiveSourceKey'], first.key);
    services.selectSource(first.key);
    assert.equal(services.snapshot()['selectedSourceKey'], first.key);
    assert.equal(store.preferredSourceKey, first.key);
    services.selectSource(null);
    assert.equal(services.snapshot()['selectedSourceKey'], '');
    assert.equal(store.preferredSourceKey, null);
    store.set('CI/Depth', .75, second, 'Float');
    assert.equal(services.snapshot()['selectedSourceKey'], '');
    assert.equal((services.snapshot()['hub'] as Record<string, unknown>)['effectiveSourceKey'], '');
  } finally { await services.dispose(); }
});

test('clearing a persisted OSC source remains cleared when that persistent identity publishes again', async () => {
  const store = new OscParameterStore(), config = oscConfig(); config.enabled = false; config.preferredSourcePersistentId = 'oscquery:name:Saved';
  const source = { key: 'saved-endpoint', label: 'Saved', persistentId: config.preferredSourcePersistentId, address: '127.0.0.1', port: 9001 };
  const services = await createOscServices(config, store);
  try {
    store.set('Depth', .25, source); assert.equal(store.preferredSourceKey, source.key);
    config.preferredSourcePersistentId = ''; services.selectSource(null);
    store.set('Depth', .5, source);
    assert.equal(store.preferredSourceKey, null); assert.equal(services.snapshot()['selectedSourceKey'], '');
    assert.equal(services.snapshot()['preferredSourcePersistentId'], '');
  } finally { await services.dispose(); }
});
test('an explicit OSC selection replaces the old persistent identity instead of being overridden by it', async () => {
  const store = new OscParameterStore(), config = oscConfig(); config.enabled = false; config.preferredSourcePersistentId = 'oscquery:name:Old';
  const old = { key: 'old', label: 'Old', persistentId: config.preferredSourcePersistentId, address: '127.0.0.1', port: 9001 };
  const selected = { ...old, key: 'selected', label: 'Selected', persistentId: 'oscquery:name:Selected', port: 9002 };
  const services = await createOscServices(config, store);
  try {
    store.set('Depth', .2, old); store.set('Depth', .8, selected); services.selectSource(selected.key);
    store.set('Depth', .3, old);
    assert.equal(store.preferredSourceKey, selected.key); assert.equal(services.snapshot()['preferredSourcePersistentId'], selected.persistentId);
  } finally { await services.dispose(); }
});
test('HTTP protocol routes share one real port and choose the longest whole-segment path', async () => {
  const configs = [input('JsonHttp', 'root', '/device'), input('JsonHttp', 'nested', '/device/nested')], external = new ExternalControlStore(configs), changed: number[] = [];
  const coordinator = await createInputCoordinator(configs, { external, osc: new OscParameterStore(), onPortChanged: (_ids, actualPort) => changed.push(actualPort) });
  try {
    const endpoints = coordinator.snapshot(); assert.equal(new Set(endpoints.map(row => row.port)).size, 1); assert.equal(changed.length, 1);
    const base = `http://127.0.0.1:${endpoints[0]?.port}`;
    const nested = await fetch(`${base}/device/nested/command`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"channel":"L0","value":0.65}' }); assert.equal(nested.status, 200); assert.equal(external.read('nested/L0').value, .65); assert.equal(external.read('root/L0').valid, false);
    assert.equal((await fetch(`${base}/device-nested/status`)).status, 404);
    assert.equal((await fetch(`${base}/device/status`)).headers.get('access-control-allow-origin'), '*');
    assert.equal((await fetch(`${base}/device/nested/command`, { method: 'POST', body: '{"channel":"L0","value":0.5,"value":0.9}', headers: { 'Content-Type': 'application/json' } })).status, 400); assert.equal(external.read('nested/L0').value, .65);
  } finally { await coordinator.dispose(); }
  assert.equal(external.getStatus('nested')?.session, null);
});
test('oversized chunked HTTP commands close their connection and leave the listener usable', async () => {
  const config = input('JsonHttp'), external = new ExternalControlStore([config]), coordinator = await createInputCoordinator([config], { external, osc: new OscParameterStore() });
  try {
    const actual = coordinator.snapshot()[0]?.port ?? 0;
    const rejected = await new Promise<{ status: number | undefined; connection: string | undefined }>((resolve, reject) => {
      const request = httpRequest({ host: '127.0.0.1', port: actual, path: '/command', method: 'POST', headers: { 'Content-Type': 'application/json', 'Transfer-Encoding': 'chunked' } }, response => {
        response.resume(); response.once('end', () => resolve({ status: response.statusCode, connection: response.headers.connection }));
      }); request.on('error', reject); request.end(Buffer.alloc(65537, 32));
    });
    assert.equal(rejected.status, 413); assert.equal(rejected.connection, 'close'); assert.equal(external.getStatus('input')?.receivedCommands, 0);
    assert.equal((await fetch(`http://127.0.0.1:${actual}/status`)).status, 200);
  } finally { await coordinator.dispose(); }
});
test('separate protocol listeners never dispatch another physical listener routes', async () => {
  const configs = [input('JsonHttp', 'first', '/first'), { ...input('JsonHttp', 'second', '/second'), host: '0.0.0.0' }], external = new ExternalControlStore(configs);
  const coordinator = await createInputCoordinator(configs, { external, osc: new OscParameterStore() });
  try {
    const first = coordinator.snapshot().find(value => value.id === 'first'); assert.ok(first);
    assert.equal((await fetch(`http://127.0.0.1:${first.port}/second/status`)).status, 404);
  } finally { await coordinator.dispose(); }
});
test('shared management server keeps explicit protocol mounts and rejects root mounts', async () => {
  let coordinator: Awaited<ReturnType<typeof createInputCoordinator>> | null = null;
  const server = createHttpServer((req, res) => { void (async () => { if (coordinator && await coordinator.handleHttp(req, res)) return; res.end('management'); })(); });
  const actual = await port(server), config = { ...input('JsonHttp', 'mounted', '/control'), port: actual }, external = new ExternalControlStore([config]);
  try {
    coordinator = await createInputCoordinator([config], { external, osc: new OscParameterStore(), sharedServer: { server, host: '127.0.0.1', port: actual } });
    assert.equal(await (await fetch(`http://127.0.0.1:${actual}/api/status`)).text(), 'management');
    assert.equal((await fetch(`http://127.0.0.1:${actual}/control/status`)).status, 200);
    await assert.rejects(coordinator.reload([{ ...config, path: '/' }]), /separate path mount/);
    await assert.rejects(coordinator.reload([{ ...config, path: '/api' }]), /reserved/);
    await assert.rejects(coordinator.reload([{ ...config, path: '/api/commands' }]), /reserved/);
    assert.equal((await fetch(`http://127.0.0.1:${actual}/control/status`)).status, 200);
  } finally { await coordinator?.dispose(); await close(server); }
});
test('a protocol-only listener may use its own /api mount', async () => {
  const config = input('JsonHttp', 'api-input', '/api'), external = new ExternalControlStore([config]), coordinator = await createInputCoordinator([config], { external, osc: new OscParameterStore() });
  try { assert.equal((await fetch(`http://127.0.0.1:${coordinator.snapshot()[0]?.port}/api/status`)).status, 200); }
  finally { await coordinator.dispose(); }
});
test('web listener fallback uses a real ephemeral port only after AddressAlreadyInUse', async () => {
  const occupied = createHttpServer((_req, res) => res.end('occupied')); const used = await port(occupied), config = { ...input('JsonHttp'), port: used }, external = new ExternalControlStore([config]);
  const coordinator = await createInputCoordinator([config], { external, osc: new OscParameterStore(), resolvePortConflicts: true });
  try { const actual = coordinator.snapshot()[0]?.port; assert.ok(actual); assert.notEqual(actual, used); assert.equal((await fetch(`http://127.0.0.1:${actual}/status`)).status, 200); }
  finally { await coordinator.dispose(); await close(occupied); }
});
test('TCode TCP accepts fragmented lines and disconnect stops only its lease', async () => {
  const config = input('TCodeTcp'), external = new ExternalControlStore([config]), coordinator = await createInputCoordinator([config], { external, osc: new OscParameterStore() });
  const socket = createConnection({ host: '127.0.0.1', port: coordinator.snapshot()[0]?.port ?? 0 });
  try { await once(socket, 'connect'); socket.write('L06'); socket.write('500\n'); await until(() => external.read('input/L0').value === .65);
    const received = once(socket, 'data'); socket.write('D1\n'); assert.match(String((await received)[0]), /TCode v0.3/);
    socket.destroy(); await until(() => external.getStatus('input')?.session === null);
  } finally { socket.destroy(); await coordinator.dispose(); }
});
test('TCode UDP never combines incomplete datagrams and releases a malformed source', async () => {
  const config = input('TCodeUdp'), external = new ExternalControlStore([config]), coordinator = await createInputCoordinator([config], { external, osc: new OscParameterStore() }), sender = createSocket('udp4');
  try {
    const actual = coordinator.snapshot()[0]?.port ?? 0; sender.send('L05500\n', actual, '127.0.0.1'); await until(() => external.read('input/L0').value === .55);
    sender.send('L099', actual, '127.0.0.1'); await until(() => external.getStatus('input')?.session === null);
    sender.send('99\n', actual, '127.0.0.1'); await new Promise(resolve => setTimeout(resolve, 20)); assert.equal(external.read('input/L0').valid, false);
  } finally { sender.close(); await coordinator.dispose(); }
});
test('TCode serial uses an injected duplex and clears pre-stop frame fragments', async () => {
  const config = input('TCodeSerial'), external = new ExternalControlStore([config]); let opened = 0;
  const stream = new Duplex({ read() {}, write(_chunk, _encoding, callback) { callback(); } });
  const coordinator = await createInputCoordinator([config], { external, osc: new OscParameterStore(), serialFactory: async () => { opened++; return stream; } });
  try { assert.equal(opened, 1); stream.push('L04'); await new Promise(resolve => setTimeout(resolve, 5)); external.clearCommands(); stream.push('500\n'); await new Promise(resolve => setTimeout(resolve, 5)); assert.equal(external.read('input/L0').valid, false); }
  finally { await coordinator.dispose(); assert.equal(stream.destroyed, true); }
});
test('an unresponsive serial reply writer has bounded queued bytes and releases its source', async () => {
  const config = input('TCodeSerial'), external = new ExternalControlStore([config]);
  const stream = new Duplex({ read() {}, write(_chunk, _encoding, _callback) { /* Intentionally blocked test transport. */ } });
  const coordinator = await createInputCoordinator([config], { external, osc: new OscParameterStore(), serialFactory: async () => stream });
  try { stream.push(('D0 '.repeat(650) + '\n').repeat(5)); await until(() => stream.destroyed); assert.equal(external.getStatus('input')?.session, null); assert.ok(stream.writableLength <= 65536); }
  finally { await coordinator.dispose(); }
});
test('real Buttplug WebSocket peers negotiate v4, publish and stop on close', async () => {
  const config = input('Buttplug'), external = new ExternalControlStore([config]), coordinator = await createInputCoordinator([config], { external, osc: new OscParameterStore() });
  const socket = new WebSocket(`ws://127.0.0.1:${coordinator.snapshot()[0]?.port}`);
  try { await once(socket, 'open'); assert.match(await wsSend(socket, '[{"RequestServerInfo":{"Id":1,"ClientName":"fixture","ProtocolVersionMajor":4,"ProtocolVersionMinor":0}}]'), /ServerInfo/);
    assert.match(await wsSend(socket, '[{"OutputCmd":{"Id":2,"DeviceIndex":0,"FeatureIndex":0,"Command":{"Position":{"Value":730}}}}]'), /Ok/); assert.equal(external.read('input/L0').value, .73);
    socket.close(); await once(socket, 'close'); await until(() => external.getStatus('input')?.session === null);
  } finally { socket.terminate(); await coordinator.dispose(); }
});
test('TCode and JSON WebSockets share one port while retaining per-source state', async () => {
  const configs = [input('TCodeWebSocket', 'tcode', '/tcode'), input('JsonWebSocket', 'json', '/json')], external = new ExternalControlStore(configs), coordinator = await createInputCoordinator(configs, { external, osc: new OscParameterStore() });
  const actual = coordinator.snapshot()[0]?.port, tcode = new WebSocket(`ws://127.0.0.1:${actual}/tcode`), json = new WebSocket(`ws://127.0.0.1:${actual}/json`);
  try { await Promise.all([once(tcode, 'open'), once(json, 'open')]); tcode.send('L04200\n'); await until(() => external.read('tcode/L0').value === .42);
    assert.match(await wsSend(json, '{"channel":"L0","value":0.81}'), /"ok":true/); assert.equal(external.read('json/L0').value, .81);
    tcode.close(); await once(tcode, 'close'); assert.equal(external.read('json/L0').value, .81);
  } finally { tcode.terminate(); json.terminate(); await coordinator.dispose(); }
});
test('Intiface device-manager registration is text and hardware replies remain binary', async () => {
  const server = createHttpServer(), actual = await port(server), wss = new WebSocketServer({ server }); const connected = once(wss, 'connection');
  const config = { ...input('IntifaceDevice'), address: `ws://127.0.0.1:${actual}`, identifier: 'TCode fixture' }, external = new ExternalControlStore([config]);
  const coordinator = await createInputCoordinator([config], { external, osc: new OscParameterStore() }); const socket = (await connected)[0] as WebSocket;
  try {
    const registration = await reply(socket); assert.equal((JSON.parse(registration) as Record<string, unknown>)['identifier'], 'TCode fixture');
    const pending = new Promise<{ data: string; binary: boolean }>(resolve => socket.once('message', (raw, binary) => resolve({ data: raw.toString(), binary })));
    socket.send(Buffer.from('D1\n')); const response = await pending; assert.equal(response.binary, true); assert.match(response.data, /TCode v0.3/);
    socket.send(Buffer.from('L03500\n')); await until(() => external.read('input/L0').value === .35);
  } finally { socket.terminate(); await coordinator.dispose(); wss.close(); await close(server); }
});
test('live Intiface device-manager PING/PONG retains an idle target beyond the TCode command timeout', async () => {
  const server = createHttpServer(), actual = await port(server), wss = new WebSocketServer({ server }), connected = once(wss, 'connection');
  const config = { ...input('IntifaceDevice'), address: `ws://127.0.0.1:${actual}`, timeoutMs: 1000 }, external = new ExternalControlStore([config]), coordinator = await createInputCoordinator([config], { external, osc: new OscParameterStore() });
  const socket = (await connected)[0] as WebSocket;
  try { await reply(socket); socket.send(Buffer.from('L03500\n')); await until(() => external.read('input/L0').value === .35);
    await new Promise(resolve => setTimeout(resolve, 1200)); assert.equal(socket.readyState, WebSocket.OPEN); assert.equal(external.read('input/L0').value, .35);
  } finally { socket.terminate(); await coordinator.dispose(); wss.close(); await close(server); }
});
test('immediately closing Intiface device manager does not leave a running listener or owned lease', async () => {
  const server = createHttpServer(), actual = await port(server), wss = new WebSocketServer({ server }); wss.on('connection', socket => socket.close());
  const config = { ...input('IntifaceDevice'), address: `ws://127.0.0.1:${actual}` }, external = new ExternalControlStore([config]);
  let coordinator: Awaited<ReturnType<typeof createInputCoordinator>> | undefined;
  try {
    try { coordinator = await createInputCoordinator([config], { external, osc: new OscParameterStore() }); }
    catch (error) { assert.match(error instanceof Error ? error.message : '', /closed during startup/); }
    if (coordinator) await until(() => coordinator?.snapshot()[0]?.running === false);
    assert.equal(external.getStatus('input')?.session, null);
  } finally { await coordinator?.dispose(); for (const client of wss.clients) client.terminate(); wss.close(); await close(server); }
});
test('vendor multipart script uploads use one local token and preserve final script position', async () => {
  const config = { ...input('AutoblowHttp'), identifier: 'isolated-fixture-token' }, external = new ExternalControlStore([config]), coordinator = await createInputCoordinator([config], { external, osc: new OscParameterStore() });
  try {
    const base = `http://127.0.0.1:${coordinator.snapshot()[0]?.port}/autoblow`, headers = { 'x-device-token': 'isolated-fixture-token', 'Content-Type': 'application/json' };
    assert.equal((await fetch(`${base}/state`)).status, 401);
    const boundary = 'sensa-fixture', file = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="motion.csv"\r\nContent-Type: text/csv\r\n\r\n0,0\n1000,100\n\r\n--${boundary}--\r\n`;
    const upload = await fetch(`${base}/sync-script/upload-csv`, { method: 'PUT', headers: { 'x-device-token': 'isolated-fixture-token', 'Content-Type': `multipart/form-data; boundary=${boundary}` }, body: file }); assert.equal(upload.status, 200);
    const uploaded = await upload.json() as Record<string, unknown>; assert.equal(uploaded['operationalMode'], 'SYNC_SCRIPT_PAUSED'); assert.ok(uploaded['syncScriptToken']);
    const start = await fetch(`${base}/sync-script/start`, { method: 'PUT', headers, body: '{"startTimeMs":1000}' }); assert.equal(start.status, 200); assert.equal(external.read('input/L0').value, 1);
    assert.equal((await fetch(`${base}/goto`, { method: 'PUT', headers, body: '{"position":50,"speed":50}' })).status, 200);
  } finally { await coordinator.dispose(); }
});
test('VacuGlide keeps scalar target speed distinct from synchronized script position', async () => {
  const config = { ...input('VacuGlideHttp'), features: [{ channel: 'V0', name: 'Motor', actuator: 'Scalar' as const, scalarType: 'Vibrate' as const, targetAxis: 'V0' }] }, external = new ExternalControlStore([config]), coordinator = await createInputCoordinator([config], { external, osc: new OscParameterStore() });
  try {
    const base = `http://127.0.0.1:${coordinator.snapshot()[0]?.port}/vacuglide`, headers = { 'Content-Type': 'application/json' };
    assert.equal((await fetch(`${base}/target-speed`, { method: 'PUT', headers, body: '{"targetSpeed":40}' })).status, 200); assert.equal(external.read('input/V0').value, .4);
    await fetch(`${base}/target-speed/stop`, { method: 'PUT', headers, body: '{}' }); assert.equal(external.read('input/V0').valid, false);
    const boundary = 'sensa-script', script = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="motion.funscript"\r\n\r\n{"actions":[{"at":0,"pos":0},{"at":1000,"pos":100}]}\r\n--${boundary}--\r\n`;
    assert.equal((await fetch(`${base}/sync-script/upload-funscript`, { method: 'PUT', headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` }, body: script })).status, 200);
    assert.equal((await fetch(`${base}/sync-script/start`, { method: 'PUT', headers, body: '{"startTimeMs":500}' })).status, 200); assert.equal(external.read('input/V0').value, 1);
  } finally { await coordinator.dispose(); }
});
test('script URL download performs an actual pinned loopback HTTP request and verifies bytes', async () => {
  let seenHeaders: Record<string, string | string[] | undefined> | undefined;
  const server = createHttpServer((req, res) => { seenHeaders = req.headers; if (req.url === '/redirect') { res.writeHead(302, { Location: '/script' }); res.end(); } else res.end('0,0\n1000,100\n'); });
  const actual = await port(server);
  try { const script = await downloadProtocolScript(`http://127.0.0.1:${actual}/script`, true); assert.equal(script.sample(500), .5);
    assert.equal(seenHeaders?.['authorization'], undefined); assert.equal(seenHeaders?.['cookie'], undefined);
    await assert.rejects(downloadProtocolScript(`http://127.0.0.1:${actual}/redirect`, true), /redirects/);
    await assert.rejects(downloadProtocolScript(`http://127.0.0.1:${actual}/script`, true, { sha256: '0'.repeat(64) }), /SHA-256/);
  } finally { await close(server); }
});
test('script connection falls back across vetted IPs while preserving the original Host authority', async () => {
  let authority: string | undefined; const server = createHttpServer((req, res) => { authority = req.headers.host; res.end('0,0\n1000,100\n'); }), actual = await port(server);
  try {
    const script = await downloadProtocolScript(`http://127.0.0.1:${actual}/script`, true, { resolve: async () => [{ address: '127.0.0.2', family: 4 }, { address: '127.0.0.1', family: 4 }] });
    assert.equal(script.sample(500), .5); assert.equal(authority, `127.0.0.1:${actual}`);
  } finally { await close(server); }
});
test('script cancellation during resolution prevents a late lookup result from opening a request', async () => {
  let requested = false, complete: ((value: { address: string; family: number }[]) => void) | undefined;
  const server = createHttpServer((_req, res) => { requested = true; res.end('0,0\n'); }), actual = await port(server), controller = new AbortController();
  try {
    const pending = downloadProtocolScript(`http://127.0.0.1:${actual}/script`, true, { signal: controller.signal, resolve: async () => await new Promise(resolve => { complete = resolve; }) });
    controller.abort(); await assert.rejects(pending, /cancelled/); assert.ok(complete); complete([{ address: '127.0.0.1', family: 4 }]);
    await new Promise(resolve => setImmediate(resolve)); assert.equal(requested, false);
  } finally { await close(server); }
});
test('script public-address checks reject encoded reserved IPv6/mapped IPv4 and allow public mappings', () => {
  for (const address of ['127.0.0.1', '10.0.0.1', '192.168.1.1', '::1', '2001:0db8::1', '::ffff:c0a8:101', 'fc00::1']) assert.equal(publicScriptAddress(address), false, address);
  assert.equal(publicScriptAddress('8.8.8.8'), true); assert.equal(publicScriptAddress('::ffff:808:808'), true);
});
test('OSC services bind UDP, keep per-source samples and expose frontend-compatible previews', async () => {
  const store = new OscParameterStore(), config = oscConfig(), services = await createOscServices(config, store), sender = createSocket('udp4');
  try { const snapshot = services.snapshot(), receiverPort = snapshot['receiverPort']; assert.equal(typeof receiverPort, 'number'); sender.send(encodeOscMessage('/avatar/parameters/PenOthers', .25), receiverPort as number, '127.0.0.1');
    await until(() => store.tryGetLatest('PenOthers')?.entry.value === .25); const state = services.snapshot(); const rows = state['preview'] as Record<string, unknown>[]; assert.equal(rows[0]?.['numericValue'], .25); assert.ok(rows[0]); assert.equal((rows[0]['classification'] as Record<string, unknown>)['relevance'], 90);
  } finally { sender.close(); await services.dispose(); }
});
test('OSC hub forwards the selected source while preserving other raw packet types', async () => {
  const receiver = createSocket('udp4'); receiver.bind(0, '127.0.0.1'); await once(receiver, 'listening'); const targetPort = receiver.address().port;
  const config = oscConfig(); config.hub = { ...config.hub, enabled: true, targets: [{ id: 'target', name: 'target', host: '127.0.0.1', port: targetPort, enabled: true }] };
  const store = new OscParameterStore(), services = await createOscServices(config, store);
  try { const receive = once(receiver, 'message'); store.set('Value', .3, { key: 'selected', label: 'selected', persistentId: null, address: '127.0.0.1', port: 1 }); const packet = (await receive)[0] as Buffer; assert.equal(parseOscPacket(packet).values[0]?.value, Math.fround(.3));
    store.set('Value', .7, { key: 'other', label: 'other', persistentId: null, address: '127.0.0.1', port: 2 }); const hub = services.snapshot()['hub'] as Record<string, unknown>; assert.equal(hub['blockedBySourceSelection'], true);
  } finally { await services.dispose(); receiver.close(); }
});
test('OSC avatar change forwards the implicit single source before clearing its catalog', async () => {
  const receiver = createSocket('udp4'), sender = createSocket('udp4'); receiver.bind(0, '127.0.0.1'); await once(receiver, 'listening');
  const packets: Buffer[] = []; receiver.on('message', data => packets.push(data));
  const config = oscConfig(); config.hub = { ...config.hub, enabled: true, forwardAvatarChange: true, targets: [{ id: 'target', name: 'target', host: '127.0.0.1', port: receiver.address().port, enabled: true }] };
  const store = new OscParameterStore(), services = await createOscServices(config, store), actual = services.snapshot()['receiverPort'] as number;
  try {
    sender.send(encodeOscMessage('/avatar/parameters/Value', .3), actual, '127.0.0.1'); await until(() => packets.length === 1);
    sender.send(Buffer.from('/avatar/change\0\0,s\0\0new\0'), actual, '127.0.0.1');
    await until(() => packets.some(packet => parseOscPacket(packet).avatarChanged)); assert.equal(store.sourceCount, 0);
  } finally { await services.dispose(); sender.close(); receiver.close(); }
});
test('fixed-rate OSC avatar change replaces old parameters and precedes the new snapshot', async () => {
  const receiver = createSocket('udp4'), sender = createSocket('udp4'); receiver.bind(0, '127.0.0.1'); await once(receiver, 'listening');
  const packets: Buffer[] = []; receiver.on('message', data => packets.push(data));
  const config = oscConfig(); config.hub = { ...config.hub, enabled: true, mode: 'FixedRate', fixedRateHz: 1, forwardAvatarChange: true, targets: [{ id: 'target', name: 'target', host: '127.0.0.1', port: receiver.address().port, enabled: true }] };
  const store = new OscParameterStore(), services = await createOscServices(config, store), actual = services.snapshot()['receiverPort'] as number;
  const hub = () => services.snapshot()['hub'] as Record<string, unknown>;
  try {
    sender.send(encodeOscMessage('/avatar/parameters/Old', .3), actual, '127.0.0.1'); await until(() => store.sourceCount === 1); assert.equal(hub()['pendingPacketCount'], 1);
    sender.send(Buffer.from('/avatar/change\0\0,s\0\0new\0'), actual, '127.0.0.1'); await until(() => store.sourceCount === 0);
    assert.equal(hub()['pendingAvatarChange'], true); assert.equal(hub()['pendingPacketCount'], 0);
    sender.send(encodeOscMessage('/avatar/parameters/New', .7), actual, '127.0.0.1'); await until(() => store.sourceCount === 1);
    await until(() => packets.length >= 2); assert.equal(parseOscPacket(packets[0]!).avatarChanged, true);
    assert.equal(parseOscPacket(packets[1]!).values[0]?.path, 'New'); assert.equal(packets.length, 2); assert.equal(hub()['pendingAvatarChange'], false);
    sender.send(Buffer.from('/avatar/change\0\0,s\0\0new\0'), actual, '127.0.0.1'); await until(() => store.sourceCount === 0);
    await until(() => packets.length === 3); assert.equal(parseOscPacket(packets[2]!).avatarChanged, true); assert.equal(hub()['pendingAvatarChange'], false);
  } finally { await services.dispose(); sender.close(); receiver.close(); }
});
test('fixed-rate OSC sends raw packets immediately and clears stale parameters when avatar forwarding is disabled', async () => {
  const receiver = createSocket('udp4'), sender = createSocket('udp4'); receiver.bind(0, '127.0.0.1'); await once(receiver, 'listening');
  const packets: Buffer[] = []; receiver.on('message', data => packets.push(data));
  const config = oscConfig(); config.hub = { ...config.hub, enabled: true, mode: 'FixedRate', fixedRateHz: 1, targets: [{ id: 'target', name: 'target', host: '127.0.0.1', port: receiver.address().port, enabled: true }] };
  const store = new OscParameterStore(), services = await createOscServices(config, store), actual = services.snapshot()['receiverPort'] as number;
  const hub = () => services.snapshot()['hub'] as Record<string, unknown>;
  try {
    sender.send(encodeOscMessage('/avatar/parameters/Old', .3), actual, '127.0.0.1'); await until(() => store.sourceCount === 1);
    const raw = encodeOscMessage('/tracking/vrsystem/0/position', .5); sender.send(raw, actual, '127.0.0.1'); await until(() => packets.length > 0, 500);
    assert.deepEqual(packets[0], Buffer.from(raw)); assert.equal(hub()['pendingPacketCount'], 1);
    sender.send(Buffer.from('/avatar/change\0\0,s\0\0new\0'), actual, '127.0.0.1'); await until(() => store.sourceCount === 0);
    assert.equal(hub()['pendingPacketCount'], 0); assert.equal(hub()['pendingAvatarChange'], false);
  } finally { await services.dispose(); sender.close(); receiver.close(); }
});
test('OGB fixed target emits true at start and false before the sender is disposed', async () => {
  const receiver = createSocket('udp4'); receiver.bind(0, '127.0.0.1'); await once(receiver, 'listening'); const config = oscConfig(); config.ogbControl = { enabled: true, host: '127.0.0.1', port: receiver.address().port };
  const first = once(receiver, 'message'), services = await createOscServices(config, new OscParameterStore());
  try { assert.equal(parseOscPacket((await first)[0] as Buffer).values[0]?.value, true); const stopped = once(receiver, 'message'); await services.dispose(); assert.equal(parseOscPacket((await stopped)[0] as Buffer).values[0]?.value, false); }
  finally { await services.dispose(); receiver.close(); }
});
test('OSCQuery receiver advertises actual ports and tears down announcement and discovery', async () => {
  const config = oscConfig(), mdns = discovery(); config.oscQueryEnabled = true; config.oscQueryReceiver.enabled = true;
  const services = await createOscServices(config, new OscParameterStore(), { bonjourFactory: () => mdns.fake });
  try {
    const snapshot = services.snapshot(), queryReceiver = snapshot['queryReceiver'] as Record<string, unknown>, httpPort = queryReceiver['httpPort']; assert.equal(typeof httpPort, 'number');
    const info = await (await fetch(`http://127.0.0.1:${httpPort}/?HOST_INFO`)).json() as Record<string, unknown>; assert.equal(info['OSC_PORT'], snapshot['receiverPort']); assert.equal(mdns.published.length, 2); assert.ok(mdns.published.some(value => value.port === httpPort));
    const leaf = await (await fetch(`http://127.0.0.1:${httpPort}/avatar/change`)).json() as Record<string, unknown>; assert.equal(leaf['TYPE'], 's');
    mdns.emit({ fqdn: 'fixture._oscjson._tcp.local', name: 'fixture', port: 1234, addresses: ['127.0.0.1'], host: 'fixture.local' } as BonjourService);
    assert.equal(((services.snapshot()['query'] as Record<string, unknown>)['discovered'] as unknown[]).length, 1);
  } finally { await services.dispose(); assert.deepEqual(mdns.state(), { stopped: true, destroyed: true, unpublished: true }); }
});
test('OSCQuery refresh, actual LISTEN websocket and binary updates share a persistent source identity', async () => {
  const server = createHttpServer((req, res) => { res.setHeader('Content-Type', 'application/json'); const addr = server.address(); assert.ok(addr && typeof addr !== 'string');
    res.end(JSON.stringify(req.url?.includes('HOST_INFO') ? { NAME: 'Fixture Avatar', OSC_IP: '127.0.0.1', OSC_PORT: 9000, WS_PORT: addr.port, EXTENSIONS: { LISTEN: true } }
      : { FULL_PATH: '/', CONTENTS: { avatar: { FULL_PATH: '/avatar', CONTENTS: { parameters: { FULL_PATH: '/avatar/parameters', CONTENTS: { Depth: { FULL_PATH: '/avatar/parameters/Depth', TYPE: 'f', VALUE: [.2], ACCESS: 3 } } } } } } })); });
  const actual = await port(server), wss = new WebSocketServer({ server }), connected = once(wss, 'connection'), config = oscConfig(), mdns = discovery(); config.oscQueryEnabled = true; config.oscQueryUrl = `http://127.0.0.1:${actual}/`;
  const store = new OscParameterStore(), services = await createOscServices(config, store, { bonjourFactory: () => mdns.fake });
  try {
    await services.refreshQuery(); assert.equal(store.tryGetLatest('Depth')?.entry.value, Math.fround(.2)); const socket = (await connected)[0] as WebSocket;
    const listen = JSON.parse(await reply(socket)) as Record<string, unknown>; assert.equal(listen['COMMAND'], 'LISTEN'); assert.equal(listen['DATA'], '/avatar/parameters/Depth');
    socket.send(encodeOscMessage('/avatar/parameters/Depth', .8)); await until(() => store.tryGetLatest('Depth')?.entry.value === Math.fround(.8));
    assert.equal(store.tryGetLatest('Depth')?.entry.source.persistentId, 'oscquery:name:Fixture Avatar');
  } finally { await services.dispose(); for (const client of wss.clients) client.terminate(); wss.close(); await close(server); }
});
test('OSCQuery parsers keep trailing slashes, metadata and classification names consistent', () => {
  assert.equal(normalizeOscQueryUrl('127.0.0.1:9001/root?foo#bar'), 'http://127.0.0.1:9001/root/'); assert.equal(normalizeOscQueryUrl('file:///tmp/script'), '');
  const nodes = parseOscQueryNodes({ FULL_PATH: '/avatar/parameters/Test', TYPE: 'f', VALUE: [.5], RANGE: [{ MIN: 0, MAX: 1 }] }); assert.equal(nodes[0]?.parsedValue, .5); assert.equal(nodes[0]?.min, 0);
  assert.equal(classifyOscPath('FT/v2/Eye').isFaceTracking, true); assert.equal(classifyOscPath('Sensa/SPS/root/X').relevance, 100); assert.equal(classifyOscPath('PenOther').relevance, 40);
});
test('OSCQuery scalar conversion rejects vectors, fractional integers and nonrepresentable float32 values', () => {
  for (const [type, value] of [['ff', [.2, .4]], ['i', [.5]], ['h', [2147483648]], ['f', [1e300]]] as const) {
    assert.equal(parseOscQueryNodes({ FULL_PATH: '/avatar/parameters/Input', TYPE: type, VALUE: value })[0]?.parsedValue, null);
  }
  assert.equal(parseOscQueryNodes({ FULL_PATH: '/avatar/parameters/Input', TYPE: 'T', VALUE: [false] })[0]?.parsedValue, false);
  assert.equal(parseOscQueryNodes({ FULL_PATH: '/avatar/parameters/Input', TYPE: 'F', VALUE: [2] })[0]?.parsedValue, true);
  assert.equal(parseOscQueryNodes({ FULL_PATH: '/avatar/parameters/Input', TYPE: 'T' })[0]?.parsedValue, null);
});
