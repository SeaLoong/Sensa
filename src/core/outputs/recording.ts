import { parseFunscript, scriptValue } from '../funscript.ts';
import type { ComputedSignalSample, MotionAxis } from '../runtime/model.ts';
import { invalidSample, isMotionAxis } from '../runtime/model.ts';
import { clamp, optionalRecord, record } from './types.ts';
import { roundAway } from './codecs.ts';

export interface SessionRow { timeMs: number; signalId: string; rawValue: number | null; value: number | null; valid: boolean; reason: string; sourceKey: string | null; coordinateFrame: string | null }
export interface FunscriptSegment { signalId: string; segment: number; startOffsetMs: number; actions: { at: number; pos: number }[] }
export interface FunscriptSegmentState { signalId: string; segment: number; startOffsetMs: number; durationMs: number }
export function funscriptTrackAxis(id: string, name = ''): MotionAxis | null { return isMotionAxis(id) ? id : isMotionAxis(name) ? name : null; }
interface Track { signalId: string; number: number; began: number; actions: { at: number; pos: number }[]; lastAt: number; lastValue: number }
/** Shared segment/tail rules; the host only owns publishing completed files. */
export class FunscriptSegments {
  #active = new Map<string, Track>();
  #numbers = new Map<string, number>();
  #began: number | null = null;
  #actions = 0;
  #segments = 0;
  full = false;
  append(id: string, sample: ComputedSignalSample, value: number | null, now: number): FunscriptSegment[] {
    this.#began ??= now;
    if (!sample.valid || value === null || !Number.isFinite(value)) { const segment = this.end(id, now); return segment ? [segment] : []; }
    if (this.full) return [];
    let track = this.#active.get(id);
    if (!track) {
      if (!this.#numbers.has(id) && this.#numbers.size >= 64 || this.#segments >= 1024) { this.full = true; return []; }
      const number = (this.#numbers.get(id) ?? 0) + 1; this.#numbers.set(id, number); this.#segments++;
      track = { signalId: id, number, began: now, actions: [], lastAt: 0, lastValue: 0 }; this.#active.set(id, track);
    }
    const at = Math.max(track.lastAt, roundAway(now - track.began)), pos = roundAway(clamp(value) * 100), previous = track.actions.at(-1);
    if (previous?.at === at) previous.pos = pos;
    else { if (this.#actions >= 250000) { this.full = true; return []; } this.#actions++; track.actions.push({ at, pos }); }
    track.lastAt = at; track.lastValue = pos; return [];
  }
  end(id: string, now: number): FunscriptSegment | null {
    const track = this.#active.get(id); if (!track) return null; this.#active.delete(id);
    const at = Math.max(track.lastAt, roundAway(now - track.began));
    if (track.actions.at(-1)?.at !== at) { if (this.#actions < 250000) { track.actions.push({ at, pos: track.lastValue }); this.#actions++; } else this.full = true; }
    return { signalId: id, segment: track.number, startOffsetMs: track.began - (this.#began ?? track.began), actions: track.actions };
  }
  activeSegments(): FunscriptSegmentState[] {
    return [...this.#active.values()].filter(track => track.actions.length > 0).map(track => ({ signalId: track.signalId,
      segment: track.number, startOffsetMs: track.began - (this.#began ?? track.began), durationMs: track.lastAt }));
  }
  complete(now: number): FunscriptSegment[] { return [...this.#active.keys()].flatMap(id => { const segment = this.end(id, now); return segment ? [segment] : []; }); }
}
export const SESSION_CSV_HEADER = 'timeMs,signalId,rawValue,value,valid,reason,sourceKey,coordinateFrame';
export function encodeSessionRow(row: SessionRow, csv: boolean): string {
  const quote = (text: string): string => '"' + text.replaceAll('"', '""').replace(/[\r\n]/gu, ' ') + '"';
  return csv ? [String(row.timeMs), quote(row.signalId), row.rawValue === null ? '' : String(row.rawValue), row.value === null ? '' : String(row.value), String(row.valid), quote(row.reason), quote(row.sourceKey ?? ''), quote(row.coordinateFrame ?? '')].join(',') : JSON.stringify(row);
}
function splitCsv(line: string): string[] {
  const fields: string[] = []; let current = '', quoted = false;
  for (let index = 0; index < line.length; index++) { const char = line[index]; if (char === '"') { if (quoted && line[index + 1] === '"') { current += '"'; index++; } else quoted = !quoted; } else if (char === ',' && !quoted) { fields.push(current); current = ''; } else current += char; }
  if (quoted) throw new TypeError('Invalid quoted recording row.'); fields.push(current); return fields;
}
function csvRow(line: string): unknown {
  const fields = splitCsv(line); if (fields.length !== 8) throw new TypeError('Invalid CSV recording row.');
  return { timeMs: Number(fields[0]), signalId: fields[1], rawValue: fields[2] ? Number(fields[2]) : null, value: fields[3] ? Number(fields[3]) : null, valid: fields[4] === 'true', reason: fields[5], sourceKey: fields[6] || null, coordinateFrame: fields[7] || null };
}
export class SignalReplay {
  #rows = new Map<string, SessionRow[]>();
  #script: ReturnType<typeof parseFunscript> | null = null;
  #playing = false;
  #position = 0;
  #anchor = 0;
  fileName = '';
  durationMs = 0;
  constructor(privateClock?: () => number) { this.now = privateClock ?? Date.now; }
  readonly now: () => number;
  load(fileName: string, text: string): void {
    if (new TextEncoder().encode(text).length > 64 * 1024 * 1024) throw new RangeError('Recording exceeds 64 MiB.');
    const rows = new Map<string, SessionRow[]>(); let script: ReturnType<typeof parseFunscript> | null = null;
    if (fileName.endsWith('.funscript')) { script = parseFunscript(JSON.parse(text) as unknown, { maximumActions: 250000, normalizeActions: true }); }
    else {
      const lines = text.split(/\r?\n/u), header = lines.shift() ?? '', csv = fileName.endsWith('.csv');
      if (csv ? header !== SESSION_CSV_HEADER : optionalRecord(JSON.parse(header) as unknown)?.['type'] !== 'sensa-session') throw new TypeError('Choose a Sensa session recording.');
      let count = 0;
      for (const line of lines) {
        if (!line) continue;
        if (line.length > 32768 || ++count > 250000) throw new RangeError('Recording exceeds replay limits.');
        const row = record(csv ? csvRow(line) : JSON.parse(line) as unknown);
        if (typeof row['timeMs'] !== 'number' || !Number.isInteger(row['timeMs']) || row['timeMs'] < 0 || row['timeMs'] > 604800000 || typeof row['signalId'] !== 'string' || !row['signalId'] || row['signalId'].length > 80 || typeof row['valid'] !== 'boolean') throw new TypeError('Invalid recording sample.');
        for (const key of ['rawValue', 'value']) if (row[key] !== null && (typeof row[key] !== 'number' || !Number.isFinite(row[key]))) throw new TypeError('Invalid recording number.');
        if (row['valid'] && row['rawValue'] === null) throw new TypeError('Valid recording sample needs its raw value.');
        const parsed: SessionRow = { timeMs: row['timeMs'], signalId: row['signalId'], rawValue: row['rawValue'] as number | null, value: row['value'] as number | null, valid: row['valid'], reason: typeof row['reason'] === 'string' ? row['reason'] : '', sourceKey: typeof row['sourceKey'] === 'string' ? row['sourceKey'] : null, coordinateFrame: typeof row['coordinateFrame'] === 'string' ? row['coordinateFrame'] : null };
        const values = rows.get(parsed.signalId) ?? []; values.push(parsed); rows.set(parsed.signalId, values);
      }
      if (rows.size > 64) throw new RangeError('Replay supports at most 64 signals.');
      for (const values of rows.values()) values.sort((left, right) => left.timeMs - right.timeMs);
    }
    this.#rows = rows; this.#script = script; this.fileName = fileName; this.durationMs = script?.durationMs ?? Math.max(0, ...[...rows.values()].map(values => values.at(-1)?.timeMs ?? 0)); this.#position = 0; this.#playing = false;
  }
  position(): number { return Math.min(this.durationMs, this.#position + (this.#playing ? Math.max(0, this.now() - this.#anchor) : 0)); }
  play(): void {
    if (!this.fileName) throw new Error('Load a recording first.');
    const position = this.position(); if (this.#playing && position < this.durationMs) return;
    if (position >= this.durationMs) this.#position = 0;
    this.#anchor = this.now(); this.#playing = true;
  }
  pause(): void { this.#position = this.position(); this.#playing = false; }
  seek(timeMs: number): void { if (!Number.isFinite(timeMs)) throw new TypeError('Replay position must be finite.'); this.#position = clamp(timeMs, 0, this.durationMs); this.#anchor = this.now(); }
  snapshot(): unknown { return { loaded: !!this.fileName, playing: this.#playing && this.position() < this.durationMs, timeMs: this.position(), durationMs: this.durationMs, fileName: this.fileName, signals: this.#script ? ['value'] : [...this.#rows.keys()] }; }
  read(id: string): ComputedSignalSample {
    return this.#playing && this.position() < this.durationMs ? this.sample(id) : invalidSample('回放已暂停或结束 / Replay is paused or complete');
  }
  sample(id: string): ComputedSignalSample {
    const at = this.position();
    if (this.#script) {
      if (id !== 'value') return invalidSample('Replay signal is unavailable.');
      return { value: scriptValue(this.#script, at), valid: true, reason: '', sourceKey: null, timestampMs: this.now(), coordinateFrame: null, originKey: 'replay:' + this.fileName + ':value' };
    }
    const values = this.#rows.get(id); if (!values?.length) return invalidSample('Replay signal is unavailable.');
    let low = 0, high = values.length - 1, chosen: SessionRow | undefined;
    while (low <= high) { const middle = (low + high) >> 1, row = values[middle]; if (!row) break; if (row.timeMs <= at) { chosen = row; low = middle + 1; } else high = middle - 1; }
    if (!chosen || !chosen.valid) return invalidSample(chosen?.reason || 'Replay sample is invalid.');
    return { value: chosen.rawValue, valid: chosen.rawValue !== null, reason: chosen.reason, sourceKey: chosen.sourceKey, timestampMs: this.now(), coordinateFrame: chosen.coordinateFrame, originKey: 'replay:' + this.fileName + ':' + id };
  }
}
