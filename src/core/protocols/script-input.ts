import { jsonObject, parseStrictJson } from './strict-json.ts';
export interface ProtocolScriptPoint { atMs: number; position: number }
export class ProtocolScriptTrajectory {
  readonly points: readonly ProtocolScriptPoint[];
  constructor(points: readonly ProtocolScriptPoint[]) {
    if (!points.length || points.some((point, index) => !Number.isSafeInteger(point.atMs) || point.atMs < 0
      || !Number.isFinite(point.position) || point.position < 0 || point.position > 1
      || index > 0 && point.atMs <= (points[index - 1]?.atMs ?? 0))) throw new Error('A trajectory needs increasing, finite time-position points.');
    this.points = points.map(point => ({ ...point }));
  }
  get durationMs(): number { return this.points[this.points.length - 1]?.atMs ?? 0; }
  #upper(atMs: number): number {
    let low = 0, high = this.points.length;
    while (low < high) { const mid = low + Math.floor((high - low) / 2); if ((this.points[mid]?.atMs ?? 0) <= atMs) low = mid + 1; else high = mid; }
    return low;
  }
  sample(atMs: number): number {
    const upper = this.#upper(atMs), first = this.points[0], last = this.points[this.points.length - 1];
    if (!first || !last) return 0;
    if (!upper) return first.position; if (upper === this.points.length) return last.position;
    const a = this.points[upper - 1], b = this.points[upper]; if (!a || !b) return 0;
    return a.position + (b.position - a.position) * (atMs - a.atMs) / (b.atMs - a.atMs);
  }
  speedPerSecond(atMs: number): number {
    const upper = this.#upper(atMs); if (!upper || upper === this.points.length) return 0;
    const a = this.points[upper - 1], b = this.points[upper]; return a && b ? Math.abs(b.position - a.position) * 1000 / (b.atMs - a.atMs) : 0;
  }
}
export const maximumProtocolScriptBytes = 1024 * 1024;
export const maximumProtocolScriptDurationMs = 16777214;
export function parseProtocolScript(bytes: Uint8Array, csv: boolean): ProtocolScriptTrajectory {
  if (bytes.byteLength > maximumProtocolScriptBytes) throw new Error('Script exceeds 1 MiB.');
  const points: ProtocolScriptPoint[] = [];
  const add = (at: number, position: number): void => {
    if (points.length >= 100000 || !Number.isSafeInteger(at) || at < 0 || at > maximumProtocolScriptDurationMs
      || !Number.isFinite(position) || position < 0 || position > 100 || points.length > 0 && at <= (points[points.length - 1]?.atMs ?? 0)) {
      throw new Error('Script actions must be increasing, bounded millisecond/percent pairs.');
    }
    points.push({ atMs: at, position: position / 100 });
  };
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, '');
  if (csv) {
    if (!text.endsWith('\n')) throw new Error('CSV scripts must end with a newline.');
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      const pair = /^(\d+),(\d+(?:\.\d+)?)\r?$/.exec(line);
      if (!pair?.[1] || !pair[2]) throw new Error('CSV requires time,position pairs without a header.');
      add(Number(pair[1]), Number(pair[2]));
    }
  } else {
    const body = jsonObject(parseStrictJson(text)), actions = body['actions'];
    if (!Array.isArray(actions)) throw new Error('Funscript requires an actions array.');
    if ('inverted' in body && typeof body['inverted'] !== 'boolean') throw new Error('inverted must be boolean.');
    for (const raw of actions as unknown[]) {
      const point = jsonObject(raw), at = point['at'], pos = point['pos'];
      if (typeof at !== 'number' || typeof pos !== 'number') throw new Error('Invalid funscript action.');
      add(at, body['inverted'] ? 100 - pos : pos);
    }
  }
  return new ProtocolScriptTrajectory(points);
}
