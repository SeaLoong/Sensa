import test from 'node:test';
import assert from 'node:assert/strict';
import { RuntimeEngine, RuntimeScriptPlayer, OutputCoordinator, OutputLane, AXES, isAxis,
  normalizeConfiguration, defaultOutputDeviceConfig, neutralValues,
  parseFunscript, scriptValue, tcodeFrame } from '../../src/core/index.ts';
import { createExplorerInput } from '../../src/websensa/explorer-input.ts';

const script = { actions: [{ at: 0, pos: 80 }, { at: 1000, pos: 20 }, { at: 2000, pos: 90 }] };
const flush = async () => { for (let index = 0; index < 30; index++) await Promise.resolve(); };
function deferred() { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; }
function adapter(send = () => {}) {
  return { connected: false, events: [], async connect() { this.connected = true; },
    async sendMotion(frame) { this.events.push(structuredClone(frame)); await send(frame); },
    async sendSignal() {}, async stop() { this.events.push('stop'); },
    async close() { this.connected = false; this.events.push('close'); } };
}
async function rig(adapters = [adapter()]) {
  let now = 0, outputs;
  const config = normalizeConfiguration({ outputs: adapters.map((_, index) => ({ ...defaultOutputDeviceConfig(), id: 'out' + index, type: 'TCodeTcp', enabled: true, port: 8000 + index })) });
  const runtime = new RuntimeEngine(config, { now: () => now, sendFrame: frame => outputs.sendFrame(frame), stopOutputs: () => outputs.emergencyStop(), stopUnboundOutputs: () => outputs.stopUnbound() });
  outputs = new OutputCoordinator(runtime.getConfig(), { now: () => now, createAdapter: config => adapters[Number(config.id.slice(3))], canSend: () => runtime.getSnapshot().canSend });
  await outputs.connectEnabled();
  return { runtime, outputs, adapters, time(value) { now = value; }, tick() { runtime.tick(); },
    async settle() { await runtime.flush(); await outputs.flush(); },
    async close() { runtime.dispose(); await runtime.flush(); await outputs.close(); } };
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

test('the public axis set and wire encoder retain all twelve runtime axes', () => {
  assert.deepEqual(AXES, ['L0', 'L1', 'L2', 'R0', 'R1', 'R2', 'V0', 'V1', 'V2', 'A0', 'A1', 'A2']);
  assert.equal(isAxis('A2'), true); assert.equal(isAxis('V3'), false);
  assert.equal(tcodeFrame({ V1: 1, V2: .5, A0: 0, A1: .25, A2: .75 }), 'V19999 V25000 A00000 A12500 A27499\n');
});

test('the one runtime and shared fanout connect passively and deliver selected axes only after activation', async () => {
  const r = await rig([adapter(), adapter()]);
  r.runtime.setManual({ values: { ...neutralValues(), L0: .7, A2: .9 }, deltaMs: 100, activeAxes: ['L0', 'A2'] });
  await r.settle(); assert.deepEqual(r.adapters.map(output => output.events), [[], []]);
  r.runtime.setInputActive(true); await r.settle();
  for (const output of r.adapters) {
    assert.equal(output.events[0].values.L0, .7); assert.equal(output.events[0].values.A2, .9);
    assert.deepEqual(output.events[0].activeAxes, ['L0', 'A2']);
  }
  await r.close(); for (const output of r.adapters) assert.equal(output.events.at(-1), 'close');
});

test('slow fanout coalesces latest targets independently while explicit stop cancels the old queue', async () => {
  const gate = deferred(); let first = true;
  const slow = adapter(async () => { if (first) { first = false; await gate.promise; } }), fast = adapter();
  const r = await rig([slow, fast]); r.runtime.setManual({ L0: .1 }); r.runtime.setInputActive(true); await flush();
  r.runtime.setManual({ L0: .6 }); r.runtime.setManual({ L0: .7 }); await flush();
  assert.equal(fast.events.at(-1).values.L0, .7); assert.deepEqual(slow.events.map(value => value.values.L0), [.1]);
  r.runtime.emergencyStop(); r.runtime.clearEmergency(); r.runtime.setManual({ L0: .9 }); r.runtime.setInputActive(true); await flush();
  gate.resolve(); await r.settle();
  assert.deepEqual(slow.events.map(value => typeof value === 'string' ? value : value.values.L0), [.1, 'stop', .9]);
  assert.deepEqual(fast.events.slice(-2).map(value => typeof value === 'string' ? value : value.values.L0), ['stop', .9]);
  await r.close();
});

test('a lifecycle barrier removes queued motion and orders the fresh epoch after stop', async () => {
  const gate = deferred(), entered = deferred(), events = [], lane = new OutputLane();
  const first = lane.enqueue(async () => { events.push('first'); entered.resolve(); await gate.promise; });
  await entered.promise;
  const obsolete = lane.enqueue(async () => { events.push('obsolete'); });
  const stop = lane.barrier(async () => { events.push('stop'); });
  const fresh = lane.enqueue(async () => { events.push('fresh'); });
  gate.resolve(); await Promise.all([first, obsolete, stop, fresh]);
  assert.deepEqual(events, ['first', 'stop', 'fresh']);
  await lane.close(async () => { events.push('close'); }); assert.equal(events.at(-1), 'close');
});

test('closing the shared lifecycle lane drops pending motion and rejects late operations', async () => {
  const gate = deferred(), entered = deferred(), events = [], lane = new OutputLane();
  const first = lane.enqueue(async () => { events.push('first'); entered.resolve(); await gate.promise; });
  await entered.promise; const obsolete = lane.enqueue(async () => { events.push('obsolete'); });
  const closing = lane.close(async () => { events.push('stop'); events.push('close'); });
  await assert.rejects(lane.enqueue(async () => { events.push('late'); }), /closed/);
  gate.resolve(); await Promise.all([first, obsolete, closing]); assert.deepEqual(events, ['first', 'stop', 'close']);
});

test('natural completion preserves the final target and activation in the shared runtime', async () => {
  for (const document of [script, { actions: [{ at: 0, pos: 50 }] }]) {
    const r = await rig(); r.runtime.loadScript('test.funscript', document); r.runtime.setInputActive(true); r.runtime.playScript();
    r.time(3000); r.tick(); await r.settle();
    assert.equal(r.runtime.getSnapshot().inputActive, true); assert.equal(r.runtime.getScriptSnapshot().playing, false);
    assert.equal(r.adapters[0].events.at(-1).values.L0, document.actions.at(-1).pos / 100);
    assert.equal(r.adapters[0].events.includes('stop'), false);
    r.runtime.stopScript(); await r.settle(); assert.equal(r.adapters[0].events.at(-1), 'stop'); await r.close();
  }
});

test('a blocked final acknowledgement cannot delay the healthy lane, and explicit stop preserves each lane order', async () => {
  const gate = deferred(); let final = false;
  const slow = adapter(async () => { if (final) await gate.promise; }), fast = adapter(), r = await rig([slow, fast]);
  r.runtime.loadScript('last.funscript', script); r.runtime.setInputActive(true); r.runtime.playScript(); await r.settle();
  final = true; r.time(2000); r.tick(); await flush();
  assert.equal(fast.events.at(-1).values.L0, .9); assert.equal(slow.events.at(-1).values.L0, .9);
  assert.equal(r.runtime.getSnapshot().inputActive, true); assert.equal(r.runtime.getScriptSnapshot().playing, false);
  r.runtime.stopScript(); await flush(); assert.equal(fast.events.at(-1), 'stop'); assert.equal(slow.events.at(-1).values.L0, .9);
  gate.resolve(); await r.settle(); assert.equal(slow.events.at(-1), 'stop'); await r.close();
});

test('turning looping off after a wrap finishes the current cycle at the selected speed', () => {
  let now = 0; const player = new RuntimeScriptPlayer(() => now); player.load('loop', { actions: [{ at: 0, pos: 0 }, { at: 1000, pos: 100 }] });
  player.play({ loop: true }); now = 1250; player.tick(); assert.equal(player.getSnapshot().positionMs, 250);
  player.configure({ loop: false, speed: 2 }); now = 1300; player.tick(); assert.equal(player.getSnapshot().positionMs, 350);
  player.pause(); now = 9999; player.tick(); assert.equal(player.getSnapshot().positionMs, 350); player.dispose();
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

test('the Explorer wire accepts every runtime axis and rejects an invalid packet atomically', () => {
  const frames = [], opener = { postMessage() {} }, origin = 'https://example.test', session = 'b'.repeat(32);
  const input = createExplorerInput({ opener, origin, session, receive: values => frames.push(values), stop() {}, now: () => 1 });
  input.connect(); const event = axes => ({ source: opener, origin, data: { type: 'sensa.signal.v1', session, sequence: 1, timestamp: 1, axes } });
  assert.equal(input.handle(event({ A2: .6, V2: NaN })), false); assert.deepEqual(frames, []);
  const axes = Object.fromEntries(AXES.map((axis, index) => [axis, index / 12])); assert.equal(input.handle(event(axes)), true); assert.deepEqual(frames, [axes]); input.disconnect();
});

// Full configuration/source/emergency/lease/recording regressions live in
// tests/runtime/domain-runtime.test.ts; protocol ownership and lane failures are
// exercised by tests/node/input-*.test.ts and output-coordinator.test.ts.
