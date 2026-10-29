import test from 'node:test';
import assert from 'node:assert/strict';
import { OutputLane, SensaEngine, parseFunscript, scriptValue, tcodeFrame } from '../../src/core/index.ts';
import { createExplorerInput } from '../../src/websensa/explorer-input.ts';

const script = { actions: [{ at: 0, pos: 80 }, { at: 1000, pos: 20 }, { at: 2000, pos: 90 }] };
const flush = async () => { for (let index = 0; index < 15; index++) await Promise.resolve(); };
function rig() {
  let clock = 0, counter = 0;
  const timers = new Map(), sent = [];
  const controller = new SensaEngine({ now: () => clock, interval: callback => { const id = ++counter; timers.set(id, callback); return id; }, clear: id => timers.delete(id) });
  const transport = { async send(frame) { sent.push(structuredClone(frame)); }, async stop() { sent.push('stop'); }, async close() { sent.push('close'); } };
  return { controller, sent, transport, timers, time(value) { clock = value; }, tick() { for (const callback of [...timers.values()]) callback(); } };
}

test('funscript retains a nonzero first action and interpolates across bounded sorted actions', () => {
  const parsed = parseFunscript(script);
  assert.equal(scriptValue(parsed, 0), .8); assert.equal(scriptValue(parsed, 500), .5);
  assert.equal(scriptValue(parsed, 1500), .55); assert.equal(scriptValue(parsed, 9999), .9);
  assert.equal(scriptValue(parseFunscript({ actions: [{ at: 400, pos: 72 }] }), 0), .72);
  assert.throws(() => { parsed.actions[0].pos = 12; });
});

test('funscript duplicate timestamps use the last exact sample and reject invalid or unordered points', () => {
  const parsed = parseFunscript({ actions: [{ at: 0, pos: 1 }, { at: 0, pos: 89 }, { at: 4, pos: 20 }] });
  assert.equal(parsed.actions.length, 2); assert.equal(scriptValue(parsed, 0), .89);
  for (const input of [null, {}, { actions: [] }, { actions: [{ at: 1, pos: 50 }, { at: 0, pos: 20 }] },
    ...[-1, .5, NaN, Infinity, 604800001].map(at => ({ actions: [{ at, pos: 20 }] })),
    ...[-1, 101, .5, '20', NaN].map(pos => ({ actions: [{ at: 0, pos }] }))]) assert.throws(() => parseFunscript(input));
});

test('TCode framing preserves selected axes and rejects nonfinite targets and invalid durations', () => {
  assert.equal(tcodeFrame({ L0: .5, V0: 1 }, 100), 'L05000I100 V09999I100\n');
  assert.equal(tcodeFrame({ R0: 0 }), 'R00000\n');
  for (const values of [{}, { X0: .5 }, { L0: Infinity }, { V0: -1 }, { L0: 1.01 }]) assert.throws(() => tcodeFrame(values));
  for (const duration of [-1, .5, 60001]) assert.throws(() => tcodeFrame({ L0: .5 }, duration));
});

test('controller fanout connects without output and explicit activation delivers the same frame independently', async () => {
  const r = rig(), other = [];
  r.controller.addOutput('one', r.transport);
  r.controller.addOutput('two', { async send(frame) { other.push(frame.values); }, async stop() {}, async close() {} });
  r.controller.setManual('L0', .7); await flush(); assert.deepEqual(r.sent, []);
  await r.controller.activate(true); assert.deepEqual(r.sent[0].values, { L0: .7 }); assert.deepEqual(other[0], { L0: .7 });
  assert.equal(r.timers.size, 1); await r.controller.activate(true); assert.equal(r.timers.size, 1);
  await r.controller.dispose(); assert.equal(r.timers.size, 0); assert.equal(r.sent.at(-1), 'close');
});

test('a slow destination coalesces stale targets and cannot delay a second output', async () => {
  const r = rig(); let release;
  const slow = [], gate = new Promise(resolve => { release = resolve; });
  r.controller.addOutput('slow', { async send(frame) { slow.push(frame.values.L0); if (slow.length === 1) await gate; }, async stop() { slow.push('stop'); }, async close() {} });
  r.controller.addOutput('fast', r.transport);
  const activation = r.controller.activate(true); await flush();
  r.controller.setManual('L0', .6); r.controller.setManual('L0', .7); r.controller.setManual('L0', .8); await flush();
  assert.equal(r.sent.at(-1).values.L0, .8); assert.deepEqual(slow, [.5]);
  release(); await activation; await flush(); assert.deepEqual(slow, [.5, .8]); await r.controller.dispose();
});

