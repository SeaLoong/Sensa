import { normalizeAxisLimitSpeed } from './configuration.js';
import { localized, t } from './i18n.js';

// The command interface normalizes both one-shot and continuous manual input.
// 命令 interface 同时规范单次与连续手动输入，避免两条路径行为分叉。
export function manualCommandPayload(draft, mode = 'Default', motionValue = MANUAL_DEFAULT_SPEED) {
  const axes = Object.fromEntries(Object.keys(EMPTY_MANUAL).map(key => {
    const value = Number(draft?.[key] ?? EMPTY_MANUAL[key]);
    return [key, Number.isFinite(value) ? Math.max(0, Math.min(999, Math.round(value))) : EMPTY_MANUAL[key]];
  }));
  const normalizedMode = normalizeManualMotionMode(mode);
  return { enabled: true, motionMode: normalizedMode === 'Default' ? null : normalizedMode, motionValue: normalizeManualMotionValueByMode(normalizedMode, motionValue), ...axes };
}

const INPUT_MODES = localized(() => ([
  { value: 'manual', label: t("手动") },
  { value: 'osc', label: 'OSC' },
  { value: 'script', label: t("脚本") },
  { value: 'combined', label: t('组合') },
]));

const EMPTY_MANUAL = {
  L0: 500,
  L1: 500,
  L2: 500,
  R0: 500,
  R1: 500,
  R2: 500,
  V0: 0,
  V1: 0,
  V2: 0,
  A0: 500,
  A1: 500,
  A2: 500,
};

const MANUAL_AXES = localized(() => ([
  { key: 'L0', label: t("L0 主轴"), min: 0, max: 999, step: 1, description: t("主往复轴的逻辑目标值。0 表示最缩回，999 表示最伸出。输出层仍会继续套用轴配置约束。") },
  { key: 'L1', label: t("L1 前后"), min: 0, max: 999, step: 1, description: t("前后平移轴的逻辑目标值；按 TCode 约定，较小值朝前、较大值朝后，500 附近表示居中。输出层仍会继续套用轴配置约束。") },
  { key: 'L2', label: t("L2 左右"), min: 0, max: 999, step: 1, description: t("左右平移轴的逻辑目标值；按 TCode 约定，正向为用户左侧；500 附近表示居中。") },
  { key: 'R0', label: t("R0 扭转"), min: 0, max: 999, step: 1, description: t("绕 L0 轴旋转的扭转逻辑值；500 附近表示居中。") },
  { key: 'R1', label: t("R1 滚转"), min: 0, max: 999, step: 1, description: t("绕 L1 轴旋转的滚转逻辑值；500 附近表示居中。") },
  { key: 'R2', label: t("R2 俯仰"), min: 0, max: 999, step: 1, description: t("绕 L2 轴旋转的俯仰逻辑值；500 附近表示居中。") },
  { key: 'V0', label: t("V0 震动"), min: 0, max: 999, step: 1, description: t("主震动逻辑值。0 为关闭，999 为最大；输出层仍会继续套用轴配置约束。") },
  { key: 'V1', label: t("V1 震动 2"), min: 0, max: 999, step: 1, description: t("第二路震动逻辑值。0 为关闭，999 为最大。") },
  { key: 'V2', label: t("V2 震动 3"), min: 0, max: 999, step: 1, description: t("第三路震动逻辑值。0 为关闭，999 为最大。") },
  { key: 'A0', label: t("A0 辅助 1"), min: 0, max: 999, step: 1, description: t("辅助通道 1 的逻辑值；500 附近表示居中。") },
  { key: 'A1', label: t("A1 辅助 2"), min: 0, max: 999, step: 1, description: t("辅助通道 2 的逻辑值；500 附近表示居中。") },
  { key: 'A2', label: t("A2 辅助 3"), min: 0, max: 999, step: 1, description: t("辅助通道 3 的逻辑值；500 附近表示居中。") },
]));

const MANUAL_MOTION_MODE_OPTIONS = localized(() => ([
  { value: 'Default', label: t("跟随轴配置") },
  { value: 'Interval', label: t("时间 (I)") },
  { value: 'Speed', label: t("速度 (S)") },
]));

