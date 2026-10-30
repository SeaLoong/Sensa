import type { Axis, FunscriptAction, Script, SignalValues } from './types.ts';
import { motionAxes } from './runtime/model.ts';

export const AXES = Object.freeze(motionAxes);
export function isAxis(value: unknown): value is Axis {
  return AXES.some(axis => axis === value);
}
export function normalized(value: unknown): number {
  const result = Number(value);
  if (!Number.isFinite(result) || result < 0 || result > 1) throw new Error('Use a value between 0 and 1.');
  return result;
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export interface FunscriptParseOptions {
  maximumActions?: number;
  /** Preserve established funscript import rules: clip, sort and skip malformed rows. */
  normalizeActions?: boolean;
}
export function parseFunscript(input: unknown, options: FunscriptParseOptions = {}): Script {
  const maximum = options.maximumActions ?? 200000;
  if (!Number.isSafeInteger(maximum) || maximum < 1 || maximum > 500000) throw new Error('Invalid action limit.');
  const normalize = options.normalizeActions === true;
  const value: unknown = typeof input === 'string' ? JSON.parse(input) : input;
  if (!record(value) || !Array.isArray(value.actions) || !value.actions.length || !normalize && value.actions.length > maximum)
    throw new Error(`Choose a funscript with 1–${maximum} actions.`);
  if (!normalize && value.inverted !== undefined && typeof value.inverted !== 'boolean') throw new Error('Script inverted must be a boolean.');
  const actions: FunscriptAction[] = [];
  const unordered = new Map<number, FunscriptAction>();
  let imported = 0;
  const inputActions: unknown[] = value.actions;
  for (const action of inputActions) {
    if (normalize) {
      if (!record(action) || typeof action.at !== 'number' || !Number.isSafeInteger(action.at)
        || typeof action.pos !== 'number' || !Number.isFinite(action.pos)) continue;
      const at = Math.max(0, action.at), pos = Math.max(0, Math.min(100, action.pos));
      if (at > 604800000 || ++imported > maximum) throw new Error('Script exceeds the duration or action limit.');
      unordered.set(at, Object.freeze({ at, pos: value.inverted === true ? 100 - pos : pos }));
      continue;
    }
    if (!record(action) || typeof action.at !== 'number' || !Number.isSafeInteger(action.at) || action.at < 0 || action.at > 604800000
      || typeof action.pos !== 'number' || !Number.isInteger(action.pos) || action.pos < 0 || action.pos > 100)
      throw new Error('Actions need integer milliseconds and positions from 0 to 100.');
    const previous = actions.at(-1);
    if (previous && action.at < previous.at) throw new Error('Script timestamps must be in order.');
    const next: FunscriptAction = Object.freeze({ at: action.at, pos: value.inverted ? 100 - action.pos : action.pos });
    if (previous?.at === action.at) actions[actions.length - 1] = next;
    else actions.push(next);
  }
  if (normalize) for (const action of [...unordered.values()].sort((a, b) => a.at - b.at)) actions.push(action);
  const last = actions.at(-1);
  if (!last) throw new Error('Choose a funscript with at least one action.');
  return Object.freeze({ actions: Object.freeze(actions), durationMs: last.at });
}
export function scriptValue(script: Script, positionMs: number): number {
  const actions = script.actions, first = actions[0], last = actions.at(-1);
  if (!first || !last) throw new Error('Choose a funscript with at least one action.');
  if (positionMs <= first.at) return first.pos / 100;
  if (positionMs >= script.durationMs) return last.pos / 100;
  let low = 0, high = actions.length - 1;
  while (high - low > 1) {
    const middle = (low + high) >>> 1, action = actions[middle];
    if (!action) throw new Error('Invalid script action index.');
    if (action.at <= positionMs) low = middle; else high = middle;
  }
  const left = actions[low], right = actions[high];
  if (!left || !right) throw new Error('Invalid script action interval.');
  return (left.pos + (right.pos - left.pos) * ((positionMs - left.at) / (right.at - left.at))) / 100;
}
export function tcodeFrame(values: Readonly<SignalValues>, durationMs = 0): string {
  if (!Number.isInteger(durationMs) || durationMs < 0 || durationMs > 60000) throw new Error('Invalid command duration.');
  const commands = Object.entries(values).map(([axis, value]) => {
    if (!isAxis(axis)) throw new Error('Unknown axis: ' + axis);
    return axis + String(Math.round(normalized(value) * 9999)).padStart(4, '0') + (durationMs ? 'I' + durationMs : '');
  });
  if (!commands.length) throw new Error('Choose at least one axis.');
  return commands.join(' ') + '\n';
}
