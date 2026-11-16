import { t } from './i18n.js';
import { COMPUTED_SIGNAL_LIMIT, makeComputedInput, newComputedDraft } from './computed-signals.js';

export function transformPresets() {
  return [
    { id: 'smooth-manual', name: t('手动信号平滑'), description: t('L0 手动信号经过 250 ms 平滑，减少目标突变。'), operation: 'Smooth', inputs: [{ sourceMode: 'Manual', oscPath: 'L0' }], timeMs: 250 },
    { id: 'mix-manual-script', name: t('手动与脚本混合'), description: t('手动 L0 与脚本 L0 各占一半；在输入页应用组合输入。'), operation: 'WeightedAverage', inputs: [{ sourceMode: 'Manual', oscPath: 'L0' }, { sourceMode: 'Script', oscPath: 'L0' }] },
    { id: 'threshold-manual', name: t('阈值开关'), description: t('手动 L0 达到 60% 时开启，低于 40% 时关闭，避免临界抖动。'), operation: 'Hysteresis', inputs: [{ sourceMode: 'Manual', oscPath: 'L0' }], threshold: 0.6, releaseThreshold: 0.4 },
    { id: 'slow-wave', name: t('缓慢往复节奏'), description: t('生成 0～1 的平滑周期，每 4 秒一个周期；保存后再连接到目标。'), operation: 'Sine', inputs: [], frequencyHz: 0.25, amplitude: 0.5, offset: 0.5 },
  ];
}

export function createTransformPreset(id, drafts = []) {
  const preset = transformPresets().find(item => item.id === id);
  if (!preset || drafts.length >= COMPUTED_SIGNAL_LIMIT) return null;
  const { id: _presetId, description: _description, ...settings } = preset;
  return { ...newComputedDraft(drafts), ...settings, inputs: settings.inputs.map(input => makeComputedInput(input)) };
}
