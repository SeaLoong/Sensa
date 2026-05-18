const {
  Alert,
  Autocomplete,
  AppBar,
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Chip,
  CssBaseline,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  InputLabel,
  LinearProgress,
  MenuItem,
  Select,
  Slider,
  Snackbar,
  Stack,
  Switch,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Tooltip,
  Toolbar,
  Typography,
  createTheme,
  ThemeProvider,
} = MaterialUI;

const { useEffect, useMemo, useRef, useState } = React;

const STORAGE_KEY = 'sensa.studio.v4';
const WS_URL = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/ws`;
const DEFAULT_OSCQUERY_URL = 'http://127.0.0.1:9001/';

const INPUT_MODES = [
  { value: 'manual', label: '手动' },
  { value: 'osc', label: 'OSC' },
  { value: 'script', label: '脚本' },
];

const OUTPUT_TYPES = [
  { value: 'TCodeSerial', label: 'TCode 串口', shortLabel: '串口直连', scanSupported: false },
  { value: 'TCodeUdp', label: 'TCode UDP', shortLabel: 'UDP', scanSupported: false },
  { value: 'TCodeTcp', label: 'TCode TCP', shortLabel: 'TCP', scanSupported: false },
  { value: 'Intiface', label: 'Intiface', shortLabel: 'Buttplug', scanSupported: true },
];

const OUTPUT_TYPE_BY_VALUE = Object.fromEntries(OUTPUT_TYPES.map(item => [item.value, item]));

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

const MANUAL_AXES = [
  { key: 'L0', label: 'L0 主轴', min: 0, max: 999, step: 1, description: '主往复轴的逻辑目标值。0 表示最缩回，999 表示最伸出。输出层仍会继续套用轴配置约束。' },
  { key: 'L1', label: 'L1 前后', min: 0, max: 999, step: 1, description: '前后平移轴的逻辑目标值；按 TCode 约定，较小值朝前、较大值朝后，500 附近表示居中。输出层仍会继续套用轴配置约束。' },
  { key: 'L2', label: 'L2 左右', min: 0, max: 999, step: 1, description: '左右平移轴的逻辑目标值；按 TCode 约定，正向为用户左侧；500 附近表示居中。' },
  { key: 'R0', label: 'R0 扭转', min: 0, max: 999, step: 1, description: '绕 L0 轴旋转的扭转逻辑值；500 附近表示居中。' },
  { key: 'R1', label: 'R1 滚转', min: 0, max: 999, step: 1, description: '绕 L1 轴旋转的滚转逻辑值；500 附近表示居中。' },
  { key: 'R2', label: 'R2 俯仰', min: 0, max: 999, step: 1, description: '绕 L2 轴旋转的俯仰逻辑值；500 附近表示居中。' },
  { key: 'V0', label: 'V0 震动', min: 0, max: 999, step: 1, description: '主震动逻辑值。0 为关闭，999 为最大；输出层仍会继续套用轴配置约束。' },
  { key: 'V1', label: 'V1 震动 2', min: 0, max: 999, step: 1, description: '第二路震动逻辑值。0 为关闭，999 为最大。' },
  { key: 'V2', label: 'V2 震动 3', min: 0, max: 999, step: 1, description: '第三路震动逻辑值。0 为关闭，999 为最大。' },
  { key: 'A0', label: 'A0 辅助', min: 0, max: 999, step: 1, description: '辅助通道逻辑值；500 附近表示居中。' },
  { key: 'A1', label: 'A1 辅助 2', min: 0, max: 999, step: 1, description: '辅助通道 2 逻辑值；500 附近表示居中。' },
  { key: 'A2', label: 'A2 辅助 3', min: 0, max: 999, step: 1, description: '辅助通道 3 逻辑值；500 附近表示居中。' },
];

const SIGNAL_ROLE_OPTIONS = [
  { value: 'Depth', label: '主轴行程（L0）' },
  { value: 'Surge', label: '前后位移（L1）' },
  { value: 'Sway', label: '左右位移（L2）' },
  { value: 'AngleX', label: '滚转（R1）' },
  { value: 'AngleY', label: '俯仰（R2）' },
  { value: 'Twist', label: '扭转（R0）' },
  { value: 'V0', label: '震动（V0）' },
  { value: 'V1', label: '震动 2（V1）' },
  { value: 'V2', label: '震动 3（V2）' },
  { value: 'Auxiliary', label: '辅助（A0）' },
  { value: 'Auxiliary1', label: '辅助 2（A1）' },
  { value: 'Auxiliary2', label: '辅助 3（A2）' },
];

const SIGNAL_CURVE_OPTIONS = [
  { value: 'Linear', label: '线性' },
  { value: 'EaseIn', label: '缓入' },
  { value: 'EaseOut', label: '缓出' },
  { value: 'SCurve', label: '缓入缓出' },
];

const COMMAND_MODE_OPTIONS = [
  { value: 'Interval', label: '时间 (I)' },
  { value: 'Speed', label: '速度 (S)' },
  { value: 'None', label: '无' },
];

const MANUAL_MOTION_MODE_OPTIONS = [
  { value: 'Default', label: '跟随轴配置' },
  { value: 'Interval', label: '时间 (I)' },
  { value: 'Speed', label: '速度 (S)' },
];

const OUTPUT_SLOPE_MODE_OPTIONS = [
  { value: 'None', label: '跟随轴配置' },
  { value: 'Interval', label: '时间 (I)' },
  { value: 'Speed', label: '速度 (S)' },
  { value: 'NoSlope', label: '无' },
];

const SPEED_UNIT_BASE_OPTIONS = [
  { value: 'Per100ms', label: '每 100ms（默认）' },
  { value: 'PerSecond', label: '每秒' },
];

const RAMP_TYPE_OPTIONS = [
  { value: 'None', label: '无', summaryLabel: '无' },
  { value: 'Linear', label: '线性（=）', summaryLabel: '线性' },
  { value: 'EaseIn', label: '缓入（<）', summaryLabel: '缓入' },
  { value: 'EaseOut', label: '缓出（>）', summaryLabel: '缓出' },
  { value: 'EaseInOut', label: '缓入缓出（<>）', summaryLabel: '缓入缓出' },
];

const AXIS_LIMIT_MIN_SPEED = 1;
const AXIS_LIMIT_MAX_SPEED = 999;
const MANUAL_DEFAULT_SPEED = 999;
const MANUAL_DEFAULT_INTERVAL_MS = 100;
const MANUAL_INTERVAL_MAX_MS = 1000;

const AXIS_PROFILE_DEFS = [
  { key: 'l0', axis: 'L0', label: '主轴行程', minLabel: '最小', maxLabel: '最大' },
  { key: 'l1', axis: 'L1', label: '前后位移', minLabel: '前', maxLabel: '后' },
  { key: 'l2', axis: 'L2', label: '左右位移', minLabel: '右', maxLabel: '左' },
  { key: 'r0', axis: 'R0', label: '扭转', minLabel: '负向', maxLabel: '正向' },
  { key: 'r1', axis: 'R1', label: '滚转', minLabel: '负向', maxLabel: '正向' },
  { key: 'r2', axis: 'R2', label: '俯仰', minLabel: '负向', maxLabel: '正向' },
  { key: 'v0', axis: 'V0', label: '主震动', minLabel: '最小', maxLabel: '最大' },
  { key: 'v1', axis: 'V1', label: '震动 2', minLabel: '最小', maxLabel: '最大' },
  { key: 'v2', axis: 'V2', label: '震动 3', minLabel: '最小', maxLabel: '最大' },
  { key: 'a0', axis: 'A0', label: '辅助通道', minLabel: '最小', maxLabel: '最大' },
  { key: 'a1', axis: 'A1', label: '辅助通道 2', minLabel: '最小', maxLabel: '最大' },
  { key: 'a2', axis: 'A2', label: '辅助通道 3', minLabel: '最小', maxLabel: '最大' },
];

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

const AXIS_MODE_OPTIONS = [
  { value: 'Normal', label: '普通' },
  { value: 'Locked', label: '锁定' },
  { value: 'Ignored', label: '忽略' },
];

const AXIS_MODE_SELECT_OPTIONS = [
  { value: 'Normal', mode: 'Normal', invert: false, label: '普通' },
  { value: 'NormalInverted', mode: 'Normal', invert: true, label: '普通（反向）' },
  { value: 'Locked', mode: 'Locked', invert: false, label: '锁定' },
  { value: 'LockedInverted', mode: 'Locked', invert: true, label: '锁定（反向）' },
  { value: 'Ignored', mode: 'Ignored', invert: false, label: '忽略' },
];

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

const AXIS_PROFILE_PRESETS = [
  {
    id: 'sr6-full',
    name: 'SR6 / OSR6 六轴',
    description: '保留 L0 / L1 / L2 / R0 / R1 / R2 六个主运动轴，默认忽略 V0 / V1 / V2 / A0。',
  },
  {
    id: 'osr2-core',
    name: 'OSR2 三轴',
    description: '仅保留 L0 / R1 / R2（滚转 + 俯仰），忽略扭转与其他扩展轴。',
  },
  {
    id: 'l0-only',
    name: '仅 L0 主轴',
    description: '只让主往复轴参与控制，其余全部忽略。',
  },
  {
    id: 'l0-pose-lock',
    name: 'L0 + 固定姿态',
    description: '保留 L0，自由度姿态轴锁定中位，适合“手动摆好姿态后只让主轴动”的场景。',
  },
];

const BUILT_IN_OSC_MAPPING_PRESETS = [
  {
    id: 'ogb-socket-full',
    name: 'OGB Socket · 深度 + 姿态',
    description: '利用通配匹配任意 OGB Socket 孔位。深度使用完整行程；左右/上下姿态分别映射到 0-500 / 500-999 两段位置区间。',
    mappings: [
      { oscPath: 'OGB/Orf/*/Main/PenOthers', role: 'Depth', isOgbSocket: true },
      { oscPath: 'OGB/Orf/*/Main/AngleRight_Raw', role: 'AngleX', mappedMin: 500, mappedMax: 999, isOgbSocket: true },
      { oscPath: 'OGB/Orf/*/Main/AngleLeft_Raw', role: 'AngleX', mappedMin: 0, mappedMax: 500, isOgbSocket: true },
      { oscPath: 'OGB/Orf/*/Main/AngleUp_Raw', role: 'AngleY', mappedMin: 500, mappedMax: 999, isOgbSocket: true },
      { oscPath: 'OGB/Orf/*/Main/AngleDown_Raw', role: 'AngleY', mappedMin: 0, mappedMax: 500, isOgbSocket: true },
    ],
  },
  {
    id: 'ogb-plug-full',
    name: 'OGB Plug · 深度（插入 / 自插）',
    description: 'Plug 方标准深度参数，同时映射 PenOthers(插入他人)和 PenSelf(自插)。深度自动反向。',
    mappings: [
      { oscPath: 'OGB/Pen/*/PenOthers', role: 'Depth', invertDirection: true, isOgbPlug: true },
      { oscPath: 'OGB/Pen/*/PenSelf', role: 'Depth', invertDirection: true, isOgbPlug: true },
    ],
  },
  {
    id: 'ogb-plug-others',
    name: 'OGB Plug · 仅插入他人',
    description: '仅映射 PenOthers(插入他人深度)，不包含自插。',
    mappings: [{ oscPath: 'OGB/Pen/*/PenOthers', role: 'Depth', invertDirection: true, isOgbPlug: true }],
  },
  {
    id: 'ogb-plug-self',
    name: 'OGB Plug · 仅自插',
    description: '仅映射 PenSelf(自插深度)。需在 Sensa 组件中启用 generateSelfParam。',
    mappings: [{ oscPath: 'OGB/Pen/*/PenSelf', role: 'Depth', invertDirection: true, isOgbPlug: true }],
  },
  {
    id: 'osr-inserted-pussy',
    name: 'OSR-VRChat · 被插入（小穴）',
    description: 'OGB/Orf/Pussy/PenOthers 插入深度（仅 Depth 单轴）。直接参考 OSR-VRChat。',
    mappings: [{ oscPath: 'OGB/Orf/Pussy/PenOthers', role: 'Depth', isOgbSocket: true }],
  },
  {
    id: 'osr-inserted-ass',
    name: 'OSR-VRChat · 被插入（后庭）',
    description: 'OGB/Orf/Ass/PenOthers 插入深度（仅 Depth 单轴）。直接参考 OSR-VRChat。',
    mappings: [{ oscPath: 'OGB/Orf/Ass/PenOthers', role: 'Depth', isOgbSocket: true }],
  },
];

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

function createDefaultAxisProfileCard(name = '全局默认', options = {}) {
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
  const mode = AXIS_MODE_OPTIONS.some(option => option.value === next.mode) ? next.mode : 'Normal';
  const commandMode = COMMAND_MODE_OPTIONS.some(option => option.value === next.commandMode) ? next.commandMode : 'Interval';
  const rampType = RAMP_TYPE_OPTIONS.some(option => option.value === next.rampType) ? next.rampType : 'None';

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
  const defaultNameByIndex = index === 0 ? '轴配置 1' : `轴配置 ${index + 1}`;
  return {
    id: (profile?.id || (isDefault ? 'global-default' : `axis-profile-${index + 1}`)).trim(),
    name: (profile?.name || defaultNameByIndex).trim(),
    isDefault,
    motion: normalizeMotionProfile(profile?.motion, false),
  };
}

function normalizeAxisProfiles(config) {
  const source = Array.isArray(config?.axisProfiles) ? config.axisProfiles : [];
  const profiles = (source.length ? source : [createDefaultAxisProfileCard('全局默认', { isDefault: true })]).map((profile, index) => normalizeAxisProfileCard(profile, index));
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
    name: `轴配置 ${nextIndex}`,
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

function precisionFromStep(step) {
  if (!Number.isFinite(step) || step >= 1) return 0;
  const raw = `${step}`;
  if (raw.includes('e-')) return Number(raw.split('e-')[1] || 0);
  return raw.includes('.') ? raw.split('.')[1].length : 0;
}

function roundToStep(value, step) {
  const decimals = precisionFromStep(step);
  return Number(Number(value).toFixed(decimals));
}

function clampNumber(value, min = null, max = null, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;

  let next = numeric;
  if (Number.isFinite(min)) next = Math.max(min, next);
  if (Number.isFinite(max)) next = Math.min(max, next);
  return next;
}

function normalizeRangePair(start, end, options = {}) {
  const { min = null, max = null, step = 1, fallbackStart = 0, fallbackEnd = 0 } = options;
  let nextStart = clampNumber(start, min, max, fallbackStart);
  let nextEnd = clampNumber(end, min, max, fallbackEnd);
  nextStart = roundToStep(nextStart, step);
  nextEnd = roundToStep(nextEnd, step);
  return nextStart <= nextEnd ? [nextStart, nextEnd] : [nextEnd, nextStart];
}

function getDynamicFloatSliderBounds(values, defaults = { min: 0, max: 1 }) {
  const finiteValues = values.map(Number).filter(Number.isFinite);
  const lower = Math.min(defaults.min, ...(finiteValues.length ? finiteValues : [defaults.min]));
  const upper = Math.max(defaults.max, ...(finiteValues.length ? finiteValues : [defaults.max]));
  const min = Number((Math.floor(lower * 100) / 100).toFixed(2));
  const max = Number((Math.ceil(upper * 100) / 100).toFixed(2));
  return [min, max > min ? max : min + 1];
}

function formatCompactNumber(value, decimals = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '—';
  return decimals > 0 ? numeric.toFixed(decimals) : `${Math.round(numeric)}`;
}

function makeSignalDraft(signal = {}) {
  const role = signal.role || 'Depth';
  const mappedMinCandidate = signal.mappedMin ?? 0;
  const mappedMaxCandidate = signal.mappedMax ?? 999;
  const mappedMin = Math.max(0, Math.min(999, Number(mappedMinCandidate ?? 0)));
  const mappedMax = Math.max(mappedMin, Math.min(999, Number(mappedMaxCandidate ?? 999)));
  return {
    _draftId: createDraftId('signal'),
    oscPath: '',
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
}

function buildSignalDrafts(signals) {
  return Array.isArray(signals) ? signals.map(signal => makeSignalDraft(signal)) : [];
}

function createOscPresetDraft(name = '新预设', options = {}) {
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
    name: (preset?.name || `OSC 预设 ${index + 1}`).trim(),
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
  const builtInPresets = BUILT_IN_OSC_MAPPING_PRESETS.filter(preset => !customIds.has(preset.id)).map((preset, index) => normalizeOscPreset(preset, index, { isBuiltIn: true }));

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
    name: preset?.name ? (fromBuiltIn ? `${preset.name} · 自定义` : preset.name) : `OSC 预设 ${customPresetCount + 1}`,
    description: preset?.description || '',
    isNew: fromBuiltIn || !preset,
    fromBuiltIn,
    mappings: buildSignalDrafts(sourceMappings),
  };
}

function stripSignalDraft(signal) {
  const { _draftId, ...rest } = signal;
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
  return COMMAND_MODE_OPTIONS.some(option => option.value === commandMode) ? commandMode : 'Interval';
}

function describeCommandMode(commandMode) {
  const normalized = normalizeCommandMode(commandMode);
  if (normalized === 'None') return '无';
  return normalized === 'Interval' ? '时间 (I)' : '速度 (S)';
}

function describeCommandModeDetail(commandMode) {
  const normalized = normalizeCommandMode(commandMode);
  if (normalized === 'None') {
    return '斜率方式为“无”时，只发送位置值。下方速度限制会保留，但当前不会参与输出。';
  }

  return normalized === 'Interval'
    ? '发送 I 指令；兼容性通常比 S 更好。下方速度限制仍然表示同一套速度上限，系统会按当前位移自动换算成对应的 I 时长。'
    : '发送 S 指令；直接按速度上限约束该轴。若设备对 S 支持不稳定，建议优先使用时间 (I)。';
}

function getAxisModeSelectValue(axis) {
  const mode = AXIS_MODE_OPTIONS.some(option => option.value === axis?.mode) ? axis.mode : 'Normal';
  const invert = Boolean(axis?.invert);

  if (mode === 'Ignored') return 'Ignored';
  if (mode === 'Locked') return invert ? 'LockedInverted' : 'Locked';
  return invert ? 'NormalInverted' : 'Normal';
}

function parseAxisModeSelectValue(value) {
  const selected = AXIS_MODE_SELECT_OPTIONS.find(option => option.value === value);
  if (!selected) return { mode: 'Normal', invert: false };
  return { mode: selected.mode, invert: selected.invert };
}

function normalizeAxisLimitSpeed(value) {
  const numeric = Math.round(Number(value ?? DEFAULT_AXIS_PROFILE.maxSpeed));
  if (!Number.isFinite(numeric)) return DEFAULT_AXIS_PROFILE.maxSpeed;
  return Math.max(AXIS_LIMIT_MIN_SPEED, Math.min(AXIS_LIMIT_MAX_SPEED, numeric));
}

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

function formatAxisMotionLimitSummary(commandMode, maxSpeed) {
  const normalized = normalizeCommandMode(commandMode);
  if (normalized === 'None') return '斜率 无';
  return `${normalized === 'Interval' ? 'I' : 'S'} · 速度 ${normalizeAxisLimitSpeed(maxSpeed)}`;
}

function formatRampTypeSummary(rampType) {
  const option = RAMP_TYPE_OPTIONS.find(item => item.value === (rampType || 'None'));
  return `曲线 ${option?.summaryLabel || '无'}`;
}

function getAxisMotionLimitFieldConfig(axis) {
  const commandMode = normalizeCommandMode(axis?.commandMode);
  return {
    label: '速度限制',
    title:
      commandMode === 'None'
        ? '当前斜率方式为“无”，因此这个速度限制暂时不会参与输出；切回时间或速度后会继续沿用。'
        : '无论发送 S 还是 I，这里限制的本质都是最大速度上限。选择 I 时，系统会按当前位移把这个速度上限换算成对应时长。',
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
  return AXIS_PROFILE_DEFS.flatMap(axis => {
    const current = motion[axis.key];
    const defaults = createDefaultAxisProfileValue(axis.key);
    const details = [];

    const pushDetail = (label, changed = false, tone = 'neutral') => {
      details.push({ label, changed, tone });
    };

    if (current.mode === 'Ignored') return [];

    if (current.mode === 'Locked') {
      pushDetail(`锁定 ${formatAxisPositionFromNormalized(current.lockValue)}`, true, 'warning');
      pushDetail(formatAxisMotionLimitSummary(current.commandMode, current.maxSpeed));
      if ((current.rampType || 'None') !== 'None') {
        pushDetail(formatRampTypeSummary(current.rampType), current.rampType !== defaults.rampType, 'warning');
      }
      if (current.invert) pushDetail('反向', true, 'danger');
      return [{ axis: axis.axis, details }];
    }

    pushDetail(`映射 ${current.remapMin}-${current.remapMax}`, current.remapMin !== defaults.remapMin || current.remapMax !== defaults.remapMax, 'remap');
    pushDetail(`边界 ${current.min}-${current.max}`, current.min !== defaults.min || current.max !== defaults.max, 'bounds');
    pushDetail(formatAxisMotionLimitSummary(current.commandMode, current.maxSpeed));

    if ((current.rampType || 'None') !== 'None') {
      pushDetail(formatRampTypeSummary(current.rampType), current.rampType !== defaults.rampType, 'warning');
    }

    if (current.invert) pushDetail('反向', true, 'danger');

    return [{ axis: axis.axis, details }];
  });
}

function isTCodeOutputType(type) {
  return type === 'TCodeSerial' || type === 'TCodeUdp' || type === 'TCodeTcp';
}

function getOutputTypeLabel(type) {
  return OUTPUT_TYPE_BY_VALUE[type]?.label || '输出设备';
}

function formatSlopeModeLabel(mode) {
  return OUTPUT_SLOPE_MODE_OPTIONS.find(option => option.value === mode)?.label || '跟随轴配置';
}

function formatSpeedUnitBaseLabel(base) {
  return SPEED_UNIT_BASE_OPTIONS.find(option => option.value === base)?.label || '每 100ms（默认）';
}

function getDefaultOutputPort(type) {
  if (type === 'TCodeUdp') return 9999;
  if (type === 'TCodeTcp') return 9998;
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
  return OUTPUT_SLOPE_MODE_OPTIONS.some(option => option.value === value) ? value : 'None';
}

function normalizeSpeedUnitBase(value) {
  return SPEED_UNIT_BASE_OPTIONS.some(option => option.value === value) ? value : 'Per100ms';
}

function getOutputDisplayName(output) {
  return (output?.name || '').trim() || getOutputTypeLabel(output?.type);
}

function getOutputTargetBindings(output) {
  if (!output?.type) return [];

  switch (output.type) {
    case 'TCodeSerial': {
      const comPort = normalizeOutputComPort(output.comPort);
      return comPort ? [{ key: `serial:${comPort}`, label: `串口 ${comPort}` }] : [];
    }

    case 'TCodeUdp':
    case 'TCodeTcp': {
      const host = normalizeOutputHost(output.host);
      const port = normalizeOutputPort(output.port, getDefaultOutputPort(output.type));
      const protocolLabel = output.type === 'TCodeUdp' ? 'UDP 地址' : 'TCP 地址';
      return [{ key: `net:${output.type}:${host.toLowerCase()}:${port}`, label: `${protocolLabel} ${host}:${port}` }];
    }

    case 'Intiface': {
      const websocketAddress = normalizeOutputWebsocketAddress(output.websocketAddress);
      const bindings = websocketAddress ? [{ key: `intiface-ws:${websocketAddress.toLowerCase()}`, label: `Intiface 地址 ${websocketAddress}` }] : [];
      if (output.manageEngineProcess !== false) {
        const port = normalizeOutputPort(output.port, getDefaultOutputPort(output.type));
        bindings.push({ key: `intiface-engine:${port}`, label: `Intiface 引擎端口 ${port}` });
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
      manageEngineProcess: true,
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
  return conflicts.map(({ binding, owner }) => `${binding.label} 已被“${getOutputDisplayName(owner)}”占用`).join('；');
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
  return {
    id: createDraftId('output'),
    name: buildDefaultOutputName(type, config),
    type,
    enabled: false,
    motionProfileId: getDefaultAxisProfileId(config),
    comPort: '',
    host: '127.0.0.1',
    port: getDefaultOutputPort(type),
    manageEngineProcess: true,
    websocketAddress: 'ws://localhost:12345',
    slopeMode: 'None',
    speedUnitBase: 'Per100ms',
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
    manageEngineProcess: output?.manageEngineProcess !== false,
    websocketAddress: normalizeOutputWebsocketAddress(output?.websocketAddress, fallback.websocketAddress),
    slopeMode: isTCodeOutputType(output?.type || fallback.type) ? normalizeOutputSlopeMode(output?.slopeMode ?? fallback.slopeMode) : 'None',
    speedUnitBase: isTCodeOutputType(output?.type || fallback.type) ? normalizeSpeedUnitBase(output?.speedUnitBase ?? fallback.speedUnitBase) : 'Per100ms',
  };
}

function getOutputConfig(config, outputId) {
  return getOutputs(config).find(output => output.id === outputId) || null;
}

function getOutputOverview(overview, outputId) {
  return Array.isArray(overview?.outputs) ? overview.outputs.find(output => output.id === outputId) || null : null;
}

function buildOutputSummary(output) {
  if (!output) return '未配置';
  if (output.type === 'TCodeSerial') {
    const portLabel = output.comPort || '未设置串口';
    return `${portLabel} · 事件驱动`;
  }
  if (output.type === 'TCodeUdp' || output.type === 'TCodeTcp') {
    return `${output.host || '127.0.0.1'}:${output.port || (output.type === 'TCodeUdp' ? 9999 : 9998)}`;
  }
  return output.websocketAddress || 'ws://localhost:12345';
}

const WS_REQUEST_TIMEOUT_MS = 15000;

let _wsRequestId = 0;
const _wsPending = new Map();
let _wsCommandSocket = null;
let _wsReadyWaiters = [];

function setWsCommandSocket(socket) {
  _wsCommandSocket = socket;
}

function resolveWsReadyWaiters(socket = _wsCommandSocket) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;

  const waiters = _wsReadyWaiters;
  _wsReadyWaiters = [];
  waiters.forEach(waiter => {
    clearTimeout(waiter.timeout);
    waiter.resolve(socket);
  });
}

function rejectWsReadyWaiters(error) {
  if (_wsReadyWaiters.length === 0) return;

  const reason = error instanceof Error ? error : new Error('实时连接不可用');
  const waiters = _wsReadyWaiters;
  _wsReadyWaiters = [];
  waiters.forEach(waiter => {
    clearTimeout(waiter.timeout);
    waiter.reject(reason);
  });
}

function waitForWsReady(timeoutMs = WS_REQUEST_TIMEOUT_MS) {
  if (_wsCommandSocket && _wsCommandSocket.readyState === WebSocket.OPEN) {
    return Promise.resolve(_wsCommandSocket);
  }

  return new Promise((resolve, reject) => {
    const waiter = {
      resolve,
      reject,
      timeout: window.setTimeout(() => {
        _wsReadyWaiters = _wsReadyWaiters.filter(item => item !== waiter);
        reject(new Error('实时连接未就绪，请稍后重试。'));
      }, timeoutMs),
    };

    _wsReadyWaiters.push(waiter);
  });
}

async function apiRequest(path, options = {}) {
  await waitForWsReady();
  return wsRequest(path, options);
}

function clearWsPendingRequests(error) {
  for (const [, pending] of _wsPending) {
    clearTimeout(pending.timeout);
    pending.reject(error instanceof Error ? error : new Error('实时连接已断开'));
  }

  _wsPending.clear();
}

function wsRequest(path, options = {}) {
  return new Promise((resolve, reject) => {
    if (!_wsCommandSocket || _wsCommandSocket.readyState !== WebSocket.OPEN) {
      reject(new Error('实时连接未建立，请稍后重试。'));
      return;
    }

    const id = ++_wsRequestId;
    const method = options.method || 'GET';
    const msg = { id: String(id), method, path };

    if (options.body) {
      msg.body = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
    }

    const timeout = setTimeout(() => {
      _wsPending.delete(String(id));
      reject(new Error(`请求超时：${path}`));
    }, WS_REQUEST_TIMEOUT_MS);

    _wsPending.set(String(id), { resolve, reject, timeout });

    try {
      _wsCommandSocket.send(JSON.stringify(msg));
    } catch (err) {
      _wsPending.delete(String(id));
      clearTimeout(timeout);
      reject(err instanceof Error ? err : new Error('发送请求失败。'));
    }
  });
}

function cloneConfig(config) {
  return JSON.parse(JSON.stringify(config));
}

function loadStudio() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
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

function sanitizeStudio(raw, config) {
  return {
    preferredInputTab: INPUT_MODES.some(item => item.value === raw?.preferredInputTab) ? raw.preferredInputTab : 'manual',
  };
}

function globMatch(pattern, path) {
  // Split both into segments
  const pSegs = pattern.split('/');
  const sSegs = path.split('/');
  let pi = 0,
    si = 0;
  while (pi < pSegs.length && si < sSegs.length) {
    if (pSegs[pi] === '**') {
      // ** matches zero or more segments — try all remaining positions
      for (let end = si; end <= sSegs.length; end++) {
        if (globMatch(pSegs.slice(pi + 1).join('/'), sSegs.slice(end).join('/'))) return true;
      }
      return false;
    }
    if (pSegs[pi] === '*' || pSegs[pi] === sSegs[si]) {
      pi++;
      si++;
      continue;
    }
    return false;
  }
  // Allow trailing ** to match zero remaining
  if (pi < pSegs.length && pSegs[pi] === '**' && pi + 1 === pSegs.length) return true;
  return pi === pSegs.length && si === sSegs.length;
}

function matchesOscPathPattern(pattern, actualPath) {
  const p = (pattern || '').trim();
  const a = (actualPath || '').trim();
  if (!p || !a) return false;
  if (!p.includes('*')) return p === a; // exact match fast path
  return globMatch(p, a);
}

function getLatestOscPreviewEntry(previewEntries, pattern, preferredSourceKey = '') {
  const matches = Array.isArray(previewEntries) ? previewEntries.filter(entry => matchesOscPathPattern(pattern, entry?.path || '')) : [];
  const candidates = preferredSourceKey ? matches.filter(entry => entry?.sourceKey === preferredSourceKey) : matches;
  if (candidates.length === 0) return null;

  const latest = candidates.reduce((current, entry) => {
    if (!current) return entry;
    return Number(entry?.timestampMs || 0) > Number(current?.timestampMs || 0) ? entry : current;
  }, null);

  return latest ? { ...latest, matchCount: candidates.length } : null;
}

function isOgbOscPath(path) {
  return (path || '').trim().toUpperCase().startsWith('OGB/');
}

function compareOscPathSuggestions(left, right) {
  const leftPath = (left || '').trim();
  const rightPath = (right || '').trim();
  const leftPriority = isOgbOscPath(leftPath) ? 0 : 1;
  const rightPriority = isOgbOscPath(rightPath) ? 0 : 1;

  if (leftPriority !== rightPriority) return leftPriority - rightPriority;
  return leftPath.localeCompare(rightPath, 'en', { numeric: true, sensitivity: 'base' });
}

function buildOscPathSuggestions(previewEntries, queryNodes = []) {
  const previewPaths = (Array.isArray(previewEntries) ? previewEntries : []).map(entry => (entry?.path || '').trim());
  const queryPaths = (Array.isArray(queryNodes) ? queryNodes : []).map(node => (node?.path || '').trim());
  return Array.from(new Set([...previewPaths, ...queryPaths].filter(Boolean))).sort(compareOscPathSuggestions);
}

function filterOscPreviewEntriesBySource(previewEntries, sourceKey = '') {
  if (!sourceKey) return Array.isArray(previewEntries) ? previewEntries : [];
  return (Array.isArray(previewEntries) ? previewEntries : []).filter(entry => entry?.sourceKey === sourceKey);
}

function formatOscSourceLabel(source) {
  if (!source) return '未知来源';
  return source.label || (source.address && source.port ? `${source.address}:${source.port}` : source.key || '未知来源');
}

function buildOscSourceSelectionOptions(sources) {
  const normalizedSources = Array.isArray(sources) ? sources : [];
  return [{ value: '', label: '自动选择' }, ...normalizedSources.map(source => ({ value: source.key, label: formatOscSourceLabel(source) }))];
}

function formatPreviewTimestamp(timestampMs) {
  if (!timestampMs) return '—';
  const value = new Date(timestampMs);
  if (Number.isNaN(value.getTime())) return '—';
  return value.toLocaleTimeString();
}

function applySignalCurve(value, curve) {
  switch (curve) {
    case 'EaseIn':
      return value * value;
    case 'EaseOut':
      return 1 - (1 - value) * (1 - value);
    case 'SCurve':
      return value < 0.5 ? 2 * value * value : 1 - 2 * (1 - value) * (1 - value);
    default:
      return value;
  }
}

function computeSignalPreviewOutput(signal, rawValue) {
  const numericValue = Number(rawValue);
  if (!signal || !Number.isFinite(numericValue)) return null;

  const inputMin = Number(signal.invertDirection ? signal.vrchatMax : signal.vrchatMin);
  const inputMax = Number(signal.invertDirection ? signal.vrchatMin : signal.vrchatMax);
  const range = inputMax - inputMin;
  const normalized = Math.abs(range) < 0.0001 ? 0 : Math.max(0, Math.min(1, (numericValue - inputMin) / range));
  const curved = applySignalCurve(normalized, signal.curve);
  const mappedStart = Math.max(0, Math.min(999, Number(signal.mappedMin ?? 0)));
  const mappedEnd = Math.max(0, Math.min(999, Number(signal.mappedMax ?? 999)));
  const mappedPosition = mappedStart + curved * (mappedEnd - mappedStart);

  return {
    mappedPosition,
    mappedPositionText: `${Math.max(0, Math.min(999, Math.round(mappedPosition)))}`,
  };
}

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
      return '轴模式为“忽略”，不发送该轴指令';
    case 'post-profile-unchanged':
      return '轴配置处理后目标未变化，跳过发送';
    default:
      return note || '';
  }
}

function formatAxisTraceAction(action) {
  switch ((action || '').toLowerCase()) {
    case 'emit':
      return { label: '已发送指令', color: 'primary' };
    case 'hold':
      return { label: '目标未变化', color: 'default' };
    case 'skip':
      return { label: '目标未变化', color: 'default' };
    case 'ignored':
      return { label: '轴已忽略', color: 'warning' };
    default:
      return { label: action || '未知阶段', color: 'default' };
  }
}

function formatAxisTraceMode(mode) {
  switch ((mode || '').toLowerCase()) {
    case 'normal':
      return '普通';
    case 'locked':
      return '锁定';
    case 'ignored':
      return '忽略';
    default:
      return mode || '';
  }
}

function formatAxisTraceTerm(term) {
  const text = (term || '').trim().toUpperCase();
  if (!text) return '';
  if (text.startsWith('S')) return `速度指令 ${text}`;
  if (text.startsWith('I')) return `时长指令 ${text}`;
  return text;
}

function formatAxisDisplayValue(value, decimals = 0) {
  if (!Number.isFinite(Number(value))) return '—';
  return decimals > 0 ? Number(value).toFixed(decimals) : `${Math.round(Number(value))}`;
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
  return INPUT_MODES.find(item => item.value === mode)?.label || '未知输入';
}

function formatDuration(ms) {
  const value = Math.max(0, Number(ms || 0));
  const totalSeconds = Math.floor(value / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const remainder = Math.floor((value % 1000) / 10);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(remainder).padStart(2, '0')}`;
}