const MANUAL_DEFAULT_SPEED = 999;

const MANUAL_DEFAULT_INTERVAL_MS = 100;

const MANUAL_INTERVAL_MAX_MS = 1000;

const DEFAULT_SCRIPT_SETTINGS = Object.freeze({ loop: false, speed: 1, loopStartMs: null, loopEndMs: null });

const DEFAULT_STUDIO_STATE = Object.freeze({
  preferredInputTab: 'manual',
  scriptDefaults: Object.freeze({
    loop: DEFAULT_SCRIPT_SETTINGS.loop,
    speed: DEFAULT_SCRIPT_SETTINGS.speed,
  }),
});

const SCRIPT_SPEED_MIN = 0.1;

const SCRIPT_SPEED_MAX = 4;

const SCRIPT_SPEED_STEP = 0.05;

const SCRIPT_SPEED_PRESETS = [0.25, 0.5, 1, 1.5, 2, 3, 4];

const SCRIPT_SEEK_ACTIONS = localized(() => ([
  { key: 'start', label: t("开头"), mode: 'absolute', value: 0, shortcut: 'Home' },
  { key: 'back10', label: '-10s', mode: 'relative', value: -10000, shortcut: 'Shift + ←' },
  { key: 'back5', label: '-5s', mode: 'relative', value: -5000, shortcut: '←' },
  { key: 'forward5', label: '+5s', mode: 'relative', value: 5000, shortcut: '→' },
  { key: 'forward10', label: '+10s', mode: 'relative', value: 10000, shortcut: 'Shift + →' },
  { key: 'end', label: t("结尾"), mode: 'absolute', value: 'end', shortcut: 'End' },
]));

const SCRIPT_TIMELINE_GUIDE_ITEMS = localized(() => ([
  { title: t("点击时间轴"), description: t("立即定位到对应时间点") },
  { title: t("Shift + 点击"), description: t("把点击位置写成 A 点") },
  { title: t("Alt + 点击"), description: t("把点击位置写成 B 点") },
  { title: t("拖拽一段"), description: t("直接框选完整 A-B 区间") },
  { title: t("Esc 取消框选"), description: t("拖拽选择 A-B 时，可随时放弃当前框选") },
]));

const SCRIPT_EMPTY_STATE_GUIDE_ITEMS = localized(() => ([
  { title: t("先载入脚本"), description: t("支持 `.funscript` / `.json`；导入完成后这里会变成可编辑的时间轴工作区。") },
  { title: t("默认偏好会记住"), description: t("循环开关与时间倍率可以先设置好，当前浏览器会自动记住。") },
  { title: t("载入后立即开工"), description: t("时间轴拖拽、A-B 框选、关键帧步进和快捷键会在载入后直接可用。") },
]));

