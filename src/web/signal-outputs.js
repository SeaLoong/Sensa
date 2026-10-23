import { t } from './i18n.js';
import { makeComputedInput, stripComputedDraft } from './computed-signals.js';

export const SIGNAL_OUTPUT_TYPES = Object.freeze(['OscParameter', 'Dglab', 'Recording', 'HttpJson', 'WebSocketJson', 'Mqtt', 'Midi']);
export const SIGNAL_BINDING_LIMIT = 64;
export const MANUAL_SIGNAL_AXES = Object.freeze(['L0', 'L1', 'L2', 'R0', 'R1', 'R2', 'V0', 'V1', 'V2', 'A0', 'A1', 'A2']);

export function isSignalOutputType(type) {
  return SIGNAL_OUTPUT_TYPES.includes(type);
}

function nextId(bindings) {
  const existing = new Set(bindings.map(binding => binding.id));
  let index = 1;
  while (existing.has(`Binding${index}`)) index++;
  return `Binding${index}`;
}

export function makeOutputBinding(bindings = [], type = 'OscParameter', patch = {}) {
  const address = type === 'OscParameter' ? '/avatar/parameters/SensaFeedback'
    : type === 'Dglab' ? 'Intensity' : type === 'Mqtt' ? 'sensa/value' : type === 'Midi' ? 'CC/1/1' : type.startsWith('TCode') ? 'L0' : type === 'Intiface' ? 'V0' : 'value';
  return { id: nextId(bindings), name: '',
    address, valueType: type === 'Midi' ? 'Int' : 'Float', inputMin: 0, inputMax: 1, outputMin: 0, outputMax: type === 'Midi' ? 127 : 1,
    curve: 'Linear', stopValue: 0, rateHz: 20, epsilon: .001, sendMode: 'OnChange', ...patch,
    source: makeComputedInput(patch.source || { sourceMode: 'Manual', oscPath: 'L0' }) };
}

export function buildSignalOutputDraft(type, source = {}) {
  return {
    vrChat: false, serverUrl: 'wss://trex.dungeon-lab.cn/v4', clientId: '', slotId: '', channel: 0,
    maxIntensity: 0, taskDurationMs: 250, recordingFormat: 'JsonLines', recordingName: '',
    mqttTopicPrefix: '', mqttClientId: '', mqttUseTls: false, midiPortName: '', ...source,
    waveformFrames: [...(source.waveformFrames || [])],
    bindings: (source.bindings || []).map(binding => makeOutputBinding([], type, binding)),
  };
}

function finite(value, label) {
  if (value === '' || value === null || !Number.isFinite(Number(value))) throw new Error(t('请为“{0}”填写有效数值。', [label]));
  return Number(value);
}

export function stripSignalOutputDraft(type, source = {}) {
  const draft = buildSignalOutputDraft(type, source);
  if (draft.bindings.length > SIGNAL_BINDING_LIMIT) throw new Error(t('每个输出最多配置 {0} 条连接。', [SIGNAL_BINDING_LIMIT]));
  return { ...draft, serverUrl: String(draft.serverUrl || '').trim(), clientId: String(draft.clientId || '').trim(),
    slotId: String(draft.slotId || '').trim(), recordingName: String(draft.recordingName || '').trim(),
    channel: Number(draft.channel), maxIntensity: finite(draft.maxIntensity, t('通道强度上限')),
    taskDurationMs: finite(draft.taskDurationMs, t('任务持续时间（ms）')),
    waveformFrames: draft.waveformFrames.map(frame => String(frame).trim()).filter(Boolean),
    bindings: draft.bindings.map(binding => ({ ...binding, id: String(binding.id || '').trim(), name: String(binding.name || '').trim(),
      address: String(binding.address || '').trim(), source: {
        ...binding.source, sourceMode: binding.source.sourceMode || 'Direct', oscPath: String(binding.source.oscPath || '').trim(),
        value: finite(binding.source.value ?? 0, t('固定数值')), weight: finite(binding.source.weight ?? 1, t('权重')),
      },
      ...Object.fromEntries(['inputMin', 'inputMax', 'outputMin', 'outputMax', 'stopValue', 'rateHz', 'epsilon'].map(key => [key, finite(binding[key], binding.name || binding.id)])),
    })),
  };
}

export function applyVrChatOutput(output, checked) {
  const signal = buildSignalOutputDraft('OscParameter', output.signal);
  return { ...output, ...(checked ? { host: '127.0.0.1', port: 9000 } : {}), signal: { ...signal, vrChat: checked,
    bindings: signal.bindings.length ? signal.bindings : [makeOutputBinding([], 'OscParameter')],
  } };
}

// Independent basic patterns built from the public COYOTE 3 frame layout:
// four frequency-code bytes (10–240), then four amplitude bytes (0–100).
// One frame covers four 25 ms samples. No SDK waveform table is bundled.
export function dglabBasicFrames(preset) {
  const hex = value => value.toString(16).padStart(2, '0').toUpperCase();
  const frame = values => [...Array(4).fill(40), ...values].map(hex).join('');
  if (preset === 'steady') return [frame(Array(4).fill(35))];
  if (preset === 'alternating') return [frame(Array(4).fill(20)), frame(Array(4).fill(45))];
  if (preset === 'fade') return Array.from({ length: 10 }, (_, index) => frame(Array.from({ length: 4 }, (_, sample) => Math.round((1 - Math.cos(2 * Math.PI * (index * 4 + sample) / 40)) * 25))));
  return [];
}

// A portable plan includes the dependency graph and targets as one reviewable
// draft. Imported connections start disabled and use the normal save transaction.
export function exportSignalPlan(config) {
  return { kind: 'SensaSignalPlan', name: t('Sensa 交互方案'),
    computedSignals: (config?.computedSignals || []).map(stripComputedDraft),
    signals: globalThis.structuredClone(config?.signals || []),
    axisProfiles: globalThis.structuredClone(config?.axisProfiles || []),
    outputs: globalThis.structuredClone(config?.outputs || []).map(output => ({ ...output, enabled: false,
      ...(output.signal ? { signal: stripSignalOutputDraft(output.type, output.signal) } : {}),
    })),
  };
}

export function parseSignalPlan(text) {
  if (typeof text !== 'string' || text.length > 2 * 1024 * 1024) throw new Error(t('请选择不超过 2 MiB 的 Sensa 交互方案。'));
  const plan = JSON.parse(text);
  if (plan?.kind !== 'SensaSignalPlan' || !Array.isArray(plan.computedSignals) || !Array.isArray(plan.signals) || !Array.isArray(plan.outputs)
    || plan.computedSignals.length > 64 || plan.signals.length > 512 || plan.outputs.length > 64
    || plan.axisProfiles !== undefined && (!Array.isArray(plan.axisProfiles) || plan.axisProfiles.length > 64))
    throw new Error(t('方案应包含完整的输入映射、计算信号和输出配置。'));
  const copy = globalThis.structuredClone(plan);
  copy.outputs = copy.outputs.map(output => ({ ...output, enabled: false }));
  return copy;
}
