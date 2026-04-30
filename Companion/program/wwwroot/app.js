const THEMES = ['light'];
const LANGUAGES = ['zh-CN', 'en'];
const DEFAULT_TITLE = 'Sensa WebUI';
const DEVICE_MEMORY_KEY = 'sensa.deviceMemory';
const MOCK_TOGGLE_KEY = 'sensa.showMockDevices';

const sliderAxes = ['L0', 'R0', 'R1', 'R2', 'L1', 'L2', 'Vibrate'];
const sliderDefaults = { L0: 0, R0: 0.5, R1: 0.5, R2: 0.5, L1: 0.5, L2: 0.5, Vibrate: 0 };

const MOCK_DEVICE_LIBRARY = [
  {
    id: 'mock:sr6-rig',
    kind: 'tcode',
    model: 'SR6',
    name: 'SR6 Mock Rig',
    connectionLabel: 'TCode',
    summary: '6 轴串口设备布局预览，用于检查 SR6 轴向、回中和速度模式卡片样式。',
    badges: ['Mock', 'SR6'],
    facts: {
      port: 'COM-MOCK',
      mode: 'Speed',
      axes: 'L0/R0/R1/R2/L1/L2',
      state: 'Preview',
    },
    quickActions: ['park'],
  },
  {
    id: 'mock:buttplug-linear',
    kind: 'intiface',
    model: 'Buttplug Linear',
    name: 'Mock Linear Device',
    connectionLabel: 'Intiface',
    summary: '模拟线性 + 振动设备，用来检查没有实机时的设备卡片和能力摘要布局。',
    badges: ['Mock', 'Buttplug'],
    facts: {
      position: '1 feature',
      vibrate: '2 features',
      connection: 'Bridge Ready',
      state: 'Preview',
    },
    quickActions: ['scan'],
  },
];

