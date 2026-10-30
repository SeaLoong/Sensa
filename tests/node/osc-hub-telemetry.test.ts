import assert from 'node:assert/strict';
import { createSocket } from 'node:dgram';
import { createServer } from 'node:http';
import type { Duplex } from 'node:stream';
import { once } from 'node:events';
import { EventEmitter } from 'node:events';
import type Bonjour from 'bonjour-service';
import type { Service as BonjourService } from 'bonjour-service';
import { setTimeout, setImmediate } from 'node:timers/promises';
import test from 'node:test';
import { OscParameterStore } from '../../src/core/protocols/osc.ts';
import { parseOscPacket } from '../../src/core/protocols/osc.ts';
import { deadline } from '../../src/core/outputs/lifecycle.ts';
import { OscServices, createOscServices } from '../../src/node/inputs/osc-services.ts';
import type { OscServicesConfig } from '../../src/node/inputs/osc-services.ts';

function config(): OscServicesConfig { return { enabled: true, receiverHost: '127.0.0.1', receiverPort: 0, inputTimeoutMs: 1000,
  oscQueryEnabled: false, oscQueryUrl: '', preferredSourcePersistentId: '', oscQueryPolling: { enabled: false, rateHz: 10 },
  oscQueryReceiver: { enabled: false, serviceName: 'Isolated hub fixture', httpPort: 0, advertiseAvatar: true, advertiseTracking: true },
  ogbControl: { enabled: false, host: '127.0.0.1', port: 9000 }, hub: { enabled: true, mode: 'EventDriven', fixedRateHz: 10, forwardAvatarChange: false, targets: [] } }; }
const target = (id: string, port: number, host = '127.0.0.1') => ({ id, name: id, host, port, enabled: true });
const source = { key: 'isolated-source', label: 'Isolated source', address: '127.0.0.1', port: 9001, persistentId: null };
interface Target { id: string; resolvedEndpoint: string; sentPackets: number; lastSentAtUtc: string | null; lastError: string; lastErrorAtUtc: string | null; active: boolean }
function hub(services: OscServices): { targets: Target[]; forwardedPacketCount: number; droppedPacketCount: number } { return services.snapshot()['hub'] as ReturnType<typeof hub>; }
function row(services: OscServices, id: string): Target { const found = hub(services).targets.find(value => value.id === id); assert.ok(found); return found; }
async function until(predicate: () => boolean): Promise<void> { for (let i = 0; i < 100; i++) { if (predicate()) return; await setTimeout(5); } assert.ok(predicate(), 'Expected real hub callback telemetry'); }

test('real UDP hub sends expose endpoint and per-target accepted counters without crediting disabled targets', async () => {
  const receiver = createSocket('udp4'); receiver.bind(0, '127.0.0.1'); await once(receiver, 'listening');
  const settings = config(); settings.hub.targets = [target('live', receiver.address().port), { ...target('disabled', 9002), enabled: false }];
  const store = new OscParameterStore(() => 1000), services = await createOscServices(settings, store, { now: () => 1000 });
  try {
    assert.equal(row(services, 'live').resolvedEndpoint, `127.0.0.1:${receiver.address().port}`);
    assert.equal(row(services, 'live').lastSentAtUtc, null);
    const received = once(receiver, 'message'); store.set('Depth', .25, source); await received;
    await until(() => row(services, 'live').sentPackets === 1);
    assert.equal(row(services, 'live').lastSentAtUtc, '1970-01-01T00:00:01.000Z');
    assert.equal(row(services, 'live').lastError, ''); assert.equal(row(services, 'live').lastErrorAtUtc, null);
    assert.equal(row(services, 'disabled').sentPackets, 0); assert.equal(row(services, 'disabled').lastSentAtUtc, null);
    assert.equal(row(services, 'disabled').resolvedEndpoint, ''); assert.equal(row(services, 'disabled').active, false);
  } finally { await services.dispose(); receiver.close(); }
});

