const THEMES = ['dark', 'amoled', 'purple', 'emerald', 'light'];
const LANGUAGES = ['zh-CN', 'en'];

const I18N = {
  'zh-CN': {
    'hero.desc': 'HTTP + WebSocket 本地控制台，覆盖配置、状态、功能测试、录制导出、诊断与快速上手说明。',
    'btn.menu': '菜单',
    'btn.refresh': '刷新状态',
    'btn.save': '保存配置',
    'btn.startLoop': '启动 Loop',
    'btn.stopLoop': '停止 Loop',
    'btn.emergencyStop': '紧急停止',
    'btn.clearEmergency': '清除紧急停止',
    'btn.copyDiag': '复制诊断摘要',
    'btn.apply': '应用配置',
    'btn.writeDisk': '写入磁盘',
    'btn.addSignal': '新增信号',
    'btn.applyManual': '应用手动测试',
    'btn.clearManual': '清除手动测试',
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
    'label.loop': 'Loop',
    'label.emergency': 'Emergency',
    'label.params': '参数数量',
    'label.recording': '录制',
    'label.manual': '手动测试',
    'label.output': '输出',
    'label.devices': '设备',
    'label.port': '串口',
    'label.mode': '模式',
    'label.engine': '引擎',
    'label.address': '地址',
    'label.frames': '帧数',
    'label.none': '无',
    'label.noDevices': '暂无设备',
    'label.auto': '自动连接',
    'label.on': '开',
    'label.off': '关',
    'label.speed': '速度模式',
    'label.interval': '区间模式',
    'label.managed': '托管',
    'label.external': '外部',
    'label.connectedCount': '已连接 {count} 台',
    'toast.refreshFailed': '刷新失败',
    'toast.refreshSuccess': '状态已刷新',
    'toast.saved': '配置已保存',
    'toast.applied': '配置已应用',
    'toast.actionSuccess': '操作成功',
    'toast.actionFailed': '操作失败',
    'toast.signalAdded': '已新增信号',
    'toast.manualApplied': '手动测试已应用',
    'toast.manualCleared': '手动测试已清除',
    'toast.exportDone': '导出完成',
    'toast.diagCopied': '诊断已复制',
    'toast.themeChanged': '主题已切换',
    'toast.langChanged': '界面语言已切换',
    'toast.portsRefreshed': '串口列表已刷新',
    'toast.copyFailed': '复制失败，请手动复制。',
    'msg.saved': '当前配置已写入本地磁盘。',
    'msg.applied': '热更新已提交到服务端。',
    'msg.signalAdded': '请填写 OSC Path 并选择合适的 Role。',
    'msg.manualApplied': '当前输出已切换到手动覆盖模式。',
    'msg.manualCleared': '服务已恢复使用实时融合输出。',
    'msg.noRecording': '没有可导出的录制数据',
    'msg.portsRefreshed': '可用 COM 口已重新枚举。',
    'msg.diagCopied': '可以直接贴给协作者或用于提 issue。',
    'msg.themeChanged': '新的配色已经生效。',
    'msg.langChanged': '当前界面文案已按所选语言刷新。',
    'diag.loopStopped.title': 'Loop 当前未运行',
    'diag.loopStopped.body': '不会继续向设备发送融合后的命令。若这是意外情况，请点击“启动 Loop”。',
    'diag.emergency.title': 'Emergency Stop 已触发',
    'diag.emergency.body': '设备输出会被强制压制。确认安全后可清除紧急停止。',
    'diag.engineMissing.title': '未找到内置 Intiface 引擎',
    'diag.engineMissing.body': '如果你依赖 Buttplug 设备，请放置 intiface-engine.exe，或关闭内置托管并手动启动 Intiface Central。',
    'diag.tcodeMissing.title': 'TCode 自动连接已启用但未连接',
    'diag.tcodeMissing.body': '请确认 COM 口正确、串口未被占用，并可用“测试”页按钮手动重连。',
    'diag.oscMissing.title': '尚未收到 OSC 参数',
    'diag.oscMissing.body': '检查 VRChat 是否启用 OSC、端口是否为 9001、以及当前头像是否确实带有 Sensa 组件。',
    'diag.ok.title': '运行状态良好',
    'diag.ok.body': '当前没有发现明显的连接或运行时问题，可以继续做信号校准或设备测试。',
    'recording.summary': '当前录制状态：{state}，累计 {count} 帧。',
    'recording.active': '录制中',
    'recording.inactive': '未录制',
    'btn.delete': '删除',
    'cb.manualEnabled': '启用手动覆盖',
    'cb.gateOpen': 'GateOpen',
    'nav.overview': '总览',
    'nav.config': '配置',
    'nav.testing': '测试',
    'nav.monitoring': '监控',
    'nav.help': '说明',
    'side.summary': '当前摘要',
    'side.quickActions': '快速操作',
    'overview.title': '快速上手',
    'overview.desc': '从第一次启动到第一次设备动作，这里是一条最短路径。',
    'overview.badge': '适合首次使用',
    'overview.step1': '确认 VRChat 已开启 OSC，默认向 <code>127.0.0.1:9001</code> 发送头像参数。',
    'overview.step2': '在"总览"页检查 Loop、TCode、Intiface、Recording 的当前状态。',
    'overview.step3': '在"配置"页填写信号路径、角色和设备连接配置。',
    'overview.step4': '在"测试"页用手动覆盖直接验证 OSR2 / SR6 / OSR6 的轴向和振动。',
    'overview.step5': '在"监控"页确认参数流、日志和录制链路都工作正常。',
    'overview.hint': '提示：修改 OSC 端口后建议重启服务；其余大部分配置支持热更新。',
    'overview.status': '服务状态',
    'overview.diag': '实时诊断',
    'overview.diagDesc': '根据运行状态和最近日志自动汇总常见问题。',
    'overview.preview': '3D 设备预览',
    'overview.previewDesc': '用于观察主冲程、姿态和偏移是否符合预期，移动端同样可用。',
    'config.title': '配置总览',
    'config.desc': '所有主要配置都可以在这里热更新；保存后会写入本地配置文件。',
    'cfg.webui': 'WebUI',
    'cfg.webui.title': '标题',
    'cfg.webui.host': 'Host',
    'cfg.webui.port': 'Port',
    'cfg.webui.autoOpen': '自动打开浏览器',
    'cfg.osc': 'OSC',
    'cfg.osc.port': 'ReceiverPort',
    'cfg.tcode': 'TCode 串口设备',
    'cfg.tcode.sub': 'OSR2 / SR6 / OSR6',
    'cfg.tcode.comPort': '串口号 (COM Port)',
    'cfg.tcode.minPos': 'MinPos',
    'cfg.tcode.maxPos': 'MaxPos',
    'cfg.tcode.maxVel': 'MaxVelocity',
    'cfg.tcode.ups': 'UpdatesPerSecond',
    'cfg.tcode.enabled': '启用 TCode 自动连接',
    'cfg.tcode.speedMode': '优先速度模式',
    'cfg.tcode.l0inv': 'L0 反向',
    'cfg.intiface': 'Intiface / Buttplug',
    'cfg.intiface.sub': 'Bluetooth 设备',
    'cfg.intiface.wsAddr': 'WebSocket 地址',
    'cfg.intiface.port': 'Port',
    'cfg.intiface.enabled': '启用 Intiface 自动连接',
    'cfg.intiface.manage': '托管 intiface-engine',
    'cfg.safety': 'Safety',
    'cfg.safety.cap': 'GlobalIntensityCap',
    'cfg.safety.ramp': 'RampUpMs',
    'cfg.safety.idle': 'Idle',
    'cfg.safety.estop': 'EmergencyStopKey',
    'cfg.rhythm': 'Rhythm',
    'cfg.rhythm.enabled': '启用 BPM 检测',
    'cfg.rhythm.window': 'WindowMs',
    'cfg.rhythm.minBpm': 'MinBpm',
    'cfg.rhythm.maxBpm': 'MaxBpm',
    'signals.title': '信号配置',
    'signals.desc': '支持直接新增、删除、筛选与编辑。适合快速构建不同玩法的信号矩阵。',
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
    'test.manual.title': '手动功能测试',
    'test.manual.desc': '覆盖实时融合输出，适合验证轴向、回中位置、振动和 Gate 行为。',
    'test.manual.badge': '经过 SafetySystem',
    'test.tcode.title': 'TCode 设备控制',
    'test.tcode.desc': '串口 OSR2 / SR6 / OSR6 设备的连接管理，仅在 TCode 配置启用时生效。',
    'test.intiface.title': 'Intiface / Buttplug',
    'test.intiface.desc': '托管或外部 Intiface Central 中的 Buttplug 设备管理。',
    'test.intiface.devicesTitle': '已发现的设备',
    'test.recording.title': '录制与导出',
    'test.recording.hint': '导出前会自动做 Ramer-Douglas-Peucker 简化，适合直接丢给支持 <code>.funscript</code> 的播放器或工具链。',
    'monitor.params.title': '参数流',
    'monitor.params.desc': '显示最近收到的 OSC 参数快照，可用来快速检查路径拼写是否正确。',
    'monitor.params.filter': '搜索参数路径 / 类型',
    'monitor.logs.title': '日志',
    'monitor.logs.desc': '用于定位连接失败、配置问题、紧急停止、录制链路等运行时信息。',
    'monitor.logs.filter': '搜索日志关键字',
    'help.title': '上手建议',
    'help.tip1.title': '1. 先跑通最短链路',
    'help.tip1.body': '优先验证：Loop 运行 → 手动测试有反应 → TCode / Intiface 连接成功 → 再接入 VRChat OSC。',
    'help.tip2.title': '2. 先做粗校准',
    'help.tip2.body': '信号先把 <code>VrchatMin / VrchatMax</code> 调到能覆盖输入范围，再微调 <code>Dead Zone</code> 和 <code>Smoothing α</code>。',
    'help.tip3.title': '3. 手机端也能用',
    'help.tip3.body': '移动端采用底部 Tab 导航，适合放在第二屏或远程桌面窗口中当控制面板。',
    'help.tip4.title': '4. 多主题 / i18n',
    'help.tip4.body': '右上角可切换 ZH / EN 界面语言以及配色主题（深蓝、AMOLED、紫色、翠绿、亮色）。',
    'help.endpoints.title': '当前端点',
    'help.limits.title': '当前实现边界',
    'help.limit1.title': 'OSC 端口热更新：',
    'help.limit1.body': '修改后建议重启服务。',
    'help.limit2.title': 'Intiface 内嵌引擎：',
    'help.limit2.body': '如果本地没有 <code>intiface-engine.exe</code>，系统会跳过连接而不是阻塞其它功能。',
    'help.limit3.title': 'Angle Raw：',
    'help.limit3.body': '当前不会自动做 <code>Right - Left</code> 之类的差值重建；若要更真实的角度，请在上游参数层先计算。',
    'col.path': 'Path',
    'col.value': 'Value',
    'col.type': 'Type',
    'col.time': 'Timestamp',
    'cfg.tcode.refreshPorts': '刷新',
    'help.endpoints.none': '暂无端点信息',
    'ws.disconnected': 'WS 未连接',
    'tip.refresh': '立即重新拉取全部状态与配置',
    'tip.save': '把当前配置写入本地配置文件',
    'tip.startLoop': '启动主循环，开始持续处理信号并向设备输出',
    'tip.stopLoop': '停止主循环，暂停自动输出',
    'tip.emergencyStop': '立刻进入紧急停止，压制设备输出',
    'tip.clearEmergency': '在确认安全后清除紧急停止状态',
    'tip.copyDiag': '复制当前诊断摘要，便于反馈问题',
    'tip.receiverPort': 'VRChat OSC 默认会把参数发到 127.0.0.1:9001',
    'tip.comPort': '选择或手动输入 TCode 设备对应的 COM 端口',
    'tip.refreshPorts': '重新枚举本机当前可见的 COM 端口',
    'tip.minPos': '归一化 0 对应的设备位置，单位为千分位',
    'tip.maxPos': '归一化 1 对应的设备位置，单位为千分位',
    'tip.maxVelocity': '速度模式下允许的最大 TCode Sxxxx 值上限（按每 100ms 的幅值刻度计）',
    'tip.ups': '主循环与 TCode 发送的目标更新频率',
    'tip.tcodeEnabled': '启动 Companion 时自动尝试连接 TCode 设备',
    'tip.speedMode': '优先使用 Sxxxx 速度项；关闭后改用 Ixxxx 时间项',
    'tip.l0inv': '当设备主冲程方向相反时启用',
    'tip.wsAddr': 'Intiface / Buttplug 服务器的 WebSocket 地址',
    'tip.intifacePort': '内置引擎托管时使用的端口',
    'tip.intifaceEnabled': '启动 Companion 时自动尝试连接 Intiface',
    'tip.manageEngine': '自动启动并管理本地 intiface-engine.exe',
    'tip.intensityCap': 'SafetySystem 对 L0 与 Vibrate 的全局强度上限',
    'tip.rampUp': '从静止到可活动输出的渐进时间',
    'tip.idle': '无活动或 Gate 关闭后的输出策略',
    'tip.estopKey': '预留给本地紧急停止输入的按键标识',
    'tip.bpmEnabled': '启用后会对主深度节奏做 BPM 检测',
    'tip.bpmWindow': '用于节奏统计的滑动窗口长度',
    'tip.minBpm': '可接受的最小 BPM',
    'tip.maxBpm': '可接受的最大 BPM',
    'tip.addSignal': '向信号表新增一条空配置',
    'tip.oscPath': '不含 /avatar/parameters/ 前缀的 OSC 参数路径',
    'tip.role': '该信号在融合时承担的角色',
    'tip.curve': '信号非线性映射曲线',
    'tip.sigMin': 'VRChat 原始输入的最小标定值',
    'tip.sigMax': 'VRChat 原始输入的最大标定值',
    'tip.alpha': 'EMA 平滑系数，越小越平滑',
    'tip.deadZone': '低于该值的输出直接视为 0',
    'tip.invert': '反转该信号的输入方向',
    'tip.manualEnabled': '启用后使用手动值覆盖实时融合输出',
    'tip.gateOpen': '关闭时按当前 Safety Idle 策略处理输出',
    'tip.applyManual': '把当前滑块值写入手动测试覆盖',
    'tip.clearManual': '移除手动测试覆盖，恢复实时信号',
    'tip.connectTCode': '立即尝试连接当前配置的 TCode 串口设备',
    'tip.disconnectTCode': '断开当前 TCode 串口设备',
    'tip.parkTCode': '向 TCode 设备发送回中 / 停放命令',
    'tip.connectIntiface': '立即尝试连接 Intiface / Buttplug 服务器',
    'tip.disconnectIntiface': '断开当前 Intiface 连接',
    'tip.scanStart': '开始扫描可配对的 Buttplug 设备',
    'tip.scanStop': '停止扫描 Buttplug 设备',
    'tip.startRecording': '开始记录当前 L0 轨迹用于导出',
    'tip.stopRecording': '停止当前录制',
    'tip.exportFunscript': '把已录制轨迹导出为 .funscript',
    'tip.lang': '切换中文 / English',
    'tip.theme': '切换主题',
  },
  en: {
    'hero.desc': 'A local HTTP + WebSocket console for configuration, status, functional testing, recording/export, diagnostics, and quick-start guidance.',
    'btn.menu': 'Menu',
    'btn.refresh': 'Refresh State',
    'btn.save': 'Save Config',
    'btn.startLoop': 'Start Loop',
    'btn.stopLoop': 'Stop Loop',
    'btn.emergencyStop': 'Emergency Stop',
    'btn.clearEmergency': 'Clear Emergency',
    'btn.copyDiag': 'Copy Diagnostics',
    'btn.apply': 'Apply Config',
    'btn.writeDisk': 'Write to Disk',
    'btn.addSignal': 'Add Signal',
    'btn.applyManual': 'Apply Manual Test',
    'btn.clearManual': 'Clear Manual Test',
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
    'label.loop': 'Loop',
    'label.emergency': 'Emergency',
    'label.params': 'Parameters',
    'label.recording': 'Recording',
    'label.manual': 'Manual Test',
    'label.output': 'Output',
    'label.devices': 'Devices',
    'label.port': 'Port',
    'label.mode': 'Mode',
    'label.engine': 'Engine',
    'label.address': 'Address',
    'label.frames': 'Frames',
    'label.none': 'None',
    'label.noDevices': 'No devices',
    'label.auto': 'Auto-connect',
    'label.on': 'On',
    'label.off': 'Off',
    'label.speed': 'Speed Mode',
    'label.interval': 'Interval Mode',
    'label.managed': 'Managed',
    'label.external': 'External',
    'label.connectedCount': '{count} connected',
    'toast.refreshFailed': 'Refresh failed',
    'toast.refreshSuccess': 'State refreshed',
    'toast.saved': 'Configuration saved',
    'toast.applied': 'Configuration applied',
    'toast.actionSuccess': 'Action completed',
    'toast.actionFailed': 'Action failed',
    'toast.signalAdded': 'Signal added',
    'toast.manualApplied': 'Manual test applied',
    'toast.manualCleared': 'Manual test cleared',
    'toast.exportDone': 'Export complete',
    'toast.diagCopied': 'Diagnostics copied',
    'toast.themeChanged': 'Theme changed',
    'toast.langChanged': 'Language changed',
    'toast.portsRefreshed': 'Serial ports refreshed',
    'toast.copyFailed': 'Copy failed. Please copy manually.',
    'msg.saved': 'The current configuration has been written to disk.',
    'msg.applied': 'The live configuration has been submitted to the service.',
    'msg.signalAdded': 'Fill in the OSC path and choose an appropriate role.',
    'msg.manualApplied': 'The output has been switched to manual override.',
    'msg.manualCleared': 'The service has resumed live fused output.',
    'msg.noRecording': 'No recording data available',
    'msg.portsRefreshed': 'The available COM ports were enumerated again.',
    'msg.diagCopied': 'You can paste this directly into a report or issue.',
    'msg.themeChanged': 'The new color theme is now active.',
    'msg.langChanged': 'The visible UI copy has been refreshed.',
    'diag.loopStopped.title': 'Loop is not running',
    'diag.loopStopped.body': 'No fused commands are being sent to devices. Click “Start Loop” if this is unexpected.',
    'diag.emergency.title': 'Emergency Stop is active',
    'diag.emergency.body': 'Device output is being clamped for safety. Clear the emergency stop when it is safe to resume.',
    'diag.engineMissing.title': 'Embedded Intiface engine not found',
    'diag.engineMissing.body': 'If you rely on Buttplug devices, place intiface-engine.exe locally or disable engine management and run Intiface Central manually.',
    'diag.tcodeMissing.title': 'TCode auto-connect is enabled but not connected',
    'diag.tcodeMissing.body': 'Check that the COM port is correct, not occupied by another app, and try reconnecting from the testing panel.',
    'diag.oscMissing.title': 'No OSC parameters received yet',
    'diag.oscMissing.body': 'Check whether VRChat OSC is enabled, the port is 9001, and the current avatar actually contains Sensa components.',
    'diag.ok.title': 'System looks healthy',
    'diag.ok.body': 'No obvious runtime or connection problems were detected. You can continue calibrating signals or testing devices.',
    'recording.summary': 'Recording status: {state}, total {count} frames.',
    'recording.active': 'Recording',
    'recording.inactive': 'Not recording',
    'btn.delete': 'Delete',
    'cb.manualEnabled': 'Enable Manual Override',
    'cb.gateOpen': 'GateOpen',
    'nav.overview': 'Overview',
    'nav.config': 'Config',
    'nav.testing': 'Testing',
    'nav.monitoring': 'Monitoring',
    'nav.help': 'Help',
    'side.summary': 'Current Summary',
    'side.quickActions': 'Quick Actions',
    'overview.title': 'Quick Start',
    'overview.desc': 'Here is the shortest path from first launch to first device movement.',
    'overview.badge': 'Good for first-time setup',
    'overview.step1': 'Make sure VRChat OSC is enabled and sending avatar parameters to <code>127.0.0.1:9001</code>.',
    'overview.step2': 'Use the overview tab to confirm the current Loop, TCode, Intiface, and Recording state.',
    'overview.step3': 'Fill in signal paths, roles, and device connection settings on the config tab.',
    'overview.step4': 'Use manual override on the testing tab to validate axis direction and vibration on OSR2 / SR6 / OSR6 devices.',
    'overview.step5': 'Use the monitoring tab to confirm the parameter stream, logs, and recording pipeline are all working.',
    'overview.hint': 'Tip: restarting the service is still recommended after changing the OSC port; most other settings support hot reload.',
    'overview.status': 'Service Status',
    'overview.diag': 'Live Diagnostics',
    'overview.diagDesc': 'Summarizes common issues automatically from runtime state and recent logs.',
    'overview.preview': '3D Device Preview',
    'overview.previewDesc': 'A quick way to see whether stroke, pose, and offsets match expectations, including on mobile.',
    'config.title': 'Configuration Overview',
    'config.desc': 'All major settings can be hot-updated here and then written to the local config file.',
    'cfg.webui': 'WebUI',
    'cfg.webui.title': 'Title',
    'cfg.webui.host': 'Host',
    'cfg.webui.port': 'Port',
    'cfg.webui.autoOpen': 'Auto-open browser',
    'cfg.osc': 'OSC',
    'cfg.osc.port': 'ReceiverPort',
    'cfg.tcode': 'TCode Serial Device',
    'cfg.tcode.sub': 'OSR2 / SR6 / OSR6',
    'cfg.tcode.comPort': 'COM Port',
    'cfg.tcode.minPos': 'MinPos',
    'cfg.tcode.maxPos': 'MaxPos',
    'cfg.tcode.maxVel': 'MaxVelocity',
    'cfg.tcode.ups': 'UpdatesPerSecond',
    'cfg.tcode.enabled': 'Enable TCode auto-connect',
    'cfg.tcode.speedMode': 'Prefer speed mode',
    'cfg.tcode.l0inv': 'Invert L0',
    'cfg.intiface': 'Intiface / Buttplug',
    'cfg.intiface.sub': 'Bluetooth Devices',
    'cfg.intiface.wsAddr': 'WebSocket Address',
    'cfg.intiface.port': 'Port',
    'cfg.intiface.enabled': 'Enable Intiface auto-connect',
    'cfg.intiface.manage': 'Manage intiface-engine',
    'cfg.safety': 'Safety',
    'cfg.safety.cap': 'GlobalIntensityCap',
    'cfg.safety.ramp': 'RampUpMs',
    'cfg.safety.idle': 'Idle',
    'cfg.safety.estop': 'EmergencyStopKey',
    'cfg.rhythm': 'Rhythm',
    'cfg.rhythm.enabled': 'Enable BPM detection',
    'cfg.rhythm.window': 'WindowMs',
    'cfg.rhythm.minBpm': 'MinBpm',
    'cfg.rhythm.maxBpm': 'MaxBpm',
    'signals.title': 'Signal Configuration',
    'signals.desc': 'Add, remove, filter, and edit signals directly. Useful for building different gameplay signal matrices quickly.',
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
    'test.manual.title': 'Manual Functional Test',
    'test.manual.desc': 'Overrides live fused output so you can validate axis direction, center positions, vibration, and Gate behavior.',
    'test.manual.badge': 'Still passes through SafetySystem',
    'test.tcode.title': 'TCode Device Control',
    'test.tcode.desc': 'Connection management for serial OSR2 / SR6 / OSR6 devices. Only meaningful when TCode is enabled in config.',
    'test.intiface.title': 'Intiface / Buttplug',
    'test.intiface.desc': 'Manage Buttplug devices from either an embedded or external Intiface Central setup.',
    'test.intiface.devicesTitle': 'Discovered Devices',
    'test.recording.title': 'Recording & Export',
    'test.recording.hint': 'The export step applies Ramer-Douglas-Peucker simplification automatically, making it suitable for players or toolchains that support <code>.funscript</code>.',
    'monitor.params.title': 'Parameter Stream',
    'monitor.params.desc': 'Shows the latest OSC parameter snapshot so path typos can be spotted quickly.',
    'monitor.params.filter': 'Search parameter path / type',
    'monitor.logs.title': 'Logs',
    'monitor.logs.desc': 'Useful for diagnosing connection failures, config issues, emergency stops, and recording pipeline behavior.',
    'monitor.logs.filter': 'Search logs',
    'help.title': 'Getting Started Tips',
    'help.tip1.title': '1. Validate the shortest path first',
    'help.tip1.body': 'Prioritize this order: Loop running → manual test responds → TCode / Intiface connects → then integrate VRChat OSC.',
    'help.tip2.title': '2. Start with coarse calibration',
    'help.tip2.body': 'Adjust <code>VrchatMin / VrchatMax</code> first so the input range is covered, then fine-tune <code>Dead Zone</code> and <code>Smoothing α</code>.',
    'help.tip3.title': '3. Mobile works too',
    'help.tip3.body': 'The mobile layout uses a bottom tab bar and works well on a second screen, tablet, or remote desktop window.',
    'help.tip4.title': '4. Themes / i18n',
    'help.tip4.body': 'Use the top-right controls to switch between ZH / EN and available color themes (dark blue, AMOLED, purple, emerald, light).',
    'help.endpoints.title': 'Current Endpoints',
    'help.limits.title': 'Current Implementation Boundaries',
    'help.limit1.title': 'OSC port hot reload:',
    'help.limit1.body': 'Restarting the service is still recommended after changing it.',
    'help.limit2.title': 'Embedded Intiface engine:',
    'help.limit2.body': 'If <code>intiface-engine.exe</code> is missing locally, the system skips connection attempts instead of blocking other features.',
    'help.limit3.title': 'Angle Raw:',
    'help.limit3.body': 'The system does not automatically reconstruct differential angles such as <code>Right - Left</code>; compute those upstream if you need them.',
    'col.path': 'Path',
    'col.value': 'Value',
    'col.type': 'Type',
    'col.time': 'Timestamp',
    'cfg.tcode.refreshPorts': 'Refresh',
    'help.endpoints.none': 'No endpoint information available',
    'ws.disconnected': 'WS Offline',
    'tip.refresh': 'Immediately fetch the latest config and service state',
    'tip.save': 'Write the current configuration to the local config file',
    'tip.startLoop': 'Start the main loop so signals continue to be processed and sent to devices',
    'tip.stopLoop': 'Stop the main loop and pause automatic output',
    'tip.emergencyStop': 'Immediately clamp device output for safety',
    'tip.clearEmergency': 'Clear the emergency stop after it is safe to resume',
    'tip.copyDiag': 'Copy the current diagnostic summary for issue reports or collaboration',
    'tip.receiverPort': 'VRChat OSC normally sends avatar parameters to 127.0.0.1:9001',
    'tip.comPort': 'Select or type the COM port used by the target TCode device',
    'tip.refreshPorts': 'Enumerate currently visible COM ports again',
    'tip.minPos': 'Device position that corresponds to normalized 0, in thousandths',
    'tip.maxPos': 'Device position that corresponds to normalized 1, in thousandths',
    'tip.maxVelocity': 'Maximum TCode Sxxxx cap used in speed mode (measured in magnitude units per 100 ms)',
    'tip.ups': 'Target update frequency for the main loop and TCode output',
    'tip.tcodeEnabled': 'Automatically try to connect the TCode device when Companion starts',
    'tip.speedMode': 'Prefer Sxxxx speed terms; disable to use Ixxxx interval terms instead',
    'tip.l0inv': 'Enable when the main stroke direction is physically reversed',
    'tip.wsAddr': 'WebSocket address of the Intiface / Buttplug server',
    'tip.intifacePort': 'Port used when the embedded engine host is enabled',
    'tip.intifaceEnabled': 'Automatically try to connect Intiface when Companion starts',
    'tip.manageEngine': 'Automatically launch and manage a local intiface-engine.exe',
    'tip.intensityCap': 'Global SafetySystem intensity cap applied to L0 and Vibrate',
    'tip.rampUp': 'How long output should ramp in from idle',
    'tip.idle': 'Output strategy used when there is no activity or Gate is closed',
    'tip.estopKey': 'Reserved key identifier for a future local emergency stop shortcut',
    'tip.bpmEnabled': 'Enable BPM estimation from the main depth rhythm',
    'tip.bpmWindow': 'Sliding window size used by the BPM detector',
    'tip.minBpm': 'Minimum accepted BPM',
    'tip.maxBpm': 'Maximum accepted BPM',
    'tip.addSignal': 'Append a new empty signal row',
    'tip.oscPath': 'OSC parameter path without the /avatar/parameters/ prefix',
    'tip.role': 'How this signal participates in fusion',
    'tip.curve': 'Non-linear mapping curve applied after smoothing',
    'tip.sigMin': 'Minimum raw VRChat input value for calibration',
    'tip.sigMax': 'Maximum raw VRChat input value for calibration',
    'tip.alpha': 'EMA smoothing factor; lower values smooth more aggressively',
    'tip.deadZone': 'Outputs below this value are clamped to 0',
    'tip.invert': 'Invert the input direction for this signal',
    'tip.manualEnabled': 'When enabled, manual values override live fused output',
    'tip.gateOpen': 'When disabled, output follows the current Safety idle strategy',
    'tip.applyManual': 'Send the current slider values as the manual override command',
    'tip.clearManual': 'Remove manual override and resume live signal output',
    'tip.connectTCode': 'Try to connect the configured TCode serial device immediately',
    'tip.disconnectTCode': 'Disconnect the current TCode serial device',
    'tip.parkTCode': 'Send a center / park command to the TCode device',
    'tip.connectIntiface': 'Try to connect to the configured Intiface / Buttplug server immediately',
    'tip.disconnectIntiface': 'Disconnect the current Intiface session',
    'tip.scanStart': 'Start scanning for available Buttplug devices',
    'tip.scanStop': 'Stop scanning for Buttplug devices',
    'tip.startRecording': 'Begin capturing the current L0 motion curve',
    'tip.stopRecording': 'Stop the current recording session',
    'tip.exportFunscript': 'Export the captured recording as a .funscript file',
    'tip.lang': 'Toggle Chinese / English',
    'tip.theme': 'Cycle theme',
  },
};