const I18N = {
  'zh-CN': {
    'hero.desc': '本地控制台，用于连接、配置、设备控制、脚本和运行监控。',
    'btn.refresh': '刷新状态',
    'btn.save': '保存配置',
    'btn.startLoop': '启动 Loop',
    'btn.stopLoop': '停止 Loop',
    'btn.emergencyStop': '紧急停止',
    'btn.clearEmergency': '清除紧急停止',
    'btn.copyDiag': '复制诊断摘要',
    'btn.apply': '应用并保存',
    'btn.reloadConfig': '重新读取',
    'btn.addSignal': '新增信号',
    'btn.delete': '删除',
    'btn.connectTCode': '连接 TCode',
    'btn.disconnectTCode': '断开 TCode',
    'btn.parkTCode': 'TCode 回中',
    'btn.connectIntiface': '连接 Intiface',
    'btn.disconnectIntiface': '断开 Intiface',
    'btn.scanStart': '开始扫描',
    'btn.scanStop': '停止扫描',
    'btn.startRecording': '开始录制',
    'btn.stopRecording': '停止录制',
    'btn.exportFunscript': '导出 .funscript',
    'btn.toggleMock': '切换 Mock 设备预览',
    'btn.saveDeviceConfig': '保存配置',
    'btn.resetDeviceConfig': '重置配置',
    'btn.applyManual': '应用手动测试',
    'btn.clearManual': '清除手动测试',
    'btn.connect': '连接',
    'btn.disconnect': '断开',
    'btn.park': '回中',
    'btn.scan': '扫描',
    'cb.manualEnabled': '启用手动覆盖',
    'cb.gateOpen': 'GateOpen',
    'nav.overview': '总览',
    'nav.connections': '连接',
    'nav.config': '配置',
    'nav.devices': '设备',
    'nav.scripts': '脚本',
    'nav.monitoring': '监控',
    'nav.help': '帮助',
    'overview.title': '总览',
    'overview.desc': '查看当前运行状态、连接情况和主要输出。',
    'overview.badge': '当前状态',
    'overview.status': '服务状态',
    'overview.diag': '实时诊断',
    'overview.diagDesc': '显示当前运行状态和异常提示。',
    'overview.preview': '姿态预览',
    'overview.previewDesc': '显示当前输出姿态和主要轴向状态。',
    'overview.devices.title': '已连接设备总览',
    'overview.devices.desc': '优先显示当前已连接的真实设备。',
    'overview.guide.none.title': '暂无已连接设备',
    'overview.guide.none.body': '请先在“连接”页建立链路，再到“设备”页进行测试。',
    'overview.guide.connected.title': '设备链路已建立',
    'overview.guide.connected.body': '可前往“设备”页进行单设备测试，或在“监控”页查看参数和日志。',
    'overview.guide.osc.title': 'OSC 还没进来',
    'overview.guide.osc.body': '当前尚未收到 OSC 参数，可先完成连接和设备测试。',
    'connections.title': '连接中心',
    'connections.desc': '在这里管理 TCode 和 Intiface 的连接参数与连接状态。',
    'connections.filter.all': '全部',
    'connections.tcode.title': '串口连接',
    'connections.tcode.desc': '适用于 OSR2 / SR6 / OSR6 这类串口设备。连接参数和设备相关配置集中放在同一张卡片中。',
    'connections.intiface.title': 'Buttplug 连接',
    'connections.intiface.desc': '适用于 Intiface Central / 内嵌引擎驱动的 Buttplug 设备。扫描、连接与地址配置集中管理。',
    'connections.intiface.note': '如果当前机器没有 Intiface 环境，也应能明确失败而不是误报成功。',
    'config.service.title': '服务配置',
    'config.service.desc': '管理服务地址、端口和接收端口等基础参数。',
    'config.processing.title': '处理链配置',
    'config.processing.desc': '管理安全限制、空闲行为和节奏检测等处理参数。',
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
    'cfg.tcode.l0inv': 'L0 反向',
    'cfg.tcode.refreshPorts': '刷新',
    'cfg.intiface.wsAddr': 'WebSocket 地址',
    'cfg.intiface.port': 'Port',
    'cfg.intiface.enabled': '启用 Intiface 自动连接',
    'cfg.intiface.manage': '托管 intiface-engine',
    'cfg.safety.cap': 'GlobalIntensityCap',
    'cfg.safety.ramp': 'RampUpMs',
    'cfg.safety.idle': 'Idle',
    'cfg.safety.estop': 'EmergencyStopKey',
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
    'devices.title': '设备',
    'devices.desc': '查看已连接设备，并执行设备相关操作与测试。',
    'devices.test.title': '设备测试台',
    'devices.test.desc': '在这里进行手动测试，并查看当前设备能力。',
    'devices.test.badge': '支持 mock 检查布局',
    'devices.ops.title': '设备操作中心',
    'devices.ops.desc': '这里集中放置回中、Loop 控制、紧急停止和手动测试。',
    'devices.ops.badge': '快捷操作',
    'devices.recording.title': '录制与导出',
    'devices.recording.desc': '录制结果可在脚本页中查看和导出。',
    'devices.recording.hint': '导出前会自动进行轨迹简化。',
    'devices.empty.title': '当前没有真实连接设备',
    'devices.empty.body': '你可以打开 Mock 设备预览检查卡片样式，也可以先去“连接”页建立真实链路。',
    'devices.memory.title': '设备配置',
    'devices.memory.none': '这台设备还没有保存的本地备注。',
    'devices.memory.saved': '已保存 {time}',
    'devices.alias': '设备别名',
    'devices.note': '设备备注',
    'devices.profile': '连接摘要',
    'devices.quickActions': '快捷操作',
    'devices.capabilities': '能力摘要',
    'devices.mock.enabled': 'Mock 设备预览已开启。当前会额外显示两张模拟设备卡片。',
    'devices.mock.disabled': '当前仅显示真实连接设备。',
    'devices.manual.title': '手动功能测试',
    'devices.manual.desc': '这里保留统一的手动覆盖测试；不同设备的专用卡片则只展示该设备真正能理解的操作。',
    'scripts.title': '脚本',
    'scripts.desc': '录制、导出、导入和预览播放统一放在这里。',
    'scripts.badge': 'Script Studio',
    'scripts.recording.title': '录制与导出',
    'scripts.recording.desc': '用当前实时输出录制 L0 轨迹，并在录制完成后导出 `.funscript` 文件。',
    'scripts.recording.hint': '导出前会自动进行轨迹简化，预览播放不会直接控制设备。',
    'scripts.import.title': '导入与来源',
    'scripts.import.desc': '可直接使用录制缓存，或导入本地 `.funscript` 文件。',
    'scripts.import.file': '选择 `.funscript` 文件',
    'scripts.import.useRecording': '使用当前录制缓存',
    'scripts.import.clear': '清空脚本预览',
    'scripts.player.title': '脚本预览播放',
    'scripts.player.desc': '用于检查节奏、密度和时间轴。',
    'scripts.player.play': '播放',
    'scripts.player.pause': '暂停',
    'scripts.player.stop': '停止',
    'scripts.player.empty': '未加载',
    'scripts.player.playing': '播放中',
    'scripts.player.paused': '已暂停',
    'scripts.timeline.title': '时间轴摘要',
    'scripts.timeline.desc': '显示脚本来源、数量和时长等摘要信息。',
    'scripts.timeline.empty': '当前没有可预览的脚本数据。',
    'scripts.meta.empty': '当前未加载脚本数据。',
    'scripts.meta.recording': '当前录制缓存：{count} 个采样点，约 {duration}。',
    'scripts.meta.imported': '已导入 `{name}`：{count} 个动作点，时长约 {duration}。',
    'scripts.summary.source': '当前来源',
    'scripts.summary.points': '动作 / 采样点',
    'scripts.summary.duration': '时长',
    'scripts.summary.position': '当前位置',
    'scripts.source.empty': '未加载',
    'scripts.source.recording': '当前录制缓存',
    'scripts.source.imported': '导入脚本',
    'scripts.timeline.source': '来源',
    'scripts.timeline.frames': '关键点数量',
    'scripts.timeline.density': '关键点密度',
    'scripts.timeline.range': '时长范围',
    'scripts.timeline.preview': '当前位置',
    'monitor.params.title': '参数流',
    'monitor.params.desc': '查看当前参数流和最近更新时间。',
    'monitor.params.filter': '搜索参数路径 / 类型',
    'monitor.logs.title': '日志',
    'monitor.logs.desc': '查看运行日志、连接日志和配置变更记录。',
    'monitor.logs.filter': '搜索日志关键字',
    'help.title': '帮助与文档',
    'help.card.workflow.title': '使用顺序',
    'help.card.workflow.body': '建议先建立连接，再进行设备测试，最后接入 VRChat 信号。',
    'help.card.layout.title': '页面分区',
    'help.card.layout.body': '连接、配置、设备、脚本、监控和帮助分区显示，便于快速定位功能。',
    'help.card.mobile.title': '移动端说明',
    'help.card.mobile.body': '在较小屏幕上会自动调整布局与导航方式。',
    'help.endpoints.title': 'HTTP / WS 端点',
    'help.links.title': '参考链接',
    'help.links.desc': '查看说明文档和相关外部资料。',
    'help.links.tcodeSpec': 'TCode 轴、命令和扩展项的公开规范。',
    'help.links.osr': '固件参考实现，适合对照轴向与实时控制语义。',
    'help.links.emu': '适合对照 TCode 的 `Ixxxx` / `Sxxxx` 行为与姿态模型。',
    'help.links.vsp': '补充说明串口连接、设备准备与测试流程。',
    'legend.l0': 'L0：主冲程',
    'legend.r': 'R0 / R1 / R2：姿态与扭转',
    'legend.lateral': 'L1 / L2：横移与偏摆',
    'label.loop': 'Loop',
    'label.emergency': 'Emergency',
    'label.params': '参数数量',
    'label.recording': '录制',
    'label.manual': '手动测试',
    'label.output': '输出',
    'label.devices': '设备',
    'label.port': '端口',
    'label.mode': '模式',
    'label.engine': '引擎',
    'label.address': '地址',
    'label.connectedCount': '已连接 {count} 台',
    'label.none': '无',
    'label.noDevices': '暂无设备',
    'label.auto': '自动连接',
    'label.on': '开',
    'label.off': '关',
    'label.speed': '速度模式',
    'label.interval': '时间模式',
    'label.managed': '托管',
    'label.external': '外部',
    'label.frames': '帧数',
    'label.mock': 'Mock 预览',
    'label.real': '真实设备',
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
    'status.none': '暂无',
    'status.mocking': 'Mock 中',
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
    'toast.copyFailed': '复制失败，请手动复制。',
    'toast.mockChanged': 'Mock 设备显示状态已切换',
    'toast.memorySaved': '设备配置记忆已保存',
    'toast.memoryCleared': '设备配置记忆已重置',
    'toast.scriptLoaded': '脚本已加载',
    'toast.scriptCleared': '脚本预览已清空',
    'toast.scriptFailed': '脚本加载失败',
    'msg.saved': '当前配置已写入本地磁盘。',
    'msg.applied': '配置已应用并写入文件。',
    'msg.signalAdded': '请填写 OSC Path 并选择合适的 Role。',
    'msg.noRecording': '没有可导出的录制数据',
    'msg.diagCopied': '诊断摘要已复制。',
    'msg.themeChanged': '新的配色已经生效。',
    'msg.langChanged': '当前界面文案已按所选语言刷新。',
    'msg.portsRefreshed': '可用 COM 口已重新枚举。',
    'msg.mockChanged': 'Mock 设备显示状态已更新。',
    'msg.memorySaved': '设备备注已保存到本地。',
    'msg.memoryCleared': '设备备注已清除。',
    'msg.scriptLoaded': '脚本已加载，可进行预览。',
    'msg.scriptCleared': '脚本预览已清空。',
    'msg.scriptInvalid': '文件不是有效的 `.funscript` JSON，或缺少 actions 数组。',
    'msg.actionReportedFailure': '服务返回了失败状态，请查看日志或诊断信息。',
    'msg.intifaceConnectFailed': 'Intiface 连接失败，请检查 Intiface Central、WebSocket 地址或 intiface-engine。',
    'msg.tcodeConnectFailed': 'TCode 连接失败，请检查 COM 口、驱动、串口占用和设备供电。',
    'diag.loopStopped.title': 'Loop 当前未运行',
    'diag.loopStopped.body': '不会继续向设备发送融合后的命令。若这是意外情况，请点击“启动 Loop”。',
    'diag.emergency.title': 'Emergency Stop 已触发',
    'diag.emergency.body': '设备输出会被强制压制。确认安全后可清除紧急停止。',
    'diag.engineMissing.title': '未找到内置 Intiface 引擎',
    'diag.engineMissing.body': '如果你依赖 Buttplug 设备，请放置 intiface-engine.exe，或关闭内置托管并手动启动 Intiface Central。',
    'diag.tcodeMissing.title': 'TCode 自动连接已启用但未连接',
    'diag.tcodeMissing.body': '请确认 COM 口正确、串口未被占用，并可用“连接”页按钮手动重连。',
    'diag.oscMissing.title': '尚未收到 OSC 参数',
    'diag.oscMissing.body': '检查 VRChat 是否启用 OSC、端口是否为 9001、以及当前头像是否确实带有 Sensa 组件。',
    'diag.ok.title': '运行状态良好',
    'diag.ok.body': '当前没有发现明显的连接或运行问题。',
    'recording.summary': '当前录制状态：{state}，累计 {count} 帧。',
    'recording.active': '录制中',
    'recording.inactive': '未录制',
    'ws.disconnected': 'WS 未连接',
    'tip.refresh': '立即重新拉取全部状态与配置',
    'tip.lang': '切换中文 / English',
    'tip.theme': '切换主题',
    'tip.tcode.comPort': '填写设备的串口号，如 COM3 或 COM7。可点右侧"刷新"按钮列出可用串口。',
    'tip.tcode.minPos': '轴向最小位置 (0–999)，对应行程下端。默认通常为 100。',
    'tip.tcode.maxPos': '轴向最大位置 (0–999)，对应行程上端。默认通常为 900。',
    'tip.tcode.maxVel': '每帧最大移动量（速度上限），防止机械零件运动过快。数值越小越安全。',
    'tip.tcode.ups': '每秒向设备发送命令的频率。建议 50–100，过高可能导致丢帧或串口拥塞。',
    'tip.tcode.enabled': '勾选后服务启动时自动尝试连接到指定串口，无需手动操作。',
    'tip.tcode.speedMode': '发送速度指令 (Ixxxx) 代替绝对位置指令 (Lxxxx)，适合支持插值平滑的固件。',
    'tip.tcode.l0inv': '将 L0 输出取反（0 ↔ 1），适合设备倒置安装或轴向与预期相反时使用。',
    'tip.intiface.wsAddr': 'Intiface Central 或内置引擎的 WebSocket 地址，默认 ws://localhost:12345。',
    'tip.intiface.port': '内置 intiface-engine 监听的端口，需与 WebSocket 地址中的端口保持一致。',
    'tip.intiface.enabled': '勾选后服务启动时自动连接 Intiface，否则需在连接页手动操作。',
    'tip.intiface.manage': '由 Sensa 启动和管理内置 intiface-engine 进程，否则请手动运行 Intiface Central。',
    'tip.webui.host': '服务绑定的 IP 地址。127.0.0.1 仅本机访问；0.0.0.0 允许局域网设备访问。',
    'tip.webui.port': 'WebUI HTTP 端口。修改后需重启服务，并同步更新浏览器地址栏中的端口号。',
    'tip.osc.port': '接收 VRChat OSC 数据的 UDP 端口。VRChat 默认发送到 9001，需与此处一致。',
    'tip.safety.cap': '全局强度上限 (0.0–1.0)，所有设备的输出都不会超过此值。建议不超过 0.8。',
    'tip.safety.ramp': '启动时输出从零渐增到目标值所需的毫秒数，防止突然全速启动带来机械冲击。',
    'tip.safety.idle': 'Loop 停止或长时间无信号时的设备行为：保持末尾位置，还是自动回中。',
    'tip.safety.estop': '全局紧急停止热键。建议配置一个键盘快捷键，发生意外时迅速停止所有输出。留空则禁用热键功能。',
    'tip.rhythm.enabled': '开启后根据 OSC 信号的变化频率自动估算节拍 BPM，用于节奏同步场景。',
    'tip.rhythm.window': 'BPM 计算的历史时间窗口（毫秒）。越大越稳定，但对节奏变化的响应滞后越大。',
    'tip.rhythm.minBpm': 'BPM 识别的最低值，低于此值的节奏会被忽略。',
    'tip.rhythm.maxBpm': 'BPM 识别的最高值，高于此值的节奏会被忽略。',
    'tip.stat.loop': 'Loop 是主处理循环，运行时才向设备下发融合后的命令。',
    'tip.stat.emergency': '紧急停止状态。触发后所有设备输出被强制归零，需手动清除后才能恢复。',
    'tip.stat.bpm': '当前由 OSC 信号变化推算出的节拍 BPM，0 表示未检测到节奏。',
    'tip.stat.params': '当前通过 OSC 收到并更新过的参数总数。为 0 时检查 VRChat OSC 设置。',
    'tip.stat.oscPort': '当前监听 VRChat OSC 数据的 UDP 端口。',
    'tip.stat.tcode': 'TCode 串口设备的连接状态及当前使用的串口号。',
    'tip.stat.intiface': 'Intiface / Buttplug 的连接状态及当前已发现的设备数量。',
    'tip.stat.recording': 'L0 输出录制状态及已录制的帧数。可在脚本页导出为 .funscript。',
    'tip.stat.manual': '手动覆盖状态。启用后设备接受手动测试值而非 OSC 信号。',
    'tip.stat.output': '当前各轴的实时输出值。L0=主轴, R0=翻滚, V=振动。',
    'devices.test.hint': '拖动以下滑块可手动控制各轴位置。勾选「启用手动覆盖」，然后点击「应用手动测试」将命令发送至设备。测试结束后点击「清除手动测试」恢复正常 OSC 驱动模式。',
  },
  en: {
    'hero.desc': 'Local console for connections, configuration, device control, scripts, and runtime monitoring.',
    'btn.refresh': 'Refresh State',
    'btn.save': 'Save Config',
    'btn.startLoop': 'Start Loop',
    'btn.stopLoop': 'Stop Loop',
    'btn.emergencyStop': 'Emergency Stop',
    'btn.clearEmergency': 'Clear Emergency',
    'btn.copyDiag': 'Copy Diagnostics',
    'btn.apply': 'Apply & Save',
    'btn.reloadConfig': 'Reload',
    'btn.addSignal': 'Add Signal',
    'btn.delete': 'Delete',
    'btn.connectTCode': 'Connect TCode',
    'btn.disconnectTCode': 'Disconnect TCode',
    'btn.parkTCode': 'Park TCode',
    'btn.connectIntiface': 'Connect Intiface',
    'btn.disconnectIntiface': 'Disconnect Intiface',
    'btn.scanStart': 'Start Scan',
    'btn.scanStop': 'Stop Scan',
    'btn.startRecording': 'Start Recording',
    'btn.stopRecording': 'Stop Recording',
    'btn.exportFunscript': 'Export .funscript',
    'btn.toggleMock': 'Toggle Mock Device Preview',
    'btn.saveDeviceConfig': 'Save Config',
    'btn.resetDeviceConfig': 'Reset Config',
    'btn.applyManual': 'Apply Manual Test',
    'btn.clearManual': 'Clear Manual Test',
    'cb.manualEnabled': 'Enable Manual Override',
    'cb.gateOpen': 'GateOpen',
    'nav.overview': 'Overview',
    'nav.connections': 'Connections',
    'nav.config': 'Config',
    'nav.devices': 'Devices',
    'nav.scripts': 'Scripts',
    'nav.monitoring': 'Monitoring',
    'nav.help': 'Help',
    'overview.title': 'Overview',
    'overview.desc': 'View the current runtime state, connections, and main output.',
    'overview.badge': 'Current status',
    'overview.status': 'Service Status',
    'overview.diag': 'Live Diagnostics',
    'overview.diagDesc': 'Shows current runtime status and active warnings.',
    'overview.preview': 'Pose Preview',
    'overview.previewDesc': 'Shows current output pose and major axis status.',
    'overview.devices.title': 'Connected Device Overview',
    'overview.devices.desc': 'Real connected devices are shown here first.',
    'overview.guide.none.title': 'No connected devices',
    'overview.guide.none.body': 'Open the Connections tab first, then continue with testing on the Devices tab.',
    'overview.guide.connected.title': 'A device path is available',
    'overview.guide.connected.body': 'Use the Devices tab for testing, or Monitoring to inspect parameters and logs.',
    'overview.guide.osc.title': 'OSC has not arrived yet',
    'overview.guide.osc.body': 'No OSC parameters have been received yet. Device testing can still continue.',
    'connections.title': 'Connection Center',
    'connections.desc': 'Manage TCode and Intiface connection settings and connection state here.',
    'connections.filter.all': 'All',
    'connections.tcode.title': 'Serial Connection',
    'connections.tcode.desc': 'For OSR2 / SR6 / OSR6 style serial devices. Device-specific connection settings stay in one focused card.',
    'connections.intiface.title': 'Buttplug Connection',
    'connections.intiface.desc': 'For Intiface Central or embedded engine workflows. Scan, connect, and address settings live together.',
    'connections.intiface.note': 'On machines without an Intiface environment this should fail clearly instead of pretending success.',
    'config.service.title': 'Service Configuration',
    'config.service.desc': 'Configure service host, port, and receiver port settings.',
    'config.processing.title': 'Processing Chain',
    'config.processing.desc': 'Configure safety limits, idle behavior, and rhythm detection settings.',
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
    'cfg.tcode.l0inv': 'Invert L0',
    'cfg.tcode.refreshPorts': 'Refresh',
    'cfg.intiface.wsAddr': 'WebSocket Address',
    'cfg.intiface.port': 'Port',
    'cfg.intiface.enabled': 'Enable Intiface auto-connect',
    'cfg.intiface.manage': 'Manage intiface-engine',
    'cfg.safety.cap': 'GlobalIntensityCap',
    'cfg.safety.ramp': 'RampUpMs',
    'cfg.safety.idle': 'Idle',
    'cfg.safety.estop': 'EmergencyStopKey',
    'cfg.rhythm.enabled': 'Enable BPM detection',
    'cfg.rhythm.window': 'WindowMs',
    'cfg.rhythm.minBpm': 'MinBpm',
    'cfg.rhythm.maxBpm': 'MaxBpm',
    'signals.title': 'Signal Matrix',
    'signals.desc': 'Edit signal paths, roles, and curve mappings in one place.',
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
    'devices.title': 'Devices',
    'devices.desc': 'View connected devices and run device-specific actions and tests.',
    'devices.test.title': 'Device Test Bench',
    'devices.test.desc': 'Run manual tests here and review current device capabilities.',
    'devices.test.badge': 'Supports mock layout checks',
    'devices.ops.title': 'Device Operations',
    'devices.ops.desc': 'Park, loop control, emergency stop, and manual tests are grouped here.',
    'devices.ops.badge': 'Quick actions',
    'devices.recording.title': 'Recording & Export',
    'devices.recording.desc': 'Recording results can be viewed and exported from the Scripts tab.',
    'devices.recording.hint': 'Export uses trajectory simplification automatically.',
    'devices.empty.title': 'No real connected devices right now',
    'devices.empty.body': 'Enable mock preview to inspect the layout without hardware, or go back to the Connections tab and establish a real link first.',
    'devices.memory.title': 'Device Config',
    'devices.memory.none': 'No local note has been saved for this device yet.',
    'devices.memory.saved': 'Saved at {time}',
    'devices.alias': 'Device Alias',
    'devices.note': 'Device Note',
    'devices.profile': 'Connection Snapshot',
    'devices.quickActions': 'Quick Actions',
    'devices.capabilities': 'Capability Summary',
    'devices.mock.enabled': 'Mock preview is enabled. Two simulated device cards are shown now.',
    'devices.mock.disabled': 'Only real connected devices are shown.',
    'devices.manual.title': 'Manual Functional Test',
    'devices.manual.desc': 'Manual override remains unified here, while device-specific cards only show actions that the target device can actually understand.',
    'scripts.title': 'Scripts',
    'scripts.desc': 'Recording, export, import, and preview playback are grouped here.',
    'scripts.badge': 'Script Studio',
    'scripts.recording.title': 'Recording & Export',
    'scripts.recording.desc': 'Capture the live L0 output and export it as a `.funscript` when the recording is done.',
    'scripts.recording.hint': 'Export uses trajectory simplification automatically. Preview playback does not control devices directly.',
    'scripts.import.title': 'Import & Source',
    'scripts.import.desc': 'Use the current recording buffer directly, or import a local `.funscript` file.',
    'scripts.import.file': 'Choose a `.funscript` file',
    'scripts.import.useRecording': 'Use current recording buffer',
    'scripts.import.clear': 'Clear preview',
    'scripts.player.title': 'Script Preview Playback',
    'scripts.player.desc': 'Use this section to review rhythm, density, and timeline position.',
    'scripts.player.play': 'Play',
    'scripts.player.pause': 'Pause',
    'scripts.player.stop': 'Stop',
    'scripts.player.empty': 'No script loaded',
    'scripts.player.playing': 'Playing',
    'scripts.player.paused': 'Paused',
    'scripts.timeline.title': 'Timeline Summary',
    'scripts.timeline.desc': 'Shows source, count, duration, and other summary details.',
    'scripts.timeline.empty': 'No script data is available.',
    'scripts.meta.empty': 'No script data is loaded.',
    'scripts.meta.recording': 'Current recording buffer: {count} sampled points over about {duration}.',
    'scripts.meta.imported': 'Imported `{name}`: {count} action points over about {duration}.',
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
    'monitor.params.desc': 'View the current parameter stream and latest update times.',
    'monitor.params.filter': 'Search parameter path / type',
    'monitor.logs.title': 'Logs',
    'monitor.logs.desc': 'View runtime logs, connection logs, and configuration changes.',
    'monitor.logs.filter': 'Search logs',
    'help.title': 'Help & Documentation',
    'help.card.workflow.title': 'Usage order',
    'help.card.workflow.body': 'Create a connection first, then test devices, and finally connect live VRChat signals.',
    'help.card.layout.title': 'Page sections',
    'help.card.layout.body': 'Connections, config, devices, scripts, monitoring, and help are separated for quicker access.',
    'help.card.mobile.title': 'Mobile note',
    'help.card.mobile.body': 'The layout and navigation adapt automatically on smaller screens.',
    'help.endpoints.title': 'HTTP / WS Endpoints',
    'help.links.title': 'Reference Links',
    'help.links.desc': 'View documentation and related external references.',
    'help.links.tcodeSpec': 'Public documentation for TCode axes, commands, and extension terms.',
    'help.links.osr': 'Firmware reference implementations for axis naming and real-time behavior.',
    'help.links.emu': 'Useful for comparing `Ixxxx` / `Sxxxx` behavior and pose expectations.',
    'help.links.vsp': 'Additional guidance for serial setup, device preparation, and testing flow.',
    'legend.l0': 'L0: Main stroke',
    'legend.r': 'R0 / R1 / R2: Pose & Twist',
    'legend.lateral': 'L1 / L2: Lateral Offsets',
    'label.loop': 'Loop',
    'label.emergency': 'Emergency',
    'label.params': 'Parameters',
    'label.recording': 'Recording',
    'label.manual': 'Manual',
    'label.output': 'Output',
    'label.devices': 'Devices',
    'label.port': 'Port',
    'label.mode': 'Mode',
    'label.engine': 'Engine',
    'label.address': 'Address',
    'label.connectedCount': '{count} connected',
    'label.none': 'None',
    'label.noDevices': 'No devices',
    'label.auto': 'Auto-connect',
    'label.on': 'On',
    'label.off': 'Off',
    'label.speed': 'Speed Mode',
    'label.interval': 'Interval Mode',
    'label.managed': 'Managed',
    'label.external': 'External',
    'label.frames': 'Frames',
    'label.mock': 'Mock Preview',
    'label.real': 'Real Device',
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
    'status.none': 'None',
    'status.mocking': 'Mocking',
    'toast.refreshFailed': 'Refresh failed',
    'toast.refreshSuccess': 'State refreshed',
    'toast.saved': 'Configuration saved',
    'toast.applied': 'Configuration saved',
    'toast.actionSuccess': 'Action completed',
    'toast.actionFailed': 'Action failed',
    'toast.signalAdded': 'Signal added',
    'toast.exportDone': 'Export complete',
    'toast.diagCopied': 'Diagnostics copied',
    'toast.themeChanged': 'Theme changed',
    'toast.langChanged': 'Language changed',
    'toast.portsRefreshed': 'Serial ports refreshed',
    'toast.copyFailed': 'Copy failed. Please copy manually.',
    'toast.mockChanged': 'Mock preview toggled',
    'toast.memorySaved': 'Remembered configuration saved',
    'toast.memoryCleared': 'Remembered configuration cleared',
    'toast.scriptLoaded': 'Script loaded',
    'toast.scriptCleared': 'Script preview cleared',
    'toast.scriptFailed': 'Script load failed',
    'msg.saved': 'The current configuration has been written to disk.',
    'msg.applied': 'Configuration was applied and written to disk.',
    'msg.signalAdded': 'Fill in the OSC path and choose an appropriate role.',
    'msg.noRecording': 'No recording data available',
    'msg.diagCopied': 'Diagnostics summary copied.',
    'msg.themeChanged': 'The new theme is now active.',
    'msg.langChanged': 'Visible copy has been refreshed in the selected language.',
    'msg.portsRefreshed': 'Available COM ports were enumerated again.',
    'msg.mockChanged': 'Mock device visibility updated.',
    'msg.memorySaved': 'Device note saved locally.',
    'msg.memoryCleared': 'Device note cleared.',
    'msg.scriptLoaded': 'Script loaded and ready for preview.',
    'msg.scriptCleared': 'Script preview cleared.',
    'msg.scriptInvalid': 'The file is not a valid `.funscript` JSON document or it is missing an actions array.',
    'msg.actionReportedFailure': 'The service reported a failed action. Check logs or diagnostics.',
    'msg.intifaceConnectFailed': 'Intiface connection failed. Check Intiface Central, the WebSocket address, or intiface-engine.',
    'msg.tcodeConnectFailed': 'TCode connection failed. Check the COM port, driver, contention, and device power.',
    'diag.loopStopped.title': 'Loop is not running',
    'diag.loopStopped.body': 'No fused commands are being sent to devices. Click “Start Loop” if this is unexpected.',
    'diag.emergency.title': 'Emergency Stop is active',
    'diag.emergency.body': 'Device output is being clamped for safety. Clear the emergency stop when it is safe to resume.',
    'diag.engineMissing.title': 'Embedded Intiface engine not found',
    'diag.engineMissing.body': 'If you rely on Buttplug devices, place intiface-engine.exe locally or disable engine management and run Intiface Central manually.',
    'diag.tcodeMissing.title': 'TCode auto-connect is enabled but not connected',
    'diag.tcodeMissing.body': 'Check that the COM port is correct, the port is free, and then retry from the Connections page.',
    'diag.oscMissing.title': 'No OSC parameters received yet',
    'diag.oscMissing.body': 'Check VRChat OSC, confirm port 9001, and verify that the current avatar really contains Sensa components.',
    'diag.ok.title': 'System looks healthy',
    'diag.ok.body': 'No obvious runtime or connection problems were detected.',
    'recording.summary': 'Recording status: {state}, total {count} frames.',
    'recording.active': 'Recording',
    'recording.inactive': 'Not recording',
    'ws.disconnected': 'WS Offline',
    'tip.refresh': 'Fetch the latest service state and configuration',
    'tip.lang': 'Toggle Chinese / English',
    'tip.theme': 'Cycle theme',
    'tip.tcode.comPort': 'Serial port for the device, e.g. COM3. Click Refresh to list available ports.',
    'tip.tcode.minPos': 'Minimum axis position (0–999), bottom of the travel range. Usually 100.',
    'tip.tcode.maxPos': 'Maximum axis position (0–999), top of the travel range. Usually 900.',
    'tip.tcode.maxVel': 'Max per-frame movement (velocity cap). Lower values protect mechanical components.',
    'tip.tcode.ups': 'Commands per second sent to the device. 50–100 recommended.',
    'tip.tcode.enabled': 'Auto-connect to the specified port when the service starts.',
    'tip.tcode.speedMode': 'Send speed (Ixxxx) instead of position (Lxxxx) commands. Requires interpolating firmware.',
    'tip.tcode.l0inv': 'Invert the L0 axis (0 ↔ 1). Use when the device is mounted upside down.',
    'tip.intiface.wsAddr': 'WebSocket address of Intiface Central or the embedded engine. Default: ws://localhost:12345.',
    'tip.intiface.port': 'Port the embedded intiface-engine listens on. Must match the WebSocket address.',
    'tip.intiface.enabled': 'Auto-connect to Intiface when the service starts.',
    'tip.intiface.manage': 'Let Sensa start/stop the embedded intiface-engine. Disable if using Intiface Central manually.',
    'tip.webui.host': 'Bind address. 127.0.0.1 = local only; 0.0.0.0 = LAN accessible.',
    'tip.webui.port': 'HTTP port for the web interface. Restart after changing.',
    'tip.osc.port': 'UDP port for VRChat OSC data. VRChat defaults to 9001.',
    'tip.safety.cap': 'Global intensity cap (0–1). Device output will never exceed this. Recommended ≤ 0.8.',
    'tip.safety.ramp': 'Milliseconds to ramp from 0 to target on startup. Prevents sudden full-speed starts.',
    'tip.safety.idle': 'Device behavior when Loop stops or no signal arrives: hold last position or return to center.',
    'tip.safety.estop': 'Global emergency stop hotkey. Assign a key to stop all output instantly. Leave blank to disable.',
    'tip.rhythm.enabled': 'Detect BPM from OSC signal changes for rhythm-aware output.',
    'tip.rhythm.window': 'BPM calculation window in ms. Larger = smoother but slower to respond.',
    'tip.rhythm.minBpm': 'Minimum detectable BPM. Rhythms below this are ignored.',
    'tip.rhythm.maxBpm': 'Maximum detectable BPM. Rhythms above this are ignored.',
    'tip.stat.loop': 'Main processing loop. Must be running to send commands to devices.',
    'tip.stat.emergency': 'Emergency stop state. When triggered, all device output is clamped to zero.',
    'tip.stat.bpm': 'Current BPM estimated from OSC signal variation. 0 means no rhythm detected.',
    'tip.stat.params': 'Number of OSC parameters received and updated. 0 means no OSC signal yet.',
    'tip.stat.oscPort': 'UDP port currently listening for VRChat OSC data.',
    'tip.stat.tcode': 'TCode serial device connection state and active COM port.',
    'tip.stat.intiface': 'Intiface / Buttplug connection state and number of discovered devices.',
    'tip.stat.recording': 'L0 recording state and frame count. Export as .funscript from the Scripts tab.',
    'tip.stat.manual': 'Manual override state. When enabled, device accepts manual test values instead of OSC.',
    'tip.stat.output': 'Current real-time axis output values. L0=stroke, R0=roll, V=vibrate.',
    'devices.test.hint': 'Drag sliders to set each axis value manually. Check "Enable Manual Override" and click "Apply" to send to the device. Click "Clear" to return to normal OSC-driven mode.',
  },
};

