import { localized, t } from './i18n.js';

export const PROTOCOL_INPUT_TYPES = localized(() => [
  { value: 'Buttplug', label: 'Buttplug / Intiface', port: 12400 },
  { value: 'TCodeTcp', label: 'TCode TCP', port: 12401 },
  { value: 'TCodeUdp', label: 'TCode UDP', port: 12402 },
  { value: 'TCodeSerial', label: t('TCode 串口'), port: 12400 },
  { value: 'IntifaceDevice', label: t('Intiface 虚拟设备'), port: 54817 },
  { value: 'JsonHttp', label: 'HTTP JSON', port: 12403 },
  { value: 'JsonWebSocket', label: 'WebSocket JSON', port: 12404 },
  { value: 'LovenseHttp', label: 'Lovense HTTP', port: 12405 },
  { value: 'HandyHttp', label: 'Handy HTTP', port: 12406 },
  { value: 'AutoblowHttp', label: 'Autoblow HTTP', port: 12407 },
  { value: 'VacuGlideHttp', label: 'VacuGlide HTTP', port: 12408 },
]);
export const PROTOCOL_AXES = Object.freeze(['L0', 'L1', 'L2', 'R0', 'R1', 'R2', 'V0', 'V1', 'V2', 'A0', 'A1', 'A2']);
export const PROTOCOL_SCALAR_TYPES = Object.freeze(['Vibrate', 'Oscillate', 'Constrict', 'Led', 'Temperature', 'Spray']);
export const VENDOR_OUTPUT_TYPES = Object.freeze(['Handy', 'Autoblow', 'VacuGlide', 'Lovense']);
const NETWORK_CLIENT_TYPES = new Set(['TCodeSerial', 'IntifaceDevice']);

function bindAddressValid(host) {
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(host)) return host.split('.').every(part => Number(part) <= 255);
  if (!host.includes(':')) return false;
  try { return new URL(`http://[${host}]/`).hostname.length > 0; } catch { return false; }
}

