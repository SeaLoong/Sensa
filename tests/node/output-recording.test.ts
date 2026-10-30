import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { FunscriptSegments, SignalReplay, SESSION_CSV_HEADER, encodeSessionRow } from '../../src/core/outputs/recording.ts';
import { RecordingAdapter, listRecordings, readRecording } from '../../src/node/outputs/adapters.ts';
import type { ComputedSignalSample } from '../../src/core/runtime/model.ts';
import { output, binding, configuration, deferred, MemoryAdapter } from './output-support.ts';
import { OutputCoordinator } from '../../src/core/outputs/coordinator.ts';

function sample(value: number | null, reason = ''): ComputedSignalSample { return { value, valid: value !== null, reason, sourceKey: 'source', timestampMs: 0, coordinateFrame: 'Normalized', originKey: null }; }
test('funscript recording closes invalid intervals, appends a held tail and preserves later segment offsets', () => {
  const segments = new FunscriptSegments(); segments.append('axis', sample(.2), .2, 1000); segments.append('axis', sample(.2), .2, 1100);
  const first = segments.append('axis', sample(null), null, 1200); assert.deepEqual(first, [{ signalId: 'axis', segment: 1, startOffsetMs: 0, actions: [{ at: 0, pos: 20 }, { at: 100, pos: 20 }, { at: 200, pos: 20 }] }]);
  segments.append('axis', sample(.8), .8, 1400); assert.deepEqual(segments.complete(1500), [{ signalId: 'axis', segment: 2, startOffsetMs: 400, actions: [{ at: 0, pos: 80 }, { at: 100, pos: 80 }] }]); assert.deepEqual(segments.complete(1700), []);
});
test('recording preserves a held point before a later move so replay does not start moving early', () => {
  const segments = new FunscriptSegments(); segments.append('axis', sample(.2), .2, 0); segments.append('axis', sample(.2), .2, 100); segments.append('axis', sample(.8), .8, 200);
  const [segment] = segments.complete(200), replay = new SignalReplay(); replay.load('hold.funscript', JSON.stringify({ actions: segment?.actions })); replay.seek(50); assert.equal(replay.sample('value').value, .2); replay.seek(150); assert.equal(replay.sample('value').value, .5);
});
test('funscript track and segment limits remain bounded independently of action count', () => {
  const tracks = new FunscriptSegments(); for (let index = 0; index < 65; index++) tracks.append(String(index), sample(.5), .5, 0); assert.equal(tracks.full, true); assert.equal(tracks.complete(1).length, 64);
  const clips = new FunscriptSegments(); let count = 0; for (let index = 0; index < 1025; index++) { clips.append('axis', sample(.5), .5, index * 2); count += clips.append('axis', sample(null), null, index * 2 + 1).length; } assert.equal(clips.full, true); assert.equal(count, 1024);
});
test('a full funscript remains within the replay action limit when stopping adds a held tail', () => {
  const segments = new FunscriptSegments(); for (let index = 0; index < 250000; index++) segments.append('axis', sample(index % 2), index % 2, index);
  const [segment] = segments.complete(250000); assert.equal(segment?.actions.length, 250000); assert.equal(segments.full, true); const replay = new SignalReplay(); replay.load('full.funscript', JSON.stringify({ actions: segment?.actions })); assert.equal(replay.durationMs, 249999);
});
for (const csv of [false, true]) test(`diagnostic ${csv ? 'CSV' : 'JSONL'} replay preserves raw values, invalidity and metadata`, () => {
  let now = 0; const replay = new SignalReplay(() => now), rows = [{ timeMs: 0, signalId: 'signal, "A"', rawValue: .2, value: .4, valid: true, reason: '', sourceKey: 'source', coordinateFrame: 'Normalized' }, { timeMs: 100, signalId: 'signal, "A"', rawValue: null, value: null, valid: false, reason: 'missing, "input"', sourceKey: 'source', coordinateFrame: 'Normalized' }, { timeMs: 200, signalId: 'signal, "A"', rawValue: .8, value: .6, valid: true, reason: '', sourceKey: 'source', coordinateFrame: 'Normalized' }];
  replay.load(csv ? 'session.csv' : 'session.jsonl', [csv ? SESSION_CSV_HEADER : '{"type":"sensa-session"}', ...rows.map(row => encodeSessionRow(row, csv))].join('\n'));
  assert.equal(replay.sample('signal, "A"').value, .2); replay.play(); now = 150; assert.equal(replay.sample('signal, "A"').valid, false); assert.equal(replay.sample('signal, "A"').reason, 'missing, "input"'); replay.pause(); now = 190; assert.equal(replay.position(), 150); replay.seek(200); assert.equal(replay.sample('signal, "A"').value, .8); assert.equal(replay.sample('missing').valid, false);
});
test('funscript replay normalizes duplicate/out-of-order actions and linearly interpolates', () => {
  const replay = new SignalReplay(() => 0); replay.load('normalized.funscript', JSON.stringify({ actions: [{ at: 100, pos: 100 }, { at: 0, pos: 0 }, { at: 100, pos: 50 }] })); replay.seek(50); assert.equal(replay.sample('value').value, .25); assert.equal(replay.sample('other').valid, false); assert.throws(() => replay.seek(NaN), /finite/u);
});
test('native recording publishes segment files without partials and exposes replayable metadata', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'sensa-record-')); let now = 1000; const config = output('Recording'); config.signal.recordingFormat = 'Funscript'; const adapter = new RecordingAdapter(config, directory, () => now);
  try { await adapter.connect(); await adapter.recordSample('motion', sample(.2), .2, now); now = 1100; await adapter.recordSample('motion', sample(null), null, now); now = 1300; await adapter.recordSample('motion', sample(.8), .8, now); now = 1500; await adapter.stop(); await adapter.close();
    const names = await readdir(directory); assert.equal(names.length, 2); assert.ok(names.every(name => name.endsWith('.funscript'))); const files = await listRecordings(directory); assert.equal(files.length, 2);
    const parsed = await Promise.all(files.map(async file => JSON.parse(await readRecording(directory, file.fileName)) as { metadata: { startOffsetMs: number }; actions: unknown[] })); assert.deepEqual(parsed.map(file => file.metadata.startOffsetMs).sort((a, b) => a - b), [0, 300]); assert.ok(parsed.every(file => file.actions.length === 2)); assert.equal((adapter.snapshot() as { recordingFiles: unknown[] }).recordingFiles.length, 2);
  } finally { await adapter.close(); await rm(directory, { recursive: true, force: true }); }
});
for (const format of ['Csv', 'JsonLines'] as const) test(`native ${format} recording keeps diagnostic invalid rows and exact schema`, async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'sensa-record-')); const config = output('Recording'); config.signal.recordingFormat = format; const adapter = new RecordingAdapter(config, directory, () => 1000);
  try { await adapter.connect(); await adapter.recordSample('axis', sample(.2), .5, 1000); await adapter.recordSample('axis', sample(null, 'invalid'), null, 1100); await adapter.stop(); await adapter.close(); const [entry] = await listRecordings(directory); assert.ok(entry); const text = await readRecording(directory, entry.fileName); const replay = new SignalReplay(() => 0); replay.load(entry.fileName, text); assert.equal(replay.sample('axis').value, .2); replay.seek(100); assert.equal(replay.sample('axis').valid, false); if (format === 'Csv') assert.equal(text.split('\n')[0], SESSION_CSV_HEADER);
  } finally { await adapter.close(); await rm(directory, { recursive: true, force: true }); }
});
test('recording reads reject path traversal and symlinks while the list excludes them', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'sensa-record-'));
  try { await writeFile(path.join(directory, 'real.jsonl'), '{"type":"sensa-session"}'); await symlink(path.join(directory, 'real.jsonl'), path.join(directory, 'link.jsonl')); await assert.rejects(readRecording(directory, '../real.jsonl'), /Choose/u); await assert.rejects(readRecording(directory, 'link.jsonl'), /regular file/u); assert.deepEqual((await listRecordings(directory)).map(row => row.fileName), ['real.jsonl']); }
  finally { await rm(directory, { recursive: true, force: true }); }
});

