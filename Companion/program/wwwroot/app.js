const {
  Alert,
  AppBar,
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Chip,
  Collapse,
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

const INPUT_MODES = [
  { value: 'osc', label: 'OSC' },
  { value: 'manual', label: '手动' },
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
  L0: 0,
  L1: 500,
  L2: 500,
  R0: 500,
  R1: 500,
  R2: 500,
  V0: 0,
  V1: 0,
  V2: 0,
  A0: 500,
};

const MANUAL_AXES = [
  { key: 'L0', label: 'L0 主轴', min: 0, max: 999, step: 1, description: '主往复轴的逻辑目标值。0 表示最缩回，999 表示最伸出。输出层仍会继续套用轴配置约束。' },
  { key: 'L1', label: 'L1 前后', min: 0, max: 999, step: 1, description: '前后平移轴的逻辑目标值；按当前 TCode 约定，较小值朝前、较大值朝后，500 附近表示居中。输出层仍会继续套用轴配置约束。' },
  { key: 'L2', label: 'L2 左右', min: 0, max: 999, step: 1, description: '左右平移轴的逻辑目标值；按 TCode 约定，正向为用户左侧；500 附近表示居中。' },
  { key: 'R0', label: 'R0 扭转', min: 0, max: 999, step: 1, description: '绕 L0 轴旋转的扭转逻辑值；500 附近表示居中。' },
  { key: 'R1', label: 'R1 滚转', min: 0, max: 999, step: 1, description: '绕 L1 轴旋转的滚转逻辑值；500 附近表示居中。' },
  { key: 'R2', label: 'R2 俯仰', min: 0, max: 999, step: 1, description: '绕 L2 轴旋转的俯仰逻辑值；500 附近表示居中。' },
  { key: 'V0', label: 'V0 震动', min: 0, max: 999, step: 1, description: '主震动逻辑值。0 为关闭，999 为最大；输出层仍会继续套用轴配置约束。' },
  { key: 'V1', label: 'V1 震动 2', min: 0, max: 999, step: 1, description: '第二路震动逻辑值。0 为关闭，999 为最大。' },
  { key: 'V2', label: 'V2 震动 3', min: 0, max: 999, step: 1, description: '第三路震动逻辑值。0 为关闭，999 为最大。' },
  { key: 'A0', label: 'A0 辅助', min: 0, max: 999, step: 1, description: '辅助通道逻辑值；500 附近表示居中。' },
];

const SIGNAL_ROLE_OPTIONS = [
  { value: 'Depth', label: '主轴行程（L0）' },
  { value: 'Surge', label: '前后位移（L1，正向=后）' },
  { value: 'Sway', label: '左右位移（L2）' },
  { value: 'AngleX', label: '滚转（R1）' },
  { value: 'AngleY', label: '俯仰（R2）' },
  { value: 'Twist', label: '扭转（R0）' },
  { value: 'V0', label: '震动（V0）' },
  { value: 'V1', label: '震动 2（V1）' },
  { value: 'V2', label: '震动 3（V2）' },
  { value: 'Auxiliary', label: '辅助（A0）' },
];

// Position/rotation axes default to no smoothing (alpha=1); vibration axes default to moderate smoothing
const DEFAULT_SIGNAL_SMOOTHING = {
  Depth: 1.0,
  Surge: 1.0,
  Sway: 1.0,
  AngleX: 1.0,
  AngleY: 1.0,
  Twist: 1.0,
  V0: 0.4,
  V1: 0.4,
  V2: 0.4,
  Auxiliary: 1.0,
};

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
];

const DEFAULT_AXIS_PROFILE = {
  min: 0,
  max: 999,
  remapMin: 0,
  remapMax: 999,
  maxSpeed: 5000,
  invert: false,
  mode: 'Normal',
  lockValue: 0.5,
};

const AXIS_MODE_OPTIONS = [
  { value: 'Normal', label: '普通' },
  { value: 'Locked', label: '锁定' },
  { value: 'Ignored', label: '忽略' },
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
    case 'osr2-core':
      ignoreAxes(['l1', 'l2', 'r0', 'v0', 'v1', 'v2', 'a0']);
      return profile;
    case 'l0-only':
      ignoreAxes(['l1', 'l2', 'r0', 'r1', 'r2', 'v0', 'v1', 'v2', 'a0']);
      return profile;
    case 'l0-pose-lock':
      ignoreAxes(['v0', 'v1', 'v2']);
      lockAxes(['l1', 'l2', 'r0', 'r1', 'r2', 'a0'], 0.5);
      return profile;
    case 'sr6-full':
    default:
      return profile;
  }
}

