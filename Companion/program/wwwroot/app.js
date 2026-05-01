// ============================================================
// Sensa WebUI — Vue 3 CDN  (v20250503)
// ============================================================
const { createApp, ref, reactive, computed, watch, nextTick, onMounted, onUnmounted, defineComponent } = Vue; // ───── CONSTANTS ─────────────────────────────────────────────
const LANGUAGES = ['zh-CN', 'en'];
const DEVICE_MEMORY_KEY = 'sensa.deviceMemory';
const DEVICE_CONFIG_KEY = 'sensa.deviceCfg';
const SHOW_MOCK = new URLSearchParams(location.search).has('mock');
const MAX_HIST = 300;
const AXES = ['L0', 'R0', 'R1', 'R2', 'L1', 'L2', 'Vibrate'];
const AXIS_DEFS = { L0: 0, R0: 0.5, R1: 0.5, R2: 0.5, L1: 0.5, L2: 0.5, Vibrate: 0 };
const AXIS_KEY = { L0: 'l0', R0: 'r0', R1: 'r1', R2: 'r2', L1: 'l1', L2: 'l2', Vibrate: 'vibrate' };
const AXIS_LABELS = {
  L0: { zh: 'L0 主冲程', en: 'L0 Stroke' },
  R0: { zh: 'R0 横滚', en: 'R0 Roll' },
  R1: { zh: 'R1 俯仰', en: 'R1 Pitch' },
  R2: { zh: 'R2 扭转', en: 'R2 Twist' },
  L1: { zh: 'L1 横向', en: 'L1 Lateral' },
  L2: { zh: 'L2 前后', en: 'L2 Forward' },
  Vibrate: { zh: '振动', en: 'Vibrate' },
};
const MOCK_DEVICES = [
  {
    id: 'mock:sr6',
    memoryId: 'mock:sr6',
    kind: 'tcode',
    source: 'mock',
    name: 'SR6 Mock Rig',
    model: 'SR6',
    connectionLabel: 'TCode',
    summary: '6 轴串口设备布局预览，用于检查 SR6 轴向与卡片样式。',
    facts: { port: 'COM-MOCK', mode: 'Speed', axes: 'L0/R0/R1/R2/L1/L2', state: 'Preview' },
    quickActions: ['park'],
    snapshot: { comPort: 'COM-MOCK', minPos: 100, maxPos: 900, maxVelocity: 1400, updatesPerSecond: 50, preferSpeedMode: true, rampUpMs: 2000 },
  },
];