function getScriptStateMeta(state) {
  switch ((state || '').toLowerCase()) {
    case 'playing':
      return { label: '播放中', color: 'success' };
    case 'paused':
      return { label: '已暂停', color: 'warning' };
    case 'finished':
      return { label: '已完成', color: 'primary' };
    case 'stopped':
      return { label: '已就绪', color: 'default' };
    default:
      return { label: '未加载', color: 'default' };
  }
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
  if (state === 'connected') return '实时连接 在线';
  if (state === 'connecting') return '实时连接 连接中';
  return '实时连接 离线';
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
      motionProfileId: isTCodeOutputType(output.type) ? draft.motionProfileId || getDefaultAxisProfileId(config) : output.motionProfileId,
    };
  });

  return next;
}

function TabPanel({ value, current, children }) {
  return value === current ? <Box sx={{ pt: 2 }}>{children}</Box> : null;
}

function MetricCard({ label, value, tone = 'default' }) {
  return (
    <Box className={`metric-card metric-card--${tone}`}>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="h6">{value}</Typography>
    </Box>
  );
}

function HelpLabel({ text, title, placement = 'top' }) {
  const content = (
    <Box component="span" className={`field-help-label${title ? ' field-help-label--hint' : ''}`}>
      {text}
    </Box>
  );

  return title ? (
    <Tooltip title={title} arrow placement={placement}>
      {content}
    </Tooltip>
  ) : (
    content
  );
}

function TooltipHintIcon({ title, placement = 'top', className = '', ariaLabel = '查看说明' }) {
  if (!title) return null;

  return (
    <Tooltip title={title} arrow placement={placement}>
      <Box component="span" tabIndex={0} role="img" aria-label={ariaLabel} className={`field-hint-icon${className ? ` ${className}` : ''}`}>
        i
      </Box>
    </Tooltip>
  );
}

function FieldPanel({ label, title, valueText = null, className = '', children }) {
  return (
    <Box className={`field-panel${className ? ` ${className}` : ''}`}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" className="field-panel__header">
        <Typography variant="caption" color="text.secondary" component="div">
          <HelpLabel text={label} title={title} />
        </Typography>
        <Typography variant="caption" className="field-panel__value">
          {valueText ?? '\u00A0'}
        </Typography>
      </Stack>

      <Box className="field-panel__body">{children}</Box>
    </Box>
  );
}