const state = {
  meta: null,
  config: null,
  overview: null,
  parameters: [],
  logs: [],
  serialPorts: [],
  activeTab: localStorage.getItem('sensa.activeTab') || 'overview',
  language: localStorage.getItem('sensa.language') || 'zh-CN',
  theme: localStorage.getItem('sensa.theme') || 'dark',
  wsRetryMs: 1000,
  wsConnected: false,
  filters: {
    signals: '',
    parameters: '',
    logs: '',
  },
};

const roleOptions = [];
const curveOptions = [];
const idleOptions = [];
const sliderAxes = ['L0', 'R0', 'R1', 'R2', 'L1', 'L2', 'Vibrate'];
const sliderDefaults = { L0: 0, R0: 0.5, R1: 0.5, R2: 0.5, L1: 0.5, L2: 0.5, Vibrate: 0 };

const els = {
  wsBadge: document.getElementById('wsBadge'),
  heroTitle: document.getElementById('heroTitle'),
  heroQuickStats: document.getElementById('heroQuickStats'),
  miniSummary: document.getElementById('miniSummary'),
  statusCards: document.getElementById('statusCards'),
  diagnosticsList: document.getElementById('diagnosticsList'),
  endpointList: document.getElementById('endpointList'),
  commandSummaryBadge: document.getElementById('commandSummaryBadge'),
  configForm: document.getElementById('configForm'),
  signalsBody: document.querySelector('#signalsTable tbody'),
  signalTemplate: document.getElementById('signalRowTemplate'),
  parametersBody: document.querySelector('#parametersTable tbody'),
  logPanel: document.getElementById('logPanel'),
  recordingInfo: document.getElementById('recordingInfo'),
  manualControls: document.getElementById('manualTestControls'),
  manualEnabled: document.getElementById('manualEnabled'),
  manualGate: document.getElementById('manualGate'),
  canvas: document.getElementById('deviceCanvas'),
  toastHost: document.getElementById('toastHost'),
  sideNav: document.getElementById('sideNav'),
  mobileMenuBtn: document.getElementById('mobileMenuBtn'),
  signalFilterInput: document.getElementById('signalFilterInput'),
  parameterFilterInput: document.getElementById('parameterFilterInput'),
  logFilterInput: document.getElementById('logFilterInput'),
  copyDiagnosticsBtn: document.getElementById('copyDiagnosticsBtn'),
  langToggleBtn: document.getElementById('langToggleBtn'),
  themeToggleBtn: document.getElementById('themeToggleBtn'),
  refreshPortsBtn: document.getElementById('refreshPortsBtn'),
  comPortList: document.getElementById('comPortList'),
  tcodeStatusRow: document.getElementById('tcodeStatusRow'),
  intifaceStatusRow: document.getElementById('intifaceStatusRow'),
  intifaceDeviceList: document.getElementById('intifaceDeviceList'),
};