for (const format of ['Csv', 'JsonLines'] as const) test(`input stop appends a terminal invalid ${format} sample for every recording binding`, async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'sensa-record-stop-'));
  const config = output('Recording'); config.signal.recordingFormat = format;
  config.signal.bindings = ['manual', 'smooth', 'missing'].map(id => {
    const route = binding(id, id); route.source.oscPath = id; route.sendMode = 'FixedRate'; route.rateHz = 20; return route;
  });
  let now = 1000, active = true;
  const adapter = new RecordingAdapter(config, directory, () => now);
  const coordinator = new OutputCoordinator(configuration([config]), { now: () => now, createAdapter: () => adapter, canSend: () => active });
  try {
    await coordinator.connectEnabled();
    for (now = 1000; now <= 3500; now += 50) {
      coordinator.updateBindings(now, input => input.oscPath === 'missing' ? sample(null, 'Missing input') : sample(.4));
      await coordinator.flush();
    }
    active = false; await coordinator.emergencyStop();
    const [file] = await listRecordings(directory); assert.ok(file);
    const replay = new SignalReplay(() => now); replay.load(file.fileName, await readRecording(directory, file.fileName));
    replay.seek(2550);
    for (const id of ['manual', 'smooth', 'missing']) {
      assert.equal(replay.sample(id).valid, false, id + ' must not retain an active sample after input stop');
      assert.match(replay.sample(id).reason, /Input stopped/u);
    }
  } finally { await coordinator.close(); await rm(directory, { recursive: true, force: true }); }
});