test('each hub target records its own callback error and recovers only after its next accepted send', async () => {
  const settings = config(); settings.hub.targets = [target('first', 9101), target('second', 9102)];
  let now = 1000, failSecond = true;
  const options = { now: () => now, sendHubPacket: (_packet: Uint8Array, port: number, _address: string, done: (error: Error | null) => void) => {
    queueMicrotask(() => done(port === 9102 && failSecond ? new Error('Injected second-target failure') : null));
  } };
  const store = new OscParameterStore(() => now), services = await createOscServices(settings, store, options);
  try {
    store.set('Depth', .25, source); await until(() => hub(services).droppedPacketCount === 1);
    assert.equal(row(services, 'first').sentPackets, 1); assert.equal(row(services, 'first').lastError, '');
    assert.equal(row(services, 'second').sentPackets, 0); assert.equal(row(services, 'second').lastSentAtUtc, null);
    assert.equal(row(services, 'second').lastError, 'Injected second-target failure'); assert.equal(row(services, 'second').lastErrorAtUtc, '1970-01-01T00:00:01.000Z');
    failSecond = false; now = 2000; store.set('Depth', .5, source); await until(() => row(services, 'second').sentPackets === 1);
    assert.equal(row(services, 'second').lastError, ''); assert.equal(row(services, 'second').lastErrorAtUtc, null);
    assert.equal(row(services, 'second').lastSentAtUtc, '1970-01-01T00:00:02.000Z');
  } finally { await services.dispose(); }
});

test('unrelated OSC reconfiguration retains sent history but endpoint changes and disabled targets reject late callbacks', async () => {
  const settings = config(); settings.hub.targets = [target('live', 9101)];
  const callbacks: ((error: Error | null) => void)[] = [];
  const options = { now: () => 1000, sendHubPacket: (_packet: Uint8Array, _port: number, _address: string, done: (error: Error | null) => void) => { callbacks.push(done); } };
  const store = new OscParameterStore(() => 1000), services = await createOscServices(settings, store, options);
  try {
    store.set('Depth', .25, source); assert.equal(callbacks.length, 1); callbacks.shift()!(null);
    const changedPolling = structuredClone(settings); changedPolling.oscQueryPolling.rateHz = 20;
    await services.reconfigure(changedPolling);
    assert.equal(row(services, 'live').sentPackets, 1); assert.equal(row(services, 'live').lastSentAtUtc, '1970-01-01T00:00:01.000Z');
    store.set('Depth', .5, source); const late = callbacks.shift(); assert.ok(late);
    const changedEndpoint = structuredClone(settings); changedEndpoint.hub.targets[0]!.port = 9102;
    await services.reconfigure(changedEndpoint); late(null);
    assert.equal(row(services, 'live').resolvedEndpoint, '127.0.0.1:9102'); assert.equal(row(services, 'live').sentPackets, 0);
    assert.equal(hub(services).forwardedPacketCount, 1, 'stale callback must not credit aggregate or replacement endpoint');
    store.set('Depth', .75, source); const disabledLate = callbacks.shift(); assert.ok(disabledLate);
    changedEndpoint.hub.targets[0]!.enabled = false; await services.reconfigure(changedEndpoint); disabledLate(new Error('Old connection failed'));
    assert.equal(row(services, 'live').active, false); assert.equal(row(services, 'live').resolvedEndpoint, '');
    assert.equal(row(services, 'live').lastError, ''); assert.equal(hub(services).droppedPacketCount, 0);
  } finally { await services.dispose(); }
});

test('hub DNS is resolved once per configuration and actual sends use only the resolved IP', async () => {
  const settings = config(); settings.hub.targets = [target('named', 9101, 'receiver.example.test')];
  let lookups = 0; const addresses: string[] = [];
  const options = { resolveHubHost: async (host: string) => { assert.equal(host, 'receiver.example.test'); lookups++; return '127.0.0.2'; },
    sendHubPacket: (_packet: Uint8Array, _port: number, address: string, done: (error: Error | null) => void) => { addresses.push(address); done(null); } };
  const store = new OscParameterStore(), services = await createOscServices(settings, store, options);
  try {
    assert.equal(row(services, 'named').resolvedEndpoint, '127.0.0.2:9101');
    for (let i = 0; i < 10; i++) store.set('Depth', i / 10, source);
    assert.equal(lookups, 1); assert.deepEqual(addresses, Array.from({ length: 10 }, () => '127.0.0.2'));
    assert.equal(row(services, 'named').sentPackets, 10);
  } finally { await services.dispose(); }
});