test('stop is a queue barrier: stale queued values disappear and a later activation follows stop', async () => {
  let release;
  const events = [], gate = new Promise(resolve => { release = resolve; });
  const lane = new OutputLane({ async send(frame) { events.push(frame); if (events.length === 1) await gate; }, async stop() { events.push('stop'); }, async close() { events.push('close'); } });
  const first = lane.send('first'), obsolete = lane.send('obsolete');
  const stopped = lane.stop(), fresh = lane.send('fresh');
  release(); await Promise.all([first, obsolete, stopped, fresh]);
  assert.deepEqual(events, ['first', 'stop', 'fresh']); await lane.close(); assert.deepEqual(events.slice(-2), ['stop', 'close']);
});

test('closing an output rejects new frames while its in-flight write is completing', async () => {
  let release; const events = [], gate = new Promise(resolve => { release = resolve; });
  const lane = new OutputLane({ async send(frame) { events.push(frame); await gate; }, async stop() { events.push('stop'); }, async close() { events.push('close'); } });
  const first = lane.send('first'), closing = lane.close(); await lane.send('late'); release(); await first; await closing;
  assert.deepEqual(events, ['first', 'stop', 'close']);
});

test('failed destination stops and releases itself without dropping healthy fanout', async () => {
  const r = rig(), bad = [];
  r.controller.addOutput('bad', { async send() { throw new Error('broken'); }, async stop() { bad.push('stop'); }, async close() { bad.push('close'); } });
  r.controller.addOutput('good', r.transport); await r.controller.activate(true); await flush();
  assert.deepEqual(bad, ['stop', 'close']); assert.equal(r.controller.snapshot().outputs[0].connected, false);
  r.controller.setManual('L0', .8); await flush(); assert.equal(r.sent.at(-1).values.L0, .8); await r.controller.dispose();
});

test('script load, mode and axis changes disarm and clear old work while retaining the first target', async () => {
  const r = rig(); r.controller.addOutput('one', r.transport); await r.controller.activate(true);
  await r.controller.loadScript(script, 'test.funscript');
  assert.equal(r.controller.snapshot().active, false); assert.equal(r.controller.snapshot().playing, false);
  assert.deepEqual(r.controller.frame().values, { L0: .8 });
  await r.controller.setScriptAxis('V0'); assert.deepEqual(r.controller.frame().values, { V0: .8 });
  r.controller.seek(500); assert.equal(r.controller.frame().values.V0, .5); r.controller.seek(0); assert.equal(r.controller.frame().values.V0, .8);
  await r.controller.activate(true); await r.controller.setMode('manual'); assert.equal(r.controller.snapshot().active, false);
  await r.controller.dispose();
});

test('script playback uses monotonic clock, speed changes, looping and pause stop without rewinding', async () => {
  const r = rig(); r.controller.addOutput('one', r.transport); await r.controller.loadScript(script);
  assert.throws(() => r.controller.play()); await r.controller.activate(true); r.controller.play();
  r.time(500); r.tick(); assert.equal(r.controller.snapshot().positionMs, 500);
  r.controller.setSpeed(2); r.time(750); r.tick(); assert.equal(r.controller.snapshot().positionMs, 1000);
  r.controller.setLoop(true); r.time(1500); r.tick(); assert.equal(r.controller.snapshot().positionMs, 500);
  await r.controller.pause(); assert.equal(r.controller.snapshot().positionMs, 500); assert.equal(r.sent.at(-1), 'stop');
  r.controller.seek(2000); r.controller.play(); assert.equal(r.controller.snapshot().positionMs, 0);
  await r.controller.dispose(); assert.equal(r.timers.size, 0);
});

test('end of a nonlooping script stops outputs and zero-duration loop cannot spin forever', async () => {
  for (const document of [script, { actions: [{ at: 0, pos: 50 }] }]) {
    const r = rig(); r.controller.addOutput('one', r.transport); await r.controller.loadScript(document);
    await r.controller.activate(true); r.controller.play(); r.time(3000); r.tick(); await flush();
    assert.equal(r.controller.snapshot().active, false); assert.equal(r.controller.snapshot().playing, false); assert.equal(r.timers.size, 0); assert.equal(r.sent.at(-1), 'stop');
    await r.controller.dispose();
  }
});

test('emergency stop does not auto-resume on clear or later input changes', async () => {
  const r = rig(); r.controller.addOutput('one', r.transport); await r.controller.activate(true);
  await r.controller.stop(true); r.controller.setManual('L0', .9); await flush(); assert.equal(r.sent.at(-1), 'stop');
  await assert.rejects(r.controller.activate(true)); r.controller.clearEmergency();
  assert.equal(r.controller.snapshot().active, false); assert.equal(r.controller.snapshot().playing, false); await r.controller.dispose();
});

