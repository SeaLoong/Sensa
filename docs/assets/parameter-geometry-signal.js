/* Mapping and timeline helpers shared by the offline parameter workbench. */
(function (root) {
  'use strict';
  const axes = Object.freeze(['L0', 'L1', 'L2', 'R0', 'R1', 'R2', 'V0']);
  function mapValue(value, { min = 0, max = 1, invert = false } = {}) {
    if (![value, min, max].every(Number.isFinite) || max <= min) return null;
    const normalized = Math.max(0, Math.min(1, (value - min) / (max - min)));
    return invert ? 1 - normalized : normalized;
  }
  function searchParameters(entries, query, limit = 12) {
    const words = String(query || '').normalize('NFKC').toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    return entries.map((entry, index) => {
      const name = String(entry.name || '').toLocaleLowerCase();
      const corpus = [entry.name, entry.path, entry.title, entry.scenarioTitle].filter(Boolean).join(' ').normalize('NFKC').toLocaleLowerCase();
      return { entry, index, score: words.every(word => corpus.includes(word))
        ? words.reduce((score, word) => score + (name === word ? 4 : name.startsWith(word) ? 2 : 1), 0) : 0 };
    }).filter(item => item.score).sort((a, b) => b.score - a.score || a.index - b.index)
      .slice(0, Math.max(1, Math.min(50, Number.isInteger(limit) ? limit : 12))).map(item => item.entry);
  }
  function createRecording({ maxDurationMs = 600000, maxSamples = 12001 } = {}) {
    if (!Number.isFinite(maxDurationMs) || maxDurationMs < 1 || !Number.isInteger(maxSamples) || maxSamples < 2)
      throw new RangeError('Invalid recording bounds');
    let startedAt = null, active = false, actions = [], endedAt = 0, reason = '';
    function append(now, value) {
      if (!active) return false;
      if (!Number.isFinite(now) || now < startedAt || !Number.isFinite(value) || value < 0 || value > 1) {
        active = false; reason = 'invalid-sample'; return false;
      }
      const at = Math.min(maxDurationMs, Math.round(now - startedAt));
      const pos = Math.round(value * 100), last = actions.at(-1);
      if (last && at < last.at) { active = false; reason = 'clock-order'; return false; }
      if (last && at === last.at) last.pos = pos;
      else if (actions.length >= maxSamples) { active = false; reason = 'sample-limit'; return false; }
      else actions.push({ at, pos });
      endedAt = at;
      if (now - startedAt >= maxDurationMs) { active = false; reason = 'duration-limit'; }
      return true;
    }
    return Object.freeze({
      start(now, value) {
        if (!Number.isFinite(now) || !Number.isFinite(value) || value < 0 || value > 1) return false;
        startedAt = now; active = true; actions = []; endedAt = 0; reason = '';
        return append(now, value);
      },
      sample: append,
      stop(now, value) {
        if (active && Number.isFinite(now) && Number.isFinite(value)) append(now, value);
        active = false; return actions.length;
      },
      clear() { active = false; actions = []; startedAt = null; endedAt = 0; reason = ''; },
      snapshot: () => ({ active, durationMs: endedAt, sampleCount: actions.length, reason }),
      export() { return { version: '1.0', inverted: false, range: 100, actions: actions.map(action => ({ ...action })) }; },
    });
  }
  function appendHistory(history, point, windowMs = 10000, maxSamples = 240) {
    if (!Number.isFinite(point.at) || point.value !== null && (!Number.isFinite(point.value) || point.value < 0 || point.value > 1))
      throw new RangeError('Invalid history point');
    const last = history.at(-1);
    if (last && point.at < last.at) throw new RangeError('History clock moved backwards');
    const next = history.filter(sample => sample.at >= point.at - windowMs);
    if (last && point.at === last.at) next.pop();
    next.push({ at: point.at, value: point.value });
    return next.slice(-maxSamples);
  }
  function movementPreset(state, preset) {
    const spatial = ['contact-sdk', 'sensa-sps', 'shader'].includes(state.scenario);
    const coordinates = {
      centered: { x: 0, z: state.scenario === 'socket-frot' ? .05 : .02, yaw: 0 },
      offset: { x: .3, z: .1, yaw: 0 },
      far: { x: 0, z: spatial ? 2.2 : 1.1, yaw: 0 },
    };
    if (!coordinates[preset]) throw new RangeError('Unknown movement preset');
    return { ...state, ...coordinates[preset] };
  }
  function makeSignal(session, sequence, axis, value, timestamp) {
    if (!/^[a-zA-Z0-9_-]{16,128}$/.test(session) || !Number.isSafeInteger(sequence) || sequence < 1
      || !axes.includes(axis) || !Number.isFinite(value) || value < 0 || value > 1 || !Number.isFinite(timestamp))
      throw new RangeError('Invalid signal');
    return { type: 'sensa.signal.v1', session, sequence, axes: { [axis]: value }, timestamp };
  }
  root.SensaParameterSignals = Object.freeze({ axes, mapValue, searchParameters, createRecording, appendHistory, movementPreset, makeSignal });
})(typeof window !== 'undefined' ? window : globalThis);