function SelectField({
  label,
  title,
  value,
  onChange,
  options,
  disabled = false,
  className = '',
  variant = 'panel',
  hintTitle = '',
  hintPlacement = 'top',
  formControlProps = {},
  selectProps = {},
  menuProps,
  renderOption,
  fullWidth,
}) {
  const normalizedOptions = Array.isArray(options) ? options : [];
  const selectedOption = normalizedOptions.find(option => option.value === value) || null;
  const isInline = variant === 'inline';
  const isFloating = variant === 'floating';
  const isCompact = variant === 'compact';
  const shouldRenderInputLabel = isInline || isFloating || isCompact;
  const resolvedFullWidth = typeof fullWidth === 'boolean' ? fullWidth : !isCompact;

  const selectControl = (
    <FormControl
      size="small"
      fullWidth={resolvedFullWidth}
      className={`select-field__control${isFloating ? ' select-field__control--floating' : ''}${isCompact ? ' select-field__control--compact' : ''}`}
      disabled={disabled}
      {...formControlProps}
    >
      {shouldRenderInputLabel && (
        <InputLabel
          className={`select-field__input-label${title && !(isFloating || isCompact) ? ' select-field__input-label--hint' : ''}${isFloating ? ' select-field__input-label--floating' : ''}${isCompact ? ' select-field__input-label--compact' : ''}`}
        >
          {isFloating || isCompact ? <HelpLabel text={label} title={title} placement={hintPlacement} /> : label}
        </InputLabel>
      )}
      <Select value={value} label={shouldRenderInputLabel ? label : undefined} MenuProps={menuProps} onChange={event => onChange(event.target.value)} {...selectProps}>
        {normalizedOptions.map(option => (
          <MenuItem key={option.value} value={option.value} disabled={Boolean(option.disabled)}>
            {typeof renderOption === 'function' ? renderOption(option) : option.label}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );

  if (isCompact) {
    return <Box className={`select-field select-field--compact${className ? ` ${className}` : ''}`}>{selectControl}</Box>;
  }

  if (isInline) {
    const inlineField = (
      <Box className={`select-field select-field--inline${className ? ` ${className}` : ''}`}>
        {selectControl}
        <TooltipHintIcon title={hintTitle} placement={hintPlacement} className="select-field__hint" />
      </Box>
    );

    return title ? (
      <Tooltip title={title} arrow placement="top">
        <Box>{inlineField}</Box>
      </Tooltip>
    ) : (
      inlineField
    );
  }

  if (isFloating) {
    return <Box className={`select-field select-field--floating${className ? ` ${className}` : ''}`}>{selectControl}</Box>;
  }

  return (
    <FieldPanel label={label} title={title} valueText={selectedOption?.label || null} className={`select-field${className ? ` ${className}` : ''}`}>
      {selectControl}
    </FieldPanel>
  );
}

function SliderControl({ value, onChange, onChangeCommitted, valueFormatter = next => next, className = '', valueLabelDisplay = 'auto', ...props }) {
  return (
    <Slider
      {...props}
      className={`slider-control${className ? ` ${className}` : ''}`}
      value={value}
      valueLabelDisplay={valueLabelDisplay}
      valueLabelFormat={valueFormatter}
      onChange={(_, next) => onChange?.(next)}
      onChangeCommitted={(_, next) => onChangeCommitted?.(next)}
    />
  );
}

function SliderField({
  label,
  title,
  value,
  onChange,
  sliderMin,
  sliderMax,
  step = 1,
  min,
  max,
  valueFormatter = next => formatCompactNumber(next, precisionFromStep(step)),
}) {
  const isRange = Array.isArray(value);
  const [startValue, endValue] = isRange ? value : [value, value];
  const minBound = Number.isFinite(min) ? min : sliderMin;
  const maxBound = Number.isFinite(max) ? max : sliderMax;

  const handleChange = next => {
    if (isRange) {
      const [nextStart, nextEnd] = Array.isArray(next) ? next : [next, next];
      onChange(
        normalizeRangePair(nextStart, nextEnd, {
          min: Number.isFinite(minBound) ? minBound : null,
          max: Number.isFinite(maxBound) ? maxBound : null,
          step,
          fallbackStart: startValue,
          fallbackEnd: endValue,
        }),
      );
      return;
    }

    onChange(
      normalizeRangePair(next, next, {
        min: Number.isFinite(minBound) ? minBound : null,
        max: Number.isFinite(maxBound) ? maxBound : null,
        step,
        fallbackStart: startValue,
        fallbackEnd: startValue,
      })[0],
    );
  };

  return (
    <FieldPanel label={label} title={title} valueText={isRange ? `${valueFormatter(startValue)}-${valueFormatter(endValue)}` : valueFormatter(startValue)} className="range-field">
      <SliderControl
        min={sliderMin}
        max={sliderMax}
        step={step}
        value={isRange ? [startValue, endValue] : startValue}
        valueFormatter={valueFormatter}
        onChange={next => handleChange(next)}
      />
    </FieldPanel>
  );
}

function RangeField({
  label,
  title,
  value,
  onChange,
  sliderMin,
  sliderMax,
  step = 1,
  inputStep = step,
  inputMin,
  inputMax,
  startLabel = '起',
  endLabel = '止',
  valueFormatter = next => formatCompactNumber(next, precisionFromStep(step)),
}) {
  return (
    <SliderField
      label={label}
      title={title}
      value={value}
      onChange={onChange}
      sliderMin={sliderMin}
      sliderMax={sliderMax}
      step={inputStep}
      min={inputMin}
      max={inputMax}
      startLabel={startLabel}
      endLabel={endLabel}
      valueFormatter={valueFormatter}
    />
  );
}

function ValueSliderField({ label, title, value, onChange, min, max, step = 1, valueFormatter = next => formatCompactNumber(next, precisionFromStep(step)) }) {
  return <SliderField label={label} title={title} value={value} onChange={onChange} sliderMin={min} sliderMax={max} step={step} min={min} max={max} valueFormatter={valueFormatter} />;
}

function AxisSlider({ axis, value, onChange }) {
  const axisLabel = axis.description ? <HelpLabel text={axis.label} title={axis.description} /> : axis.label;

  return (
    <Box className="axis-slider-card">
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
        <Typography variant="subtitle2" component="div">
          {axisLabel}
        </Typography>
        <Chip size="small" variant="outlined" label={axis.step >= 1 ? `${Math.round(Number(value))}` : Number(value).toFixed(2)} />
      </Stack>
      <SliderControl min={axis.min} max={axis.max} step={axis.step} value={value} onChange={next => onChange(Number(next))} />
    </Box>
  );
}

function AxisTraceMetric({ label, value }) {
  return (
    <Box className="axis-trace-metric">
      <Typography variant="caption" className="axis-trace-metric__label">
        {label}
      </Typography>
      <Typography variant="body2" className="axis-trace-metric__value">
        {value}
      </Typography>
    </Box>
  );
}

function AxisTraceLogEntry({ log, timeStr }) {
  const trace = log.axisTrace;
  if (!trace) return null;

  const actionMeta = formatAxisTraceAction(trace.action);
  const modeLabel = formatAxisTraceMode(trace.mode);
  const axisModeLabel = modeLabel ? `${modeLabel}${trace.invert ? ' · 反向' : ''}` : trace.invert ? '反向' : '普通';
  const termLabel = formatAxisTraceTerm(trace.term);

  const metrics = [];

  if (Number.isFinite(trace.prevSrc) || Number.isFinite(trace.src)) {
    metrics.push({
      key: 'input',
      label: '原始输入(0-999)',
      value: `${formatAxisDisplayValue(trace.prevSrc)} → ${formatAxisDisplayValue(trace.src)}`,
    });
  }

  if (Number.isFinite(trace.prevOut) || Number.isFinite(trace.out)) {
    metrics.push({
      key: 'output',
      label: '发送目标(0-999)',
      value: `${formatAxisDisplayValue(trace.prevOut)} → ${formatAxisDisplayValue(trace.out)}`,
    });
  }

  if (Number.isFinite(trace.norm)) {
    metrics.push({ key: 'normalized', label: '归一化输入(0-1)', value: formatAxisDisplayValue(trace.norm, 3) });
  }

  if (Number.isFinite(trace.requestedSpeed)) {
    metrics.push({ key: 'requested-speed', label: '请求速度(逻辑)', value: formatAxisDisplayValue(trace.requestedSpeed) });
  }

  if (Number.isFinite(trace.speedLimit)) {
    metrics.push({ key: 'speed-limit', label: '速度上限(逻辑)', value: formatAxisDisplayValue(trace.speedLimit) });
  }

  if (Number.isFinite(trace.logicalSpeed)) {
    metrics.push({ key: 'logical-speed', label: '逻辑 S 速度', value: formatAxisDisplayValue(trace.logicalSpeed) });
  }

  if (Number.isFinite(trace.emittedSpeed)) {
    metrics.push({ key: 'emitted-speed', label: '最终发出 S', value: formatAxisDisplayValue(trace.emittedSpeed) });
  }

  if (Number.isFinite(trace.durationMs)) {
    metrics.push({ key: 'duration', label: '最终 I 时长', value: `${formatAxisDisplayValue(trace.durationMs)}ms` });
  }

  if (Number.isFinite(trace.remap)) {
    metrics.push({ key: 'remapped', label: '重映射后(0-1)', value: formatAxisDisplayValue(trace.remap, 3) });
  }

  if (Number.isFinite(trace.mapped)) {
    metrics.push({ key: 'clamped', label: '边界裁剪后(0-1)', value: formatAxisDisplayValue(trace.mapped, 3) });
  }

  if (Number.isFinite(trace.min) && Number.isFinite(trace.max)) {
    metrics.push({ key: 'bounds', label: '边界限制', value: `${trace.min}-${trace.max}` });
  }

  if (Number.isFinite(trace.remapMin) && Number.isFinite(trace.remapMax)) {
    metrics.push({ key: 'remap-range', label: '映射目标区间', value: `${trace.remapMin}-${trace.remapMax}` });
  }

  if ((trace.mode || '').toLowerCase() === 'locked' && Number.isFinite(trace.lock)) {
    metrics.push({ key: 'lock', label: '锁定位置', value: formatAxisPositionFromNormalized(trace.lock) });
  }

  return (
    <Box className={`log-entry log-entry--axis log-entry--axis-${(trace.action || 'unknown').toLowerCase()}`}>
      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center" justifyContent="space-between">
        <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" alignItems="center">
          <Chip size="small" color="primary" label={trace.axis || 'AXIS'} />
          <Chip size="small" variant="outlined" color={actionMeta.color} label={actionMeta.label} />
          {termLabel && <Chip size="small" variant="outlined" label={termLabel} />}
          <Chip size="small" variant="outlined" label={axisModeLabel} />
          {log.category && <Chip size="small" variant="outlined" label={log.category} />}
          {trace.note && <Chip size="small" color="warning" variant="outlined" label={formatAxisTraceNote(trace.note)} />}
        </Stack>

        {timeStr ? (
          <Typography variant="caption" color="text.secondary">
            {timeStr}
          </Typography>
        ) : null}
      </Stack>

      {metrics.length > 0 && (
        <Box className="axis-trace-grid">
          {metrics.map(metric => (
            <AxisTraceMetric key={metric.key} label={metric.label} value={metric.value} />
          ))}
        </Box>
      )}
    </Box>
  );
}

function getTCodeDeviceInfoView(deviceInfo, connected) {
  const axisDescriptors = Array.isArray(deviceInfo?.axisDescriptors) ? deviceInfo.axisDescriptors.filter(Boolean) : [];
  const queryFailed = typeof deviceInfo?.status === 'string' && deviceInfo.status.startsWith('query-failed:');
  const errorMessage = queryFailed ? deviceInfo.status.slice('query-failed:'.length).trim() : '';
  const hasPayload = Boolean(deviceInfo?.firmwareVersion || deviceInfo?.tcodeVersion || axisDescriptors.length > 0);

  if (!connected) {
    return {
      axisDescriptors,
      hasPayload,
      statusText: '未连接',
      errorMessage: '',
    };
  }

  if (errorMessage) {
    return {
      axisDescriptors,
      hasPayload,
      statusText: `查询失败：${errorMessage}`,
      errorMessage,
    };
  }

  return {
    axisDescriptors,
    hasPayload,
    statusText: hasPayload ? '' : '未查询',
    errorMessage: '',
  };
}

function TCodeDeviceInfoCard({ deviceInfo, connected, onRefresh, busy = false, className = '' }) {
  const view = getTCodeDeviceInfoView(deviceInfo, connected);
  const hasVersionTags = Boolean(deviceInfo?.firmwareVersion || deviceInfo?.tcodeVersion);

  return (
    <Box className={`dialog-panel${className ? ` ${className}` : ''}`}>
      <Typography variant="subtitle2" component="div">
        <HelpLabel text="设备信息" title="串口 TCode 输出连接后会尝试读取设备返回的固件版本、TCode 版本以及轴描述；具体能返回哪些内容取决于固件是否实现相应查询。" />
      </Typography>

      <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1.5} useFlexGap flexWrap="nowrap">
        <Box sx={{ minWidth: 0, flex: '1 1 auto' }}>
          {view.hasPayload && hasVersionTags ? (
            <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
              {deviceInfo?.firmwareVersion && <Chip size="small" variant="outlined" label={`FW ${deviceInfo.firmwareVersion}`} />}
              {deviceInfo?.tcodeVersion && <Chip size="small" variant="outlined" label={`TCode ${deviceInfo.tcodeVersion}`} />}
            </Stack>
          ) : (
            <Typography variant="body2" color={view.errorMessage ? 'error.main' : 'text.secondary'}>
              {view.hasPayload ? '已查询' : view.statusText}
            </Typography>
          )}
        </Box>

        <Button size="small" variant="text" onClick={onRefresh} disabled={busy || !connected} sx={{ flexShrink: 0 }}>
          刷新设备信息
        </Button>
      </Stack>

      {view.axisDescriptors.length > 0 && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', wordBreak: 'break-word' }}>
          {view.axisDescriptors.join(' · ')}
        </Typography>
      )}
    </Box>
  );
}

function PlainLogEntry({ log, timeStr }) {
  return (
    <Box className={`log-entry log-entry--plain log-entry--level-${log.level || 'info'}`}>
      {(timeStr || log.category) && (
        <Typography variant="caption" className="log-entry__meta">
          {timeStr ? `[${timeStr}] ` : ''}
          {log.category ? `<${log.category}>` : ''}
        </Typography>
      )}
      <Typography variant="body2" className="log-entry__message" sx={{ color: LOG_LEVEL_COLOR[log.level] || '#1f2937' }}>
        {log.message}
      </Typography>
    </Box>
  );
}

function MotionAxisEditor({ axisDefinition, value, disabled, onChange }) {
  const axisMode = value.mode || 'Normal';
  const isLocked = axisMode === 'Locked';
  const isIgnored = axisMode === 'Ignored';
  const axisModeSelectValue = getAxisModeSelectValue(value);
  const motionLimitField = getAxisMotionLimitFieldConfig(value);

  return (
    <Box className="motion-axis-card">
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1.5} mb={0.5}>
        <Box>
          <Typography variant="subtitle2">{axisDefinition.axis}</Typography>
          <Typography variant="caption" color="text.secondary">
            {axisDefinition.label}
          </Typography>
        </Box>

        <SelectField
          label="轴模式"
          value={axisModeSelectValue}
          options={AXIS_MODE_SELECT_OPTIONS}
          disabled={disabled}
          variant="compact"
          formControlProps={{ sx: { minWidth: 164, flexShrink: 0 } }}
          onChange={next => onChange(parseAxisModeSelectValue(next))}
        />
      </Stack>

      {isIgnored ? (
        <Typography variant="caption" color="text.secondary">
          该轴已忽略，不会参与输出。
        </Typography>
      ) : isLocked ? (
        <ValueSliderField
          label="锁定位置"
          title="锁定模式下，这个轴会固定在指定位置；位置使用 0-999 的设备尺度表示。"
          value={Number(value.lockValue || 0)}
          min={0}
          max={1}
          step={0.01}
          valueFormatter={next => formatAxisPositionFromNormalized(next)}
          onChange={next => onChange({ lockValue: next })}
        />
      ) : (
        <>
          <RangeField
            label="映射范围"
            title="先把逻辑值 0~1 缩放到这个设备位置区间，再交给边界做最终夹紧。和“边界”不同，它会主动重映射输出。"
            value={[value.remapMin, value.remapMax]}
            sliderMin={0}
            sliderMax={999}
            inputMin={0}
            inputMax={999}
            startLabel="起点"
            endLabel="终点"
            onChange={([remapMin, remapMax]) => onChange({ remapMin, remapMax })}
          />

          <RangeField
            label="边界范围"
            title="最终输出会被夹在这个位置区间内，适合做限位或保留安全余量；它不会把输入重新缩放到这个区间。"
            value={[value.min, value.max]}
            sliderMin={0}
            sliderMax={999}
            inputMin={0}
            inputMax={999}
            startLabel={axisDefinition.minLabel}
            endLabel={axisDefinition.maxLabel}
            onChange={([min, max]) => onChange({ min, max })}
          />

        </>
      )}

      {!isIgnored && (
        <>
          <Box className="motion-axis-card__command-row">
            <SelectField
              label="斜率方式"
              title={describeCommandModeDetail(value.commandMode)}
              value={normalizeCommandMode(value.commandMode)}
              options={COMMAND_MODE_OPTIONS}
              disabled={disabled}
              variant="floating"
              className="motion-axis-card__command-select"
              onChange={next => onChange({ commandMode: next })}
            />

            <Box className="motion-axis-card__command-limit">
              <ValueSliderField
                label={motionLimitField.label}
                title={motionLimitField.title}
                value={motionLimitField.value}
                min={motionLimitField.min}
                max={motionLimitField.max}
                step={motionLimitField.step}
                valueFormatter={motionLimitField.valueFormatter}
                onChange={next => onChange({ maxSpeed: motionLimitField.toProfileValue(next) })}
              />
            </Box>
          </Box>

          <Box className="motion-axis-card__ramp-row">
            <SelectField
              label="斜率曲线"
              title="非标准扩展：在 S/I 指令后附加 = / < / > / <>。若设备不支持，建议保持“无”。"
              value={RAMP_TYPE_OPTIONS.some(option => option.value === value.rampType) ? value.rampType : 'None'}
              options={RAMP_TYPE_OPTIONS}
              disabled={disabled}
              variant="floating"
              className="motion-axis-card__command-select"
              onChange={next => onChange({ rampType: next })}
            />
          </Box>
        </>
      )}
    </Box>
  );
}

function SignalRowDivider() {
  return <Divider orientation="vertical" flexItem className="signal-row__divider" />;
}

function SignalMappingRow({ draft, latestEntry, pathOptions, onChange, onRemove }) {
  const [inputSliderMin, inputSliderMax] = getDynamicFloatSliderBounds([draft.vrchatMin, draft.vrchatMax]);
  const liveOutput = computeSignalPreviewOutput(draft, latestEntry?.numericValue);

  return (
    <Box className="signal-row">
      <Box className="signal-row__header">
        <Autocomplete
          freeSolo
          fullWidth
          className="signal-row__path"
          options={Array.isArray(pathOptions) ? pathOptions : []}
          value={draft.oscPath}
          inputValue={draft.oscPath}
          autoHighlight
          openOnFocus
          selectOnFocus
          clearOnBlur={false}
          filterOptions={(options, state) => {
            const keyword = (state.inputValue || '').trim().toLowerCase();
            if (!keyword) return options;
            return options.filter(option => option.toLowerCase().includes(keyword));
          }}
          onInputChange={(_, nextInputValue, reason) => {
            if (reason === 'input' || reason === 'reset' || reason === 'clear') {
              onChange({ oscPath: nextInputValue || '' });
            }
          }}
          renderInput={params => (
            <TextField
              {...params}
              label={<HelpLabel text="参数路径" title="支持精确匹配、单段通配 * 与多段通配 **。多个参数命中同一规则时，后端会取最近更新的一条。" />}
              size="small"
              placeholder="例如: OGB/Orf/Pussy/Main/PenOthers"
            />
          )}
        />

        <SelectField
          label="目标轴"
          title="选择这条 OSC 映射最终驱动的设备轴；同一目标轴的多条规则会在后端做融合。当前约定里 L1 为数值小=前、数值大=后。"
          value={draft.role}
          options={SIGNAL_ROLE_OPTIONS}
          variant="compact"
          fullWidth
          className="signal-row__role"
          onChange={next => onChange({ role: next })}
        />

        <FormControlLabel
          className="signal-row__toggle"
          sx={{ m: 0 }}
          control={<Switch checked={Boolean(draft.invertDirection)} onChange={(_, checked) => onChange({ invertDirection: checked })} />}
          label={<HelpLabel text="反向" title="交换输入最小值 / 输入最大值的方向，常用于深度方向相反或姿态方向相反的参数。" />}
        />

        <Button size="small" color="error" className="signal-row__remove" onClick={onRemove}>
          移除
        </Button>
      </Box>

      <Box className="signal-row__controls">
        <Box className="signal-row__section signal-row__section--status">
          <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" alignItems="center" className="signal-row__status">
            {latestEntry ? (
              <>
                <Chip size="small" variant="outlined" label={`最新 ${latestEntry.value}`} />
                {liveOutput && <Chip size="small" color="primary" variant="outlined" label={`实时位置 ${liveOutput.mappedPositionText}`} />}
                {latestEntry.sourceLabel && <Chip size="small" variant="outlined" label={`来源 ${latestEntry.sourceLabel}`} />}
                {latestEntry.path && latestEntry.path !== draft.oscPath && <Chip size="small" variant="outlined" label={latestEntry.path} />}
                {latestEntry.matchCount > 1 && <Chip size="small" variant="outlined" label={`命中 ${latestEntry.matchCount}`} />}
              </>
            ) : (
              <Chip size="small" variant="outlined" label="未命中实时参数" />
            )}
          </Stack>
        </Box>

        <SignalRowDivider />

        <Box className="signal-row__section signal-row__section--range">
          <RangeField
            label="输入范围"
            title="把原始 OSC 值的某一段校准为逻辑 0~1。比如设成 0.25~0.75，就会把原始 25%~75% 放大成设备完整行程；超出区间的值会被夹到 0/1。"
            value={[draft.vrchatMin, draft.vrchatMax]}
            sliderMin={inputSliderMin}
            sliderMax={inputSliderMax}
            step={0.01}
            valueFormatter={next => formatCompactNumber(next, 2)}
            onChange={([vrchatMin, vrchatMax]) => onChange({ vrchatMin, vrchatMax })}
          />
        </Box>

        <SignalRowDivider />

        <Box className="signal-row__section signal-row__section--range">
          <RangeField
            label="映射范围"
            title="校准和曲线处理后的逻辑 0/1，会被放到这个设备位置区间；范围 0-999。比如把完整输入限制在设备的 200~800 行程，就在这里设 200~800。"
            value={[draft.mappedMin, draft.mappedMax]}
            sliderMin={0}
            sliderMax={999}
            onChange={([mappedMin, mappedMax]) => onChange({ mappedMin, mappedMax })}
          />
        </Box>

        <SignalRowDivider />

        <Box className="signal-row__section signal-row__section--curve">
          <SelectField
            label="映射曲线"
            title="它改变的是输入值到逻辑目标值的分布，不直接改变最终发给设备的 S/I 形式。缓入适合前段更细，缓出适合后段更细，缓入缓出则让两端更平滑、中段更灵敏。"
            value={draft.curve || 'Linear'}
            options={SIGNAL_CURVE_OPTIONS}
            variant="floating"
            className="signal-row__curve-field"
            onChange={next => onChange({ curve: next })}
          />
        </Box>
      </Box>
    </Box>
  );
}