const AXIS_PROFILE_PRESETS = [
  {
    id: 'sr6-full',
    name: 'SR6 / OSR6 全轴',
    description: '保留全部线性、旋转、震动与辅助轴，适合多轴完整控制。',
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

  return {
    min,
    max,
    remapMin,
    remapMax,
    maxSpeed: Math.max(0, Math.min(9999, Number(next.maxSpeed ?? DEFAULT_AXIS_PROFILE.maxSpeed))),
    invert: Boolean(next.invert),
    mode,
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
  };
}

function normalizeAxisProfileCard(profile, index = 0) {
  const isDefault = Boolean(profile?.isDefault);
  return {
    id: (profile?.id || (index === 0 ? 'global-default' : `axis-profile-${index + 1}`)).trim(),
    name: isDefault ? '全局默认' : (profile?.name || (index === 0 ? '全局默认' : `轴配置 ${index + 1}`)).trim(),
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
    name: profile.id === defaultProfile.id ? '全局默认' : profile.name,
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

function legacyMappedPositionFromOutput(value, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(999, Math.round(Math.max(0, Math.min(1, numeric)) * 1000)));
}

function makeSignalDraft(signal = {}) {
  const role = signal.role || 'Depth';
  const mappedMinCandidate = signal.mappedMin ?? legacyMappedPositionFromOutput(signal.outputMin, 0);
  const mappedMaxCandidate = signal.mappedMax ?? legacyMappedPositionFromOutput(signal.outputMax, 999);
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
    smoothingAlpha: DEFAULT_SIGNAL_SMOOTHING[role] ?? 1.0,
    deadZone: role === 'V0' || role === 'V1' || role === 'V2' ? 0 : 0.01,
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
    outputMin: mappedMin / 1000,
    outputMax: mappedMax / 1000,
    smoothingAlpha: Number(rest.smoothingAlpha || 0),
    deadZone: Number(rest.deadZone || 0),
  };
}

function computeSignalHash(signals) {
  const cleaned = signals.map(stripSignalDraft).filter(s => Boolean(s.oscPath));
  return JSON.stringify(cleaned);
}

function describeCommandMode(preferSpeedMode) {
  return preferSpeedMode ? '按速度 (S)' : '按时间 (I)';
}

function describeCommandModeDetail(preferSpeedMode) {
  return preferSpeedMode ? '发送 S 指令，适合持续跟随当前目标。' : '发送 I 指令，适合定时缓动和回正。';
}

function formatAxisPositionFromNormalized(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '—';
  return `${Math.max(0, Math.min(999, Math.round(numeric * 1000)))}`;
}

function buildAxisProfileAxisRows(profileCard) {
  const motion = normalizeMotionProfile(profileCard?.motion, false);
  return AXIS_PROFILE_DEFS.map(axis => {
    const current = motion[axis.key];
    const defaults = createDefaultAxisProfileValue(axis.key);
    const details = [];

    const pushDetail = (label, changed = false, tone = 'neutral') => {
      details.push({ label, changed, tone });
    };

    if (current.mode === 'Ignored') {
      pushDetail('忽略', true, 'warning');
      return { axis: axis.axis, details };
    }

    if (current.mode === 'Locked') {
      pushDetail(`锁定 ${formatAxisPositionFromNormalized(current.lockValue)}`, true, 'warning');
      if (current.invert) pushDetail('反向', true, 'danger');
      return { axis: axis.axis, details };
    }

    pushDetail(`边界 ${current.min}-${current.max}`, current.min !== defaults.min || current.max !== defaults.max, 'bounds');
    pushDetail(`映射 ${current.remapMin}-${current.remapMax}`, current.remapMin !== defaults.remapMin || current.remapMax !== defaults.remapMax, 'remap');
    pushDetail(`限速 ${current.maxSpeed}`, current.maxSpeed !== defaults.maxSpeed, 'speed');

    if (current.invert) pushDetail('反向', true, 'danger');

    return { axis: axis.axis, details };
  });
}

function isTCodeOutputType(type) {
  return type === 'TCodeSerial' || type === 'TCodeUdp' || type === 'TCodeTcp';
}

function getOutputTypeLabel(type) {
  return OUTPUT_TYPE_BY_VALUE[type]?.label || '输出设备';
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
    updatesPerSecond: 100,
    preferSpeedMode: true,
    manageEngineProcess: true,
    websocketAddress: 'ws://localhost:12345',
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
    updatesPerSecond: Number(output?.updatesPerSecond || fallback.updatesPerSecond),
    preferSpeedMode: output?.preferSpeedMode !== false,
    manageEngineProcess: output?.manageEngineProcess !== false,
    websocketAddress: normalizeOutputWebsocketAddress(output?.websocketAddress, fallback.websocketAddress),
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
    return `${portLabel} · ${Math.max(10, Number(output.updatesPerSecond || 100))} Hz · ${describeCommandMode(Boolean(output.preferSpeedMode))}`;
  }
  if (output.type === 'TCodeUdp' || output.type === 'TCodeTcp') {
    return `${output.host || '127.0.0.1'}:${output.port || (output.type === 'TCodeUdp' ? 9999 : 9998)}`;
  }
  return output.websocketAddress || 'ws://localhost:12345';
}

function apiRequest(path, options = {}) {
  // Use WebSocket when available for all non-FormData requests
  if (_wsCommandSocket && _wsCommandSocket.readyState === WebSocket.OPEN && !(options.body instanceof FormData)) {
    return wsRequest(path, options);
  }
  return httpRequest(path, options);
}

function httpRequest(path, options = {}) {
  return fetch(path, options).then(async response => {
    const isJson = (response.headers.get('content-type') || '').includes('application/json');
    const payload = isJson ? await response.json() : await response.text();

    if (!response.ok) {
      const message = typeof payload === 'string' ? payload : payload?.error || payload?.message || `${response.status} ${response.statusText}`;
      throw new Error(message);
    }

    return payload;
  });
}

let _wsRequestId = 0;
const _wsPending = new Map();
let _wsCommandSocket = null;

function setWsCommandSocket(socket) {
  _wsCommandSocket = socket;
}

function clearWsPendingRequests(error) {
  for (const [, pending] of _wsPending) {
    clearTimeout(pending.timeout);
    if (error) pending.reject(error);
    else pending.resolve(undefined);
  }

  _wsPending.clear();
}

