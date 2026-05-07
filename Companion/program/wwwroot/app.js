const {
  Alert,
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
  L1: 0.5,
  L2: 0.5,
  R0: 0.5,
  R1: 0.5,
  R2: 0.5,
  V0: 0,
  V1: 0,
  V2: 0,
  A0: 0.5,
  BpmDrive: 0,
  GateOpen: true,
};

const MANUAL_AXES = [
  { key: 'L0', label: 'L0 主轴', min: 0, max: 1, step: 0.01, description: '主往复轴。0 表示最缩回，1 表示最伸出。' },
  { key: 'L1', label: 'L1 前后', min: 0, max: 1, step: 0.01, description: '前后平移轴；0.5 附近表示居中。' },
  { key: 'L2', label: 'L2 左右', min: 0, max: 1, step: 0.01, description: '左右平移轴；0.5 附近表示居中。' },
  { key: 'R0', label: 'R0 滚转', min: 0, max: 1, step: 0.01, description: '滚转轴，控制左右翻滚；0.5 附近表示居中。' },
  { key: 'R1', label: 'R1 俯仰', min: 0, max: 1, step: 0.01, description: '俯仰轴，控制前后俯仰；0.5 附近表示居中。' },
  { key: 'R2', label: 'R2 扭转', min: 0, max: 1, step: 0.01, description: '扭转轴，控制旋转角度；0.5 附近表示居中。' },
  { key: 'V0', label: 'V0 震动', min: 0, max: 1, step: 0.01, description: '主震动强度。0 为关闭，1 为最大。' },
  { key: 'V1', label: 'V1 震动 2', min: 0, max: 1, step: 0.01, description: '第二路震动强度。0 为关闭，1 为最大。' },
  { key: 'V2', label: 'V2 震动 3', min: 0, max: 1, step: 0.01, description: '第三路震动强度。0 为关闭，1 为最大。' },
  { key: 'A0', label: 'A0 辅助', min: 0, max: 1, step: 0.01, description: '辅助通道（如气泵/润滑等），0.5 附近表示居中。' },
  { key: 'BpmDrive', label: '节奏驱动', min: 0, max: 1, step: 0.01, description: 'BPM 节奏驱动强度，由节奏检测功能自动控制。' },
];

const SIGNAL_ROLE_OPTIONS = [
  { value: 'Depth', label: '主轴行程（L0）' },
  { value: 'Surge', label: '前后位移（L1）' },
  { value: 'Sway', label: '左右位移（L2）' },
  { value: 'AngleX', label: '滚转（R0）' },
  { value: 'AngleY', label: '俯仰（R1）' },
  { value: 'Twist', label: '扭转（R2）' },
  { value: 'Vibrate', label: '主震动（V0）' },
  { value: 'Vibrate2', label: '震动 2（V1）' },
  { value: 'Vibrate3', label: '震动 3（V2）' },
  { value: 'Auxiliary', label: '辅助（A0）' },
  { value: 'Gate', label: '闸门' },
  { value: 'BpmDrive', label: '节奏驱动' },
];

const AXIS_PROFILE_DEFS = [
  { key: 'l0', axis: 'L0', label: '主轴行程', minLabel: '最小', maxLabel: '最大' },
  { key: 'l1', axis: 'L1', label: '前后位移', minLabel: '后', maxLabel: '前' },
  { key: 'l2', axis: 'L2', label: '左右位移', minLabel: '左', maxLabel: '右' },
  { key: 'r0', axis: 'R0', label: '滚转', minLabel: '左', maxLabel: '右' },
  { key: 'r1', axis: 'R1', label: '俯仰', minLabel: '后', maxLabel: '前' },
  { key: 'r2', axis: 'R2', label: '扭转', minLabel: '左旋', maxLabel: '右旋' },
  { key: 'v0', axis: 'V0', label: '主震动', minLabel: '最小', maxLabel: '最大' },
  { key: 'v1', axis: 'V1', label: '震动 2', minLabel: '最小', maxLabel: '最大' },
  { key: 'v2', axis: 'V2', label: '震动 3', minLabel: '最小', maxLabel: '最大' },
  { key: 'a0', axis: 'A0', label: '辅助通道', minLabel: '最小', maxLabel: '最大' },
];

const DEFAULT_AXIS_PROFILE = {
  min: 100,
  max: 900,
  maxSpeed: 1400,
  invert: false,
};