test('DNS failures stay isolated and a changed resolved address resets only that target history', async () => {
  const settings = config(); settings.hub.targets = [target('named', 9101, 'receiver.example.test'), target('broken', 9102, 'broken.example.test')];
  let address = '127.0.0.2';
  const options = { resolveHubHost: async (host: string) => { if (host.startsWith('broken')) throw new Error('Injected DNS failure'); return address; },
    sendHubPacket: (_packet: Uint8Array, _port: number, _address: string, done: (error: Error | null) => void) => done(null) };
  const store = new OscParameterStore(), services = await createOscServices(settings, store, options);
  try {
    assert.equal(row(services, 'broken').active, false); assert.equal(row(services, 'broken').lastError, 'Injected DNS failure');
    store.set('Depth', .25, source); assert.equal(row(services, 'named').sentPackets, 1); assert.equal(row(services, 'broken').sentPackets, 0);
    address = '127.0.0.3'; await services.reconfigure(settings);
    assert.equal(row(services, 'named').resolvedEndpoint, '127.0.0.3:9101'); assert.equal(row(services, 'named').lastSentAtUtc, null);
    assert.equal(row(services, 'named').sentPackets, 0); assert.equal(row(services, 'broken').lastError, 'Injected DNS failure');
  } finally { await services.dispose(); }
});

test('pending DNS resolution is shared and bounded across targets instead of growing with packet or target bursts', async () => {
  const settings = config(); settings.hub.targets = Array.from({ length: 66 }, (_, index) => target(String(index), 9101, index === 1 ? 'host-0.example.test' : `host-${index}.example.test`));
  const resolutions: (() => void)[] = [];
  const options = { resolveHubHost: () => new Promise<string>(resolve => { resolutions.push(() => resolve('127.0.0.2')); }) };
  const store = new OscParameterStore(), opening = createOscServices(settings, store, options);
  await until(() => resolutions.length === 64);
  for (const resolve of resolutions) resolve();
  const services = await opening;
  try {
    assert.equal(resolutions.length, 64);
    assert.equal(row(services, '0').resolvedEndpoint, row(services, '1').resolvedEndpoint);
    assert.equal(row(services, '65').lastError, 'Too many pending OSC hub DNS lookups.');
    assert.equal(row(services, '65').active, false);
  } finally { await services.dispose(); }
});

test('disposal closes forwarding and cannot accept a previously pending datagram callback', async () => {
  const settings = config(); settings.hub.targets = [target('live', 9101)];
  let callback: ((error: Error | null) => void) | undefined;
  const options = { sendHubPacket: (_packet: Uint8Array, _port: number, _address: string, done: (error: Error | null) => void) => { callback = done; } };
  const store = new OscParameterStore(), services = await createOscServices(settings, store, options);
  store.set('Depth', .25, source); assert.ok(callback); await services.dispose(); callback(null);
  assert.equal(row(services, 'live').active, false); assert.equal(row(services, 'live').sentPackets, 0);
  assert.equal((services.snapshot()['hub'] as Record<string, unknown>)['canForward'], false);
  assert.equal((services.snapshot()['hub'] as Record<string, unknown>)['activeTargetCount'], 0);
  assert.equal(hub(services).forwardedPacketCount, 0);
});