test('recording exports a valid funscript with deduplicated time and relative start offset', async () => {
  const r = rig(); await r.controller.activate(true); r.time(900); r.controller.record(true);
  r.controller.setManual('L0', .7); r.time(1000); r.controller.setManual('L0', .8); r.controller.record(false);
  const actions = r.controller.snapshot().recordedActions;
  assert.deepEqual(actions, [{ at: 0, pos: 70 }, { at: 100, pos: 80 }]); assert.equal(parseFunscript({ actions }).durationMs, 100);
  await r.controller.dispose();
});

test('external input previews remain passive, then timeout stops and later packets cannot rearm', async () => {
  const r = rig(); r.controller.addOutput('one', r.transport); await r.controller.setMode('external');
  await assert.rejects(r.controller.activate(true)); r.controller.receiveExternal({ L0: .7 }); await flush(); assert.equal(r.sent.at(-1), 'stop');
  await r.controller.activate(true); assert.equal(r.sent.at(-1).values.L0, .7);
  r.time(1200); r.tick(); await flush(); assert.equal(r.controller.snapshot().active, false); assert.equal(r.sent.at(-1), 'stop');
  r.controller.receiveExternal({ L0: .9 }); await flush(); assert.equal(r.sent.at(-1), 'stop'); assert.equal(r.controller.snapshot().active, false);
  assert.throws(() => r.controller.receiveExternal({ L0: .8, V0: NaN })); assert.equal(r.controller.externalValues.L0, .9); await r.controller.dispose();
});

test('explorer handshake validates exact window, origin, session, monotonic packet and atomic finite axes', () => {
  const sent = [], frames = [], stops = [], opener = { postMessage: (...args) => sent.push(args) }, origin = 'https://example.test';
  const session = 'a'.repeat(32), input = createExplorerInput({ opener, origin, session, receive: values => frames.push(values), stop: () => stops.push('stop'), now: () => 1000 });
  const valid = { source: opener, origin, data: { type: 'sensa.signal.v1', session, sequence: 1, timestamp: 1000, axes: { L0: .7 } } };
  assert.equal(input.handle(valid), false); input.connect(); assert.deepEqual(sent, [[{ type: 'sensa.signal.ready.v1', session }, origin]]);
  for (const event of [{ ...valid, source: {} }, { ...valid, origin: 'https://other.test' }, { ...valid, data: { ...valid.data, session: 'wrong' } },
    { ...valid, data: { ...valid.data, timestamp: -10000 } }, { ...valid, data: { ...valid.data, axes: { L0: .7, V0: 2 } } }]) assert.equal(input.handle(event), false);
  assert.equal(input.handle(valid), true); assert.deepEqual(frames, [{ L0: .7 }]); assert.equal(input.handle(valid), false);
  assert.equal(input.handle({ ...valid, data: { ...valid.data, type: 'sensa.signal.stop.v1', sequence: 2 } }), true); assert.deepEqual(stops, ['stop']);
  input.disconnect(); assert.equal(input.handle({ ...valid, data: { ...valid.data, sequence: 3 } }), false);
  assert.equal(createExplorerInput({ opener: null, origin, session }), null);
});

test('inverted funscript has identical direction to the desktop player', () => {
  const parsed = parseFunscript({ inverted: true, actions: [{ at: 0, pos: 20 }, { at: 1000, pos: 80 }] });
  assert.equal(scriptValue(parsed, 0), .8); assert.equal(scriptValue(parsed, 1000), .2); assert.equal(scriptValue(parsed, 500), .5);
  assert.throws(() => parseFunscript({ inverted: 'true', actions: [{ at: 0, pos: 20 }] }));
});

test('constant recording retains terminal duration and bounded recordings can always be imported', async () => {
  const r = rig(); await r.controller.activate(true); r.controller.record(true); r.time(10000); r.controller.record(false);
  assert.deepEqual(r.controller.snapshot().recordedActions, [{ at: 0, pos: 50 }, { at: 10000, pos: 50 }]);
  assert.equal(parseFunscript({ actions: r.controller.snapshot().recordedActions }).durationMs, 10000);
  r.controller.record(true);
  for (let index = 0; index < 200005; index++) { r.time(10001 + index); r.controller.setManual('L0', index % 2); }
  assert.equal(r.controller.snapshot().recording, false); assert.equal(r.controller.snapshot().recordedActions.length, 200000);
  assert.equal(parseFunscript({ actions: r.controller.snapshot().recordedActions }).actions.length, 200000);
  await r.controller.dispose();
});

