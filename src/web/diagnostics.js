import { t, getLocale } from './i18n.js';

function parseAxisTraceNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function parseAxisTraceBoolean(value) {
  if (typeof value !== 'string') return false;
  return value.toLowerCase() === 'true';
}

function parseAxisTraceMessage(message) {
  if (typeof message !== 'string') return null;

  const trimmed = message.trim();
  const axisMatch = /(?:^|\s)AXIS\s+([A-Z]\d)\b/.exec(trimmed);
  if (!axisMatch) return null;

  const fields = {};
  for (const match of trimmed.matchAll(/(\w+)=([^\s]+)/g)) {
    fields[match[1]] = match[2];
  }

  const stage = fields.stage || '';
  const reason = fields.reason || '';

  return {
    axis: axisMatch[1],
    src: parseAxisTraceNumber(fields.input),
    prevSrc: parseAxisTraceNumber(fields.prevInput),
    prevOut: parseAxisTraceNumber(fields.prevOutput),
    out: parseAxisTraceNumber(fields.output),
    norm: parseAxisTraceNumber(fields.normalized),
    remap: parseAxisTraceNumber(fields.remapped),
    mapped: parseAxisTraceNumber(fields.clamped),
    mode: fields.axisMode || '',
    invert: parseAxisTraceBoolean(fields.invert),
    min: parseAxisTraceNumber(fields.min),
    max: parseAxisTraceNumber(fields.max),
    remapMin: parseAxisTraceNumber(fields.remapMin),
    remapMax: parseAxisTraceNumber(fields.remapMax),
    lock: parseAxisTraceNumber(fields.lock),
    action: stage,
    term: fields.cmd || '',
    note: reason,
    speedLimit: parseAxisTraceNumber(fields.speedLimit),
    requestedSpeed: parseAxisTraceNumber(fields.requestedSpeed),
    logicalSpeed: parseAxisTraceNumber(fields.logicalSpeed),
    emittedSpeed: parseAxisTraceNumber(fields.emittedSpeed),
    durationMs: parseAxisTraceNumber(fields.durationMs),
  };
}

function formatAxisTraceNote(note) {
  switch ((note || '').toLowerCase()) {
    case 'axis-ignored':
      return t("轴模式为“忽略”，不发送该轴指令");
    case 'post-profile-unchanged':
      return t("轴配置处理后目标未变化，跳过发送");
    default:
      return note || '';
  }
}

function formatAxisTraceAction(action) {
  switch ((action || '').toLowerCase()) {
    case 'emit':
      return { label: t("已发送指令"), color: 'primary' };
    case 'hold':
      return { label: t("目标未变化"), color: 'default' };
    case 'skip':
      return { label: t("目标未变化"), color: 'default' };
    case 'ignored':
      return { label: t("轴已忽略"), color: 'warning' };
    default:
      return { label: action || t("未知阶段"), color: 'default' };
  }
}

function formatAxisTraceMode(mode) {
  switch ((mode || '').toLowerCase()) {
    case 'normal':
      return t("普通");
    case 'locked':
      return t("锁定");
    case 'ignored':
      return t("忽略");
    default:
      return mode || '';
  }
}

function formatAxisTraceTerm(term) {
  const text = (term || '').trim().toUpperCase();
  if (!text) return '';
  if (text.startsWith('S')) return t("速度指令 {0}", [text]);
  if (text.startsWith('I')) return t("时长指令 {0}", [text]);
  return text;
}

function formatAxisDisplayValue(value, decimals = 0) {
  if (!Number.isFinite(Number(value))) return '—';
  return decimals > 0 ? Number(value).toFixed(decimals) : `${Math.round(Number(value))}`;
}

function normalizeLogs(entries) {
  if (!Array.isArray(entries)) return [];

  return entries
    .map(entry => {
      if (typeof entry === 'string') return { message: entry, level: 'info', category: 'General' };
      if (!entry || typeof entry !== 'object') return null;

      const message = entry.message || entry.Message || '';
      if (!message) return null;

      return {
        message,
        level: (entry.level || entry.Level || 'info').toLowerCase(),
        category: (entry.category || entry.Category || 'General').trim(),
        timestamp: entry.timestamp || entry.Timestamp || null,
        axisTrace: parseAxisTraceMessage(message),
      };
    })
    .filter(Boolean);
}

const LOG_LEVEL_ORDER = ['debug', 'info', 'warning', 'error'];

const LOG_LEVEL_COLOR = { debug: '#6b7280', info: '#1f2937', warning: '#d97706', error: '#dc2626' };

function formatRealtimeStatus(state) {
  if (state === 'connected') return t("实时连接 在线");
  if (state === 'connecting') return t("实时连接 连接中");
  return t("实时连接 离线");
}

function formatTCodeDeviceInfoTimestamp(value) {
  if (!value) return '—';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';

  return date.toLocaleString(getLocale());
}

function formatTCodeDeviceInfoValue(value, fallback = '—') {
  const text = `${value || ''}`.trim();
  return text || fallback;
}

function getTCodeDeviceInfoView(deviceInfo, connected) {
  const firmwareVersion = deviceInfo?.firmwareVersion ?? null;
  const tCodeVersion = deviceInfo?.tCodeVersion ?? deviceInfo?.tcodeVersion ?? null;
  const axisDescriptors = Array.isArray(deviceInfo?.axisDescriptors) ? deviceInfo.axisDescriptors.map(item => `${item || ''}`.trim()).filter(Boolean) : [];
  const queryFailed = typeof deviceInfo?.status === 'string' && deviceInfo.status.startsWith('query-failed:');
  const errorMessage = queryFailed ? deviceInfo.status.slice('query-failed:'.length).trim() : '';
  const hasPayload = Boolean(firmwareVersion || tCodeVersion || axisDescriptors.length > 0);
  const updatedAtText = formatTCodeDeviceInfoTimestamp(deviceInfo?.updatedAtUtc);

  if (!connected) {
    return {
      axisDescriptors,
      hasPayload,
      statusText: t("未连接"),
      errorMessage: '',
      firmwareVersionText: '—',
      tcodeVersionText: '—',
      updatedAtText,
      statusTone: 'default',
    };
  }

  if (errorMessage) {
    return {
      axisDescriptors,
      hasPayload,
      statusText: t("查询失败：{0}", [errorMessage]),
      errorMessage,
      firmwareVersionText: formatTCodeDeviceInfoValue(firmwareVersion, t("未返回")),
      tcodeVersionText: formatTCodeDeviceInfoValue(tCodeVersion, t("未返回")),
      updatedAtText,
      statusTone: 'error',
    };
  }

  return {
    axisDescriptors,
    hasPayload,
    statusText: hasPayload ? t("已读取设备信息") : updatedAtText !== '—' ? t("已查询") : t("尚未查询"),
    errorMessage: '',
    firmwareVersionText: formatTCodeDeviceInfoValue(firmwareVersion, t("未返回")),
    tcodeVersionText: formatTCodeDeviceInfoValue(tCodeVersion, t("未返回")),
    updatedAtText,
    statusTone: hasPayload ? 'success' : 'warning',
  };
}

export { LOG_LEVEL_COLOR, LOG_LEVEL_ORDER, formatAxisDisplayValue, formatAxisTraceAction, formatAxisTraceMode, formatAxisTraceNote, formatAxisTraceTerm, formatRealtimeStatus, getTCodeDeviceInfoView, normalizeLogs };
