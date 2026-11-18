import { COMPUTED_SIGNAL_LIMIT, makeComputedInput, newComputedDraft } from './computed-signals.js';
import { makeSignalDraft } from './configuration.js';
import { t } from './i18n.js';

export function axisRoutePresets() {
  return [
    { value: 'direct', label: t('直接映射'), steps: [] },
    { value: 'smooth', label: t('平滑 250 ms'), steps: [{ operation: 'Smooth', timeMs: 250 }] },
    { value: 'filtered', label: t('5% 死区 → 平滑 250 ms'), steps: [{ operation: 'DeadZone', threshold: 0.05 }, { operation: 'Smooth', timeMs: 250 }] },
  ];
}

export function routeParameterPath(path) {
  return path.split(/[;\n]/u).map(part => part.trim().replace(/^\/avatar\/parameters(?:\/|$)/u, '')).filter(Boolean).join(';');
}

export function buildAxisRoute(path, steps, role, existing) {
  const parameter = routeParameterPath(path);
  if (!parameter || steps.length > 16 || existing.length + steps.length > COMPUTED_SIGNAL_LIMIT) return null;
  let source = { sourceMode: 'Direct', oscPath: parameter };
  const signals = [];
  for (const settings of steps) {
    const signal = { ...newComputedDraft([...existing, ...signals]), ...settings, inputs: [makeComputedInput(source)] };
    signals.push(signal);
    source = { sourceMode: 'Computed', oscPath: signal.id };
  }
  return { steps: signals, mapping: makeSignalDraft({ ...source, role }) };
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
