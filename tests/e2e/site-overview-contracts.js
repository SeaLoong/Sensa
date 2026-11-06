// These task destinations are shared by static publishing checks and the
// browser overview check, so a README rewrite is checked before browser CI.
export function overviewTaskLinks(locale) {
  const english = locale === 'en';
  return [
    { name: english ? 'VRChat setup' : 'VRChat 设置',
      href: 'docs/usage-scenarios.html#' + encodeURIComponent(english ? 'existing-ogb--sps' : '已有-ogb--sps') },
    { name: english ? 'Player guide' : '播放器指南',
      href: 'docs/websensa.html#' + encodeURIComponent(english ? 'manual-controls-and-scripts' : '手动控制与脚本') },
    { name: english ? 'First run' : '首次使用', href: 'docs/quick-start.html' },
    { name: english ? 'All guides' : '全部指南', href: 'docs/start.html' },
    { name: english ? 'Devices and connections' : '设备与连接', href: 'docs/devices.html' },
    { name: english ? 'Protocol inputs and device bridges' : '协议输入与设备桥', href: 'docs/protocol-inputs.html' },
    { name: english ? 'Computed signals' : '计算信号', href: 'docs/computed-signals.html' },
    { name: english ? 'Multiple output bindings' : '多条输出绑定',
      href: 'docs/signal-pipeline.html#' + encodeURIComponent(english ? 'one-result-several-outputs' : '同一个结果连接多个输出') },
    { name: english ? 'Recording and replay' : '录制与回放',
      href: 'docs/signal-pipeline.html#' + encodeURIComponent(english ? 'record-and-inspect' : '录制与观察') },
    { name: english ? 'Signal-flow guide' : '信号流程指南', href: 'docs/signal-pipeline.html' },
  ];
}
