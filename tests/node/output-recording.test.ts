import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { FunscriptSegments, SignalReplay, SESSION_CSV_HEADER, encodeSessionRow } from '../../src/core/outputs/recording.ts';
import { RecordingAdapter, listRecordings, readRecording } from '../../src/node/outputs/adapters.ts';
import type { ComputedSignalSample } from '../../src/core/runtime/model.ts';
import { output } from './output-support.ts';

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
