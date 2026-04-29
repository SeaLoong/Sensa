const state = {
  meta: null,
  config: null,
  overview: null,
  parameters: [],
  logs: [],
};

const roleOptions = [];
const curveOptions = [];
const idleOptions = [];
const sliderAxes = ["L0", "R0", "R1", "R2", "L1", "L2", "Vibrate"];
const sliderDefaults = { L0: 0, R0: 0.5, R1: 0.5, R2: 0.5, L1: 0.5, L2: 0.5, Vibrate: 0 };

const els = {
  wsBadge: document.getElementById("wsBadge"),
  statusCards: document.getElementById("statusCards"),
  configForm: document.getElementById("configForm"),
  signalsBody: document.querySelector("#signalsTable tbody"),
  signalTemplate: document.getElementById("signalRowTemplate"),
  parametersBody: document.querySelector("#parametersTable tbody"),
  logPanel: document.getElementById("logPanel"),
  recordingInfo: document.getElementById("recordingInfo"),
  manualControls: document.getElementById("manualTestControls"),
  manualEnabled: document.getElementById("manualEnabled"),
  manualGate: document.getElementById("manualGate"),
  canvas: document.getElementById("deviceCanvas"),
};

function qs(path, root = document) {
  return root.querySelector(path);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${response.status} ${response.statusText} - ${text}`);
  }
  const contentType = response.headers.get("content-type") || "";
  return contentType.includes("application/json") ? response.json() : response.text();
}

function fillInput(name, value) {
  const input = els.configForm.elements.namedItem(name);
  if (!input) return;
  if (input.type === "checkbox") input.checked = !!value;
  else input.value = value ?? "";
}

function readInput(name) {
  const input = els.configForm.elements.namedItem(name);
  if (!input) return undefined;
  if (input.type === "checkbox") return input.checked;
  if (input.type === "number") return Number(input.value);
  return input.value;
}

function populateEnumSelect(name, values) {
  const select = els.configForm.elements.namedItem(name);
  if (!select) return;
  select.innerHTML = values.map(value => `<option value="${value}">${value}</option>`).join("");
}

function renderStatus() {
  const overview = state.overview;
  if (!overview) return;
  const cards = [
    ["Loop", overview.loop.isRunning ? "运行中" : "已停止"],
    ["Emergency", overview.loop.isEmergency ? "已触发" : "正常"],
    ["BPM", Number(overview.loop.currentBpm || 0).toFixed(1)],
    ["参数数量", overview.osc.parameterCount],
    ["TCode", overview.tcode.connected ? "已连接" : "未连接"],
    ["Intiface", overview.intiface.connected ? `已连接 (${overview.intiface.devices.length})` : "未连接"],
    ["Recording", overview.recording.isActive ? `录制中 (${overview.recording.frameCount})` : `空闲 (${overview.recording.frameCount})`],
    ["Manual Test", overview.loop.manualOverrideEnabled ? "已启用" : "未启用"],
  ];
  els.statusCards.innerHTML = cards.map(([label, value]) => `
    <div class="stat">
      <div class="stat-label">${label}</div>
      <div class="stat-value">${value}</div>
    </div>`).join("");
  els.recordingInfo.textContent = `当前录制状态：${overview.recording.isActive ? "录制中" : "未录制"}，累计 ${overview.recording.frameCount} 帧。`;
  drawDevice(overview.loop.command);
}

function renderConfig() {
  const config = state.config;
  if (!config) return;
  document.title = config.webUi.title || "Sensa WebUI";
  document.querySelector(".hero h1").textContent = config.webUi.title || "Sensa WebUI";
  fillInput("webUi.title", config.webUi.title);
  fillInput("webUi.host", config.webUi.host);
  fillInput("webUi.port", config.webUi.port);
  fillInput("webUi.autoOpenBrowser", config.webUi.autoOpenBrowser);
  fillInput("osc.receiverPort", config.osc.receiverPort);
  fillInput("tCode.comPort", config.tCode.comPort);
  fillInput("tCode.minPos", config.tCode.minPos);
  fillInput("tCode.maxPos", config.tCode.maxPos);
  fillInput("tCode.maxVelocity", config.tCode.maxVelocity);
  fillInput("tCode.updatesPerSecond", config.tCode.updatesPerSecond);
  fillInput("tCode.enabled", config.tCode.enabled);
  fillInput("tCode.preferSpeedMode", config.tCode.preferSpeedMode);
  fillInput("tCode.l0Invert", config.tCode.l0Invert);
  fillInput("intiface.websocketAddress", config.intiface.websocketAddress);
  fillInput("intiface.port", config.intiface.port);
  fillInput("intiface.enabled", config.intiface.enabled);
  fillInput("intiface.manageEngineProcess", config.intiface.manageEngineProcess);
  fillInput("safety.globalIntensityCap", config.safety.globalIntensityCap);
  fillInput("safety.rampUpMs", config.safety.rampUpMs);
  fillInput("safety.idle", config.safety.idle);
  fillInput("safety.emergencyStopKey", config.safety.emergencyStopKey);
  fillInput("rhythm.enabled", config.rhythm.enabled);
  fillInput("rhythm.windowMs", config.rhythm.windowMs);
  fillInput("rhythm.minBpm", config.rhythm.minBpm);
  fillInput("rhythm.maxBpm", config.rhythm.maxBpm);
}

function renderSignals() {
  const latestMap = new Map((state.overview?.signals || []).map(item => [item.signal.oscPath, item.latest?.value]));
  els.signalsBody.innerHTML = "";
  state.config.signals.forEach((signal, index) => {
    const fragment = els.signalTemplate.content.cloneNode(true);
    const row = qs("tr", fragment);
    for (const [field, value] of Object.entries(signal)) {
      const input = qs(`[data-field="${field}"]`, row);
      if (!input) continue;
      if (input.type === "checkbox") input.checked = !!value;
      else input.value = value;
    }
    const roleSelect = qs('[data-field="role"]', row);
    roleSelect.innerHTML = roleOptions.map(value => `<option value="${value}">${value}</option>`).join("");
    roleSelect.value = signal.role;
    const curveSelect = qs('[data-field="curve"]', row);
    curveSelect.innerHTML = curveOptions.map(value => `<option value="${value}">${value}</option>`).join("");
    curveSelect.value = signal.curve;
    qs(".latest-value", row).textContent = latestMap.has(signal.oscPath) ? Number(latestMap.get(signal.oscPath)).toFixed(4) : "-";
    row.querySelectorAll("input, select").forEach(input => {
      input.addEventListener("change", () => {
        const field = input.dataset.field;
        state.config.signals[index][field] = input.type === "checkbox"
          ? input.checked
          : input.type === "number"
            ? Number(input.value)
            : input.value;
      });
    });
    qs(".remove-row", row).addEventListener("click", () => {
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
      title: readInput("webUi.title"),
      host: readInput("webUi.host"),
      port: readInput("webUi.port"),
      autoOpenBrowser: readInput("webUi.autoOpenBrowser"),
    },
    osc: {
      receiverPort: readInput("osc.receiverPort"),
    },
    tCode: {
      comPort: readInput("tCode.comPort"),
      minPos: readInput("tCode.minPos"),
      maxPos: readInput("tCode.maxPos"),
      maxVelocity: readInput("tCode.maxVelocity"),
      updatesPerSecond: readInput("tCode.updatesPerSecond"),
      enabled: readInput("tCode.enabled"),
      preferSpeedMode: readInput("tCode.preferSpeedMode"),
      l0Invert: readInput("tCode.l0Invert"),
    },
    intiface: {
      websocketAddress: readInput("intiface.websocketAddress"),
      port: readInput("intiface.port"),
      enabled: readInput("intiface.enabled"),
      manageEngineProcess: readInput("intiface.manageEngineProcess"),
    },
    safety: {
      globalIntensityCap: readInput("safety.globalIntensityCap"),
      rampUpMs: readInput("safety.rampUpMs"),
      idle: readInput("safety.idle"),
      emergencyStopKey: readInput("safety.emergencyStopKey"),
    },
    rhythm: {
      enabled: readInput("rhythm.enabled"),
      windowMs: readInput("rhythm.windowMs"),
      minBpm: readInput("rhythm.minBpm"),
      maxBpm: readInput("rhythm.maxBpm"),
    },
    signals: state.config.signals,
    deviceRoutes: state.config.deviceRoutes || [],
  };
}

function renderParameters() {
  els.parametersBody.innerHTML = state.parameters.slice(0, 300).map(item => `
    <tr>
      <td>${item.path}</td>
      <td>${Number(item.value).toFixed(4)}</td>
      <td>${item.type}</td>
      <td>${new Date(item.timestampMs).toLocaleTimeString()}</td>
    </tr>`).join("");
}

function renderLogs() {
  els.logPanel.textContent = state.logs.map(item => `[${new Date(item.timestamp).toLocaleTimeString()}] ${item.message}`).join("\n");
  els.logPanel.scrollTop = els.logPanel.scrollHeight;
}

function buildManualControls() {
  els.manualControls.innerHTML = sliderAxes.map(axis => `
    <div class="slider-wrap">
      <label>${axis}<output id="out-${axis}">${sliderDefaults[axis].toFixed(2)}</output></label>
      <input type="range" id="slider-${axis}" min="0" max="1" step="0.01" value="${sliderDefaults[axis]}">
    </div>`).join("");
  sliderAxes.forEach(axis => {
    const slider = document.getElementById(`slider-${axis}`);
    const out = document.getElementById(`out-${axis}`);
    slider.addEventListener("input", () => { out.textContent = Number(slider.value).toFixed(2); });
  });
}

function drawDevice(command = {}) {
  const ctx = els.canvas.getContext("2d");
  const { width, height } = els.canvas;
  ctx.clearRect(0, 0, width, height);
  const centerX = width / 2 + ((command.l2 ?? 0.5) - 0.5) * 180;
  const centerY = height / 2 - ((command.l1 ?? 0.5) - 0.5) * 120;
  const stroke = command.l0 ?? 0;
  const roll = ((command.r0 ?? 0.5) - 0.5) * Math.PI / 1.5;
  const pitch = ((command.r1 ?? 0.5) - 0.5) * Math.PI / 1.5;
  const twist = ((command.r2 ?? 0.5) - 0.5) * Math.PI * 2;

  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.rotate(roll * 0.5);

  const bodyLength = 150 + stroke * 90;
  const bodyWidth = 34 + Math.cos(twist) * 4;
  ctx.fillStyle = "rgba(79,163,255,0.22)";
  ctx.strokeStyle = "rgba(120,190,255,0.95)";
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
  ctx.fillStyle = "rgba(63,211,155,0.18)";
  ctx.fill();
  ctx.strokeStyle = "rgba(63,211,155,0.95)";
  ctx.stroke();
  ctx.restore();

  ctx.beginPath();
  ctx.moveTo(-70, bodyLength / 2 + 14);
  ctx.lineTo(70, bodyLength / 2 + 14);
  ctx.strokeStyle = "rgba(255,255,255,0.2)";
  ctx.stroke();

  ctx.restore();

  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.font = "14px Segoe UI";
  ctx.fillText(`L0 ${Number(command.l0 ?? 0).toFixed(2)} | R0 ${Number(command.r0 ?? 0.5).toFixed(2)} | R1 ${Number(command.r1 ?? 0.5).toFixed(2)} | R2 ${Number(command.r2 ?? 0.5).toFixed(2)}`, 16, 24);
  ctx.fillText(`L1 ${Number(command.l1 ?? 0.5).toFixed(2)} | L2 ${Number(command.l2 ?? 0.5).toFixed(2)} | Vibrate ${Number(command.vibrate ?? 0).toFixed(2)}`, 16, 46);
}

async function refreshAll() {
  const [meta, config, overview, parameters, logs] = await Promise.all([
    api("/api/meta"),
    api("/api/config"),
    api("/api/state/overview"),
    api("/api/state/parameters"),
    api("/api/state/logs"),
  ]);
  state.meta = meta;
  state.config = config;
  state.overview = overview;
  state.parameters = parameters;
  state.logs = logs;
  roleOptions.splice(0, roleOptions.length, ...meta.enums.signalRoles);
  curveOptions.splice(0, curveOptions.length, ...meta.enums.curveTypes);
  idleOptions.splice(0, idleOptions.length, ...meta.enums.idleBehaviors);
  populateEnumSelect("safety.idle", idleOptions);
  renderStatus();
  renderConfig();
  renderSignals();
  renderParameters();
  renderLogs();
}

async function postAction(path, body) {
  await api(path, body ? { method: "POST", body: JSON.stringify(body) } : { method: "POST" });
  await refreshAll();
}

function bindActions() {
  document.getElementById("refreshBtn").addEventListener("click", refreshAll);
  document.getElementById("saveBtn").addEventListener("click", async () => {
    await api("/api/config/save", { method: "POST" });
    await refreshAll();
  });
  document.getElementById("applyConfigBtn").addEventListener("click", async () => {
    state.config = collectConfig();
    await api("/api/config", { method: "PUT", body: JSON.stringify(state.config) });
    await refreshAll();
  });
  document.getElementById("saveConfigBtn").addEventListener("click", async () => {
    await api("/api/config/save", { method: "POST" });
    await refreshAll();
  });
  document.getElementById("addSignalBtn").addEventListener("click", () => {
    state.config.signals.push({
      oscPath: "",
      invertDirection: false,
      vrchatMin: 0,
      vrchatMax: 1,
      smoothingAlpha: 0.7,
      deadZone: 0.01,
      curve: curveOptions[0],
      role: roleOptions[0],
      isOgbSocket: false,
      isOgbPlug: false,
    });
    renderSignals();
  });
  document.getElementById("applyManualBtn").addEventListener("click", async () => {
    const payload = {
      enabled: els.manualEnabled.checked,
      gateOpen: els.manualGate.checked,
      l0: Number(document.getElementById("slider-L0").value),
      r0: Number(document.getElementById("slider-R0").value),
      r1: Number(document.getElementById("slider-R1").value),
      r2: Number(document.getElementById("slider-R2").value),
      l1: Number(document.getElementById("slider-L1").value),
      l2: Number(document.getElementById("slider-L2").value),
      vibrate: Number(document.getElementById("slider-Vibrate").value),
    };
    await api("/api/manual-test", { method: "PUT", body: JSON.stringify(payload) });
    await refreshAll();
  });
  document.getElementById("clearManualBtn").addEventListener("click", async () => {
    els.manualEnabled.checked = false;
    await api("/api/manual-test", { method: "DELETE" });
    await refreshAll();
  });
  document.getElementById("exportRecordingBtn").addEventListener("click", async () => {
    const result = await api("/api/control/recording/export", { method: "POST" });
    alert(result.path ? `已导出到：${result.path}` : "没有可导出的录制数据");
    await refreshAll();
  });
  document.querySelectorAll("[data-action]").forEach(button => {
    button.addEventListener("click", async () => postAction(button.dataset.action));
  });
}

function connectWs() {
  const protocol = location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(`${protocol}://${location.host}/api/ws`);
  ws.addEventListener("open", () => {
    els.wsBadge.textContent = "WS 已连接";
    els.wsBadge.className = "badge online";
  });
  ws.addEventListener("close", () => {
    els.wsBadge.textContent = "WS 未连接";
    els.wsBadge.className = "badge offline";
    setTimeout(connectWs, 1000);
  });
  ws.addEventListener("message", event => {
    const payload = JSON.parse(event.data);
    if (payload.type !== "state") return;
    state.overview = payload.data;
    state.logs = payload.logs;
    renderStatus();
    renderSignals();
    renderLogs();
  });
}

buildManualControls();
bindActions();
await refreshAll();
connectWs();