// ───── I18N ─────────────────────────────────────────────────
const I18N = {
  'zh-CN': {
    'hero.desc': '本地控制台，用于 TCode 串口设备连接、配置与实时控制。',
    'btn.refresh': '刷新状态',
    'btn.save': '保存配置',
    'btn.apply': '应用并保存',
    'btn.reloadConfig': '重新读取',
    'btn.addSignal': '新增信号',
    'btn.delete': '删除',
    'btn.connectTCode': '连接 TCode',
    'btn.disconnectTCode': '断开 TCode',
    'btn.parkTCode': 'TCode 回中',
    'btn.park': '回中',
    'btn.startLoop': '启动 Loop',
    'btn.stopLoop': '停止 Loop',
    'btn.startRecording': '开始录制',
    'btn.stopRecording': '停止录制',
    'btn.exportFunscript': '导出 .funscript',
    'btn.saveDeviceCfg': '保存设备配置',
    'btn.loadDeviceCfg': '读取已保存',
    'btn.applyManual': '应用手动测试',
    'btn.clearManual': '清除手动测试',
    'btn.copyDiag': '复制诊断摘要',
    'btn.centerAxes': '回正所有轴',
    'cb.manualEnabled': '启用手动覆盖',
    'cb.gateOpen': 'GateOpen',
    'nav.overview': '总览',
    'nav.config': '配置',
    'nav.devices': '设备',
    'nav.control': '控制',
    'nav.scripts': '脚本',
    'nav.monitoring': '监控',
    'nav.help': '帮助',
    'overview.title': '总览',
    'overview.badge': '当前状态',
    'overview.status': '服务状态',
    'overview.diag': '实时诊断',
    'overview.diagDesc': '当前运行状态与异常提示。',
    'overview.devices.title': '已连接设备总览',
    'overview.devices.desc': '优先显示已连接真实设备。',
    'overview.guide.none.title': '暂无连接的设备',
    'overview.guide.none.body': '请前往「配置」页连接 TCode 串口设备，再到「设备」页进行手动测试。',
    'overview.guide.connected.title': '设备链路已建立',
    'overview.guide.connected.body': '可前往「控制」页手动测试轴向，或直接「启动 Loop」开始实时输出。',
    'overview.guide.osc.title': 'OSC 尚未收到参数',
    'overview.guide.osc.body': '请确认 VRChat 已启用 OSC，端口与 Sensa 配置的接收端口一致。',
    'config.tcode.title': 'TCode 串口连接',
    'config.tcode.desc': '适用于 OSR2 / SR6 / OSR6 等 TCode 串口设备。',
    'config.service.title': '服务配置',
    'config.service.desc': '管理服务地址、端口和 OSC 接收端口。',
    'config.safety.title': '安全与限制',
    'config.safety.desc': '全局强度上限、空闲行为与紧急停止热键。',
    'cfg.webui.host': 'Host',
    'cfg.webui.port': 'Port',
    'cfg.osc.port': 'ReceiverPort',
    'cfg.tcode.comPort': '串口号 (COM Port)',
    'cfg.tcode.minPos': 'MinPos',
    'cfg.tcode.maxPos': 'MaxPos',
    'cfg.tcode.maxVel': 'MaxVelocity',
    'cfg.tcode.ups': 'UpdatesPerSecond',
    'cfg.tcode.enabled': '启用 TCode 自动连接',
    'cfg.tcode.speedMode': '优先速度模式',
    'cfg.tcode.refreshPorts': '刷新',
    'cfg.safety.cap': '全局强度上限 (GlobalIntensityCap)',
    'cfg.safety.ramp': 'RampUpMs（启动渐增）',
    'cfg.safety.idle': '空闲行为 (Idle)',
    'cfg.safety.estop': '紧急停止热键 (EmergencyStopKey)',
    'cfg.rhythm.enabled': '启用 BPM 检测',
    'cfg.rhythm.window': 'WindowMs',
    'cfg.rhythm.minBpm': 'MinBpm',
    'cfg.rhythm.maxBpm': 'MaxBpm',
    'signals.title': '信号矩阵',
    'signals.desc': '集中编辑信号路径、角色和曲线映射。',
    'signals.filter': '搜索 OSC Path 或 Role',
    'sig.oscPath': 'OSC Path',
    'sig.role': 'Role',
    'sig.curve': 'Curve',
    'sig.min': 'Min',
    'sig.max': 'Max',
    'sig.alpha': 'α',
    'sig.dz': 'Dead Zone',
    'sig.inv': 'Invert',
    'sig.latest': '最新值',
    'devices.title': '设备工作台',
    'devices.desc': '已连接设备的参数配置与快捷操作。',
    'devices.test.title': '手动测试',
    'devices.test.desc': '在不启动 Loop 的情况下验证设备轴向响应。',
    'devices.range.title': '输出范围',
    'devices.range.desc': '设备行程的下限与上限（TCode 0–999）。',
    'devices.params.title': '设备参数',
    'devices.params.maxVel': 'MaxVelocity（速度上限）',
    'devices.params.ups': 'UpdatesPerSecond（帧率）',
    'devices.params.ramp': 'RampUpMs（启动渐增）',
    'devices.empty.title': '当前没有真实连接设备',
    'devices.empty.body': '可用 ?mock URL 参数开启 Mock 预览，或到「配置」页连接设备。',
    'devices.memory.title': '设备备注',
    'devices.memory.none': '还没有保存的备注。',
    'devices.memory.saved': '已保存 {time}',
    'devices.alias': '设备别名',
    'devices.note': '设备备注',
    'devices.profile': '连接快照',
    'control.title': '实时控制',
    'control.desc': '手动调节各轴位置与参数。',
    'control.axes.title': '轴位控制',
    'control.axes.running': 'Loop 运行中，仅显示实时输出值。停止 Loop 后方可手动操作。',
    'control.axes.stopped': 'Loop 已停止。可拖动滑条设置各轴位置，再点「应用」发送至设备。',
    'control.bpm.title': 'BPM 节奏检测',
    'control.bpm.desc': '分析 OSC 信号变化频率，自动估算节拍 BPM。',
    'control.invert.title': 'L0 轴反转',
    'control.invert.desc': '将 L0 输出取反（0↔1），修改后需保存配置。',
    'control.manual.title': '手动覆盖',
    'control.manual.desc': '启用后滑条值将覆盖 OSC 信号直接发送至设备。',
    'scripts.title': '脚本工作台',
    'scripts.badge': 'Script Studio',
    'scripts.recording.title': '录制与导出',
    'scripts.recording.desc': '录制当前 L0 输出并导出为 .funscript 文件。',
    'scripts.recording.hint': '导出前自动做 RDP 简化；浏览器本地预览不直接控制设备。',
    'scripts.import.title': '导入与来源',
    'scripts.import.desc': '使用录制缓存，或导入本地 .funscript 文件。',
    'scripts.import.file': '选择 .funscript 文件',
    'scripts.import.useRecording': '使用当前录制缓存',
    'scripts.import.clear': '清空脚本预览',
    'scripts.player.title': '脚本预览播放',
    'scripts.player.desc': '仅用于波形检查，不向设备发送命令。',
    'scripts.player.play': '播放',
    'scripts.player.pause': '暂停',
    'scripts.player.stop': '停止',
    'scripts.player.empty': '未加载',
    'scripts.player.playing': '播放中',
    'scripts.player.paused': '已暂停',
    'scripts.timeline.title': '时间轴摘要',
    'scripts.timeline.desc': '脚本来源、帧数和时长摘要。',
    'scripts.timeline.empty': '当前没有可预览的脚本数据。',
    'scripts.meta.empty': '当前未加载脚本。',
    'scripts.meta.recording': '录制缓存：{count} 个采样点，约 {duration}。',
    'scripts.meta.imported': '已导入 `{name}`：{count} 个动作点，时长约 {duration}。',
    'scripts.summary.source': '当前来源',
    'scripts.summary.points': '动作/采样',
    'scripts.summary.duration': '时长',
    'scripts.summary.position': '当前位置',
    'scripts.source.empty': '未加载',
    'scripts.source.recording': '录制缓存',
    'scripts.source.imported': '导入脚本',
    'scripts.timeline.source': '来源',
    'scripts.timeline.frames': '关键点数量',
    'scripts.timeline.density': '关键点密度',
    'scripts.timeline.range': '时长范围',
    'scripts.timeline.preview': '当前位置',
    'monitor.params.title': '参数流',
    'monitor.params.desc': '实时收到的 OSC 参数。',
    'monitor.params.filter': '搜索参数路径 / 类型',
    'monitor.chart.title': '轴位输出历史',
    'monitor.chart.desc': 'over time',
    'monitor.logs.title': '日志',
    'monitor.logs.desc': '连接、配置与运行事件日志。',
    'monitor.logs.filter': '搜索日志关键字',
    'help.title': '帮助与文档',
    'help.endpoints.title': 'HTTP / WS 端点',
    'help.links.title': '参考链接',
    'help.links.desc': '相关文档与外部参考资料。',
    'help.links.tcodeSpec': 'TCode 轴、命令和扩展项的公开规范。',
    'help.links.osr': '固件参考实现，适合对照轴向与实时控制语义。',
    'help.links.emu': '适合对照 TCode 的 Ixxxx / Sxxxx 行为与姿态模型。',
    'help.links.vsp': '补充说明串口连接、设备准备与测试流程。',
    'label.loop': 'Loop',
    'label.params': '参数数量',
    'label.recording': '录制',
    'label.manual': '手动测试',
    'label.output': '输出',
    'label.port': '端口',
    'label.mode': '模式',
    'label.frames': '帧数',
    'label.mock': 'Mock 预览',
    'label.real': '真实设备',
    'label.on': '开',
    'label.off': '关',
    'label.speed': '速度模式',
    'label.interval': '时间模式',
    'label.none': '无',
    'status.running': '运行中',
    'status.stopped': '已停止',
    'status.connected': '已连接',
    'status.disconnected': '未连接',
    'status.idle': '空闲',
    'status.active': '活动中',
    'status.normal': '正常',
    'status.triggered': '已触发',
    'status.enabled': '已启用',
    'status.disabled': '未启用',
    'status.wsConnected': 'WS 已连接',
    'status.wsDisconnected': 'WS 未连接',
    'toast.refreshFailed': '刷新失败',
    'toast.refreshSuccess': '状态已刷新',
    'toast.saved': '配置已保存',
    'toast.applied': '配置已保存',
    'toast.actionSuccess': '操作成功',
    'toast.actionFailed': '操作失败',
    'toast.signalAdded': '已新增信号',
    'toast.exportDone': '导出完成',
    'toast.diagCopied': '诊断已复制',
    'toast.themeChanged': '主题已切换',
    'toast.langChanged': '界面语言已切换',
    'toast.portsRefreshed': '串口列表已刷新',
    'toast.scriptLoaded': '脚本已加载',
    'toast.scriptCleared': '脚本预览已清空',
    'toast.scriptFailed': '脚本加载失败',
    'toast.deviceCfgSaved': '设备配置已保存',
    'toast.deviceCfgLoaded': '已读取保存的配置',
    'msg.saved': '配置已写入磁盘。',
    'msg.applied': '配置已应用并保存。',
    'msg.signalAdded': '请填写 OSC Path 并选择合适的 Role。',
    'msg.noRecording': '没有可导出的录制数据',
    'msg.diagCopied': '诊断摘要已复制。',
    'msg.tcodeConnectFailed': 'TCode 连接失败，请检查 COM 口、驱动、串口占用和设备供电。',
    'msg.actionReportedFailure': '服务返回失败状态，请查看日志。',
    'msg.scriptInvalid': '不是有效的 .funscript JSON，或缺少 actions 数组。',
    'msg.portsRefreshed': '可用 COM 口已重新枚举。',
    'msg.deviceCfgSaved': '设备参数已保存到本地。再次连接时可一键读取。',
    'msg.deviceCfgLoaded': '已读取该设备已保存的参数配置。',
    'diag.loopStopped.title': 'Loop 当前未运行',
    'diag.loopStopped.body': '不会继续向设备发送融合命令。点击「启动 Loop」恢复。',
    'diag.emergency.title': 'Emergency Stop 已触发',
    'diag.emergency.body': '设备输出被强制压制。确认安全后可清除紧急停止。',
    'diag.tcodeMissing.title': 'TCode 自动连接已启用但未连接',
    'diag.tcodeMissing.body': '请确认 COM 口正确、未被占用，可在「配置」页手动重连。',
    'diag.oscMissing.title': '尚未收到 OSC 参数',
    'diag.oscMissing.body': '检查 VRChat OSC 是否启用、端口是否为 9001，以及头像是否带有 Sensa 组件。',
    'diag.ok.title': '运行状态良好',
    'diag.ok.body': '当前没有发现明显的连接或运行问题。',
    'recording.summary': '录制状态：{state}，累计 {count} 帧。',
    'recording.active': '录制中',
    'recording.inactive': '未录制',
    'ws.disconnected': 'WS 未连接',
    'tip.tcode.comPort': '填写设备串口号，如 COM3。可点「刷新」枚举可用串口。',
    'tip.tcode.minPos': '输出下限（0–999），对应行程底端。默认 100。',
    'tip.tcode.maxPos': '输出上限（0–999），对应行程顶端。默认 900。',
    'tip.tcode.maxVel': '每帧最大移动量（速度上限）。越小越安全，越大动作越快。',
    'tip.tcode.ups': '每秒向设备发送命令的频率。建议 50–100。',
    'tip.tcode.enabled': '服务启动时自动连接到指定串口。',
    'tip.tcode.speedMode': '发送速度指令 (Ixxxx) 代替位置指令 (Lxxxx)。需固件支持。',
    'tip.stat.loop': 'Loop 是主处理循环，运行时才向设备下发融合后的命令。',
    'tip.stat.bpm': '由 OSC 信号变化推算出的节拍 BPM，0 表示未检测到节奏。',
    'tip.stat.params': '当前通过 OSC 收到并更新的参数总数。',
    'tip.stat.oscPort': '当前监听 VRChat OSC 数据的 UDP 端口。',
    'tip.stat.tcode': 'TCode 串口设备的连接状态。',
    'tip.stat.recording': 'L0 输出录制状态。可在脚本页导出为 .funscript。',
    'tip.stat.manual': '手动覆盖状态。启用后设备接受手动测试值。',
    'tip.stat.output': '当前各轴的实时输出值。',
  },
  en: {
    'hero.desc': 'Local console for TCode serial device connection, configuration, and real-time control.',
    'btn.refresh': 'Refresh',
    'btn.save': 'Save Config',
    'btn.apply': 'Apply & Save',
    'btn.reloadConfig': 'Reload',
    'btn.addSignal': 'Add Signal',
    'btn.delete': 'Delete',
    'btn.connectTCode': 'Connect TCode',
    'btn.disconnectTCode': 'Disconnect TCode',
    'btn.parkTCode': 'Park TCode',
    'btn.park': 'Park',
    'btn.startLoop': 'Start Loop',
    'btn.stopLoop': 'Stop Loop',
    'btn.startRecording': 'Start Recording',
    'btn.stopRecording': 'Stop Recording',
    'btn.exportFunscript': 'Export .funscript',
    'btn.saveDeviceCfg': 'Save Device Config',
    'btn.loadDeviceCfg': 'Load Saved',
    'btn.applyManual': 'Apply Manual Test',
    'btn.clearManual': 'Clear Manual Test',
    'btn.copyDiag': 'Copy Diagnostics',
    'btn.centerAxes': 'Center All Axes',
    'cb.manualEnabled': 'Enable Manual Override',
    'cb.gateOpen': 'GateOpen',
    'nav.overview': 'Overview',
    'nav.config': 'Config',
    'nav.devices': 'Devices',
    'nav.control': 'Control',
    'nav.scripts': 'Scripts',
    'nav.monitoring': 'Monitoring',
    'nav.help': 'Help',
    'overview.title': 'Overview',
    'overview.badge': 'Current status',
    'overview.status': 'Service Status',
    'overview.diag': 'Live Diagnostics',
    'overview.diagDesc': 'Current runtime status and active warnings.',
    'overview.devices.title': 'Connected Device Overview',
    'overview.devices.desc': 'Real connected devices shown first.',
    'overview.guide.none.title': 'No connected devices',
    'overview.guide.none.body': 'Go to Config to connect your TCode device, then test in Devices.',
    'overview.guide.connected.title': 'A device path is available',
    'overview.guide.connected.body': 'Use the Control tab for manual testing or start Loop for live output.',
    'overview.guide.osc.title': 'No OSC parameters yet',
    'overview.guide.osc.body': 'Check VRChat OSC settings, confirm port 9001, and verify the avatar has Sensa components.',
    'config.tcode.title': 'TCode Serial Connection',
    'config.tcode.desc': 'For OSR2 / SR6 / OSR6 style TCode devices.',
    'config.service.title': 'Service Configuration',
    'config.service.desc': 'Manage host, port, and OSC port settings.',
    'config.safety.title': 'Safety & Limits',
    'config.safety.desc': 'Global intensity cap, idle behavior, and emergency stop hotkey.',
    'cfg.webui.host': 'Host',
    'cfg.webui.port': 'Port',
    'cfg.osc.port': 'ReceiverPort',
    'cfg.tcode.comPort': 'COM Port',
    'cfg.tcode.minPos': 'MinPos',
    'cfg.tcode.maxPos': 'MaxPos',
    'cfg.tcode.maxVel': 'MaxVelocity',
    'cfg.tcode.ups': 'UpdatesPerSecond',
    'cfg.tcode.enabled': 'Enable TCode auto-connect',
    'cfg.tcode.speedMode': 'Prefer speed mode',
    'cfg.tcode.refreshPorts': 'Refresh',
    'cfg.safety.cap': 'GlobalIntensityCap',
    'cfg.safety.ramp': 'RampUpMs',
    'cfg.safety.idle': 'Idle Behavior',
    'cfg.safety.estop': 'EmergencyStopKey',
    'cfg.rhythm.enabled': 'Enable BPM detection',
    'cfg.rhythm.window': 'WindowMs',
    'cfg.rhythm.minBpm': 'MinBpm',
    'cfg.rhythm.maxBpm': 'MaxBpm',
    'signals.title': 'Signal Matrix',
    'signals.desc': 'Edit signal paths, roles, and curve mappings.',
    'signals.filter': 'Search OSC path or role',
    'sig.oscPath': 'OSC Path',
    'sig.role': 'Role',
    'sig.curve': 'Curve',
    'sig.min': 'Min',
    'sig.max': 'Max',
    'sig.alpha': 'α',
    'sig.dz': 'Dead Zone',
    'sig.inv': 'Invert',
    'sig.latest': 'Latest',
    'devices.title': 'Device Workbench',
    'devices.desc': 'Device parameter configuration and quick actions.',
    'devices.test.title': 'Manual Test',
    'devices.test.desc': 'Test device axis responses without a live VRChat signal.',
    'devices.range.title': 'Output Range',
    'devices.range.desc': 'Device travel limits (TCode 0–999).',
    'devices.params.title': 'Device Parameters',
    'devices.params.maxVel': 'MaxVelocity (speed cap)',
    'devices.params.ups': 'UpdatesPerSecond (frame rate)',
    'devices.params.ramp': 'RampUpMs (startup ramp)',
    'devices.empty.title': 'No real connected devices',
    'devices.empty.body': 'Use ?mock URL parameter for mock preview, or go to Config to connect a device.',
    'devices.memory.title': 'Device Note',
    'devices.memory.none': 'No note saved for this device.',
    'devices.memory.saved': 'Saved at {time}',
    'devices.alias': 'Device Alias',
    'devices.note': 'Device Note',
    'devices.profile': 'Connection Snapshot',
    'control.title': 'Live Control',
    'control.desc': 'Manually adjust axis positions and parameters.',
    'control.axes.title': 'Axis Control',
    'control.axes.running': 'Loop is running — showing live read-only output. Stop Loop to enable manual control.',
    'control.axes.stopped': 'Loop is stopped. Drag sliders to set axis positions, then click Apply.',
    'control.bpm.title': 'BPM Rhythm Detection',
    'control.bpm.desc': 'Estimates BPM from OSC signal variation frequency.',
    'control.invert.title': 'L0 Axis Invert',
    'control.invert.desc': 'Inverts L0 output (0↔1). Requires saving config.',
    'control.manual.title': 'Manual Override',
    'control.manual.desc': 'When enabled, slider values are sent directly to the device instead of OSC signals.',
    'scripts.title': 'Script Studio',
    'scripts.badge': 'Script Studio',
    'scripts.recording.title': 'Recording & Export',
    'scripts.recording.desc': 'Capture live L0 output and export as .funscript.',
    'scripts.recording.hint': 'Export uses trajectory simplification. Preview does not control devices.',
    'scripts.import.title': 'Import & Source',
    'scripts.import.desc': 'Use the recording buffer or import a .funscript file.',
    'scripts.import.file': 'Choose .funscript file',
    'scripts.import.useRecording': 'Use current recording buffer',
    'scripts.import.clear': 'Clear preview',
    'scripts.player.title': 'Script Preview',
    'scripts.player.desc': 'Waveform inspection only — does not control devices.',
    'scripts.player.play': 'Play',
    'scripts.player.pause': 'Pause',
    'scripts.player.stop': 'Stop',
    'scripts.player.empty': 'No script loaded',
    'scripts.player.playing': 'Playing',
    'scripts.player.paused': 'Paused',
    'scripts.timeline.title': 'Timeline Summary',
    'scripts.timeline.desc': 'Source, frame count, and duration.',
    'scripts.timeline.empty': 'No script data available.',
    'scripts.meta.empty': 'No script data loaded.',
    'scripts.meta.recording': 'Recording buffer: {count} samples over about {duration}.',
    'scripts.meta.imported': 'Imported `{name}`: {count} action points, about {duration}.',
    'scripts.summary.source': 'Current source',
    'scripts.summary.points': 'Actions / samples',
    'scripts.summary.duration': 'Duration',
    'scripts.summary.position': 'Current position',
    'scripts.source.empty': 'Empty',
    'scripts.source.recording': 'Recording buffer',
    'scripts.source.imported': 'Imported script',
    'scripts.timeline.source': 'Source',
    'scripts.timeline.frames': 'Key points',
    'scripts.timeline.density': 'Key density',
    'scripts.timeline.range': 'Duration range',
    'scripts.timeline.preview': 'Current position',
    'monitor.params.title': 'Parameter Stream',
    'monitor.params.desc': 'Live OSC parameters received.',
    'monitor.params.filter': 'Search parameter path / type',
    'monitor.chart.title': 'Axis Output History',
    'monitor.chart.desc': 'over time',
    'monitor.logs.title': 'Logs',
    'monitor.logs.desc': 'Connection, config, and runtime event logs.',
    'monitor.logs.filter': 'Search logs',
    'help.title': 'Help & Documentation',
    'help.endpoints.title': 'HTTP / WS Endpoints',
    'help.links.title': 'Reference Links',
    'help.links.desc': 'Documentation and related external resources.',
    'help.links.tcodeSpec': 'Public spec for TCode axes, commands, and extension terms.',
    'help.links.osr': 'Firmware reference for axis naming and real-time behavior.',
    'help.links.emu': 'Useful for comparing Ixxxx / Sxxxx behavior and pose models.',
    'help.links.vsp': 'Additional guidance for serial setup, device prep, and testing.',
    'label.loop': 'Loop',
    'label.params': 'Parameters',
    'label.recording': 'Recording',
    'label.manual': 'Manual',
    'label.output': 'Output',
    'label.port': 'Port',
    'label.mode': 'Mode',
    'label.frames': 'Frames',
    'label.mock': 'Mock Preview',
    'label.real': 'Real Device',
    'label.on': 'On',
    'label.off': 'Off',
    'label.speed': 'Speed Mode',
    'label.interval': 'Interval Mode',
    'label.none': 'None',
    'status.running': 'Running',
    'status.stopped': 'Stopped',
    'status.connected': 'Connected',
    'status.disconnected': 'Disconnected',
    'status.idle': 'Idle',
    'status.active': 'Active',
    'status.normal': 'Normal',
    'status.triggered': 'Triggered',
    'status.enabled': 'Enabled',
    'status.disabled': 'Disabled',
    'status.wsConnected': 'WS Connected',
    'status.wsDisconnected': 'WS Offline',
    'toast.refreshFailed': 'Refresh failed',
    'toast.refreshSuccess': 'State refreshed',
    'toast.saved': 'Config saved',
    'toast.applied': 'Config saved',
    'toast.actionSuccess': 'Action completed',
    'toast.actionFailed': 'Action failed',
    'toast.signalAdded': 'Signal added',
    'toast.exportDone': 'Export complete',
    'toast.diagCopied': 'Diagnostics copied',
    'toast.themeChanged': 'Theme changed',
    'toast.langChanged': 'Language changed',
    'toast.portsRefreshed': 'Serial ports refreshed',
    'toast.scriptLoaded': 'Script loaded',
    'toast.scriptCleared': 'Script preview cleared',
    'toast.scriptFailed': 'Script load failed',
    'toast.deviceCfgSaved': 'Device config saved',
    'toast.deviceCfgLoaded': 'Saved config loaded',
    'msg.saved': 'Config written to disk.',
    'msg.applied': 'Config applied and saved.',
    'msg.signalAdded': 'Fill in the OSC path and choose a role.',
    'msg.noRecording': 'No recording data available',
    'msg.diagCopied': 'Diagnostics summary copied.',
    'msg.tcodeConnectFailed': 'TCode connection failed. Check COM port, driver, contention, and device power.',
    'msg.actionReportedFailure': 'The service reported a failure. Check logs.',
    'msg.scriptInvalid': 'Not a valid .funscript JSON or missing actions array.',
    'msg.portsRefreshed': 'Available COM ports were re-enumerated.',
    'msg.deviceCfgSaved': 'Device parameters saved locally. Load on next connect.',
    'msg.deviceCfgLoaded': 'Loaded saved parameters for this device.',
    'diag.loopStopped.title': 'Loop is not running',
    'diag.loopStopped.body': 'No fused commands are being sent. Click Start Loop if this is unexpected.',
    'diag.emergency.title': 'Emergency Stop is active',
    'diag.emergency.body': 'Device output is clamped. Clear the emergency stop when safe to resume.',
    'diag.tcodeMissing.title': 'TCode auto-connect is enabled but not connected',
    'diag.tcodeMissing.body': 'Check COM port, ensure it is free, then retry from Config.',
    'diag.oscMissing.title': 'No OSC parameters received yet',
    'diag.oscMissing.body': 'Check VRChat OSC, confirm port 9001, verify avatar has Sensa components.',
    'diag.ok.title': 'System looks healthy',
    'diag.ok.body': 'No obvious connection or runtime problems detected.',
    'recording.summary': 'Recording: {state}, {count} frames.',
    'recording.active': 'Recording',
    'recording.inactive': 'Not recording',
    'ws.disconnected': 'WS Offline',
    'tip.tcode.comPort': 'Serial port for the device, e.g. COM3. Click Refresh to list available ports.',
    'tip.tcode.minPos': 'Minimum axis position (0–999), bottom of travel. Usually 100.',
    'tip.tcode.maxPos': 'Maximum axis position (0–999), top of travel. Usually 900.',
    'tip.tcode.maxVel': 'Max per-frame movement (velocity cap). Lower values protect mechanics.',
    'tip.tcode.ups': 'Commands per second sent to the device. 50–100 recommended.',
    'tip.tcode.enabled': 'Auto-connect to the specified serial port on service start.',
    'tip.tcode.speedMode': 'Send speed (Ixxxx) instead of position (Lxxxx) commands. Requires interpolating firmware.',
    'tip.stat.loop': 'Main processing loop. Must be running to send commands.',
    'tip.stat.bpm': 'Current BPM estimated from OSC signal variation. 0 = no rhythm.',
    'tip.stat.params': 'Number of OSC parameters received. 0 means no OSC signal yet.',
    'tip.stat.oscPort': 'UDP port listening for VRChat OSC data.',
    'tip.stat.tcode': 'TCode serial device connection state.',
    'tip.stat.recording': 'L0 recording state. Export as .funscript from Scripts tab.',
    'tip.stat.manual': 'Manual override state. When enabled, device uses manual test values.',
    'tip.stat.output': 'Current real-time axis output values.',
  },
};

