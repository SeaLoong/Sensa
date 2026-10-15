export function oscWorkflowHints({ mappings = [], drafts = [], dirty = false, runtime = {}, mode = '', listening = false }) {
  const hints = [];
  const add = (key, text, severity = 'info') => hints.push({ key, text, severity });
  if (dirty) add('draft', '当前修改只是草稿。保存后才会生效，并会关闭输入；检查预览后再手动打开输入。', 'warning');
  if (mode.toLowerCase() !== 'osc') add('mode', '当前运行的不是 OSC。切换到 OSC 页签后，还需点击“应用输入方式”。', 'warning');
  if (!listening) add('receiver', 'OSC 尚未监听。开启 OSC 接收并保存，检查端口是否被其他程序占用。', 'warning');
  if (!mappings.length) add('mappings', '还没有已保存的映射。选择测试预设，点击“替换草稿”，再保存并应用。');
  if (runtime.isEmergency) add('emergency', '急停尚未解除。解除后仍需手动打开输入。', 'warning');
  else if (!runtime.inputActive) add('inactive', '输入已关闭：保存配置也会关闭输入。先核对接收值，再打开输入观察运行目标。');
  if (runtime.inputActive && runtime.gateClosed && mappings.length) {
    const gates = mappings.filter(m => m.role === 'GateEnable').map(m => m.oscPath);
    add('gate', `已保存映射的门控未打开${gates.length ? `：${gates.join('；')}` : ''}。切换测试时用“替换草稿”，避免保留上一项门控。`);
  }
  if (runtime.inputActive && runtime.poseBlocked) add('geometry', '定位当前无效。PB 须保持抓取；检查选中的测量目标、采样完整性和 OSC 来源。');
  const current = dirty ? drafts : mappings;
  const quickGate = current.some(m => m.role === 'GateEnable' && m.oscPath === 'Sensa/QuickStart/Active');
  if (quickGate && current.some(m => m.role !== 'GateEnable' && !m.oscPath?.startsWith('Sensa/QuickStart/')))
    add('mixed-tests', 'QuickStart 门控和其他测试映射混在一起：世界 STOP 后会同时挡住 PB / SPS。请替换整套草稿，或明确删除不用的门控。', 'warning');
  return hints;
}