const state = {
  meta: null,
  config: null,
  overview: null,
  recordingFrames: [],
  parameters: [],
  logs: [],
  serialPorts: [],
  activeTab: localStorage.getItem('sensa.activeTab') || 'overview',
  language: localStorage.getItem('sensa.language') || 'zh-CN',
  theme: 'light',
  wsConnected: false,
  wsRetryMs: 1000,
  filters: {
    signals: '',
    parameters: '',
    logs: '',
  },
  connectionFilter: 'all',
  showMockDevices: localStorage.getItem(MOCK_TOGGLE_KEY) === 'true',
  deviceDrafts: {},
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
};

const enums = {
  roles: [],
  curves: [],
  idleBehaviors: [],
};

const els = {
  toastHost: document.getElementById('toastHost'),
  heroTitle: document.getElementById('heroTitle'),
  heroQuickStats: document.getElementById('heroQuickStats'),
  wsBadge: document.getElementById('wsBadge'),
  statusCards: document.getElementById('statusCards'),
  diagnosticsList: document.getElementById('diagnosticsList'),
  overviewGuide: document.getElementById('overviewGuide'),
  overviewDeviceDeck: document.getElementById('overviewDeviceDeck'),
  commandSummaryBadge: document.getElementById('commandSummaryBadge'),
  connectionTcodeSummary: document.getElementById('connectionTcodeSummary'),
  connectionIntifaceSummary: document.getElementById('connectionIntifaceSummary'),
  signalFilterInput: document.getElementById('signalFilterInput'),
  signalsBody: document.querySelector('#signalsTable tbody'),
  signalTemplate: document.getElementById('signalRowTemplate'),
  connectedDeviceDeck: document.getElementById('connectedDeviceDeck'),
  deviceWorkbenchIntro: document.getElementById('deviceWorkbenchIntro'),
  deviceOpsSummary: document.getElementById('deviceOpsSummary'),
  deviceTestZone: document.getElementById('deviceTestZone'),
  recordingInfo: document.getElementById('recordingInfo'),
  scriptSummaryGrid: document.getElementById('scriptSummaryGrid'),
  scriptRecordingBadge: document.getElementById('scriptRecordingBadge'),
  scriptMeta: document.getElementById('scriptMeta'),
  scriptCanvas: document.getElementById('scriptCanvas'),
  scriptSeekInput: document.getElementById('scriptSeekInput'),
  scriptStatusBadge: document.getElementById('scriptStatusBadge'),
  scriptTimeLabel: document.getElementById('scriptTimeLabel'),
  scriptTimelineList: document.getElementById('scriptTimelineList'),
  parameterFilterInput: document.getElementById('parameterFilterInput'),
  parametersBody: document.querySelector('#parametersTable tbody'),
  logFilterInput: document.getElementById('logFilterInput'),
  logPanel: document.getElementById('logPanel'),
  endpointList: document.getElementById('endpointList'),
  copyDiagnosticsBtn: document.getElementById('copyDiagnosticsBtn'),
  langToggleBtn: document.getElementById('langToggleBtn'),
  themeToggleBtn: document.getElementById('themeToggleBtn'),
  refreshBtn: document.getElementById('refreshBtn'),
  applyConfigBtn: document.getElementById('applyConfigBtn'),
  saveConfigBtn: document.getElementById('saveConfigBtn'),
  addSignalBtn: document.getElementById('addSignalBtn'),
  refreshPortsBtn: document.getElementById('refreshPortsBtn'),
  exportRecordingBtn: document.getElementById('exportRecordingBtn'),
  mockDevicesToggleBtn: document.getElementById('mockDevicesToggleBtn'),
  scriptFileInput: document.getElementById('scriptFileInput'),
  useRecordingScriptBtn: document.getElementById('useRecordingScriptBtn'),
  clearScriptBtn: document.getElementById('clearScriptBtn'),
  scriptPlayBtn: document.getElementById('scriptPlayBtn'),
  scriptPauseBtn: document.getElementById('scriptPauseBtn'),
  scriptStopBtn: document.getElementById('scriptStopBtn'),
  comPortList: document.getElementById('comPortList'),
  canvas: document.getElementById('deviceCanvas'),
};

