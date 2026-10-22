import { diagnostic, localized, t } from './i18n.js';

export const COMPUTED_SIGNAL_LIMIT = 64;
export const COMPUTED_INPUT_LIMIT = 16;

export const computedOperationOptions = localized(() => [
  { value: 'WeightedAverage', label: t('加权平均') },
  { value: 'Average', label: t('平均值') },
  { value: 'Sum', label: t('求和') },
  { value: 'Difference', label: t('相减（第一项减第二项）') },
  { value: 'Product', label: t('相乘') },
  { value: 'Ratio', label: t('相除（第一项除以第二项）') },
  { value: 'Minimum', label: t('最小值') },
  { value: 'Maximum', label: t('最大值') },
  { value: 'Magnitude', label: t('向量长度（平方和开方）') },
]);

export const computedInputOptions = localized(() => [
  { value: 'Direct', label: t('OSC 参数') },
  { value: 'SensaPoint', label: t('定位坐标与速度') },
  { value: 'SensaPose', label: t('三点姿态指标') },
  { value: 'Computed', label: t('计算信号') },
  { value: 'Constant', label: t('固定数值') },
]);

export function makeComputedInput(input = {}) {
  return { sourceMode: 'Direct', oscPath: '', pointMetric: 'Z', poseMetric: 'Depth', weight: 1, value: 0, ...input };
}

export function buildComputedDrafts(signals = []) {
  return (Array.isArray(signals) ? signals : []).map(signal => ({ ...signal,
    inputs: (signal.inputs || []).map(makeComputedInput) }));
}

export function newComputedDraft(signals = []) {
  const ids = new Set(signals.map(signal => signal.id));
  let index = 1;
  while (ids.has(`Signal${index}`)) index++;
  return { id: `Signal${index}`, name: t('计算 {0}', [index]), operation: 'WeightedAverage',
    inputs: [makeComputedInput(), makeComputedInput()], maxAgeMs: 0 };
}

export function stripComputedDraft(signal) {
  return { id: String(signal.id || '').trim(), name: String(signal.name || '').trim(),
    operation: signal.operation || 'WeightedAverage', maxAgeMs: Number(signal.maxAgeMs ?? 0),
    inputs: (signal.inputs || []).map(input => ({ sourceMode: input.sourceMode || 'Direct',
      oscPath: String(input.oscPath || '').trim(), pointMetric: input.pointMetric || 'Z', poseMetric: input.poseMetric || 'Depth',
      weight: Number(input.weight ?? 1), value: Number(input.value ?? 0) })) };
}

export function computeComputedHash(signals) {
  return JSON.stringify((signals || []).map(stripComputedDraft));
}

export function computedDraftIncomplete(signal) {
  return signal.maxAgeMs === '' || !signal.inputs?.length || signal.inputs.some(input =>
    input.sourceMode === 'Constant' ? input.value === ''
      : !String(input.oscPath || '').trim())
    || signal.operation === 'WeightedAverage' && signal.inputs.some(input => input.weight === '');
}

function mappingPreview(id, runtime) {
  return { path: id, value: runtime?.valid && Number.isFinite(runtime.value) ? String(runtime.value)
    : diagnostic(runtime?.reason) || t('保存后查看结果'), numericValue: runtime?.valid && Number.isFinite(runtime.value) ? runtime.value : undefined,
  sourceKey: runtime?.sourceKey, timestampMs: runtime?.timestampMs };
}

// Runtime values describe the saved graph. Compare structure when drafts change,
// then resolve a new runtime snapshot without scanning the parameter catalog.
export function computedMappingPreviews(drafts = [], savedSignals, runtimeSignals, graphDirty) {
  const unchanged = graphDirty === undefined ? computeComputedHash(drafts) === computeComputedHash(savedSignals) : !graphDirty;
  const runtime = new Map((unchanged ? runtimeSignals || [] : []).map(signal => [signal.id, signal]));
  return new Map(drafts.map(draft => [draft.id, mappingPreview(draft.id, runtime.get(draft.id))]));
}

export function computedMappingPreview(signal, drafts, savedSignals, runtimeSignals) {
  return computedMappingPreviews(drafts, savedSignals, runtimeSignals).get(signal.oscPath) || mappingPreview(signal.oscPath, null);
}

// Parameter browsing follows the leaves actually used by axis mappings. Drafts
// may contain incomplete references or cycles while editing, so walk iteratively
// within the same graph bounds as the runtime and leave validation to saving.
export function expandMappingSources(mappings = [], computedSignals = []) {
  const rows = Array.isArray(mappings) ? mappings : [];
  const sources = rows.filter(mapping => mapping?.sourceMode !== 'Computed');
  const definitions = new Map();
  for (const signal of (Array.isArray(computedSignals) ? computedSignals : []).slice(0, COMPUTED_SIGNAL_LIMIT)) {
    const id = String(signal?.id || '').trim();
    if (id && !definitions.has(id)) definitions.set(id, signal);
  }
  const pending = [...new Set(rows.filter(mapping => mapping?.sourceMode === 'Computed')
    .map(mapping => String(mapping.oscPath || '').trim()).filter(id => definitions.has(id)))];
  const visited = new Set(), leaves = new Map();
  while (pending.length && visited.size < COMPUTED_SIGNAL_LIMIT) {
    const id = pending.pop();
    if (visited.has(id)) continue;
    visited.add(id);
    const signal = definitions.get(id);
    for (const input of (Array.isArray(signal?.inputs) ? signal.inputs : []).slice(0, COMPUTED_INPUT_LIMIT)) {
      if (!input || signal.operation === 'WeightedAverage' && Number(input.weight ?? 1) === 0) continue;
      const oscPath = String(input.oscPath || '').trim();
      if (!oscPath) continue;
      if (input.sourceMode === 'Computed') {
        if (definitions.has(oscPath) && !visited.has(oscPath)) pending.push(oscPath);
      } else if (['Direct', 'SensaPoint', 'SensaPose'].includes(input.sourceMode || 'Direct')) {
        const source = { ...input, sourceMode: input.sourceMode || 'Direct', oscPath };
        const key = JSON.stringify([source.sourceMode, oscPath, source.pointMetric || 'Z', source.poseMetric || 'Depth']);
        if (!leaves.has(key)) leaves.set(key, source);
      }
    }
  }
  return [...sources, ...leaves.values()];
}
