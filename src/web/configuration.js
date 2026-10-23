import { roundToStep } from './numeric.js';
import { localized, t } from './i18n.js';
import firstRunMotion from './data/first-run-motion.json' with { type: 'json' };
import BUILT_IN_OSC_MAPPING_PRESETS from './data/osc-presets.json' with { type: 'json' };
import { stripComputedDraft } from './computed-signals.js';
import { buildSignalOutputDraft, isSignalOutputType, makeOutputBinding, recordingFormatOptions, stripSignalOutputDraft } from './signal-outputs.js';

const DEFAULT_OSCQUERY_URL = 'http://127.0.0.1:9001/';

const DEFAULT_OSCQUERY_POLLING_RATE = 10;

const OSCQUERY_POLLING_RATE_MIN = 1;

const OSCQUERY_POLLING_RATE_MAX = 30;

const DEFAULT_OSCQUERY_RECEIVER_NAME = 'Sensa';

const DEFAULT_OSCQUERY_RECEIVER_HTTP_PORT = 9010;

const DEFAULT_OSC_HUB_TARGET_HOST = '127.0.0.1';

const DEFAULT_OSC_HUB_TARGET_PORT = 9002;

const DEFAULT_OSC_HUB_RATE = 10;

const OSC_HUB_RATE_MIN = 1;

const OSC_HUB_RATE_MAX = 240;

const OUTPUT_TYPES = localized(() => ([
  { value: 'TCodeSerial', label: t("TCode 串口"), shortLabel: t("串口直连"), scanSupported: false },
  { value: 'TCodeUdp', label: 'TCode UDP', shortLabel: 'UDP', scanSupported: false },
  { value: 'TCodeTcp', label: 'TCode TCP', shortLabel: 'TCP', scanSupported: false },
  { value: 'Intiface', label: 'Intiface', shortLabel: 'Buttplug', scanSupported: true },
  { value: 'OscParameter', label: t('OSC 参数'), shortLabel: 'OSC', scanSupported: false },
  { value: 'Dglab', label: 'DG-LAB', shortLabel: 'DG-LAB', scanSupported: false },
  { value: 'Recording', label: t('信号录制'), shortLabel: t('录制'), scanSupported: false },
  { value: 'HttpJson', label: 'HTTP JSON', shortLabel: 'HTTP', scanSupported: false },
  { value: 'WebSocketJson', label: 'WebSocket JSON', shortLabel: 'WebSocket', scanSupported: false },
  { value: 'Mqtt', label: 'MQTT', shortLabel: 'MQTT', scanSupported: false },
  { value: 'Midi', label: 'MIDI CC', shortLabel: 'MIDI', scanSupported: false },
]));

const OUTPUT_TYPE_BY_VALUE = localized(() => (Object.fromEntries(OUTPUT_TYPES().map(item => [item.value, item]))));

const OSC_HUB_MODE_OPTIONS = localized(() => ([
  { value: 'EventDriven', label: t("事件驱动") },
  { value: 'FixedRate', label: t("固定频率缓冲") },
]));

const SIGNAL_ROLE_OPTIONS = localized(() => ([
  { value: 'GateEnable', label: t("门控（关闭则停止）") },
  { value: 'DepthOverride', label: t("深度覆盖") },
  { value: 'Depth', label: t("主轴行程（L0）") },
  { value: 'Surge', label: t("前后位移（L1）") },
  { value: 'Sway', label: t("左右位移（L2）") },
  { value: 'AngleX', label: t("滚转（R1）") },
  { value: 'AngleY', label: t("俯仰（R2）") },
  { value: 'Twist', label: t("扭转（R0）") },
  { value: 'V0', label: t("震动（V0）") },
  { value: 'V1', label: t("震动 2（V1）") },
  { value: 'V2', label: t("震动 3（V2）") },
  { value: 'Auxiliary', label: t("辅助 1（A0）") },
  { value: 'Auxiliary1', label: t("辅助 2（A1）") },
  { value: 'Auxiliary2', label: t("辅助 3（A2）") },
]));

function getSignalRoleLabel(role) {
  return SIGNAL_ROLE_OPTIONS().find(option => option.value === role)?.label || role || t("目标轴");
}

function getSignalFusionSummary(role) {
  return t("当前会优先采用校准后更深（归一化更高）的一条映射结果");
}

function getSignalDraftMappedRange(signal) {
  const mappedMin = Math.max(0, Math.min(999, Math.round(Number(signal?.mappedMin ?? 0))));
  const mappedMaxCandidate = Math.max(0, Math.min(999, Math.round(Number(signal?.mappedMax ?? 999))));
  const mappedMax = Math.max(mappedMin, mappedMaxCandidate);
  return { mappedMin, mappedMax };
}

function hasSignalRangeOverlap(left, right) {
  return Math.max(left.mappedMin, right.mappedMin) < Math.min(left.mappedMax, right.mappedMax);
}

function buildSignalOverlapWarnings(signals) {
  const normalizedSignals = (Array.isArray(signals) ? signals : [])
    .map((signal, index) => {
      const range = getSignalDraftMappedRange(signal);
      return {
        index,
        role: signal?.role || '',
        oscPath: (signal?.oscPath || '').trim(),
        mappedMin: range.mappedMin,
        mappedMax: range.mappedMax,
      };
    })
    .filter(signal => Boolean(signal.role) && Boolean(signal.oscPath));

  const groupedSignals = new Map();
  normalizedSignals.forEach(signal => {
    if (!groupedSignals.has(signal.role)) groupedSignals.set(signal.role, []);
    groupedSignals.get(signal.role).push(signal);
  });

  const warnings = [];

  groupedSignals.forEach((group, role) => {
    if (!Array.isArray(group) || group.length < 2) return;

    const overlappingIndexes = new Set();
    const examples = [];

    for (let i = 0; i < group.length; i += 1) {
      for (let j = i + 1; j < group.length; j += 1) {
        if (!hasSignalRangeOverlap(group[i], group[j])) continue;
        overlappingIndexes.add(i);
        overlappingIndexes.add(j);
        if (examples.length < 2) {
          examples.push(`${group[i].oscPath} ↔ ${group[j].oscPath}`);
        }
      }
    }

    if (overlappingIndexes.size === 0) return;

    warnings.push({
      role,
      label: getSignalRoleLabel(role),
      affectedCount: overlappingIndexes.size,
      fusionSummary: getSignalFusionSummary(role),
      examples,
    });
  });

  return warnings;
}

const SIGNAL_CURVE_OPTIONS = localized(() => ([
  { value: 'Linear', label: t("线性") },
  { value: 'EaseIn', label: t("缓入") },
  { value: 'EaseOut', label: t("缓出") },
  { value: 'SCurve', label: t("缓入缓出") },
]));

const COMMAND_MODE_OPTIONS = localized(() => ([
  { value: 'Interval', label: t("时间 (I)") },
  { value: 'Speed', label: t("速度 (S)") },
  { value: 'None', label: t("无") },
]));

const OUTPUT_SLOPE_MODE_OPTIONS = localized(() => ([
  { value: 'None', label: t("跟随轴配置") },
  { value: 'Interval', label: t("时间 (I)") },
  { value: 'Speed', label: t("速度 (S)") },
  { value: 'NoSlope', label: t("无") },
]));

const SPEED_UNIT_BASE_OPTIONS = localized(() => ([
  { value: 'Per100ms', label: t("每 100ms") },
  { value: 'PerSecond', label: t("每秒") },
]));

const RAMP_TYPE_OPTIONS = localized(() => ([
  { value: 'None', label: t("无"), summaryLabel: t("无") },
  { value: 'Linear', label: t("线性（=）"), summaryLabel: t("线性") },
  { value: 'EaseIn', label: t("缓入（<）"), summaryLabel: t("缓入") },
  { value: 'EaseOut', label: t("缓出（>）"), summaryLabel: t("缓出") },
  { value: 'EaseInOut', label: t("缓入缓出（<>）"), summaryLabel: t("缓入缓出") },
]));

