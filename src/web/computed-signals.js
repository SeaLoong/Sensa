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
  { value: 'Smooth', label: t('平滑变化') },
  { value: 'DeadZone', label: t('死区') },
  { value: 'Hysteresis', label: t('双阈值开关') },
  { value: 'Delay', label: t('延迟') },
  { value: 'Derivative', label: t('每秒变化率') },
  { value: 'PeakHold', label: t('峰值保持') },
  { value: 'RisingEdge', label: t('上升沿事件') },
  { value: 'FallingEdge', label: t('下降沿事件') },
  { value: 'Pulse', label: t('定时脉冲') },
  { value: 'Cooldown', label: t('带冷却的触发') },
  { value: 'Duration', label: t('持续条件') },
  { value: 'Sine', label: t('正弦节奏') },
  { value: 'Envelope', label: t('渐入渐出') },
]);

export const computedInputOptions = localized(() => [
  { value: 'Direct', label: t('OSC 参数') },
  { value: 'SensaPoint', label: t('定位测量') },
  { value: 'SensaPose', label: t('三点姿态指标') },
  { value: 'Computed', label: t('计算信号') },
  { value: 'Manual', label: t('手动信号') },
  { value: 'Script', label: t('脚本信号') },
  { value: 'DeviceFeedback', label: t('设备反馈') },
  { value: 'RecordingReplay', label: t('录制回放') },
  { value: 'Constant', label: t('固定数值') },
]);

export function makeComputedInput(input = {}) {
  return { sourceMode: 'Direct', oscPath: '', pointMetric: 'Z', poseMetric: 'Depth', weight: 1, value: 0, ...input };
}

export function buildComputedDrafts(signals = []) {
  return (Array.isArray(signals) ? signals : []).map(signal => ({ ...COMPUTED_TIME_DEFAULTS, ...signal,
    inputs: (signal.inputs || []).map(makeComputedInput) }));
}

export function newComputedDraft(signals = []) {
  const ids = new Set(signals.map(signal => signal.id));
  let index = 1;
  while (ids.has(`Signal${index}`)) index++;
  return { id: `Signal${index}`, name: t('计算 {0}', [index]), operation: 'WeightedAverage',
    inputs: [makeComputedInput(), makeComputedInput()], maxAgeMs: 0, ...COMPUTED_TIME_DEFAULTS };
}

export function stripComputedDraft(signal) {
  return { id: String(signal.id || '').trim(), name: String(signal.name || '').trim(),
    operation: signal.operation || 'WeightedAverage', maxAgeMs: Number(signal.maxAgeMs ?? 0),
    ...Object.fromEntries(Object.entries(COMPUTED_TIME_DEFAULTS).map(([key, fallback]) => [key, Number(signal[key] ?? fallback)])),
    inputs: (signal.inputs || []).map(input => ({ sourceMode: input.sourceMode || 'Direct',
      oscPath: String(input.oscPath || '').trim(), pointMetric: input.pointMetric || 'Z', poseMetric: input.poseMetric || 'Depth',
      weight: Number(input.weight ?? 1), value: Number(input.value ?? 0) })) };
}

export function computeComputedHash(signals) {
  return JSON.stringify((signals || []).map(stripComputedDraft));
}

export function computedDraftIncomplete(signal) {
  return signal.maxAgeMs === '' || (signal.operation !== 'Sine' && !signal.inputs?.length) || (signal.inputs || []).some(input =>
    input.sourceMode === 'Constant' ? input.value === ''
      : !String(input.oscPath || '').trim())
    || signal.operation === 'WeightedAverage' && signal.inputs.some(input => input.weight === '')
    || computedOperationFields(signal.operation).some(field => signal[field.key] === '');
}

export const COMPUTED_TIME_DEFAULTS = Object.freeze({ timeMs: 250, threshold: .5, releaseThreshold: .4, frequencyHz: 1, amplitude: 1, offset: 0 });
export const UNARY_COMPUTED_OPERATIONS = Object.freeze(['Smooth', 'DeadZone', 'Hysteresis', 'Delay', 'Derivative', 'PeakHold', 'RisingEdge', 'FallingEdge', 'Pulse', 'Cooldown', 'Duration', 'Envelope']);

export function changeComputedOperation(draft, operation) {
  let inputs = [...(draft.inputs || [])];
  if (operation === 'Sine') inputs = [];
  else if (UNARY_COMPUTED_OPERATIONS.includes(operation)) inputs = inputs.length ? inputs.slice(0, 1) : [makeComputedInput()];
  else if (['Difference', 'Ratio'].includes(operation)) inputs = [...inputs, makeComputedInput(), makeComputedInput()].slice(0, 2);
  else if (!inputs.length) inputs = [makeComputedInput()];
  return { operation, inputs };
}

export function computedOperationFields(operation) {
  const fields = [];
  const timeLabels = { Smooth: t('平滑时间（ms）'), Delay: t('延迟时间（ms）'), PeakHold: t('峰值保持时间（ms）'), Pulse: t('脉冲宽度（ms）'),
    Cooldown: t('冷却时间（ms）'), Duration: t('条件持续时间（ms）'), Envelope: t('渐入渐出时间（ms）') };
  if (timeLabels[operation]) fields.push({ key: 'timeMs', label: timeLabels[operation], min: 0, max: 60000, step: 10 });
  if (['DeadZone', 'Hysteresis', 'RisingEdge', 'FallingEdge', 'Pulse', 'Cooldown', 'Duration', 'Envelope'].includes(operation))
    fields.push({ key: 'threshold', label: operation === 'DeadZone' ? t('死区半径') : operation === 'Hysteresis' ? t('开启阈值') : t('触发阈值'), step: 'any', ...(operation === 'DeadZone' ? { min: 0 } : {}) });
  if (operation === 'Hysteresis') fields.push({ key: 'releaseThreshold', label: t('关闭阈值'), step: 'any' });
  if (operation === 'Sine') fields.push({ key: 'frequencyHz', label: t('节奏频率（Hz）'), min: 0, max: 100, step: .1 },
    { key: 'amplitude', label: t('振幅'), step: 'any' }, { key: 'offset', label: t('数值偏移'), step: 'any' });
  return fields;
}

export function computedOperationHelp(operation) {
  const help = {
    Smooth: t('按时间逐渐跟随输入，减少读数快速跳动。'), DeadZone: t('绝对值处于死区内时输出 0，超出后保留输入值。'),
    Hysteresis: t('达到开启阈值时输出 1，降到关闭阈值时输出 0。'), Delay: t('按设定时间延后输出，等待期间会显示输入尚未就绪。'),
    Derivative: t('计算输入每秒增加或减少的数值，输入的单位也随之变为每秒。'), PeakHold: t('将峰值保持指定时间，更高值更新峰值并重新计时；期满后跟随当前值。'),
    RisingEdge: t('输入向上越过阈值时输出一次 1，其余时间为 0。'), FallingEdge: t('输入向下越过阈值时输出一次 1，其余时间为 0。'),
    Pulse: t('向上越过阈值后，输出 1 并保持指定脉冲时长。'), Cooldown: t('向上越过阈值时触发一次，冷却期间等待下一次有效触发。'),
    Duration: t('输入连续达到阈值并保持指定时长后输出 1，条件结束时复位。'),
    Sine: t('按频率生成节奏：偏移＋振幅×正弦。可添加一个输入调节振幅。'), Envelope: t('输入越过阈值后渐入到 1，回落后按相同时长渐出到 0。'),
  };
  return help[operation] || '';
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
