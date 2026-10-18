import { diagnostic, t } from './i18n.js';
import { formatMode } from './input-workflows.js';

// This describes application state; it never grants permission or claims hardware feedback.
// 只解释应用状态，不授予输入许可，也不把命令当作硬件回读。
export function controlReadiness({ online = false, runtime = {}, mode = 'manual', selectedMode = mode,
  script = {}, outputs = [], outputStates = [], mappings = [], listening = false, mappingDirty = false } = {}) {
  const available = outputs.filter(output => {
    const state = outputStates.find(candidate => candidate.id === output.id);
    return output.enabled === true && state?.enabled === true && state.connected === true
      && (output.type !== 'Intiface' || state.devices?.some(device => device.positionFeatures > 0 || device.vibrateFeatures > 0));
  }).length;
  const make = (key, title, detail, tone = 'info', action = null) =>
    ({ key, title, detail, tone, action, availableOutputs: available, totalOutputs: outputs.length });
  if (!online) return make('offline', t('连接已断开'), t('命令不会自动重发。'), 'warning');
  if (runtime.isEmergency) return make('emergency', t('急停已锁定'), t('解除后仍需重新启用输入。'), 'error');
  if (mode === 'osc' && runtime.poseBlocked)
    return make('geometry', t('空间输入被阻断'), diagnostic(runtime.spatialInputBlockedReason) || t('检查实验许可和完整、新鲜的采样。'), 'warning', 'osc-diagnostics');
  if (mode === 'osc' && runtime.gateClosed)
    return make('gate', t('门控关闭'), t('所有已保存门控均需开放。'), 'warning', 'osc-mappings');
  if (selectedMode !== mode) return make('browsing',
    t('正在浏览 {0}，实际输入为 {1}', [formatMode(selectedMode), formatMode(mode)]),
    t('应用输入方式后会关闭输入。'));
  if (!outputs.length) return make('no-outputs', t('当前仅供预览'), t('添加并配置输出后才能发送到设备。'), 'info', 'outputs');
  if (mode === 'script' && !script.loaded)
    return make('script-empty', t('先选择脚本'), t('funscript 生成 L0 目标，不会自动启用输入。'));
  if (mode === 'osc' && !listening)
    return make('osc-receiver', t('OSC 尚未监听'), t('检查接收设置和实际输入方式。'), 'warning', 'osc-settings');
  if (mode === 'osc' && !mappings.length)
    return make('osc-mappings', t('尚无已保存映射'), t('选择实际参数、设置量程并保存映射。'), 'info', 'osc-mappings');
  if (mode === 'osc' && mappingDirty)
    return make('draft', t('使用已保存映射'), t('修改尚未保存，当前输出不使用草稿。'), 'info', 'osc-mappings');
  if (!available) return make('outputs-unavailable', t('尚无可用输出'),
    t('检查输出启用、连接及 Intiface 设备扫描。'), 'info', 'outputs');
  if (!runtime.inputActive) return make('inactive', t('输入已关闭'),
    t('可准备目标或预览脚本；不会自动启用输入。'));
  if (mode === 'script' && !script.playing)
    return make('script-paused', t('脚本未播放'), t('输入已启用，定位或步进仍可发送目标。'));
  if (mode === 'manual' && !runtime.manualOverrideEnabled)
    return make('manual-waiting', t('等待手动目标'), t('发送一次，或开启连续发送后调整滑条。'));
  return make('enabled', t('{0} 输入已启用', [formatMode(mode)]),
    mode === 'manual' ? t('连续发送跟随调整，不自动往返。') : mode === 'script'
      ? t('按脚本时间线生成 L0 目标。') : t('按已保存映射生成目标。'), 'success');
}