const AXIS_LIMIT_MIN_SPEED = 1;

const AXIS_LIMIT_MAX_SPEED = 999;

const AXIS_PROFILE_DEFS = localized(() => ([
  { key: 'l0', axis: 'L0', label: t("主轴行程"), minLabel: t("最小"), maxLabel: t("最大") },
  { key: 'l1', axis: 'L1', label: t("前后位移"), minLabel: t("前"), maxLabel: t("后") },
  { key: 'l2', axis: 'L2', label: t("左右位移"), minLabel: t("右"), maxLabel: t("左") },
  { key: 'r0', axis: 'R0', label: t("扭转"), minLabel: t("负向"), maxLabel: t("正向") },
  { key: 'r1', axis: 'R1', label: t("滚转"), minLabel: t("负向"), maxLabel: t("正向") },
  { key: 'r2', axis: 'R2', label: t("俯仰"), minLabel: t("负向"), maxLabel: t("正向") },
  { key: 'v0', axis: 'V0', label: t("主震动"), minLabel: t("最小"), maxLabel: t("最大") },
  { key: 'v1', axis: 'V1', label: t("震动 2"), minLabel: t("最小"), maxLabel: t("最大") },
  { key: 'v2', axis: 'V2', label: t("震动 3"), minLabel: t("最小"), maxLabel: t("最大") },
  { key: 'a0', axis: 'A0', label: t("辅助通道 1"), minLabel: t("最小"), maxLabel: t("最大") },
  { key: 'a1', axis: 'A1', label: t("辅助通道 2"), minLabel: t("最小"), maxLabel: t("最大") },
  { key: 'a2', axis: 'A2', label: t("辅助通道 3"), minLabel: t("最小"), maxLabel: t("最大") },
]));

const DEFAULT_AXIS_PROFILE = {
  min: 0,
  max: 999,
  remapMin: 0,
  remapMax: 999,
  maxSpeed: 999,
  invert: false,
  mode: 'Normal',
  commandMode: 'Interval',
  rampType: 'None',
  lockValue: 0.5,
};

const AXIS_MODE_OPTIONS = localized(() => ([
  { value: 'Normal', label: t("普通") },
  { value: 'Locked', label: t("锁定") },
  { value: 'Ignored', label: t("忽略") },
]));

const AXIS_MODE_SELECT_OPTIONS = localized(() => ([
  { value: 'Normal', mode: 'Normal', invert: false, label: t("普通") },
  { value: 'NormalInverted', mode: 'Normal', invert: true, label: t("普通（反向）") },
  { value: 'Locked', mode: 'Locked', invert: false, label: t("锁定") },
  { value: 'LockedInverted', mode: 'Locked', invert: true, label: t("锁定（反向）") },
  { value: 'Ignored', mode: 'Ignored', invert: false, label: t("忽略") },
]));

function defaultAxisLockValue(axisKey) {
  return axisKey === 'v0' || axisKey === 'v1' || axisKey === 'v2' ? 0 : 0.5;
}

function createDefaultAxisProfileValue(axisKey) {
  return {
    ...DEFAULT_AXIS_PROFILE,
    lockValue: defaultAxisLockValue(axisKey),
  };
}

function createAxisProfilePresetMotion(presetId) {
  const profile = createDefaultMotionProfile(false);

  const ignoreAxes = keys => {
    keys.forEach(key => {
      profile[key] = { ...profile[key], mode: 'Ignored' };
    });
  };

  const lockAxes = (keys, lockValue) => {
    keys.forEach(key => {
      profile[key] = { ...profile[key], mode: 'Locked', lockValue };
    });
  };

  switch (presetId) {
    case 'osr-first-run':
      return normalizeMotionProfile(firstRunMotion, false);
    case 'sr6-full':
      ignoreAxes(['v0', 'v1', 'v2', 'a0', 'a1', 'a2']);
      return profile;
    case 'osr2-core':
      ignoreAxes(['l1', 'l2', 'r0', 'v0', 'v1', 'v2', 'a0', 'a1', 'a2']);
      return profile;
    case 'l0-only':
      ignoreAxes(['l1', 'l2', 'r0', 'r1', 'r2', 'v0', 'v1', 'v2', 'a0', 'a1', 'a2']);
      return profile;
    case 'l0-pose-lock':
      ignoreAxes(['v0', 'v1', 'v2']);
      lockAxes(['l1', 'l2', 'r0', 'r1', 'r2', 'a0', 'a1', 'a2'], 0.5);
      return profile;
    default:
      return profile;
  }
}

const AXIS_PROFILE_PRESETS = localized(() => ([
  {
    id: 'osr-first-run',
    name: t("OSR 首次测试 · L0 小行程"),
    description: t("只输出 L0，逻辑 0–100% 映射为 TCode 400–600，速度上限 100；其他轴忽略。先确认设备中位与允许范围。该模板不是硬件校准，保存不会自动启用运动。"),
  },
  {
    id: 'sr6-full',
    name: t("SR6 / OSR6 六轴"),
    description: t("保留 L0 / L1 / L2 / R0 / R1 / R2 六个主运动轴，默认忽略 V0 / V1 / V2 以及 A0 / A1 / A2 三个扩展辅助轴。"),
  },
  {
    id: 'osr2-core',
    name: t("OSR2 三轴"),
    description: t("仅保留 L0 / R1 / R2（主轴 + 滚转 + 俯仰），忽略 L1 / L2 / R0、V0 / V1 / V2 以及 A0 / A1 / A2。"),
  },
  {
    id: 'l0-only',
    name: t("仅 L0 主轴"),
    description: t("只让 L0 主往复轴参与控制；L1 / L2 / R0 / R1 / R2、V0 / V1 / V2 与 A0 / A1 / A2 全部忽略。"),
  },
  {
    id: 'l0-pose-lock',
    name: t("L0 + 固定姿态"),
    description: t("保留 L0，姿态轴与 A0 / A1 / A2 锁定在中位，V0 / V1 / V2 仍忽略；适合“手动摆好姿态后只让主轴动”的场景。"),
  },
]));

const BUILT_IN_OSC_PRESET_IDS = new Set(BUILT_IN_OSC_MAPPING_PRESETS.map(preset => preset.id));

function createDefaultMotionProfile(useGlobal = false) {
  return {
    useGlobal,
    l0: createDefaultAxisProfileValue('l0'),
    l1: createDefaultAxisProfileValue('l1'),
    l2: createDefaultAxisProfileValue('l2'),
    r0: createDefaultAxisProfileValue('r0'),
    r1: createDefaultAxisProfileValue('r1'),
    r2: createDefaultAxisProfileValue('r2'),
    v0: createDefaultAxisProfileValue('v0'),
    v1: createDefaultAxisProfileValue('v1'),
    v2: createDefaultAxisProfileValue('v2'),
    a0: createDefaultAxisProfileValue('a0'),
    a1: createDefaultAxisProfileValue('a1'),
    a2: createDefaultAxisProfileValue('a2'),
  };
}

function createDefaultAxisProfileCard(name = t("全局默认"), options = {}) {
  return {
    id: options.id || (options.isDefault ? 'global-default' : createDraftId('axis-profile')),
    name,
    isDefault: Boolean(options.isDefault),
    motion: createDefaultMotionProfile(false),
  };
}

