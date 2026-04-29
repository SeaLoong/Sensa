const THEMES = ['dark', 'amoled', 'purple', 'emerald', 'light'];
const LANGUAGES = ['zh-CN', 'en'];

const I18N = {
  'zh-CN': {
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
    'cfg.tcode.refreshPorts': '刷新',
    'help.endpoints.none': '暂无端点信息',
    'tip.lang': '切换中文 / English',
    'tip.theme': '切换主题',
  },
  en: {
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
    'cfg.tcode.refreshPorts': 'Refresh',
    'help.endpoints.none': 'No endpoint information available',
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

  els.statusCards.innerHTML = cards
    .map(([label, value]) => `<div class="stat"><div class="stat-label">${escapeHtml(label)}</div><div class="stat-value">${escapeHtml(value)}</div></div>`)
    .join('');

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
    .map(item => `<tr><td>${escapeHtml(item.path)}</td><td>${Number(item.value).toFixed(4)}</td><td>${escapeHtml(item.type)}</td><td>${escapeHtml(new Date(item.timestampMs).toLocaleTimeString())}</td></tr>`)
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
    .map(axis => `<div class="slider-wrap"><label>${escapeHtml(axis)}<output id="out-${axis}">${sliderDefaults[axis].toFixed(2)}</output></label><input type="range" id="slider-${axis}" min="0" max="1" step="0.01" value="${sliderDefaults[axis]}"></div>`)
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
  ctx.fillText(`L0 ${Number(command.l0 ?? 0).toFixed(2)} | R0 ${Number(command.r0 ?? 0.5).toFixed(2)} | R1 ${Number(command.r1 ?? 0.5).toFixed(2)} | R2 ${Number(command.r2 ?? 0.5).toFixed(2)}`, 16, 24);
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