test('external activation rejects an absent selected axis and source changes stop without empty frames', async () => {
  const r = rig(); r.controller.addOutput('one', r.transport); await r.controller.setMode('external');
  r.controller.receiveExternal({ V0: .7 }); await assert.rejects(r.controller.activate(true), /Select an axis/);
  await r.controller.setAxes(['V0']); await r.controller.activate(true); assert.deepEqual(r.sent.at(-1).values, { V0: .7 });
  r.controller.receiveExternal({ L0: .3 }); await flush(); assert.equal(r.controller.snapshot().active, false); assert.equal(r.sent.at(-1), 'stop');
  assert.equal(r.sent.some(item => typeof item === 'object' && !Object.keys(item.values).length), false); await r.controller.dispose();
});

test('configuration transitions reject concurrent activation and the latest route change wins', async () => {
  for (const change of [r => r.controller.setMode('external'), r => r.controller.setAxes(['V0']), r => r.controller.setScriptAxis('V0'), r => r.controller.loadScript(script)]) {
    const r = rig(); let release;
    const gate = new Promise(resolve => { release = resolve; });
    r.controller.addOutput('one', { async send() {}, async stop() { await gate; }, async close() {} });
    await r.controller.activate(true); const updating = change(r);
    await assert.rejects(r.controller.activate(true), /finish updating/); release(); await updating;
    assert.equal(r.controller.snapshot().active, false); await r.controller.dispose();
  }
});

test('disabling loop after a wrap finishes the current cycle instead of jumping to the end', async () => {
  const r = rig(); await r.controller.loadScript({ actions: [{ at: 0, pos: 0 }, { at: 1000, pos: 100 }] });
  r.controller.setLoop(true); await r.controller.activate(true); r.controller.play(); r.time(1250); r.tick();
  assert.equal(r.controller.snapshot().positionMs, 250); r.controller.setLoop(false); r.time(1300); r.tick();
  assert.equal(r.controller.snapshot().positionMs, 300); assert.equal(r.controller.snapshot().playing, true); await r.controller.dispose();
});

test('a completed script sends its exact final target before the stop barrier', async () => {
  const r = rig(); r.controller.addOutput('one', r.transport); await r.controller.loadScript(script); await r.controller.activate(true); r.controller.play();
  await flush(); r.time(2000); r.tick(); await flush();
  assert.equal(r.sent.at(-2).values.L0, .9); assert.equal(r.sent.at(-1), 'stop'); await r.controller.dispose();
});

test('a delayed external packet cannot bypass expiry when background timers have not fired', async () => {
  const r = rig(); r.controller.addOutput('one', r.transport); await r.controller.setMode('external'); r.controller.receiveExternal({ L0: .5 }); await r.controller.activate(true);
  r.time(1200); r.controller.receiveExternal({ L0: .9 }); await flush();
  assert.equal(r.controller.snapshot().active, false); assert.equal(r.sent.at(-1), 'stop'); assert.equal(r.controller.externalValues.L0, .9); await r.controller.dispose();
});

test('natural script completion stops each healthy output independently of a blocked final acknowledgement', async () => {
  const r = rig(); let release, final = false; const slow = [], gate = new Promise(resolve => { release = resolve; });
  r.controller.addOutput('slow', { async send(frame) { slow.push(frame.values.L0); if (final) await gate; }, async stop() { slow.push('stop'); }, async close() {} });
  r.controller.addOutput('fast', r.transport); await r.controller.loadScript(script); await r.controller.activate(true); r.controller.play(); await flush();
  final = true; r.time(2000); r.tick(); await flush();
  assert.equal(r.controller.snapshot().active, false); assert.equal(r.controller.snapshot().playing, false);
  assert.equal(r.sent.at(-2).values.L0, .9); assert.equal(r.sent.at(-1), 'stop'); assert.equal(slow.at(-1), .9);
  release(); await flush(); assert.equal(slow.at(-1), 'stop'); await r.controller.dispose();
});

test('explicit stop cancels an obsolete queued terminal target before a fresh activation', async () => {
  let release; const events = [], gate = new Promise(resolve => { release = resolve; });
  const lane = new OutputLane({ async send(value) { events.push(value); if (value === 'inflight') await gate; }, async stop() { events.push('stop'); }, async close() {} });
  const writing = lane.send('inflight'), obsolete = lane.finish('old-final'), stopped = lane.stop(), fresh = lane.send('fresh');
  release(); await Promise.all([writing, obsolete, stopped, fresh]); assert.deepEqual(events, ['inflight', 'stop', 'fresh']); await lane.close();
});