function normalizeAxisProfile(axis, axisKey) {
  const next = {
    ...createDefaultAxisProfileValue(axisKey),
    ...(axis || {}),
  };

  const min = Math.max(0, Math.min(999, Number(next.min ?? DEFAULT_AXIS_PROFILE.min)));
  const max = Math.max(min, Math.min(999, Number(next.max ?? DEFAULT_AXIS_PROFILE.max)));
  const remapMin = Math.max(0, Math.min(999, Number(next.remapMin ?? DEFAULT_AXIS_PROFILE.remapMin)));
  const remapMax = Math.max(remapMin, Math.min(999, Number(next.remapMax ?? DEFAULT_AXIS_PROFILE.remapMax)));
  const mode = AXIS_MODE_OPTIONS().some(option => option.value === next.mode) ? next.mode : 'Normal';
  const commandMode = COMMAND_MODE_OPTIONS().some(option => option.value === next.commandMode) ? next.commandMode : 'Interval';
  const rampType = RAMP_TYPE_OPTIONS().some(option => option.value === next.rampType) ? next.rampType : 'None';

  return {
    min,
    max,
    remapMin,
    remapMax,
    maxSpeed: normalizeAxisLimitSpeed(next.maxSpeed ?? DEFAULT_AXIS_PROFILE.maxSpeed),
    invert: Boolean(next.invert),
    mode,
    commandMode,
    rampType,
    lockValue: Math.max(0, Math.min(1, Number(next.lockValue ?? defaultAxisLockValue(axisKey)))),
  };
}

function normalizeMotionProfile(profile, useGlobal = false) {
  const fallback = createDefaultMotionProfile(useGlobal);
  return {
    ...fallback,
    ...(profile || {}),
    useGlobal: profile?.useGlobal ?? useGlobal,
    l0: normalizeAxisProfile(profile?.l0, 'l0'),
    l1: normalizeAxisProfile(profile?.l1, 'l1'),
    l2: normalizeAxisProfile(profile?.l2, 'l2'),
    r0: normalizeAxisProfile(profile?.r0, 'r0'),
    r1: normalizeAxisProfile(profile?.r1, 'r1'),
    r2: normalizeAxisProfile(profile?.r2, 'r2'),
    v0: normalizeAxisProfile(profile?.v0, 'v0'),
    v1: normalizeAxisProfile(profile?.v1, 'v1'),
    v2: normalizeAxisProfile(profile?.v2, 'v2'),
    a0: normalizeAxisProfile(profile?.a0, 'a0'),
    a1: normalizeAxisProfile(profile?.a1, 'a1'),
    a2: normalizeAxisProfile(profile?.a2, 'a2'),
  };
}

function normalizeAxisProfileCard(profile, index = 0) {
  const isDefault = Boolean(profile?.isDefault);
  // 不根据 isDefault 或 index 改变名称；保留原始名称或使用通用默认值
  const defaultNameByIndex = index === 0 ? t("轴配置 1") : t("轴配置 {0}", [index + 1]);
  return {
    id: (profile?.id || (isDefault ? 'global-default' : `axis-profile-${index + 1}`)).trim(),
    name: (profile?.name || defaultNameByIndex).trim(),
    isDefault,
    motion: normalizeMotionProfile(profile?.motion, false),
  };
}

function normalizeAxisProfiles(config) {
  const source = Array.isArray(config?.axisProfiles) ? config.axisProfiles : [];
  const profiles = (source.length ? source : [createDefaultAxisProfileCard(t("全局默认"), { isDefault: true })]).map((profile, index) => normalizeAxisProfileCard(profile, index));
  const defaultProfile = profiles.find(profile => profile.isDefault) || profiles[0];
  return profiles.map(profile => ({
    ...profile,
    isDefault: profile.id === defaultProfile.id,
  }));
}

function cloneAxisProfileCard(profile) {
  return JSON.parse(
    JSON.stringify({
      ...profile,
      motion: normalizeMotionProfile(profile?.motion, false),
    }),
  );
}

function cloneMotionProfile(profile, useGlobal = false) {
  return JSON.parse(JSON.stringify(normalizeMotionProfile(profile, useGlobal)));
}

function getAxisProfiles(config) {
  return normalizeAxisProfiles(config);
}

function getDefaultAxisProfile(config) {
  return getAxisProfiles(config).find(profile => profile.isDefault) || getAxisProfiles(config)[0];
}

function getDefaultAxisProfileId(config) {
  return getDefaultAxisProfile(config)?.id || 'global-default';
}

function getAxisProfile(config, profileId) {
  const profiles = getAxisProfiles(config);
  return profiles.find(profile => profile.id === profileId) || getDefaultAxisProfile(config);
}

function buildProfileDialogDraft(profileId, config) {
  const profile = getAxisProfile(config, profileId);
  return {
    profileId: profile.id,
    name: profile.name,
    isDefault: Boolean(profile.isDefault),
    isNew: false,
    presetId: '',
    profile: cloneMotionProfile(profile.motion, false),
  };
}

function buildNewProfileDialogDraft(config) {
  const nextIndex = getAxisProfiles(config).length + 1;
  return {
    profileId: createDraftId('axis-profile'),
    name: t("轴配置 {0}", [nextIndex]),
    isDefault: false,
    isNew: true,
    presetId: '',
    profile: createDefaultMotionProfile(false),
  };
}

function stripMotionProfile(profile, useGlobal = false) {
  const normalized = normalizeMotionProfile(profile, useGlobal);
  return {
    useGlobal,
    l0: normalized.l0,
    l1: normalized.l1,
    l2: normalized.l2,
    r0: normalized.r0,
    r1: normalized.r1,
    r2: normalized.r2,
    v0: normalized.v0,
    v1: normalized.v1,
    v2: normalized.v2,
    a0: normalized.a0,
    a1: normalized.a1,
    a2: normalized.a2,
  };
}