// ───── REACTIVE STATE ─────────────────────────────────────────
const appState = reactive({
  meta: null,
  config: null,
  overview: null,
  parameters: [],
  logs: [],
  serialPorts: [],
  recordingFrames: [],
  roles: [],
  curves: [],
  idleBehaviors: [],
  activeTab: localStorage.getItem('sensa.activeTab') || 'overview',
  language: localStorage.getItem('sensa.language') || 'zh-CN',
  theme: 'light',
  wsConnected: false,
  wsRetryMs: 1000,
  toastList: [], // kept for backward compat but unused
  filters: { signals: '', parameters: '', logs: '' },
  // Control tab
  manual: { ...AXIS_DEFS },
  manualEnabled: false,
  manualGateOpen: true,
  // Script player
  scriptPlayer: {
    source: 'empty',
    name: '',
    points: [],
    durationMs: 0,
    currentMs: 0,
    isPlaying: false,
    startedAtMs: 0,
    baselineMs: 0,
    rafId: 0,
  },
  // Axis history for ECharts
  axisHistory: [],
  // Device config locally persisted
  deviceDrafts: {},
});

const TABS = [
  { id: 'overview', label: 'nav.overview' },
  { id: 'config', label: 'nav.config' },
  { id: 'devices', label: 'nav.devices' },
  { id: 'control', label: 'nav.control' },
  { id: 'scripts', label: 'nav.scripts' },
  { id: 'monitoring', label: 'nav.monitoring' },
  { id: 'help', label: 'nav.help' },
];

// ───── UTILITIES ──────────────────────────────────────────────
function t(key, replacements = null) {
  const table = I18N[appState.language] || I18N['zh-CN'];
  let v = table[key] ?? I18N['zh-CN'][key] ?? key;
  if (replacements) for (const [k, r] of Object.entries(replacements)) v = v.replaceAll(`{${k}}`, r);
  return v;
}

