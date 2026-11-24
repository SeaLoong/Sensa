import { OscParameterStore } from '../core/protocols/osc.ts';
import { RuntimeEngine } from '../core/runtime/runtime.ts';
import { neutralValues } from '../core/runtime/model.ts';

export const platformAxes = ['L0', 'L1', 'L2', 'R0', 'R1', 'R2'];
export const centeredCounts = Object.freeze(Object.fromEntries(platformAxes.map(axis => [axis, 500])));

export function targetCounts(values) {
  return Object.fromEntries(platformAxes.map(axis => {
    const value = values?.[axis] ?? values?.[axis.toLowerCase()];
    return [axis, Number.isFinite(value) ? Math.min(999, Math.max(0, Math.round(value * 1000))) : 500];
  }));
}

// Samples represent resolved mapping inputs (e.g. Contact X in metres or Pose yaw in degrees).
// Rows that read the same source and metric share one control.
export function simulationInputs(rows) {
  const inputs = new Map(), mappings = [];
  for (const row of rows) {
    if (!row.oscPath?.trim()) continue;
    const metric = row.sourceMode === 'SensaPose' ? row.poseMetric : row.sourceMode === 'SensaPoint' ? row.pointMetric : '';
    const key = JSON.stringify([row.sourceMode, row.oscPath, metric]);
    const low = Math.min(row.vrchatMin, row.vrchatMax), high = Math.max(row.vrchatMin, row.vrchatMax);
    const initial = row.simulateEnabled && Number.isFinite(row.simulatedValue) ? row.simulatedValue
      : row.role === 'GateEnable' ? (row.invertDirection ? row.vrchatMin : row.vrchatMax) : (low + high) / 2;
    let input = inputs.get(key);
    if (!input) {
      input = { path: 'Preview/' + inputs.size, source: row.oscPath, sourceMode: row.sourceMode, metric, initial,
        min: low, max: high, roles: [] };
      inputs.set(key, input);
    }
    input.min = Math.min(input.min, low, initial);
    input.max = Math.max(input.max, high, initial);
    if (!input.roles.includes(row.role)) input.roles.push(row.role);
    mappings.push({ ...row, sourceMode: 'Direct', oscPath: input.path });
  }
  return { inputs: [...inputs.values()], mappings };
}

export function createMappingSimulation(plan, now) {
  const store = new OscParameterStore(now);
  let values = neutralValues();
  const engine = new RuntimeEngine({ signals: plan.mappings, osc: { inputTimeoutMs: 0 } }, {
    now, oscStore: store, sendFrame(frame) { values = frame.values; },
  });
  for (const input of plan.inputs) store.set(input.path, input.initial);
  engine.setInputMode('Osc');
  engine.setInputActive(true);
  return {
    set(path, value) { store.set(path, value); },
    sample() {
      engine.tick();
      return { counts: targetCounts(values), blocked: engine.getSnapshot().gateClosed };
    },
    dispose() { engine.dispose(); },
  };
}
