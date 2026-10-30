import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RealtimeWriter, type RealtimeSocket } from '../../src/node/host/realtime.ts';
class ControlledSocket implements RealtimeSocket {
  readyState = 1; terminated = false; pending: { data: string; done: (error?: Error) => void }[] = [];
  send(data: string, done: (error?: Error) => void): void { this.pending.push({ data, done }); }
  terminate(): void { this.terminated = true; this.readyState = 3; }
}
const turn = async () => { await new Promise(resolve => setImmediate(resolve)); };
test('command replies precede the next coalesced snapshot and state updates share one worker', async () => {
  const socket = new ControlledSocket(), writer = new RealtimeWriter(socket); let revision = 0;
  writer.state(() => `state-${revision}`); assert.equal(socket.pending[0]!.data, 'state-0');
  const reply = writer.reply('command-reply'); for (revision = 1; revision < 100; revision++) writer.state(() => `state-${revision}`);
  socket.pending.shift()!.done(); await turn(); assert.equal(socket.pending[0]!.data, 'command-reply');
  socket.pending.shift()!.done(); await reply; await turn(); assert.equal(socket.pending[0]!.data, 'state-100');
  socket.pending.shift()!.done(); await turn(); assert.equal(socket.pending.length, 0); writer.stop();
});
test('failed or timed-out sends terminate the socket and reject queued command replies', async () => {
  const socket = new ControlledSocket(), writer = new RealtimeWriter(socket, 15);
  const active = writer.reply('active'), next = writer.reply('queued');
  await Promise.all([assert.rejects(active, /timed out/), assert.rejects(next, /timed out/)]);
  assert.equal(writer.isStopped, true); assert.equal(socket.terminated, true); assert.equal(socket.pending.length, 1);
  socket.pending.shift()!.done(); await assert.rejects(writer.reply('late'), /closed/);
});
test('shutdown rejects active replies and never serializes pending snapshots', async () => {
  const socket = new ControlledSocket(), writer = new RealtimeWriter(socket); const sent = writer.reply('reply');
  writer.state(() => { throw new Error('Must not serialize after shutdown'); }); writer.stop();
  await assert.rejects(sent, /closed/); await turn(); assert.equal(socket.pending.length, 1);
});