const BUILT_IN_OSC_MAPPING_PRESETS = [
  {
    id: 'osr-inserted-pussy',
    name: 'OSR-VRChat · 被插入（小穴）',
    description: '直接参考 OSR-VRChat 源码：监听 /avatar/parameters/OGB/Orf/Pussy/PenOthers。',
    mappings: [{ oscPath: 'OGB/Orf/Pussy/PenOthers', role: 'Depth', isOgbSocket: true }],
  },
  {
    id: 'osr-inserted-ass',
    name: 'OSR-VRChat · 被插入（后庭）',
    description: '直接参考 OSR-VRChat 源码：监听 /avatar/parameters/OGB/Orf/Ass/PenOthers。',
    mappings: [{ oscPath: 'OGB/Orf/Ass/PenOthers', role: 'Depth', isOgbSocket: true }],
  },
  {
    id: 'osr-inserting-others',
    name: 'OSR-VRChat · 插入他人',
    description: '直接参考 OSR-VRChat 源码：监听 /avatar/parameters/OGB/Pen/*（通配），并按其 inserting_others 逻辑反向映射深度。',
    mappings: [{ oscPath: 'OGB/Pen/*', role: 'Depth', invertDirection: true, isOgbPlug: true }],
  },
  {
    id: 'osr-inserting-self',
    name: 'OSR-VRChat · 自插测试',
    description: '直接参考 OSR-VRChat 源码：监听 /avatar/parameters/OGB/Pen/*（通配），并按其 inserting_self 逻辑反向映射深度。',
    mappings: [{ oscPath: 'OGB/Pen/*', role: 'Depth', invertDirection: true, isOgbPlug: true }],
  },
  {
    id: 'ogb-socket-full',
    name: 'OGB Socket 完整（被插入 · 全部轴）',
    description: '参照 osc.toys / OGB 标准：作为 Orifice/Socket 方，映射全部 SPS 参数轴（深度、姿态、平移、震动）。路径前缀可自行替换为具体孔位（如 Pussy→Ass）。',
    mappings: [
      { oscPath: 'OGB/Orf/Pussy/Main/PenOthers', role: 'Depth', isOgbSocket: true },
      { oscPath: 'OGB/Orf/Pussy/Main/AngleRight_Raw', role: 'AngleX', isOgbSocket: true },
      { oscPath: 'OGB/Orf/Pussy/Main/AngleUp_Raw', role: 'AngleY', isOgbSocket: true },
      { oscPath: 'OGB/Orf/Pussy/Main/Twist_Raw', role: 'Twist', isOgbSocket: true },
      { oscPath: 'OGB/Orf/Pussy/Main/Surge_Raw', role: 'Surge', isOgbSocket: true },
      { oscPath: 'OGB/Orf/Pussy/Main/Sway_Raw', role: 'Sway', isOgbSocket: true },
      { oscPath: 'OGB/Orf/Pussy/Main/Vibrate', role: 'Vibrate', isOgbSocket: true },
    ],
  },
  {
    id: 'ogb-plug-full',
    name: 'OGB Plug 完整（插入方 · 全部轴）',
    description: '参照 osc.toys / OGB 标准：作为 Pen/Plug 方，使用 OGB/Pen/* 通配路径映射全部 SPS 参数轴。深度默认反向（插入越深值越小）。',
    mappings: [
      { oscPath: 'OGB/Pen/*', role: 'Depth', invertDirection: true, isOgbPlug: true },
      { oscPath: 'OGB/Pen/*', role: 'AngleX', invertDirection: true, isOgbPlug: true },
      { oscPath: 'OGB/Pen/*', role: 'AngleY', invertDirection: true, isOgbPlug: true },
      { oscPath: 'OGB/Pen/*', role: 'Twist', invertDirection: true, isOgbPlug: true },
      { oscPath: 'OGB/Pen/*', role: 'Surge', invertDirection: true, isOgbPlug: true },
      { oscPath: 'OGB/Pen/*', role: 'Sway', invertDirection: true, isOgbPlug: true },
      { oscPath: 'OGB/Pen/*', role: 'Vibrate', isOgbPlug: true },
    ],
  },
  {
    id: 'sensa-socket-starter',
    name: 'Sensa / OGB Socket · 深度 + 姿态起点',
    description: '按照 Sensa 生成的 OGB 参数命名，附带单边姿态起始映射。',
    mappings: [
      { oscPath: 'OGB/Orf/Pussy/Main/PenOthers', role: 'Depth', isOgbSocket: true },
      { oscPath: 'OGB/Orf/Pussy/Main/AngleRight_Raw', role: 'AngleX', isOgbSocket: true },
      { oscPath: 'OGB/Orf/Pussy/Main/AngleUp_Raw', role: 'AngleY', isOgbSocket: true },
    ],
  },
];