const SCRIPT_SHORTCUT_GROUPS = localized(() => ([
  {
    key: 'transport',
    title: t("播放与步进"),
    caption: t("最常用的传输控制与关键帧步进。"),
    items: [
      { shortcut: 'Space / K', label: t("播放 / 暂停"), description: t("在当前时间点继续播放或暂停脚本"), requirement: 'loaded' },
      { shortcut: 'R', label: t("从头重播"), description: t("从脚本开头重新开始播放"), requirement: 'loaded' },
      { shortcut: 'J', label: t("上一动作"), description: t("跳到上一个关键帧，适合逐帧对点"), requirement: 'loaded' },
      { shortcut: 'L', label: t("下一动作"), description: t("跳到下一个关键帧，快速检查节奏"), requirement: 'loaded' },
    ],
  },
  {
    key: 'timeline',
    title: t("时间轴定位"),
    caption: t("短距离、长距离和整段跳转拆开显示，不再混成一行。"),
    items: [
      { shortcut: '←', label: t("快退 5 秒"), description: t("以当前播放位置为基准向前回退 5 秒"), requirement: 'loaded' },
      { shortcut: '→', label: t("快进 5 秒"), description: t("以当前播放位置为基准向后前进 5 秒"), requirement: 'loaded' },
      { shortcut: 'Shift + ←', label: t("快退 10 秒"), description: t("更大步长地回退 10 秒"), requirement: 'loaded' },
      { shortcut: 'Shift + →', label: t("快进 10 秒"), description: t("更大步长地前进 10 秒"), requirement: 'loaded' },
      { shortcut: 'Home', label: t("跳到开头"), description: t("直接把时间轴拉回脚本起点"), requirement: 'loaded' },
      { shortcut: 'End', label: t("跳到结尾"), description: t("直接定位到脚本结尾"), requirement: 'loaded' },
    ],
  },
  {
    key: 'loop',
    title: t("A-B 区间"),
    caption: t("把“设置标记”和“跳到标记”拆开，减少记忆负担。"),
    items: [
      { shortcut: 'Shift + A', label: t("设置 A 点"), description: t("把当前位置写成循环起点 A"), requirement: 'loaded' },
      { shortcut: 'Shift + B', label: t("设置 B 点"), description: t("把当前位置写成循环终点 B"), requirement: 'loaded' },
      { shortcut: '[', label: t("跳到 A 点"), description: t("快速回到当前已设置的 A 点"), requirement: 'loop-start' },
      { shortcut: ']', label: t("跳到 B 点"), description: t("快速跳到当前已设置的 B 点"), requirement: 'loop-end' },
      { shortcut: 'Shift + C', label: t("清除 A-B"), description: t("移除当前 A-B 区间标记"), requirement: 'loop-markers' },
    ],
  },
  {
    key: 'speed',
    title: t("播放倍率"),
    caption: t("这里只改时间倍率，不改 TCode 的 S 速度。"),
    items: [
      { shortcut: '-', label: t("降低倍率"), description: t("把当前脚本时间倍率降低 0.1x"), requirement: 'loaded' },
      { shortcut: '=（+）', label: t("提高倍率"), description: t("把当前脚本时间倍率提高 0.1x"), requirement: 'loaded' },
    ],
  },
]));

function normalizeManualMotionMode(mode) {
  return mode === 'Speed' || mode === 'Interval' ? mode : 'Default';
}

function normalizeManualMotionValueByMode(mode, value) {
  const normalizedMode = normalizeManualMotionMode(mode);
  if (normalizedMode === 'Interval') {
    const numeric = Math.round(Number(value ?? MANUAL_DEFAULT_INTERVAL_MS));
    if (!Number.isFinite(numeric)) return MANUAL_DEFAULT_INTERVAL_MS;
    return Math.max(1, Math.min(MANUAL_INTERVAL_MAX_MS, numeric));
  }

  return normalizeAxisLimitSpeed(value ?? MANUAL_DEFAULT_SPEED);
}

function normalizeManualCommand(command) {
  const raw = command || {};
  const readAxis = axisKey => raw[axisKey] ?? raw[axisKey.charAt(0).toLowerCase() + axisKey.slice(1)];
  const toManualValue = value => {
    const numeric = Number(value ?? 0);
    if (!Number.isFinite(numeric)) return 0;
    if (numeric < 0 || numeric > 1) return Math.max(0, Math.min(999, Math.round(numeric)));
    return Math.max(0, Math.min(999, Math.round(numeric * 1000)));
  };
  return {
    ...EMPTY_MANUAL,
    L0: toManualValue(readAxis('L0') ?? EMPTY_MANUAL.L0),
    L1: toManualValue(readAxis('L1') ?? EMPTY_MANUAL.L1),
    L2: toManualValue(readAxis('L2') ?? EMPTY_MANUAL.L2),
    R0: toManualValue(readAxis('R0') ?? EMPTY_MANUAL.R0),
    R1: toManualValue(readAxis('R1') ?? EMPTY_MANUAL.R1),
    R2: toManualValue(readAxis('R2') ?? EMPTY_MANUAL.R2),
    V0: toManualValue(readAxis('V0') ?? EMPTY_MANUAL.V0),
    V1: toManualValue(readAxis('V1') ?? EMPTY_MANUAL.V1),
    V2: toManualValue(readAxis('V2') ?? EMPTY_MANUAL.V2),
    A0: toManualValue(readAxis('A0') ?? EMPTY_MANUAL.A0),
    A1: toManualValue(readAxis('A1') ?? EMPTY_MANUAL.A1),
    A2: toManualValue(readAxis('A2') ?? EMPTY_MANUAL.A2),
  };
}