function esc(v) {
  return String(v ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function fmtDur(ms) {
  const s = Math.floor(Math.max(0, ms) / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

async function api(path, opts = {}) {
  const r = await fetch(path, { headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) }, ...opts });
  if (!r.ok) {
    const tx = await r.text();
    throw new Error(`${r.status} ${r.statusText} - ${tx}`);
  }
  const ct = r.headers.get('content-type') || '';
  return ct.includes('application/json') ? r.json() : r.text();
}

function showToast(title, message, type = 'success', ms = 2800) {
  const content = [title, message].filter(Boolean).join(': ');
  const duration = ms;
  if (type === 'error') TDesign.MessagePlugin.error({ content, duration });
  else if (type === 'warn' || type === 'warning') TDesign.MessagePlugin.warning({ content, duration });
  else TDesign.MessagePlugin.success({ content, duration });
}

function loadDeviceMem() {
  try {
    return JSON.parse(localStorage.getItem(DEVICE_MEMORY_KEY) || '{}');
  } catch {
    return {};
  }
}
function saveDeviceMem(m) {
  localStorage.setItem(DEVICE_MEMORY_KEY, JSON.stringify(m));
}
function getDeviceMem(device) {
  return loadDeviceMem()[`${device.kind}:${device.memoryId}`] || null;
}
function setDeviceMem(device, payload) {
  const m = loadDeviceMem();
  m[`${device.kind}:${device.memoryId}`] = { ...payload, savedAt: new Date().toISOString() };
  saveDeviceMem(m);
}
function clearDeviceMem(device) {
  const m = loadDeviceMem();
  delete m[`${device.kind}:${device.memoryId}`];
  saveDeviceMem(m);
}

function loadDeviceCfg(port) {
  try {
    const all = JSON.parse(localStorage.getItem(DEVICE_CONFIG_KEY) || '{}');
    return all[port] || null;
  } catch {
    return null;
  }
}
function saveDeviceCfg(port, cfg) {
  try {
    const all = JSON.parse(localStorage.getItem(DEVICE_CONFIG_KEY) || '{}');
    all[port] = { ...cfg, savedAt: new Date().toISOString() };
    localStorage.setItem(DEVICE_CONFIG_KEY, JSON.stringify(all));
  } catch {}
}

function axisLabel(axis) {
  const rec = AXIS_LABELS[axis];
  if (!rec) return axis;
  return appState.language === 'zh-CN' ? rec.zh : rec.en;
}

// ───── DEVICE BUILD ───────────────────────────────────────────
function buildRealDevices() {
  const devs = [];
  if (appState.overview?.tcode?.connected) {
    const cfg = appState.config?.tCode || {};
    devs.push({
      id: `tcode:${cfg.comPort || 'unknown'}`,
      memoryId: cfg.comPort || 'unknown',
      kind: 'tcode',
      source: 'real',
      name: cfg.comPort ? `TCode @ ${cfg.comPort}` : 'TCode Device',
      model: cfg.comPort?.toUpperCase().includes('COM') ? 'OSR-class' : 'TCode',
      connectionLabel: 'TCode',
      summary: '当前通过串口连接的 OSR 类设备。',
      facts: {
        port: cfg.comPort || t('label.none'),
        mode: cfg.preferSpeedMode ? t('label.speed') : t('label.interval'),
        ups: `${cfg.updatesPerSecond ?? '-'} UPS`,
        state: t('status.connected'),
      },
      quickActions: ['park'],
      snapshot: {
        comPort: cfg.comPort,
        minPos: cfg.minPos,
        maxPos: cfg.maxPos,
        maxVelocity: cfg.maxVelocity,
        updatesPerSecond: cfg.updatesPerSecond,
        preferSpeedMode: cfg.preferSpeedMode,
        rampUpMs: appState.config?.safety?.rampUpMs,
      },
    });
  }
  return devs;
}

function buildMockDevices() {
  return MOCK_DEVICES.map(m => ({ ...m }));
}

// ───── SCRIPT PLAYER ─────────────────────────────────────────
function stopScriptPlayback() {
  const p = appState.scriptPlayer;
  p.isPlaying = false;
  if (p.rafId) {
    cancelAnimationFrame(p.rafId);
    p.rafId = 0;
  }
}

function setScriptMs(ms) {
  const p = appState.scriptPlayer;
  p.currentMs = Math.max(0, Math.min(p.durationMs || 0, Math.round(ms || 0)));
}

function getScriptValAt(ms) {
  const pts = appState.scriptPlayer.points || [];
  if (!pts.length) return 0;
  let v = pts[0].value;
  for (const pt of pts) {
    if (pt.ms > ms) break;
    v = pt.value;
  }
  return v;
}

function setScriptDataset({ source, name, points, durationMs }) {
  stopScriptPlayback();
  appState.scriptPlayer = {
    ...appState.scriptPlayer,
    source,
    name,
    points,
    durationMs: Math.max(0, Math.round(durationMs || 0)),
    currentMs: 0,
    isPlaying: false,
    startedAtMs: 0,
    baselineMs: 0,
    rafId: 0,
  };
}

function parseFunscript(text) {
  const data = JSON.parse(text);
  if (!data || !Array.isArray(data.actions)) throw new Error(t('msg.scriptInvalid'));
  const pts = data.actions.map(a => ({ ms: Math.max(0, Math.round(Number(a.at) || 0)), value: Math.max(0, Math.min(1, (Number(a.pos) || 0) / 100)) })).sort((a, b) => a.ms - b.ms);
  return { points: pts, durationMs: pts.length ? pts[pts.length - 1].ms : 0 };
}

// ───── CANVAS DRAW ────────────────────────────────────────────
function drawDevice(ctx, width, height, command = {}) {
  ctx.clearRect(0, 0, width, height);
  const cx = width / 2 + ((command.l2 ?? 0.5) - 0.5) * Math.min(width * 0.22, 180);
  const cy = height / 2 - ((command.l1 ?? 0.5) - 0.5) * Math.min(height * 0.35, 120);
  const stroke = command.l0 ?? 0;
  const roll = (((command.r0 ?? 0.5) - 0.5) * Math.PI) / 1.4;
  const pitch = (((command.r1 ?? 0.5) - 0.5) * Math.PI) / 1.4;
  const twist = ((command.r2 ?? 0.5) - 0.5) * Math.PI * 2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(roll * 0.45);
  const bLen = Math.round(110 + stroke * Math.min(height * 0.42, 95));
  const bW = 36 + Math.cos(twist) * 4;
  ctx.fillStyle = 'rgba(101,162,255,0.15)';
  ctx.strokeStyle = 'rgba(101,162,255,0.92)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.roundRect(-bW / 2, -bLen / 2, bW, bLen, 16);
  ctx.fill();
  ctx.stroke();
  ctx.save();
  ctx.translate(0, -bLen / 2);
  ctx.rotate(twist);
  ctx.beginPath();
  ctx.ellipse(0, 0, 24, 14 + Math.abs(pitch) * 8, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(75,216,168,0.16)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(75,216,168,0.9)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
  ctx.restore();
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.font = '12px Segoe UI,sans-serif';
  ctx.fillText(`L0 ${Number(command.l0 ?? 0).toFixed(2)} · R0 ${Number(command.r0 ?? 0.5).toFixed(2)} · Vib ${Number(command.vibrate ?? 0).toFixed(2)}`, 12, 18);
}

// ─────────────────────────────────────────────────────────────
// COMPONENTS
// ─────────────────────────────────────────────────────────────

// Dual-range range slider
const DualRange = {
  name: 'DualRange',
  props: {
    modelValue: { type: Array, default: () => [0, 100] },
    min: { type: Number, default: 0 },
    max: { type: Number, default: 999 },
    label: String,
    disabled: Boolean,
  },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    const low = computed(() => props.modelValue[0]);
    const high = computed(() => props.modelValue[1]);
    const pct = v => (((v - props.min) / (props.max - props.min)) * 100).toFixed(2);
    const fillStyle = computed(() => ({
      left: `${pct(low.value)}%`,
      width: `${pct(high.value) - pct(low.value)}%`,
    }));
    function onLow(e) {
      const v = Math.min(Number(e.target.value), high.value - 1);
      emit('update:modelValue', [v, high.value]);
    }
    function onHigh(e) {
      const v = Math.max(Number(e.target.value), low.value + 1);
      emit('update:modelValue', [low.value, v]);
    }
    return { low, high, pct, fillStyle, onLow, onHigh };
  },
  template: `
<div class="drange" :class="{disabled}">
  <div class="drange__header">
    <span class="drange__label">{{ label }}</span>
    <span class="drange__value">{{ low }} – {{ high }}</span>
    <span class="drange__max muted">/ {{ max }}</span>
  </div>
  <div class="drange__wrap">
    <div class="drange__rail"></div>
    <div class="drange__fill" :style="fillStyle"></div>
    <input class="drange__input" type="range" :min="min" :max="max" :value="low"  :disabled="disabled" @input="onLow" />
    <input class="drange__input" type="range" :min="min" :max="max" :value="high" :disabled="disabled" @input="onHigh" />
  </div>
</div>`,
};

// Single axis slider with fill track
const AxisSlider = {
  name: 'AxisSlider',
  props: {
    modelValue: { type: Number, default: 0 },
    axis: String,
    min: { type: Number, default: 0 },
    max: { type: Number, default: 1 },
    step: { type: Number, default: 0.01 },
    disabled: Boolean,
    readonly: Boolean,
  },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    const pct = computed(() => ((((props.modelValue ?? 0) - props.min) / (props.max - props.min)) * 100).toFixed(1) + '%');
    const trackStyle = computed(() => ({
      background: `linear-gradient(to right,var(--primary) ${pct.value},var(--border) ${pct.value})`,
    }));
    function onInput(e) {
      emit('update:modelValue', Number(e.target.value));
    }
    return { pct, trackStyle, onInput, axisLabel };
  },
  template: `
<div class="axis-row" :class="{disabled:disabled||readonly}">
  <div class="axis-row__info">
    <span class="axis-row__name">{{ axis }}</span>
    <span class="axis-row__label">{{ axisLabel(axis) }}</span>
    <span class="axis-row__val">{{ Number(modelValue??0).toFixed(2) }}</span>
  </div>
  <input class="axis-row__input" type="range" :min="min" :max="max" :step="step"
    :value="modelValue" :disabled="disabled||readonly" :style="trackStyle"
    @input="onInput" />
</div>`,
};

// Posture canvas component
const PostureCanvas = {
  name: 'PostureCanvas',
  props: { command: { type: Object, default: () => ({}) } },
  setup(props) {
    const cvs = ref(null);
    function redraw() {
      const el = cvs.value;
      if (!el) return;
      const dpr = window.devicePixelRatio || 1;
      const w = el.clientWidth || 160;
      const h = el.clientHeight || 90;
      el.width = Math.round(w * dpr);
      el.height = Math.round(h * dpr);
      const ctx = el.getContext('2d');
      ctx.scale(dpr, dpr);
      drawDevice(ctx, w, h, props.command);
    }
    watch(() => props.command, redraw, { deep: true });
    onMounted(() => {
      nextTick(redraw);
      window.addEventListener('resize', redraw);
    });
    onUnmounted(() => window.removeEventListener('resize', redraw));
    return { cvs };
  },
  template: `<canvas ref="cvs" class="posture-canvas"></canvas>`,
};

// ECharts line chart panel
const EChartPanel = {
  name: 'EChartPanel',
  props: { history: { type: Array, default: () => [] }, lang: String },
  setup(props) {
    const el = ref(null);
    let chart = null;
    const SERIES_CFG = [
      { key: 'l0', name: 'L0', color: '#0052d9' },
      { key: 'r0', name: 'R0', color: '#00a870' },
      { key: 'r1', name: 'R1', color: '#8B5CF6' },
      { key: 'r2', name: 'R2', color: '#f0a020' },
      { key: 'l1', name: 'L1', color: '#e34d59' },
      { key: 'l2', name: 'L2', color: '#00b4d8' },
      { key: 'vibrate', name: 'Vib', color: '#ff6b35' },
    ];
    function buildOption(hist) {
      const times = hist.map(d => new Date(d.time).toLocaleTimeString());
      return {
        backgroundColor: 'transparent',
        grid: { left: 40, right: 12, top: 32, bottom: 36 },
        tooltip: { trigger: 'axis', axisPointer: { type: 'cross' }, backgroundColor: 'rgba(255,255,255,0.95)', borderColor: '#d3d8e3', textStyle: { color: '#4a5568', fontSize: 12 } },
        legend: { top: 4, textStyle: { color: '#4a5568', fontSize: 11 }, data: SERIES_CFG.map(s => s.name) },
        xAxis: {
          type: 'category',
          data: times,
          axisLine: { lineStyle: { color: '#d3d8e3' } },
          axisLabel: { color: '#8a9199', fontSize: 10, rotate: 0, showMaxLabel: true, showMinLabel: true, interval: 'auto' },
          splitLine: { show: false },
        },
        yAxis: { type: 'value', min: 0, max: 1, splitLine: { lineStyle: { color: '#f0f2f5', type: 'dashed' } }, axisLabel: { color: '#8a9199', fontSize: 10 }, axisLine: { show: false } },
        series: SERIES_CFG.map(s => ({
          name: s.name,
          type: 'line',
          smooth: true,
          symbol: 'none',
          lineStyle: { width: 1.5, color: s.color },
          data: hist.map(d => +(d[s.key] ?? 0).toFixed(3)),
          color: s.color,
        })),
      };
    }
    onMounted(() => {
      chart = echarts.init(el.value, null, { renderer: 'canvas' });
      chart.setOption(buildOption(props.history));
      window.addEventListener('resize', () => chart?.resize());
    });
    onUnmounted(() => {
      chart?.dispose();
      chart = null;
    });
    watch(
      () => props.history.length,
      () => chart?.setOption(buildOption(props.history), { notMerge: false }),
    );
    return { el };
  },
  template: `<div ref="el" class="echart-panel"></div>`,
};

// Script Canvas component
const ScriptCanvas = {
  name: 'ScriptCanvas',
  props: { player: { type: Object, required: true } },
  setup(props) {
    const cvs = ref(null);
    function draw() {
      const el = cvs.value;
      if (!el) return;
      const dpr = window.devicePixelRatio || 1;
      const cw = el.clientWidth || 800;
      const ch = 220;
      el.width = Math.round(cw * dpr);
      el.height = Math.round(ch * dpr);
      const ctx = el.getContext('2d');
      ctx.scale(dpr, dpr);
      const w = cw;
      const h = ch;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(0,0,0,0.06)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 5; i++) {
        const y = 20 + ((h - 40) / 4) * i;
        ctx.beginPath();
        ctx.moveTo(14, y);
        ctx.lineTo(w - 14, y);
        ctx.stroke();
      }
      const p = props.player;
      if (!p.points.length || p.durationMs <= 0) {
        ctx.fillStyle = '#8a9199';
        ctx.font = '13px Segoe UI,sans-serif';
        ctx.fillText(t('scripts.timeline.empty'), 20, h / 2);
        return;
      }
      const px = 18,
        py = 16,
        pw = w - 36,
        ph = h - 36;
      ctx.strokeStyle = '#0052d9';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      p.points.forEach((pt, i) => {
        const x = px + (pt.ms / p.durationMs) * pw;
        const y = py + (1 - pt.value) * ph;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.stroke();
      const cx2 = px + ((p.currentMs || 0) / p.durationMs) * pw;
      ctx.strokeStyle = 'rgba(227,77,89,0.88)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx2, py);
      ctx.lineTo(cx2, py + ph);
      ctx.stroke();
      const cy2 = py + (1 - getScriptValAt(p.currentMs || 0)) * ph;
      ctx.fillStyle = '#e34d59';
      ctx.beginPath();
      ctx.arc(cx2, cy2, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    watch(() => [props.player.currentMs, props.player.points.length, props.player.source], draw, { deep: false });
    onMounted(() => {
      nextTick(draw);
      window.addEventListener('resize', draw);
    });
    onUnmounted(() => window.removeEventListener('resize', draw));
    return { cvs };
  },
  template: `<canvas ref="cvs" class="script-canvas"></canvas>`,
};

// ─────────────────────────────────────────────────────────────
// ROOT APP
// ─────────────────────────────────────────────────────────────
const App = {
  name: 'SensaApp',
  components: { DualRange, AxisSlider, PostureCanvas, EChartPanel, ScriptCanvas },

  setup() {
    const st = appState;

    // ── computed ──
    const lang = computed(() => st.language);
    const loopRun = computed(() => st.overview?.loop?.isRunning ?? false);
    const cmd = computed(() => st.overview?.loop?.command || {});
    const devices = computed(() => {
      const r = buildRealDevices();
      return SHOW_MOCK ? [...r, ...buildMockDevices()] : r;
    });
    const deviceRange = computed({
      get: () => [st.config?.tCode?.minPos ?? 100, st.config?.tCode?.maxPos ?? 900],
      set([lo, hi]) {
        if (st.config?.tCode) {
          st.config.tCode.minPos = lo;
          st.config.tCode.maxPos = hi;
        }
      },
    });
    const overviewBpm = computed(() => Number(st.overview?.loop?.currentBpm ?? 0).toFixed(1));
    const tcodeSummary = computed(() => {
      if (!st.config || !st.overview) return [];
      const c = st.config.tCode || {};
      return [
        [t('label.port'), c.comPort || t('label.none')],
        [t('label.mode'), c.preferSpeedMode ? t('label.speed') : t('label.interval')],
        [t('label.auto'), c.enabled ? t('label.on') : t('label.off')],
        [t('label.frames'), `${c.updatesPerSecond ?? '-'} UPS`],
      ];
    });
    const signalLatestMap = computed(() => {
      const m = new Map();
      (st.overview?.signals || []).forEach(s => m.set(s.signal.oscPath, s.latest?.value));
      return m;
    });
    const filtSigs = computed(() => {
      const f = (st.filters.signals || '').trim().toLowerCase();
      return (st.config?.signals || []).filter(s => !f || `${s.oscPath} ${s.role} ${s.curve}`.toLowerCase().includes(f));
    });
    const filtParams = computed(() => {
      const f = (st.filters.parameters || '').trim().toLowerCase();
      return st.parameters.filter(p => !f || `${p.path} ${p.type}`.toLowerCase().includes(f)).slice(0, 300);
    });
    const filtLogs = computed(() => {
      const f = (st.filters.logs || '').trim().toLowerCase();
      return st.logs.filter(l => !f || l.message.toLowerCase().includes(f));
    });
    const diagnostics = computed(() => {
      if (!st.overview) return [];
      const ov = st.overview;
      const ds = [];
      if (!ov.loop.isRunning) ds.push({ type: 'warn', title: t('diag.loopStopped.title'), body: t('diag.loopStopped.body') });
      if (ov.loop.isEmergency) ds.push({ type: 'error', title: t('diag.emergency.title'), body: t('diag.emergency.body') });
      if (!ov.tcode.connected && st.config?.tCode?.enabled) ds.push({ type: 'warn', title: t('diag.tcodeMissing.title'), body: t('diag.tcodeMissing.body') });
      if ((ov.osc.parameterCount || 0) === 0) ds.push({ type: 'warn', title: t('diag.oscMissing.title'), body: t('diag.oscMissing.body') });
      if (!ds.length) ds.push({ type: 'ok', title: t('diag.ok.title'), body: t('diag.ok.body') });
      return ds;
    });
    const overviewGuide = computed(() => {
      const items = [];
      if (!devices.value.length) items.push({ title: t('overview.guide.none.title'), body: t('overview.guide.none.body') });
      else items.push({ title: t('overview.guide.connected.title'), body: t('overview.guide.connected.body') });
      if ((st.overview?.osc?.parameterCount || 0) === 0) items.push({ title: t('overview.guide.osc.title'), body: t('overview.guide.osc.body') });
      return items;
    });
    const statusCards = computed(() => {
      if (!st.overview) return [];
      const ov = st.overview;
      const c = ov.loop.command || {};
      return [
        { label: t('label.loop'), value: ov.loop.isRunning ? t('status.running') : t('status.stopped'), cls: ov.loop.isRunning ? 'ok' : 'warn', tip: t('tip.stat.loop') },
        { label: 'BPM', value: overviewBpm.value, cls: '', tip: t('tip.stat.bpm') },
        { label: t('label.params'), value: String(ov.osc.parameterCount || 0), cls: '', tip: t('tip.stat.params') },
        { label: 'OSC ' + t('label.port'), value: String(st.config?.osc?.receiverPort || '-'), cls: '', tip: t('tip.stat.oscPort') },
        {
          label: 'TCode',
          value: ov.tcode.connected ? `${t('status.connected')} · ${st.config?.tCode?.comPort || '-'}` : t('status.disconnected'),
          cls: ov.tcode.connected ? 'ok' : '',
          tip: t('tip.stat.tcode'),
        },
        {
          label: t('label.recording'),
          value: ov.recording.isActive ? `${t('recording.active')} · ${ov.recording.frameCount}` : `${t('status.idle')} · ${ov.recording.frameCount}`,
          cls: ov.recording.isActive ? 'ok' : '',
          tip: t('tip.stat.recording'),
        },
        { label: t('label.manual'), value: ov.loop.manualOverrideEnabled ? t('status.enabled') : t('status.disabled'), cls: ov.loop.manualOverrideEnabled ? 'warn' : '', tip: t('tip.stat.manual') },
        { label: t('label.output'), value: `L0 ${Number(c.l0 ?? 0).toFixed(2)} · R0 ${Number(c.r0 ?? 0.5).toFixed(2)} · V ${Number(c.vibrate ?? 0).toFixed(2)}`, cls: '', tip: t('tip.stat.output') },
      ];
    });
    const cmdBadge = computed(() => {
      const c = cmd.value;
      return `L0 ${Number(c.l0 ?? 0).toFixed(2)} · R0 ${Number(c.r0 ?? 0.5).toFixed(2)} · Vib ${Number(c.vibrate ?? 0).toFixed(2)} · Gate ${c.gateOpen ? 'Open' : 'Closed'}`;
    });
    const scriptFmtSrc = computed(() => {
      const p = st.scriptPlayer;
      return p.source === 'recording' ? t('scripts.source.recording') : p.source === 'imported' ? t('scripts.source.imported') : t('scripts.source.empty');
    });
    const scriptMeta = computed(() => {
      const p = st.scriptPlayer;
      if (p.source === 'recording') return t('scripts.meta.recording', { count: String(p.points.length), duration: fmtDur(p.durationMs) });
      if (p.source === 'imported') return t('scripts.meta.imported', { name: p.name || 'script', count: String(p.points.length), duration: fmtDur(p.durationMs) });
      return t('scripts.meta.empty');
    });
    const scriptStatusKey = computed(() => {
      const p = st.scriptPlayer;
      if (!p.points.length) return 'scripts.player.empty';
      if (p.isPlaying) return 'scripts.player.playing';
      if (p.currentMs > 0) return 'scripts.player.paused';
      return 'scripts.player.empty';
    });
    const scriptSummary = computed(() => {
      const p = st.scriptPlayer;
      const dens = p.durationMs > 0 ? (p.points.length / Math.max(p.durationMs / 1000, 1)).toFixed(1) : '0.0';
      return [
        [t('scripts.summary.source'), scriptFmtSrc.value],
        [t('scripts.summary.points'), String(p.points.length)],
        [t('scripts.summary.duration'), fmtDur(p.durationMs)],
        [t('scripts.summary.position'), `${fmtDur(p.currentMs)} · ${Math.round(getScriptValAt(p.currentMs) * 100)}%`],
        [t('scripts.timeline.frames'), String(p.points.length)],
        [t('scripts.timeline.density'), `${dens} / s`],
        [t('scripts.timeline.range'), `${fmtDur(p.points[0]?.ms || 0)} → ${fmtDur(p.durationMs)}`],
      ];
    });

    // ── actions ──
    function setActiveTab(tab) {
      st.activeTab = tab;
      localStorage.setItem('sensa.activeTab', tab);
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
    function toggleLanguage() {
      const i = LANGUAGES.indexOf(st.language);
      st.language = LANGUAGES[(i + 1) % LANGUAGES.length];
      localStorage.setItem('sensa.language', st.language);
      showToast(t('toast.langChanged'), t('msg.langChanged'));
    }
    function cycleTheme() {
      st.theme = 'light';
      document.documentElement.dataset.theme = 'light';
      localStorage.setItem('sensa.theme', 'light');
    }

    async function refreshAll(feedback = false) {
      try {
        const [meta, cfg, ov, params, logs, ports, rec] = await Promise.all([
          api('/api/meta'),
          api('/api/config'),
          api('/api/state/overview'),
          api('/api/state/parameters'),
          api('/api/state/logs'),
          api('/api/meta/serial-ports').catch(() => []),
          api('/api/state/recording/data').catch(() => []),
        ]);
        st.meta = meta;
        st.config = cfg;
        st.overview = ov;
        st.parameters = params;
        st.logs = logs;
        st.serialPorts = ports;
        st.recordingFrames = rec;
        st.roles = [...(meta.enums?.signalRoles || [])];
        st.curves = [...(meta.enums?.curveTypes || [])];
        st.idleBehaviors = [...(meta.enums?.idleBehaviors || [])];
        // sync manual from current command
        const mc = ov.loop.manualCommand || {};
        st.manualEnabled = ov.loop.manualOverrideEnabled || false;
        st.manualGateOpen = mc.gateOpen ?? true;
        AXES.forEach(ax => {
          st.manual[ax] = mc[AXIS_KEY[ax]] ?? AXIS_DEFS[ax];
        });
        // push axis history
        const c = ov.loop.command || {};
        st.axisHistory.push({ time: Date.now(), l0: c.l0 ?? 0, r0: c.r0 ?? 0.5, r1: c.r1 ?? 0.5, r2: c.r2 ?? 0.5, l1: c.l1 ?? 0.5, l2: c.l2 ?? 0.5, vibrate: c.vibrate ?? 0 });
        if (st.axisHistory.length > MAX_HIST) st.axisHistory.shift();
        if (feedback) showToast(t('toast.refreshSuccess'), ov?.service?.url || location.origin);
      } catch (e) {
        showToast(t('toast.refreshFailed'), e.message, 'error', 3600);
        throw e;
      }
    }

    async function postAction(path, body = null) {
      try {
        const result = await api(path, body ? { method: 'POST', body: JSON.stringify(body) } : { method: 'POST' });
        if (result && typeof result === 'object' && 'ok' in result && result.ok === false) {
          const msg = path === '/api/control/tcode/connect' ? t('msg.tcodeConnectFailed') : result.message || t('msg.actionReportedFailure');
          showToast(t('toast.actionFailed'), msg, 'error', 4200);
          await refreshAll().catch(() => {});
          return;
        }
        await refreshAll();
        showToast(t('toast.actionSuccess'), result?.message || path);
      } catch (e) {
        showToast(t('toast.actionFailed'), e.message, 'error', 4200);
      }
    }

    async function saveConfig() {
      try {
        await api('/api/config', { method: 'PUT', body: JSON.stringify(st.config) });
        await refreshAll();
        showToast(t('toast.applied'), t('msg.applied'));
      } catch (e) {
        showToast(t('toast.actionFailed'), e.message, 'error');
      }
    }

    async function applyManual() {
      const payload = {
        enabled: st.manualEnabled,
        gateOpen: st.manualGateOpen,
        l0: st.manual.L0,
        r0: st.manual.R0,
        r1: st.manual.R1,
        r2: st.manual.R2,
        l1: st.manual.L1,
        l2: st.manual.L2,
        vibrate: st.manual.Vibrate,
      };
      await api('/api/manual-test', { method: 'PUT', body: JSON.stringify(payload) });
      await refreshAll();
      showToast(t('toast.actionSuccess'), t('btn.applyManual'));
    }

    async function clearManual() {
      await api('/api/manual-test', { method: 'DELETE' });
      await refreshAll();
      showToast(t('toast.actionSuccess'), t('btn.clearManual'));
    }

    function centerAxes() {
      AXES.forEach(ax => {
        st.manual[ax] = AXIS_DEFS[ax];
      });
    }

    async function refreshPorts() {
      try {
        st.serialPorts = await api('/api/meta/serial-ports');
        showToast(t('toast.portsRefreshed'), t('msg.portsRefreshed'));
      } catch (e) {
        showToast(t('toast.actionFailed'), e.message, 'error');
      }
    }

    function addSignal() {
      if (!st.config) return;
      st.config.signals.push({
        oscPath: '',
        invertDirection: false,
        vrchatMin: 0,
        vrchatMax: 1,
        smoothingAlpha: 0.7,
        deadZone: 0.01,
        curve: st.curves[0] || 'Linear',
        role: st.roles[0] || 'Depth',
        isOgbSocket: false,
        isOgbPlug: false,
      });
      showToast(t('toast.signalAdded'), t('msg.signalAdded'));
    }

    function removeSignal(idx) {
      st.config.signals.splice(idx, 1);
    }

    async function copyDiag() {
      const text = diagnostics.value.map(d => `${d.title}: ${d.body}`).join('\n');
      try {
        await navigator.clipboard.writeText(text);
        showToast(t('toast.diagCopied'), t('msg.diagCopied'));
      } catch {
        showToast(t('toast.actionFailed'), 'Copy failed', 'error');
      }
    }

    async function exportRecording() {
      try {
        const r = await api('/api/control/recording/export', { method: 'POST' });
        showToast(t('toast.exportDone'), r.path || t('msg.noRecording'), r.path ? 'success' : 'error', 5000);
        await refreshAll();
      } catch (e) {
        showToast(t('toast.actionFailed'), e.message, 'error', 5000);
      }
    }

    function useRecordingDS() {
      const pts = (st.recordingFrames || []).map(f => ({ ms: Number(f.ms) || 0, value: Math.max(0, Math.min(1, Number(f.l0) || 0)) }));
      const dur = pts.length ? pts[pts.length - 1].ms : 0;
      setScriptDataset({ source: pts.length ? 'recording' : 'empty', name: 'recording', points: pts, durationMs: dur });
      showToast(t('toast.scriptLoaded'), t('scripts.meta.recording', { count: String(pts.length), duration: fmtDur(dur) }));
    }

    async function loadScriptFile(file) {
      try {
        const txt = await file.text();
        const parsed = parseFunscript(txt);
        setScriptDataset({ source: 'imported', name: file.name, points: parsed.points, durationMs: parsed.durationMs });
        showToast(t('toast.scriptLoaded'), t('scripts.meta.imported', { name: file.name, count: String(parsed.points.length), duration: fmtDur(parsed.durationMs) }));
      } catch (e) {
        showToast(t('toast.scriptFailed'), e.message || t('msg.scriptInvalid'), 'error', 4000);
      }
    }

    function scriptPlay() {
      const p = st.scriptPlayer;
      if (!p.points.length || p.durationMs <= 0) return;
      if (p.currentMs >= p.durationMs) st.scriptPlayer.currentMs = 0;
      p.isPlaying = true;
      p.baselineMs = p.currentMs;
      p.startedAtMs = performance.now();
      if (p.rafId) cancelAnimationFrame(p.rafId);
      function tick(now) {
        if (!st.scriptPlayer.isPlaying) return;
        const ms = st.scriptPlayer.baselineMs + (now - st.scriptPlayer.startedAtMs);
        if (ms >= st.scriptPlayer.durationMs) {
          setScriptMs(st.scriptPlayer.durationMs);
          stopScriptPlayback();
          return;
        }
        setScriptMs(ms);
        st.scriptPlayer.rafId = requestAnimationFrame(tick);
      }
      p.rafId = requestAnimationFrame(tick);
    }

    function scriptPause() {
      stopScriptPlayback();
    }

    function scriptStop() {
      stopScriptPlayback();
      setScriptMs(0);
    }

    function scriptSeek(ratio) {
      stopScriptPlayback();
      setScriptMs((st.scriptPlayer.durationMs || 0) * ratio);
    }

    function saveDevConfig(device) {
      const c = st.config?.tCode || {};
      const cfg = { minPos: c.minPos, maxPos: c.maxPos, maxVelocity: c.maxVelocity, updatesPerSecond: c.updatesPerSecond, rampUpMs: st.config?.safety?.rampUpMs };
      saveDeviceCfg(device.memoryId, cfg);
      showToast(t('toast.deviceCfgSaved'), t('msg.deviceCfgSaved'));
    }

    function loadDevConfig(device) {
      const saved = loadDeviceCfg(device.memoryId);
      if (!saved) {
        showToast('', 'No saved config for this device', 'warn');
        return;
      }
      if (st.config?.tCode) {
        if (saved.minPos !== undefined) st.config.tCode.minPos = saved.minPos;
        if (saved.maxPos !== undefined) st.config.tCode.maxPos = saved.maxPos;
        if (saved.maxVelocity !== undefined) st.config.tCode.maxVelocity = saved.maxVelocity;
        if (saved.updatesPerSecond !== undefined) st.config.tCode.updatesPerSecond = saved.updatesPerSecond;
      }
      if (saved.rampUpMs !== undefined && st.config?.safety) st.config.safety.rampUpMs = saved.rampUpMs;
      showToast(t('toast.deviceCfgLoaded'), t('msg.deviceCfgLoaded'));
    }

    function saveDevMemory(device, alias, note) {
      setDeviceMem(device, { alias, note, snapshot: device.snapshot });
      showToast(t('toast.memorySaved') ?? '已保存', '');
    }

    // ── WebSocket ──
    function connectWs() {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${proto}://${location.host}/api/ws`);
      ws.addEventListener('open', () => {
        st.wsRetryMs = 1000;
        st.wsConnected = true;
      });
      ws.addEventListener('close', () => {
        st.wsConnected = false;
        setTimeout(connectWs, st.wsRetryMs);
        st.wsRetryMs = Math.min(Math.round(st.wsRetryMs * 1.8), 10000);
      });
      ws.addEventListener('message', e => {
        const payload = JSON.parse(e.data);
        if (payload.type !== 'state') return;
        st.overview = payload.data;
        st.logs = payload.logs;
        const c = payload.data?.loop?.command || {};
        st.axisHistory.push({ time: Date.now(), l0: c.l0 ?? 0, r0: c.r0 ?? 0.5, r1: c.r1 ?? 0.5, r2: c.r2 ?? 0.5, l1: c.l1 ?? 0.5, l2: c.l2 ?? 0.5, vibrate: c.vibrate ?? 0 });
        if (st.axisHistory.length > MAX_HIST) st.axisHistory.shift();
      });
    }

    onMounted(async () => {
      document.documentElement.dataset.theme = 'light';
      document.title = 'Sensa WebUI';
      await refreshAll().catch(() => {});
      useRecordingDS();
      connectWs();
      setInterval(() => refreshAll().catch(() => {}), 8000);
    });

    return {
      st,
      TABS,
      t,
      fmtDur,
      esc,
      lang,
      loopRun,
      cmd,
      devices,
      deviceRange,
      overviewBpm,
      tcodeSummary,
      signalLatestMap,
      filtSigs,
      filtParams,
      filtLogs,
      diagnostics,
      overviewGuide,
      statusCards,
      cmdBadge,
      scriptFmtSrc,
      scriptMeta,
      scriptStatusKey,
      scriptSummary,
      // actions
      setActiveTab,
      toggleLanguage,
      cycleTheme,
      refreshAll,
      postAction,
      saveConfig,
      applyManual,
      clearManual,
      centerAxes,
      refreshPorts,
      addSignal,
      removeSignal,
      copyDiag,
      exportRecording,
      useRecordingDS,
      loadScriptFile,
      scriptPlay,
      scriptPause,
      scriptStop,
      scriptSeek,
      saveDevConfig,
      loadDevConfig,
      saveDevMemory,
      getDeviceMem,
      AXES,
      AXIS_DEFS,
      AXIS_KEY,
      axisLabel,
    };
  },

  template: `
<div>

  <!-- Header -->
  <header class="hero">
    <div class="hero-topbar">
      <div class="hero-brand">
        <p class="eyebrow">Sensa Local Control Console</p>
        <h1>Sensa WebUI</h1>
        <p class="hero-desc">{{ t('hero.desc') }}</p>
      </div>
      <PostureCanvas :command="cmd" />
      <div class="hero-actions">
        <t-button variant="text" class="icon-btn" :title="t('tip.lang')" @click="toggleLanguage">{{ st.language==='zh-CN'?'EN':'ZH' }}</t-button>
        <t-button variant="text" class="icon-btn" @click="cycleTheme">&#9677;</t-button>
        <t-button @click="refreshAll(true)">{{ t('btn.refresh') }}</t-button>
        <t-tag :theme="st.wsConnected?'success':'danger'" variant="light">{{ st.wsConnected?t('status.wsConnected'):t('status.wsDisconnected') }}</t-tag>
      </div>
    </div>
    <nav class="top-tabs" aria-label="主导航">
      <button v-for="tab in TABS" :key="tab.id" type="button"
        :class="['tab-button',{'is-active':st.activeTab===tab.id}]"
        @click="setActiveTab(tab.id)">{{ t(tab.label) }}</button>
    </nav>
  </header>

  <!-- Main -->
  <main class="workspace">

    <!-- ═══ OVERVIEW ═══ -->
    <section v-show="st.activeTab==='overview'" class="tab-panel is-active">
      <div class="panel-grid panel-grid--overview">

        <section class="card hero-card span-2">
          <div class="section-title-row">
            <div><h2>{{ t('overview.title') }}</h2></div>
            <t-tag variant="light">{{ t('overview.badge') }}</t-tag>
          </div>
          <div class="overview-guide">
            <article v-for="(item,i) in overviewGuide" :key="i" class="guide-step">
              <strong>{{ item.title }}</strong><div>{{ item.body }}</div>
            </article>
          </div>
          <div class="overview-actions">
            <t-button @click="postAction('/api/control/loop/start')">{{ t('btn.startLoop') }}</t-button>
            <t-button @click="postAction('/api/control/loop/stop')">{{ t('btn.stopLoop') }}</t-button>
          </div>
        </section>

        <section class="card">
          <h2>{{ t('overview.status') }}</h2>
          <div class="stats">
            <div v-for="card in statusCards" :key="card.label" :class="['stat',card.cls]" :data-tip="card.tip">
              <div class="stat-label">{{ card.label }}</div>
              <div class="stat-value">{{ card.value }}</div>
            </div>
          </div>
        </section>

        <section class="card span-3">
          <h2>{{ t('overview.devices.title') }}</h2>
          <p class="muted">{{ t('overview.devices.desc') }}</p>
          <div v-if="!devices.length" class="empty-state">
            <strong>{{ t('devices.empty.title') }}</strong>
            <div>{{ t('devices.empty.body') }}</div>
          </div>
          <div v-else class="device-deck">
            <article v-for="dev in devices" :key="dev.id" :class="['device-card','device-card--tcode',dev.source==='mock'?'device-card--mock':'','positioned']">
              <div class="device-card__meta">
                <div>
                  <span class="proto-badge tcode">{{ dev.connectionLabel }}</span>
                  <h3>{{ dev.name }}</h3>
                  <p class="muted">{{ dev.summary }}</p>
                </div>
                <t-tag :theme="dev.source==='mock'?'default':'success'" variant="light">{{ dev.source==='mock'?t('label.mock'):t('label.real') }}</t-tag>
              </div>
              <div class="device-card__facts">
                <div v-for="(v,k) in dev.facts" :key="k" class="fact-pill">
                  <strong>{{ k }}</strong><span>{{ v }}</span>
                </div>
              </div>
            </article>
          </div>
        </section>

        <section class="card span-2">
          <div class="section-title-row">
            <div><h2>{{ t('overview.diag') }}</h2><p class="muted">{{ t('overview.diagDesc') }}</p></div>
            <t-button variant="text" @click="copyDiag">{{ t('btn.copyDiag') }}</t-button>
          </div>
          <div class="diagnostic-list">
            <t-alert v-for="(d,i) in diagnostics" :key="i"
              :theme="{ok:'success',warn:'warning',error:'error'}[d.type]||'info'"
              :title="d.title" :message="d.body" style="margin-bottom:6px" />
          </div>
        </section>

      </div>
    </section>

    <!-- ═══ CONFIG ═══ -->
    <section v-show="st.activeTab==='config'" class="tab-panel">
      <div v-if="st.config" class="panel-grid panel-grid--config">

        <!-- TCode Connection -->
        <section class="card">
          <div class="section-title-row">
            <div><h2>{{ t('config.tcode.title') }}</h2><p class="muted">{{ t('config.tcode.desc') }}</p></div>
            <span class="proto-badge tcode">TCode</span>
          </div>
          <div class="device-status-row">
            <div v-for="([lb,vl],i) in tcodeSummary" :key="i" :class="['device-status-chip',st.overview?.tcode?.connected?'ok':'']">
              <strong>{{ lb }}</strong><span>{{ vl }}</span>
            </div>
          </div>
          <div class="form-stack compact-form">
            <label :title="t('tip.tcode.comPort')">
              <span>{{ t('cfg.tcode.comPort') }}</span>
              <div class="input-row">
                <t-select v-model="st.config.tCode.comPort" filterable :creatable="true" :placeholder="'COM3'" style="flex:1">
                  <t-option v-for="p in st.serialPorts" :key="p" :value="p" :label="p" />
                </t-select>
                <t-button @click="refreshPorts">{{ t('cfg.tcode.refreshPorts') }}</t-button>
              </div>
            </label>
            <div class="inline-grid inline-grid--2">
              <label :title="t('tip.tcode.ups')"><span>{{ t('cfg.tcode.ups') }}</span><t-input-number v-model="st.config.tCode.updatesPerSecond" :step="1" /></label>
              <label :title="t('tip.tcode.speedMode')"><t-checkbox v-model="st.config.tCode.preferSpeedMode">{{ t('cfg.tcode.speedMode') }}</t-checkbox></label>
            </div>
            <t-checkbox v-model="st.config.tCode.enabled" :title="t('tip.tcode.enabled')">{{ t('cfg.tcode.enabled') }}</t-checkbox>
          </div>
          <div class="actions-grid">
            <t-button @click="postAction('/api/control/tcode/connect')">{{ t('btn.connectTCode') }}</t-button>
            <t-button @click="postAction('/api/control/tcode/disconnect')">{{ t('btn.disconnectTCode') }}</t-button>
          </div>
        </section>

        <!-- Service Config -->
        <section class="card">
          <div class="section-title-row">
            <div><h2>{{ t('config.service.title') }}</h2><p class="muted">{{ t('config.service.desc') }}</p></div>
          </div>
          <div class="form-stack compact-form">
            <label :title="t('tip.webui.host')??''"><span>{{ t('cfg.webui.host') }}</span><t-input v-model="st.config.webUi.host" /></label>
            <label :title="t('tip.webui.port')??''"><span>{{ t('cfg.webui.port') }}</span><t-input-number v-model="st.config.webUi.port" :step="1" /></label>
            <label :title="t('tip.osc.port')??''"><span>{{ t('cfg.osc.port') }}</span><t-input-number v-model="st.config.osc.receiverPort" :step="1" /></label>
          </div>
        </section>

        <!-- Safety Config -->
        <section class="card">
          <div class="section-title-row">
            <div><h2>{{ t('config.safety.title') }}</h2><p class="muted">{{ t('config.safety.desc') }}</p></div>
          </div>
          <div class="form-stack compact-form">
            <label><span>{{ t('cfg.safety.cap') }}</span><t-input-number v-model="st.config.safety.globalIntensityCap" :step="0.01" :min="0" :max="1" /></label>
            <label><span>{{ t('cfg.safety.idle') }}</span>
              <t-select v-model="st.config.safety.idle">
                <t-option v-for="opt in st.idleBehaviors" :key="opt" :value="opt" :label="opt" />
              </t-select>
            </label>
            <label><span>{{ t('cfg.safety.estop') }}</span><t-input v-model="st.config.safety.emergencyStopKey" /></label>
          </div>
        </section>

        <!-- Signal Matrix -->
        <section class="card span-2">
          <div class="section-title-row">
            <div><h2>{{ t('signals.title') }}</h2><p class="muted">{{ t('signals.desc') }}</p></div>
            <div class="button-row">
              <t-input v-model="st.filters.signals" :placeholder="t('signals.filter')" clearable style="width:200px" />
              <t-button @click="addSignal">{{ t('btn.addSignal') }}</t-button>
            </div>
          </div>
          <div class="table-wrap">
            <table>
              <thead><tr>
                <th>{{ t('sig.oscPath') }}</th><th>{{ t('sig.role') }}</th><th>{{ t('sig.curve') }}</th>
                <th>{{ t('sig.min') }}</th><th>{{ t('sig.max') }}</th><th>{{ t('sig.alpha') }}</th>
                <th>{{ t('sig.dz') }}</th><th>{{ t('sig.inv') }}</th><th>{{ t('sig.latest') }}</th><th></th>
              </tr></thead>
              <tbody>
                <tr v-for="(sig,idx) in filtSigs" :key="idx">
                  <td><t-input v-model="sig.oscPath" size="small" /></td>
                  <td><t-select v-model="sig.role" size="small" style="min-width:90px"><t-option v-for="r in st.roles" :key="r" :value="r" :label="r" /></t-select></td>
                  <td><t-select v-model="sig.curve" size="small" style="min-width:90px"><t-option v-for="c in st.curves" :key="c" :value="c" :label="c" /></t-select></td>
                  <td><t-input-number v-model="sig.vrchatMin" :step="0.01" size="small" style="width:80px" /></td>
                  <td><t-input-number v-model="sig.vrchatMax" :step="0.01" size="small" style="width:80px" /></td>
                  <td><t-input-number v-model="sig.smoothingAlpha" :step="0.01" :min="0.01" :max="1" size="small" style="width:80px" /></td>
                  <td><t-input-number v-model="sig.deadZone" :step="0.01" :min="0" :max="1" size="small" style="width:80px" /></td>
                  <td><t-checkbox v-model="sig.invertDirection" /></td>
                  <td>{{ signalLatestMap.has(sig.oscPath) ? Number(signalLatestMap.get(sig.oscPath)).toFixed(4) : '-' }}</td>
                  <td><t-button variant="text" theme="danger" size="small" @click="removeSignal(st.config.signals.indexOf(sig))">{{ t('btn.delete') }}</t-button></td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="surface-actions">
            <t-button theme="primary" @click="saveConfig">{{ t('btn.apply') }}</t-button>
            <t-button @click="refreshAll(true)">{{ t('btn.reloadConfig') }}</t-button>
          </div>
        </section>

      </div>
      <div v-else class="empty-state"><strong>加载中…</strong></div>
    </section>

    <!-- ═══ DEVICES ═══ -->
    <section v-show="st.activeTab==='devices'" class="tab-panel">
      <div class="panel-grid panel-grid--devices">

        <section class="card span-3">
          <div class="section-title-row">
            <div><h2>{{ t('devices.title') }}</h2><p class="muted">{{ t('devices.desc') }}</p></div>
          </div>

          <div v-if="!devices.length" class="empty-state">
            <strong>{{ t('devices.empty.title') }}</strong>
            <div>{{ t('devices.empty.body') }}</div>
          </div>

          <div v-else class="device-deck">
            <article v-for="dev in devices" :key="dev.id" :class="['device-card','device-card--tcode',dev.source==='mock'?'device-card--mock':'','positioned']">
              <div class="device-card__meta">
                <div>
                  <span class="proto-badge tcode">{{ dev.connectionLabel }}</span>
                  <h3>{{ dev.name }}</h3>
                  <p class="muted">{{ dev.summary }}</p>
                </div>
                <t-tag :theme="dev.source==='mock'?'default':'success'" variant="light">{{ dev.source==='mock'?t('label.mock'):t('label.real') }}</t-tag>
              </div>
              <div class="device-card__facts">
                <div v-for="(v,k) in dev.facts" :key="k" class="fact-pill"><strong>{{ k }}</strong><span>{{ v }}</span></div>
              </div>

              <!-- Output Range dual slider -->
              <div v-if="st.config" class="device-card__stack">
                <div class="section-subtitle">{{ t('devices.range.title') }}</div>
                <p class="muted small">{{ t('devices.range.desc') }}</p>
                <DualRange v-model="deviceRange" :min="0" :max="999" :label="'Output Range'" />
              </div>

              <!-- Device parameters -->
              <div v-if="st.config" class="device-card__stack">
                <div class="section-subtitle">{{ t('devices.params.title') }}</div>
                <div class="inline-grid inline-grid--2">
                  <label><span>{{ t('devices.params.maxVel') }}</span><t-input-number v-model="st.config.tCode.maxVelocity" :step="1" /></label>
                  <label><span>{{ t('devices.params.ups') }}</span><t-input-number v-model="st.config.tCode.updatesPerSecond" :step="1" /></label>
                  <label class="inline-grid--full"><span>{{ t('devices.params.ramp') }}</span><t-input-number v-model="st.config.safety.rampUpMs" :step="1" /></label>
                </div>
              </div>

              <!-- Quick actions -->
              <div class="device-card__stack">
                <div class="button-row">
                  <t-button @click="postAction('/api/control/tcode/park')">{{ t('btn.park') }}</t-button>
                  <t-button @click="saveConfig();saveDevConfig(dev)">{{ t('btn.saveDeviceCfg') }}</t-button>
                  <t-button variant="text" @click="loadDevConfig(dev)">{{ t('btn.loadDeviceCfg') }}</t-button>
                </div>
              </div>

              <!-- Device memory -->
              <div class="device-card__stack" v-if="dev.source!=='mock'">
                <div class="device-config-label">
                  <strong>{{ t('devices.memory.title') }}</strong>
                  <span class="muted">{{ getDeviceMem(dev) ? t('devices.memory.saved',{time:new Date(getDeviceMem(dev).savedAt).toLocaleString()}) : t('devices.memory.none') }}</span>
                </div>
                <div class="inline-grid inline-grid--2">
                  <label><span>{{ t('devices.alias') }}</span><t-input :value="getDeviceMem(dev)?.alias||''" @change="v=>saveDevMemory(dev,v,getDeviceMem(dev)?.note||'')" /></label>
                  <label><span>{{ t('devices.note') }}</span><t-input :value="getDeviceMem(dev)?.note||''" @change="v=>saveDevMemory(dev,getDeviceMem(dev)?.alias||'',v)" /></label>
                </div>
              </div>

            </article>
          </div>
        </section>

      </div>
    </section>

    <!-- ═══ CONTROL ═══ -->
    <section v-show="st.activeTab==='control'" class="tab-panel">
      <div class="panel-grid panel-grid--control">

        <!-- Axis control card -->
        <section class="card span-2">
          <div class="section-title-row">
            <div><h2>{{ t('control.axes.title') }}</h2></div>
            <t-tag :theme="loopRun?'warning':'default'" variant="light">{{ loopRun?t('status.running'):t('status.stopped') }}</t-tag>
          </div>
          <div :class="['callout',loopRun?'warn':'info']">
            {{ loopRun ? t('control.axes.running') : t('control.axes.stopped') }}
          </div>
          <div class="axis-grid axis-grid--control">
            <AxisSlider v-for="ax in AXES" :key="ax" :axis="ax"
              :modelValue="loopRun ? (cmd[AXIS_KEY[ax]]??AXIS_DEFS[ax]) : st.manual[ax]"
              @update:modelValue="v=>{ if(!loopRun) st.manual[ax]=v; }"
              :readonly="loopRun" />
          </div>
          <div class="actions-grid" style="margin-top:12px" v-if="!loopRun">
            <t-checkbox v-model="st.manualEnabled">{{ t('cb.manualEnabled') }}</t-checkbox>
            <t-checkbox v-model="st.manualGateOpen">{{ t('cb.gateOpen') }}</t-checkbox>
            <t-button @click="applyManual">{{ t('btn.applyManual') }}</t-button>
            <t-button @click="clearManual">{{ t('btn.clearManual') }}</t-button>
            <t-button variant="text" @click="centerAxes">{{ t('btn.centerAxes') }}</t-button>
          </div>
        </section>

        <!-- L0 Invert toggle -->
        <section v-if="st.config" class="card">
          <div class="section-title-row">
            <div><h2>{{ t('control.invert.title') }}</h2><p class="muted">{{ t('control.invert.desc') }}</p></div>
          </div>
          <div class="toggle-group">
            <t-checkbox v-model="st.config.tCode.l0Invert">L0 Invert</t-checkbox>
          </div>
          <div class="actions-grid" style="margin-top:12px">
            <t-button @click="saveConfig">{{ t('btn.save') }}</t-button>
          </div>
        </section>

        <!-- BPM card -->
        <section class="card">
          <div class="section-title-row">
            <div><h2>{{ t('control.bpm.title') }}</h2><p class="muted">{{ t('control.bpm.desc') }}</p></div>
            <t-tag variant="light">{{ overviewBpm }} BPM</t-tag>
          </div>
          <div v-if="st.config" class="form-stack compact-form">
            <t-checkbox v-model="st.config.rhythm.enabled">{{ t('cfg.rhythm.enabled') }}</t-checkbox>
            <div class="inline-grid inline-grid--3">
              <label><span>{{ t('cfg.rhythm.window') }}</span><t-input-number v-model="st.config.rhythm.windowMs" :step="1" /></label>
              <label><span>{{ t('cfg.rhythm.minBpm') }}</span><t-input-number v-model="st.config.rhythm.minBpm" :step="0.1" /></label>
              <label><span>{{ t('cfg.rhythm.maxBpm') }}</span><t-input-number v-model="st.config.rhythm.maxBpm" :step="0.1" /></label>
            </div>
            <div class="actions-grid">
              <t-button @click="saveConfig">{{ t('btn.save') }}</t-button>
            </div>
          </div>
        </section>

        <!-- Park -->
        <section class="card">
          <h2>{{ t('btn.parkTCode') }}</h2>
          <p class="muted">将所有轴回到安全中点位置。</p>
          <t-button @click="postAction('/api/control/tcode/park')" style="margin-top:8px">{{ t('btn.park') }}</t-button>
        </section>

      </div>
    </section>

    <!-- ═══ SCRIPTS ═══ -->
    <section v-show="st.activeTab==='scripts'" class="tab-panel">
      <div class="panel-grid panel-grid--scripts">

        <section class="card span-3 script-hero-card">
          <div class="section-title-row">
            <div><h2>{{ t('scripts.title') }}</h2><p class="muted">{{ t('scripts.recording.hint') }}</p></div>
            <t-tag variant="light">{{ t('scripts.badge') }}</t-tag>
          </div>
          <div class="stat-row" style="display:flex;gap:8px;flex-wrap:wrap">
            <div v-for="([lb,vl],i) in scriptSummary.slice(0,4)" :key="i" class="stat">
              <div class="stat-label">{{ lb }}</div>
              <div class="stat-value">{{ vl }}</div>
            </div>
          </div>
        </section>

        <section class="card span-2">
          <div class="section-title-row">
            <div><h2>{{ t('scripts.recording.title') }}</h2><p class="muted">{{ t('scripts.recording.desc') }}</p></div>
            <t-tag :theme="st.overview?.recording?.isActive?'success':'default'" variant="light">{{ st.overview?.recording?.isActive ? t('recording.active') : t('recording.inactive') }}</t-tag>
          </div>
          <div class="actions-grid actions-grid--wide">
            <t-button @click="postAction('/api/control/recording/start')">{{ t('btn.startRecording') }}</t-button>
            <t-button @click="postAction('/api/control/recording/stop')">{{ t('btn.stopRecording') }}</t-button>
            <t-button @click="exportRecording">{{ t('btn.exportFunscript') }}</t-button>
          </div>
          <p class="muted" style="margin-top:8px">{{ t('recording.summary',{state:st.overview?.recording?.isActive?t('recording.active'):t('recording.inactive'),count:String(st.overview?.recording?.frameCount??0)}) }}</p>
          <div class="callout info">{{ t('scripts.recording.hint') }}</div>
        </section>

        <section class="card">
          <div class="section-title-row">
            <div><h2>{{ t('scripts.import.title') }}</h2><p class="muted">{{ t('scripts.import.desc') }}</p></div>
          </div>
          <div class="form-stack compact-form">
            <label>
              <span>{{ t('scripts.import.file') }}</span>
              <input type="file" accept=".funscript,.json,application/json" @change="e=>e.target.files?.[0]&&loadScriptFile(e.target.files[0])" />
            </label>
            <div class="callout info">{{ scriptMeta }}</div>
            <div class="button-row">
              <t-button variant="text" @click="useRecordingDS">{{ t('scripts.import.useRecording') }}</t-button>
              <t-button variant="text" @click="()=>setScriptDataset({source:'empty',name:'',points:[],durationMs:0})">{{ t('scripts.import.clear') }}</t-button>
            </div>
          </div>
        </section>

        <section class="card span-2">
          <div class="section-title-row">
            <div><h2>{{ t('scripts.player.title') }}</h2><p class="muted">{{ t('scripts.player.desc') }}</p></div>
            <t-tag variant="light">{{ t(scriptStatusKey) }}</t-tag>
          </div>
          <ScriptCanvas :player="st.scriptPlayer" />
          <div class="script-player-controls">
            <input type="range" min="0" max="1000" step="1"
              :value="Math.round(st.scriptPlayer.durationMs>0?(st.scriptPlayer.currentMs/st.scriptPlayer.durationMs)*1000:0)"
              @input="e=>scriptSeek(Number(e.target.value)/1000)" />
            <div class="script-player-toolbar">
              <t-button theme="primary" @click="scriptPlay">{{ t('scripts.player.play') }}</t-button>
              <t-button variant="text" @click="scriptPause">{{ t('scripts.player.pause') }}</t-button>
              <t-button variant="text" @click="scriptStop">{{ t('scripts.player.stop') }}</t-button>
              <span class="script-time-label">{{ fmtDur(st.scriptPlayer.currentMs) }} / {{ fmtDur(st.scriptPlayer.durationMs) }}</span>
            </div>
          </div>
        </section>

        <section class="card">
          <div class="section-title-row">
            <div><h2>{{ t('scripts.timeline.title') }}</h2></div>
          </div>
          <div class="diagnostic-list">
            <t-alert v-if="!st.scriptPlayer.points.length" theme="info" :title="t('scripts.timeline.title')" :message="t('scripts.timeline.empty')" />
            <article v-else v-for="([lb,vl],i) in scriptSummary" :key="i" class="diagnostic-item ok">
              <strong>{{ lb }}</strong><div>{{ vl }}</div>
            </article>
          </div>
        </section>

      </div>
    </section>

    <!-- ═══ MONITORING ═══ -->
    <section v-show="st.activeTab==='monitoring'" class="tab-panel">
      <div class="panel-grid panel-grid--monitoring">

        <!-- ECharts axis history chart -->
        <section class="card span-3">
          <div class="section-title-row">
            <div><h2>{{ t('monitor.chart.title') }}</h2><p class="muted">最近 {{ st.axisHistory.length }} 个数据点 ({{ t('monitor.chart.desc') }})</p></div>
          </div>
          <EChartPanel :history="st.axisHistory" :lang="st.language" />
        </section>

        <section class="card span-3">
          <div class="section-title-row">
            <div><h2>{{ t('monitor.params.title') }}</h2><p class="muted">{{ t('monitor.params.desc') }}</p></div>
            <t-input v-model="st.filters.parameters" :placeholder="t('monitor.params.filter')" clearable style="width:220px" />
          </div>
          <div class="table-wrap compact-table table-wrap--wide">
            <table>
              <thead><tr>
                <th>Path</th><th>Value</th><th>Type</th><th>Timestamp</th>
              </tr></thead>
              <tbody>
                <tr v-for="(p,i) in filtParams" :key="i">
                  <td>{{ p.path }}</td>
                  <td>{{ Number(p.value).toFixed(4) }}</td>
                  <td>{{ p.type }}</td>
                  <td>{{ new Date(p.timestampMs).toLocaleTimeString() }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section class="card span-3">
          <div class="section-title-row">
            <div><h2>{{ t('monitor.logs.title') }}</h2><p class="muted">{{ t('monitor.logs.desc') }}</p></div>
            <t-input v-model="st.filters.logs" :placeholder="t('monitor.logs.filter')" clearable style="width:220px" />
          </div>
          <pre class="log-panel log-panel--wide">{{ filtLogs.map(l=>'['+new Date(l.timestamp).toLocaleTimeString()+'] '+l.message).join('\\n') }}</pre>
        </section>

      </div>
    </section>

    <!-- ═══ HELP ═══ -->
    <section v-show="st.activeTab==='help'" class="tab-panel">
      <div class="panel-grid panel-grid--help">

        <section class="card span-3">
          <div class="section-title-row"><div><h2>{{ t('help.title') }}</h2></div></div>
          <div class="doc-cards doc-cards--help">
            <article class="doc-card">
              <h3>&#128640; 快速入门</h3>
              <p>&#9312; 到「配置」页，找到「TCode 串口连接」，选择 COM 口后点击连接。</p>
              <p>&#9313; 到「设备」页确认设备已出现，用手动测试滑块验证轴向响应。</p>
              <p>&#9314; 在「配置」页检查 OSC 接收端口（默认 9001），在 VRChat 中启用 OSC。</p>
              <p>&#9315; 回到「总览」，点击「启动 Loop」，设备即开始实时输出。</p>
            </article>
            <article class="doc-card">
              <h3>&#128203; 页面功能速查</h3>
              <p><strong>总览</strong> — 整体运行状态、服务健康检查。</p>
              <p><strong>配置</strong> — TCode 串口连接、服务地址、安全限制和信号矩阵。</p>
              <p><strong>设备</strong> — 已连接设备的行程范围、速度限制和手动测试。</p>
              <p><strong>控制</strong> — 实时轴位控制、L0 反转、BPM 节奏检测设置。</p>
              <p><strong>脚本</strong> — 录制、导出和预览 .funscript 文件。</p>
              <p><strong>监控</strong> — 实时轴位输出图表、OSC 参数流和运行日志。</p>
            </article>
          </div>
        </section>

        <section class="card span-2">
          <h2>&#128299; TCode 串口连接说明</h2>
          <div class="doc-cards" style="grid-template-columns:1fr">
            <article class="doc-card"><h3>串口号 (COM Port)</h3><p>在 Windows 设备管理器 → 端口里找到对应的 COMX 号。如果列表中没有出现，检查 USB 驱动（CH340 / CP2102 等）是否已安装。</p></article>
            <article class="doc-card"><h3>MinPos / MaxPos（输出范围）</h3><p>TCode 轴位范围 0–999。在「设备」页可用双端滑条直观设置。默认 100–900 即可覆盖正常行程范围。</p></article>
            <article class="doc-card"><h3>MaxVelocity</h3><p>每帧最大移动量。数值越大动作越快，但超过设备物理限制会导致失步。建议先从保守值（如 1000）开始测试。</p></article>
            <article class="doc-card"><h3>UpdatesPerSecond</h3><p>每秒向设备发送命令的频率。建议 50–100。过高可能导致串口缓冲区溢出；过低会使运动出现分段感。</p></article>
            <article class="doc-card"><h3>RampUpMs</h3><p>Loop 启动后输出从 0 渐增到目标值所需的毫秒数。防止骤然全速启动。建议 500–2000。</p></article>
          </div>
        </section>

        <section class="card">
          <h2>&#127918; 控制页说明</h2>
          <div class="doc-cards" style="grid-template-columns:1fr">
            <article class="doc-card"><h3>轴位控制</h3><p>Loop 停止时，可手动拖动滑条设置每个轴的位置，点「应用手动测试」后命令发送至设备。Loop 运行时仅显示当前实时输出，不可手动操作。</p></article>
            <article class="doc-card"><h3>L0 反转</h3><p>勾选后 L0 轴输出取反（0 变为最大，1 变为最小）。设备倒置安装时使用。</p></article>
            <article class="doc-card"><h3>BPM 节奏检测</h3><p>开启后系统会分析 OSC 参数的变化频率，自动估算节拍 BPM。可在「控制」页直接调整检测参数。</p></article>
          </div>
        </section>

        <section class="card">
          <h2>&#128225; 信号矩阵说明</h2>
          <div class="doc-cards" style="grid-template-columns:1fr">
            <article class="doc-card"><h3>OSC Path</h3><p>VRChat 发出的 OSC 参数路径，如 <code>/avatar/parameters/Sensa_L0</code>。需与头像参数名完全一致。</p></article>
            <article class="doc-card"><h3>Role（角色）</h3><p>该信号控制设备的哪个维度：Depth（主冲程）、Vibrate（振动）、Roll/Pitch/Twist（姿态轴）等。</p></article>
            <article class="doc-card"><h3>&#945;（EMA 平滑系数）</h3><p>越接近 0 越平滑（延迟越高）；越接近 1 越贴近原始值（响应越快）。推荐 0.5–0.8。</p></article>
            <article class="doc-card"><h3>Dead Zone</h3><p>信号变化幅度小于此值时不触发更新，避免微小抖动引起不必要的运动。</p></article>
          </div>
        </section>

        <section class="card">
          <h2>&#10067; 常见问题排查</h2>
          <div class="doc-cards" style="grid-template-columns:1fr">
            <article class="doc-card"><h3>设备没有反应</h3><p>&#9312; Loop 是否已启动。&#9313; GlobalIntensityCap 是否为 0。&#9314; 信号矩阵是否有路径匹配。</p></article>
            <article class="doc-card"><h3>TCode 连接失败</h3><p>&#9312; 确认 COM 口号正确。&#9313; 没有其他程序占用。&#9314; USB-串口驱动已安装（CH340/CP2102）。&#9315; 断开重连或重启设备。</p></article>
            <article class="doc-card"><h3>OSC 参数不来</h3><p>&#9312; VRChat 设置中 OSC 已启用。&#9313; 默认输出端口 9001 与 Sensa 接收端口一致。&#9314; 防火墙未拦截 UDP 9001。</p></article>
          </div>
        </section>

        <section class="card">
          <h2>{{ t('help.endpoints.title') }}</h2>
          <p class="muted">可通过以下端点直接调用 API，适合调试或外部集成。</p>
          <ul class="endpoint-list">
            <li v-for="ep in (st.meta?.endpoints||[])" :key="ep"><code>{{ ep }}</code></li>
          </ul>
        </section>

        <section class="card span-2">
          <div class="section-title-row">
            <div><h2>{{ t('help.links.title') }}</h2><p class="muted">{{ t('help.links.desc') }}</p></div>
          </div>
          <div class="link-grid">
            <a class="link-card" href="https://github.com/multiaxis/TCode-Specification" target="_blank" rel="noreferrer"><strong>TCode Specification</strong><span>{{ t('help.links.tcodeSpec') }}</span></a>
            <a class="link-card" href="https://github.com/multiaxis/OSR2-Arduino" target="_blank" rel="noreferrer"><strong>OSR2 / SR6 Firmware</strong><span>{{ t('help.links.osr') }}</span></a>
            <a class="link-card" href="https://github.com/ayvasoftware/osr-emu" target="_blank" rel="noreferrer"><strong>OSR Emulator</strong><span>{{ t('help.links.emu') }}</span></a>
            <a class="link-card" href="https://voicescriptplayer.github.io/vspdocs/zh/device/tcode/" target="_blank" rel="noreferrer"><strong>VoiceScriptPlayer TCode Docs</strong><span>{{ t('help.links.vsp') }}</span></a>
          </div>
        </section>

      </div>
    </section>

  </main>

  <!-- Mobile bottom nav -->
  <nav class="mobile-tabbar" aria-label="移动端导航">
    <button v-for="tab in TABS" :key="tab.id" type="button"
      :class="['tab-button',{'is-active':st.activeTab===tab.id}]"
      @click="setActiveTab(tab.id)">{{ t(tab.label) }}</button>
  </nav>

</div>`,
};

// ─────────────────────────────────────────────────────────────
// MOUNT
// ─────────────────────────────────────────────────────────────
createApp(App).use(TDesign).mount('#app');