function heldHubResolution() {
  let resolve: ((address: string) => void) | undefined, began = false, discoveryStarts = 0;
  const pending = new Promise<string>(complete => { resolve = complete; });
  const browser = Object.assign(new EventEmitter(), { stop() {} });
  const fake = { find() { discoveryStarts++; return browser; }, unpublishAll(callback: () => void) { callback(); }, destroy(callback: () => void) { callback(); } } as unknown as Bonjour;
  return { options: { resolveHubHost: () => { began = true; return pending; }, bonjourFactory: () => fake },
    began: () => began, discoveryStarts: () => discoveryStarts,
    release: () => { assert.ok(resolve); resolve('127.0.0.2'); } };
}

test('disposing during hub DNS preparation cannot restart discovery or accept a later reconfiguration', async () => {
  const settings = config(); settings.enabled = false; settings.oscQueryEnabled = true;
  settings.hub.mode = 'FixedRate'; settings.hub.targets = [target('named', 9101, 'held.example.test')];
  const held = heldHubResolution(), services = new OscServices(settings, new OscParameterStore(), held.options);
  const configuring = services.reconfigure(settings);
  await until(held.began); await services.dispose(); held.release(); await configuring;
  assert.equal(held.discoveryStarts(), 0, 'an obsolete async phase must not start discovery after disposal');
  assert.equal((services.snapshot()['hub'] as Record<string, unknown>)['canForward'], false);
  await assert.rejects(services.reconfigure(settings), /disposed/u);
});

test('a newer OSC configuration remains authoritative when an older DNS preparation finishes late', async () => {
  const older = config(); older.enabled = false; older.oscQueryEnabled = true;
  older.hub.mode = 'FixedRate'; older.hub.targets = [target('named', 9101, 'held.example.test')];
  const held = heldHubResolution(), services = new OscServices(older, new OscParameterStore(), held.options);
  const configuring = services.reconfigure(older);
  try {
    await until(held.began);
    const newer = config(); newer.hub.targets = [target('current', 9102)];
    await services.reconfigure(newer);
    assert.equal(services.snapshot()['listening'], true);
    const currentPort = services.snapshot()['receiverPort'];
    held.release(); await configuring;
    assert.equal(held.discoveryStarts(), 0, 'the older configuration must not start query discovery in the newer generation');
    assert.equal(services.snapshot()['listening'], true); assert.equal(services.snapshot()['receiverPort'], currentPort);
    assert.equal((services.snapshot()['query'] as Record<string, unknown>)['enabled'], false);
    assert.equal(row(services, 'current').resolvedEndpoint, '127.0.0.1:9102');
    assert.equal(hub(services).targets.length, 1);
  } finally { held.release(); await configuring.catch(() => {}); await services.dispose(); }
});

test('disposing immediately after a real UDP bind starts settles both lifecycle operations', async () => {
  const settings = config(), services = new OscServices(settings, new OscParameterStore());
  const configuring = services.reconfigure(settings);
  // Let reconfiguration pass its initial stop barrier and enter the real bind.
  await Promise.resolve(); assert.equal(services.snapshot()['listening'], true);
  await deadline(Promise.all([configuring, services.dispose()]), 2000, 'Concurrent UDP bind/dispose');
  assert.equal(services.snapshot()['listening'], false);
  assert.equal((services.snapshot()['hub'] as Record<string, unknown>)['canForward'], false);
});

function discoveryFixture() {
  const browsers: { browser: EventEmitter & { stop(): void }; up: (service: BonjourService) => void }[] = [];
  const factory = () => ({
    find(_options: unknown, up: (service: BonjourService) => void) { const browser = Object.assign(new EventEmitter(), { stop() {} }); browsers.push({ browser, up }); return browser; },
    unpublishAll(callback: () => void) { callback(); }, destroy(callback: () => void) { callback(); },
  }) as unknown as Bonjour;
  return { browsers, factory };
}
function polling(services: OscServices): { running: boolean } { return (services.snapshot()['query'] as { polling: { running: boolean } }).polling; }

