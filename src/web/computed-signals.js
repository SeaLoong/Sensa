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
  { value: 'PointDistance', label: t('两点距离') },
  { value: 'PlaneDepth', label: t('平面深度') },
  { value: 'PlaneOffset', label: t('平面内偏移') },
  { value: 'VectorAngle', label: t('向量夹角') },
  { value: 'PlaneAngle', label: t('相对平面夹角') },
  { value: 'PlaneDepthFromAxes', label: t('平面深度（两条轴）') },
  { value: 'PlaneOffsetFromAxes', label: t('平面内偏移（两条轴）') },
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
  { value: 'Protocol', label: t('协议输入') },
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
  return signal.maxAgeMs === '' || computedVectorGroups(signal.operation).length > 0 && signal.inputs?.length !== computedInputLimit(signal.operation)
    || (signal.operation !== 'Sine' && !signal.inputs?.length) || (signal.inputs || []).some(input =>
    input.sourceMode === 'Constant' ? input.value === ''
      : !String(input.oscPath || '').trim())
    || signal.operation === 'WeightedAverage' && signal.inputs.some(input => input.weight === '')
    || computedOperationFields(signal.operation).some(field => signal[field.key] === '');
}

export const COMPUTED_TIME_DEFAULTS = Object.freeze({ timeMs: 250, threshold: .5, releaseThreshold: .4, frequencyHz: 1, amplitude: 1, offset: 0 });
export const UNARY_COMPUTED_OPERATIONS = Object.freeze(['Smooth', 'DeadZone', 'Hysteresis', 'Delay', 'Derivative', 'PeakHold', 'RisingEdge', 'FallingEdge', 'Pulse', 'Cooldown', 'Duration', 'Envelope']);
export const SPATIAL_COMPUTED_OPERATIONS = Object.freeze(['PointDistance', 'PlaneDepth', 'PlaneOffset', 'VectorAngle', 'PlaneAngle', 'PlaneDepthFromAxes', 'PlaneOffsetFromAxes']);

export function computedVectorGroups(operation) {
  const point = { key: 'point', label: t('测量位置'), kind: 'position', start: 0 };
  const reference = { key: 'reference', label: operation === 'PointDistance' ? t('参考位置') : t('平面参考点'), kind: 'position', start: 3 };
  const normal = { key: 'normal', label: t('平面朝向'), kind: 'direction', start: operation === 'PlaneAngle' ? 3 : 6 };
  const direction = { key: 'direction', label: t('测量方向'), kind: 'direction', start: 0 };
  if (operation === 'PointDistance') return [point, reference];
  if (['PlaneDepth', 'PlaneOffset'].includes(operation)) return [point, reference, normal];
  if (['PlaneDepthFromAxes', 'PlaneOffsetFromAxes'].includes(operation)) return [point, reference,
    { key: 'firstAxis', label: t('平面第一条轴'), kind: 'direction', start: 6 },
    { key: 'secondAxis', label: t('平面第二条轴'), kind: 'direction', start: 9 }];
  if (operation === 'VectorAngle') return [direction, { key: 'otherDirection', label: t('参考方向'), kind: 'direction', start: 3 }];
  if (operation === 'PlaneAngle') return [direction, normal];
  return [];
}

export function computedInputLimit(operation) {
  const groups = computedVectorGroups(operation);
  if (groups.length) return groups.length * 3;
  if (UNARY_COMPUTED_OPERATIONS.includes(operation) || operation === 'Sine') return 1;
  return ['Difference', 'Ratio'].includes(operation) ? 2 : COMPUTED_INPUT_LIMIT;
}

const VECTOR_METRICS = Object.freeze({ Position: ['X', 'Y', 'Z'], Forward: ['ForwardX', 'ForwardY', 'ForwardZ'],
  Right: ['RightX', 'RightY', 'RightZ'], Velocity: ['VelocityX', 'VelocityY', 'VelocityZ'] });