function App() {
  const [config, setConfig] = useState(null);
  const [overview, setOverview] = useState(null);
  const [logs, setLogs] = useState([]);
  const [studio, setStudio] = useState(() => loadStudio() || { preferredInputTab: 'manual' });
  const [serialPorts, setSerialPorts] = useState([]);
  const [oscDraft, setOscDraft] = useState({ receiverHost: '0.0.0.0', receiverPort: 9001, oscQueryEnabled: true, oscQueryUrl: DEFAULT_OSCQUERY_URL });
  const [signalDrafts, setSignalDrafts] = useState([]);
  const [selectedOscPreset, setSelectedOscPreset] = useState('');
  const [previewSourceTab, setPreviewSourceTab] = useState('all');
  const [presetDialog, setPresetDialog] = useState(null);
  const [profileDialog, setProfileDialog] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [manualDraft, setManualDraft] = useState(EMPTY_MANUAL);
  const [manualMotionMode, setManualMotionMode] = useState('Default');
  const [manualMotionValue, setManualMotionValue] = useState(MANUAL_DEFAULT_SPEED);
  const [manualContinuous, setManualContinuous] = useState(false);
  const [scriptSettings, setScriptSettings] = useState({ loop: false, speed: 1 });
  const [scriptSeekDraft, setScriptSeekDraft] = useState(0);
  const [scriptSeekDragging, setScriptSeekDragging] = useState(false);
  const [selectedScriptFile, setSelectedScriptFile] = useState(null);
  const [scriptFileInputKey, setScriptFileInputKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState('');
  const [wsState, setWsState] = useState('connecting');
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' });
  const [logFilterLevel, setLogFilterLevel] = useState('info');
  const [logCategoryFilter, setLogCategoryFilter] = useState('');
  const [logSearchText, setLogSearchText] = useState('');
  const [logOnlyAxis, setLogOnlyAxis] = useState(false);
  const [logAxisFilter, setLogAxisFilter] = useState('');
  const [logActionFilter, setLogActionFilter] = useState('');
  const [confirmClearMappings, setConfirmClearMappings] = useState(false);
  const manualTimerRef = useRef(null);
  const manualDraftRef = useRef(EMPTY_MANUAL);
  const manualMotionModeRef = useRef('Default');
  const manualMotionValueRef = useRef(MANUAL_DEFAULT_SPEED);
  const savedSignalsHashRef = useRef('');
  const scriptSettingsInitializedRef = useRef(false);
  const manualInitializedRef = useRef(false);

  useEffect(() => {
    let disposed = false;

    async function loadInitial() {
      try {
        await waitForWsReady();

        const [configResponse, overviewResponse, logsResponse, serialPortResponse] = await Promise.all([
          apiRequest('/api/config'),
          apiRequest('/api/state/overview'),
          apiRequest('/api/state/logs'),
          apiRequest('/api/meta/serial-ports'),
        ]);

        if (disposed) return;

        setConfig(configResponse);
        setOverview(overviewResponse);
        setLogs(normalizeLogs(logsResponse));
        setSerialPorts(normalizeSerialPorts(serialPortResponse));
        setOscDraft({
          receiverHost: configResponse?.osc?.receiverHost || '0.0.0.0',
          receiverPort: configResponse?.osc?.receiverPort || 9001,
          oscQueryEnabled: configResponse?.osc?.oscQueryEnabled !== false,
          oscQueryUrl: configResponse?.osc?.oscQueryUrl || DEFAULT_OSCQUERY_URL,
        });
        setSignalDrafts(buildSignalDrafts(configResponse?.signals));
        savedSignalsHashRef.current = computeSignalHash(buildSignalDrafts(configResponse?.signals));
        setStudio(previous => sanitizeStudio(previous, configResponse));
        const initialManualDraft = normalizeManualCommand(overviewResponse?.runtime?.manualCommand);
        setManualDraft(initialManualDraft);
        manualDraftRef.current = initialManualDraft;
        const initialManualMode = normalizeManualMotionMode(overviewResponse?.runtime?.manualCommand?.requestedCommandMode);
        const initialManualMotionValue = normalizeManualMotionValueByMode(
          initialManualMode,
          overviewResponse?.runtime?.manualCommand?.requestedMotionValue ?? (initialManualMode === 'Interval' ? MANUAL_DEFAULT_INTERVAL_MS : MANUAL_DEFAULT_SPEED),
        );
        setManualMotionMode(initialManualMode);
        manualMotionModeRef.current = initialManualMode;
        setManualMotionValue(initialManualMotionValue);
        manualMotionValueRef.current = initialManualMotionValue;
        setScriptSettings({
          loop: Boolean(overviewResponse?.input?.script?.loop),
          speed: Number(overviewResponse?.input?.script?.speed || 1),
        });
        manualInitializedRef.current = true;
        scriptSettingsInitializedRef.current = true;
      } catch (error) {
        notify(error.message || '初始化失败', 'error');
      } finally {
        if (!disposed) setLoading(false);
      }
    }

    loadInitial();

    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    if (!config) return;
    setStudio(previous => sanitizeStudio(previous, config));
    setOscDraft({
      receiverHost: config?.osc?.receiverHost || '0.0.0.0',
      receiverPort: config?.osc?.receiverPort || 9001,
      oscQueryEnabled: config?.osc?.oscQueryEnabled !== false,
      oscQueryUrl: config?.osc?.oscQueryUrl || DEFAULT_OSCQUERY_URL,
    });
    setSignalDrafts(buildSignalDrafts(config?.signals));
    savedSignalsHashRef.current = computeSignalHash(buildSignalDrafts(config?.signals));
  }, [config]);

  useEffect(() => {
    const presets = getOscMappingPresets(config);
    if (presets.length === 0) {
      setSelectedOscPreset('');
      return;
    }

    setSelectedOscPreset(previous => (presets.some(preset => preset.id === previous) ? previous : presets[0].id));
  }, [config]);

  useEffect(() => {
    if (!studio) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(studio));
  }, [studio]);

  useEffect(() => {
    if (!overview?.input?.script || scriptSettingsInitializedRef.current === false) return;
    if (busyKey.startsWith('script-')) return;

    setScriptSettings(previous => ({
      ...previous,
      loop: Boolean(overview.input.script.loop),
      speed: Number(overview.input.script.speed || previous.speed || 1),
    }));
  }, [overview?.input?.script, busyKey]);

  useEffect(() => {
    if (scriptSeekDragging) return;
    setScriptSeekDraft(Number(overview?.input?.script?.positionMs || 0));
  }, [overview?.input?.script?.positionMs, scriptSeekDragging]);

  useEffect(() => {
    if (!selectedScriptFile) return;
    let cancelled = false;

    (async () => {
      try {
        const result = await uploadScriptFile(selectedScriptFile);

        if (cancelled) return;

        setSelectedScriptFile(null);
        setScriptFileInputKey(previous => previous + 1);
        setStudio(previous => (previous ? { ...previous, preferredInputTab: 'script' } : previous));
        if (result?.script) {
          setScriptSettings({
            loop: Boolean(result.script.loop),
            speed: Number(result.script.speed || 1),
          });
        }
        await refreshOverview();
        notify('脚本已加载', 'success');
      } catch (error) {
        if (!cancelled) {
          notify(error.message || '脚本加载失败', 'error');
          setSelectedScriptFile(null);
          setScriptFileInputKey(previous => previous + 1);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedScriptFile]);

  useEffect(() => {
    let socket;
    let retryHandle;
    let disposed = false;

    function closeSocket(reason = 'Component disposed') {
      disposed = true;
      window.clearTimeout(retryHandle);
      if (_wsCommandSocket === socket) setWsCommandSocket(null);
      rejectWsReadyWaiters(new Error('实时连接已关闭'));
      clearWsPendingRequests(new Error('WS disconnected'));

      if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
        try {
          socket.close(1000, reason);
        } catch {
          // ignore close failures during unload
        }
      }
    }

    function connect() {
      setWsState('connecting');
      const currentSocket = new WebSocket(WS_URL);
      socket = currentSocket;
      setWsCommandSocket(currentSocket);

      currentSocket.onopen = () => {
        if (_wsCommandSocket !== currentSocket) return;
        setWsState('connected');
        resolveWsReadyWaiters(currentSocket);
      };

      currentSocket.onmessage = event => {
        if (_wsCommandSocket !== currentSocket) return;

        try {
          const payload = JSON.parse(event.data);
          if (payload?.type === 'state') {
            setOverview(payload.data || null);
            setLogs(normalizeLogs(payload.logs));
            return;
          }
          // Handle command response
          if (payload?.id && _wsPending.has(payload.id)) {
            const pending = _wsPending.get(payload.id);
            clearTimeout(pending.timeout);
            _wsPending.delete(payload.id);
            if (payload.ok === false) {
              pending.reject(new Error(payload?.data?.error || payload?.error || '请求失败'));
            } else {
              pending.resolve(payload.data);
            }
          }
        } catch {
          // ignore malformed frames
        }
      };

      currentSocket.onerror = () => {
        if (_wsCommandSocket !== currentSocket) return;
        setWsState('error');
      };

      currentSocket.onclose = () => {
        const isCurrentSocket = _wsCommandSocket === currentSocket;
        if (isCurrentSocket) {
          setWsCommandSocket(null);
          rejectWsReadyWaiters(new Error('实时连接已断开'));
          clearWsPendingRequests(new Error('WS disconnected'));
        }

        if (socket === currentSocket) socket = null;
        if (disposed || !isCurrentSocket) return;
        setWsState('disconnected');
        retryHandle = window.setTimeout(connect, 1500);
      };
    }

    const handlePageHide = () => closeSocket('Page unload');
    window.addEventListener('pagehide', handlePageHide);
    connect();

    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      closeSocket('Component disposed');
    };
  }, []);

  function notify(message, severity = 'info') {
    setSnackbar({ open: true, message, severity });
  }

  async function withBusy(key, action) {
    setBusyKey(key);
    try {
      return await action();
    } finally {
      setBusyKey('');
    }
  }

  async function refreshOverview() {
    const nextOverview = await apiRequest('/api/state/overview');
    setOverview(nextOverview);
    return nextOverview;
  }

  async function refreshSerialPorts() {
    const nextPorts = await apiRequest('/api/meta/serial-ports');
    const normalizedPorts = normalizeSerialPorts(nextPorts);
    setSerialPorts(normalizedPorts);
    return normalizedPorts;
  }

  async function uploadScriptFile(file) {
    if (!file) throw new Error('请先选择一个 .funscript 文件');

    const content = await file.text();
    return apiRequest('/api/input/script/load', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: file.name,
        content,
        loop: scriptSettings.loop,
        speed: scriptSettings.speed,
      }),
    });
  }

  async function persistConfig(nextConfig) {
    nextConfig.schemaVersion = 5;
    const saved = await apiRequest('/api/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nextConfig),
    });
    setConfig(saved);
    return saved;
  }

  async function saveOscConfig() {
    if (!config) return;

    await withBusy('osc-save', async () => {
      const nextConfig = cloneConfig(config);
      nextConfig.schemaVersion = 5;
      nextConfig.osc = {
        ...nextConfig.osc,
        receiverHost: (oscDraft.receiverHost || '0.0.0.0').trim() || '0.0.0.0',
        receiverPort: Number(oscDraft.receiverPort || 9001),
        oscQueryEnabled: Boolean(oscDraft.oscQueryEnabled),
        oscQueryUrl: (oscDraft.oscQueryUrl || '').trim(),
      };

      await persistConfig(nextConfig);
      await refreshOverview();
      notify('OSC 配置已保存', 'success');
    }).catch(error => notify(error.message || '保存 OSC 配置失败', 'error'));
  }

  async function applyOscSourceSelection(nextSourceKey) {
    const normalizedSourceKey = nextSourceKey || '';
    const currentSourceKey = overview?.osc?.selectedSourceKey || '';
    if (normalizedSourceKey === currentSourceKey) return;

    await withBusy('osc-source', async () => {
      await apiRequest('/api/input/osc/source', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceKey: normalizedSourceKey || null }),
      });
      await refreshOverview();
      notify(normalizedSourceKey ? '已切换参数来源' : '已恢复自动选择参数来源', 'success');
    }).catch(error => notify(error.message || '切换参数来源失败', 'error'));
  }

  function updateSignalDraft(draftId, patch) {
    setSignalDrafts(previous => previous.map(signal => (signal._draftId === draftId ? { ...signal, ...patch } : signal)));
  }

  function addSignalDraft(prefillPath = '') {
    setSignalDrafts(previous => [...previous, makeSignalDraft({ oscPath: prefillPath })]);
  }

  function removeSignalDraft(draftId) {
    setSignalDrafts(previous => previous.filter(signal => signal._draftId !== draftId));
  }

  function clearSignalDrafts() {
    setSignalDrafts([]);
    setConfirmClearMappings(false);
    notify('已清空所有映射', 'info');
  }

  async function saveOscMappings() {
    if (!config) return;

    await withBusy('osc-mappings-save', async () => {
      const nextConfig = cloneConfig(config);
      nextConfig.schemaVersion = 5;
      nextConfig.signals = signalDrafts.map(stripSignalDraft).filter(signal => Boolean(signal.oscPath));

      await persistConfig(nextConfig);
      await refreshOverview();
      savedSignalsHashRef.current = computeSignalHash(signalDrafts);
      notify('OSC 映射已保存', 'success');
    }).catch(error => notify(error.message || '保存 OSC 映射失败', 'error'));
  }

  function applyOscPreset(mode = 'replace') {
    const preset = getOscMappingPreset(config, selectedOscPreset);
    if (!preset) {
      notify('请选择一个预设方案', 'warning');
      return;
    }

    const nextDrafts = preset.mappings.map(mapping => makeSignalDraft(mapping));
    setSignalDrafts(previous => (mode === 'append' ? [...previous, ...nextDrafts] : nextDrafts));
    notify(mode === 'append' ? `已追加预设：${preset.name}` : `已应用预设：${preset.name}`, 'success');
  }

  function openPresetDialog(presetId = null, options = {}) {
    if (!config) return;
    setPresetDialog(buildPresetDialogDraft(config, presetId, options));
  }

  function updatePresetDialogSignal(draftId, patch) {
    setPresetDialog(previous => {
      if (!previous) return previous;
      return {
        ...previous,
        mappings: previous.mappings.map(signal => (signal._draftId === draftId ? { ...signal, ...patch } : signal)),
      };
    });
  }

  function addPresetDialogSignal(prefillPath = '') {
    setPresetDialog(previous => {
      if (!previous) return previous;
      return {
        ...previous,
        mappings: [...previous.mappings, makeSignalDraft({ oscPath: prefillPath })],
      };
    });
  }

  function removePresetDialogSignal(draftId) {
    setPresetDialog(previous => {
      if (!previous) return previous;
      return {
        ...previous,
        mappings: previous.mappings.filter(signal => signal._draftId !== draftId),
      };
    });
  }

  async function savePresetDialog() {
    if (!config || !presetDialog) return;

    await withBusy(`preset-save-${presetDialog.presetId}`, async () => {
      const nextConfig = cloneConfig(config);
      const nextPreset = {
        id: presetDialog.presetId,
        name: (presetDialog.name || 'OSC 预设').trim() || 'OSC 预设',
        description: (presetDialog.description || '').trim(),
        mappings: presetDialog.mappings.map(stripSignalDraft).filter(signal => Boolean(signal.oscPath)),
      };

      const presets = getCustomOscMappingPresets(config);
      nextConfig.oscMappingPresets = presetDialog.isNew ? [...presets, nextPreset] : presets.map(preset => (preset.id === presetDialog.presetId ? nextPreset : preset));

      const saved = await persistConfig(nextConfig);
      setSelectedOscPreset(nextPreset.id);
      setPresetDialog(null);
      notify(`${nextPreset.name} 已保存`, 'success');
      setConfig(saved);
    }).catch(error => notify(error.message || '保存预设失败', 'error'));
  }

  async function deleteSelectedPreset() {
    if (!config || !selectedOscPreset) return;

    const preset = getOscMappingPreset(config, selectedOscPreset);
    if (!preset) return;
    if (preset.isBuiltIn) {
      notify('内置预设不能删除；如需修改，请复制为自定义预设。', 'warning');
      return;
    }

    await withBusy(`preset-delete-${selectedOscPreset}`, async () => {
      const nextConfig = cloneConfig(config);
      const remaining = getCustomOscMappingPresets(config).filter(item => item.id !== selectedOscPreset);
      nextConfig.oscMappingPresets = remaining;

      const saved = await persistConfig(nextConfig);
      const nextPresets = getOscMappingPresets({ ...saved, oscMappingPresets: remaining });
      setSelectedOscPreset(nextPresets[0]?.id || '');
      notify(`${preset.name} 已删除`, 'info');
      setConfig(saved);
    }).catch(error => notify(error.message || '删除预设失败', 'error'));
  }

  function updateProfileAxis(axisKey, patch) {
    setProfileDialog(previous => {
      if (!previous) return previous;
      return {
        ...previous,
        profile: {
          ...previous.profile,
          [axisKey]: {
            ...previous.profile[axisKey],
            ...patch,
          },
        },
      };
    });
  }

  function applyAxisProfilePresetToDialog(presetId) {
    const preset = AXIS_PROFILE_PRESETS.find(item => item.id === presetId);
    if (!preset) return;

    setProfileDialog(previous => {
      if (!previous) return previous;
      return {
        ...previous,
        presetId,
        profile: cloneMotionProfile(createAxisProfilePresetMotion(presetId), false),
      };
    });
  }

  function openProfileDialog(profileId) {
    if (!config) return;
    setProfileDialog(buildProfileDialogDraft(profileId, config));
  }

  function openNewProfileDialog() {
    if (!config) return;
    setProfileDialog(buildNewProfileDialogDraft(config));
  }

  async function saveProfileDialog() {
    if (!profileDialog || !config) return;

    await withBusy(`profile-save-${profileDialog.profileId}`, async () => {
      const nextConfig = cloneConfig(config);
      const existingProfiles = getAxisProfiles(config);
      const nextProfileName = (profileDialog.name || '轴配置').trim() || '轴配置';
      const updatedProfile = {
        id: profileDialog.profileId,
        name: nextProfileName,
        isDefault: Boolean(profileDialog.isDefault),
        motion: stripMotionProfile(profileDialog.profile, false),
      };

      nextConfig.axisProfiles = profileDialog.isNew ? [...existingProfiles, updatedProfile] : existingProfiles.map(profile => (profile.id === profileDialog.profileId ? updatedProfile : profile));

      if (!nextConfig.axisProfiles.some(profile => profile.isDefault)) {
        nextConfig.axisProfiles = nextConfig.axisProfiles.map((profile, index) => ({
          ...profile,
          isDefault: index === 0,
        }));
      }

      await persistConfig(nextConfig);
      await refreshOverview();
      setProfileDialog(null);
      notify(`${nextProfileName} 已保存`, 'success');
    }).catch(error => notify(error.message || '保存轴配置失败', 'error'));
  }

  async function setDefaultAxisProfile(profileId) {
    if (!config) return;

    await withBusy(`profile-default-${profileId}`, async () => {
      const nextConfig = cloneConfig(config);
      nextConfig.axisProfiles = getAxisProfiles(config).map(profile => ({
        ...profile,
        isDefault: profile.id === profileId,
      }));

      const saved = await persistConfig(nextConfig);
      await refreshOverview();
      notify(`默认轴配置已切换为 ${getAxisProfile(saved, profileId).name}`, 'success');
    }).catch(error => notify(error.message || '设置默认轴配置失败', 'error'));
  }

  async function removeAxisProfile(profileId) {
    if (!config) return;

    const profile = getAxisProfile(config, profileId);
    if (!profile || profile.isDefault) {
      notify('默认轴配置不能移除', 'warning');
      return;
    }

    await withBusy(`profile-remove-${profileId}`, async () => {
      const nextConfig = cloneConfig(config);
      const defaultProfileId = getDefaultAxisProfileId(config);
      nextConfig.axisProfiles = getAxisProfiles(config).filter(item => item.id !== profileId);
      nextConfig.outputs = getOutputs(config).map(output => (isTCodeOutputType(output.type) && output.motionProfileId === profileId ? { ...output, motionProfileId: defaultProfileId } : output));

      const saved = await persistConfig(nextConfig);
      await refreshOverview();
      notify(`${profile.name} 已移除，相关输出已回退到默认轴配置`, 'info');
      setStudio(previous => sanitizeStudio(previous, saved));
    }).catch(error => notify(error.message || '移除轴配置失败', 'error'));
  }

  async function syncOutputConnections(nextStudio, nextConfig, options = {}) {
    const latestOverview = await refreshOverview();
    const outputs = getOutputs(nextConfig);
    const connectionState = Object.fromEntries(outputs.map(output => [output.id, Boolean(getOutputOverview(latestOverview, output.id)?.connected)]));
    let changed = false;

    for (const output of outputs) {
      const desired = Boolean(output.enabled);
      const connected = connectionState[output.id];

      if (options.reconnectOutputId === output.id && desired) {
        if (connected) {
          await apiRequest(`/api/control/output/${encodeURIComponent(output.id)}/disconnect`, { method: 'POST' }).catch(() => null);
        }
        const result = await apiRequest(`/api/control/output/${encodeURIComponent(output.id)}/connect`, { method: 'POST' });
        connectionState[output.id] = Boolean(result?.connected);
        changed = true;
        if (result?.message) notify(result.message, result.ok === false ? 'error' : 'success');
        continue;
      }

      if (desired && !connected) {
        const result = await apiRequest(`/api/control/output/${encodeURIComponent(output.id)}/connect`, { method: 'POST' });
        connectionState[output.id] = Boolean(result?.connected);
        changed = true;
        if (result?.message) notify(result.message, result.ok === false ? 'error' : 'success');
      }

      if (!desired && connected) {
        const result = await apiRequest(`/api/control/output/${encodeURIComponent(output.id)}/disconnect`, { method: 'POST' });
        connectionState[output.id] = false;
        changed = true;
        if (result?.message && options.announceDisconnect !== false) notify(result.message, 'info');
      }
    }

    if (changed) await refreshOverview();
  }

  function selectInputTab(nextMode) {
    setStudio(previous => ({ ...(previous || {}), preferredInputTab: nextMode }));
  }

  async function applyInputMode(nextMode) {
    if (!nextMode) return;

    await withBusy(`mode-${nextMode}`, async () => {
      await apiRequest('/api/input/mode', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: nextMode }),
      });
      await refreshOverview();
      notify(`已切换到 ${formatMode(nextMode)}`, 'success');
    }).catch(error => notify(error.message || '切换输入失败', 'error'));
  }

  function manualDraftToPayload(draft) {
    const toPayloadValue = value => Math.max(0, Math.min(999, Math.round(Number(value ?? 0))));
    return {
      L0: toPayloadValue(draft.L0),
      L1: toPayloadValue(draft.L1),
      L2: toPayloadValue(draft.L2),
      R0: toPayloadValue(draft.R0),
      R1: toPayloadValue(draft.R1),
      R2: toPayloadValue(draft.R2),
      V0: toPayloadValue(draft.V0),
      V1: toPayloadValue(draft.V1),
      V2: toPayloadValue(draft.V2),
      A0: toPayloadValue(draft.A0),
      A1: toPayloadValue(draft.A1),
      A2: toPayloadValue(draft.A2),
    };
  }

  const manualRafRef = useRef(null);

  function scheduleManualContinuousUpdate() {
    if (!manualContinuous) return;
    if (manualRafRef.current) return;

    manualRafRef.current = requestAnimationFrame(() => {
      manualRafRef.current = null;
      apiRequest('/api/input/manual', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: true,
          motionMode: manualMotionModeRef.current === 'Default' ? null : manualMotionModeRef.current,
          motionValue: normalizeManualMotionValueByMode(manualMotionModeRef.current, manualMotionValueRef.current),
          ...manualDraftToPayload(manualDraftRef.current),
        }),
      }).catch(error => notify(error.message || '手动输入更新失败', 'error'));
    });
  }

  function handleManualSliderChange(patch) {
    const nextDraft = { ...manualDraft, ...patch };
    setManualDraft(nextDraft);
    manualDraftRef.current = nextDraft;
    scheduleManualContinuousUpdate();
  }

  function handleManualMotionModeChange(nextMode) {
    const normalizedMode = normalizeManualMotionMode(nextMode);
    setManualMotionMode(normalizedMode);
    manualMotionModeRef.current = normalizedMode;

    const normalizedValue = normalizeManualMotionValueByMode(normalizedMode, manualMotionValueRef.current);
    setManualMotionValue(normalizedValue);
    manualMotionValueRef.current = normalizedValue;
    scheduleManualContinuousUpdate();
  }

  function handleManualMotionValueChange(nextValue) {
    const normalizedValue = normalizeManualMotionValueByMode(manualMotionModeRef.current, nextValue);
    setManualMotionValue(normalizedValue);
    manualMotionValueRef.current = normalizedValue;
    scheduleManualContinuousUpdate();
  }

  async function applyManualOnce() {
    if (manualRafRef.current) {
      cancelAnimationFrame(manualRafRef.current);
      manualRafRef.current = null;
    }
    window.clearTimeout(manualTimerRef.current);

    await withBusy('manual-once', async () => {
      await apiRequest('/api/input/manual', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: true,
          motionMode: manualMotionMode === 'Default' ? null : manualMotionMode,
          motionValue: normalizeManualMotionValueByMode(manualMotionMode, manualMotionValue),
          ...manualDraftToPayload(manualDraft),
        }),
      });
      notify('位置已更新', 'success');
    }).catch(error => notify(error.message || '更新位置失败', 'error'));
  }

  async function disableManualInput() {
    if (manualRafRef.current) {
      cancelAnimationFrame(manualRafRef.current);
      manualRafRef.current = null;
    }
    window.clearTimeout(manualTimerRef.current);

    await withBusy('manual-disable', async () => {
      await apiRequest('/api/input/manual', { method: 'DELETE' });
      await refreshOverview();
      notify('手动输入已停用', 'success');
    }).catch(error => notify(error.message || '停用手动输入失败', 'error'));
  }

  async function uploadScript() {
    if (!selectedScriptFile) {
      notify('请先选择一个 .funscript 文件', 'warning');
      return;
    }

    await withBusy('script-load', async () => {
      const result = await uploadScriptFile(selectedScriptFile);
      setSelectedScriptFile(null);
      setScriptFileInputKey(previous => previous + 1);
      setStudio(previous => (previous ? { ...previous, preferredInputTab: 'script' } : previous));
      if (result?.script) {
        setScriptSettings({
          loop: Boolean(result.script.loop),
          speed: Number(result.script.speed || 1),
        });
      }
      await refreshOverview();
      notify('脚本已加载', 'success');
    }).catch(error => notify(error.message || '脚本加载失败', 'error'));
  }

  async function playScript(restart = false) {
    await withBusy(restart ? 'script-restart' : 'script-play', async () => {
      const result = await apiRequest('/api/input/script/play', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restart,
          loop: scriptSettings.loop,
          speed: scriptSettings.speed,
        }),
      });

      if (result?.script) {
        setScriptSettings({
          loop: Boolean(result.script.loop),
          speed: Number(result.script.speed || 1),
        });
      }
      setStudio(previous => (previous ? { ...previous, preferredInputTab: 'script' } : previous));
      await refreshOverview();
      notify(restart ? '脚本已重新开始' : '脚本播放中', 'success');
    }).catch(error => notify(error.message || '脚本播放失败', 'error'));
  }

  async function pauseScript() {
    await withBusy('script-pause', async () => {
      await apiRequest('/api/input/script/pause', { method: 'POST' });
      await refreshOverview();
      notify('脚本已暂停', 'info');
    }).catch(error => notify(error.message || '脚本暂停失败', 'error'));
  }

  async function stopScript() {
    await withBusy('script-stop', async () => {
      await apiRequest('/api/input/script/stop', { method: 'POST' });
      await refreshOverview();
      notify('脚本已停止', 'info');
    }).catch(error => notify(error.message || '脚本停止失败', 'error'));
  }

  async function applyScriptSettings(nextSettings, options = {}) {
    if (!scriptState?.loaded) return;

    const payload = {
      loop: Boolean(nextSettings.loop),
      speed: Math.max(0.1, Math.min(4, Number(nextSettings.speed || 1))),
    };

    await withBusy('script-configure', async () => {
      const result = await apiRequest('/api/input/script/configure', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (result?.script) {
        setScriptSettings({
          loop: Boolean(result.script.loop),
          speed: Number(result.script.speed || payload.speed),
        });
      }

      if (options.notify) notify('脚本设置已应用', 'success');
    }).catch(error => {
      setScriptSettings(previous => ({
        ...previous,
        loop: Boolean(scriptState?.loop ?? previous.loop),
        speed: Number(scriptState?.speed || previous.speed || 1),
      }));
      notify(error.message || '脚本设置更新失败', 'error');
    });
  }

  async function seekScript(positionMs) {
    const durationMs = Math.max(0, Number(scriptState?.durationMs || 0));
    const fallbackPositionMs = Math.max(0, Math.min(Number(scriptState?.positionMs || 0), durationMs));
    const clampedPositionMs = Math.max(0, Math.min(Math.round(Number(positionMs || 0)), durationMs));

    if (!scriptState?.loaded) {
      setScriptSeekDraft(fallbackPositionMs);
      setScriptSeekDragging(false);
      return;
    }

    await withBusy('script-seek', async () => {
      const result = await apiRequest('/api/input/script/seek', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ positionMs: clampedPositionMs }),
      });

      if (result?.script) {
        setScriptSeekDraft(Number(result.script.positionMs || clampedPositionMs));
      }
    }).catch(error => {
      setScriptSeekDraft(fallbackPositionMs);
      notify(error.message || '脚本定位失败', 'error');
    });

    setScriptSeekDragging(false);
  }

  async function clearScript() {
    await withBusy('script-clear', async () => {
      const result = await apiRequest('/api/input/script', { method: 'DELETE' });
      setSelectedScriptFile(null);
      setScriptFileInputKey(previous => previous + 1);
      setScriptSeekDraft(0);

      if (result?.script) {
        setScriptSettings(previous => ({
          loop: Boolean(result.script.loop ?? previous.loop),
          speed: Number(result.script.speed || previous.speed || 1),
        }));
      }

      await refreshOverview();
      notify('脚本已卸载', 'info');
    }).catch(error => notify(error.message || '卸载脚本失败', 'error'));
  }

  async function setOutputEnabled(type, enabled) {
    if (!config || !studio) return;

    await withBusy(`output-enable-${type}`, async () => {
      const nextConfig = cloneConfig(config);
      nextConfig.outputs = getOutputs(config).map(output => (output.id === type ? { ...output, enabled } : output));
      const saved = await persistConfig(nextConfig);
      await syncOutputConnections(studio, saved, { announceDisconnect: false });
      notify(`${getOutputConfig(saved, type)?.name || '输出'}${enabled ? ' 已启用' : ' 已禁用'}`, 'success');
    }).catch(error => notify(error.message || '更新输出状态失败', 'error'));
  }

  async function addOutputCard(type) {
    if (!studio || !config) return;

    await withBusy(`output-add-${type}`, async () => {
      let availableSerialPorts = serialPorts;
      if (type === 'TCodeSerial') {
        availableSerialPorts = (await refreshSerialPorts().catch(() => serialPorts)) || serialPorts;
      }

      const nextOutput = createOutputConfig(type, config, { serialPorts: availableSerialPorts });
      const nextConfig = cloneConfig(config);
      nextConfig.outputs = [...getOutputs(config), nextOutput];

      const saved = await persistConfig(nextConfig);
      setStudio(previous => sanitizeStudio(previous, saved));
      setDialog({ outputId: nextOutput.id, draft: buildOutputDialogDraft(nextOutput.id, saved, availableSerialPorts) });
      await refreshOverview();
      notify(`已添加 ${nextOutput.name}`, 'success');
    }).catch(error => notify(error.message || '添加输出失败', 'error'));
  }

  async function removeOutputCard(type) {
    if (!studio || !config) return;

    await withBusy(`output-remove-${type}`, async () => {
      const removed = getOutputConfig(config, type);
      const nextStudio = { ...studio };

      const nextConfig = cloneConfig(config);
      nextConfig.outputs = getOutputs(config).filter(output => output.id !== type);
      const saved = await persistConfig(nextConfig);
      setStudio(nextStudio);
      await syncOutputConnections(nextStudio, saved, { announceDisconnect: false });
      notify(`${removed?.name || '输出'} 已移除`, 'info');
    }).catch(error => notify(error.message || '移除输出失败', 'error'));
  }

  async function openOutputDialog(type) {
    if (!config) return;
    const output = getOutputConfig(config, type);
    if (!output) return;

    let availableSerialPorts = serialPorts;
    if (output.type === 'TCodeSerial') {
      availableSerialPorts = (await refreshSerialPorts().catch(() => serialPorts)) || serialPorts;
    }
    setDialog({ outputId: type, draft: buildOutputDialogDraft(type, config, availableSerialPorts) });
  }

  async function saveOutputDialog() {
    if (!dialog || !config || !studio) return;

    const conflicts = getOutputTargetConflicts(config, dialog.outputId, dialog.draft);
    if (conflicts.length > 0) {
      notify(formatOutputTargetConflictMessage(conflicts), 'error');
      return;
    }

    await withBusy(`dialog-save-${dialog.outputId}`, async () => {
      const nextConfig = mergeOutputDraft(dialog.outputId, config, dialog.draft);
      const saved = await persistConfig(nextConfig);
      setDialog(null);
      await syncOutputConnections(studio, saved, { reconnectOutputId: dialog.outputId, announceDisconnect: false });
      notify(`${getOutputConfig(saved, dialog.outputId)?.name || '输出'} 配置已保存`, 'success');
    }).catch(error => notify(error.message || '保存配置失败', 'error'));
  }

  async function emergencyStop() {
    await withBusy('emergency-stop', async () => {
      await apiRequest('/api/control/runtime/emergency-stop', { method: 'POST' });
      await refreshOverview();
      notify('已停止所有输出', 'warning');
    }).catch(error => notify(error.message || '急停失败', 'error'));
  }

  async function clearEmergency() {
    await withBusy('emergency-clear', async () => {
      await apiRequest('/api/control/runtime/clear-emergency', { method: 'POST' });
      await refreshOverview();
      notify('输出已恢复', 'success');
    }).catch(error => notify(error.message || '解除急停失败', 'error'));
  }

  async function toggleIntifaceScan(start, outputId) {
    const endpoint = start ? `/api/control/output/${encodeURIComponent(outputId)}/scan-start` : `/api/control/output/${encodeURIComponent(outputId)}/scan-stop`;
    await withBusy(start ? 'scan-start' : 'scan-stop', async () => {
      await apiRequest(endpoint, { method: 'POST' });
      notify(start ? '已请求开始扫描' : '已请求停止扫描', 'info');
    }).catch(error => notify(error.message || '扫描请求失败', 'error'));
  }

  async function refreshTCodeDeviceInfo(outputId) {
    await withBusy(`tcode-device-refresh-${outputId}`, async () => {
      await apiRequest(`/api/control/output/${encodeURIComponent(outputId)}/device-info-refresh`, { method: 'POST' });
      await refreshOverview();
      notify('设备信息已刷新', 'success');
    }).catch(error => notify(error.message || '刷新设备信息失败', 'error'));
  }

  const theme = useMemo(
    () =>
      createTheme({
        palette: {
          mode: 'light',
          primary: { main: '#2563eb' },
          secondary: { main: '#7c3aed' },
          success: { main: '#059669' },
          warning: { main: '#d97706' },
          error: { main: '#dc2626' },
          background: {
            default: '#f4f7fb',
            paper: '#ffffff',
          },
          text: {
            primary: '#0f172a',
            secondary: '#475569',
          },
          divider: 'rgba(15, 23, 42, 0.08)',
        },
        shape: { borderRadius: 18 },
      }),
    [],
  );

  const oscMappingPresets = useMemo(() => getOscMappingPresets(config), [config]);
  const selectedOscPresetConfig = useMemo(() => getOscMappingPreset(config, selectedOscPreset), [config, selectedOscPreset]);
  const selectedOscPresetDescription = selectedOscPresetConfig
    ? selectedOscPresetConfig.description || '这套预设暂未提供说明。'
    : oscMappingPresets.length > 0
      ? '选中预设后可在这里查看说明。'
      : '当前没有可用预设，可先新建一套。';

  const studioState = studio || { preferredInputTab: 'manual' };
  const outputs = getOutputs(config);
  const axisProfiles = getAxisProfiles(config);
  const actualInputMode = overview?.input?.mode || studioState.preferredInputTab || 'manual';
  const runtimeOverview = overview?.runtime || overview?.loop || null;
  const selectedInputTab = INPUT_MODES.some(item => item.value === studioState.preferredInputTab) ? studioState.preferredInputTab : actualInputMode;
  const hasPendingInputMode = selectedInputTab !== actualInputMode;
  const scriptState = overview?.input?.script || null;
  const scriptLoaded = Boolean(scriptState?.loaded);
  const scriptDurationMs = Math.max(0, Number(scriptState?.durationMs || 0));
  const scriptPositionMs = Math.max(0, Math.min(Number(scriptState?.positionMs || 0), scriptDurationMs || 0));
  const scriptRemainingMs = Math.max(0, scriptDurationMs - scriptPositionMs);
  const scriptProgressPercent = scriptDurationMs > 0 ? Math.min(100, (scriptPositionMs / scriptDurationMs) * 100) : 0;
  const scriptSliderMax = Math.max(scriptDurationMs, 1);
  const scriptSeekValue = scriptSeekDragging ? scriptSeekDraft : scriptPositionMs;
  const scriptStateMeta = getScriptStateMeta(scriptState?.state);
  const scriptPrimaryActionLabel = !scriptLoaded ? '播放' : scriptState?.playing ? '播放中' : scriptState?.paused ? '继续播放' : scriptState?.state === 'finished' ? '重新播放' : '播放';
  const scriptCurrentL0Value = formatAxisPositionFromNormalized(scriptState?.currentL0 || 0);
  const oscListening = Boolean(overview?.osc?.listening);
  const oscListenerError = typeof overview?.osc?.listenerError === 'string' ? overview.osc.listenerError.trim() : '';
  const oscModeActive = actualInputMode === 'osc';
  const oscPreview = overview?.osc?.preview || [];
  const oscSources = Array.isArray(overview?.osc?.sources) ? overview.osc.sources : [];
  const selectedOscSourceKey = overview?.osc?.selectedSourceKey || '';
  const hasMultipleOscSources = oscSources.length > 1;
  const selectedOscSource = selectedOscSourceKey ? oscSources.find(source => source.key === selectedOscSourceKey) || null : null;
  const selectedOscSourceLabel = selectedOscSource ? formatOscSourceLabel(selectedOscSource) : '自动选择';
  const oscQuery = overview?.osc?.query || null;
  const oscQueryNodes = Array.isArray(oscQuery?.nodes) ? oscQuery.nodes : [];
  const oscSourceSelectionOptions = useMemo(() => buildOscSourceSelectionOptions(oscSources), [oscSources]);
  const mappingPreviewEntries = useMemo(() => filterOscPreviewEntriesBySource(oscPreview, hasMultipleOscSources ? selectedOscSourceKey : ''), [oscPreview, hasMultipleOscSources, selectedOscSourceKey]);
  const previewEntriesForSuggestions = useMemo(() => (hasMultipleOscSources && selectedOscSourceKey ? mappingPreviewEntries : oscPreview), [hasMultipleOscSources, selectedOscSourceKey, mappingPreviewEntries, oscPreview]);
  const oscPathSuggestions = useMemo(() => buildOscPathSuggestions(previewEntriesForSuggestions, oscQueryNodes), [previewEntriesForSuggestions, oscQueryNodes]);
  const previewEntriesForTab = useMemo(() => {
    if (!hasMultipleOscSources || previewSourceTab === 'all') return oscPreview;
    return filterOscPreviewEntriesBySource(oscPreview, previewSourceTab);
  }, [hasMultipleOscSources, oscPreview, previewSourceTab]);
  const sortedOscPreview = useMemo(() => {
    const signals = Array.isArray(signalDrafts) ? signalDrafts.filter(d => d?.oscPath) : [];
    return [...previewEntriesForTab]
      .map(entry => {
        const matchingSignals = signals.filter(signal => matchesOscPathPattern(signal.oscPath, entry?.path || ''));
        return { ...entry, _matches: matchingSignals.length > 0 ? matchingSignals : null };
      })
      .sort((left, right) => {
        const leftMatch = left._matches ? 1 : 0;
        const rightMatch = right._matches ? 1 : 0;
        if (leftMatch !== rightMatch) return rightMatch - leftMatch;
        return (left?.path || '').localeCompare(right?.path || '', 'zh-CN', { numeric: true, sensitivity: 'base' });
      });
  }, [previewEntriesForTab, signalDrafts]);
  const oscListenerStatus = useMemo(() => {
    if (actualInputMode !== 'osc') {
      return {
        color: 'default',
        compactLabel: '未启用',
        toolbarLabel: 'OSC 未启用',
      };
    }

    if (oscListening) {
      return {
        color: 'success',
        compactLabel: '监听中',
        toolbarLabel: `OSC 监听中 · ${oscPreview.length} 项`,
      };
    }

    if (oscListenerError) {
      return {
        color: 'error',
        compactLabel: '监听失败',
        toolbarLabel: 'OSC 监听失败',
      };
    }

    return {
      color: 'warning',
      compactLabel: '未监听',
      toolbarLabel: 'OSC 未监听',
    };
  }, [actualInputMode, oscListening, oscPreview.length, oscListenerError]);
  const effectiveOscQueryUrl = useMemo(() => {
    const overviewUrl = typeof oscQuery?.url === 'string' ? oscQuery.url.trim() : '';
    if (overviewUrl) return overviewUrl;
    return (oscDraft.oscQueryUrl || '').trim();
  }, [oscQuery?.url, oscDraft.oscQueryUrl]);
  const oscQuerySummary = useMemo(() => {
    if (!oscDraft.oscQueryEnabled) return 'OSCQuery 已关闭';
    if (!effectiveOscQueryUrl) return 'OSCQuery 已开启，待填写地址';
    if (oscQuery?.error) return 'OSCQuery 同步失败';
    if (oscQuery?.listenConnected) return `LISTEN 已连接 · ${oscQuery?.listeningPathCount || oscQueryNodes.length} 条路径`;
    if (oscQueryNodes.length > 0) return `已同步 ${oscQueryNodes.length} 条路径`;
    return 'OSCQuery 已开启';
  }, [oscDraft.oscQueryEnabled, effectiveOscQueryUrl, oscQuery, oscQueryNodes]);

  useEffect(() => {
    if (!hasMultipleOscSources) {
      setPreviewSourceTab(oscSources[0]?.key || 'all');
      return;
    }

    setPreviewSourceTab(previous => {
      if (previous === 'all' || oscSources.some(source => source.key === previous)) return previous;
      if (selectedOscSourceKey && oscSources.some(source => source.key === selectedOscSourceKey)) return selectedOscSourceKey;
      return 'all';
    });
  }, [hasMultipleOscSources, oscSources, selectedOscSourceKey]);
  const visibleOutputs = outputs;
  const effectiveOutputCount = visibleOutputs.filter(output => Boolean(output.enabled)).length;
  const inputSwitchDisabled = runtimeOverview?.inputActive === false;
  const outputWarningMessage = visibleOutputs.length === 0 ? '当前还没有任何输出设备。添加并启用至少一个输出后，输入数据才会真正发送到硬件。' : effectiveOutputCount === 0 ? '当前所有输出都处于禁用状态。即使输入在变化，也不会真正发到任何设备；请先启用至少一个输出。' : '';
  const outputDialogConflicts = useMemo(() => {
    if (!dialog || !config) return [];
    return getOutputTargetConflicts(config, dialog.outputId, dialog.draft);
  }, [config, dialog]);
  const outputDialogOverview = useMemo(() => {
    if (!dialog) return null;
    return getOutputOverview(overview, dialog.outputId);
  }, [overview, dialog]);
  const outputDialogConflictMessage = useMemo(() => formatOutputTargetConflictMessage(outputDialogConflicts), [outputDialogConflicts]);
  const hasSerialTargetConflict = outputDialogConflicts.some(conflict => conflict.binding.key.startsWith('serial:'));
  const hasNetworkTargetConflict = outputDialogConflicts.some(conflict => conflict.binding.key.startsWith('net:'));
  const hasIntifaceTargetConflict = outputDialogConflicts.some(conflict => conflict.binding.key.startsWith('intiface-'));
  const serialPortOwners = useMemo(() => {
    const owners = new Map();
    if (!dialog || !config || dialog.draft.type !== 'TCodeSerial') return owners;

    serialPorts.forEach(port => {
      const conflict = getOutputTargetConflicts(config, dialog.outputId, { ...dialog.draft, comPort: port.portName });
      if (conflict[0]?.owner) owners.set(port.portName, conflict[0].owner);
    });

    return owners;
  }, [config, dialog, serialPorts]);
  const hasUnsavedMappings = useMemo(() => savedSignalsHashRef.current && computeSignalHash(signalDrafts) !== savedSignalsHashRef.current, [signalDrafts]);
  const LOG_MAX_VISIBLE = 300;
  const axisLogCatalog = useMemo(() => {
    const axes = new Set();
    const actions = new Set();

    logs.forEach(log => {
      if (!log.axisTrace) return;
      if (log.axisTrace.axis) axes.add(log.axisTrace.axis);
      if (log.axisTrace.action) actions.add(log.axisTrace.action);
    });

    return {
      axes: ['', ...Array.from(axes).sort((left, right) => left.localeCompare(right, 'en', { numeric: true }))],
      actions: ['', ...Array.from(actions).sort((left, right) => left.localeCompare(right, 'en', { numeric: true }))],
    };
  }, [logs]);
  const filteredLogResult = useMemo(() => {
    const levelIdx = Math.max(LOG_LEVEL_ORDER.indexOf(logFilterLevel), 0);
    const keyword = (logSearchText || '').trim().toLowerCase();

    const matched = logs.filter(log => {
      if (!logOnlyAxis && log.level && LOG_LEVEL_ORDER.indexOf(log.level) < levelIdx) return false;
      if (logOnlyAxis && !log.axisTrace) return false;
      if (logCategoryFilter && log.category !== logCategoryFilter) return false;
      if (logAxisFilter && log.axisTrace?.axis !== logAxisFilter) return false;
      if (logActionFilter && log.axisTrace?.action !== logActionFilter) return false;

      if (keyword) {
        const trace = log.axisTrace;
        const haystack = [log.message, log.category, trace?.axis, trace?.action, trace?.term, trace?.note, trace?.mode].filter(Boolean).join(' ').toLowerCase();

        if (!haystack.includes(keyword)) return false;
      }

      return true;
    });

    return {
      totalMatched: matched.length,
      truncated: matched.length > LOG_MAX_VISIBLE,
      visible: matched.length > LOG_MAX_VISIBLE ? matched.slice(matched.length - LOG_MAX_VISIBLE) : matched,
    };
  }, [logs, logFilterLevel, logCategoryFilter, logSearchText, logOnlyAxis, logAxisFilter, logActionFilter]);
  const filteredLogs = filteredLogResult.visible;
  const logCategories = useMemo(() => {
    const cats = new Set(logs.map(l => l.category).filter(Boolean));
    return ['', ...cats].sort();
  }, [logs]);
  const visibleAxisLogStats = useMemo(() => {
    return filteredLogs.reduce(
      (acc, log) => {
        if (!log.axisTrace) return acc;
        acc.total += 1;
        const stage = (log.axisTrace.action || '').toLowerCase();
        if (stage === 'emit') acc.emit += 1;
        if (stage === 'hold') acc.hold += 1;
        if (stage === 'ignored') acc.ignored += 1;
        return acc;
      },
      { total: 0, emit: 0, hold: 0, ignored: 0 },
    );
  }, [filteredLogs]);
  const manualMotionField = useMemo(() => {
    const mode = normalizeManualMotionMode(manualMotionMode);
    if (mode === 'Interval') {
      return {
        label: '指定时长',
        title: '手动模式固定使用 I 指令，滑条值表示到达目标位置所需时长（毫秒），当前上限为 1000ms。',
        min: 1,
        max: MANUAL_INTERVAL_MAX_MS,
        step: 1,
        valueFormatter: next => `${Math.round(Number(next || 0))}ms`,
      };
    }

    if (mode === 'Speed') {
      return {
        label: '指定速度',
        title: '手动模式固定使用 S 指令；这里填写的是逻辑速度，真正发给设备的 S 数值会在每个输出设备里再按轴上限与速度单位基准换算。若设备对 S 支持不稳定，建议优先改用时间 (I) 或跟随轴配置。',
        min: AXIS_LIMIT_MIN_SPEED,
        max: AXIS_LIMIT_MAX_SPEED,
        step: 1,
        valueFormatter: next => `${Math.round(Number(next || 0))}`,
      };
    }

    return {
      label: '指定速度',
      title: '跟随轴配置：每个轴按各自轴配置决定使用时间、速度或无。这里填写的是逻辑速度上限；若轴配置为 I，会自动换算成对应时长，若轴配置为 S，则会在对应输出设备里再换算成最终发出的 S 数值。',
      min: AXIS_LIMIT_MIN_SPEED,
      max: AXIS_LIMIT_MAX_SPEED,
      step: 1,
      valueFormatter: next => `${Math.round(Number(next || 0))}`,
    };
  }, [manualMotionMode]);

  if (loading) {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Box className="loading-shell">
          <Card className="loading-card">
            <CardContent>
              <Stack spacing={2}>
                <Typography variant="h5">Sensa WebUI</Typography>
                <Typography color="text.secondary">正在同步服务状态与设备配置…</Typography>
                <LinearProgress />
              </Stack>
            </CardContent>
          </Card>
        </Box>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />

      <Box className="app-shell">
        <AppBar
          position="sticky"
          color="transparent"
          elevation={0}
          sx={{
            borderBottom: theme => `1px solid ${theme.palette.divider}`,
            backdropFilter: 'blur(18px)',
            backgroundColor: 'rgba(255,255,255,0.82)',
          }}
        >
          <Toolbar sx={{ gap: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
            <Box sx={{ mr: 'auto' }}>
              <Typography variant="h6" sx={{ fontWeight: 800 }}>
                Sensa WebUI
              </Typography>
            </Box>

            <Chip size="small" color={wsState === 'connected' ? 'success' : wsState === 'connecting' ? 'warning' : 'default'} label={formatRealtimeStatus(wsState)} />
            <Chip size="small" color={oscListenerStatus.color} variant="outlined" label={oscListenerStatus.toolbarLabel} />
            <Chip size="small" variant="outlined" label={`输入方式 ${formatMode(actualInputMode)}`} />
            <Chip size="small" variant="outlined" label={`有效输出 ${effectiveOutputCount}/${visibleOutputs.length}`} />

            {runtimeOverview?.isEmergency ? (
              <Button variant="contained" color="success" size="small" onClick={clearEmergency} disabled={busyKey === 'emergency-clear'}>
                恢复输出
              </Button>
            ) : (
              <Button variant="contained" color="error" size="small" onClick={emergencyStop} disabled={busyKey === 'emergency-stop'}>
                停止输出
              </Button>
            )}
          </Toolbar>
        </AppBar>

        <Box className="page-main">
          {runtimeOverview?.isEmergency && <Alert severity="warning">当前已停止所有输出。</Alert>}

          <Card className="section-card" variant="outlined">
            <CardHeader title="输入" />
            <Divider />
            <CardContent>
              {inputSwitchDisabled && (
                <Alert severity="warning" className="section-status-alert">
                  当前输入开关已关闭。你现在切换输入页签、拖动手动滑条或等待 OSC/脚本更新，都不会真正驱动输出；测试前请先打开右上角的“输入开关”。
                </Alert>
              )}

              <Box
                sx={{
                  mb: 2,
                  display: 'grid',
                  gap: 1.25,
                  border: theme => `1px solid ${theme.palette.divider}`,
                  borderRadius: '18px',
                  backgroundColor: 'rgba(248, 250, 252, 0.82)',
                  padding: '12px 14px',
                }}
              >
                <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" justifyContent="space-between" alignItems="center">
                  <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center">
                    <Chip size="small" variant="outlined" color="primary" label={`当前生效：${formatMode(actualInputMode)}`} />
                    {hasPendingInputMode && <Chip size="small" variant="filled" color="warning" label={`待应用：${formatMode(selectedInputTab)}`} />}
                  </Stack>

                  <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center">
                    {hasPendingInputMode && (
                      <Button size="small" variant="text" onClick={() => selectInputTab(actualInputMode)}>
                        恢复到当前输入
                      </Button>
                    )}
                    <Button size="small" variant="contained" onClick={() => applyInputMode(selectedInputTab)} disabled={!hasPendingInputMode || busyKey === `mode-${selectedInputTab}`}>
                      {busyKey === `mode-${selectedInputTab}` ? '切换中…' : '应用输入方式'}
                    </Button>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={runtimeOverview?.inputActive !== false}
                          onChange={async (_, checked) => {
                            await apiRequest('/api/input/active', {
                              method: 'PUT',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ active: checked }),
                            });
                            await refreshOverview();
                          }}
                        />
                      }
                      label={<Typography variant="body2">输入开关</Typography>}
                    />
                  </Stack>
                </Stack>

                <Typography variant="body2" color="text.secondary">
                  切页签只切界面；点“应用输入方式”后才会真正生效。
                </Typography>
              </Box>

              <Tabs value={selectedInputTab} onChange={(_, next) => selectInputTab(next)} variant="scrollable" allowScrollButtonsMobile>
                {INPUT_MODES.map(item => (
                  <Tab key={item.value} value={item.value} label={item.label} />
                ))}
              </Tabs>

              <TabPanel value="osc" current={selectedInputTab}>
                <Stack spacing={2}>
                  <Box className="osc-section-grid">
                    <Box className="dialog-panel osc-config-panel">
                      <Box className="dialog-panel__header">
                        <Typography variant="subtitle2">OSC 配置</Typography>
                        <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
                          <Chip size="small" variant="outlined" label={`${oscDraft.receiverHost || '0.0.0.0'}:${oscDraft.receiverPort || 9001}`} />
                          <Chip size="small" color={oscListenerStatus.color} variant="outlined" label={oscListenerStatus.compactLabel} />
                        </Stack>
                      </Box>

                      <Box className="dialog-grid">
                        <TextField label="监听地址" size="small" value={oscDraft.receiverHost} onChange={event => setOscDraft(previous => ({ ...previous, receiverHost: event.target.value }))} />
                        <TextField
                          label="监听端口"
                          type="number"
                          size="small"
                          value={oscDraft.receiverPort}
                          onChange={event => setOscDraft(previous => ({ ...previous, receiverPort: Number(event.target.value || 0) }))}
                        />
                        <TextField
                          label="OSCQuery 地址"
                          size="small"
                          placeholder="例如：http://127.0.0.1:9001/"
                          value={oscDraft.oscQueryUrl || ''}
                          onChange={event => setOscDraft(previous => ({ ...previous, oscQueryUrl: event.target.value }))}
                          sx={{ gridColumn: '1 / -1' }}
                        />
                      </Box>

                      <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
                        <Chip size="small" variant="outlined" label={oscQuerySummary} />
                        {oscQuery?.name && <Chip size="small" variant="outlined" label={oscQuery.name} />}
                        {oscQuery?.oscIp && oscQuery?.oscPort && <Chip size="small" variant="outlined" label={`${oscQuery.oscIp}:${oscQuery.oscPort}`} />}
                        {oscQuery?.supportsListen && <Chip size="small" variant="outlined" label="支持 LISTEN" />}
                        {oscQuery?.listenConnected && <Chip size="small" color="success" variant="outlined" label={`实时订阅 ${oscQuery?.listeningPathCount || oscQueryNodes.length} 条`} />}
                      </Stack>

                      {oscModeActive && oscListenerError && <Alert severity="error">{oscListenerError}</Alert>}

                      <Stack direction="row" spacing={1.5} useFlexGap flexWrap="wrap" className="osc-config-panel__actions" sx={{ mt: 1.5 }}>
                        <Button variant="contained" onClick={saveOscConfig} disabled={busyKey === 'osc-save'}>
                          保存配置
                        </Button>
                        <FormControlLabel
                          className="osc-config-panel__switch"
                          control={<Switch checked={Boolean(oscDraft.oscQueryEnabled)} onChange={(_, checked) => setOscDraft(previous => ({ ...previous, oscQueryEnabled: checked }))} />}
                          label={<HelpLabel text="启用 OSCQuery" title="开启后，Sensa 会在当前输入模式切到 OSC 时自动同步已配置的 OSCQuery 参数树；若对端支持 LISTEN，还会通过 WebSocket 订阅实时参数流。这个功能在同时运行多个 OSC 程序、需要自动发现、自动配置或区分来源时尤其有用。并不是所有 OSC 程序都支持 OSCQuery 或 LISTEN；关闭后不会主动同步，也不会建立相关 WebSocket 订阅。" />}
                          sx={{ m: 0 }}
                        />
                      </Stack>
                    </Box>

                    <Box className="dialog-panel osc-preview-panel">
                      <Box className="dialog-panel__header">
                        <Typography variant="subtitle2">参数预览</Typography>
                        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center">
                          <Chip size="small" variant="outlined" label={`${previewEntriesForTab.length} 项`} />
                          {hasMultipleOscSources && <Chip size="small" color={selectedOscSourceKey ? 'info' : 'warning'} variant="outlined" label={`驱动来源 · ${selectedOscSourceKey ? selectedOscSourceLabel : '自动'}`} />}
                          {hasMultipleOscSources && (
                            <SelectField
                              label="使用来源"
                              title="这里决定 Sensa 在多来源同时存在时，OSC 映射预览与实时驱动默认使用哪个来源；下面的标签页只负责浏览。"
                              value={selectedOscSourceKey}
                              options={oscSourceSelectionOptions}
                              variant="compact"
                              className="osc-preview__source-select"
                              formControlProps={{ sx: { minWidth: 180 } }}
                              onChange={applyOscSourceSelection}
                            />
                          )}
                        </Stack>
                      </Box>

                      {hasMultipleOscSources && (
                        <Alert severity={selectedOscSourceKey ? 'info' : 'warning'} variant="outlined">
                          检测到多个参数来源。上方标签页只负责浏览；右侧“使用来源”才决定映射预览和实际驱动默认跟哪一路。当前{selectedOscSourceKey ? `已固定为「${selectedOscSourceLabel}」` : '仍处于自动选择模式'}。
                        </Alert>
                      )}

                      {hasMultipleOscSources && (
                        <Tabs value={previewSourceTab} onChange={(_, next) => setPreviewSourceTab(next)} variant="scrollable" allowScrollButtonsMobile>
                          <Tab value="all" label={`全部 (${oscPreview.length})`} />
                          {oscSources.map(source => (
                            <Tab key={source.key} value={source.key} label={`${formatOscSourceLabel(source)} (${source.parameterCount || 0})`} />
                          ))}
                        </Tabs>
                      )}

                      <Box className="osc-preview-panel__body">
                        {previewEntriesForTab.length === 0 ? (
                          <Box className="empty-inline-state">
                            <Stack spacing={1} alignItems="center">
                              <Typography color="text.secondary">暂无 OSC 实时参数</Typography>
                              {oscQueryNodes.length > 0 && (
                                <Typography variant="body2" color="text.secondary">
                                  已从 OSCQuery 同步 {oscQueryNodes.length} 条参数路径，可直接在下方映射输入框中搜索使用。
                                </Typography>
                              )}
                            </Stack>
                          </Box>
                        ) : (
                          <TableContainer className="osc-preview-table-wrap">
                            <Table size="small" className="osc-preview-table">
                              <TableHead>
                                <TableRow>
                                  {hasMultipleOscSources && <TableCell width="170">来源</TableCell>}
                                  <TableCell>参数名称</TableCell>
                                  <TableCell width="110">类型</TableCell>
                                  <TableCell width="120" align="right">
                                    当前值
                                  </TableCell>
                                  <TableCell width="110" align="right">
                                    更新时间
                                  </TableCell>
                                </TableRow>
                              </TableHead>
                              <TableBody>
                                {sortedOscPreview.map(entry => {
                                  const matched = entry._matches;
                                  const tooltipText = matched
                                    ? matched
                                        .map(s => {
                                          const roleLabel = SIGNAL_ROLE_OPTIONS.find(r => r.value === s.role)?.label || s.role || '未分配';
                                          const invertNote = s.invertDirection ? '（反向）' : '';
                                          return `${s.oscPath} → ${roleLabel}${invertNote}`;
                                        })
                                        .join('；')
                                    : '';

                                  return (
                                    <Tooltip key={`${entry.path}-${entry.timestampMs}`} title={tooltipText || ''} arrow disableHoverListener={!matched}>
                                      <TableRow
                                        hover
                                        sx={{
                                          backgroundColor: matched ? 'rgba(25, 118, 210, 0.08)' : undefined,
                                          '&:hover': { backgroundColor: matched ? 'rgba(25, 118, 210, 0.16)' : undefined },
                                        }}
                                      >
                                        {hasMultipleOscSources && <TableCell>{entry.sourceLabel || '—'}</TableCell>}
                                        <TableCell className="osc-preview-path" sx={{ fontWeight: matched ? 600 : undefined, color: matched ? 'primary.main' : undefined }}>
                                          {entry.path}
                                        </TableCell>
                                        <TableCell>{entry.type || '—'}</TableCell>
                                        <TableCell align="right">{entry.value ?? '—'}</TableCell>
                                        <TableCell align="right">{formatPreviewTimestamp(entry.timestampMs)}</TableCell>
                                      </TableRow>
                                    </Tooltip>
                                  );
                                })}
                              </TableBody>
                            </Table>
                          </TableContainer>
                        )}
                      </Box>
                    </Box>
                  </Box>

                  <Box className="dialog-panel">
                    <Box className="dialog-panel__header">
                      <Typography variant="subtitle2">OSC 映射</Typography>
                      <Stack direction="row" spacing={0.5}>
                        {hasUnsavedMappings && <Chip size="small" color="warning" variant="filled" label="未保存" />}
                        <Chip size="small" variant="outlined" label={`${signalDrafts.length} 条`} />
                      </Stack>
                    </Box>

                    <Stack className="osc-preset-toolbar" direction="row" spacing={2} useFlexGap flexWrap="wrap" alignItems="center" sx={{ py: 1 }}>
                      <SelectField
                        label="预设方案"
                        value={selectedOscPreset}
                        options={oscMappingPresets.map(preset => ({ value: preset.id, label: preset.name }))}
                        variant="inline"
                        hintTitle={selectedOscPresetDescription}
                        className="osc-preset-toolbar__select"
                        onChange={next => setSelectedOscPreset(next)}
                      />

                      <Divider orientation="vertical" flexItem />

                      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                        <Tooltip title="用选中预设的映射替换当前全部映射" arrow>
                          <Button variant="contained" size="small" onClick={() => applyOscPreset('replace')} disabled={!selectedOscPresetConfig}>
                            应用
                          </Button>
                        </Tooltip>
                        <Tooltip title="将选中预设的映射追加到当前映射列表" arrow>
                          <Button variant="outlined" size="small" onClick={() => applyOscPreset('append')} disabled={!selectedOscPresetConfig}>
                            追加
                          </Button>
                        </Tooltip>
                        {selectedOscPresetConfig && (
                          <Tooltip title={selectedOscPresetConfig.isBuiltIn ? '将内置预设复制为自定义预设以便修改' : '编辑当前预设的名称与映射'} arrow>
                            <Button variant="text" size="small" onClick={() => openPresetDialog(selectedOscPreset)}>
                              {selectedOscPresetConfig.isBuiltIn ? '复制' : '编辑'}
                            </Button>
                          </Tooltip>
                        )}
                        <Tooltip title="将当前映射列表保存为一套新的预设方案" arrow>
                          <Button variant="text" size="small" onClick={() => openPresetDialog(null, { fromCurrent: true, currentMappings: signalDrafts })} disabled={signalDrafts.length === 0}>
                            另存为预设
                          </Button>
                        </Tooltip>
                        <Tooltip title="创建一个不带任何映射的空白预设" arrow>
                          <Button variant="text" size="small" onClick={() => openPresetDialog(null)}>
                            新建空预设
                          </Button>
                        </Tooltip>
                        <Tooltip title={selectedOscPresetConfig?.isBuiltIn ? '内置预设不可删除' : '删除选中的自定义预设'} arrow>
                          <Button
                            color="error"
                            variant="text"
                            size="small"
                            onClick={deleteSelectedPreset}
                            disabled={!selectedOscPresetConfig || Boolean(selectedOscPresetConfig?.isBuiltIn) || busyKey?.startsWith('preset-delete-')}
                          >
                            删除
                          </Button>
                        </Tooltip>
                      </Stack>
                    </Stack>

                    <Alert severity="info" className="mapping-guide-alert">
                      <Typography variant="body2" className="mapping-guide-alert__title">
                        当前映射链路：输入范围 → 曲线 → 映射范围。
                      </Typography>
                      <Typography variant="body2">
                        如果你想把 OSC 的某一段放大成设备全行程，例如原始 <strong>0.25~0.75</strong> 对应设备 <strong>0~999</strong>，请改“输入范围”；如果你想让完整输入只走设备的一部分，例如 <strong>200~800</strong>，请改“映射范围”。
                      </Typography>
                    </Alert>

                    {signalDrafts.length === 0 ? (
                      <Box className="empty-inline-state">
                        <Stack spacing={1.5} alignItems="center">
                          <Typography color="text.secondary">还没有轴映射</Typography>
                          <Button variant="outlined" onClick={() => addSignalDraft()}>
                            新增映射
                          </Button>
                        </Stack>
                      </Box>
                    ) : (
                      <Box className="signal-list">
                        {signalDrafts.map(draft => (
                          <SignalMappingRow
                            key={draft._draftId}
                            draft={draft}
                            latestEntry={getLatestOscPreviewEntry(mappingPreviewEntries.length > 0 ? mappingPreviewEntries : oscPreview, draft.oscPath, hasMultipleOscSources ? selectedOscSourceKey : '')}
                            pathOptions={oscPathSuggestions}
                            onChange={patch => updateSignalDraft(draft._draftId, patch)}
                            onRemove={() => removeSignalDraft(draft._draftId)}
                          />
                        ))}
                      </Box>
                    )}

                    <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 1.5 }}>
                      <Button variant="outlined" onClick={() => addSignalDraft()}>
                        新增映射
                      </Button>
                      <Button variant="contained" onClick={saveOscMappings} disabled={busyKey === 'osc-mappings-save'} color={hasUnsavedMappings ? 'warning' : 'primary'}>
                        {hasUnsavedMappings ? '保存映射 ●' : '保存映射'}
                      </Button>
                      <Button variant="outlined" color="error" onClick={() => setConfirmClearMappings(true)} disabled={signalDrafts.length === 0}>
                        清空映射
                      </Button>
                    </Stack>
                  </Box>
                </Stack>
              </TabPanel>

              <TabPanel value="manual" current={selectedInputTab}>
                <Stack spacing={2}>
                  <Box className="axis-grid">
                    {MANUAL_AXES.map(axis => (
                      <AxisSlider key={axis.key} axis={axis} value={manualDraft[axis.key]} onChange={next => handleManualSliderChange({ [axis.key]: next })} />
                    ))}
                  </Box>

                  <Box className="manual-toolbar">
                    <Stack direction="row" spacing={1.5} useFlexGap flexWrap="wrap" alignItems="center" className="manual-toolbar__actions">
                      <Tooltip title="使用当前所有滑条值驱动输出设备执行" arrow>
                        <span>
                          <Button variant="contained" onClick={applyManualOnce} disabled={busyKey === 'manual-once'}>
                            更新位置
                          </Button>
                        </span>
                      </Tooltip>
                      <Tooltip title="把所有滑条回到回正值；开启持续更新时会立即同步到后端。" arrow>
                        <span>
                          <Button variant="outlined" onClick={() => handleManualSliderChange({ ...EMPTY_MANUAL })}>
                            回正
                          </Button>
                        </span>
                      </Tooltip>
                      <FormControlLabel
                        control={
                          <Switch
                            checked={manualContinuous}
                            onChange={(_, checked) => {
                              setManualContinuous(checked);
                              if (!checked) window.clearTimeout(manualTimerRef.current);
                            }}
                          />
                        }
                        label={<HelpLabel text="持续更新" title="开启后，每次拖动滑条都会立即更新后端；关闭后滑条仅本地预览，须点「更新位置」才会生效。" />}
                      />
                      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center" className="manual-toolbar__motion-controls">
                        <SelectField
                          label="斜率方式"
                          title="跟随轴配置：每个轴按自己的配置决定走时间 / 速度 / 无；时间：全部按 I；速度：全部按 S。"
                          value={manualMotionMode}
                          options={MANUAL_MOTION_MODE_OPTIONS}
                          variant="compact"
                          className="manual-toolbar__motion-select"
                          formControlProps={{ sx: { minWidth: 180 } }}
                          onChange={next => handleManualMotionModeChange(next)}
                        />

                        <Box className="manual-toolbar__motion-slider">
                          <ValueSliderField
                            label={manualMotionField.label}
                            title={manualMotionField.title}
                            value={manualMotionValue}
                            min={manualMotionField.min}
                            max={manualMotionField.max}
                            step={manualMotionField.step}
                            valueFormatter={manualMotionField.valueFormatter}
                            onChange={next => handleManualMotionValueChange(next)}
                          />
                        </Box>
                      </Stack>
                    </Stack>
                  </Box>
                </Stack>
              </TabPanel>

              <TabPanel value="script" current={selectedInputTab}>
                <Stack spacing={2}>
                  <Box className="dialog-panel">
                    <Box className="dialog-panel__header">
                      <Typography variant="subtitle2">脚本文件</Typography>
                      <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
                        <Chip size="small" color={scriptStateMeta.color} variant={scriptLoaded ? 'filled' : 'outlined'} label={scriptStateMeta.label} />
                        <Chip size="small" variant="outlined" label={selectedScriptFile?.name || scriptState?.fileName || '未选择'} />
                      </Stack>
                    </Box>
                    <Typography variant="body2" color="text.secondary">
                      选择 .funscript 文件后会自动加载；加载后可直接调速、切换循环，并拖动进度条定位到任意时刻。
                    </Typography>
                    <Stack direction="row" spacing={1.5} useFlexGap flexWrap="wrap" alignItems="center" className="script-file-actions">
                      <Button component="label" variant="contained" disabled={!!selectedScriptFile || busyKey === 'script-load'}>
                        {selectedScriptFile ? '加载中…' : scriptLoaded ? '更换脚本' : '选择脚本'}
                        <input key={scriptFileInputKey} hidden type="file" accept=".funscript,.json" onChange={event => setSelectedScriptFile(event.target.files?.[0] || null)} />
                      </Button>
                      <Button variant="outlined" color="error" onClick={clearScript} disabled={!scriptLoaded || busyKey === 'script-clear'}>
                        卸载脚本
                      </Button>
                      <Typography variant="caption" color="text.secondary">
                        {scriptLoaded ? scriptState?.fileName || '已加载脚本' : '支持 .funscript / .json'}
                      </Typography>
                    </Stack>
                  </Box>

                  <Box className="metric-grid metric-grid--compact">
                    <MetricCard label="状态" value={scriptStateMeta.label} tone="accent" />
                    <MetricCard label="动作数" value={scriptState?.actionCount ?? 0} tone="default" />
                    <MetricCard label="当前位置" value={formatDuration(scriptPositionMs)} tone="primary" />
                    <MetricCard label="剩余时间" value={formatDuration(scriptRemainingMs)} tone="default" />
                    <MetricCard label="当前 L0" value={scriptCurrentL0Value} tone="default" />
                  </Box>

                  <Box className="dialog-panel">
                    <Box className="dialog-panel__header">
                      <Typography variant="subtitle2">播放控制</Typography>
                      <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
                        <Chip size="small" variant="outlined" label={`${scriptSettings.speed.toFixed(2)}x`} />
                        <Chip size="small" variant="outlined" label={scriptSettings.loop ? '循环播放' : '单次播放'} />
                        {scriptLoaded && <Chip size="small" variant="outlined" label={`${formatDuration(scriptPositionMs)} / ${formatDuration(scriptDurationMs)}`} />}
                      </Stack>
                    </Box>

                    <Stack spacing={2}>
                      <Box className="script-progress-block">
                        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" justifyContent="space-between" alignItems="center" className="script-progress-summary">
                          <Typography variant="caption" color="text.secondary">
                            进度定位
                          </Typography>
                          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" className="script-progress-summary__times">
                            <Chip size="small" variant="outlined" label={`${Math.round(scriptProgressPercent)}%`} />
                            <Chip size="small" variant="outlined" label={`剩余 ${formatDuration(scriptRemainingMs)}`} />
                          </Stack>
                        </Stack>

                        <SliderControl
                          min={0}
                          max={scriptSliderMax}
                          step={50}
                          disabled={!scriptLoaded || busyKey === 'script-seek'}
                          value={scriptSeekValue}
                          valueFormatter={value => formatDuration(value)}
                          onChange={next => {
                            setScriptSeekDragging(true);
                            setScriptSeekDraft(Number(Array.isArray(next) ? next[0] : next));
                          }}
                          onChangeCommitted={next => {
                            const nextValue = Number(Array.isArray(next) ? next[0] : next);
                            void seekScript(nextValue);
                          }}
                        />

                        <LinearProgress variant="determinate" value={scriptLoaded ? scriptProgressPercent : 0} sx={{ height: 8, borderRadius: 4 }} />
                      </Box>

                      <Box className="script-control-grid">
                        <Box>
                          <Typography variant="caption" color="text.secondary">
                            播放速度
                          </Typography>
                          <SliderControl
                            min={0.25}
                            max={2}
                            step={0.05}
                            disabled={busyKey === 'script-configure'}
                            value={scriptSettings.speed}
                            valueFormatter={value => Number(value).toFixed(2)}
                            onChange={next => setScriptSettings(previous => ({ ...previous, speed: Number(next) }))}
                            onChangeCommitted={next => {
                              const nextSpeed = Number(Array.isArray(next) ? next[0] : next);
                              void applyScriptSettings({ ...scriptSettings, speed: nextSpeed });
                            }}
                          />
                        </Box>

                        <Box className="script-toggle-field">
                          <FormControlLabel
                            control={
                              <Switch
                                checked={scriptSettings.loop}
                                disabled={busyKey === 'script-configure'}
                                onChange={async (_, checked) => {
                                  const nextSettings = { ...scriptSettings, loop: checked };
                                  setScriptSettings(nextSettings);
                                  if (scriptLoaded) await applyScriptSettings(nextSettings);
                                }}
                              />
                            }
                            label={scriptSettings.loop ? '循环播放' : '单次播放'}
                          />
                          <Typography variant="caption" color="text.secondary">
                            {scriptLoaded ? '修改后会立即作用到当前脚本。' : '先设好参数，加载脚本后会自动沿用。'}
                          </Typography>
                        </Box>
                      </Box>

                      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" className="script-action-row">
                        <Button variant="contained" onClick={() => playScript(false)} disabled={!scriptLoaded || scriptState?.playing || busyKey === 'script-play' || busyKey === 'script-load'}>
                          {scriptPrimaryActionLabel}
                        </Button>
                        <Button variant="outlined" onClick={() => playScript(true)} disabled={!scriptLoaded || busyKey === 'script-restart'}>
                          从头开始
                        </Button>
                        <Button variant="outlined" color="warning" onClick={pauseScript} disabled={!scriptLoaded || !scriptState?.playing || busyKey === 'script-pause'}>
                          暂停
                        </Button>
                        <Button variant="outlined" color="error" onClick={stopScript} disabled={!scriptLoaded || busyKey === 'script-stop'}>
                          停止
                        </Button>
                      </Stack>
                    </Stack>
                  </Box>
                </Stack>
              </TabPanel>
            </CardContent>
          </Card>

          <Card className="section-card" variant="outlined">
            <CardHeader title="配置" />
            <Divider />
            <CardContent>
              <Box className="config-cards-row">
                {axisProfiles.map(profile => {
                  const usedCount = outputs.filter(output => isTCodeOutputType(output.type) && output.motionProfileId === profile.id).length;
                  const axisRows = buildAxisProfileAxisRows(profile);

                  return (
                    <Card key={profile.id} className="config-card" variant="outlined">
                      <CardHeader
                        title={profile.name}
                        subheader={usedCount > 0 ? `${usedCount} 个输出在用` : '未分配输出'}
                        action={profile.isDefault ? <Chip size="small" color="primary" variant="outlined" label="默认" /> : null}
                      />
                      <CardContent>
                        <Stack spacing={1.5} className="config-card__content-stack">
                          <Box className="axis-profile-detail-list config-card__axis-list">
                            {axisRows.map(item => (
                              <Box key={`${profile.id}-axis-${item.axis}`} className="axis-profile-detail-row">
                                <Typography variant="caption" className="axis-profile-detail-row__axis">
                                  {item.axis}
                                </Typography>
                                <Box className="axis-profile-detail-row__details">
                                  {item.details.map(detail => (
                                    <Box
                                      key={`${profile.id}-${item.axis}-${detail.label}`}
                                      component="span"
                                      className={`axis-profile-detail-pill${detail.changed ? ` axis-profile-detail-pill--changed axis-profile-detail-pill--${detail.tone}` : ''}`}
                                    >
                                      {detail.label}
                                    </Box>
                                  ))}
                                </Box>
                              </Box>
                            ))}
                          </Box>

                          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" className="config-card__action-row">
                            <Button variant="contained" className="config-card__action-button" onClick={() => openProfileDialog(profile.id)}>
                              修改配置
                            </Button>
                            {!profile.isDefault && (
                              <Button variant="outlined" className="config-card__action-button" onClick={() => setDefaultAxisProfile(profile.id)}>
                                设为默认
                              </Button>
                            )}
                            {!profile.isDefault && (
                              <Button color="error" className="config-card__action-button" onClick={() => removeAxisProfile(profile.id)}>
                                移除
                              </Button>
                            )}
                          </Stack>
                        </Stack>
                      </CardContent>
                    </Card>
                  );
                })}

                <Card className="config-card config-card--add" variant="outlined">
                  <CardContent>
                    <Stack spacing={1.5} alignItems="center" justifyContent="center" className="config-card__add-body" sx={{ textAlign: 'center' }}>
                      <Typography variant="subtitle1">新增轴配置</Typography>
                      <Typography variant="body2" color="text.secondary">
                        新建一套可复用的轴限制。
                      </Typography>
                      <Button variant="contained" className="config-card__add-button" onClick={openNewProfileDialog}>
                        + 轴配置
                      </Button>
                    </Stack>
                  </CardContent>
                </Card>
              </Box>
            </CardContent>
          </Card>

          <Card className="section-card" variant="outlined">
            <CardHeader title="输出" />
            <Divider />
            <CardContent>
              {outputWarningMessage && (
                <Alert severity="warning" className="section-status-alert">
                  {outputWarningMessage}
                </Alert>
              )}

              <Stack spacing={2}>
                <Box className="output-toolbar">
                  <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                    {OUTPUT_TYPES.map(output => (
                      <Button key={output.value} size="small" variant="outlined" onClick={() => addOutputCard(output.value)}>
                        + {output.label}
                      </Button>
                    ))}
                  </Stack>
                </Box>

                {visibleOutputs.length === 0 ? (
                  <Box className="empty-state">
                    <Typography variant="h6">暂无输出</Typography>
                    <Typography color="text.secondary">添加一个输出设备</Typography>
                  </Box>
                ) : (
                  <Box className="outputs-row">
                    {visibleOutputs.map(output => {
                      const outputState = getOutputOverview(overview, output.id) || {};
                      const typeMeta = OUTPUT_TYPE_BY_VALUE[output.type] || { label: output.type, shortLabel: output.type, scanSupported: false };
                      const isEnabled = Boolean(output.enabled);
                      const outputBusy = busyKey === `output-enable-${output.id}`;
                      const connectionLabel = isEnabled ? (outputState.connected ? '已连接' : '未连接') : '已禁用';
                      const summary = buildOutputSummary(output);
                      const profileName = isTCodeOutputType(output.type)
                        ? outputState.profileName || getAxisProfile(config, output.motionProfileId)?.name || getDefaultAxisProfile(config)?.name
                        : null;
                      const tcodeSettings = outputState.tcodeSettings || null;
                      const tcodeDeviceInfo = outputState.tcodeDeviceInfo || null;

                      return (
                        <Card key={output.id} className={`output-card${isEnabled ? ' output-card--enabled' : ' output-card--disabled'}`} variant="outlined">
                          <CardHeader
                            className="output-card__header"
                            title={output.name}
                            subheader={summary}
                            action={
                              <Button
                                className="output-card__toggle-button"
                                size="small"
                                variant={isEnabled ? 'contained' : 'outlined'}
                                color={isEnabled ? 'warning' : 'primary'}
                                onClick={() => setOutputEnabled(output.id, !isEnabled)}
                                disabled={outputBusy}
                              >
                                {outputBusy ? '处理中…' : isEnabled ? '禁用' : '启用'}
                              </Button>
                            }
                          />
                          <CardContent className="output-card__content">
                            <Stack spacing={1.5} sx={{ flex: 1 }}>
                              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" className="output-card-meta">
                                <Chip size="small" variant="outlined" label={typeMeta.shortLabel} />
                                <Chip size="small" color={!isEnabled ? 'default' : outputState.connected ? 'success' : 'warning'} variant="outlined" label={connectionLabel} />
                                {profileName && <Chip size="small" variant="outlined" label={`轴配置 · ${profileName}`} />}
                                {isTCodeOutputType(output.type) && <Chip size="small" variant="outlined" label={`输出斜率 · ${formatSlopeModeLabel(tcodeSettings?.slopeMode || output.slopeMode)}`} />}
                                {isTCodeOutputType(output.type) && <Chip size="small" variant="outlined" label={`速度基准 · ${formatSpeedUnitBaseLabel(tcodeSettings?.speedUnitBase || output.speedUnitBase)}`} />}
                              </Stack>

                              {output.type === 'TCodeSerial' && (
                                <TCodeDeviceInfoCard
                                  deviceInfo={tcodeDeviceInfo}
                                  connected={Boolean(outputState.connected)}
                                  onRefresh={() => refreshTCodeDeviceInfo(output.id)}
                                  busy={busyKey === `tcode-device-refresh-${output.id}`}
                                  className="output-card__device-info"
                                />
                              )}

                              {output.type === 'Intiface' && Array.isArray(outputState.devices) && outputState.devices.length > 0 && (
                                <Box className="device-list">
                                  {outputState.devices.map(device => (
                                    <Chip key={`${device.name}-${device.index}`} size="small" variant="outlined" label={device.name} />
                                  ))}
                                </Box>
                              )}

                              {typeMeta.scanSupported && (
                                <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                                  <Button size="small" variant="text" onClick={() => toggleIntifaceScan(true, output.id)}>
                                    开始扫描
                                  </Button>
                                  <Button size="small" variant="text" onClick={() => toggleIntifaceScan(false, output.id)}>
                                    停止扫描
                                  </Button>
                                </Stack>
                              )}

                              <Box className="output-card-actions">
                                <Button size="small" variant="outlined" onClick={() => openOutputDialog(output.id)}>
                                  配置
                                </Button>
                                <Button size="small" color="error" onClick={() => removeOutputCard(output.id)}>
                                  移除
                                </Button>
                              </Box>
                            </Stack>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </Box>
                )}
              </Stack>
            </CardContent>
          </Card>

          <Card className="section-card" variant="outlined">
            <CardHeader title="日志" />
            <Divider />
            <CardContent>
              <Box className="log-toolbar">
                <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center">
                  <SelectField label="级别" value={logFilterLevel} options={[{ value: 'debug', label: '全部日志' }, { value: 'info', label: '信息以上' }, { value: 'warning', label: '警告以上' }, { value: 'error', label: '仅错误' }]} variant="compact" formControlProps={{ sx: { minWidth: 112 } }} onChange={setLogFilterLevel} />

                  <SelectField label="分类" value={logCategoryFilter} options={[{ value: '', label: '全部分类' }, ...logCategories.filter(Boolean).map(cat => ({ value: cat, label: cat }))]} variant="compact" formControlProps={{ sx: { minWidth: 130 } }} onChange={setLogCategoryFilter} />

                  <SelectField label="轴" value={logAxisFilter} options={[{ value: '', label: '全部轴' }, ...axisLogCatalog.axes.filter(Boolean).map(axis => ({ value: axis, label: axis }))]} variant="compact" formControlProps={{ sx: { minWidth: 110 } }} onChange={setLogAxisFilter} />

                  <SelectField label="结果" value={logActionFilter} options={[{ value: '', label: '全部结果' }, ...axisLogCatalog.actions.filter(Boolean).map(action => ({ value: action, label: formatAxisTraceAction(action).label }))]} variant="compact" formControlProps={{ sx: { minWidth: 120 } }} onChange={setLogActionFilter} />

                  <TextField size="small" placeholder="搜索日志 / 轴 / 备注" value={logSearchText} onChange={event => setLogSearchText(event.target.value)} sx={{ minWidth: 220, flex: '1 1 240px' }} />

                  <FormControlLabel
                    sx={{ m: 0, ml: 0.5 }}
                    control={<Switch size="small" checked={logOnlyAxis} onChange={(_, checked) => setLogOnlyAxis(checked)} />}
                    label={<Typography variant="caption">仅看轴调试</Typography>}
                  />
                </Stack>

                <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center" className="log-summary">
                  <Chip size="small" variant="outlined" label={`可见 ${filteredLogs.length} 条`} />
                  {filteredLogResult.truncated && <Chip size="small" color="warning" variant="outlined" label={`最近 ${LOG_MAX_VISIBLE}/${filteredLogResult.totalMatched}`} />}
                  <Chip size="small" variant="outlined" label={`轴调试 ${visibleAxisLogStats.total}`} />
                  <Chip size="small" color="primary" variant="outlined" label={`输出更新 ${visibleAxisLogStats.emit}`} />
                  <Chip size="small" variant="outlined" label={`输出保持 ${visibleAxisLogStats.hold}`} />
                  <Chip size="small" color="warning" variant="outlined" label={`已忽略 ${visibleAxisLogStats.ignored}`} />
                  {logOnlyAxis && <Chip size="small" color="info" variant="outlined" label="已自动包含 debug" />}
                </Stack>
              </Box>

              <Box className="log-list">
                {filteredLogs.length === 0 ? (
                  <Typography color="text.secondary">暂时没有日志。</Typography>
                ) : (
                  filteredLogs.map((log, index) => {
                    const ts = log.timestamp ? new Date(log.timestamp) : null;
                    const timeStr = ts && !Number.isNaN(ts.getTime()) ? ts.toLocaleTimeString() : '';

                    if (log.axisTrace) {
                      return <AxisTraceLogEntry key={`${index}-${log.message}`} log={log} timeStr={timeStr} />;
                    }

                    return <PlainLogEntry key={`${index}-${log.message}`} log={log} timeStr={timeStr} />;
                  })
                )}
              </Box>
            </CardContent>
          </Card>
        </Box>
      </Box>

      <Dialog open={Boolean(presetDialog)} onClose={() => setPresetDialog(null)} fullWidth maxWidth="lg">
        <DialogTitle>{presetDialog ? `${presetDialog.name || 'OSC 预设'} · 预设编辑` : 'OSC 预设'}</DialogTitle>
        <DialogContent dividers>
          {presetDialog && (
            <Stack spacing={2.5}>
              <TextField label="预设名称" size="small" value={presetDialog.name || ''} onChange={event => setPresetDialog(previous => ({ ...previous, name: event.target.value }))} />
              <TextField
                label="说明"
                size="small"
                multiline
                minRows={2}
                value={presetDialog.description || ''}
                onChange={event => setPresetDialog(previous => ({ ...previous, description: event.target.value }))}
              />

              {presetDialog.mappings.length === 0 ? (
                <Box className="empty-inline-state">
                  <Stack spacing={1.5} alignItems="center">
                    <Typography color="text.secondary">这套预设还没有映射项</Typography>
                    <Button variant="outlined" onClick={() => addPresetDialogSignal()}>
                      新增预设映射
                    </Button>
                  </Stack>
                </Box>
              ) : (
                <Box className="signal-list">
                  {presetDialog.mappings.map(draft => (
                    <SignalMappingRow
                      key={draft._draftId}
                      draft={draft}
                      latestEntry={getLatestOscPreviewEntry(mappingPreviewEntries.length > 0 ? mappingPreviewEntries : oscPreview, draft.oscPath, hasMultipleOscSources ? selectedOscSourceKey : '')}
                      pathOptions={oscPathSuggestions}
                      onChange={patch => updatePresetDialogSignal(draft._draftId, patch)}
                      onRemove={() => removePresetDialogSignal(draft._draftId)}
                    />
                  ))}
                </Box>
              )}

              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                <Button variant="outlined" onClick={() => addPresetDialogSignal()}>
                  新增预设映射
                </Button>
              </Stack>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPresetDialog(null)}>取消</Button>
          <Button variant="contained" onClick={savePresetDialog} disabled={!presetDialog || busyKey.startsWith('preset-save-')}>
            保存预设
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(dialog)} onClose={() => setDialog(null)} fullWidth maxWidth="md">
        <DialogTitle>{dialog ? `${getOutputTypeLabel(dialog.draft.type)} 配置` : '输出配置'}</DialogTitle>
        <DialogContent dividers>
          {dialog && (
            <Stack spacing={2}>
              {outputDialogConflictMessage && (
                <Alert severity="warning">
                  {outputDialogConflictMessage}
                </Alert>
              )}

              <TextField
                label={<HelpLabel text="名称" title="仅用于在 WebUI 中区分这台输出设备。" />}
                size="small"
                value={dialog.draft.name || ''}
                onChange={event => setDialog(previous => ({ ...previous, draft: { ...previous.draft, name: event.target.value } }))}
              />

              {isTCodeOutputType(dialog.draft.type) && (
                <>
                  <SelectField
                    label="轴配置"
                    title="选择这台 TCode 输出使用的轴配置。"
                    value={dialog.draft.motionProfileId || getDefaultAxisProfileId(config)}
                    options={axisProfiles.map(profile => ({ value: profile.id, label: profile.name }))}
                    variant="compact"
                    fullWidth
                    onChange={next => setDialog(previous => ({ ...previous, draft: { ...previous.draft, motionProfileId: next } }))}
                  />

                  <Box className="dialog-grid dialog-grid--two-cols">
                    <SelectField
                      label="输出斜率方式"
                      title="跟随轴配置=每个轴按自己的配置决定走时间 / 速度 / 无；时间=强制全部使用 I；速度=强制全部使用 S；无=只发位置值。"
                      value={normalizeOutputSlopeMode(dialog.draft.slopeMode)}
                      options={OUTPUT_SLOPE_MODE_OPTIONS}
                      variant="compact"
                      fullWidth
                      onChange={next => setDialog(previous => ({ ...previous, draft: { ...previous.draft, slopeMode: next } }))}
                    />

                    <SelectField
                      label="速度单位基准"
                      title="默认每 100ms。切到每秒后，发送给设备的 S 数值会按秒基准换算。"
                      value={normalizeSpeedUnitBase(dialog.draft.speedUnitBase)}
                      options={SPEED_UNIT_BASE_OPTIONS}
                      variant="compact"
                      fullWidth
                      onChange={next => setDialog(previous => ({ ...previous, draft: { ...previous.draft, speedUnitBase: next } }))}
                    />
                  </Box>

                  <Alert severity="info" variant="outlined">
                    速度单位基准默认是 <strong>每 100ms</strong>。若你的设备/固件按“每秒”解释 S 值，可切到“每秒”。
                  </Alert>
                </>
              )}

              {dialog.draft.type === 'TCodeSerial' && (
                <>
                  <Box className="dialog-panel">
                    <Box className="dialog-panel__header">
                      <Typography variant="subtitle2">串口连接</Typography>
                      <Chip size="small" variant="outlined" label={dialog.draft.comPort || '未选择串口'} />
                    </Box>

                    <SelectField
                      label="串口"
                      title="选择目标 TCode 设备对应的 COM 端口。"
                      value={dialog.draft.comPort || ''}
                      options={serialPorts.length === 0 ? [{ value: '', label: '未检测到串口' }] : serialPorts.map(port => {
                        const owner = serialPortOwners.get(port.portName);
                        return {
                          value: port.portName,
                          label: port.portName,
                          disabled: Boolean(owner),
                          port,
                          owner,
                        };
                      })}
                      variant="compact"
                      fullWidth
                      formControlProps={{ error: hasSerialTargetConflict }}
                      renderOption={option => (
                        <Stack direction="row" spacing={1} alignItems="baseline">
                          <Typography variant="body2">{option.label}</Typography>
                          {option.port?.description && option.port.description !== option.port.portName && (
                            <Typography variant="caption" color="text.secondary">
                              {option.port.description}
                            </Typography>
                          )}
                          {option.owner && (
                            <Typography variant="caption" color="error.main">
                              {`已被 ${getOutputDisplayName(option.owner)} 使用`}
                            </Typography>
                          )}
                        </Stack>
                      )}
                      onChange={next => setDialog(previous => ({ ...previous, draft: { ...previous.draft, comPort: next } }))}
                    />
                  </Box>

                  <TCodeDeviceInfoCard
                    deviceInfo={outputDialogOverview?.tcodeDeviceInfo}
                    connected={Boolean(outputDialogOverview?.connected)}
                    onRefresh={() => refreshTCodeDeviceInfo(dialog.outputId)}
                    busy={busyKey === `tcode-device-refresh-${dialog.outputId}`}
                  />
                </>
              )}

              {(dialog?.draft?.type === 'TCodeUdp' || dialog?.draft?.type === 'TCodeTcp') && (
                <>
                  <Box className="dialog-panel">
                    <Box className="dialog-panel__header">
                      <Typography variant="subtitle2">网络目标</Typography>
                      <Chip size="small" variant="outlined" label={dialog.draft.type === 'TCodeUdp' ? 'UDP' : 'TCP'} />
                    </Box>

                    <Box className="dialog-grid">
                      <TextField
                        error={hasNetworkTargetConflict}
                        label={<HelpLabel text="Host" title="目标设备的主机名或 IP 地址。" />}
                        size="small"
                        value={dialog.draft.host || ''}
                        onChange={event => setDialog(previous => ({ ...previous, draft: { ...previous.draft, host: event.target.value } }))}
                      />
                      <TextField
                        error={hasNetworkTargetConflict}
                        label={<HelpLabel text="Port" title={dialog.draft.type === 'TCodeUdp' ? '目标设备监听 TCode UDP 的端口。' : '目标设备监听 TCode TCP 的端口。'} />}
                        type="number"
                        size="small"
                        value={dialog.draft.port ?? ''}
                        onChange={event => setDialog(previous => ({ ...previous, draft: { ...previous.draft, port: Number(event.target.value || 0) } }))}
                      />
                    </Box>
                  </Box>
                </>
              )}

              {dialog?.draft?.type === 'Intiface' && (
                <>
                  <Box className="dialog-panel">
                    <Box className="dialog-panel__header">
                      <Typography variant="subtitle2">Intiface 连接参数</Typography>
                      <Chip size="small" variant="outlined" label="Buttplug" />
                    </Box>

                    <Box className="dialog-grid">
                      <TextField
                        error={hasIntifaceTargetConflict}
                        label={<HelpLabel text="WebSocket 地址" title="Intiface WebSocket 服务地址，通常指向 Intiface Central 或本地引擎。" />}
                        size="small"
                        value={dialog.draft.websocketAddress || ''}
                        onChange={event => setDialog(previous => ({ ...previous, draft: { ...previous.draft, websocketAddress: event.target.value } }))}
                      />
                      <TextField
                        error={hasIntifaceTargetConflict}
                        label={<HelpLabel text="端口" title="仅在托管本地 intiface-engine.exe 时使用的监听端口。" />}
                        type="number"
                        size="small"
                        value={dialog.draft.port ?? 12345}
                        onChange={event => setDialog(previous => ({ ...previous, draft: { ...previous.draft, port: Number(event.target.value || 0) } }))}
                      />
                    </Box>

                    <FormControlLabel
                      control={
                        <Switch
                          checked={Boolean(dialog.draft.manageEngineProcess)}
                          onChange={(_, checked) => setDialog(previous => ({ ...previous, draft: { ...previous.draft, manageEngineProcess: checked } }))}
                        />
                      }
                      label={<HelpLabel text="由后台托管 intiface-engine.exe" title="开启后，后台会尝试自动启动和停止本地 intiface-engine.exe。" />}
                    />
                  </Box>
                </>
              )}
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialog(null)}>取消</Button>
          <Button variant="contained" onClick={saveOutputDialog} disabled={!dialog || busyKey.startsWith('dialog-save-') || outputDialogConflicts.length > 0}>
            保存
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(profileDialog)} onClose={() => setProfileDialog(null)} fullWidth maxWidth="lg">
        <DialogTitle>{profileDialog ? `${profileDialog.name || '轴配置'} · 轴配置` : '轴配置'}</DialogTitle>
        <DialogContent dividers>
          {profileDialog && (
            <Stack spacing={2}>
              <TextField
                label="配置名称"
                size="small"
                value={profileDialog.name || ''}
                onChange={event => setProfileDialog(previous => ({ ...previous, name: event.target.value }))}
              />

              <Box className="dialog-panel">
                <Box className="dialog-panel__header">
                  <Typography variant="subtitle2">快速预设</Typography>
                  {profileDialog.presetId && <Chip size="small" variant="outlined" label={AXIS_PROFILE_PRESETS.find(item => item.id === profileDialog.presetId)?.name || '已选择预设'} />}
                </Box>

                <Box className="preset-apply-row">
                  <SelectField
                    label="轴配置预设"
                    value={profileDialog.presetId || ''}
                    options={[{ value: '', label: '不使用预设' }, ...AXIS_PROFILE_PRESETS.map(preset => ({ value: preset.id, label: preset.name }))]}
                    variant="inline"
                    hintTitle={
                      profileDialog.presetId
                        ? AXIS_PROFILE_PRESETS.find(item => item.id === profileDialog.presetId)?.description || '应用后会覆盖当前草稿。'
                        : '选择一套轴配置预设后，可一键覆盖当前草稿。'
                    }
                    className="preset-apply-row__select"
                    onChange={next => setProfileDialog(previous => ({ ...previous, presetId: next }))}
                  />

                  <Button className="preset-apply-row__button" variant="outlined" disabled={!profileDialog.presetId} onClick={() => applyAxisProfilePresetToDialog(profileDialog.presetId)}>
                    应用预设
                  </Button>
                </Box>
              </Box>

              <Box className="motion-axis-grid">
                {AXIS_PROFILE_DEFS.map(axis => (
                  <MotionAxisEditor
                    key={`${profileDialog.profileId}-${axis.key}`}
                    axisDefinition={axis}
                    value={profileDialog.profile[axis.key]}
                    disabled={false}
                    onChange={patch => updateProfileAxis(axis.key, patch)}
                  />
                ))}
              </Box>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setProfileDialog(null)}>取消</Button>
          <Button variant="contained" onClick={saveProfileDialog} disabled={!profileDialog || busyKey.startsWith('profile-save-')}>
            保存
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={confirmClearMappings} onClose={() => setConfirmClearMappings(false)}>
        <DialogTitle>确认清空映射</DialogTitle>
        <DialogContent>
          <Typography>确定要清空所有 {signalDrafts.length} 条 OSC 轴映射吗？此操作可通过「保存映射」撤销。</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmClearMappings(false)}>取消</Button>
          <Button variant="contained" color="error" onClick={clearSignalDrafts}>
            确认清空
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={snackbar.open} autoHideDuration={2600} onClose={() => setSnackbar(previous => ({ ...previous, open: false }))}>
        <Alert variant="filled" severity={snackbar.severity}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </ThemeProvider>
  );
}

ReactDOM.createRoot(document.getElementById('app-root')).render(<App />);