function formatMode(mode) {
  return INPUT_MODES().find(item => item.value === mode)?.label || t("未知输入");
}

function formatDuration(ms) {
  const value = Math.max(0, Number(ms || 0));
  const totalSeconds = Math.floor(value / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const remainder = Math.floor((value % 1000) / 10);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(remainder).padStart(2, '0')}`;
}

function normalizeOptionalScriptPositionMs(value, durationMs, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;

  const numeric = Math.round(Number(value));
  if (!Number.isFinite(numeric)) return fallback;

  const max = Number.isFinite(Number(durationMs)) ? Math.max(0, Math.round(Number(durationMs))) : null;
  return Math.max(0, max === null ? numeric : Math.min(numeric, max));
}

function normalizeScriptLoopRange(startMs, endMs, durationMs) {
  let normalizedStartMs = normalizeOptionalScriptPositionMs(startMs, durationMs, null);
  let normalizedEndMs = normalizeOptionalScriptPositionMs(endMs, durationMs, null);

  if (normalizedStartMs !== null && normalizedEndMs !== null && normalizedEndMs < normalizedStartMs) {
    [normalizedStartMs, normalizedEndMs] = [normalizedEndMs, normalizedStartMs];
  }

  return {
    startMs: normalizedStartMs,
    endMs: normalizedEndMs,
    active: normalizedStartMs !== null && normalizedEndMs !== null && normalizedEndMs > normalizedStartMs,
  };
}

function parseScriptTimecodeInput(value) {
  const text = `${value || ''}`.trim().toLowerCase();
  if (!text) return null;

  if (/^\d+(?:\.\d+)?ms$/.test(text)) {
    return Math.max(0, Math.round(Number(text.replace(/ms$/, ''))));
  }

  if (/^\d+(?:\.\d+)?s$/.test(text)) {
    return Math.max(0, Math.round(Number(text.replace(/s$/, '')) * 1000));
  }

  if (/^\d+(?:\.\d+)?$/.test(text)) {
    return Math.max(0, Math.round(Number(text) * 1000));
  }

  const parts = text.split(':');
  if (parts.length < 2 || parts.length > 3) return null;
  if (parts.some(part => !/^\d+(?:\.\d+)?$/.test(part))) return null;

  const tailSeconds = Number(parts[parts.length - 1]);
  if (!Number.isFinite(tailSeconds)) return null;

  const wholeSeconds = Math.floor(tailSeconds);
  const fractionMs = Math.round((tailSeconds - wholeSeconds) * 1000);
  const headValues = parts.slice(0, -1).map(part => Number(part));
  if (headValues.some(part => !Number.isFinite(part))) return null;

  let totalSeconds = wholeSeconds;
  if (headValues.length === 1) {
    totalSeconds += headValues[0] * 60;
  } else {
    totalSeconds += (headValues[0] * 3600) + (headValues[1] * 60);
  }

  return Math.max(0, (totalSeconds * 1000) + fractionMs);
}

function clampScriptSpeed(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_SCRIPT_SETTINGS.speed;
  return Math.max(SCRIPT_SPEED_MIN, Math.min(SCRIPT_SPEED_MAX, numeric));
}

function resolveScriptDurationMs(durationMsOverride, settings, fallback = DEFAULT_SCRIPT_SETTINGS) {
  const overrideNumeric = durationMsOverride == null ? NaN : Math.round(Number(durationMsOverride));
  if (Number.isFinite(overrideNumeric) && overrideNumeric >= 0) {
    return overrideNumeric;
  }

  const snapshotNumeric = Math.round(Number(settings?.durationMs));
  if (Number.isFinite(snapshotNumeric) && snapshotNumeric >= 0) {
    return snapshotNumeric;
  }

  const fallbackNumeric = Math.round(Number(fallback?.durationMs));
  if (Number.isFinite(fallbackNumeric) && fallbackNumeric >= 0) {
    return fallbackNumeric;
  }

  return 0;
}

function normalizeScriptSettingsState(settings, fallback = DEFAULT_SCRIPT_SETTINGS, durationMsOverride = null) {
  const resolvedFallback = fallback || DEFAULT_SCRIPT_SETTINGS;
  const durationMs = resolveScriptDurationMs(durationMsOverride, settings, resolvedFallback);
  const marker = key => settings && Object.hasOwn(settings, key) ? settings[key] : resolvedFallback[key] ?? null;
  const loopRange = normalizeScriptLoopRange(marker('loopStartMs'), marker('loopEndMs'), durationMs);

  return {
    loop: Boolean(settings?.loop ?? resolvedFallback.loop ?? DEFAULT_SCRIPT_SETTINGS.loop),
    speed: clampScriptSpeed(settings?.speed ?? resolvedFallback.speed ?? DEFAULT_SCRIPT_SETTINGS.speed),
    loopStartMs: loopRange.startMs,
    loopEndMs: loopRange.endMs,
  };
}

function normalizeStoredScriptDefaults(settings) {
  return {
    loop: Boolean(settings?.loop ?? DEFAULT_STUDIO_STATE.scriptDefaults.loop),
    speed: clampScriptSpeed(settings?.speed ?? DEFAULT_STUDIO_STATE.scriptDefaults.speed),
  };
}

function clampScriptPositionMs(positionMs, durationMs) {
  const numeric = Math.round(Number(positionMs ?? 0));
  if (!Number.isFinite(numeric)) return 0;
  const max = Math.max(0, Math.round(Number(durationMs || 0)));
  return Math.max(0, Math.min(numeric, max));
}

function formatScriptSpeedLabel(value) {
  return `${clampScriptSpeed(value).toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1')}x`;
}

function shouldIgnoreScriptShortcutTarget(target) {
  if (!target || typeof target.closest !== 'function') return false;
  if (target.isContentEditable) return true;
  if (target.closest('input, textarea, select, button, [role="slider"]')) return true;
  return false;
}

function getScriptStateMeta(state) {
  switch ((state || '').toLowerCase()) {
    case 'playing':
      return { label: t("播放中"), color: 'success' };
    case 'paused':
      return { label: t("已暂停"), color: 'warning' };
    case 'finished':
      return { label: t("已完成"), color: 'primary' };
    case 'stopped':
      return { label: t("已就绪"), color: 'default' };
    default:
      return { label: t("未加载"), color: 'default' };
  }
}

function getScriptShortcutAvailability(requirement, context) {
  if (!context.scriptLoaded) {
    return { label: t("需先载入脚本"), color: 'default' };
  }

  switch (requirement) {
    case 'loop-start':
      return context.hasLoopStart ? { label: t("可用"), color: 'success' } : { label: t("需先设 A 点"), color: 'warning' };

    case 'loop-end':
      return context.hasLoopEnd ? { label: t("可用"), color: 'success' } : { label: t("需先设 B 点"), color: 'warning' };

    case 'loop-markers':
      return context.hasLoopMarkers ? { label: t("可用"), color: 'success' } : { label: t("需先设 A / B"), color: 'warning' };

    default:
      return { label: t("可用"), color: 'success' };
  }
}

export { DEFAULT_SCRIPT_SETTINGS, DEFAULT_STUDIO_STATE, EMPTY_MANUAL, INPUT_MODES, MANUAL_AXES, MANUAL_DEFAULT_INTERVAL_MS, MANUAL_DEFAULT_SPEED, MANUAL_INTERVAL_MAX_MS, MANUAL_MOTION_MODE_OPTIONS, SCRIPT_SEEK_ACTIONS, SCRIPT_SHORTCUT_GROUPS, SCRIPT_SPEED_MAX, SCRIPT_SPEED_MIN, SCRIPT_SPEED_PRESETS, SCRIPT_SPEED_STEP, clampScriptPositionMs, clampScriptSpeed, formatDuration, formatMode, formatScriptSpeedLabel, getScriptShortcutAvailability, getScriptStateMeta, normalizeManualCommand, normalizeManualMotionMode, normalizeManualMotionValueByMode, normalizeScriptLoopRange, normalizeScriptSettingsState, normalizeStoredScriptDefaults, parseScriptTimecodeInput, shouldIgnoreScriptShortcutTarget };