function wsRequest(path, options = {}) {
  return new Promise((resolve, reject) => {
    if (!_wsCommandSocket || _wsCommandSocket.readyState !== WebSocket.OPEN) {
      resolve(httpRequest(path, options));
      return;
    }

    const id = ++_wsRequestId;
    const method = options.method || 'GET';
    const msg = { id: String(id), method, path };

    if (options.body) {
      if (options.body instanceof FormData) {
        resolve(httpRequest(path, options));
        return;
      }
      msg.body = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
    }

    const timeout = setTimeout(() => {
      _wsPending.delete(String(id));
      resolve(httpRequest(path, options));
    }, 8000);

    _wsPending.set(String(id), { resolve, reject, timeout });

    try {
      _wsCommandSocket.send(JSON.stringify(msg));
    } catch (err) {
      _wsPending.delete(String(id));
      clearTimeout(timeout);
      resolve(httpRequest(path, options));
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
    preferredInputTab: INPUT_MODES.some(item => item.value === raw?.preferredInputTab) ? raw.preferredInputTab : 'osc',
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

function getLatestOscPreviewEntry(previewEntries, pattern) {
  const matches = Array.isArray(previewEntries) ? previewEntries.filter(entry => matchesOscPathPattern(pattern, entry?.path || '')) : [];
  if (matches.length === 0) return null;

  const latest = matches.reduce((current, entry) => {
    if (!current) return entry;
    return Number(entry?.timestampMs || 0) > Number(current?.timestampMs || 0) ? entry : current;
  }, null);

  return latest ? { ...latest, matchCount: matches.length } : null;
}

function formatPreviewTimestamp(timestampMs) {
  if (!timestampMs) return '—';
  const value = new Date(timestampMs);
  if (Number.isNaN(value.getTime())) return '—';
  return value.toLocaleTimeString();
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

  return {
    axis: axisMatch[1],
    src: parseAxisTraceNumber(fields.src),
    prevSrc: parseAxisTraceNumber(fields.prevSrc),
    prevOut: parseAxisTraceNumber(fields.prevOut),
    out: parseAxisTraceNumber(fields.out),
    norm: parseAxisTraceNumber(fields.norm),
    remap: parseAxisTraceNumber(fields.remap),
    mapped: parseAxisTraceNumber(fields.mapped),
    mode: fields.mode || '',
    invert: parseAxisTraceBoolean(fields.invert),
    min: parseAxisTraceNumber(fields.min),
    max: parseAxisTraceNumber(fields.max),
    remapMin: parseAxisTraceNumber(fields.remapMin),
    remapMax: parseAxisTraceNumber(fields.remapMax),
    lock: parseAxisTraceNumber(fields.lock),
    action: fields.action || '',
    term: fields.term || '',
    note: fields.note || '',
  };
}

function formatAxisTraceNote(note) {
  switch ((note || '').toLowerCase()) {
    case 'ignored':
      return '轴已忽略';
    case 'profile-held':
      return '轴配置后无变化';
    default:
      return note || '';
  }
}

function formatAxisTraceAction(action) {
  switch ((action || '').toLowerCase()) {
    case 'emit':
      return { label: '已发送', color: 'primary' };
    case 'skip':
      return { label: '未发送', color: 'default' };
    default:
      return { label: action || '未知动作', color: 'default' };
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
  if (text.startsWith('S')) return `速度 ${text.slice(1)}`;
  if (text.startsWith('I')) return `时长 ${text.slice(1)}ms`;
  return text;
}

function formatAxisDisplayValue(value, decimals = 0) {
  if (!Number.isFinite(Number(value))) return '—';
  return decimals > 0 ? Number(value).toFixed(decimals) : `${Math.round(Number(value))}`;
}

function normalizeManualCommand(command) {
  const raw = command || {};
  const toManualValue = value => {
    const numeric = Number(value ?? 0);
    if (!Number.isFinite(numeric)) return 0;
    if (numeric < 0 || numeric > 1) return Math.max(0, Math.min(999, Math.round(numeric)));
    return Math.max(0, Math.min(999, Math.round(numeric * 1000)));
  };
  return {
    ...EMPTY_MANUAL,
    L0: toManualValue(raw.L0 ?? EMPTY_MANUAL.L0),
    L1: toManualValue(raw.L1 ?? EMPTY_MANUAL.L1),
    L2: toManualValue(raw.L2 ?? EMPTY_MANUAL.L2),
    R0: toManualValue(raw.R0 ?? EMPTY_MANUAL.R0),
    R1: toManualValue(raw.R1 ?? EMPTY_MANUAL.R1),
    R2: toManualValue(raw.R2 ?? EMPTY_MANUAL.R2),
    V0: toManualValue(raw.V0 ?? EMPTY_MANUAL.V0),
    V1: toManualValue(raw.V1 ?? EMPTY_MANUAL.V1),
    V2: toManualValue(raw.V2 ?? EMPTY_MANUAL.V2),
    A0: toManualValue(raw.A0 ?? EMPTY_MANUAL.A0),
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
  next.schemaVersion = 4;
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
  const [startValue, endValue] = value;
  const minBound = Number.isFinite(inputMin) ? inputMin : sliderMin;
  const maxBound = Number.isFinite(inputMax) ? inputMax : sliderMax;
  const handleChange = (nextStart, nextEnd) => {
    onChange(
      normalizeRangePair(nextStart, nextEnd, {
        min: Number.isFinite(minBound) ? minBound : null,
        max: Number.isFinite(maxBound) ? maxBound : null,
        step,
        fallbackStart: startValue,
        fallbackEnd: endValue,
      }),
    );
  };

  return (
    <Box className="range-field">
      <Stack direction="row" justifyContent="space-between" alignItems="center" className="range-field__header">
        <Typography variant="caption" color="text.secondary" component="div">
          <HelpLabel text={label} title={title} />
        </Typography>
        <Typography variant="caption" className="range-field__value">
          {`${valueFormatter(startValue)}-${valueFormatter(endValue)}`}
        </Typography>
      </Stack>

      <Slider
        min={sliderMin}
        max={sliderMax}
        step={step}
        value={[startValue, endValue]}
        valueLabelDisplay="auto"
        valueLabelFormat={valueFormatter}
        onChange={(_, next) => handleChange(next[0], next[1])}
      />
    </Box>
  );
}

function ValueSliderField({ label, title, value, onChange, min, max, step = 1, valueFormatter = next => formatCompactNumber(next, precisionFromStep(step)) }) {
  const handleChange = next => {
    const normalized = normalizeRangePair(next, next, { min, max, step, fallbackStart: value, fallbackEnd: value })[0];
    onChange(normalized);
  };

  return (
    <Box className="range-field">
      <Stack direction="row" justifyContent="space-between" alignItems="center" className="range-field__header">
        <Typography variant="caption" color="text.secondary" component="div">
          <HelpLabel text={label} title={title} />
        </Typography>
        <Typography variant="caption" className="range-field__value">
          {valueFormatter(value)}
        </Typography>
      </Stack>

      <Slider min={min} max={max} step={step} value={value} valueLabelDisplay="auto" valueLabelFormat={valueFormatter} onChange={(_, next) => handleChange(next)} />
    </Box>
  );
}

function AxisSlider({ axis, value, onChange }) {
  const axisLabel = (
    <Typography
      variant="subtitle2"
      sx={
        axis.description
          ? {
              textDecoration: 'underline dotted',
              textUnderlineOffset: '3px',
              cursor: 'help',
            }
          : undefined
      }
    >
      {axis.label}
    </Typography>
  );

  return (
    <Box className="axis-slider-card">
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
        {axis.description ? (
          <Tooltip title={axis.description} arrow placement="top">
            {axisLabel}
          </Tooltip>
        ) : (
          axisLabel
        )}
        <Chip size="small" variant="outlined" label={axis.step >= 1 ? `${Math.round(Number(value))}` : Number(value).toFixed(2)} />
      </Stack>
      <Slider min={axis.min} max={axis.max} step={axis.step} value={value} valueLabelDisplay="auto" onChange={(_, next) => onChange(Number(next))} />
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
  const rangeLabel = Number.isFinite(trace.min) && Number.isFinite(trace.max) ? `${trace.min}-${trace.max}` : '—';
  const remapLabel = Number.isFinite(trace.remapMin) && Number.isFinite(trace.remapMax) ? `${trace.remapMin}-${trace.remapMax}` : '—';
  const lockLabel = Number.isFinite(trace.lock) ? formatAxisPositionFromNormalized(trace.lock) : '—';
  const termLabel = formatAxisTraceTerm(trace.term);

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

      <Box className="axis-trace-grid">
        <AxisTraceMetric label="输入值" value={`${formatAxisDisplayValue(trace.prevSrc)} → ${formatAxisDisplayValue(trace.src)}`} />
        <AxisTraceMetric label="逻辑值" value={formatAxisDisplayValue(trace.norm, 3)} />
        <AxisTraceMetric label="映射后" value={formatAxisDisplayValue(trace.remap, 3)} />
        <AxisTraceMetric label="最终位置" value={formatAxisDisplayValue(trace.mapped, 3)} />
        <AxisTraceMetric label="输出值" value={`${formatAxisDisplayValue(trace.prevOut)} → ${formatAxisDisplayValue(trace.out)}`} />
        <AxisTraceMetric label="边界" value={rangeLabel} />
        <AxisTraceMetric label="映射区间" value={remapLabel} />
        <AxisTraceMetric label="锁定" value={lockLabel} />
      </Box>
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

  return (
    <Box className="motion-axis-card">
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1.5} mb={0.5}>
        <Box>
          <Typography variant="subtitle2">{axisDefinition.axis}</Typography>
          <Typography variant="caption" color="text.secondary">
            {axisDefinition.label}
          </Typography>
        </Box>

        <FormControl size="small" sx={{ minWidth: 124, flexShrink: 0 }}>
          <InputLabel>轴模式</InputLabel>
          <Select disabled={disabled} value={axisMode} label="轴模式" MenuProps={{ disableScrollLock: true }} onChange={event => onChange({ mode: event.target.value })}>
            {AXIS_MODE_OPTIONS.map(option => (
              <MenuItem key={`${axisDefinition.axis}-${option.value}`} value={option.value}>
                {option.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
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
            label="边界"
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

          <ValueSliderField
            label="速度限制"
            title="该轴在按速度模式下使用的速度上限；允许范围 0-9999。"
            value={value.maxSpeed}
            min={0}
            max={9999}
            step={1}
            onChange={next => onChange({ maxSpeed: next })}
          />

          <FormControlLabel
            sx={{ mt: 0.25 }}
            control={<Switch checked={Boolean(value.invert)} disabled={disabled} onChange={(_, checked) => onChange({ invert: checked })} />}
            label={<HelpLabel text="反向" title="反向会在锁定 / 映射 / 边界处理之前先翻转 0~1 的逻辑方向。" />}
          />
        </>
      )}
    </Box>
  );
}

function SignalMappingRow({ draft, latestEntry, onChange, onRemove }) {
  const [inputSliderMin, inputSliderMax] = getDynamicFloatSliderBounds([draft.vrchatMin, draft.vrchatMax]);
  const roleLabel = SIGNAL_ROLE_OPTIONS.find(option => option.value === draft.role)?.label || draft.role;

  return (
    <Box className="signal-row">
      <Box className="signal-row__header">
        <TextField
          fullWidth
          className="signal-row__path"
          label={<HelpLabel text="参数路径" title="支持精确匹配、单段通配 * 与多段通配 **。多个参数命中同一规则时，后端会取最近更新的一条。" />}
          size="small"
          value={draft.oscPath}
          onChange={event => onChange({ oscPath: event.target.value })}
          placeholder="例如: OGB/Orf/Pussy/Main/PenOthers"
        />

        <FormControl size="small" fullWidth className="signal-row__role">
          <InputLabel>
            <HelpLabel text="目标轴" title="选择这条 OSC 映射最终驱动的设备轴；同一目标轴的多条规则会在后端做融合。" />
          </InputLabel>
          <Select value={draft.role} label="目标轴" MenuProps={{ disableScrollLock: true }} onChange={event => onChange({ role: event.target.value })}>
            {SIGNAL_ROLE_OPTIONS.map(option => (
              <MenuItem key={option.value} value={option.value}>
                {option.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

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
        <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" alignItems="center" className="signal-row__status">
          <Chip size="small" variant="outlined" label={roleLabel} />
          {latestEntry ? (
            <>
              <Chip size="small" variant="outlined" label={`最新 ${latestEntry.value}`} />
              {latestEntry.path && latestEntry.path !== draft.oscPath && <Chip size="small" variant="outlined" label={latestEntry.path} />}
              {latestEntry.matchCount > 1 && <Chip size="small" variant="outlined" label={`命中 ${latestEntry.matchCount}`} />}
            </>
          ) : (
            <Chip size="small" variant="outlined" label="未命中实时参数" />
          )}
        </Stack>

        <RangeField
          label="输入范围"
          title="把原始 OSC 值的最小点校准为逻辑 0、最大点校准为逻辑 1。"
          value={[draft.vrchatMin, draft.vrchatMax]}
          sliderMin={inputSliderMin}
          sliderMax={inputSliderMax}
          step={0.01}
          valueFormatter={next => formatCompactNumber(next, 2)}
          onChange={([vrchatMin, vrchatMax]) => onChange({ vrchatMin, vrchatMax })}
        />

        <RangeField
          label="映射位置"
          title="校准、平滑、曲线处理后的逻辑 0/1，会被放到这个设备位置区间；范围 0-999。"
          value={[draft.mappedMin, draft.mappedMax]}
          sliderMin={0}
          sliderMax={999}
          onChange={([mappedMin, mappedMax]) => onChange({ mappedMin, mappedMax })}
        />

        <ValueSliderField
          label="平滑"
          title="指数滑动平均。0.4 表示新输出 = 40% 本次值 + 60% 上次结果；越小越平滑，但延迟越明显。"
          value={draft.smoothingAlpha}
          min={0}
          max={1}
          step={0.01}
          valueFormatter={next => formatCompactNumber(next, 2)}
          onChange={next => onChange({ smoothingAlpha: next })}
        />
      </Box>
    </Box>
  );
}

function App() {
  const [config, setConfig] = useState(null);
  const [overview, setOverview] = useState(null);
  const [logs, setLogs] = useState([]);
  const [studio, setStudio] = useState(() => loadStudio() || { preferredInputTab: 'osc' });
  const [serialPorts, setSerialPorts] = useState([]);
  const [oscDraft, setOscDraft] = useState({ receiverHost: '0.0.0.0', receiverPort: 9001 });
  const [signalDrafts, setSignalDrafts] = useState([]);
  const [selectedOscPreset, setSelectedOscPreset] = useState('');
  const [presetDialog, setPresetDialog] = useState(null);
  const [profileDialog, setProfileDialog] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [manualDraft, setManualDraft] = useState(EMPTY_MANUAL);
  const [manualContinuous, setManualContinuous] = useState(false);
  const [scriptSettings, setScriptSettings] = useState({ loop: false, speed: 1 });
  const [selectedScriptFile, setSelectedScriptFile] = useState(null);
  const [scriptInputKey, setScriptInputKey] = useState(0);
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
  const [expandedAxisProfileIds, setExpandedAxisProfileIds] = useState({});

  const manualTimerRef = useRef(null);
  const manualDraftRef = useRef(EMPTY_MANUAL);
  const savedSignalsHashRef = useRef('');
  const scriptSettingsInitializedRef = useRef(false);
  const manualInitializedRef = useRef(false);

  useEffect(() => {
    let disposed = false;

    async function loadInitial() {
      try {
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
        });
        setSignalDrafts(buildSignalDrafts(configResponse?.signals));
        savedSignalsHashRef.current = computeSignalHash(buildSignalDrafts(configResponse?.signals));
        setStudio(previous => sanitizeStudio(previous, configResponse));
        setManualDraft({ ...EMPTY_MANUAL });
        manualDraftRef.current = { ...EMPTY_MANUAL };
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
    if (!selectedScriptFile) return;
    let cancelled = false;

    (async () => {
      const formData = new FormData();
      formData.append('file', selectedScriptFile);
      formData.append('loop', String(scriptSettings.loop));
      formData.append('speed', String(scriptSettings.speed));

      try {
        const result = await apiRequest('/api/input/script/load', {
          method: 'POST',
          body: formData,
        });

        if (cancelled) return;

        setSelectedScriptFile(null);
        setScriptInputKey(previous => previous + 1);
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
          setScriptInputKey(previous => previous + 1);
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
            pending.resolve(payload.data);
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

  async function persistConfig(nextConfig) {
    nextConfig.schemaVersion = 4;
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
      nextConfig.schemaVersion = 4;
      nextConfig.osc = {
        ...nextConfig.osc,
        receiverHost: (oscDraft.receiverHost || '0.0.0.0').trim() || '0.0.0.0',
        receiverPort: Number(oscDraft.receiverPort || 9001),
      };

      await persistConfig(nextConfig);
      await refreshOverview();
      notify('OSC 配置已保存', 'success');
    }).catch(error => notify(error.message || '保存 OSC 配置失败', 'error'));
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
      nextConfig.schemaVersion = 4;
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
      const nextProfileName = profileDialog.isDefault ? '全局默认' : (profileDialog.name || '轴配置').trim() || '轴配置';
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
    };
  }

  const manualRafRef = useRef(null);

  function handleManualSliderChange(patch) {
    const nextDraft = { ...manualDraft, ...patch };
    setManualDraft(nextDraft);
    manualDraftRef.current = nextDraft;
    if (!manualContinuous) return;

    if (manualRafRef.current) return; // already scheduled
    manualRafRef.current = requestAnimationFrame(() => {
      manualRafRef.current = null;
      const draft = manualDraftRef.current;
      apiRequest('/api/input/manual', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: true,
          ...manualDraftToPayload(draft),
        }),
      }).catch(error => notify(error.message || '手动输入更新失败', 'error'));
    });
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
      const formData = new FormData();
      formData.append('file', selectedScriptFile);
      formData.append('loop', String(scriptSettings.loop));
      formData.append('speed', String(scriptSettings.speed));

      const result = await apiRequest('/api/input/script/load', {
        method: 'POST',
        body: formData,
      });

      setSelectedScriptFile(null);
      setScriptInputKey(previous => previous + 1);
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
      await apiRequest('/api/control/loop/emergency-stop', { method: 'POST' });
      await refreshOverview();
      notify('已停止所有输出', 'warning');
    }).catch(error => notify(error.message || '急停失败', 'error'));
  }

  async function clearEmergency() {
    await withBusy('emergency-clear', async () => {
      await apiRequest('/api/control/loop/clear-emergency', { method: 'POST' });
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

  function toggleAxisProfileExpanded(profileId) {
    setExpandedAxisProfileIds(previous => ({
      ...previous,
      [profileId]: !previous[profileId],
    }));
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

  const studioState = studio || { preferredInputTab: 'osc' };
  const outputs = getOutputs(config);
  const axisProfiles = getAxisProfiles(config);
  const actualInputMode = overview?.input?.mode || studioState.preferredInputTab || 'osc';
  const selectedInputTab = INPUT_MODES.some(item => item.value === studioState.preferredInputTab) ? studioState.preferredInputTab : actualInputMode;
  const hasPendingInputMode = selectedInputTab !== actualInputMode;
  const scriptState = overview?.input?.script || null;
  const oscPreview = overview?.osc?.preview || [];
  const sortedOscPreview = useMemo(() => {
    const signals = Array.isArray(signalDrafts) ? signalDrafts.filter(d => d?.oscPath) : [];
    return [...oscPreview]
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
  }, [oscPreview, signalDrafts]);
  const visibleOutputs = outputs;
  const effectiveOutputCount = visibleOutputs.filter(output => Boolean(output.enabled)).length;
  const outputDialogConflicts = useMemo(() => {
    if (!dialog || !config) return [];
    return getOutputTargetConflicts(config, dialog.outputId, dialog.draft);
  }, [config, dialog]);
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
        if ((log.axisTrace.action || '').toLowerCase() === 'emit') acc.emit += 1;
        if ((log.axisTrace.action || '').toLowerCase() === 'skip') acc.skip += 1;
        return acc;
      },
      { total: 0, emit: 0, skip: 0 },
    );
  }, [filteredLogs]);

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
            {actualInputMode === 'osc' && <Chip size="small" color={oscPreview.length > 0 ? 'success' : 'default'} variant="outlined" label={oscPreview.length > 0 ? 'OSC 已连接' : 'OSC 未连接'} />}
            <Chip size="small" variant="outlined" label={`输入方式 ${formatMode(actualInputMode)}`} />
            <Chip size="small" variant="outlined" label={`有效输出 ${effectiveOutputCount}/${visibleOutputs.length}`} />

            {overview?.loop?.isEmergency ? (
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
          {overview?.loop?.isEmergency && <Alert severity="warning">当前已停止所有输出。</Alert>}

          <Card className="section-card" variant="outlined">
            <CardHeader title="输入" />
            <Divider />
            <CardContent>
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
                          checked={overview?.loop?.inputActive !== false}
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
                    <Box className="dialog-panel">
                      <Box className="dialog-panel__header">
                        <Typography variant="subtitle2">OSC 配置</Typography>
                        <Chip size="small" variant="outlined" label={`${oscDraft.receiverHost || '0.0.0.0'}:${oscDraft.receiverPort || 9001}`} />
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
                      </Box>

                      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 1.5 }}>
                        <Button variant="contained" onClick={saveOscConfig} disabled={busyKey === 'osc-save'}>
                          保存配置
                        </Button>
                      </Stack>
                    </Box>

                    <Box className="dialog-panel">
                      <Box className="dialog-panel__header">
                        <Typography variant="subtitle2">参数预览</Typography>
                        <Chip size="small" variant="outlined" label={`${oscPreview.length} 项`} />
                      </Box>

                      {oscPreview.length === 0 ? (
                        <Box className="empty-inline-state">
                          <Typography color="text.secondary">暂无 OSC 参数</Typography>
                        </Box>
                      ) : (
                        <TableContainer className="osc-preview-table-wrap">
                          <Table size="small" className="osc-preview-table">
                            <TableHead>
                              <TableRow>
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

                  <Box className="dialog-panel">
                    <Box className="dialog-panel__header">
                      <Typography variant="subtitle2">OSC 映射</Typography>
                      <Stack direction="row" spacing={0.5}>
                        {hasUnsavedMappings && <Chip size="small" color="warning" variant="filled" label="未保存" />}
                        <Chip size="small" variant="outlined" label={`${signalDrafts.length} 条`} />
                      </Stack>
                    </Box>

                    <Stack className="osc-preset-toolbar" direction="row" spacing={2} useFlexGap flexWrap="wrap" alignItems="center" sx={{ py: 1 }}>
                      <FormControl size="small" sx={{ minWidth: 280 }}>
                        <InputLabel>预设方案</InputLabel>
                        <Select value={selectedOscPreset} label="预设方案" MenuProps={{ disableScrollLock: true }} onChange={event => setSelectedOscPreset(event.target.value)}>
                          {oscMappingPresets.map(preset => (
                            <MenuItem key={preset.id} value={preset.id}>
                              {preset.name}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>

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

                    <Typography variant="body2" color="text.secondary" className="osc-preset-description">
                      {selectedOscPresetConfig ? selectedOscPresetConfig.description || '选一套预设可快速生成映射。' : '当前没有可用预设，可先新建一套。'}
                    </Typography>

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
                            latestEntry={getLatestOscPreviewEntry(oscPreview, draft.oscPath)}
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

                  <Stack direction="row" spacing={1.5} useFlexGap flexWrap="wrap" alignItems="center">
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
                      label={
                        <Tooltip title="开启后，每次拖动滑条都会立即更新后端；关闭后滑条仅本地预览，须点「更新位置」才会生效。" arrow>
                          <Box component="span" sx={{ textDecoration: 'underline dotted', textUnderlineOffset: '3px', cursor: 'help' }}>
                            持续更新
                          </Box>
                        </Tooltip>
                      }
                    />
                  </Stack>
                </Stack>
              </TabPanel>

              <TabPanel value="script" current={selectedInputTab}>
                <Stack spacing={2}>
                  <Box className="dialog-panel">
                    <Box className="dialog-panel__header">
                      <Typography variant="subtitle2">脚本文件</Typography>
                      <Chip size="small" variant="outlined" label={selectedScriptFile?.name || scriptState?.fileName || '未选择'} />
                    </Box>
                    <Stack direction="row" spacing={1.5} alignItems="center">
                      <Button component="label" variant="contained" disabled={!!selectedScriptFile}>
                        {selectedScriptFile ? '加载中…' : '选择脚本'}
                        <input key={scriptInputKey} hidden type="file" accept=".funscript,.json" onChange={event => setSelectedScriptFile(event.target.files?.[0] || null)} />
                      </Button>
                      <Typography variant="caption" color="text.secondary">
                        选择 .funscript 文件后自动加载
                      </Typography>
                    </Stack>
                  </Box>

                  <Box className="metric-grid metric-grid--compact">
                    <MetricCard label="状态" value={scriptState?.state || 'empty'} tone="accent" />
                    <MetricCard label="动作数" value={scriptState?.actionCount ?? 0} tone="default" />
                    <MetricCard label="进度" value={`${formatDuration(scriptState?.positionMs || 0)} / ${formatDuration(scriptState?.durationMs || 0)}`} tone="primary" />
                  </Box>

                  <Box className="dialog-panel">
                    <Box className="dialog-panel__header">
                      <Typography variant="subtitle2">播放控制</Typography>
                      <Chip size="small" variant="outlined" label={`${scriptSettings.speed.toFixed(2)}x${scriptSettings.loop ? ' · 循环' : ''}`} />
                    </Box>

                    <Stack spacing={2}>
                      <Stack spacing={0.5}>
                        <Typography variant="caption" color="text.secondary">
                          播放速度
                        </Typography>
                        <Slider
                          min={0.25}
                          max={2}
                          step={0.05}
                          value={scriptSettings.speed}
                          valueLabelDisplay="auto"
                          onChange={(_, next) => setScriptSettings(previous => ({ ...previous, speed: Number(next) }))}
                        />
                      </Stack>

                      <FormControlLabel
                        control={<Switch checked={scriptSettings.loop} onChange={(_, checked) => setScriptSettings(previous => ({ ...previous, loop: checked }))} />}
                        label={scriptSettings.loop ? '循环播放' : '单次播放'}
                      />

                      <LinearProgress
                        variant={scriptState?.durationMs ? 'determinate' : 'indeterminate'}
                        value={scriptState?.durationMs ? Math.min(100, (scriptState.positionMs / scriptState.durationMs) * 100) : 0}
                        sx={{ height: 8, borderRadius: 4 }}
                      />

                      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                        <Button variant="contained" onClick={() => playScript(false)} disabled={busyKey === 'script-play' || busyKey === 'script-load'}>
                          播放
                        </Button>
                        <Button variant="outlined" onClick={() => playScript(true)} disabled={!scriptState?.loaded || busyKey === 'script-restart'}>
                          从头开始
                        </Button>
                        <Button variant="outlined" color="warning" onClick={pauseScript} disabled={!scriptState?.loaded || busyKey === 'script-pause'}>
                          暂停
                        </Button>
                        <Button variant="outlined" color="error" onClick={stopScript} disabled={!scriptState?.loaded || busyKey === 'script-stop'}>
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
                  const isExpanded = Boolean(expandedAxisProfileIds[profile.id]);

                  return (
                    <Card key={profile.id} className="config-card" variant="outlined">
                      <CardHeader
                        title={profile.name}
                        subheader={usedCount > 0 ? `${usedCount} 个输出在用` : '未分配输出'}
                        action={profile.isDefault ? <Chip size="small" color="primary" variant="outlined" label="默认" /> : null}
                      />
                      <CardContent>
                        <Stack spacing={1.5}>
                          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                            <Button variant="contained" onClick={() => openProfileDialog(profile.id)}>
                              修改配置
                            </Button>
                            <Button variant="text" onClick={() => toggleAxisProfileExpanded(profile.id)}>
                              {isExpanded ? '收起详情' : '展开详情'}
                            </Button>
                            {!profile.isDefault && (
                              <Button variant="outlined" onClick={() => setDefaultAxisProfile(profile.id)}>
                                设为默认
                              </Button>
                            )}
                            {!profile.isDefault && (
                              <Button color="error" onClick={() => removeAxisProfile(profile.id)}>
                                移除
                              </Button>
                            )}
                          </Stack>

                          <Collapse in={isExpanded} mountOnEnter unmountOnExit>
                            <Box className="axis-profile-detail-list">
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
                          </Collapse>
                        </Stack>
                      </CardContent>
                    </Card>
                  );
                })}

                <Card className="config-card config-card--add" variant="outlined">
                  <CardContent>
                    <Stack spacing={1.5} alignItems="center" justifyContent="center" sx={{ height: '100%', textAlign: 'center' }}>
                      <Typography variant="subtitle1">新增轴配置</Typography>
                      <Typography variant="body2" color="text.secondary">
                        新建一套可复用的轴限制。
                      </Typography>
                      <Button variant="contained" onClick={openNewProfileDialog}>
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
                              </Stack>

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
                  <FormControl size="small" sx={{ minWidth: 112 }}>
                    <InputLabel>级别</InputLabel>
                    <Select value={logFilterLevel} label="级别" onChange={e => setLogFilterLevel(e.target.value)}>
                      <MenuItem value="debug">全部日志</MenuItem>
                      <MenuItem value="info">信息以上</MenuItem>
                      <MenuItem value="warning">警告以上</MenuItem>
                      <MenuItem value="error">仅错误</MenuItem>
                    </Select>
                  </FormControl>

                  <FormControl size="small" sx={{ minWidth: 130 }}>
                    <InputLabel>分类</InputLabel>
                    <Select value={logCategoryFilter} label="分类" onChange={e => setLogCategoryFilter(e.target.value)}>
                      <MenuItem value="">全部分类</MenuItem>
                      {logCategories.filter(Boolean).map(cat => (
                        <MenuItem key={cat} value={cat}>
                          {cat}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>

                  <FormControl size="small" sx={{ minWidth: 110 }}>
                    <InputLabel>轴</InputLabel>
                    <Select value={logAxisFilter} label="轴" onChange={e => setLogAxisFilter(e.target.value)}>
                      <MenuItem value="">全部轴</MenuItem>
                      {axisLogCatalog.axes.filter(Boolean).map(axis => (
                        <MenuItem key={axis} value={axis}>
                          {axis}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>

                  <FormControl size="small" sx={{ minWidth: 120 }}>
                    <InputLabel>结果</InputLabel>
                    <Select value={logActionFilter} label="结果" onChange={e => setLogActionFilter(e.target.value)}>
                      <MenuItem value="">全部结果</MenuItem>
                      {axisLogCatalog.actions.filter(Boolean).map(action => (
                        <MenuItem key={action} value={action}>
                          {formatAxisTraceAction(action).label}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>

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
                  <Chip size="small" color="primary" variant="outlined" label={`已发送 ${visibleAxisLogStats.emit}`} />
                  <Chip size="small" variant="outlined" label={`未发送 ${visibleAxisLogStats.skip}`} />
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

      <Dialog open={Boolean(presetDialog)} onClose={() => setPresetDialog(null)} disableScrollLock fullWidth maxWidth="lg">
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
                      latestEntry={getLatestOscPreviewEntry(oscPreview, draft.oscPath)}
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

      <Dialog open={Boolean(dialog)} onClose={() => setDialog(null)} disableScrollLock fullWidth maxWidth="md">
        <DialogTitle>{dialog ? `${getOutputTypeLabel(dialog.draft.type)} 配置` : '输出配置'}</DialogTitle>
        <DialogContent dividers>
          {dialog && (
            <Stack spacing={2}>
              {outputDialogConflictMessage && (
                <Alert severity="warning" variant="outlined">
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
                <FormControl size="small" fullWidth>
                  <InputLabel>
                    <HelpLabel text="轴配置" title="选择这台 TCode 输出使用的轴配置。" />
                  </InputLabel>
                  <Select
                    value={dialog.draft.motionProfileId || getDefaultAxisProfileId(config)}
                    label="轴配置"
                    onChange={event => setDialog(previous => ({ ...previous, draft: { ...previous.draft, motionProfileId: event.target.value } }))}
                  >
                    {axisProfiles.map(profile => (
                      <MenuItem key={profile.id} value={profile.id}>
                        {profile.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}

              {dialog.draft.type === 'TCodeSerial' && (
                <>
                  <Box className="dialog-panel">
                    <Box className="dialog-panel__header">
                      <Typography variant="subtitle2">串口连接</Typography>
                      <Chip size="small" variant="outlined" label={dialog.draft.comPort || '未选择串口'} />
                    </Box>

                    <FormControl size="small" fullWidth error={hasSerialTargetConflict}>
                      <InputLabel>
                        <HelpLabel text="串口" title="选择目标 TCode 设备对应的 COM 端口。" />
                      </InputLabel>
                      <Select
                        value={dialog.draft.comPort || ''}
                        label="串口"
                        MenuProps={{ disableScrollLock: true }}
                        onChange={event => setDialog(previous => ({ ...previous, draft: { ...previous.draft, comPort: event.target.value } }))}
                      >
                        {serialPorts.length === 0 && <MenuItem value="">未检测到串口</MenuItem>}
                        {serialPorts.map(port => {
                          const owner = serialPortOwners.get(port.portName);
                          return (
                            <MenuItem key={port.portName} value={port.portName} disabled={Boolean(owner)}>
                              <Stack direction="row" spacing={1} alignItems="baseline">
                                <Typography variant="body2">{port.portName}</Typography>
                                {port.description && port.description !== port.portName && (
                                  <Typography variant="caption" color="text.secondary">
                                    {port.description}
                                  </Typography>
                                )}
                                {owner && (
                                  <Typography variant="caption" color="error.main">
                                    {`已被 ${getOutputDisplayName(owner)} 使用`}
                                  </Typography>
                                )}
                              </Stack>
                            </MenuItem>
                          );
                        })}
                      </Select>
                    </FormControl>
                  </Box>

                  <Box className="dialog-panel">
                    <Box className="dialog-panel__header">
                      <Typography variant="subtitle2">实时发送</Typography>
                      <Chip size="small" color="primary" variant="outlined" label={describeCommandMode(Boolean(dialog.draft.preferSpeedMode))} />
                    </Box>

                    <Box className="dialog-grid">
                      <TextField
                        label={<HelpLabel text="实时发送频率 (Hz)" title="串口实时刷新的目标频率；越高越跟手，但也更占串口带宽与设备处理时间。" />}
                        type="number"
                        size="small"
                        value={dialog.draft.updatesPerSecond ?? 100}
                        onChange={event => setDialog(previous => ({ ...previous, draft: { ...previous.draft, updatesPerSecond: Number(event.target.value || 0) } }))}
                      />

                      <FormControl size="small" fullWidth>
                        <InputLabel>
                          <HelpLabel text="斜率方式" title={describeCommandModeDetail(Boolean(dialog.draft.preferSpeedMode))} />
                        </InputLabel>
                        <Select
                          value={dialog.draft.preferSpeedMode ? 'speed' : 'interval'}
                          label="斜率方式"
                          onChange={event =>
                            setDialog(previous => ({
                              ...previous,
                              draft: {
                                ...previous.draft,
                                preferSpeedMode: event.target.value === 'speed',
                              },
                            }))
                          }
                        >
                          <MenuItem value="speed">按速度 (S)</MenuItem>
                          <MenuItem value="interval">按时间 (I)</MenuItem>
                        </Select>
                      </FormControl>
                    </Box>
                  </Box>
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

      <Dialog open={Boolean(profileDialog)} onClose={() => setProfileDialog(null)} disableScrollLock fullWidth maxWidth="lg">
        <DialogTitle>{profileDialog ? `${profileDialog.name || '轴配置'} · 轴配置` : '轴配置'}</DialogTitle>
        <DialogContent dividers>
          {profileDialog && (
            <Stack spacing={2}>
              <TextField
                label="配置名称"
                size="small"
                value={profileDialog.name || ''}
                disabled={profileDialog.isDefault}
                onChange={event => setProfileDialog(previous => ({ ...previous, name: event.target.value }))}
              />

              <Box className="dialog-panel">
                <Box className="dialog-panel__header">
                  <Typography variant="subtitle2">快速预设</Typography>
                  {profileDialog.presetId && <Chip size="small" variant="outlined" label={AXIS_PROFILE_PRESETS.find(item => item.id === profileDialog.presetId)?.name || '已选择预设'} />}
                </Box>

                <Box className="preset-apply-row">
                  <FormControl size="small" fullWidth>
                    <InputLabel>轴配置预设</InputLabel>
                    <Select
                      value={profileDialog.presetId || ''}
                      label="轴配置预设"
                      MenuProps={{ disableScrollLock: true }}
                      onChange={event => setProfileDialog(previous => ({ ...previous, presetId: event.target.value }))}
                    >
                      <MenuItem value="">不使用预设</MenuItem>
                      {AXIS_PROFILE_PRESETS.map(preset => (
                        <MenuItem key={preset.id} value={preset.id}>
                          {preset.name}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>

                  <Button className="preset-apply-row__button" variant="outlined" disabled={!profileDialog.presetId} onClick={() => applyAxisProfilePresetToDialog(profileDialog.presetId)}>
                    应用预设
                  </Button>
                </Box>

                {profileDialog.presetId && (
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                    {AXIS_PROFILE_PRESETS.find(item => item.id === profileDialog.presetId)?.description || '应用后会覆盖当前草稿。'}
                  </Typography>
                )}
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

      <Dialog open={confirmClearMappings} onClose={() => setConfirmClearMappings(false)} disableScrollLock>
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