test('recording exposes a resumed funscript segment while it is active and finalizes its original identity', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'sensa-record-resume-')), config = output('Recording');
  config.signal.recordingFormat = 'Funscript'; config.signal.bindings = [binding('stroke', 'L0'), binding('twist', 'R0')];
  let now = 1000; const adapter = new RecordingAdapter(config, directory, () => now);
  type FileState = { fileName: string; signalId: string; segment: number; axis: string | null; timeOffsetMs: number; completed: boolean };
  const files = (): FileState[] => (adapter.snapshot() as { recordingFiles: FileState[] }).recordingFiles;
  try {
    await adapter.connect(); await adapter.recordSample('L0', sample(.25), .25, now); await adapter.recordSample('R0', sample(.44), .44, now);
    assert.deepEqual(files().map(file => [file.signalId, file.axis, file.completed]), [['L0', 'L0', false], ['R0', 'R0', false]]);
    assert.deepEqual(await listRecordings(directory), [], 'an active clip cannot be downloaded as a complete script');
    now = 4000; await adapter.recordSample('R0', sample(null, 'Expired source'), null, now);
    const original = files().find(file => file.signalId === 'R0'); assert.ok(original); assert.equal(original.completed, true);
    now = 4600; await adapter.recordSample('R0', sample(.5), .5, now);
    const twist = files().filter(file => file.signalId === 'R0');
    assert.deepEqual(twist.map(file => [file.segment, file.completed, file.timeOffsetMs]), [[1, true, 0], [2, false, 3600]]);
    assert.notEqual(twist[0]?.fileName, twist[1]?.fileName);
    const resumedName = twist[1]?.fileName; assert.ok(resumedName);
    now = 6700; await adapter.stop(); assert.equal(files().every(file => file.completed), true);
    const resumed = JSON.parse(await readRecording(directory, resumedName)) as { actions: { at: number; pos: number }[] };
    assert.deepEqual(resumed.actions, [{ at: 0, pos: 50 }, { at: 2100, pos: 50 }]);
    assert.equal(files().find(file => file.signalId === 'R0' && file.segment === 2)?.fileName, resumedName);
    const [first] = JSON.parse(await readRecording(directory, original.fileName)).actions as { at: number; pos: number }[];
    assert.equal(first?.pos, 44);
  } finally { await adapter.close(); await rm(directory, { recursive: true, force: true }); }
});

test('slow recording writes preserve an invalid interval and same-value OnChange recovery as separate clips', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'sensa-record-boundary-')), config = output('Recording');
  config.signal.recordingFormat = 'Funscript'; config.signal.bindings = [binding('twist', 'R0')]; config.signal.bindings[0]!.stopValue = .5;
  let now = 1000; const adapter = new RecordingAdapter(config, directory, () => now), entered = deferred<void>(), release = deferred<void>();
  const append = adapter.recordSample.bind(adapter); let first = true;
  adapter.recordSample = async (...args) => { await append(...args); if (first) { first = false; entered.resolve(); await release.promise; } };
  const coordinator = new OutputCoordinator(configuration([config]), { now: () => now, createAdapter: () => adapter, canSend: () => true });
  try {
    await coordinator.connectEnabled(); coordinator.updateBindings(now, () => sample(.5)); await entered.promise;
    now = 1100; coordinator.updateBindings(now, () => sample(null, 'Expired source'));
    now = 1200; coordinator.updateBindings(now, () => sample(.5));
    now = 1300; coordinator.updateBindings(now, () => sample(null, 'Expired source'));
    now = 1400; coordinator.updateBindings(now, () => sample(.5));
    release.resolve(); await coordinator.flush();
    const files = (adapter.snapshot() as { recordingFiles: { segment: number; completed: boolean; timeOffsetMs: number; fileName: string }[] }).recordingFiles;
    assert.deepEqual(files.map(file => [file.segment, file.completed, file.timeOffsetMs]), [[1, true, 0], [2, true, 200], [3, false, 400]]);
    const [closed] = files; assert.ok(closed);
    const clip = JSON.parse(await readRecording(directory, closed.fileName)) as { actions: { at: number; pos: number }[] };
    assert.deepEqual(clip.actions, [{ at: 0, pos: 50 }, { at: 100, pos: 50 }]);
  } finally { release.resolve(); await coordinator.close(); await rm(directory, { recursive: true, force: true }); }
});

