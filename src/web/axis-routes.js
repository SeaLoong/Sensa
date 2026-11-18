import { routeParameterPath } from './mapping-path-suggestions.js';
import { COMPUTED_SIGNAL_LIMIT, makeComputedInput, newComputedDraft } from './computed-signals.js';
import { t } from './i18n.js';

export function axisRoutePresets() {
  return [
    { value: 'direct', label: t('直接映射'), steps: [] },
    { value: 'smooth', label: t('平滑 250 ms'), steps: [{ operation: 'Smooth', timeMs: 250 }] },
    { value: 'filtered', label: t('5% 死区 → 平滑 250 ms'), steps: [{ operation: 'DeadZone', threshold: 0.05 }, { operation: 'Smooth', timeMs: 250 }] },
  ];
}

export function routeStepChoices() {
  return [
    ...axisRoutePresets().filter(preset => preset.steps.length),
    { value: 'blend', label: t('加权平均'), steps: [{ operation: 'WeightedAverage' }] },
    { value: 'delay', label: t('延迟'), steps: [{ operation: 'Delay' }] },
    { value: 'peak', label: t('峰值保持'), steps: [{ operation: 'PeakHold' }] },
  ];
}

// Bypass only this mapping's final edge. Other users keep the named calculation.
export function previousMappingSource(mapping, signals) {
  if (mapping.sourceMode !== 'Computed') return null;
  const last = signals.find(node => node.id === mapping.oscPath);
  const input = last?.inputs.length === 1 && last.inputs[0];
  if (!input || !['Direct', 'Computed', 'SensaPose', 'SensaPoint'].includes(input.sourceMode)) return null;
  const { sourceMode, oscPath, pointMetric, poseMetric } = input;
  const source = { sourceMode, oscPath };
  if (sourceMode === 'SensaPoint') source.pointMetric = pointMetric;
  if (sourceMode === 'SensaPose') source.poseMetric = poseMetric;
  return source;
}

export function appendRouteSteps(mapping, steps, existing) {
  const { sourceMode, pointMetric, poseMetric } = mapping;
  const oscPath = sourceMode === 'Direct' ? routeParameterPath(mapping.oscPath) : mapping.oscPath;
  if (!oscPath || !['Direct', 'Computed', 'SensaPose', 'SensaPoint'].includes(sourceMode)
    || steps.length > 16 || existing.length + steps.length > COMPUTED_SIGNAL_LIMIT) return null;
  let source = { sourceMode, oscPath, pointMetric, poseMetric };
  const signals = [];
  for (const settings of steps) {
    const signal = { ...newComputedDraft([...existing, ...signals]), ...settings, inputs: [makeComputedInput(source)] };
    if (signal.operation === 'WeightedAverage') signal.inputs.push(makeComputedInput());
    signals.push(signal);
    source = { sourceMode: 'Computed', oscPath: signal.id };
  }
  return { steps: signals, mapping: { ...mapping, ...source } };
}

// Show each shared dependency once, in input order, even while editing an invalid graph.
export function routeDependencies(mapping, signals) {
  const nodes = new Map(signals.map(signal => [signal.id, signal]));
  const seen = new Set(), steps = [];
  function visit(source) {
    const node = source.sourceMode === 'Computed' && nodes.get(source.oscPath);
    if (!node || seen.has(node.id)) return;
    seen.add(node.id);
    for (const input of node.inputs) visit(input);
    steps.push(node);
  }
  visit(mapping);
  return steps;
}
