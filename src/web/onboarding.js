import { t } from './i18n.js';

export const ONBOARDING_STEPS = ['goal', 'input', 'mapping', 'axes', 'device', 'diagnostics', 'ready'];
const GOALS = ['osc', 'script', 'manual', 'protocol'];
const STATUSES = ['new', 'active', 'dismissed', 'complete'];

export function onboardingScenes(platform = {}) {
  const supports = mode => !platform.inputModes || platform.inputModes.includes(mode);
  return [
    ...(platform.supportsListeners !== false && supports('osc') ? [{ id: 'osc', title: t('VRChat / SPS 联动'), description: t('接收 Avatar 参数，用预设映射到设备动作。'), destination: 'osc' }] : []),
    ...(supports('script') ? [{ id: 'script', title: t('播放 funscript'), description: t('载入动作脚本，选择设备并控制播放。'), destination: 'script' }] : []),
    ...(supports('manual') ? [{ id: 'manual', title: t('手动控制设备'), description: t('从 L0 主轴开始，按设备能力选择更多动作轴。'), destination: 'manual' }] : []),
    ...(platform.supportsListeners !== false && supports('protocol') ? [{ id: 'protocol', title: t('网站与软件联动'), description: t('把网站或软件的设备控制转发到实际输出。'), destination: 'protocol-settings' }] : []),
  ];
}

export function sanitizeOnboarding(raw) {
  return { status: STATUSES.includes(raw?.status) ? raw.status : 'new',
    goal: GOALS.includes(raw?.goal) ? raw.goal : null,
    step: ONBOARDING_STEPS.includes(raw?.step) ? raw.step : 'goal' };
}

export function onboardingStorageKey(kind = 'remote', pathname = '/') {
  // Origin isolates service instances; path separates hosted browser workbenches.
  // Query strings and pairing tokens never enter a preference key.
  return `sensa.onboarding.v1:${kind === 'local' ? 'local' : 'remote'}:${String(pathname).split(/[?#]/)[0] || '/'}`;
}

export function loadOnboarding(kind, pathname, storage) {
  try { return sanitizeOnboarding(JSON.parse((storage || globalThis.localStorage).getItem(onboardingStorageKey(kind, pathname)) || 'null')); }
  catch { return sanitizeOnboarding(null); }
}

export function saveOnboarding(state, kind, pathname, storage) {
  try { (storage || globalThis.localStorage).setItem(onboardingStorageKey(kind, pathname), JSON.stringify(sanitizeOnboarding(state))); return true; }
  catch { return false; }
}

export function onboardingReducer(state, action) {
  const current = sanitizeOnboarding(state);
  if (action.type === 'start') return { ...current, status: 'active', step: current.status === 'complete' ? 'goal' : current.step };
  if (action.type === 'dismiss') return { ...current, status: 'dismissed' };
  if (action.type === 'complete') return { ...current, status: 'complete', step: 'ready' };
  if (action.type === 'goal' && GOALS.includes(action.goal)) return { ...current, goal: action.goal, step: current.goal === action.goal ? current.step : 'goal' };
  if (action.type === 'step' && ONBOARDING_STEPS.includes(action.step)) return { ...current, step: action.step };
  return current;
}

export function guideInputPrepared(goal, { mode, scriptLoaded = false, listening = false, protocolInputs = [] } = {}) {
  if (mode !== goal) return false;
  if (goal === 'manual') return true;
  if (goal === 'script') return scriptLoaded;
  if (goal === 'osc') return listening;
  if (goal === 'protocol') return protocolInputs.some(input => input.enabled && input.listening && input.connected);
  return false;
}

export function onboardingInstructions(step, goal) {
  const instructions = {
    manual: [
      t("先在“输入”页选择手动，检查 L0 主轴的目标值。"),
      t("振动或旋转设备可展开“更多动作轴”，选择对应通道；先使用较小的目标值。"),
      t("确认当前输入方式为手动；准备期间保持顶部“输入启用”关闭。"),
    ],
    script: [
      t("在“输入 → 脚本”载入 funscript，确认文件已显示在播放器中。"),
      t("检查脚本的目标轴、时间线和播放位置，确认与设备通道对应。"),
      t("点击“应用输入方式”切换到脚本；播放与输入启用分别控制。"),
    ],
    osc: [
      t("在“输入 → OSC”检查监听地址和端口，让发送端将参数发到这里。"),
      t("启用并保存 OSC 接收设置，确认“监听中”，再查看接收到的参数和来源。"),
      t("点击“应用输入方式”选择 OSC，再到下一步把收到的参数映射到目标轴。"),
    ],
    protocol: [
      t("在“输入 → 协议”添加协议来源，填写监听地址、端口和设备能力。"),
      t("保存来源后，让网站或软件连接这个地址，确认来源已监听且客户端已连接。"),
      t("应用协议输入方式；连接成功不会自动启用输入。"),
    ],
    oscMapping: [
      t("点击“新增映射”，在“参数路径”选择收到的 OSC 参数，例如 Depth。"),
      t("保留默认目标轴 L0 即可直接映射。读数抖动时，在这条映射的“追加计算步骤”选择平滑，或先加 5% 死区再平滑。"),
      t("展开步骤可调整输入、运算和数值。核对目标轴与量程，点击“保存更改”，再继续到轴配置。"),
    ],
    mapping: [
      t("手动、脚本和协议输入可以直接提供动作轴。已有所需轴时，点击“下一步”继续。"),
      t("需要组合多个来源时，在映射内追加计算步骤，选择加权平均并填写各项输入和权重。"),
      t("在轴映射行选择目标轴，检查范围和方向，然后保存更改。"),
    ],
    axes: [
      t("TCode 设备需要轴配置；其他输出可以跳过这一步。"),
      t("只用主轴时，展开“设备动作预设”选择“仅 L0 主轴”。需要其他轴时可换模板或新增轴配置。"),
      t("检查启用的轴、行程、方向与速度后保存；随后在 TCode 输出中选择这套轴配置。"),
    ],
    device: [
      t("在“输出”点击添加设备，选择设备实际使用的连接方式。"),
      t("填写地址或选择串口等连接参数；TCode 输出还需要选择已保存的轴配置。"),
      t("保存后按设备要求连接或扫描，检查状态是否可用；连接设备不会开启输入。"),
    ],
    diagnostics: [
      t("诊断页默认展开日志，可直接查看最近的连接、输入和输出消息。"),
      t("先查看警告或错误，再按分类、关键词或轴筛选，结合发生时间定位问题。"),
      t("日志为空时先检查筛选条件；有连接错误时返回“输出”修正设置，再重新连接。"),
    ],
  };
  return instructions[step === 'input' ? goal : step === 'mapping' && goal === 'osc' ? 'oscMapping' : step] || [];
}
