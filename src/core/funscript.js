export const AXES = Object.freeze(['L0', 'L1', 'L2', 'R0', 'R1', 'R2', 'V0']);
export function normalized(value) {
  const result = Number(value);
  if (!Number.isFinite(result) || result < 0 || result > 1) throw new Error('Use a value between 0 and 1.');
  return result;
}
export function parseFunscript(input) {
  const value = typeof input === 'string' ? JSON.parse(input) : input;
  if (!value || !Array.isArray(value.actions) || !value.actions.length || value.actions.length > 200000)
    throw new Error('Choose a funscript with 1–200000 actions.');
  if (value.inverted !== undefined && typeof value.inverted !== 'boolean') throw new Error('Script inverted must be a boolean.');
  const actions = [];
  for (const action of value.actions) {
    if (!action || !Number.isSafeInteger(action.at) || action.at < 0 || action.at > 604800000
      || !Number.isInteger(action.pos) || action.pos < 0 || action.pos > 100)
      throw new Error('Actions need integer milliseconds and positions from 0 to 100.');
    if (actions.length && action.at < actions.at(-1).at) throw new Error('Script timestamps must be in order.');
    const next = Object.freeze({ at: action.at, pos: value.inverted ? 100 - action.pos : action.pos });
    if (actions.at(-1)?.at === action.at) actions[actions.length - 1] = next;
    else actions.push(next);
  }
  return Object.freeze({ actions: Object.freeze(actions), durationMs: actions.at(-1).at });
}
export function scriptValue(script, positionMs) {
  const actions = script.actions;
  if (positionMs <= actions[0].at) return actions[0].pos / 100;
  if (positionMs >= script.durationMs) return actions.at(-1).pos / 100;
  let low = 0, high = actions.length - 1;
  while (high - low > 1) {
    const middle = (low + high) >>> 1;
    if (actions[middle].at <= positionMs) low = middle; else high = middle;
  }
  const left = actions[low], right = actions[high];
  return (left.pos + (right.pos - left.pos) * ((positionMs - left.at) / (right.at - left.at))) / 100;
}
export function tcodeFrame(values, durationMs = 0) {
  if (!Number.isInteger(durationMs) || durationMs < 0 || durationMs > 60000) throw new Error('Invalid command duration.');
  const commands = Object.entries(values).map(([axis, value]) => {
    if (!AXES.includes(axis)) throw new Error('Unknown axis: ' + axis);
    return axis + String(Math.round(normalized(value) * 9999)).padStart(4, '0') + (durationMs ? 'I' + durationMs : '');
  });
  if (!commands.length) throw new Error('Choose at least one axis.');
  return commands.join(' ') + '\n';
}