function qs(path, root = document) {
  return root.querySelector(path);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
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

function showToast(title, message, type = 'success', timeoutMs = 2600) {
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
  document.querySelectorAll('[data-i18n]').forEach(element => {
    const key = element.dataset.i18n;
    const translated = t(key, null, null);
    if (!translated || translated === key) return;
    if (element.querySelector('input, select, textarea, button, datalist, output, canvas, .input-row')) {
      setLeadingTextPreservingChildren(element, translated);
    } else {
      element.innerHTML = translated;
    }
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
    const translated = t(element.dataset.i18nPlaceholder, null, element.getAttribute('placeholder') || '');
    element.setAttribute('placeholder', translated);
  });
  document.querySelectorAll('[data-i18n-data-tip]').forEach(element => {
    const translated = t(element.dataset.i18nDataTip, null, element.dataset.tip || '');
    element.dataset.tip = translated;
  });
  els.langToggleBtn.textContent = state.language === 'zh-CN' ? 'EN' : 'ZH';
  els.langToggleBtn.dataset.tip = t('tip.lang');
  els.themeToggleBtn.dataset.tip = t('tip.theme');
}

function applyTheme(theme) {
  state.theme = THEMES.includes(theme) ? theme : 'dark';
  document.documentElement.dataset.theme = state.theme;
  localStorage.setItem('sensa.theme', state.theme);
  els.themeToggleBtn.textContent = `◑ ${state.theme}`;
}

function cycleTheme() {
  const currentIndex = THEMES.indexOf(state.theme);
  const nextTheme = THEMES[(currentIndex + 1) % THEMES.length];
  applyTheme(nextTheme);
  showToast(t('toast.themeChanged'), t('msg.themeChanged'));
}

function toggleLanguage() {
  const currentIndex = LANGUAGES.indexOf(state.language);
  state.language = LANGUAGES[(currentIndex + 1) % LANGUAGES.length];
  localStorage.setItem('sensa.language', state.language);
  translateDocument();
  renderAll();
  showToast(t('toast.langChanged'), t('msg.langChanged'));
}

function setWsConnected(connected) {
  state.wsConnected = connected;
  els.wsBadge.textContent = connected ? t('status.wsConnected') : t('status.wsDisconnected');
  els.wsBadge.className = `badge ${connected ? 'online' : 'offline'}`;
}

function setActiveTab(tab) {
  state.activeTab = tab;
  localStorage.setItem('sensa.activeTab', tab);
  document.querySelectorAll('[data-tab-panel]').forEach(panel => {
    panel.classList.toggle('is-active', panel.dataset.tabPanel === tab);
  });
  document.querySelectorAll('.tab-button').forEach(button => {
    button.classList.toggle('is-active', button.dataset.tabTarget === tab);
  });
  els.sideNav.classList.remove('is-open');
  window.scrollTo({ top: 0, behavior: 'auto' });
}

function fillInput(name, value) {
  const input = els.configForm.elements.namedItem(name);
  if (!input) return;
  if (input.type === 'checkbox') {
    input.checked = !!value;
  } else {
    input.value = value ?? '';
  }
}

function readInput(name) {
  const input = els.configForm.elements.namedItem(name);
  if (!input) return undefined;
  if (input.type === 'checkbox') return input.checked;
  if (input.type === 'number') return input.value === '' ? 0 : Number(input.value);
  return input.value;
}

function populateEnumSelect(name, values) {
  const select = els.configForm.elements.namedItem(name);
  if (!select) return;
  select.innerHTML = values.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('');
}

function formatStatus(flag) {
  return flag ? t('status.connected') : t('status.disconnected');
}

function renderPortOptions() {
  els.comPortList.innerHTML = state.serialPorts.map(port => `<option value="${escapeHtml(port)}"></option>`).join('');
}

function renderProtocolRows() {
  const overview = state.overview;
  const config = state.config;
  if (!overview || !config) return;

  const tcodeBits = [
    [t('label.port'), config.tCode?.comPort || t('label.none')],
    [t('label.auto'), config.tCode?.enabled ? t('label.on') : t('label.off')],
    [t('label.mode'), config.tCode?.preferSpeedMode ? t('label.speed') : t('label.interval')],
    [t('label.frames'), `${config.tCode?.updatesPerSecond ?? '-'} UPS`],
  ];
  els.tcodeStatusRow.innerHTML = tcodeBits
    .map(([label, value]) => `<div class="device-status-chip ${overview.tcode.connected ? 'ok' : 'muted'}"><strong>${escapeHtml(label)}</strong><span>${escapeHtml(value)}</span></div>`)
    .join('');

  const intifaceBits = [
    [t('label.address'), config.intiface?.websocketAddress || t('label.none')],
    [t('label.engine'), config.intiface?.manageEngineProcess ? t('label.managed') : t('label.external')],
    [t('label.auto'), config.intiface?.enabled ? t('label.on') : t('label.off')],
    [t('label.devices'), t('label.connectedCount', { count: String(overview.intiface.devices.length) })],
  ];
  els.intifaceStatusRow.innerHTML = intifaceBits
    .map(([label, value]) => `<div class="device-status-chip ${overview.intiface.connected ? 'ok' : 'muted'}"><strong>${escapeHtml(label)}</strong><span>${escapeHtml(value)}</span></div>`)
    .join('');

  els.intifaceDeviceList.innerHTML = overview.intiface.devices.length
    ? overview.intiface.devices
        .map(device => `<div class="device-chip"><strong>${escapeHtml(device.name)}</strong><span>P${device.positionFeatures} · V${device.vibrateFeatures}</span></div>`)
        .join('')
    : `<div class="device-chip muted"><strong>${escapeHtml(t('label.noDevices'))}</strong><span>${escapeHtml(t('status.idle'))}</span></div>`;
}

function renderStatus() {
  const overview = state.overview;
  if (!overview) return;
  const command = overview.loop.command;
  const cards = [
    [t('label.loop'), overview.loop.isRunning ? t('status.running') : t('status.stopped')],
    [t('label.emergency'), overview.loop.isEmergency ? t('status.triggered') : t('status.normal')],
    ['BPM', Number(overview.loop.currentBpm || 0).toFixed(1)],
    [t('label.params'), String(overview.osc.parameterCount)],
    ['TCode', formatStatus(overview.tcode.connected)],
    ['Intiface', overview.intiface.connected ? `${t('status.connected')} (${overview.intiface.devices.length})` : t('status.disconnected')],
    [t('label.recording'), overview.recording.isActive ? `${t('recording.active')} (${overview.recording.frameCount})` : `${t('status.idle')} (${overview.recording.frameCount})`],
    [t('label.manual'), overview.loop.manualOverrideEnabled ? t('status.enabled') : t('status.disabled')],
  ];

  els.statusCards.innerHTML = cards.map(([label, value]) => `<div class="stat"><div class="stat-label">${escapeHtml(label)}</div><div class="stat-value">${escapeHtml(value)}</div></div>`).join('');

  els.heroQuickStats.innerHTML = [
    [t('label.loop'), overview.loop.isRunning ? t('status.running') : t('status.stopped')],
    ['WS', state.wsConnected ? t('status.connected') : t('status.disconnected')],
    [t('label.output'), `L0 ${Number(command.l0 ?? 0).toFixed(2)}`],
    [t('label.devices'), `${overview.tcode.connected ? 'T' : '-'} / ${overview.intiface.connected ? 'I' : '-'}`],
  ]
    .map(([label, value]) => `<div class="quick-chip"><strong>${escapeHtml(label)}</strong><span>${escapeHtml(value)}</span></div>`)
    .join('');

  els.miniSummary.innerHTML = [
    ['BPM', Number(overview.loop.currentBpm || 0).toFixed(1)],
    [t('label.recording'), overview.recording.isActive ? `${overview.recording.frameCount} ${t('label.frames')}` : t('status.idle')],
    [t('label.manual'), overview.loop.manualOverrideEnabled ? t('status.enabled') : t('status.disabled')],
    [t('label.params'), String(overview.osc.parameterCount)],
  ]
    .map(([label, value]) => `<li><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></li>`)
    .join('');

  els.recordingInfo.textContent = t('recording.summary', {
    state: overview.recording.isActive ? t('recording.active') : t('recording.inactive'),
    count: String(overview.recording.frameCount),
  });

  els.commandSummaryBadge.textContent = `L0 ${Number(command.l0 ?? 0).toFixed(2)} · R0 ${Number(command.r0 ?? 0.5).toFixed(2)} · Vib ${Number(command.vibrate ?? 0).toFixed(2)} · Gate ${command.gateOpen ? 'Open' : 'Closed'}`;
  renderProtocolRows();
  drawDevice(command);
  syncManualControls();
  renderDiagnostics();
}

function renderConfig() {
  const config = state.config;
  if (!config) return;
  document.title = config.webUi.title || 'Sensa WebUI';
  els.heroTitle.textContent = config.webUi.title || 'Sensa WebUI';
  fillInput('webUi.title', config.webUi.title);
  fillInput('webUi.host', config.webUi.host);
  fillInput('webUi.port', config.webUi.port);
  fillInput('webUi.autoOpenBrowser', config.webUi.autoOpenBrowser);
  fillInput('osc.receiverPort', config.osc.receiverPort);
  fillInput('tCode.comPort', config.tCode.comPort);
  fillInput('tCode.minPos', config.tCode.minPos);
  fillInput('tCode.maxPos', config.tCode.maxPos);
  fillInput('tCode.maxVelocity', config.tCode.maxVelocity);
  fillInput('tCode.updatesPerSecond', config.tCode.updatesPerSecond);
  fillInput('tCode.enabled', config.tCode.enabled);
  fillInput('tCode.preferSpeedMode', config.tCode.preferSpeedMode);
  fillInput('tCode.l0Invert', config.tCode.l0Invert);
  fillInput('intiface.websocketAddress', config.intiface.websocketAddress);
  fillInput('intiface.port', config.intiface.port);
  fillInput('intiface.enabled', config.intiface.enabled);
  fillInput('intiface.manageEngineProcess', config.intiface.manageEngineProcess);
  fillInput('safety.globalIntensityCap', config.safety.globalIntensityCap);
  fillInput('safety.rampUpMs', config.safety.rampUpMs);
  fillInput('safety.idle', config.safety.idle);
  fillInput('safety.emergencyStopKey', config.safety.emergencyStopKey);
  fillInput('rhythm.enabled', config.rhythm.enabled);
  fillInput('rhythm.windowMs', config.rhythm.windowMs);
  fillInput('rhythm.minBpm', config.rhythm.minBpm);
  fillInput('rhythm.maxBpm', config.rhythm.maxBpm);
  renderPortOptions();
  els.endpointList.innerHTML = state.meta?.endpoints?.length
    ? state.meta.endpoints.map(endpoint => `<li><code>${escapeHtml(endpoint)}</code></li>`).join('')
    : `<li>${escapeHtml(t('help.endpoints.none'))}</li>`;
}

function renderSignals() {
  if (!state.config) return;
  const latestMap = new Map((state.overview?.signals || []).map(item => [item.signal.oscPath, item.latest?.value]));
  els.signalsBody.innerHTML = '';
  const filter = state.filters.signals.trim().toLowerCase();
  state.config.signals.forEach((signal, index) => {
    const haystack = `${signal.oscPath} ${signal.role} ${signal.curve}`.toLowerCase();
    if (filter && !haystack.includes(filter)) return;

    const fragment = els.signalTemplate.content.cloneNode(true);
    const row = qs('tr', fragment);
    for (const [field, value] of Object.entries(signal)) {
      const input = qs(`[data-field="${field}"]`, row);
      if (!input) continue;
      if (input.type === 'checkbox') {
        input.checked = !!value;
      } else {
        input.value = value;
      }
    }

    const roleSelect = qs('[data-field="role"]', row);
    roleSelect.innerHTML = roleOptions.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('');
    roleSelect.value = signal.role;

    const curveSelect = qs('[data-field="curve"]', row);
    curveSelect.innerHTML = curveOptions.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('');
    curveSelect.value = signal.curve;

    qs('.latest-value', row).textContent = latestMap.has(signal.oscPath) ? Number(latestMap.get(signal.oscPath)).toFixed(4) : '-';

    row.querySelectorAll('input, select').forEach(input => {
      input.addEventListener('change', () => {
        const field = input.dataset.field;
        state.config.signals[index][field] = input.type === 'checkbox' ? input.checked : input.type === 'number' ? Number(input.value) : input.value;
      });
    });

    const removeButton = qs('.remove-row', row);
    removeButton.textContent = t('btn.delete');
    removeButton.addEventListener('click', () => {
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
      title: readInput('webUi.title'),
      host: readInput('webUi.host'),
      port: readInput('webUi.port'),
      autoOpenBrowser: readInput('webUi.autoOpenBrowser'),
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
  const diagnostics = [];
  const overview = state.overview;
  const logText = state.logs.map(item => item.message).join('\n');

  if (!overview.loop.isRunning) {
    diagnostics.push({ type: 'warn', title: t('diag.loopStopped.title'), body: t('diag.loopStopped.body') });
  }
  if (overview.loop.isEmergency) {
    diagnostics.push({ type: 'error', title: t('diag.emergency.title'), body: t('diag.emergency.body') });
  }
  if (!overview.intiface.connected && /intiface-engine\.exe not found/i.test(logText)) {
    diagnostics.push({ type: 'warn', title: t('diag.engineMissing.title'), body: t('diag.engineMissing.body') });
  }
  if (!overview.tcode.connected && state.config?.tCode?.enabled) {
    diagnostics.push({ type: 'warn', title: t('diag.tcodeMissing.title'), body: t('diag.tcodeMissing.body') });
  }
  if (overview.osc.parameterCount === 0) {
    diagnostics.push({ type: 'warn', title: t('diag.oscMissing.title'), body: t('diag.oscMissing.body') });
  }
  if (diagnostics.length === 0) {
    diagnostics.push({ type: 'ok', title: t('diag.ok.title'), body: t('diag.ok.body') });
  }

  els.diagnosticsList.innerHTML = diagnostics
    .map(item => `<article class="diagnostic-item ${item.type}"><strong>${escapeHtml(item.title)}</strong><div>${escapeHtml(item.body)}</div></article>`)
    .join('');
}

function buildManualControls() {
  els.manualControls.innerHTML = sliderAxes
    .map(
      axis =>
        `<div class="slider-wrap"><label>${escapeHtml(axis)}<output id="out-${axis}">${sliderDefaults[axis].toFixed(2)}</output></label><input type="range" id="slider-${axis}" min="0" max="1" step="0.01" value="${sliderDefaults[axis]}"></div>`,
    )
    .join('');
  sliderAxes.forEach(axis => {
    const slider = document.getElementById(`slider-${axis}`);
    const out = document.getElementById(`out-${axis}`);
    slider.addEventListener('input', () => {
      out.textContent = Number(slider.value).toFixed(2);
    });
  });
}

function setSliderValue(axis, value) {
  const slider = document.getElementById(`slider-${axis}`);
  const output = document.getElementById(`out-${axis}`);
  if (!slider || !output) return;
  slider.value = Number(value).toFixed(2);
  output.textContent = Number(value).toFixed(2);
}

function syncManualControls() {
  const manualCommand = state.overview?.loop?.manualCommand;
  const enabled = state.overview?.loop?.manualOverrideEnabled;
  els.manualEnabled.checked = !!enabled;
  if (!manualCommand) return;
  els.manualGate.checked = manualCommand.gateOpen ?? true;
  setSliderValue('L0', manualCommand.l0 ?? sliderDefaults.L0);
  setSliderValue('R0', manualCommand.r0 ?? sliderDefaults.R0);
  setSliderValue('R1', manualCommand.r1 ?? sliderDefaults.R1);
  setSliderValue('R2', manualCommand.r2 ?? sliderDefaults.R2);
  setSliderValue('L1', manualCommand.l1 ?? sliderDefaults.L1);
  setSliderValue('L2', manualCommand.l2 ?? sliderDefaults.L2);
  setSliderValue('Vibrate', manualCommand.vibrate ?? sliderDefaults.Vibrate);
}

function drawDevice(command = {}) {
  const ctx = els.canvas.getContext('2d');
  if (!ctx) return;
  const cssWidth = els.canvas.clientWidth || 860;
  const cssHeight = Math.max(240, Math.min(360, Math.round(cssWidth * 0.4)));
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
  const roll = (((command.r0 ?? 0.5) - 0.5) * Math.PI) / 1.5;
  const pitch = (((command.r1 ?? 0.5) - 0.5) * Math.PI) / 1.5;
  const twist = ((command.r2 ?? 0.5) - 0.5) * Math.PI * 2;

  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.rotate(roll * 0.5);

  const bodyLength = 150 + stroke * 90;
  const bodyWidth = 34 + Math.cos(twist) * 4;
  ctx.fillStyle = 'rgba(79,163,255,0.22)';
  ctx.strokeStyle = 'rgba(120,190,255,0.95)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(-bodyWidth / 2, -bodyLength / 2, bodyWidth, bodyLength, 18);
  ctx.fill();
  ctx.stroke();

  ctx.save();
  ctx.translate(0, -bodyLength / 2);
  ctx.rotate(twist);
  ctx.beginPath();
  ctx.ellipse(0, 0, 24, 14 + Math.abs(pitch) * 10, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(63,211,155,0.18)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(63,211,155,0.95)';
  ctx.stroke();
  ctx.restore();

  ctx.beginPath();
  ctx.moveTo(-70, bodyLength / 2 + 14);
  ctx.lineTo(70, bodyLength / 2 + 14);
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = '14px Segoe UI';
  ctx.fillText(
    `L0 ${Number(command.l0 ?? 0).toFixed(2)} | R0 ${Number(command.r0 ?? 0.5).toFixed(2)} | R1 ${Number(command.r1 ?? 0.5).toFixed(2)} | R2 ${Number(command.r2 ?? 0.5).toFixed(2)}`,
    16,
    24,
  );
  ctx.fillText(`L1 ${Number(command.l1 ?? 0.5).toFixed(2)} | L2 ${Number(command.l2 ?? 0.5).toFixed(2)} | Vibrate ${Number(command.vibrate ?? 0).toFixed(2)}`, 16, 46);
}

async function refreshSerialPorts(showFeedback = false) {
  state.serialPorts = await api('/api/meta/serial-ports');
  renderPortOptions();
  if (showFeedback) {
    showToast(t('toast.portsRefreshed'), t('msg.portsRefreshed'));
  }
}

function renderAll() {
  translateDocument();
  renderConfig();
  renderStatus();
  renderSignals();
  renderParameters();
  renderLogs();
}

async function refreshAll(showFeedback = false) {
  try {
    const [meta, config, overview, parameters, logs, serialPorts] = await Promise.all([
      api('/api/meta'),
      api('/api/config'),
      api('/api/state/overview'),
      api('/api/state/parameters'),
      api('/api/state/logs'),
      api('/api/meta/serial-ports').catch(() => []),
    ]);
    state.meta = meta;
    state.config = config;
    state.overview = overview;
    state.parameters = parameters;
    state.logs = logs;
    state.serialPorts = serialPorts;

    roleOptions.splice(0, roleOptions.length, ...meta.enums.signalRoles);
    curveOptions.splice(0, curveOptions.length, ...meta.enums.curveTypes);
    idleOptions.splice(0, idleOptions.length, ...meta.enums.idleBehaviors);
    populateEnumSelect('safety.idle', idleOptions);
    renderAll();

    if (showFeedback) {
      showToast(t('toast.refreshSuccess'), overview?.service?.url || location.origin);
    }
  } catch (error) {
    showToast(t('toast.refreshFailed'), error.message, 'error', 3600);
    throw error;
  }
}

async function postAction(path, body = null) {
  try {
    await api(path, body ? { method: 'POST', body: JSON.stringify(body) } : { method: 'POST' });
    await refreshAll();
    showToast(t('toast.actionSuccess'), path);
  } catch (error) {
    showToast(t('toast.actionFailed'), error.message, 'error', 4200);
    throw error;
  }
}

function bindActions() {
  document.querySelectorAll('[data-tab-target]').forEach(button => {
    button.addEventListener('click', () => setActiveTab(button.dataset.tabTarget));
  });

  document.getElementById('refreshBtn').addEventListener('click', () => refreshAll(true));
  document.getElementById('saveBtn').addEventListener('click', async () => {
    await api('/api/config/save', { method: 'POST' });
    await refreshAll();
    showToast(t('toast.saved'), t('msg.saved'));
  });
  document.getElementById('applyConfigBtn').addEventListener('click', async () => {
    state.config = collectConfig();
    await api('/api/config', { method: 'PUT', body: JSON.stringify(state.config) });
    await refreshAll();
    showToast(t('toast.applied'), t('msg.applied'));
  });
  document.getElementById('saveConfigBtn').addEventListener('click', async () => {
    await api('/api/config/save', { method: 'POST' });
    await refreshAll();
    showToast(t('toast.saved'), t('msg.saved'));
  });
  document.getElementById('addSignalBtn').addEventListener('click', () => {
    if (!state.config) return;
    state.config.signals.push({
      oscPath: '',
      invertDirection: false,
      vrchatMin: 0,
      vrchatMax: 1,
      smoothingAlpha: 0.7,
      deadZone: 0.01,
      curve: curveOptions[0] || 'Linear',
      role: roleOptions[0] || 'Depth',
      isOgbSocket: false,
      isOgbPlug: false,
    });
    renderSignals();
    showToast(t('toast.signalAdded'), t('msg.signalAdded'));
  });

  document.getElementById('applyManualBtn').addEventListener('click', async () => {
    const payload = {
      enabled: els.manualEnabled.checked,
      gateOpen: els.manualGate.checked,
      l0: Number(document.getElementById('slider-L0').value),
      r0: Number(document.getElementById('slider-R0').value),
      r1: Number(document.getElementById('slider-R1').value),
      r2: Number(document.getElementById('slider-R2').value),
      l1: Number(document.getElementById('slider-L1').value),
      l2: Number(document.getElementById('slider-L2').value),
      vibrate: Number(document.getElementById('slider-Vibrate').value),
    };
    await api('/api/manual-test', { method: 'PUT', body: JSON.stringify(payload) });
    await refreshAll();
    showToast(t('toast.manualApplied'), t('msg.manualApplied'));
  });

  document.getElementById('clearManualBtn').addEventListener('click', async () => {
    els.manualEnabled.checked = false;
    await api('/api/manual-test', { method: 'DELETE' });
    await refreshAll();
    showToast(t('toast.manualCleared'), t('msg.manualCleared'));
  });

  document.getElementById('exportRecordingBtn').addEventListener('click', async () => {
    try {
      const result = await api('/api/control/recording/export', { method: 'POST' });
      showToast(t('toast.exportDone'), result.path || t('msg.noRecording'), result.path ? 'success' : 'error', 5000);
      await refreshAll();
    } catch (error) {
      showToast(t('toast.actionFailed'), error.message, 'error', 5000);
    }
  });

  document.querySelectorAll('[data-action]').forEach(button => {
    button.addEventListener('click', async () => {
      await postAction(button.dataset.action);
    });
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
  els.mobileMenuBtn.addEventListener('click', () => {
    els.sideNav.classList.toggle('is-open');
  });
  els.copyDiagnosticsBtn.addEventListener('click', async () => {
    const text = Array.from(els.diagnosticsList.querySelectorAll('.diagnostic-item'))
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

  window.addEventListener('resize', () => {
    if (state.overview) {
      drawDevice(state.overview.loop.command);
    }
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
  });
}

function startBackgroundRefresh() {
  setInterval(() => {
    refreshAll().catch(() => {});
  }, 8000);
}

buildManualControls();
applyTheme(state.theme);
translateDocument();
bindActions();
setActiveTab(state.activeTab);
setWsConnected(false);
await refreshAll().catch(() => {});
connectWs();
startBackgroundRefresh();
