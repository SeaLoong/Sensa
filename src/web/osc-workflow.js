import { t } from './i18n.js';
export function oscWorkflowHints({ mappings = [], dirty = false, runtime = {}, mode = '', listening = false }) {
  const hints = [];
  const add = (key, text, severity = 'info') => hints.push({ key, text, severity });
  if (dirty) add('draft', t("当前修改只是草稿。保存后才会生效，并会关闭输入；检查预览后再手动打开输入。"), 'warning');
  if (mode.toLowerCase() !== 'osc') add('mode', t("要使用 OSC 控制设备，请切换到 OSC 页签并点击“应用输入方式”。"), 'warning');
  if (!listening) add('receiver', t("OSC 尚未监听。开启 OSC 接收并保存，检查端口是否被其他程序占用。"), 'warning');
  if (!mappings.length) add('mappings', t("还没有已保存的映射。选择实际 OGB 参数或自定义映射，替换草稿后保存。"));
  if (runtime.isEmergency) add('emergency', t("急停尚未解除。解除后仍需手动打开输入。"), 'warning');
  else if (!runtime.inputActive) add('inactive', t("输入已关闭：保存配置也会关闭输入。先核对接收值，再打开输入观察运行目标。"));
  if (runtime.inputActive && runtime.gateClosed && mappings.length) {
    const gates = mappings.filter(m => m.role === 'GateEnable').map(m => m.oscPath);
    add('gate', t("动作正在等待启用条件{0}。检查相应接触或抓取状态；切换方案时用“替换草稿”更新整组条件。", [gates.length ? `：${gates.join('；')}` : '']));
  }
  if (runtime.inputActive && runtime.poseBlocked) add('geometry', t("定位当前无效。PB 须保持抓取；检查选中的测量目标、采样完整性和 OSC 来源。"));
  return hints;
}