function qs(selector, root = document) {
  return root.querySelector(selector);
}

function qsa(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

function inputByName(name) {
  return document.querySelector(`[name="${name}"]`);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatDuration(ms) {
  const safe = Math.max(0, Math.round(Number(ms) || 0));
  const totalSeconds = Math.floor(safe / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function formatScriptSource(source) {
  switch (source) {
    case 'recording':
      return t('scripts.source.recording');
    case 'imported':
      return t('scripts.source.imported');
    default:
      return t('scripts.source.empty');
  }
}

function stopScriptPlayback() {
  const player = state.scriptPlayer;
  player.isPlaying = false;
  if (player.rafId) cancelAnimationFrame(player.rafId);
  player.rafId = 0;
}

function setScriptCurrentMs(ms) {
  const player = state.scriptPlayer;
  player.currentMs = Math.max(0, Math.min(player.durationMs || 0, Math.round(ms || 0)));
  if (els.scriptSeekInput) {
    const ratio = player.durationMs > 0 ? player.currentMs / player.durationMs : 0;
    els.scriptSeekInput.value = String(Math.round(ratio * 1000));
  }
  renderScriptPlayer();
}

function getScriptValueAt(ms) {
  const points = state.scriptPlayer.points || [];
  if (!points.length) return 0;
  let value = points[0].value;
  for (const point of points) {
    if (point.ms > ms) break;
    value = point.value;
  }
  return value;
}

function setScriptDataset({ source, name, points, durationMs }) {
  stopScriptPlayback();
  state.scriptPlayer = {
    ...state.scriptPlayer,
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
  renderScriptPlayer();
}

function useRecordingDataset() {
  const points = (state.recordingFrames || []).map(frame => ({ ms: Number(frame.ms) || 0, value: Math.max(0, Math.min(1, Number(frame.l0) || 0)) }));
  const durationMs = points.length ? points[points.length - 1].ms : 0;
  setScriptDataset({ source: points.length ? 'recording' : 'empty', name: 'recording', points, durationMs });
}

function parseFunscriptText(text) {
  const data = JSON.parse(text);
  if (!data || !Array.isArray(data.actions)) throw new Error(t('msg.scriptInvalid'));
  const points = data.actions
    .map(action => ({
      ms: Math.max(0, Math.round(Number(action.at) || 0)),
      value: Math.max(0, Math.min(1, (Number(action.pos) || 0) / 100)),
    }))
    .sort((a, b) => a.ms - b.ms);
  return {
    points,
    durationMs: points.length ? points[points.length - 1].ms : 0,
  };
}

function scriptTick(now) {
  const player = state.scriptPlayer;
  if (!player.isPlaying) return;
  const elapsed = now - player.startedAtMs;
  const nextMs = player.baselineMs + elapsed;
  if (nextMs >= player.durationMs) {
    setScriptCurrentMs(player.durationMs);
    stopScriptPlayback();
    return;
  }
  setScriptCurrentMs(nextMs);
  player.rafId = requestAnimationFrame(scriptTick);
}

function loadDeviceMemory() {
  try {
    return JSON.parse(localStorage.getItem(DEVICE_MEMORY_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveDeviceMemory(memory) {
  localStorage.setItem(DEVICE_MEMORY_KEY, JSON.stringify(memory));
}

function t(key, replacements = null, fallback = null) {
  const table = I18N[state.language] || I18N['zh-CN'];
  let value = table[key] ?? I18N['zh-CN'][key] ?? fallback ?? key;
  if (replacements) {
    for (const [name, replacement] of Object.entries(replacements)) {
      value = value.replaceAll(`{${name}}`, replacement);
    }
  }
  return value;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${response.status} ${response.statusText} - ${text}`);
  }
  const contentType = response.headers.get('content-type') || '';
  return contentType.includes('application/json') ? response.json() : response.text();
}

function showToast(title, message, type = 'success', timeoutMs = 2800) {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<div class="toast-title">${escapeHtml(title)}</div><div>${escapeHtml(message)}</div>`;
  els.toastHost.appendChild(el);
  setTimeout(() => el.remove(), timeoutMs);
}

function setLeadingTextPreservingChildren(element, text) {
  const suffix = element.querySelector('input, select, textarea, button, datalist, output, canvas, .input-row') ? ' ' : '';
  const textNode = Array.from(element.childNodes).find(node => node.nodeType === Node.TEXT_NODE);
  if (textNode) {
    textNode.textContent = `${text}${suffix}`;
    return;
  }
  element.insertBefore(document.createTextNode(`${text}${suffix}`), element.firstChild);
}

function translateDocument() {
  document.documentElement.lang = state.language;
  qsa('[data-i18n]').forEach(element => {
    const key = element.dataset.i18n;
    const translated = t(key, null, null);
    if (!translated || translated === key) return;
    if (element.querySelector('input, select, textarea, button, datalist, output, canvas, .input-row')) {
      setLeadingTextPreservingChildren(element, translated);
    } else {
      element.innerHTML = translated;
    }
  });
  qsa('[data-i18n-placeholder]').forEach(element => {
    element.setAttribute('placeholder', t(element.dataset.i18nPlaceholder, null, element.getAttribute('placeholder') || ''));
  });
  qsa('[data-i18n-data-tip]').forEach(element => {
    element.dataset.tip = t(element.dataset.i18nDataTip, null, element.dataset.tip || '');
  });
  document.title = DEFAULT_TITLE;
  els.heroTitle.textContent = DEFAULT_TITLE;
  els.langToggleBtn.textContent = state.language === 'zh-CN' ? 'EN' : 'ZH';
  els.themeToggleBtn.textContent = `◑ ${state.theme}`;
}

function applyTheme(theme) {
  state.theme = THEMES.includes(theme) ? theme : 'light';
  document.documentElement.dataset.theme = state.theme;
  localStorage.setItem('sensa.theme', state.theme);
  els.themeToggleBtn.textContent = `◑ ${state.theme}`;
}

function cycleTheme() {
  const index = THEMES.indexOf(state.theme);
  applyTheme(THEMES[(index + 1) % THEMES.length]);
}

function toggleLanguage() {
  const index = LANGUAGES.indexOf(state.language);
  state.language = LANGUAGES[(index + 1) % LANGUAGES.length];
  localStorage.setItem('sensa.language', state.language);
  renderAll();
}

function setActiveTab(tab) {
  state.activeTab = tab;
  localStorage.setItem('sensa.activeTab', tab);
  qsa('[data-tab-panel]').forEach(panel => panel.classList.toggle('is-active', panel.dataset.tabPanel === tab));
  qsa('.tab-button').forEach(button => button.classList.toggle('is-active', button.dataset.tabTarget === tab));
  window.scrollTo({ top: 0, behavior: 'auto' });
}

function setWsConnected(connected) {
  state.wsConnected = connected;
  els.wsBadge.textContent = connected ? t('status.wsConnected') : t('status.wsDisconnected');
  els.wsBadge.className = `badge ${connected ? 'online' : 'offline'}`;
}

function formatStatus(flag) {
  return flag ? t('status.connected') : t('status.disconnected');
}

function fillInput(name, value) {
  const input = inputByName(name);
  if (!input) return;
  if (input.type === 'checkbox') input.checked = !!value;
  else input.value = value ?? '';
}

function readInput(name) {
  const input = inputByName(name);
  if (!input) return undefined;
  if (input.type === 'checkbox') return input.checked;
  if (input.type === 'number') return input.value === '' ? 0 : Number(input.value);
  return input.value;
}

function populateSelect(name, values) {
  const select = inputByName(name);
  if (!select) return;
  select.innerHTML = values.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('');
}

function rememberableDeviceKey(device) {
  return `${device.kind}:${device.memoryId}`;
}

function getRememberedConfig(device) {
  const memory = loadDeviceMemory();
  return memory[rememberableDeviceKey(device)] || null;
}

function rememberDeviceConfig(device, payload) {
  const memory = loadDeviceMemory();
  memory[rememberableDeviceKey(device)] = {
    ...payload,
    savedAt: new Date().toISOString(),
  };
  saveDeviceMemory(memory);
}

function clearRememberedConfig(device) {
  const memory = loadDeviceMemory();
  delete memory[rememberableDeviceKey(device)];
  saveDeviceMemory(memory);
}

function getDeviceDraft(device) {
  return state.deviceDrafts[rememberableDeviceKey(device)] || null;
}

function setDeviceDraft(device, patch) {
  const key = rememberableDeviceKey(device);
  state.deviceDrafts[key] = {
    ...(state.deviceDrafts[key] || {}),
    ...patch,
  };
}

function clearDeviceDraft(device) {
  delete state.deviceDrafts[rememberableDeviceKey(device)];
}

function buildRealDevices() {
  const devices = [];
  if (state.overview?.tcode?.connected) {
    const cfg = state.config?.tCode || {};
    devices.push({
      id: `tcode:${cfg.comPort || 'unknown'}`,
      memoryId: cfg.comPort || 'unknown',
      kind: 'tcode',
      source: 'real',
      name: cfg.comPort ? `TCode @ ${cfg.comPort}` : 'TCode Device',
      model: cfg.comPort?.toUpperCase().includes('COM') ? 'OSR-class' : 'TCode',
      connectionLabel: 'TCode',
      summary: '当前通过串口连接的 OSR 类设备。适合继续验证回中、速度模式与轴向。',
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
        l0Invert: cfg.l0Invert,
      },
    });
  }

  const intifaceDevices = state.overview?.intiface?.devices || [];
  intifaceDevices.forEach(device => {
    devices.push({
      id: `intiface:${device.index}:${device.name}`,
      memoryId: `${device.index}:${device.name}`,
      kind: 'intiface',
      source: 'real',
      name: device.name,
      model: 'Buttplug Device',
      connectionLabel: 'Intiface',
      summary: '当前由 Intiface / Buttplug 暴露出来的真实设备。',
      facts: {
        position: `${device.positionFeatures} position`,
        vibrate: `${device.vibrateFeatures} vibrate`,
        bridge: state.config?.intiface?.manageEngineProcess ? t('label.managed') : t('label.external'),
        state: t('status.connected'),
      },
      quickActions: ['scan'],
      snapshot: {
        websocketAddress: state.config?.intiface?.websocketAddress,
        port: state.config?.intiface?.port,
        enabled: state.config?.intiface?.enabled,
        manageEngineProcess: state.config?.intiface?.manageEngineProcess,
      },
    });
  });
  return devices;
}

function buildMockDevices() {
  return MOCK_DEVICE_LIBRARY.map(mock => ({
    ...mock,
    source: 'mock',
    memoryId: mock.id,
    snapshot:
      mock.kind === 'tcode'
        ? {
            comPort: 'COM-MOCK',
            minPos: 100,
            maxPos: 900,
            maxVelocity: 1400,
            updatesPerSecond: 50,
            preferSpeedMode: true,
            l0Invert: false,
          }
        : {
            websocketAddress: 'ws://localhost:12345',
            port: 12345,
            enabled: true,
            manageEngineProcess: true,
          },
  }));
}

function getDisplayedDevices() {
  const realDevices = buildRealDevices();
  if (state.showMockDevices) return [...realDevices, ...buildMockDevices()];
  return realDevices;
}

function formatSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return '';
  const rows = Object.entries(snapshot)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `<div class="snapshot-row"><span class="snapshot-key">${escapeHtml(k)}</span><span class="snapshot-val">${escapeHtml(String(v))}</span></div>`)
    .join('');
  return `<div class="snapshot-list">${rows}</div>`;
}

function buildDeviceCard(device, context = 'devices') {
  const remembered = getRememberedConfig(device);
  const draft = getDeviceDraft(device);
  const memorySummary = remembered ? t('devices.memory.saved', { time: new Date(remembered.savedAt).toLocaleString() }) : t('devices.memory.none');
  const factEntries = Object.entries(device.facts || {})
    .map(([key, value]) => `<div class="fact-pill"><strong>${escapeHtml(key)}</strong><span>${escapeHtml(value)}</span></div>`)
    .join('');

  const actionButtons = [];
  if (device.quickActions.includes('park')) {
    actionButtons.push(`<button type="button" data-device-action="park" data-device-id="${escapeHtml(device.id)}">${escapeHtml(t('btn.park'))}</button>`);
  }
  if (device.quickActions.includes('scan')) {
    actionButtons.push(`<button type="button" data-device-action="scan" data-device-id="${escapeHtml(device.id)}">${escapeHtml(t('btn.scan'))}</button>`);
  }
  // save/reset config actions are rendered inside the memory section below

  const alias = draft?.alias ?? remembered?.alias ?? '';
  const note = draft?.note ?? remembered?.note ?? '';
  const classes = ['device-card', `device-card--${device.kind}`, 'positioned'];
  if (device.source === 'mock') classes.push('device-card--mock');

  const memoryBlock =
    context === 'devices'
      ? `
      <div class="device-card__stack">
        <div class="device-config-label"><strong>${escapeHtml(t('devices.memory.title'))}</strong><span class="muted">${escapeHtml(memorySummary)}</span></div>
        <label>
          <span>${escapeHtml(t('devices.alias'))}</span>
          <input type="text" data-memory-field="alias" data-device-id="${escapeHtml(device.id)}" value="${escapeHtml(alias)}" />
        </label>
        <label>
          <span>${escapeHtml(t('devices.note'))}</span>
          <input type="text" data-memory-field="note" data-device-id="${escapeHtml(device.id)}" value="${escapeHtml(note)}" />
        </label>
        <div class="button-row">
          <button type="button" class="primary" data-device-action="remember" data-device-id="${escapeHtml(device.id)}">${escapeHtml(t('btn.saveDeviceConfig'))}</button>
          <button type="button" class="ghost" data-device-action="reset" data-device-id="${escapeHtml(device.id)}">${escapeHtml(t('btn.resetDeviceConfig'))}</button>
        </div>
        <div class="callout"><strong>${escapeHtml(t('devices.profile'))}</strong>${formatSnapshot(device.snapshot)}</div>
      </div>`
      : '';

  const quickActionsSection = actionButtons.length
    ? `<div class="device-card__stack">
        <strong>${escapeHtml(t('devices.quickActions'))}</strong>
        <div class="button-row">${actionButtons.join('')}</div>
      </div>`
    : '';

  return `
    <article class="${classes.join(' ')}" data-device-card="${escapeHtml(device.id)}">
      <div class="device-card__meta">
        <div>
          <span class="proto-badge ${device.kind === 'tcode' ? 'tcode' : 'intiface'}">${escapeHtml(device.connectionLabel)}</span>
          <h3>${escapeHtml(device.name)}</h3>
          <p class="muted">${escapeHtml(device.summary)}</p>
        </div>
        <span class="badge ${device.source === 'mock' ? 'soft' : 'online'}">${escapeHtml(device.source === 'mock' ? t('label.mock') : t('label.real'))}</span>
      </div>
      <div class="device-card__facts">${factEntries}</div>
      ${memoryBlock}
      ${quickActionsSection}
    </article>`;
}

function renderOverviewGuide(devices) {
  const items = [];
  if (devices.length === 0) {
    items.push({ title: t('overview.guide.none.title'), body: t('overview.guide.none.body') });
  } else {
    items.push({ title: t('overview.guide.connected.title'), body: t('overview.guide.connected.body') });
  }
  if ((state.overview?.osc?.parameterCount || 0) === 0) {
    items.push({ title: t('overview.guide.osc.title'), body: t('overview.guide.osc.body') });
  }
  els.overviewGuide.innerHTML = items.map(item => `<article class="guide-step"><strong>${escapeHtml(item.title)}</strong><div>${escapeHtml(item.body)}</div></article>`).join('');
}

function renderStatus() {
  if (!state.overview) return;
  const overview = state.overview;
  const command = overview.loop.command || {};
  const devices = buildRealDevices();
  const cards = [
    [t('label.loop'), overview.loop.isRunning ? t('status.running') : t('status.stopped'), overview.loop.isRunning ? 'ok' : 'warn', t('tip.stat.loop')],
    [t('label.emergency'), overview.loop.isEmergency ? t('status.triggered') : t('status.normal'), overview.loop.isEmergency ? 'danger' : '', t('tip.stat.emergency')],
    ['BPM', Number(overview.loop.currentBpm || 0).toFixed(1), '', t('tip.stat.bpm')],
    [t('label.params'), String(overview.osc.parameterCount || 0), '', t('tip.stat.params')],
    ['OSC ' + t('label.port'), String(state.config?.osc?.receiverPort || '-'), '', t('tip.stat.oscPort')],
    ['TCode', overview.tcode.connected ? `${t('status.connected')} · ${state.config?.tCode?.comPort || '-'}` : t('status.disconnected'), overview.tcode.connected ? 'ok' : '', t('tip.stat.tcode')],
    [
      'Intiface',
      overview.intiface.connected ? `${t('status.connected')} (${overview.intiface.devices.length})` : t('status.disconnected'),
      overview.intiface.connected ? 'ok' : '',
      t('tip.stat.intiface'),
    ],
    [
      t('label.recording'),
      overview.recording.isActive ? `${t('recording.active')} · ${overview.recording.frameCount}` : `${t('status.idle')} · ${overview.recording.frameCount}`,
      overview.recording.isActive ? 'ok' : '',
      t('tip.stat.recording'),
    ],
    [t('label.manual'), overview.loop.manualOverrideEnabled ? t('status.enabled') : t('status.disabled'), overview.loop.manualOverrideEnabled ? 'warn' : '', t('tip.stat.manual')],
    [t('label.output'), `L0 ${Number(command.l0 ?? 0).toFixed(2)} · R0 ${Number(command.r0 ?? 0.5).toFixed(2)} · V ${Number(command.vibrate ?? 0).toFixed(2)}`, '', t('tip.stat.output')],
  ];

  els.statusCards.innerHTML = cards
    .map(
      ([label, value, cls, tip]) =>
        `<div class="stat ${cls || ''}" ${tip ? `data-tip="${escapeHtml(tip)}"` : ''}><div class="stat-label">${escapeHtml(label)}</div><div class="stat-value">${escapeHtml(value)}</div></div>`,
    )
    .join('');

  const heroChips = [
    { label: t('label.loop'), value: overview.loop.isRunning ? t('status.running') : t('status.stopped'), cls: overview.loop.isRunning ? 'ok' : '' },
    { label: t('label.emergency'), value: overview.loop.isEmergency ? t('status.triggered') : t('status.normal'), cls: overview.loop.isEmergency ? 'danger' : '' },
    { label: 'WS', value: state.wsConnected ? t('status.connected') : t('status.disconnected'), cls: state.wsConnected ? 'ok' : '' },
    { label: t('label.devices'), value: devices.length ? String(devices.length) : '-', cls: '' },
  ];
  els.heroQuickStats.innerHTML = heroChips.map(({ label, value, cls }) => `<div class="quick-chip ${cls}"><strong>${escapeHtml(label)}</strong><span>${escapeHtml(value)}</span></div>`).join('');

  els.commandSummaryBadge.textContent = `L0 ${Number(command.l0 ?? 0).toFixed(2)} · R0 ${Number(command.r0 ?? 0.5).toFixed(2)} · Vib ${Number(command.vibrate ?? 0).toFixed(2)} · Gate ${command.gateOpen ? 'Open' : 'Closed'}`;
  renderOverviewGuide(devices);
  renderOverviewDevices(devices);
  renderConnectionSummaries();
  renderRecordingSummary();
  renderDiagnostics();
  drawDevice(command);
}

function renderOverviewDevices(devices) {
  if (!devices.length) {
    els.overviewDeviceDeck.innerHTML = `<div class="empty-state"><strong>${escapeHtml(t('devices.empty.title'))}</strong><div>${escapeHtml(t('devices.empty.body'))}</div></div>`;
    return;
  }
  els.overviewDeviceDeck.innerHTML = devices.map(device => buildDeviceCard(device, 'overview')).join('');
}

function renderConnectionSummaries() {
  if (!state.config || !state.overview) return;
  const tcodeBits = [
    [t('label.port'), state.config.tCode?.comPort || t('label.none')],
    [t('label.auto'), state.config.tCode?.enabled ? t('label.on') : t('label.off')],
    [t('label.mode'), state.config.tCode?.preferSpeedMode ? t('label.speed') : t('label.interval')],
    [t('label.frames'), `${state.config.tCode?.updatesPerSecond ?? '-'} UPS`],
  ];
  els.connectionTcodeSummary.innerHTML = tcodeBits
    .map(([label, value]) => `<div class="device-status-chip ${state.overview.tcode.connected ? 'ok' : ''}"><strong>${escapeHtml(label)}</strong><span>${escapeHtml(value)}</span></div>`)
    .join('');

  const intifaceBits = [
    [t('label.address'), state.config.intiface?.websocketAddress || t('label.none')],
    [t('label.engine'), state.config.intiface?.manageEngineProcess ? t('label.managed') : t('label.external')],
    [t('label.auto'), state.config.intiface?.enabled ? t('label.on') : t('label.off')],
    [t('label.devices'), t('label.connectedCount', { count: String(state.overview.intiface.devices.length) })],
  ];
  els.connectionIntifaceSummary.innerHTML = intifaceBits
    .map(([label, value]) => `<div class="device-status-chip ${state.overview.intiface.connected ? 'ok' : ''}"><strong>${escapeHtml(label)}</strong><span>${escapeHtml(value)}</span></div>`)
    .join('');
}

function renderConfig() {
  if (!state.config) return;
  fillInput('webUi.host', state.config.webUi.host);
  fillInput('webUi.port', state.config.webUi.port);
  fillInput('osc.receiverPort', state.config.osc.receiverPort);
  fillInput('tCode.comPort', state.config.tCode.comPort);
  fillInput('tCode.minPos', state.config.tCode.minPos);
  fillInput('tCode.maxPos', state.config.tCode.maxPos);
  fillInput('tCode.maxVelocity', state.config.tCode.maxVelocity);
  fillInput('tCode.updatesPerSecond', state.config.tCode.updatesPerSecond);
  fillInput('tCode.enabled', state.config.tCode.enabled);
  fillInput('tCode.preferSpeedMode', state.config.tCode.preferSpeedMode);
  fillInput('tCode.l0Invert', state.config.tCode.l0Invert);
  fillInput('intiface.websocketAddress', state.config.intiface.websocketAddress);
  fillInput('intiface.port', state.config.intiface.port);
  fillInput('intiface.enabled', state.config.intiface.enabled);
  fillInput('intiface.manageEngineProcess', state.config.intiface.manageEngineProcess);
  fillInput('safety.globalIntensityCap', state.config.safety.globalIntensityCap);
  fillInput('safety.rampUpMs', state.config.safety.rampUpMs);
  fillInput('safety.idle', state.config.safety.idle);
  fillInput('safety.emergencyStopKey', state.config.safety.emergencyStopKey);
  fillInput('rhythm.enabled', state.config.rhythm.enabled);
  fillInput('rhythm.windowMs', state.config.rhythm.windowMs);
  fillInput('rhythm.minBpm', state.config.rhythm.minBpm);
  fillInput('rhythm.maxBpm', state.config.rhythm.maxBpm);
  renderPortOptions();
  els.endpointList.innerHTML = state.meta?.endpoints?.length
    ? state.meta.endpoints.map(endpoint => `<li><code>${escapeHtml(endpoint)}</code></li>`).join('')
    : `<li>${escapeHtml(t('label.none'))}</li>`;
}

function renderPortOptions() {
  els.comPortList.innerHTML = state.serialPorts.map(port => `<option value="${escapeHtml(port)}"></option>`).join('');
}

function renderSignals() {
  if (!state.config) return;
  const latestMap = new Map((state.overview?.signals || []).map(item => [item.signal.oscPath, item.latest?.value]));
  const filter = state.filters.signals.trim().toLowerCase();
  els.signalsBody.innerHTML = '';
  state.config.signals.forEach((signal, index) => {
    const haystack = `${signal.oscPath} ${signal.role} ${signal.curve}`.toLowerCase();
    if (filter && !haystack.includes(filter)) return;

    const fragment = els.signalTemplate.content.cloneNode(true);
    const row = qs('tr', fragment);
    Object.entries(signal).forEach(([field, value]) => {
      const input = qs(`[data-field="${field}"]`, row);
      if (!input) return;
      if (input.type === 'checkbox') input.checked = !!value;
      else input.value = value;
    });

    const roleSelect = qs('[data-field="role"]', row);
    roleSelect.innerHTML = enums.roles.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('');
    roleSelect.value = signal.role;

    const curveSelect = qs('[data-field="curve"]', row);
    curveSelect.innerHTML = enums.curves.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('');
    curveSelect.value = signal.curve;

    qs('.latest-value', row).textContent = latestMap.has(signal.oscPath) ? Number(latestMap.get(signal.oscPath)).toFixed(4) : '-';
    row.querySelectorAll('input, select').forEach(input => {
      input.addEventListener('change', () => {
        const field = input.dataset.field;
        state.config.signals[index][field] = input.type === 'checkbox' ? input.checked : input.type === 'number' ? Number(input.value) : input.value;
      });
    });
    const removeBtn = qs('.remove-row', row);
    removeBtn.textContent = t('btn.delete');
    removeBtn.addEventListener('click', () => {
      state.config.signals.splice(index, 1);
      renderSignals();
    });
    els.signalsBody.appendChild(fragment);
  });
}

function collectConfig() {
  return {
    ...state.config,
    webUi: {
      host: readInput('webUi.host'),
      port: readInput('webUi.port'),
      autoOpenBrowser: state.config?.webUi?.autoOpenBrowser ?? false,
      title: DEFAULT_TITLE,
    },
    osc: {
      receiverPort: readInput('osc.receiverPort'),
    },
    tCode: {
      comPort: readInput('tCode.comPort'),
      minPos: readInput('tCode.minPos'),
      maxPos: readInput('tCode.maxPos'),
      maxVelocity: readInput('tCode.maxVelocity'),
      updatesPerSecond: readInput('tCode.updatesPerSecond'),
      enabled: readInput('tCode.enabled'),
      preferSpeedMode: readInput('tCode.preferSpeedMode'),
      l0Invert: readInput('tCode.l0Invert'),
    },
    intiface: {
      websocketAddress: readInput('intiface.websocketAddress'),
      port: readInput('intiface.port'),
      enabled: readInput('intiface.enabled'),
      manageEngineProcess: readInput('intiface.manageEngineProcess'),
    },
    safety: {
      globalIntensityCap: readInput('safety.globalIntensityCap'),
      rampUpMs: readInput('safety.rampUpMs'),
      idle: readInput('safety.idle'),
      emergencyStopKey: readInput('safety.emergencyStopKey'),
    },
    rhythm: {
      enabled: readInput('rhythm.enabled'),
      windowMs: readInput('rhythm.windowMs'),
      minBpm: readInput('rhythm.minBpm'),
      maxBpm: readInput('rhythm.maxBpm'),
    },
    signals: state.config.signals,
    deviceRoutes: state.config.deviceRoutes || [],
  };
}

function renderRecordingSummary() {
  const recording = state.overview?.recording;
  if (!recording) return;
  els.recordingInfo.textContent = t('recording.summary', {
    state: recording.isActive ? t('recording.active') : t('recording.inactive'),
    count: String(recording.frameCount),
  });
}

function renderDeviceOpsSummary() {
  if (!els.deviceOpsSummary || !state.overview) return;
  const overview = state.overview;
  const chips = [
    [t('label.loop'), overview.loop.isRunning ? t('status.running') : t('status.stopped')],
    [t('label.emergency'), overview.loop.isEmergency ? t('status.triggered') : t('status.normal')],
    [t('label.manual'), overview.loop.manualOverrideEnabled ? t('status.enabled') : t('status.disabled')],
    [t('label.recording'), overview.recording.isActive ? t('recording.active') : t('recording.inactive')],
  ];
  els.deviceOpsSummary.innerHTML = chips.map(([label, value]) => `<div class="device-chip"><strong>${escapeHtml(label)}</strong><span>${escapeHtml(value)}</span></div>`).join('');
}

function renderScriptCanvas() {
  if (!els.scriptCanvas) return;
  const ctx = els.scriptCanvas.getContext('2d');
  if (!ctx) return;
  const cssWidth = els.scriptCanvas.clientWidth || 960;
  const cssHeight = 260;
  const dpr = window.devicePixelRatio || 1;
  els.scriptCanvas.width = Math.round(cssWidth * dpr);
  els.scriptCanvas.height = Math.round(cssHeight * dpr);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);

  const width = cssWidth;
  const height = cssHeight;
  ctx.clearRect(0, 0, width, height);

  const player = state.scriptPlayer;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = 'rgba(0,0,0,0.06)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 5; i += 1) {
    const y = 24 + ((height - 48) / 4) * i;
    ctx.beginPath();
    ctx.moveTo(16, y);
    ctx.lineTo(width - 16, y);
    ctx.stroke();
  }

  if (!player.points.length || player.durationMs <= 0) {
    ctx.fillStyle = '#5e6673';
    ctx.font = '14px Segoe UI';
    ctx.fillText(t('scripts.timeline.empty'), 24, height / 2);
    return;
  }

  const plotLeft = 20;
  const plotTop = 20;
  const plotWidth = width - 40;
  const plotHeight = height - 44;

  ctx.lineWidth = 3;
  ctx.strokeStyle = '#0052d9';
  ctx.beginPath();
  player.points.forEach((point, index) => {
    const x = plotLeft + (point.ms / player.durationMs) * plotWidth;
    const y = plotTop + (1 - point.value) * plotHeight;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  const currentX = plotLeft + ((player.currentMs || 0) / player.durationMs) * plotWidth;
  ctx.strokeStyle = 'rgba(227,77,89,0.9)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(currentX, plotTop);
  ctx.lineTo(currentX, plotTop + plotHeight);
  ctx.stroke();

  const currentY = plotTop + (1 - getScriptValueAt(player.currentMs || 0)) * plotHeight;
  ctx.fillStyle = '#e34d59';
  ctx.beginPath();
  ctx.arc(currentX, currentY, 5, 0, Math.PI * 2);
  ctx.fill();
}

function renderScriptPlayer() {
  if (!els.scriptStatusBadge || !els.scriptTimeLabel || !els.scriptMeta || !els.scriptTimelineList || !els.scriptSummaryGrid) return;
  const player = state.scriptPlayer;
  const points = player.points || [];
  const density = player.durationMs > 0 ? (points.length / Math.max(player.durationMs / 1000, 1)).toFixed(1) : '0.0';
  const statusKey = !points.length ? 'scripts.player.empty' : player.isPlaying ? 'scripts.player.playing' : player.currentMs > 0 ? 'scripts.player.paused' : 'scripts.player.empty';

  els.scriptStatusBadge.textContent = t(statusKey);
  els.scriptRecordingBadge.textContent = state.overview?.recording?.isActive ? t('recording.active') : t('recording.inactive');
  els.scriptTimeLabel.textContent = `${formatDuration(player.currentMs)} / ${formatDuration(player.durationMs)}`;

  const metaText =
    player.source === 'recording'
      ? t('scripts.meta.recording', { count: String(points.length), duration: formatDuration(player.durationMs) })
      : player.source === 'imported'
        ? t('scripts.meta.imported', { name: player.name || 'script', count: String(points.length), duration: formatDuration(player.durationMs) })
        : t('scripts.meta.empty');
  els.scriptMeta.textContent = metaText;

  const summary = [
    [t('scripts.summary.source'), formatScriptSource(player.source)],
    [t('scripts.summary.points'), String(points.length)],
    [t('scripts.summary.duration'), formatDuration(player.durationMs)],
    [t('scripts.summary.position'), `${formatDuration(player.currentMs)} · ${Math.round(getScriptValueAt(player.currentMs) * 100)}%`],
  ];
  els.scriptSummaryGrid.innerHTML = summary
    .map(([label, value]) => `<div class="stat"><div class="stat-label">${escapeHtml(label)}</div><div class="stat-value">${escapeHtml(value)}</div></div>`)
    .join('');

  if (!points.length) {
    els.scriptTimelineList.innerHTML = `<article class="diagnostic-item"><strong>${escapeHtml(t('scripts.timeline.title'))}</strong><div>${escapeHtml(t('scripts.timeline.empty'))}</div></article>`;
  } else {
    const cards = [
      [t('scripts.timeline.source'), formatScriptSource(player.source)],
      [t('scripts.timeline.frames'), String(points.length)],
      [t('scripts.timeline.density'), `${density} / s`],
      [t('scripts.timeline.range'), `${formatDuration(points[0]?.ms || 0)} → ${formatDuration(player.durationMs)}`],
      [t('scripts.timeline.preview'), `${formatDuration(player.currentMs)} · ${Math.round(getScriptValueAt(player.currentMs) * 100)}%`],
    ];
    els.scriptTimelineList.innerHTML = cards.map(([title, body]) => `<article class="diagnostic-item ok"><strong>${escapeHtml(title)}</strong><div>${escapeHtml(body)}</div></article>`).join('');
  }
  renderScriptCanvas();
}

function renderScripts() {
  renderRecordingSummary();
  renderScriptPlayer();
}

function renderParameters() {
  const filter = state.filters.parameters.trim().toLowerCase();
  els.parametersBody.innerHTML = state.parameters
    .filter(item => !filter || `${item.path} ${item.type}`.toLowerCase().includes(filter))
    .slice(0, 300)
    .map(
      item =>
        `<tr><td>${escapeHtml(item.path)}</td><td>${Number(item.value).toFixed(4)}</td><td>${escapeHtml(item.type)}</td><td>${escapeHtml(new Date(item.timestampMs).toLocaleTimeString())}</td></tr>`,
    )
    .join('');
}

function renderLogs() {
  const filter = state.filters.logs.trim().toLowerCase();
  els.logPanel.textContent = state.logs
    .filter(item => !filter || item.message.toLowerCase().includes(filter))
    .map(item => `[${new Date(item.timestamp).toLocaleTimeString()}] ${item.message}`)
    .join('\n');
  els.logPanel.scrollTop = els.logPanel.scrollHeight;
}

function renderDiagnostics() {
  if (!state.overview) return;
  const overview = state.overview;
  const diagnostics = [];
  const logText = state.logs.map(item => item.message).join('\n');
  if (!overview.loop.isRunning) diagnostics.push({ type: 'warn', title: t('diag.loopStopped.title'), body: t('diag.loopStopped.body') });
  if (overview.loop.isEmergency) diagnostics.push({ type: 'error', title: t('diag.emergency.title'), body: t('diag.emergency.body') });
  if (!overview.intiface.connected && /intiface-engine\.exe not found/i.test(logText)) diagnostics.push({ type: 'warn', title: t('diag.engineMissing.title'), body: t('diag.engineMissing.body') });
  if (!overview.tcode.connected && state.config?.tCode?.enabled) diagnostics.push({ type: 'warn', title: t('diag.tcodeMissing.title'), body: t('diag.tcodeMissing.body') });
  if ((overview.osc.parameterCount || 0) === 0) diagnostics.push({ type: 'warn', title: t('diag.oscMissing.title'), body: t('diag.oscMissing.body') });
  if (!diagnostics.length) diagnostics.push({ type: 'ok', title: t('diag.ok.title'), body: t('diag.ok.body') });
  els.diagnosticsList.innerHTML = diagnostics
    .map(item => `<article class="diagnostic-item ${item.type}"><strong>${escapeHtml(item.title)}</strong><div>${escapeHtml(item.body)}</div></article>`)
    .join('');
}

function buildManualTestMarkup() {
  const sliders = sliderAxes
    .map(
      axis => `
      <div class="slider-wrap">
        <label>${escapeHtml(axis)}<output id="out-${axis}">${Number(sliderDefaults[axis]).toFixed(2)}</output></label>
        <input type="range" id="slider-${axis}" min="0" max="1" step="0.01" value="${sliderDefaults[axis]}" />
      </div>
    `,
    )
    .join('');

  const capabilityChips = getDisplayedDevices().length
    ? getDisplayedDevices()
        .map(device => `<div class="device-chip"><strong>${escapeHtml(device.name)}</strong><span>${escapeHtml(device.model)}</span></div>`)
        .join('')
    : `<div class="empty-state"><strong>${escapeHtml(t('devices.empty.title'))}</strong><div>${escapeHtml(t('devices.empty.body'))}</div></div>`;

  return `
    <div class="callout info">${escapeHtml(t('devices.test.hint'))}</div>
    <div class="section-title-row">
      <div>
        <h3>${escapeHtml(t('devices.manual.title'))}</h3>
        <p class="muted">${escapeHtml(t('devices.manual.desc'))}</p>
      </div>
    </div>
    <div class="slider-grid">${sliders}</div>
    <div class="actions-grid">
      <label class="inline"><input id="manualEnabled" type="checkbox" /> <span>${escapeHtml(t('cb.manualEnabled'))}</span></label>
      <label class="inline"><input id="manualGate" type="checkbox" checked /> <span>${escapeHtml(t('cb.gateOpen'))}</span></label>
      <button id="applyManualBtn" type="button">${escapeHtml(t('btn.applyManual'))}</button>
      <button id="clearManualBtn" type="button">${escapeHtml(t('btn.clearManual'))}</button>
    </div>
    <div class="section-title-row" style="margin-top:16px">
      <div><h3>${escapeHtml(t('devices.capabilities'))}</h3></div>
    </div>
    <div class="device-chip-list">${capabilityChips}</div>
  `;
}

function setSliderValue(axis, value) {
  const slider = document.getElementById(`slider-${axis}`);
  const output = document.getElementById(`out-${axis}`);
  if (!slider || !output) return;
  slider.value = Number(value).toFixed(2);
  output.textContent = Number(value).toFixed(2);
}

function renderDeviceWorkbench() {
  const devices = getDisplayedDevices();
  els.deviceWorkbenchIntro.textContent = state.showMockDevices ? t('devices.mock.enabled') : t('devices.mock.disabled');
  els.connectedDeviceDeck.innerHTML = devices.length
    ? devices.map(device => buildDeviceCard(device, 'devices')).join('')
    : `<div class="empty-state"><strong>${escapeHtml(t('devices.empty.title'))}</strong><div>${escapeHtml(t('devices.empty.body'))}</div></div>`;
  els.deviceTestZone.innerHTML = buildManualTestMarkup();
  bindDeviceWorkbenchActions();
  syncManualControls();
}

function syncManualControls() {
  const manualCommand = state.overview?.loop?.manualCommand;
  const enabled = state.overview?.loop?.manualOverrideEnabled;
  const manualEnabled = document.getElementById('manualEnabled');
  const manualGate = document.getElementById('manualGate');
  if (manualEnabled) manualEnabled.checked = !!enabled;
  if (!manualCommand) {
    sliderAxes.forEach(axis => setSliderValue(axis, sliderDefaults[axis]));
    if (manualGate) manualGate.checked = true;
    return;
  }
  if (manualGate) manualGate.checked = manualCommand.gateOpen ?? true;
  setSliderValue('L0', manualCommand.l0 ?? sliderDefaults.L0);
  setSliderValue('R0', manualCommand.r0 ?? sliderDefaults.R0);
  setSliderValue('R1', manualCommand.r1 ?? sliderDefaults.R1);
  setSliderValue('R2', manualCommand.r2 ?? sliderDefaults.R2);
  setSliderValue('L1', manualCommand.l1 ?? sliderDefaults.L1);
  setSliderValue('L2', manualCommand.l2 ?? sliderDefaults.L2);
  setSliderValue('Vibrate', manualCommand.vibrate ?? sliderDefaults.Vibrate);
}

function bindDeviceWorkbenchActions() {
  sliderAxes.forEach(axis => {
    const slider = document.getElementById(`slider-${axis}`);
    const output = document.getElementById(`out-${axis}`);
    if (slider && output) {
      slider.addEventListener('input', () => {
        output.textContent = Number(slider.value).toFixed(2);
      });
    }
  });

  const manualApplyBtn = document.getElementById('applyManualBtn');
  if (manualApplyBtn) {
    manualApplyBtn.onclick = async () => {
      const payload = {
        enabled: document.getElementById('manualEnabled')?.checked ?? false,
        gateOpen: document.getElementById('manualGate')?.checked ?? true,
        l0: Number(document.getElementById('slider-L0')?.value ?? 0),
        r0: Number(document.getElementById('slider-R0')?.value ?? 0.5),
        r1: Number(document.getElementById('slider-R1')?.value ?? 0.5),
        r2: Number(document.getElementById('slider-R2')?.value ?? 0.5),
        l1: Number(document.getElementById('slider-L1')?.value ?? 0.5),
        l2: Number(document.getElementById('slider-L2')?.value ?? 0.5),
        vibrate: Number(document.getElementById('slider-Vibrate')?.value ?? 0),
      };
      await api('/api/manual-test', { method: 'PUT', body: JSON.stringify(payload) });
      await refreshAll();
      showToast(t('toast.actionSuccess'), t('btn.applyManual'));
    };
  }

  const manualClearBtn = document.getElementById('clearManualBtn');
  if (manualClearBtn) {
    manualClearBtn.onclick = async () => {
      await api('/api/manual-test', { method: 'DELETE' });
      await refreshAll();
      showToast(t('toast.actionSuccess'), t('btn.clearManual'));
    };
  }

  qsa('[data-device-action]').forEach(button => {
    button.addEventListener('click', async () => {
      const device = getDisplayedDevices().find(item => item.id === button.dataset.deviceId);
      if (!device) return;
      const action = button.dataset.deviceAction;
      if (action === 'remember') {
        const alias = qs(`[data-memory-field="alias"][data-device-id="${device.id}"]`)?.value || '';
        const note = qs(`[data-memory-field="note"][data-device-id="${device.id}"]`)?.value || '';
        rememberDeviceConfig(device, { alias, note, snapshot: device.snapshot });
        clearDeviceDraft(device);
        renderDeviceWorkbench();
        showToast(t('toast.memorySaved'), t('msg.memorySaved'));
        return;
      }
      if (action === 'reset') {
        clearRememberedConfig(device);
        clearDeviceDraft(device);
        renderDeviceWorkbench();
        showToast(t('toast.memoryCleared'), t('msg.memoryCleared'));
        return;
      }
      if (action === 'park') {
        await postAction('/api/control/tcode/park');
        return;
      }
      if (action === 'scan') {
        await postAction('/api/control/intiface/scan-start');
      }
    });
  });

  qsa('[data-memory-field]').forEach(input => {
    input.addEventListener('input', () => {
      const device = getDisplayedDevices().find(item => item.id === input.dataset.deviceId);
      if (!device) return;
      setDeviceDraft(device, { [input.dataset.memoryField]: input.value });
    });
  });
}

function renderConnectionFilter() {
  qsa('[data-connection-filter]').forEach(button => {
    const active = button.dataset.connectionFilter === state.connectionFilter;
    button.classList.toggle('is-active', active);
  });
  qsa('[data-connection-card]').forEach(card => {
    const matches = state.connectionFilter === 'all' || card.dataset.connectionCard === state.connectionFilter;
    card.style.display = matches ? '' : 'none';
  });
}

function shouldPreferLocalizedActionFailure(path) {
  return path === '/api/control/intiface/connect' || path === '/api/control/tcode/connect';
}

function getActionFailureMessage(path) {
  switch (path) {
    case '/api/control/intiface/connect':
      return t('msg.intifaceConnectFailed');
    case '/api/control/tcode/connect':
      return t('msg.tcodeConnectFailed');
    default:
      return t('msg.actionReportedFailure');
  }
}

async function postAction(path, body = null) {
  try {
    const result = await api(path, body ? { method: 'POST', body: JSON.stringify(body) } : { method: 'POST' });
    if (result && typeof result === 'object' && 'ok' in result && result.ok === false) {
      const localizedMessage = getActionFailureMessage(path);
      const displayMessage = shouldPreferLocalizedActionFailure(path) ? localizedMessage : result.message || localizedMessage;
      showToast(t('toast.actionFailed'), displayMessage, 'error', 4200);
      await refreshAll().catch(() => {});
      return;
    }
    await refreshAll();
    showToast(t('toast.actionSuccess'), result?.message || path);
  } catch (error) {
    showToast(t('toast.actionFailed'), error.message, 'error', 4200);
    throw error;
  }
}

async function refreshSerialPorts(showFeedback = false) {
  state.serialPorts = await api('/api/meta/serial-ports');
  renderPortOptions();
  if (showFeedback) showToast(t('toast.portsRefreshed'), t('msg.portsRefreshed'));
}

function drawDevice(command = {}) {
  const ctx = els.canvas.getContext('2d');
  if (!ctx) return;
  const cssWidth = els.canvas.clientWidth || 960;
  const cssHeight = Math.max(260, Math.min(420, Math.round(cssWidth * 0.36)));
  const dpr = window.devicePixelRatio || 1;
  els.canvas.width = Math.round(cssWidth * dpr);
  els.canvas.height = Math.round(cssHeight * dpr);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);

  const width = cssWidth;
  const height = cssHeight;
  ctx.clearRect(0, 0, width, height);

  const centerX = width / 2 + ((command.l2 ?? 0.5) - 0.5) * 180;
  const centerY = height / 2 - ((command.l1 ?? 0.5) - 0.5) * 120;
  const stroke = command.l0 ?? 0;
  const roll = (((command.r0 ?? 0.5) - 0.5) * Math.PI) / 1.4;
  const pitch = (((command.r1 ?? 0.5) - 0.5) * Math.PI) / 1.4;
  const twist = ((command.r2 ?? 0.5) - 0.5) * Math.PI * 2;

  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.rotate(roll * 0.45);
  const bodyLength = 150 + stroke * 110;
  const bodyWidth = 38 + Math.cos(twist) * 4;
  ctx.fillStyle = 'rgba(101,162,255,0.16)';
  ctx.strokeStyle = 'rgba(101,162,255,0.95)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(-bodyWidth / 2, -bodyLength / 2, bodyWidth, bodyLength, 18);
  ctx.fill();
  ctx.stroke();

  ctx.save();
  ctx.translate(0, -bodyLength / 2);
  ctx.rotate(twist);
  ctx.beginPath();
  ctx.ellipse(0, 0, 26, 15 + Math.abs(pitch) * 10, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(75,216,168,0.18)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(75,216,168,0.92)';
  ctx.stroke();
  ctx.restore();

  ctx.beginPath();
  ctx.moveTo(-75, bodyLength / 2 + 16);
  ctx.lineTo(75, bodyLength / 2 + 16);
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = 'rgba(255,255,255,0.78)';
  ctx.font = '14px Segoe UI';
  ctx.fillText(
    `L0 ${Number(command.l0 ?? 0).toFixed(2)} | R0 ${Number(command.r0 ?? 0.5).toFixed(2)} | R1 ${Number(command.r1 ?? 0.5).toFixed(2)} | R2 ${Number(command.r2 ?? 0.5).toFixed(2)}`,
    16,
    24,
  );
  ctx.fillText(`L1 ${Number(command.l1 ?? 0.5).toFixed(2)} | L2 ${Number(command.l2 ?? 0.5).toFixed(2)} | Vibrate ${Number(command.vibrate ?? 0).toFixed(2)}`, 16, 46);
}

function renderAll() {
  translateDocument();
  renderConfig();
  renderStatus();
  renderSignals();
  renderParameters();
  renderLogs();
  renderDeviceWorkbench();
  renderScripts();
  renderConnectionFilter();
}

async function refreshAll(showFeedback = false) {
  try {
    const [meta, config, overview, parameters, logs, serialPorts, recordingFrames] = await Promise.all([
      api('/api/meta'),
      api('/api/config'),
      api('/api/state/overview'),
      api('/api/state/parameters'),
      api('/api/state/logs'),
      api('/api/meta/serial-ports').catch(() => []),
      api('/api/state/recording/data').catch(() => []),
    ]);
    state.meta = meta;
    state.config = config;
    state.overview = overview;
    state.parameters = parameters;
    state.logs = logs;
    state.serialPorts = serialPorts;
    state.recordingFrames = recordingFrames;

    enums.roles.splice(0, enums.roles.length, ...(meta.enums?.signalRoles || []));
    enums.curves.splice(0, enums.curves.length, ...(meta.enums?.curveTypes || []));
    enums.idleBehaviors.splice(0, enums.idleBehaviors.length, ...(meta.enums?.idleBehaviors || []));
    populateSelect('safety.idle', enums.idleBehaviors);
    renderAll();

    if (showFeedback) showToast(t('toast.refreshSuccess'), overview?.service?.url || location.origin);
  } catch (error) {
    showToast(t('toast.refreshFailed'), error.message, 'error', 3600);
    throw error;
  }
}

function bindActions() {
  qsa('[data-tab-target]').forEach(button => button.addEventListener('click', () => setActiveTab(button.dataset.tabTarget)));
  qsa('[data-connection-filter]').forEach(button => {
    button.addEventListener('click', () => {
      state.connectionFilter = button.dataset.connectionFilter;
      renderConnectionFilter();
    });
  });
  qsa('[data-action]').forEach(button => button.addEventListener('click', async () => postAction(button.dataset.action)));

  els.refreshBtn.addEventListener('click', () => refreshAll());
  els.applyConfigBtn.addEventListener('click', async () => {
    state.config = collectConfig();
    await api('/api/config', { method: 'PUT', body: JSON.stringify(state.config) });
    await refreshAll();
    showToast(t('toast.applied'), t('msg.applied'));
  });
  els.saveConfigBtn.addEventListener('click', async () => {
    await refreshAll(true);
  });
  els.addSignalBtn.addEventListener('click', () => {
    if (!state.config) return;
    state.config.signals.push({
      oscPath: '',
      invertDirection: false,
      vrchatMin: 0,
      vrchatMax: 1,
      smoothingAlpha: 0.7,
      deadZone: 0.01,
      curve: enums.curves[0] || 'Linear',
      role: enums.roles[0] || 'Depth',
      isOgbSocket: false,
      isOgbPlug: false,
    });
    renderSignals();
    showToast(t('toast.signalAdded'), t('msg.signalAdded'));
  });
  els.signalFilterInput.addEventListener('input', event => {
    state.filters.signals = event.target.value;
    renderSignals();
  });
  els.parameterFilterInput.addEventListener('input', event => {
    state.filters.parameters = event.target.value;
    renderParameters();
  });
  els.logFilterInput.addEventListener('input', event => {
    state.filters.logs = event.target.value;
    renderLogs();
  });
  els.copyDiagnosticsBtn.addEventListener('click', async () => {
    const text = qsa('.diagnostic-item', els.diagnosticsList)
      .map(item => item.textContent.trim())
      .join('\n');
    try {
      await navigator.clipboard.writeText(text);
      showToast(t('toast.diagCopied'), t('msg.diagCopied'));
    } catch {
      showToast(t('toast.actionFailed'), t('toast.copyFailed'), 'error');
    }
  });
  els.langToggleBtn.addEventListener('click', toggleLanguage);
  els.themeToggleBtn.addEventListener('click', cycleTheme);
  els.refreshPortsBtn.addEventListener('click', async () => {
    try {
      await refreshSerialPorts(true);
    } catch (error) {
      showToast(t('toast.actionFailed'), error.message, 'error');
    }
  });
  els.exportRecordingBtn.addEventListener('click', async () => {
    try {
      const result = await api('/api/control/recording/export', { method: 'POST' });
      showToast(t('toast.exportDone'), result.path || t('msg.noRecording'), result.path ? 'success' : 'error', 5000);
      await refreshAll();
    } catch (error) {
      showToast(t('toast.actionFailed'), error.message, 'error', 5000);
    }
  });
  els.useRecordingScriptBtn?.addEventListener('click', () => {
    useRecordingDataset();
    showToast(t('toast.scriptLoaded'), t('msg.scriptLoaded'));
  });
  els.clearScriptBtn?.addEventListener('click', () => {
    setScriptDataset({ source: 'empty', name: '', points: [], durationMs: 0 });
    showToast(t('toast.scriptCleared'), t('msg.scriptCleared'));
  });
  els.scriptFileInput?.addEventListener('change', async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = parseFunscriptText(text);
      setScriptDataset({ source: 'imported', name: file.name, points: parsed.points, durationMs: parsed.durationMs });
      showToast(t('toast.scriptLoaded'), t('msg.scriptLoaded'));
    } catch (error) {
      showToast(t('toast.scriptFailed'), error.message || t('msg.scriptInvalid'), 'error', 4000);
    }
  });
  els.scriptPlayBtn?.addEventListener('click', () => {
    const player = state.scriptPlayer;
    if (!player.points.length || player.durationMs <= 0) return;
    if (player.currentMs >= player.durationMs) player.currentMs = 0;
    player.isPlaying = true;
    player.baselineMs = player.currentMs;
    player.startedAtMs = performance.now();
    if (player.rafId) cancelAnimationFrame(player.rafId);
    player.rafId = requestAnimationFrame(scriptTick);
    renderScriptPlayer();
  });
  els.scriptPauseBtn?.addEventListener('click', () => {
    stopScriptPlayback();
    renderScriptPlayer();
  });
  els.scriptStopBtn?.addEventListener('click', () => {
    stopScriptPlayback();
    setScriptCurrentMs(0);
  });
  els.scriptSeekInput?.addEventListener('input', event => {
    const ratio = Number(event.target.value) / 1000;
    stopScriptPlayback();
    setScriptCurrentMs((state.scriptPlayer.durationMs || 0) * ratio);
  });
  els.mockDevicesToggleBtn.addEventListener('click', () => {
    state.showMockDevices = !state.showMockDevices;
    localStorage.setItem(MOCK_TOGGLE_KEY, String(state.showMockDevices));
    renderAll();
    showToast(t('toast.mockChanged'), t('msg.mockChanged'));
  });
  window.addEventListener('resize', () => {
    if (state.overview) drawDevice(state.overview.loop.command);
    renderScriptCanvas();
  });
}

function connectWs() {
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${protocol}://${location.host}/api/ws`);
  ws.addEventListener('open', () => {
    state.wsRetryMs = 1000;
    setWsConnected(true);
    renderStatus();
  });
  ws.addEventListener('close', () => {
    setWsConnected(false);
    renderStatus();
    setTimeout(connectWs, state.wsRetryMs);
    state.wsRetryMs = Math.min(Math.round(state.wsRetryMs * 1.8), 10000);
  });
  ws.addEventListener('message', event => {
    const payload = JSON.parse(event.data);
    if (payload.type !== 'state') return;
    state.overview = payload.data;
    state.logs = payload.logs;
    renderStatus();
    renderSignals();
    renderLogs();
    renderDeviceWorkbench();
    renderDeviceOpsSummary();
    renderScripts();
  });
}

function startBackgroundRefresh() {
  setInterval(() => {
    refreshAll().catch(() => {});
  }, 8000);
}

applyTheme(state.theme);
translateDocument();
bindActions();
setActiveTab(state.activeTab);
setWsConnected(false);
await refreshAll().catch(() => {});
useRecordingDataset();
connectWs();
startBackgroundRefresh();