export function protocolUsesOrigins(type) {
  return type === 'Buttplug' || type?.endsWith('Http') || type === 'JsonWebSocket';
}
export function makeProtocolFeature(feature = {}, index = 0) {
  return { channel: PROTOCOL_AXES[index] || `Channel${index + 1}`, name: '', actuator: 'Position', scalarType: 'Vibrate',
    targetAxis: PROTOCOL_AXES[index] || '', ...feature };
}
export function makeProtocolDraft(input = {}) {
  const type = input.type || 'Buttplug';
  return { id: '', name: '', type, enabled: false, host: '127.0.0.1',
    port: PROTOCOL_INPUT_TYPES().find(option => option.value === type)?.port ?? 12400,
    address: 'ws://127.0.0.1:54817', identifier: '', comPort: '', baudRate: 115200, timeoutMs: 10000, routeToMotion: true, maxSpeedPerSecond: 1, maxScriptDurationMs: 3600000,
    ...input, allowedOriginsText: Array.isArray(input.allowedOrigins) ? input.allowedOrigins.join('\n') : input.allowedOriginsText || '',
    features: (Array.isArray(input.features) ? input.features : [{}]).map(makeProtocolFeature) };
}
export function newProtocolDraft(inputs = [], type = 'Buttplug') {
  const ids = new Set(inputs.map(input => input.id));
  let index = 1;
  while (ids.has(`protocol-${index}`)) index++;
  const draft = makeProtocolDraft({ id: `protocol-${index}`, name: t('协议来源 {0}', [index]), type });
  const ports = new Set(inputs.filter(input => input.type !== 'TCodeUdp' && !NETWORK_CLIENT_TYPES.has(input.type)).map(input => Number(input.port)));
  if (type !== 'TCodeUdp' && !NETWORK_CLIENT_TYPES.has(type)) while (ports.has(draft.port)) draft.port++;
  return draft;
}
export function stripProtocolDraft(input) {
  const text = input.allowedOriginsText ?? (input.allowedOrigins || []).join('\n');
  return { id: String(input.id || '').trim(), name: String(input.name || '').trim(), type: input.type || 'Buttplug',
    enabled: input.enabled === true, host: String(input.host || '').trim(), port: Number(input.port),
    address: String(input.address || '').trim(), identifier: String(input.identifier || '').trim(),
    comPort: String(input.comPort || '').trim(), baudRate: Number(input.baudRate), timeoutMs: Number(input.timeoutMs), routeToMotion: input.routeToMotion !== false,
    maxSpeedPerSecond: Number(input.maxSpeedPerSecond ?? 1),
    maxScriptDurationMs: Number(input.maxScriptDurationMs ?? 3600000),
    allowedOrigins: [...new Set(text.split(/[\s,;]+/).filter(Boolean).map(value => {
      try { return new URL(value).origin; } catch { return value; }
    }))],
    features: (input.features || []).map(feature => ({ channel: String(feature.channel || '').trim(),
      name: String(feature.name || '').trim(), actuator: feature.actuator || 'Position', scalarType: feature.scalarType || 'Vibrate', targetAxis: feature.targetAxis || '' })) };
}
export function protocolDraftErrors(drafts = []) {
  const errors = [], ids = new Set(), listeners = new Set(), axes = new Set();
  if (drafts.length > 16) errors.push(t('最多配置 16 个协议来源。'));
  for (const draft of drafts) {
    const input = stripProtocolDraft(draft), label = input.name || input.id || t('协议输入');
    const fail = message => errors.push(`${label}: ${message}`);
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(input.id) || ids.has(input.id.toLowerCase())) fail(t('来源标识须唯一，使用字母、数字、短横线或下划线。'));
    ids.add(input.id.toLowerCase());
    if (!PROTOCOL_INPUT_TYPES().some(option => option.value === input.type)) fail(t('请选择支持的协议。'));
    if (!bindAddressValid(input.host)) fail(t('监听地址须为本机绑定的 IPv4 或 IPv6 地址。'));
    if (!Number.isInteger(input.timeoutMs) || input.timeoutMs < 1000 || input.timeoutMs > 600000) fail(t('连接超时须为 1000–600000 毫秒。'));
    if (!Number.isFinite(input.maxSpeedPerSecond) || input.maxSpeedPerSecond < .01 || input.maxSpeedPerSecond > 20) fail(t('虚拟设备最大速度须为 0.01–20 全行程/秒。'));
    if (!Number.isInteger(input.maxScriptDurationMs) || input.maxScriptDurationMs < 1000 || input.maxScriptDurationMs > 3600000) fail(t('脚本任务上限须为 1000–3600000 毫秒。'));
    if (input.type === 'TCodeSerial') {
      if (!input.comPort) fail(t('请填写串口。'));
      if (!Number.isInteger(input.baudRate) || input.baudRate < 1200 || input.baudRate > 4000000) fail(t('请填写有效波特率。'));
    } else if (input.type === 'IntifaceDevice') {
      try { if (!['ws:', 'wss:'].includes(new URL(input.address).protocol)) throw new Error(); }
      catch { fail(t('请输入 ws:// 或 wss:// 地址。')); }
    } else {
      if (!input.host) fail(t('请填写监听地址。'));
      if (!Number.isInteger(input.port) || input.port < 1 || input.port > 65535) fail(t('监听端口须为 1–65535。'));
      const host = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(input.host.toLowerCase()) ? 'loopback' : input.host.toLowerCase();
      const key = `${input.type === 'TCodeUdp' ? 'udp' : 'tcp'}:${host}:${input.port}`;
      if (input.enabled && listeners.has(key)) fail(t('已有启用的输入占用此监听地址和端口。'));
      if (input.enabled) listeners.add(key);
    }
    const rawOrigins = String(draft.allowedOriginsText ?? (draft.allowedOrigins || []).join('\n')).split(/[\s,;]+/).filter(Boolean);
    if (rawOrigins.some(origin => {
      try { const url = new URL(origin); return !['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname); }
      catch { return true; }
    })) fail(t('允许的网站须为完整 HTTP/HTTPS 来源，不含路径、查询或凭据。'));
    if (!input.features.length || input.features.length > 16) fail(t('每个来源须配置 1–16 个控制通道。'));
    const channels = new Set();
    for (const feature of input.features) {
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(feature.channel) || channels.has(feature.channel.toLowerCase())) fail(t('控制通道须使用唯一有效标识。'));
      channels.add(feature.channel.toLowerCase());
      if (!['Position', 'Scalar', 'Rotation'].includes(feature.actuator)) fail(t('请选择支持的控制类型。'));
      if (!PROTOCOL_SCALAR_TYPES.includes(feature.scalarType)) fail(t('请选择支持的标量执行器类型。'));
      if (feature.targetAxis && !PROTOCOL_AXES.includes(feature.targetAxis)) fail(t('请选择有效目标轴。'));
      if (feature.actuator === 'Rotation' && feature.targetAxis) fail(t('旋转速度先作为信号使用，再通过明确计算映射。'));
      if (feature.actuator === 'Scalar' && feature.targetAxis && !/^V[012]$/.test(feature.targetAxis)) fail(t('强度直接映射到 V0、V1 或 V2；其他转换通过计算信号设置。'));
      if (input.enabled && input.routeToMotion && feature.targetAxis) {
        if (axes.has(feature.targetAxis)) fail(t('启用的协议来源不能直接控制同一个轴；请通过计算信号明确组合。'));
        axes.add(feature.targetAxis);
      }
      if (input.type.startsWith('TCode') || input.type === 'IntifaceDevice') {
        if (!/^[LRVA][0-9]$/.test(feature.channel)) fail(t('TCode 通道须使用 L0–L9、R0–R9、V0–V9 或 A0–A9。'));
        if (feature.actuator === 'Rotation') fail(t('TCode R 通道表示绝对位置，不能声明为旋转速度。'));
      }
    }
  }
  return [...new Set(errors)];
}
export function saveProtocolDrafts(config, drafts) {
  const errors = protocolDraftErrors(drafts);
  if (errors.length) throw new Error(errors.join('\n'));
  return { ...config, protocolInputs: drafts.map(stripProtocolDraft) };
}
export function protocolEndpoint(input) {
  if (input.type === 'TCodeSerial') return input.comPort || t('请填写串口。');
  if (input.type === 'IntifaceDevice') return input.address;
  const scheme = ['Buttplug', 'JsonWebSocket'].includes(input.type) ? 'ws' : input.type === 'TCodeTcp' ? 'tcp' : input.type === 'TCodeUdp' ? 'udp' : 'http';
  const host = input.host?.includes(':') && !input.host.startsWith('[') ? `[${input.host}]` : input.host;
  return `${scheme}://${host || '127.0.0.1'}:${input.port}`;
}
export function normalizeDeviceOutput(options = {}) {
  return { axis: 'L0', requestTimeoutMs: 3000, minIntervalMs: 100,
    apiVersion: 2, apiKey: '', authToken: '', function: 'Vibrate', speed: 50, offsetMs: 0, trustedClusterHost: '', scriptUrl: '', scriptTimeoutMs: 90000, scriptFormat: 'Csv',
    ...options, endpoint: String(options.endpoint || '').trim(), connectionKey: String(options.connectionKey || '').trim(),
    deviceId: String(options.deviceId || '').trim() };
}