export function computedVectorBinding(inputs = []) {
  if (inputs.length !== 3) return { mode: 'Components', path: '' };
  if (inputs.every(input => input.sourceMode === 'Constant')) return { mode: 'Constant', path: '' };
  for (const [mode, metrics] of Object.entries(VECTOR_METRICS)) {
    if (inputs.every((input, index) => input.sourceMode === 'SensaPoint' && input.pointMetric === metrics[index]
      && input.oscPath === inputs[0].oscPath)) return { mode, path: inputs[0].oscPath };
  }
  return { mode: 'Components', path: '' };
}
export function makeComputedVector(mode, path = '', values = [0, 0, 0]) {
  return [0, 1, 2].map(index => mode === 'Constant'
    ? makeComputedInput({ sourceMode: 'Constant', value: values[index] ?? 0 })
    : makeComputedInput({ sourceMode: 'SensaPoint', oscPath: path, pointMetric: (VECTOR_METRICS[mode] || VECTOR_METRICS.Position)[index] }));
}
function defaultComputedVector(group) {
  if (group.key === 'point') return makeComputedVector('Position');
  return makeComputedVector('Constant', '', group.kind === 'position' ? [0, 0, 0] : group.key === 'firstAxis' ? [1, 0, 0]
    : ['otherDirection', 'secondAxis'].includes(group.key) ? [0, 1, 0] : [0, 0, 1]);
}
export function newSpatialComputedDraft(signals = [], operation = 'PointDistance', pointPath = '', shaderPath = '') {
  const draft = newComputedDraft(signals);
  const next = { ...draft, ...changeComputedOperation(draft, operation) };
  next.name = computedOperationOptions().find(option => option.value === operation)?.label || draft.name;
  for (const group of computedVectorGroups(operation)) {
    if (group.key === 'point' && pointPath) next.inputs.splice(group.start, 3, ...makeComputedVector('Position', pointPath));
    if (group.key === 'direction' && shaderPath) next.inputs.splice(group.start, 3, ...makeComputedVector('Forward', shaderPath));
  }
  return next;
}
export function computedResultUnit(operation, runtime) {
  if (['VectorAngle', 'PlaneAngle'].includes(operation)) return '°';
  if (!['PointDistance', 'PlaneDepth', 'PlaneOffset', 'PlaneDepthFromAxes', 'PlaneOffsetFromAxes'].includes(operation)) return '';
  if (runtime?.coordinateFrame === 'AvatarRootMeters') return 'm';
  if (runtime?.coordinateFrame === 'AvatarRootLocal' || runtime?.coordinateFrame?.startsWith('ReferenceLocal:')) return t('局部单位');
  return '';
}

export function followingPlaneDrafts(signals, { pointPath, originPath, mode = 'Markers', includeDistance = false }) {
  const point = String(pointPath || '').trim(), origin = String(originPath || '').trim();
  if (!point || !origin || (mode === 'Shader' ? !/^Sensa\/Shader\/[^/]+\/\*\*$/.test(origin)
    : !/^Sensa\/(?:SPS|Contact)\/[^/]+_Origin\/\*\*$/.test(origin))) return [];
  const added = [];
  const append = (operation, name, inputs) => {
    const draft = { ...newComputedDraft([...signals, ...added]), operation, name, inputs };
    added.push(draft); return draft;
  };
  let normal;
  if (mode === 'Shader') normal = makeComputedVector('Forward', origin);
  else {
    const forward = origin.replace(/_Origin\/\*\*$/, '_Forward/**');
    normal = ['X', 'Y', 'Z'].map(pointMetric => {
      const component = append('Difference', t('平面朝向 · {0}', [pointMetric]), [forward, origin]
        .map(oscPath => makeComputedInput({ sourceMode: 'SensaPoint', oscPath, pointMetric })));
      return makeComputedInput({ sourceMode: 'Computed', oscPath: component.id });
    });
  }
  const positions = [...makeComputedVector('Position', point), ...makeComputedVector('Position', origin)];
  append('PlaneDepth', t('跟随平面 · 深度'), [...positions, ...normal].map(input => ({ ...input })));
  append('PlaneOffset', t('跟随平面 · 平面内偏移'), [...positions, ...normal].map(input => ({ ...input })));
  if (includeDistance) append('PointDistance', t('跟随平面 · 两点距离'), positions.map(input => ({ ...input })));
  return signals.length + added.length <= COMPUTED_SIGNAL_LIMIT ? added : [];
}

export function changeComputedOperation(draft, operation) {
  const groups = computedVectorGroups(operation);
  if (groups.length) {
    const previous = computedVectorGroups(draft.operation);
    return { operation, inputs: groups.flatMap(group => {
      const existing = previous.find(item => item.key === group.key);
      const inputs = existing ? (draft.inputs || []).slice(existing.start, existing.start + 3) : [];
      return inputs.length === 3 ? inputs.map(input => ({ ...input })) : defaultComputedVector(group);
    }) };
  }
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
    PointDistance: t('测量位置到参考位置的直线距离，结果始终为零或正数。两组 XYZ 使用同一坐标系和单位。'),
    PlaneDepth: t('从平面参考点到测量位置，计算沿平面朝向的距离。正值在朝向一侧，负值在另一侧，落在平面上时为 0。'),
    PlaneOffset: t('将测量位置投影到平面上，再计算投影点到平面参考点的距离。它表示沿平面偏离中心的程度，结果为零或正数。'),
    VectorAngle: t('比较两组 XYZ 方向：同向为 0°，垂直为 90°，反向为 180°。向量长度不影响角度。'),
    PlaneAngle: t('测量方向相对平面的角度：沿平面为 0°，朝向法线为 +90°，背向法线为 −90°。'),
    PlaneDepthFromAxes: t('两条轴共同确定平面，正方向按第一条轴 × 第二条轴计算。默认 X 轴与 Y 轴得到 +Z；交换轴顺序会翻转深度正负。'),
    PlaneOffsetFromAxes: t('两条轴共同确定平面，结果是测量位置在该平面内离参考点的距离。交换轴顺序保留这个距离，两条轴可以来自变形后的实际方向。'),
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
