import assert from 'node:assert/strict';
import test from 'node:test';
import { SensaMotionAdapter } from '../../src/node/outputs/sensa.ts';
import { FakeSocket, deferred, frame, output } from './output-support.ts';

test('Sensa WebSocket sends active axes with correlated serialized acknowledgement and an explicit stop', async () => {
  const frames: Record<string, unknown>[] = [], socket = new FakeSocket((text, channel) => { frames.push(JSON.parse(text) as Record<string, unknown>); channel.emit({ ok: true }); });
  const adapter = new SensaMotionAdapter(output('SensaWebSocket'), { socketFactory: async () => socket }); await adapter.connect(); await adapter.sendMotion(frame({ L0: .3, V0: .7 }, { activeAxes: ['L0'], requestedCommandMode: 'Interval', requestedMotionValue: 123 })); await adapter.stop();
  assert.deepEqual(frames[0], { type: 'signal', values: { L0: .3 }, durationMs: 123, commands: [{ channel: 'L0', value: .3, durationMs: 123 }] }); assert.deepEqual(frames[1], { type: 'stop', command: 'stop' }); await adapter.close();
});
test('Sensa rejected WebSocket acknowledgement terminates the session', async () => {
  const socket = new FakeSocket((_text, channel) => channel.emit({ ok: false, error: 'denied' })), adapter = new SensaMotionAdapter(output('SensaWebSocket'), { socketFactory: async () => socket }); await adapter.connect(); await assert.rejects(adapter.sendMotion(frame()), /invalid acknowledgement/u); assert.equal(adapter.connected, false); await adapter.close();
});
test('Sensa HTTP waits for motion response before stop and preserves its session header', async () => {
  const acknowledged = deferred<void>(), begun = deferred<void>(), requests: { body: unknown; session: string; redirect: string | undefined }[] = [];
  const config = output('SensaHttp'); config.websocketAddress = 'http://127.0.0.1:4001/api/signal';
  const adapter = new SensaMotionAdapter(config, { async fetch(_url, init) { const headers = new Headers(init?.headers); requests.push({ body: JSON.parse(String(init?.body)) as unknown, session: headers.get('X-Sensa-Session') ?? '', redirect: init?.redirect }); if (requests.length === 1) { begun.resolve(); await acknowledged.promise; } return new Response('{}', { status: 200 }); } });
  await adapter.connect(); const sending = adapter.sendMotion(frame({ L0: .4 })); await begun.promise; const stopping = adapter.stop(); assert.equal(requests.length, 1); acknowledged.resolve(); await Promise.all([sending, stopping]); assert.equal(requests.length, 2); assert.equal(requests[0]?.session, requests[1]?.session); assert.ok(requests[0]?.session.startsWith('node-')); assert.equal(requests[0]?.redirect, 'error'); assert.deepEqual(requests[1]?.body, { command: 'stop', type: 'stop' }); await adapter.close();
});