for (const action of ['dispose', 'reconfigure'] as const) test(`an aborted polling completion cannot restart polling after ${action}`, async () => {
  const settings = config(); settings.enabled = false; settings.hub.enabled = false; settings.oscQueryEnabled = true;
  settings.oscQueryUrl = 'http://held-query.example.test/'; settings.oscQueryPolling.enabled = true;
  const discovery = discoveryFixture(); let fetched = false;
  const services = await createOscServices(settings, new OscParameterStore(), { bonjourFactory: discovery.factory,
    fetch: async (_url, options) => { fetched = true; return await new Promise<Response>((_resolve, reject) => {
      const abort = () => reject(new Error('Isolated fetch aborted')); options?.signal?.addEventListener('abort', abort, { once: true });
      if (options?.signal?.aborted) abort();
    }); } });
  try {
    await until(() => fetched); await setTimeout(5); // Let the real zero-delay poll attach to the held refresh.
    if (action === 'dispose') await services.dispose();
    else { const newer = structuredClone(settings); newer.oscQueryEnabled = false; await services.reconfigure(newer); }
    await setImmediate(); assert.equal(polling(services).running, false, 'obsolete refresh finalizers cannot schedule or mutate the current polling state');
  } finally { await services.dispose(); }
});

test('late discovery up/down callbacks cannot populate or remove another generation catalog', async () => {
  const settings = config(); settings.enabled = false; settings.hub.enabled = false; settings.oscQueryEnabled = true;
  const discovery = discoveryFixture(), services = await createOscServices(settings, new OscParameterStore(), { bonjourFactory: discovery.factory });
  const service = (name: string, fqdn = 'shared._oscjson._tcp.local') => ({ name, fqdn, host: '127.0.0.1', addresses: ['127.0.0.1'], port: 9001 }) as BonjourService;
  try {
    const old = discovery.browsers[0]; assert.ok(old); old.up(service('Old'));
    await services.reconfigure(settings); const current = discovery.browsers[1]; assert.ok(current); current.up(service('Current'));
    old.browser.emit('down', service('Old')); old.up(service('Late old', 'late._oscjson._tcp.local'));
    const discovered = (services.snapshot()['query'] as { discovered: { name: string }[] }).discovered;
    assert.deepEqual(discovered.map(value => value.name), ['Current']);
    await services.dispose(); current.up(service('After disposal'));
    assert.deepEqual((services.snapshot()['query'] as { discovered: unknown[] }).discovered, []);
  } finally { await services.dispose(); }
});

test('late OGB callbacks cannot replace telemetry from the new target', async () => {
  const settings = config(); settings.hub.enabled = false; settings.ogbControl = { enabled: true, host: '127.0.0.1', port: 9101 };
  let now = 1000; const sends: { port: number; value: unknown; done: (error: Error | null) => void }[] = [];
  const services = await createOscServices(settings, new OscParameterStore(), { now: () => now,
    sendOgbPacket(packet, port, _host, done) { sends.push({ port, value: parseOscPacket(packet).values[0]?.value, done }); } });
  try {
    const newer = structuredClone(settings); newer.ogbControl.port = 9102; now = 2000; await services.reconfigure(newer);
    assert.deepEqual(sends.map(send => [send.port, send.value]), [[9101, true], [9101, false], [9102, true]]);
    sends[2]!.done(null); now = 3000; sends[0]!.done(new Error('Old target failed'));
    let state = services.snapshot()['ogbControl'] as Record<string, unknown>;
    assert.equal(state['lastError'], '', 'old target failure cannot be assigned to the current target');
    sends[1]!.done(null); state = services.snapshot()['ogbControl'] as Record<string, unknown>;
    assert.equal(state['lastSentValue'], true); assert.equal(state['lastSentAtUtc'], '1970-01-01T00:00:02.000Z');
  } finally { await services.dispose(); }
});

