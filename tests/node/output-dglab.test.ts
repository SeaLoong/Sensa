import assert from 'node:assert/strict';
import test from 'node:test';
import { DglabAdapter } from '../../src/node/outputs/dglab.ts';
import { FakeSocket, output, deferred } from './output-support.ts';

async function connected() {
  const config = output('Dglab'); config.signal.clientId = 'app'; config.signal.slotId = 'slot'; config.signal.channel = 0; config.signal.maxIntensity = 10; config.signal.taskDurationMs = 400; config.signal.waveformFrames = ['0A0A0A0A64646464'];
  let intercept: ((request: Record<string, unknown>) => boolean) | null = null;
  const requests: Record<string, unknown>[] = [], socket = new FakeSocket((text, channel) => { const envelope = JSON.parse(text) as { type: string; clientId: string; data: Record<string, unknown> }; if (envelope.type !== 'message') return; requests.push(envelope.data); if (!intercept?.(envelope.data)) channel.emit({ type: 'message', clientId: envelope.clientId, data: { t: 'resp', reqId: envelope.data['reqId'], result: {} } }); });
  const adapter = new DglabAdapter(config, { socketFactory: async () => { setImmediate(() => socket.emit({ type: 'hello', clientId: 'controller' })); return socket; } }); await adapter.connect();
  socket.emit({ type: 'client_attached', clientId: 'app' });
  socket.emit({ type: 'message', clientId: 'app', data: { t: 'ev', ev: 'devices.snapshot', devices: [{ slotId: 'slot', name: 'mock', type: 'COYOTE_030', props: { connectState: 'connected' }, slotState: { hasDevice: true, channelA: { intensityMax: 20, isMuted: false } } }] } });
  return { adapter, config, socket, requests, intercept(value: typeof intercept) { intercept = value; }, event(data: unknown) { socket.emit({ type: 'message', clientId: 'app', data }); } };
}
test('DG-LAB discovery, patches and action feedback preserve paired identity and native intensity units', async () => {
  const rig = await connected(); try {
    assert.equal(rig.adapter.connected, true); assert.equal(rig.adapter.devices().length, 1); assert.equal(rig.adapter.feedback('connected'), 1);
    rig.event({ t: 'ev', ev: 'custom.action', action: 4 }); assert.equal(rig.adapter.feedback('action.4'), 1); assert.equal(rig.adapter.feedback('actionSequence'), 1);
    await rig.adapter.sendSignal({ address: 'Intensity', value: 17 }); assert.deepEqual(rig.requests.at(-1)?.['data'], { s: 'slot', c: 0, t: 4, v: 10, d: 400, im: true, p: 1 });
    rig.event({ t: 'ev', ev: 'slots.patch', slots: [{ slotId: 'slot', slotState: { channelA: { intensityMax: 4 } } }] }); await rig.adapter.sendSignal({ address: 'Intensity', value: 9 }); assert.equal((rig.requests.at(-1)!['data'] as Record<string, unknown>)['v'], 4);
    rig.event({ t: 'ev', ev: 'slots.patch', slots: [{ slotId: 'slot', slotState: { channelA: { isMuted: true } } }] }); await rig.adapter.sendSignal({ address: 'Intensity', value: 9 }); assert.equal((rig.requests.at(-1)!['data'] as Record<string, unknown>)['v'], 0); assert.equal(rig.adapter.feedback('slotState.channelA.intensityMax'), 4);
    await rig.adapter.stop(); assert.deepEqual(rig.requests.slice(-2).map(row => row['m']), ['device.op.clear', 'device.op']); assert.equal((rig.requests.at(-1)!['data'] as Record<string, unknown>)['t'], 7);
  } finally { await rig.adapter.close(); }
});
test('DG-LAB pulse uses finite frame tasks and an explicit zero clears only its selected channel', async () => {
  const rig = await connected(); try {
    await rig.adapter.sendSignal({ address: 'Pulse', value: 1, channel: 1 }); const task = rig.requests.at(-1)?.['data'] as Record<string, unknown>; assert.equal(task['d'], 400); assert.equal(task['loop'], undefined); assert.equal(task['c'], 1); assert.equal(task['ver'], 3);
    await rig.adapter.sendSignal({ address: 'Pulse', value: 0, channel: 1 }); assert.ok(rig.requests.slice(-2).every(row => (row['data'] as Record<string, unknown>)['c'] === 1));
  } finally { await rig.adapter.close(); }
});
test('DG-LAB rejected commands fault further control but retain the acknowledged emergency stop path', async () => {
  const rig = await connected(); let rejected = false;
  try { rig.intercept(request => { if (!rejected && request['m'] === 'device.op') { rejected = true; rig.event({ t: 'resp', reqId: request['reqId'], error: 'rejected' }); return true; } return false; });
    await assert.rejects(rig.adapter.sendSignal({ address: 'Intensity', value: 5 }), /rejected/u); assert.equal(rig.adapter.connected, false); await rig.adapter.stop(); assert.equal(rig.requests.at(-2)?.['m'], 'device.op.clear');
  } finally { await rig.adapter.close(); }
});
test('DG-LAB request ids are isolated by APP identity and disconnect rejects its pending waiter', async () => {
  const rig = await connected(), requested = deferred<void>(); let requestId: unknown;
  try { rig.intercept(request => { requestId = request['reqId']; requested.resolve(); return true; }); const sending = rig.adapter.sendSignal({ address: 'Intensity', value: 5 }); await requested.promise;
    rig.socket.emit({ type: 'client_attached', clientId: 'other' }); rig.socket.emit({ type: 'message', clientId: 'other', data: { t: 'resp', reqId: requestId, result: {} } }); rig.socket.emit({ type: 'client_disconnected', clientId: 'app' });
    await assert.rejects(sending, /APP disconnected/u); assert.equal(rig.adapter.devices().length, 0);
  } finally { await rig.adapter.close(); }
});
test('DG-LAB oversized discovery and changing pairing identity end the connection', async () => {
  for (const bad of ['large', 'identity']) { const rig = await connected(); try { if (bad === 'large') rig.event({ t: 'ev', ev: 'devices.snapshot', devices: Array.from({ length: 257 }, (_, slotId) => ({ slotId: String(slotId) })) }); else rig.socket.emit({ type: 'hello', clientId: 'different' }); assert.equal(rig.adapter.connected, false); assert.equal(rig.socket.closeCount, 1); } finally { await rig.adapter.close(); } }
});