test('recording backpressure has a bounded state-change log and disconnects explicitly on overflow', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'sensa-record-overflow-')), config = output('Recording');
  config.signal.recordingFormat = 'Funscript'; config.signal.bindings = [binding('twist', 'R0')];
  let now = 1000; const adapter = new RecordingAdapter(config, directory, () => now), entered = deferred<void>(), release = deferred<void>();
  const append = adapter.recordSample.bind(adapter); let first = true;
  adapter.recordSample = async (...args) => { await append(...args); if (first) { first = false; entered.resolve(); await release.promise; } };
  const coordinator = new OutputCoordinator(configuration([config]), { now: () => now, createAdapter: () => adapter, canSend: () => true });
  try {
    await coordinator.connectEnabled(); coordinator.updateBindings(now, () => sample(.5)); await entered.promise;
    for (let index = 0; index < 65; index++) {
      coordinator.updateBindings(++now, () => sample(null, 'Expired source'));
      coordinator.updateBindings(++now, () => sample(.5));
    }
    release.resolve(); await coordinator.flush();
    assert.equal(coordinator.isConnected(config.id), false);
    assert.match((coordinator.snapshot()[0] as { lastError: string }).lastError, /Recording state-change queue is full/u);
    const files = (adapter.snapshot() as { recordingFiles: { completed: boolean }[] }).recordingFiles;
    assert.equal(files.length, 1);
    assert.equal(files.every(file => file.completed), true);
  } finally { release.resolve(); await coordinator.close(); await rm(directory, { recursive: true, force: true }); }
});

test('routed replay is invalid until playing, on pause and at its end, while play is idempotent and restarts a completed clip', async () => {
  let now = 0; const config = output('Recording');
  const coordinator = new OutputCoordinator(configuration([config]), { now: () => now, createAdapter: () => new MemoryAdapter(),
    readRecording: async () => JSON.stringify({ actions: [{ at: 0, pos: 0 }, { at: 100, pos: 100 }] }) });
  await coordinator.replayAction(config.id, 'load', 'clip.funscript');
  assert.equal(coordinator.readReplay(config.id, 'value').valid, false);
  await coordinator.replayAction(config.id, 'seek', undefined, 20);
  assert.equal(coordinator.readReplay(config.id, 'value').valid, false);
  await coordinator.replayAction(config.id, 'play'); assert.equal(coordinator.readReplay(config.id, 'value').value, .2);
  now = 10; await coordinator.replayAction(config.id, 'play'); assert.equal(coordinator.readReplay(config.id, 'value').value, .3);
  await coordinator.replayAction(config.id, 'pause'); now = 40;
  assert.equal(coordinator.readReplay(config.id, 'value').valid, false);
  await coordinator.replayAction(config.id, 'seek', undefined, 50); await coordinator.replayAction(config.id, 'play');
  assert.equal(coordinator.readReplay(config.id, 'value').value, .5);
  now = 90; assert.equal(coordinator.readReplay(config.id, 'value').valid, false);
  await coordinator.replayAction(config.id, 'play'); assert.equal(coordinator.readReplay(config.id, 'value').value, 0);
  await coordinator.emergencyStop(); now = 1000;
  assert.equal(coordinator.readReplay(config.id, 'value').valid, false);
  assert.match(coordinator.readReplay(config.id, 'value').reason, /paused or complete/u);
  assert.equal((await coordinator.replayAction(config.id, 'seek', undefined, 0) as { playing: boolean }).playing, false);
  await coordinator.close();
});
