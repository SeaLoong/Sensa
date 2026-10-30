import assert from 'node:assert/strict';
import { createSocket } from 'node:dgram';
import { once } from 'node:events';
import { setTimeout } from 'node:timers/promises';
import test from 'node:test';
import { OscParameterStore } from '../../src/core/protocols/osc.ts';
import { createOscServices } from '../../src/node/inputs/osc-services.ts';
import type { OscServices, OscServicesConfig } from '../../src/node/inputs/osc-services.ts';

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