const BUILT_IN_OSC_PRESET_IDS = new Set(BUILT_IN_OSC_MAPPING_PRESETS.map(preset => preset.id));

function createDefaultMotionProfile(useGlobal = false) {
  return {
    useGlobal,
    l0: { ...DEFAULT_AXIS_PROFILE },
    l1: { ...DEFAULT_AXIS_PROFILE },
    l2: { ...DEFAULT_AXIS_PROFILE },
    r0: { ...DEFAULT_AXIS_PROFILE },
    r1: { ...DEFAULT_AXIS_PROFILE },
    r2: { ...DEFAULT_AXIS_PROFILE },
    v0: { ...DEFAULT_AXIS_PROFILE },
    v1: { ...DEFAULT_AXIS_PROFILE },
    v2: { ...DEFAULT_AXIS_PROFILE },
    a0: { ...DEFAULT_AXIS_PROFILE },
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

function normalizeAxisProfile(axis) {
  const next = {
    ...DEFAULT_AXIS_PROFILE,
    ...(axis || {}),
  };

  const min = Math.max(0, Math.min(999, Number(next.min ?? DEFAULT_AXIS_PROFILE.min)));
  const max = Math.max(min, Math.min(999, Number(next.max ?? DEFAULT_AXIS_PROFILE.max)));

  return {
    min,
    max,
    maxSpeed: Math.max(1, Math.min(9999, Number(next.maxSpeed ?? DEFAULT_AXIS_PROFILE.maxSpeed))),
    invert: Boolean(next.invert),
  };
}

function normalizeMotionProfile(profile, useGlobal = false) {
  const fallback = createDefaultMotionProfile(useGlobal);
  return {
    ...fallback,
    ...(profile || {}),
    useGlobal: profile?.useGlobal ?? useGlobal,
    l0: normalizeAxisProfile(profile?.l0),
    l1: normalizeAxisProfile(profile?.l1),
    l2: normalizeAxisProfile(profile?.l2),
    r0: normalizeAxisProfile(profile?.r0),
    r1: normalizeAxisProfile(profile?.r1),
    r2: normalizeAxisProfile(profile?.r2),
    v0: normalizeAxisProfile(profile?.v0),
    v1: normalizeAxisProfile(profile?.v1),
    v2: normalizeAxisProfile(profile?.v2),
    a0: normalizeAxisProfile(profile?.a0),
  };
}

function normalizeAxisProfileCard(profile, index = 0) {
  return {
    id: (profile?.id || (index === 0 ? 'global-default' : `axis-profile-${index + 1}`)).trim(),
    name: (profile?.name || (index === 0 ? '全局默认' : `轴配置 ${index + 1}`)).trim(),
    isDefault: Boolean(profile?.isDefault),
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
    profile: createDefaultMotionProfile(false),
  };
}

function stripMotionProfile(profile, useGlobal = false) {
  const normalized = normalizeMotionProfile(profile, useGlobal);
  return {
    useGlobal,
    l0: normalized.l0,
    r0: normalized.r0,
    r1: normalized.r1,
    r2: normalized.r2,
    l1: normalized.l1,
    l2: normalized.l2,
  };
}

function createDraftId(prefix = 'draft') {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function makeSignalDraft(signal = {}) {
  return {
    _draftId: createDraftId('signal'),
    oscPath: '',
    invertDirection: false,
    vrchatMin: 0,
    vrchatMax: 1,
    smoothingAlpha: 0.7,
    deadZone: 0.01,
    curve: 'Linear',
    role: 'Depth',
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
  return {
    ...rest,
    oscPath: (rest.oscPath || '').trim(),
    vrchatMin: Number(rest.vrchatMin || 0),
    vrchatMax: Number(rest.vrchatMax || 0),
    smoothingAlpha: Number(rest.smoothingAlpha || 0),
    deadZone: Number(rest.deadZone || 0),
  };
}

function countInvertedAxes(profile) {
  return AXIS_PROFILE_DEFS.filter(axis => profile?.[axis.key]?.invert).length;
}

function describeCommandMode(preferSpeedMode) {
  return preferSpeedMode ? '按速度 (S)' : '按时间 (I)';
}

function describeCommandModeDetail(preferSpeedMode) {
  return preferSpeedMode
    ? '发送形如 L0500S0200 的指令。目标位置不变，但会额外告诉设备“以多快的速度逼近目标”，更适合连续跟随。'
    : '发送形如 L0500I0020 的指令。目标位置不变，但会额外告诉设备“在多少毫秒内到达目标”，更适合固定步进。';
}

function buildAxisProfileBadges(profileCard) {
  const motion = normalizeMotionProfile(profileCard?.motion, false);
  return AXIS_PROFILE_DEFS.flatMap(axis => {
    const current = motion[axis.key];
    const badges = [`${axis.axis} ${current.min}-${current.max}`];
    if (current.invert) badges.push(`${axis.axis} 反向`);
    return badges;
  });
}

function isTCodeOutputType(type) {
  return type === 'TCodeSerial' || type === 'TCodeUdp' || type === 'TCodeTcp';
}

function getOutputTypeLabel(type) {
  return OUTPUT_TYPE_BY_VALUE[type]?.label || '输出设备';
}

function getOutputs(config) {
  return Array.isArray(config?.outputs) ? config.outputs : [];
}

function buildDefaultOutputName(type, config) {
  const index = getOutputs(config).filter(output => output.type === type).length + 1;
  return `${getOutputTypeLabel(type)} ${index}`;
}

function createOutputConfig(type, config) {
  return {
    id: createDraftId('output'),
    name: buildDefaultOutputName(type, config),
    type,
    enabled: false,
    motionProfileId: getDefaultAxisProfileId(config),
    comPort: '',
    host: '127.0.0.1',
    port: type === 'TCodeUdp' ? 9999 : type === 'TCodeTcp' ? 9998 : 12345,
    updatesPerSecond: 50,
    preferSpeedMode: true,
    manageEngineProcess: true,
    websocketAddress: 'ws://localhost:12345',
  };
}

function normalizeOutputConfig(output, config) {
  const fallback = createOutputConfig(output?.type || 'TCodeSerial', config);
  return {
    ...fallback,
    ...(output || {}),
    id: output?.id || fallback.id,
    name: (output?.name || fallback.name).trim(),
    type: output?.type || fallback.type,
    enabled: Boolean(output?.enabled),
    motionProfileId: isTCodeOutputType(output?.type || fallback.type) ? output?.motionProfileId || getDefaultAxisProfileId(config) : getDefaultAxisProfileId(config),
    comPort: output?.comPort || '',
    host: output?.host || fallback.host,
    port: Number(output?.port || fallback.port),
    updatesPerSecond: Number(output?.updatesPerSecond || fallback.updatesPerSecond),
    preferSpeedMode: output?.preferSpeedMode !== false,
    manageEngineProcess: output?.manageEngineProcess !== false,
    websocketAddress: output?.websocketAddress || fallback.websocketAddress,
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
    return `${portLabel} · ${Math.max(10, Number(output.updatesPerSecond || 50))} Hz · ${describeCommandMode(Boolean(output.preferSpeedMode))}`;
  }
  if (output.type === 'TCodeUdp' || output.type === 'TCodeTcp') {
    return `${output.host || '127.0.0.1'}:${output.port || (output.type === 'TCodeUdp' ? 9999 : 9998)}`;
  }
  return output.websocketAddress || 'ws://localhost:12345';
}

function apiRequest(path, options = {}) {
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

function isWildcardOscPath(path) {
  return typeof path === 'string' && path.trim().endsWith('/*');
}

function matchesOscPathPattern(pattern, actualPath) {
  const normalizedPattern = (pattern || '').trim();
  const normalizedActualPath = (actualPath || '').trim();

  if (!normalizedPattern || !normalizedActualPath) return false;

  if (isWildcardOscPath(normalizedPattern)) {
    return normalizedActualPath.startsWith(normalizedPattern.slice(0, -1));
  }

  return normalizedPattern === normalizedActualPath;
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

function normalizeManualCommand(command) {
  const raw = command || {};
  return {
    ...EMPTY_MANUAL,
    L0: raw.L0 ?? EMPTY_MANUAL.L0,
    L1: raw.L1 ?? EMPTY_MANUAL.L1,
    L2: raw.L2 ?? EMPTY_MANUAL.L2,
    R0: raw.R0 ?? EMPTY_MANUAL.R0,
    R1: raw.R1 ?? EMPTY_MANUAL.R1,
    R2: raw.R2 ?? EMPTY_MANUAL.R2,
    V0: raw.Vibrate ?? raw.V0 ?? EMPTY_MANUAL.V0,
    V1: raw.V1 ?? EMPTY_MANUAL.V1,
    V2: raw.V2 ?? EMPTY_MANUAL.V2,
    A0: raw.A0 ?? EMPTY_MANUAL.A0,
    BpmDrive: raw.BpmDrive ?? EMPTY_MANUAL.BpmDrive,
    GateOpen: raw.GateOpen ?? EMPTY_MANUAL.GateOpen,
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
      if (typeof entry === 'string') return entry;
      if (!entry || typeof entry !== 'object') return '';

      const message = entry.message || '';
      if (!message) return '';

      const timestamp = entry.timestamp ? new Date(entry.timestamp) : null;
      const prefix = timestamp && !Number.isNaN(timestamp.getTime()) ? `[${timestamp.toLocaleTimeString()}] ` : '';
      return `${prefix}${message}`;
    })
    .filter(Boolean);
}

function formatRealtimeStatus(state) {
  if (state === 'connected') return '实时连接 在线';
  if (state === 'connecting') return '实时连接 连接中';
  return '实时连接 离线';
}

function buildOutputDialogDraft(outputId, config) {
  const output = getOutputConfig(config, outputId);
  if (!output) return null;

  return normalizeOutputConfig(output, config);
}

function mergeOutputDraft(outputId, config, draft) {
  const next = cloneConfig(config);
  next.schemaVersion = 3;
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
        <Chip size="small" variant="outlined" label={Number(value).toFixed(2)} />
      </Stack>
      <Slider min={axis.min} max={axis.max} step={axis.step} value={value} valueLabelDisplay="auto" onChange={(_, next) => onChange(Number(next))} />
    </Box>
  );
}

function MotionAxisEditor({ axisDefinition, value, disabled, onChange }) {
  return (
    <Box className="motion-axis-card">
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
        <Box>
          <Typography variant="subtitle2">{axisDefinition.axis}</Typography>
          <Typography variant="caption" color="text.secondary">
            {axisDefinition.label}
          </Typography>
        </Box>
        <Chip size="small" variant="outlined" label={`${value.min}-${value.max}`} />
      </Stack>

      <Box className="motion-axis-card__range">
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography variant="caption" color="text.secondary">
            {axisDefinition.minLabel}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {axisDefinition.maxLabel}
          </Typography>
        </Stack>
        <Slider
          disabled={disabled}
          min={0}
          max={999}
          step={1}
          value={[value.min, value.max]}
          valueLabelDisplay="auto"
          onChange={(_, next) => {
            const [min, max] = next;
            onChange({ min: Number(min), max: Number(max) });
          }}
        />
      </Box>

      <Stack direction="row" justifyContent="space-between" alignItems="center" mt={1} mb={0.5}>
        <Typography variant="caption" color="text.secondary">
          速度限制
        </Typography>
        <Chip size="small" variant="outlined" label={`${value.maxSpeed}`} />
      </Stack>

      <Slider disabled={disabled} min={10} max={4000} step={10} value={value.maxSpeed} valueLabelDisplay="auto" onChange={(_, next) => onChange({ maxSpeed: Number(next) })} />

      <FormControlLabel
        sx={{ mt: 0.5 }}
        control={<Switch checked={Boolean(value.invert)} disabled={disabled} onChange={(_, checked) => onChange({ invert: checked })} />}
        label={value.invert ? '已反向' : '方向正常'}
      />
    </Box>
  );
}

function SignalMappingRow({ draft, latestEntry, onChange, onRemove }) {
  return (
    <Box className="signal-row">
      <Box className="signal-row__grid">
        <TextField label="参数路径" size="small" value={draft.oscPath} onChange={event => onChange({ oscPath: event.target.value })} />

        <FormControl size="small" fullWidth>
          <InputLabel>目标轴</InputLabel>
          <Select value={draft.role} label="目标轴" onChange={event => onChange({ role: event.target.value })}>
            {SIGNAL_ROLE_OPTIONS.map(option => (
              <MenuItem key={option.value} value={option.value}>
                {option.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <TextField label="输入最小值" type="number" size="small" value={draft.vrchatMin} onChange={event => onChange({ vrchatMin: Number(event.target.value || 0) })} />
        <TextField label="输入最大值" type="number" size="small" value={draft.vrchatMax} onChange={event => onChange({ vrchatMax: Number(event.target.value || 0) })} />
        <TextField
          label="平滑"
          type="number"
          size="small"
          value={draft.smoothingAlpha}
          inputProps={{ min: 0, max: 1, step: 0.05 }}
          onChange={event => onChange({ smoothingAlpha: Number(event.target.value || 0) })}
        />
      </Box>

      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center" justifyContent="space-between">
        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center">
          {latestEntry ? (
            <>
              <Chip size="small" variant="outlined" label={`最新 ${latestEntry.value}`} />
              {latestEntry.path && latestEntry.path !== draft.oscPath && <Chip size="small" variant="outlined" label={latestEntry.path} />}
              {latestEntry.matchCount > 1 && <Chip size="small" variant="outlined" label={`匹配 ${latestEntry.matchCount} 条`} />}
            </>
          ) : (
            <Chip size="small" variant="outlined" label="暂无实时值" />
          )}
          <Chip size="small" variant="outlined" label={SIGNAL_ROLE_OPTIONS.find(option => option.value === draft.role)?.label || draft.role} />
        </Stack>

        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center">
          <FormControlLabel control={<Switch checked={Boolean(draft.invertDirection)} onChange={(_, checked) => onChange({ invertDirection: checked })} />} label="反向" />
          <Button size="small" color="error" onClick={onRemove}>
            移除
          </Button>
        </Stack>
      </Stack>
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

  const manualTimerRef = useRef(null);
  const manualSyncBlockedRef = useRef(false);
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
        setStudio(previous => sanitizeStudio(previous, configResponse));
        setManualDraft(normalizeManualCommand(overviewResponse?.loop?.manualCommand));
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
    if (!overview?.loop?.manualCommand || manualSyncBlockedRef.current || manualInitializedRef.current === false) return;
    setManualDraft(normalizeManualCommand(overview.loop.manualCommand));
  }, [overview?.loop?.manualCommand]);

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

    function connect() {
      setWsState('connecting');
      socket = new WebSocket(WS_URL);

      socket.onopen = () => setWsState('connected');

      socket.onmessage = event => {
        try {
          const payload = JSON.parse(event.data);
          if (payload?.type !== 'state') return;
          setOverview(payload.data || null);
          setLogs(normalizeLogs(payload.logs));
        } catch {
          // ignore malformed frames
        }
      };

      socket.onerror = () => {
        setWsState('error');
      };

      socket.onclose = () => {
        if (disposed) return;
        setWsState('disconnected');
        retryHandle = window.setTimeout(connect, 1500);
      };
    }

    connect();

    return () => {
      disposed = true;
      window.clearTimeout(retryHandle);
      socket?.close();
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
    setSerialPorts(normalizeSerialPorts(nextPorts));
  }

  async function persistConfig(nextConfig) {
    nextConfig.schemaVersion = 3;
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

  async function saveOscMappings() {
    if (!config) return;

    await withBusy('osc-mappings-save', async () => {
      const nextConfig = cloneConfig(config);
      nextConfig.schemaVersion = 3;
      nextConfig.signals = signalDrafts.map(stripSignalDraft).filter(signal => Boolean(signal.oscPath));

      await persistConfig(nextConfig);
      await refreshOverview();
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
      const updatedProfile = {
        id: profileDialog.profileId,
        name: (profileDialog.name || '轴配置').trim() || '轴配置',
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
      notify(`${updatedProfile.name} 已保存`, 'success');
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
    return {
      L0: draft.L0,
      L1: draft.L1,
      L2: draft.L2,
      R0: draft.R0,
      R1: draft.R1,
      R2: draft.R2,
      Vibrate: draft.V0,
      V1: draft.V1,
      V2: draft.V2,
      A0: draft.A0,
      BpmDrive: draft.BpmDrive,
      GateOpen: draft.GateOpen,
    };
  }

  function handleManualSliderChange(patch) {
    const nextDraft = { ...manualDraft, ...patch };
    setManualDraft(nextDraft);
    if (!manualContinuous) return;

    manualSyncBlockedRef.current = true;
    apiRequest('/api/input/manual', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        enabled: true,
        ...manualDraftToPayload(nextDraft),
      }),
    })
      .catch(error => notify(error.message || '手动输入更新失败', 'error'))
      .finally(() => {
        manualSyncBlockedRef.current = false;
      });
  }

  async function applyManualOnce() {
    window.clearTimeout(manualTimerRef.current);

    try {
      await apiRequest('/api/input/manual', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: true,
          ...manualDraftToPayload(manualDraft),
        }),
      });
      notify('位置已更新', 'success');
    } catch (error) {
      notify(error.message || '更新位置失败', 'error');
    } finally {
      manualSyncBlockedRef.current = false;
    }
  }

  async function disableManualInput() {
    window.clearTimeout(manualTimerRef.current);

    await withBusy('manual-disable', async () => {
      await apiRequest('/api/input/manual', { method: 'DELETE' });
      await refreshOverview();
      notify('手动输入已停用', 'success');
      manualSyncBlockedRef.current = false;
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
      if (type === 'TCodeSerial') {
        refreshSerialPorts().catch(() => null);
      }

      const nextOutput = createOutputConfig(type, config);
      const nextConfig = cloneConfig(config);
      nextConfig.outputs = [...getOutputs(config), nextOutput];

      const saved = await persistConfig(nextConfig);
      setStudio(previous => sanitizeStudio(previous, saved));
      setDialog({ outputId: nextOutput.id, draft: buildOutputDialogDraft(nextOutput.id, saved) });
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

    if (output.type === 'TCodeSerial') {
      refreshSerialPorts().catch(() => null);
    }
    setDialog({ outputId: type, draft: buildOutputDialogDraft(type, config) });
  }

  async function saveOutputDialog() {
    if (!dialog || !config || !studio) return;

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
                  <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                    <Chip size="small" variant="outlined" color="primary" label={`当前生效：${formatMode(actualInputMode)}`} />
                    {hasPendingInputMode && <Chip size="small" variant="filled" color="warning" label={`待应用：${formatMode(selectedInputTab)}`} />}
                  </Stack>

                  <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                    {hasPendingInputMode && (
                      <Button size="small" variant="text" onClick={() => selectInputTab(actualInputMode)}>
                        恢复到当前输入
                      </Button>
                    )}
                    <Button size="small" variant="contained" onClick={() => applyInputMode(selectedInputTab)} disabled={!hasPendingInputMode || busyKey === `mode-${selectedInputTab}`}>
                      {busyKey === `mode-${selectedInputTab}` ? '切换中…' : '应用输入方式'}
                    </Button>
                  </Stack>
                </Stack>

                <Typography variant="body2" color="text.secondary">
                  切换页签只会切换配置视图；点击“应用输入方式”后，才会真正修改当前生效输入。
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
                      <Chip size="small" variant="outlined" label={`${signalDrafts.length} 条`} />
                    </Box>

                    <Stack className="osc-preset-toolbar" direction="row" spacing={2} useFlexGap flexWrap="wrap" alignItems="center" sx={{ py: 1 }}>
                      <FormControl size="small" sx={{ minWidth: 280 }}>
                        <InputLabel>预设方案</InputLabel>
                        <Select value={selectedOscPreset} label="预设方案" onChange={event => setSelectedOscPreset(event.target.value)}>
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

                    {selectedOscPresetConfig ? (
                      <Alert severity={selectedOscPresetConfig.isBuiltIn ? 'info' : 'success'}>{selectedOscPresetConfig.description || '选择一套映射预设后即可快速生成对应信号。'}</Alert>
                    ) : (
                      <Alert severity="warning">当前没有可用预设，你可以先新增一套自己的映射方案。</Alert>
                    )}

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
                      <Button variant="contained" onClick={saveOscMappings} disabled={busyKey === 'osc-mappings-save'}>
                        保存映射
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
                    <FormControlLabel
                      control={
                        <Switch
                          checked={manualContinuous}
                          onChange={(_, checked) => {
                            setManualContinuous(checked);
                            if (!checked) {
                              window.clearTimeout(manualTimerRef.current);
                              manualSyncBlockedRef.current = false;
                            }
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

                  return (
                    <Card key={profile.id} className="config-card" variant="outlined">
                      <CardHeader
                        title={profile.name}
                        subheader={profile.isDefault ? '全局默认轴配置' : usedCount > 0 ? `已分配给 ${usedCount} 个输出` : '尚未分配输出'}
                        action={profile.isDefault ? <Chip size="small" color="primary" variant="outlined" label="默认" /> : null}
                      />
                      <CardContent>
                        <Stack spacing={2}>
                          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" className="config-summary">
                            {buildAxisProfileBadges(profile).map(item => (
                              <Chip key={`${profile.id}-${item}`} size="small" variant="outlined" label={item} />
                            ))}
                          </Stack>

                          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                            <Button variant="contained" onClick={() => openProfileDialog(profile.id)}>
                              配置
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
                        新建一张可复用的轴约束卡，然后分配给任意多个 TCode 输出实例。
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
              <Box className="log-list">
                {logs.length === 0 ? (
                  <Typography color="text.secondary">暂时没有日志。</Typography>
                ) : (
                  logs.map((line, index) => (
                    <Typography key={`${index}-${line}`} variant="body2" className="log-line">
                      {line}
                    </Typography>
                  ))
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

      <Dialog open={Boolean(dialog)} onClose={() => setDialog(null)} fullWidth maxWidth="md">
        <DialogTitle>{dialog ? `${getOutputTypeLabel(dialog.draft.type)} 配置` : '输出配置'}</DialogTitle>
        <DialogContent dividers>
          {dialog && (
            <Stack spacing={2}>
              <TextField
                label="名称"
                size="small"
                value={dialog.draft.name || ''}
                onChange={event => setDialog(previous => ({ ...previous, draft: { ...previous.draft, name: event.target.value } }))}
              />

              {isTCodeOutputType(dialog.draft.type) && (
                <FormControl size="small" fullWidth>
                  <InputLabel>轴配置</InputLabel>
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

                    <FormControl size="small" fullWidth>
                      <InputLabel>串口</InputLabel>
                      <Select value={dialog.draft.comPort || ''} label="串口" onChange={event => setDialog(previous => ({ ...previous, draft: { ...previous.draft, comPort: event.target.value } }))}>
                        {serialPorts.length === 0 && <MenuItem value="">未检测到串口</MenuItem>}
                        {serialPorts.map(port => (
                          <MenuItem key={port.portName} value={port.portName}>
                            <Stack direction="row" spacing={1} alignItems="baseline">
                              <Typography variant="body2">{port.portName}</Typography>
                              {port.description && port.description !== port.portName && (
                                <Typography variant="caption" color="text.secondary">
                                  {port.description}
                                </Typography>
                              )}
                            </Stack>
                          </MenuItem>
                        ))}
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
                        label="实时发送频率 (Hz)"
                        type="number"
                        size="small"
                        value={dialog.draft.updatesPerSecond ?? 50}
                        onChange={event => setDialog(previous => ({ ...previous, draft: { ...previous.draft, updatesPerSecond: Number(event.target.value || 0) } }))}
                      />

                      <FormControl size="small" fullWidth>
                        <InputLabel>斜率方式</InputLabel>
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

                    <Alert severity="info">{describeCommandModeDetail(Boolean(dialog.draft.preferSpeedMode))}</Alert>
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
                        label="Host"
                        size="small"
                        value={dialog.draft.host || ''}
                        onChange={event => setDialog(previous => ({ ...previous, draft: { ...previous.draft, host: event.target.value } }))}
                      />
                      <TextField
                        label="Port"
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
                        label="WebSocket 地址"
                        size="small"
                        value={dialog.draft.websocketAddress || ''}
                        onChange={event => setDialog(previous => ({ ...previous, draft: { ...previous.draft, websocketAddress: event.target.value } }))}
                      />
                      <TextField
                        label="端口"
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
                      label="由后台托管 intiface-engine.exe"
                    />
                  </Box>
                </>
              )}
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialog(null)}>取消</Button>
          <Button variant="contained" onClick={saveOutputDialog} disabled={!dialog || busyKey.startsWith('dialog-save-')}>
            保存
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(profileDialog)} onClose={() => setProfileDialog(null)} fullWidth maxWidth="lg">
        <DialogTitle>{profileDialog ? `${profileDialog.name || '轴配置'} · 轴配置` : '轴配置'}</DialogTitle>
        <DialogContent dividers>
          {profileDialog && (
            <Stack spacing={2}>
              <TextField label="配置名称" size="small" value={profileDialog.name || ''} onChange={event => setProfileDialog(previous => ({ ...previous, name: event.target.value }))} />

              {profileDialog.isDefault && <Alert severity="info">这是当前默认轴配置。删除会被禁止，但你仍然可以修改各轴约束。</Alert>}

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

      <Snackbar open={snackbar.open} autoHideDuration={2600} onClose={() => setSnackbar(previous => ({ ...previous, open: false }))}>
        <Alert variant="filled" severity={snackbar.severity}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </ThemeProvider>
  );
}

ReactDOM.createRoot(document.getElementById('app-root')).render(<App />);