test('the accepted OGB stop remains truthful within its closing generation after disposal', async () => {
  const settings = config(); settings.hub.enabled = false; settings.ogbControl.enabled = true;
  let now = 1000; const sends: { value: unknown; done: (error: Error | null) => void }[] = [];
  const services = await createOscServices(settings, new OscParameterStore(), { now: () => now,
    sendOgbPacket(packet, _port, _host, done) { sends.push({ value: parseOscPacket(packet).values[0]?.value, done }); } });
  sends[0]!.done(null); now = 2000; await services.dispose(); assert.equal(sends[1]?.value, false); sends[1]!.done(null);
  const state = services.snapshot()['ogbControl'] as Record<string, unknown>;
  assert.equal(state['lastSentValue'], false); assert.equal(state['lastSentAtUtc'], '1970-01-01T00:00:02.000Z');
});

test('an abort-ignoring root response cannot start a later HOST_INFO request after disposal', async () => {
  const settings = config(); settings.enabled = false; settings.hub.enabled = false; settings.oscQueryEnabled = true;
  settings.oscQueryUrl = 'http://held-query.example.test/'; const discovery = discoveryFixture();
  let release: ((response: Response) => void) | undefined, requests = 0;
  const services = await createOscServices(settings, new OscParameterStore(), { bonjourFactory: discovery.factory,
    fetch: async () => { requests++; if (requests === 1) return await new Promise<Response>(resolve => { release = resolve; }); return new Response('{}'); } });
  const refreshing = services.refreshQuery(); assert.ok(release); await services.dispose(); release(new Response('{}')); await refreshing;
  assert.equal(requests, 1, 'the next network stage belongs to the cancelled generation');
});

for (const kind of ['status', 'size'] as const) test(`a rejected OSCQuery ${kind} response cancels its actual held HTTP body`, async () => {
  let closed: (() => void) | undefined; const connectionClosed = new Promise<void>(resolve => { closed = resolve; });
  const server = createServer((_request, response) => {
    response.on('close', () => closed?.()); response.writeHead(kind === 'status' ? 500 : 200,
      { 'content-type': 'application/json', ...(kind === 'size' ? { 'content-length': '2097153' } : {}) }); response.write('{');
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); const address = server.address(); assert.ok(address && typeof address !== 'string');
  const settings = config(); settings.enabled = false; settings.hub.enabled = false; settings.oscQueryEnabled = true;
  settings.oscQueryUrl = `http://127.0.0.1:${address.port}/`; const discovery = discoveryFixture();
  const services = await createOscServices(settings, new OscParameterStore(), { bonjourFactory: discovery.factory });
  try {
    await services.refreshQuery(); assert.match(String((services.snapshot()['query'] as Record<string, unknown>)['error']), /rejected or oversized/u);
    await deadline(connectionClosed, 500, 'Rejected HTTP body closes its connection');
  } finally { await services.dispose(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('a terminated CONNECTING query socket cannot overwrite a newer LISTEN-disabled snapshot', async () => {
  let listen = true, upgradeSeen = false; const held = new Set<Duplex>();
  const server = createServer((request, response) => { const hostInfo = new URL(request.url ?? '/', 'http://fixture').searchParams.has('HOST_INFO');
    response.writeHead(200, { 'content-type': 'application/json' }); response.end(JSON.stringify(hostInfo ? { NAME: 'Isolated query', EXTENSIONS: { LISTEN: listen } } : {})); });
  server.on('upgrade', (_request, socket) => { upgradeSeen = true; held.add(socket); socket.once('close', () => held.delete(socket)); });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); const address = server.address(); assert.ok(address && typeof address !== 'string');
  const settings = config(); settings.enabled = false; settings.hub.enabled = false; settings.oscQueryEnabled = true;
  settings.oscQueryUrl = `http://127.0.0.1:${address.port}/`; const discovery = discoveryFixture();
  const services = await createOscServices(settings, new OscParameterStore(), { bonjourFactory: discovery.factory });
  try {
    await services.refreshQuery(); await until(() => upgradeSeen); listen = false; await services.refreshQuery(); await setImmediate();
    const query = services.snapshot()['query'] as Record<string, unknown>; assert.equal(query['supportsListen'], false); assert.equal(query['error'], '');
  } finally { await services.dispose(); for (const socket of held) socket.destroy(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