function createDraftId(prefix = 'draft') {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function getSignalSimulationDefaultValue(signal = {}) {
  const min = Number(signal?.vrchatMin ?? 0);
  const max = Number(signal?.vrchatMax ?? 1);
  const safeMin = Number.isFinite(min) ? min : 0;
  const safeMax = Number.isFinite(max) ? max : 1;
  return roundToStep((safeMin + safeMax) / 2, 0.01);
}

function makeSignalDraft(signal = {}) {
  const role = signal.role || 'Depth';
  const mappedMinCandidate = signal.mappedMin ?? 0;
  const mappedMaxCandidate = signal.mappedMax ?? 999;
  const mappedMin = Math.max(0, Math.min(999, Number(mappedMinCandidate ?? 0)));
  const mappedMax = Math.max(mappedMin, Math.min(999, Number(mappedMaxCandidate ?? 999)));
  const next = {
    _draftId: createDraftId('signal'),
    oscPath: '',
    sourceMode: 'Direct',
    pointMetric: 'Z',
    invertDirection: false,
    vrchatMin: 0,
    vrchatMax: 1,
    mappedMin,
    mappedMax,
    curve: 'Linear',
    role,
    isOgbSocket: false,
    isOgbPlug: false,
    ...signal,
  };

  return {
    ...next,
    simulateEnabled: Boolean(next.simulateEnabled),
    simulatedValue: Number.isFinite(Number(next.simulatedValue)) ? roundToStep(Number(next.simulatedValue), 0.01) : getSignalSimulationDefaultValue(next),
  };
}

function buildSignalDrafts(signals) {
  return Array.isArray(signals) ? signals.map(signal => makeSignalDraft(signal)) : [];
}

function normalizeOscHubMode(value) {
  return OSC_HUB_MODE_OPTIONS().some(option => option.value === value) ? value : 'EventDriven';
}

function normalizeOscHubHost(value, fallback = DEFAULT_OSC_HUB_TARGET_HOST) {
  return (value || fallback).trim() || fallback;
}

function normalizeOscHubPort(value, fallback = DEFAULT_OSC_HUB_TARGET_PORT) {
  const numeric = Math.round(Number(value || fallback));
  return Number.isFinite(numeric) && numeric > 0 && numeric <= 65535 ? numeric : fallback;
}

function normalizeOscHubRate(value, fallback = DEFAULT_OSC_HUB_RATE) {
  const numeric = Math.round(Number(value || fallback));
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(OSC_HUB_RATE_MIN, Math.min(OSC_HUB_RATE_MAX, numeric));
}

function normalizeOscQueryPollingRate(value, fallback = DEFAULT_OSCQUERY_POLLING_RATE) {
  const numeric = Math.round(Number(value || fallback));
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(OSCQUERY_POLLING_RATE_MIN, Math.min(OSCQUERY_POLLING_RATE_MAX, numeric));
}

function makeOscHubTargetDraft(target = {}, options = {}) {
  const index = Math.max(1, Math.round(Number(options.index || 1)));
  const fallbackPort = normalizeOscHubPort(options.port, DEFAULT_OSC_HUB_TARGET_PORT + (index - 1));
  const fallbackName = options.name || target.name || t("Hub 目标 {0}", [index]);

  return {
    _draftId: createDraftId('osc-hub-target'),
    id: options.id || target.id || createDraftId('osc-hub-target-config'),
    name: (target.name || fallbackName).trim(),
    enabled: target.enabled !== false,
    host: normalizeOscHubHost(target.host, options.host || DEFAULT_OSC_HUB_TARGET_HOST),
    port: normalizeOscHubPort(target.port, fallbackPort),
  };
}

function buildOscHubTargetDrafts(targets) {
  return Array.isArray(targets) ? targets.map((target, index) => makeOscHubTargetDraft(target, { index: index + 1 })) : [];
}

function stripOscHubTargetDraft(target) {
  return {
    id: target?.id || createDraftId('osc-hub-target-config'),
    name: (target?.name || '').trim(),
    enabled: target?.enabled !== false,
    host: normalizeOscHubHost(target?.host),
    port: normalizeOscHubPort(target?.port),
  };
}

function isOscWildcardHost(host) {
  const normalized = (host || '').trim().toLowerCase();
  return normalized === '0.0.0.0' || normalized === '::' || normalized === '*' || normalized === 'any';
}

function isOscLoopbackHost(host) {
  const normalized = (host || '').trim().toLowerCase();
  return normalized === '127.0.0.1' || normalized === '::1' || normalized === 'localhost';
}

function doesOscHubTargetLoopToReceiver(target, receiverHost, receiverPort) {
  const normalizedTargetHost = normalizeOscHubHost(target?.host).toLowerCase();
  const normalizedTargetPort = normalizeOscHubPort(target?.port);
  const normalizedReceiverHost = (receiverHost || '0.0.0.0').trim().toLowerCase() || '0.0.0.0';
  const receiverNumeric = Math.round(Number(receiverPort || 9001));
  const normalizedReceiverPort = Number.isFinite(receiverNumeric) && receiverNumeric > 0 && receiverNumeric <= 65535 ? receiverNumeric : 9001;

  if (normalizedTargetPort !== normalizedReceiverPort) return false;
  if (isOscWildcardHost(normalizedReceiverHost)) return true;
  if (normalizedTargetHost === normalizedReceiverHost) return true;
  return isOscLoopbackHost(normalizedTargetHost) && isOscLoopbackHost(normalizedReceiverHost);
}

function appendOscHubConflict(lookup, draftId, message) {
  if (!draftId || !message) return;
  const existing = lookup.get(draftId) || [];
  if (!existing.includes(message)) lookup.set(draftId, [...existing, message]);
}

function buildOscHubTargetConflictLookup(oscDraft) {
  const lookup = new Map();
  const targets = Array.isArray(oscDraft?.hubTargets) ? oscDraft.hubTargets : [];
  const occupied = new Map();

  targets.forEach(target => {
    const key = `${normalizeOscHubHost(target?.host).toLowerCase()}:${normalizeOscHubPort(target?.port)}`;
    if (occupied.has(key)) {
      const previous = occupied.get(key);
      const host = normalizeOscHubHost(target?.host);
      const port = normalizeOscHubPort(target?.port);
      const message = t("UDP 地址 {0}:{1} 与另一条 Hub 目标重复。", [host, port]);
      appendOscHubConflict(lookup, target?._draftId, message);
      appendOscHubConflict(lookup, previous?._draftId, message);
    } else {
      occupied.set(key, target);
    }

    if (doesOscHubTargetLoopToReceiver(target, oscDraft?.receiverHost, oscDraft?.receiverPort)) {
      appendOscHubConflict(lookup, target?._draftId, t("目标地址指向当前 Sensa OSC 监听端口，会形成回环。"));
    }
  });

  return lookup;
}

function flattenOscHubConflictMessages(conflictLookup) {
  return Array.from(new Set(Array.from((conflictLookup || new Map()).values()).flat()));
}

function formatOscHubModeLabel(mode) {
  return OSC_HUB_MODE_OPTIONS().find(option => option.value === mode)?.label || t("事件驱动");
}

function buildOscDraftFromConfig(config) {
  const oscConfig = config?.osc || {};
  const hubConfig = oscConfig?.hub || {};
  const oscQueryPollingConfig = oscConfig?.oscQueryPolling || {};
  const oscQueryReceiverConfig = oscConfig?.oscQueryReceiver || {};
  return {
    oscEnabled: oscConfig?.enabled !== false,
    receiverHost: oscConfig?.receiverHost || '127.0.0.1',
    receiverPort: oscConfig?.receiverPort || 9001,
    inputTimeoutMs: oscConfig?.inputTimeoutMs || 0,
    allowExperimentalSpatialInput: oscConfig?.allowExperimentalSpatialInput === true,
    allowedSourceAddresses: (oscConfig?.allowedSourceAddresses || []).join(', '),
    ogbControlEnabled: oscConfig?.ogbControl?.enabled === true,
    ogbControlHost: oscConfig?.ogbControl?.host || '127.0.0.1',
    ogbControlPort: oscConfig?.ogbControl?.port || 9000,
    oscQueryEnabled: oscConfig?.oscQueryEnabled !== false,
    oscQueryUrl: oscConfig?.oscQueryUrl || DEFAULT_OSCQUERY_URL,
    oscQueryPollingEnabled: oscQueryPollingConfig?.enabled === true,
    oscQueryPollingRateHz: normalizeOscQueryPollingRate(oscQueryPollingConfig?.rateHz, DEFAULT_OSCQUERY_POLLING_RATE),
    oscQueryReceiverEnabled: oscQueryReceiverConfig?.enabled === true,
    oscQueryReceiverServiceName: oscQueryReceiverConfig?.serviceName || DEFAULT_OSCQUERY_RECEIVER_NAME,
    oscQueryReceiverHttpPort: oscQueryReceiverConfig?.httpPort || DEFAULT_OSCQUERY_RECEIVER_HTTP_PORT,
    oscQueryReceiverAdvertiseAvatar: oscQueryReceiverConfig?.advertiseAvatar !== false,
    oscQueryReceiverAdvertiseTracking: oscQueryReceiverConfig?.advertiseTracking !== false,
    hubEnabled: hubConfig?.enabled === true,
    hubMode: normalizeOscHubMode(hubConfig?.mode),
    hubFixedRateHz: normalizeOscHubRate(hubConfig?.fixedRateHz, DEFAULT_OSC_HUB_RATE),
    hubForwardAvatarChange: hubConfig?.forwardAvatarChange !== false,
    hubTargets: buildOscHubTargetDrafts(hubConfig?.targets),
  };
}

function createOscPresetDraft(name = t("新预设"), options = {}) {
  return {
    id: options.id || createDraftId('osc-preset'),
    name,
    description: options.description || '',
    mappings: Array.isArray(options.mappings) ? options.mappings.map(mapping => ({ ...stripSignalDraft(makeSignalDraft(mapping)) })) : [],
  };
}

function normalizeOscPreset(preset, index = 0, options = {}) {
  return {
    id: (preset?.id || `osc-preset-${index + 1}`).trim(),
    name: (preset?.name || t("OSC 预设 {0}", [index + 1])).trim(),
    description: (preset?.description || '').trim(),
    isBuiltIn: Boolean(options.isBuiltIn),
    mappings: Array.isArray(preset?.mappings) ? preset.mappings.map(mapping => ({ ...stripSignalDraft(makeSignalDraft(mapping)) })).filter(mapping => Boolean(mapping.oscPath)) : [],
  };
}

function getCustomOscMappingPresets(config) {
  const source = Array.isArray(config?.oscMappingPresets) ? config.oscMappingPresets : [];
  return source.map((preset, index) => normalizeOscPreset(preset, index, { isBuiltIn: false })).filter(preset => !BUILT_IN_OSC_PRESET_IDS.has(preset.id));
}

function getOscMappingPresets(config) {
  const customPresets = getCustomOscMappingPresets(config);
  const customIds = new Set(customPresets.map(preset => preset.id));
  const builtInPresets = BUILT_IN_OSC_MAPPING_PRESETS.filter(preset => !customIds.has(preset.id)).map((preset, index) => normalizeOscPreset({ ...preset, name: t(preset.name), description: t(preset.description) }, index, { isBuiltIn: true }));

  return [...builtInPresets, ...customPresets];
}

function getOscMappingPreset(config, presetId) {
  if (!presetId) return null;
  return getOscMappingPresets(config).find(preset => preset.id === presetId) || null;
}

function buildPresetDialogDraft(config, presetId, options = {}) {
  const fromCurrentMappings = options.fromCurrent === true;
  const preset = presetId ? getOscMappingPreset(config, presetId) : null;
  const fromBuiltIn = Boolean(preset?.isBuiltIn);
  const customPresetCount = getCustomOscMappingPresets(config).length;
  const sourceMappings = fromCurrentMappings ? options.currentMappings || [] : preset?.mappings || [];

  return {
    presetId: fromBuiltIn || !preset ? createDraftId('osc-preset') : preset.id,
    name: preset?.name ? (fromBuiltIn ? t("{0} · 自定义", [preset.name]) : preset.name) : t("OSC 预设 {0}", [customPresetCount + 1]),
    description: preset?.description || '',
    isNew: fromBuiltIn || !preset,
    fromBuiltIn,
    mappings: buildSignalDrafts(sourceMappings),
  };
}

function stripSignalDraft(signal) {
  const { _draftId, simulateEnabled, simulatedValue, ...rest } = signal;
  const mappedMin = Math.max(0, Math.min(999, Math.round(Number(rest.mappedMin ?? 0))));
  const mappedMaxCandidate = Math.max(0, Math.min(999, Math.round(Number(rest.mappedMax ?? 999))));
  const mappedMax = Math.max(mappedMin, mappedMaxCandidate);
  return {
    ...rest,
    oscPath: (rest.oscPath || '').trim(),
    vrchatMin: Number(rest.vrchatMin || 0),
    vrchatMax: Number(rest.vrchatMax || 0),
    mappedMin,
    mappedMax,
  };
}

function computeSignalHash(signals) {
  const cleaned = signals.map(stripSignalDraft).filter(s => Boolean(s.oscPath));
  return JSON.stringify(cleaned);
}

function normalizeCommandMode(commandMode) {
  return COMMAND_MODE_OPTIONS().some(option => option.value === commandMode) ? commandMode : 'Interval';
}

function describeCommandMode(commandMode) {
  const normalized = normalizeCommandMode(commandMode);
  if (normalized === 'None') return t("无");
  return normalized === 'Interval' ? t("时间 (I)") : t("速度 (S)");
}

function describeCommandModeDetail(commandMode) {
  const normalized = normalizeCommandMode(commandMode);
  if (normalized === 'None') {
    return t("斜率方式为“无”时，只发送位置值。下方速度限制会保留，但当前不会参与输出。");
  }

  return normalized === 'Interval'
    ? t("发送 I 指令；兼容性通常比 S 更好。下方速度限制仍然表示同一套速度上限，系统会按当前位移自动换算成对应的 I 时长。")
    : t("发送 S 指令；直接按速度上限约束该轴。若设备对 S 支持不稳定，建议优先使用时间 (I)。");
}

function getAxisModeSelectValue(axis) {
  const mode = AXIS_MODE_OPTIONS().some(option => option.value === axis?.mode) ? axis.mode : 'Normal';
  const invert = Boolean(axis?.invert);

  if (mode === 'Ignored') return 'Ignored';
  if (mode === 'Locked') return invert ? 'LockedInverted' : 'Locked';
  return invert ? 'NormalInverted' : 'Normal';
}

function parseAxisModeSelectValue(value) {
  const selected = AXIS_MODE_SELECT_OPTIONS().find(option => option.value === value);
  if (!selected) return { mode: 'Normal', invert: false };
  return { mode: selected.mode, invert: selected.invert };
}

function normalizeAxisLimitSpeed(value) {
  const numeric = Math.round(Number(value ?? DEFAULT_AXIS_PROFILE.maxSpeed));
  if (!Number.isFinite(numeric)) return DEFAULT_AXIS_PROFILE.maxSpeed;
  return Math.max(AXIS_LIMIT_MIN_SPEED, Math.min(AXIS_LIMIT_MAX_SPEED, numeric));
}

function formatAxisMotionLimitSummary(commandMode, maxSpeed) {
  const normalized = normalizeCommandMode(commandMode);
  if (normalized === 'None') return t("斜率 无");
  return t("{0} · 速度 {1}", [normalized === 'Interval' ? 'I' : 'S', normalizeAxisLimitSpeed(maxSpeed)]);
}

function formatRampTypeSummary(rampType) {
  const option = RAMP_TYPE_OPTIONS().find(item => item.value === (rampType || 'None'));
  return t("曲线 {0}", [option?.summaryLabel || t("无")]);
}

function getAxisMotionLimitFieldConfig(axis) {
  const commandMode = normalizeCommandMode(axis?.commandMode);
  return {
    label: t("速度限制"),
    title:
      commandMode === 'None'
        ? t("当前斜率方式为“无”，因此这个速度限制暂时不会参与输出；切回时间或速度后会继续沿用。")
        : t("无论发送 S 还是 I，这里限制的本质都是最大速度上限。选择 I 时，系统会按当前位移把这个速度上限换算成对应时长。"),
    value: normalizeAxisLimitSpeed(axis?.maxSpeed),
    min: AXIS_LIMIT_MIN_SPEED,
    max: AXIS_LIMIT_MAX_SPEED,
    step: 1,
    valueFormatter: next => `${Math.round(Number(next || 0))}`,
    toProfileValue: next => normalizeAxisLimitSpeed(next),
  };
}

function formatAxisPositionFromNormalized(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '—';
  return `${Math.max(0, Math.min(999, Math.round(numeric * 1000)))}`;
}

function buildAxisProfileAxisRows(profileCard) {
  const motion = normalizeMotionProfile(profileCard?.motion, false);
  return AXIS_PROFILE_DEFS().flatMap(axis => {
    const current = motion[axis.key];
    const defaults = createDefaultAxisProfileValue(axis.key);
    const details = [];

    const pushDetail = (label, changed = false, tone = 'neutral') => {
      details.push({ label, changed, tone });
    };

    if (current.mode === 'Ignored') return [];

    if (current.mode === 'Locked') {
      pushDetail(t("锁定 {0}", [formatAxisPositionFromNormalized(current.lockValue)]), true, 'warning');
      pushDetail(formatAxisMotionLimitSummary(current.commandMode, current.maxSpeed));
      if ((current.rampType || 'None') !== 'None') {
        pushDetail(formatRampTypeSummary(current.rampType), current.rampType !== defaults.rampType, 'warning');
      }
      if (current.invert) pushDetail(t("反向"), true, 'danger');
      return [{ axis: axis.axis, details }];
    }

    pushDetail(t("映射 {0}-{1}", [current.remapMin, current.remapMax]), current.remapMin !== defaults.remapMin || current.remapMax !== defaults.remapMax, 'remap');
    pushDetail(t("边界 {0}-{1}", [current.min, current.max]), current.min !== defaults.min || current.max !== defaults.max, 'bounds');
    pushDetail(formatAxisMotionLimitSummary(current.commandMode, current.maxSpeed));

    if ((current.rampType || 'None') !== 'None') {
      pushDetail(formatRampTypeSummary(current.rampType), current.rampType !== defaults.rampType, 'warning');
    }

    if (current.invert) pushDetail(t("反向"), true, 'danger');

    return [{ axis: axis.axis, details }];
  });
}

function isTCodeOutputType(type) {
  return type === 'TCodeSerial' || type === 'TCodeUdp' || type === 'TCodeTcp';
}

function getOutputTypeLabel(type) {
  return OUTPUT_TYPE_BY_VALUE()[type]?.label || t("输出设备");
}

function formatSlopeModeLabel(mode) {
  return OUTPUT_SLOPE_MODE_OPTIONS().find(option => option.value === mode)?.label || t("跟随轴配置");
}

function formatSpeedUnitBaseLabel(base) {
  return SPEED_UNIT_BASE_OPTIONS().find(option => option.value === base)?.label || t("每 100ms");
}

function getDefaultOutputPort(type) {
  if (type === 'TCodeUdp') return 9999;
  if (type === 'TCodeTcp') return 9998;
  if (type === 'OscParameter') return 9000;
  if (type === 'Mqtt') return 1883;
  return 12345;
}

function normalizeOutputComPort(value) {
  return (value || '').trim().toUpperCase();
}

function normalizeOutputHost(value, fallback = '127.0.0.1') {
  return (value || fallback).trim() || fallback;
}

function normalizeOutputPort(value, fallback) {
  const numeric = Math.round(Number(value || fallback));
  return Number.isFinite(numeric) && numeric > 0 && numeric <= 65535 ? numeric : fallback;
}

function normalizeOutputWebsocketAddress(value, fallback = 'ws://localhost:12345') {
  return (value || fallback).trim() || fallback;
}

function normalizeOutputSlopeMode(value) {
  return OUTPUT_SLOPE_MODE_OPTIONS().some(option => option.value === value) ? value : 'None';
}

function normalizeIntifaceVibrationAxis(value) {
  const axis = String(value ?? '').trim().toUpperCase();
  return ['V0', 'V1', 'V2', 'L0'].includes(axis) ? axis : 'V0';
}

function normalizeSpeedUnitBase(value) {
  return SPEED_UNIT_BASE_OPTIONS().some(option => option.value === value) ? value : 'Per100ms';
}

function getOutputDisplayName(output) {
  return (output?.name || '').trim() || getOutputTypeLabel(output?.type);
}

function getOutputTargetBindings(output) {
  if (!output?.type) return [];

  switch (output.type) {
    case 'TCodeSerial': {
      const comPort = normalizeOutputComPort(output.comPort);
      return comPort ? [{ key: `serial:${comPort}`, label: t("串口 {0}", [comPort]) }] : [];
    }

    case 'TCodeUdp':
    case 'TCodeTcp': {
      const host = normalizeOutputHost(output.host);
      const port = normalizeOutputPort(output.port, getDefaultOutputPort(output.type));
      const protocolLabel = output.type === 'TCodeUdp' ? t("UDP 地址") : t("TCP 地址");
      return [{ key: `net:${output.type}:${host.toLowerCase()}:${port}`, label: `${protocolLabel} ${host}:${port}` }];
    }

    case 'Intiface': {
      const websocketAddress = normalizeOutputWebsocketAddress(output.websocketAddress);
      const bindings = websocketAddress ? [{ key: `intiface-ws:${websocketAddress.toLowerCase()}`, label: t("Intiface 地址 {0}", [websocketAddress]) }] : [];
      if (output.manageEngineProcess === true) {
        const port = normalizeOutputPort(output.port, getDefaultOutputPort(output.type));
        bindings.push({ key: `intiface-engine:${port}`, label: t("Intiface 引擎端口 {0}", [port]) });
      }
      return bindings;
    }

    default:
      return [];
  }
}

function getOccupiedOutputTargetKeys(config, excludeOutputId = null) {
  const keys = new Set();
  getOutputs(config).forEach(output => {
    if (excludeOutputId && output.id === excludeOutputId) return;
    getOutputTargetBindings(output).forEach(binding => keys.add(binding.key));
  });
  return keys;
}

function findNextAvailablePort(startPort, isTaken) {
  const basePort = normalizeOutputPort(startPort, 1);
  for (let offset = 0; offset < 65535; offset += 1) {
    const candidate = ((basePort - 1 + offset) % 65535) + 1;
    if (!isTaken(candidate)) return candidate;
  }
  return basePort;
}

function getNextAvailableOscHubPort(targets, receiverPort, currentDraftId = null) {
  const normalizedTargets = Array.isArray(targets) ? targets : [];
  const occupied = new Set(
    normalizedTargets
      .filter(target => !currentDraftId || target._draftId !== currentDraftId)
      .map(target => `${normalizeOscHubHost(target?.host).toLowerCase()}:${normalizeOscHubPort(target?.port)}`),
  );
  const receiverNumeric = Math.round(Number(receiverPort || 9001));
  const normalizedReceiverPort = Number.isFinite(receiverNumeric) && receiverNumeric > 0 && receiverNumeric <= 65535 ? receiverNumeric : 9001;

  return findNextAvailablePort(DEFAULT_OSC_HUB_TARGET_PORT, candidate => {
    const key = `${DEFAULT_OSC_HUB_TARGET_HOST.toLowerCase()}:${candidate}`;
    return occupied.has(key) || candidate === normalizedReceiverPort;
  });
}

function buildSuggestedOutputTarget(type, config, serialPorts = [], currentOutputId = null) {
  const occupiedKeys = getOccupiedOutputTargetKeys(config, currentOutputId);

  if (type === 'TCodeSerial') {
    const availablePorts = Array.isArray(serialPorts)
      ? serialPorts.filter(port => {
          const portName = normalizeOutputComPort(port?.portName);
          return portName && !occupiedKeys.has(`serial:${portName}`);
        })
      : [];

    return {
      comPort: pickSmartComPort(availablePorts),
    };
  }

  if (type === 'TCodeUdp' || type === 'TCodeTcp') {
    const host = '127.0.0.1';
    const port = findNextAvailablePort(getDefaultOutputPort(type), candidate => occupiedKeys.has(`net:${type}:${host.toLowerCase()}:${candidate}`));
    return { host, port };
  }

  if (type === 'Intiface') {
    const port = findNextAvailablePort(getDefaultOutputPort(type), candidate => {
      const websocketAddress = normalizeOutputWebsocketAddress(`ws://localhost:${candidate}`);
      return occupiedKeys.has(`intiface-ws:${websocketAddress.toLowerCase()}`) || occupiedKeys.has(`intiface-engine:${candidate}`);
    });

    return {
      websocketAddress: `ws://localhost:${port}`,
      port,
      manageEngineProcess: false,
    };
  }

  return {};
}

function getOutputTargetConflicts(config, currentOutputId, draft) {
  if (!config || !draft) return [];

  const desiredBindings = getOutputTargetBindings(draft);
  if (desiredBindings.length === 0) return [];

  const otherOutputs = getOutputs(config).filter(output => output.id !== currentOutputId);
  const conflicts = [];

  desiredBindings.forEach(binding => {
    const owner = otherOutputs.find(output => getOutputTargetBindings(output).some(otherBinding => otherBinding.key === binding.key));
    if (owner) conflicts.push({ binding, owner });
  });

  return conflicts;
}

function formatOutputTargetConflictMessage(conflicts) {
  if (!Array.isArray(conflicts) || conflicts.length === 0) return '';
  return conflicts.map(({ binding, owner }) => t("{0} 已被“{1}”占用", [binding.label, getOutputDisplayName(owner)])).join('；');
}

function getOutputs(config) {
  return Array.isArray(config?.outputs) ? config.outputs : [];
}

function buildDefaultOutputName(type, config) {
  const index = getOutputs(config).filter(output => output.type === type).length + 1;
  return `${getOutputTypeLabel(type)} ${index}`;
}

function createOutputConfig(type, config, options = {}) {
  const suggestedTarget = buildSuggestedOutputTarget(type, config, options.serialPorts || [], options.currentOutputId || null);
  const firstBinding = makeOutputBinding([], type);
  const outputCount = getOutputs(config).filter(output => output.type === type).length;
  if (outputCount && type === 'OscParameter') firstBinding.address += String(outputCount + 1);
  const bindings = type === 'Dglab' ? [firstBinding, makeOutputBinding([firstBinding], type, { address: 'Pulse', sendMode: 'FixedRate',
    source: { sourceMode: 'Constant', value: 1 }, name: t('基础波形播放') })] : [firstBinding];
  return {
    id: createDraftId('output'),
    name: buildDefaultOutputName(type, config),
    type,
    enabled: false,
    motionProfileId: getDefaultAxisProfileId(config),
    comPort: '',
    host: '127.0.0.1',
    port: getDefaultOutputPort(type),
    manageEngineProcess: false,
    vibrationAxis: 'V0',
    websocketAddress: type === 'HttpJson' ? 'http://127.0.0.1:8080/sensa' : type === 'WebSocketJson' ? 'ws://127.0.0.1:8080/sensa' : 'ws://localhost:12345',
    slopeMode: 'None',
    speedUnitBase: 'Per100ms',
    ...(isSignalOutputType(type) ? { signal: buildSignalOutputDraft(type, { bindings }) } : {}),
    ...suggestedTarget,
  };
}

function normalizeOutputConfig(output, config, options = {}) {
  const fallback = createOutputConfig(output?.type || 'TCodeSerial', config, options);
  return {
    ...fallback,
    ...(output || {}),
    id: output?.id || fallback.id,
    name: (output?.name || fallback.name).trim(),
    type: output?.type || fallback.type,
    enabled: Boolean(output?.enabled),
    motionProfileId: isTCodeOutputType(output?.type || fallback.type) ? output?.motionProfileId || getDefaultAxisProfileId(config) : getDefaultAxisProfileId(config),
    comPort: normalizeOutputComPort(output?.comPort || fallback.comPort),
    host: normalizeOutputHost(output?.host, fallback.host),
    port: normalizeOutputPort(output?.port, fallback.port),
    manageEngineProcess: output?.manageEngineProcess === true,
    vibrationAxis: normalizeIntifaceVibrationAxis(output?.vibrationAxis),
    websocketAddress: ['HttpJson', 'WebSocketJson'].includes(output?.type || fallback.type)
      ? typeof output?.websocketAddress === 'string' ? output.websocketAddress.trim() : fallback.websocketAddress
      : normalizeOutputWebsocketAddress(output?.websocketAddress, fallback.websocketAddress),
    slopeMode: isTCodeOutputType(output?.type || fallback.type) ? normalizeOutputSlopeMode(output?.slopeMode ?? fallback.slopeMode) : 'None',
    speedUnitBase: isTCodeOutputType(output?.type || fallback.type) ? normalizeSpeedUnitBase(output?.speedUnitBase ?? fallback.speedUnitBase) : 'Per100ms',
    ...(isSignalOutputType(output?.type || fallback.type) || output?.signal ? { signal: buildSignalOutputDraft(output?.type || fallback.type, output?.signal || fallback.signal) } : {}),
  };
}

function getOutputConfig(config, outputId) {
  return getOutputs(config).find(output => output.id === outputId) || null;
}

function getOutputOverview(overview, outputId) {
  return Array.isArray(overview?.outputs) ? overview.outputs.find(output => output.id === outputId) || null : null;
}

function buildOutputSummary(output) {
  if (!output) return t("未配置");
  if (output.type === 'TCodeSerial') {
    const portLabel = output.comPort || t("未设置串口");
    return t("{0} · 事件驱动", [portLabel]);
  }
  if (output.type === 'TCodeUdp' || output.type === 'TCodeTcp') {
    return `${output.host || '127.0.0.1'}:${output.port || (output.type === 'TCodeUdp' ? 9999 : 9998)}`;
  }
  if (output.type === 'OscParameter' || output.type === 'Mqtt') return `${output.host || '127.0.0.1'}:${output.port || getDefaultOutputPort(output.type)}`;
  if (output.type === 'Dglab') return output.signal?.serverUrl || 'wss://trex.dungeon-lab.cn/v4';
  if (output.type === 'Recording') return `${recordingFormatOptions().find(option => option.value === (output.signal?.recordingFormat || 'Funscript'))?.label || output.signal.recordingFormat} · ${output.signal?.recordingName || t('自动命名')}`;
  if (output.type === 'Midi') return output.signal?.midiPortName || t('选择 MIDI 输出端口');
  return output.websocketAddress || 'ws://localhost:12345';
}

function cloneConfig(config) {
  return JSON.parse(JSON.stringify(config));
}

const OSR_DEVICE_KEYWORDS = ['ch340', 'ch341', 'cp210', 'ft232', 'ftdi', 'arduino', 'usb-serial', 'usb serial', 'serial'];

function isOserDevice(port) {
  const desc = (port.description || '').toLowerCase();
  return OSR_DEVICE_KEYWORDS.some(kw => desc.includes(kw));
}

function pickSmartComPort(ports) {
  if (!Array.isArray(ports) || ports.length === 0) return '';
  const osr = ports.filter(isOserDevice);
  if (osr.length > 0) return osr[0].portName;
  return ports[0].portName;
}

function normalizeSerialPorts(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map(item => {
    if (typeof item === 'string') return { portName: item, description: null };
    return { portName: item?.portName || '', description: item?.description || null };
  });
}

function buildOutputDialogDraft(outputId, config, serialPorts) {
  const output = getOutputConfig(config, outputId);
  if (!output) return null;

  return normalizeOutputConfig(output, config, { serialPorts, currentOutputId: outputId });
}

function mergeOutputDraft(outputId, config, draft) {
  const next = cloneConfig(config);
  next.schemaVersion = 5;
  next.outputs = getOutputs(config).map(output => {
    if (output.id !== outputId) return output;
    return {
      ...output,
      ...draft,
      type: output.type,
      id: output.id,
      manageEngineProcess: (draft.manageEngineProcess ?? output.manageEngineProcess) === true,
      vibrationAxis: normalizeIntifaceVibrationAxis(draft.vibrationAxis ?? output.vibrationAxis),
      motionProfileId: isTCodeOutputType(output.type) ? draft.motionProfileId || getDefaultAxisProfileId(config) : output.motionProfileId,
      ...(draft.signal || output.signal ? { signal: stripSignalOutputDraft(output.type, draft.signal || output.signal) } : {}),
    };
  });

  return next;
}

export { AXIS_LIMIT_MAX_SPEED, AXIS_LIMIT_MIN_SPEED, AXIS_MODE_SELECT_OPTIONS, AXIS_PROFILE_DEFS, AXIS_PROFILE_PRESETS, COMMAND_MODE_OPTIONS, DEFAULT_OSCQUERY_POLLING_RATE, DEFAULT_OSCQUERY_RECEIVER_HTTP_PORT, DEFAULT_OSCQUERY_RECEIVER_NAME, DEFAULT_OSC_HUB_RATE, OSC_HUB_MODE_OPTIONS, OUTPUT_SLOPE_MODE_OPTIONS, OUTPUT_TYPES, OUTPUT_TYPE_BY_VALUE, RAMP_TYPE_OPTIONS, SIGNAL_CURVE_OPTIONS, SIGNAL_ROLE_OPTIONS, SPEED_UNIT_BASE_OPTIONS, buildAxisProfileAxisRows, buildNewProfileDialogDraft, buildOscDraftFromConfig, buildOscHubTargetConflictLookup, buildOutputDialogDraft, buildOutputSummary, buildPresetDialogDraft, buildProfileDialogDraft, buildSignalDrafts, buildSignalOverlapWarnings, buildSuggestedOutputTarget, cloneConfig, cloneMotionProfile, computeSignalHash, createAxisProfilePresetMotion, createOutputConfig, describeCommandModeDetail, flattenOscHubConflictMessages, formatAxisPositionFromNormalized, formatOutputTargetConflictMessage, formatSlopeModeLabel, formatSpeedUnitBaseLabel, getAxisModeSelectValue, getAxisMotionLimitFieldConfig, getAxisProfile, getAxisProfiles, getCustomOscMappingPresets, getDefaultAxisProfile, getDefaultAxisProfileId, getNextAvailableOscHubPort, getOscMappingPreset, getOscMappingPresets, getOutputConfig, getOutputDisplayName, getOutputOverview, getOutputTargetConflicts, getOutputTypeLabel, getOutputs, getSignalSimulationDefaultValue, isTCodeOutputType, makeOscHubTargetDraft, makeSignalDraft, mergeOutputDraft, normalizeAxisLimitSpeed, normalizeAxisProfiles, normalizeCommandMode, normalizeOscHubHost, normalizeOscHubMode, normalizeOscHubPort, normalizeOscHubRate, normalizeOscQueryPollingRate, normalizeOutputSlopeMode, normalizeSerialPorts, normalizeSpeedUnitBase, parseAxisModeSelectValue, stripMotionProfile, stripOscHubTargetDraft, stripSignalDraft };

// Every saved edit crosses this interface: drafts, validation and references stay together.
// 所有保存操作通过同一 interface，草稿、校验与引用修复集中在此 module。
export function editConfiguration(config, change) {
  const next = cloneConfig(config);
  next.schemaVersion = 5;
  switch (change.kind) {
    case 'osc': {
      const messages = flattenOscHubConflictMessages(buildOscHubTargetConflictLookup(change.draft));
      if (messages.length) throw new Error(messages.join('；'));
      if (change.draft.ogbControlEnabled && doesOscHubTargetLoopToReceiver({ host: change.draft.ogbControlHost, port: change.draft.ogbControlPort }, change.draft.receiverHost, change.draft.receiverPort))
        throw new Error(t('OGB 控制目标不能指向 Sensa 的监听端口。'));
      next.osc = {
        ...next.osc,
        enabled: Boolean(change.draft.oscEnabled),
        receiverHost: (change.draft.receiverHost || '127.0.0.1').trim() || '127.0.0.1',
        inputTimeoutMs: Number(change.draft.inputTimeoutMs || 0),
        allowExperimentalSpatialInput: change.draft.allowExperimentalSpatialInput === true,
        allowedSourceAddresses: (change.draft.allowedSourceAddresses || '').split(/[ ,;\n]+/).filter(Boolean),
        receiverPort: Number(change.draft.receiverPort || 9001),
        ogbControl: {
          enabled: change.draft.ogbControlEnabled === true,
          host: (change.draft.ogbControlHost || '127.0.0.1').trim() || '127.0.0.1',
          port: normalizeOutputPort(change.draft.ogbControlPort, 9000),
        },
        oscQueryEnabled: Boolean(change.draft.oscQueryEnabled),
        oscQueryUrl: (change.draft.oscQueryUrl || '').trim(),
        oscQueryPolling: {
          enabled: Boolean(change.draft.oscQueryEnabled) && Boolean(change.draft.oscQueryPollingEnabled),
          rateHz: normalizeOscQueryPollingRate(change.draft.oscQueryPollingRateHz, DEFAULT_OSCQUERY_POLLING_RATE),
        },
        oscQueryReceiver: {
          enabled: Boolean(change.draft.oscQueryReceiverEnabled),
          serviceName: (change.draft.oscQueryReceiverServiceName || DEFAULT_OSCQUERY_RECEIVER_NAME).trim() || DEFAULT_OSCQUERY_RECEIVER_NAME,
          httpPort: Number(change.draft.oscQueryReceiverHttpPort || DEFAULT_OSCQUERY_RECEIVER_HTTP_PORT),
          advertiseAvatar: true,
          advertiseTracking: true,
        },
        hub: {
          enabled: Boolean(change.draft.hubEnabled),
          mode: normalizeOscHubMode(change.draft.hubMode),
          fixedRateHz: normalizeOscHubRate(change.draft.hubFixedRateHz, DEFAULT_OSC_HUB_RATE),
          forwardAvatarChange: true,
          targets: (Array.isArray(change.draft.hubTargets) ? change.draft.hubTargets : []).map(stripOscHubTargetDraft),
        },
      };
      break;
    }
    case 'mappings':
      next.signals = change.drafts.map(stripSignalDraft).filter(signal => Boolean(signal.oscPath));
      if (change.computedDrafts) next.computedSignals = change.computedDrafts.map(stripComputedDraft);
      break;
    case 'profile-save': {
      const draft = change.draft;
      const updated = { id: draft.profileId, name: (draft.name || t("轴配置")).trim() || t("轴配置"), isDefault: Boolean(draft.isDefault), motion: stripMotionProfile(draft.profile, false) };
      const profiles = getAxisProfiles(config);
      next.axisProfiles = profiles.some(p => p.id === updated.id) ? profiles.map(p => p.id === updated.id ? updated : p) : [...profiles, updated];
      const defaultId = updated.isDefault ? updated.id : next.axisProfiles.find(p => p.isDefault)?.id || next.axisProfiles[0].id;
      next.axisProfiles = next.axisProfiles.map(p => ({ ...p, isDefault: p.id === defaultId }));
      break;
    }
    case 'profile-default':
      if (!getAxisProfiles(config).some(p => p.id === change.id)) throw new Error('Unknown axis profile / 未知轴配置');
      next.axisProfiles = getAxisProfiles(config).map(p => ({ ...p, isDefault: p.id === change.id }));
      break;
    case 'profile-remove': {
      const fallback = getDefaultAxisProfileId(config);
      if (change.id === fallback) throw new Error(t("默认轴配置不能移除"));
      next.axisProfiles = getAxisProfiles(config).filter(p => p.id !== change.id);
      next.outputs = getOutputs(config).map(o => isTCodeOutputType(o.type) && o.motionProfileId === change.id ? { ...o, motionProfileId: fallback } : o);
      break;
    }
    case 'preset-save': {
      if (change.preset.mappings.some(signal => signal.sourceMode === 'Computed'))
        throw new Error(t('预设保存 OSC 参数与定位映射。计算信号及其轴映射请在映射页面一起保存。'));
      if (BUILT_IN_OSC_PRESET_IDS.has(change.preset.id)) throw new Error(t("内置预设不能删除；如需修改，请复制为自定义预设。"));
      const preset = { ...change.preset, mappings: change.preset.mappings.map(stripSignalDraft).filter(s => s.oscPath) };
      const presets = getCustomOscMappingPresets(config);
      next.oscMappingPresets = presets.some(p => p.id === preset.id) ? presets.map(p => p.id === preset.id ? preset : p) : [...presets, preset];
      break;
    }
    case 'preset-remove':
      if (BUILT_IN_OSC_PRESET_IDS.has(change.id)) throw new Error(t("内置预设不能删除；如需修改，请复制为自定义预设。"));
      next.oscMappingPresets = getCustomOscMappingPresets(config).filter(p => p.id !== change.id);
      break;
    case 'output-add':
      next.outputs = [...getOutputs(config), change.output];
      break;
    case 'output-enabled':
      next.outputs = getOutputs(config).map(o => o.id === change.id ? { ...o, enabled: Boolean(change.enabled) } : o);
      break;
    case 'output-remove':
      next.outputs = getOutputs(config).filter(o => o.id !== change.id);
      break;
    case 'output-save': {
      const conflicts = getOutputTargetConflicts(config, change.id, change.draft);
      if (conflicts.length) throw new Error(formatOutputTargetConflictMessage(conflicts));
      return mergeOutputDraft(change.id, config, change.draft);
    }
    default: throw new Error('Unknown configuration edit / 未知配置操作');
  }
  return next;
}
