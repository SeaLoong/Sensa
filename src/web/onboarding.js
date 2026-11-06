import { t } from './i18n.js';

export const ONBOARDING_STEPS = ['goal', 'device', 'input', 'ready'];
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

export function guideInputPrepared(goal, { mode, scriptLoaded = false, listening = false, mappingCount = 0, protocolInputs = [] } = {}) {
  if (mode !== goal) return false;
  if (goal === 'manual') return true;
  if (goal === 'script') return scriptLoaded;
  if (goal === 'osc') return listening && mappingCount > 0;
  if (goal === 'protocol') return protocolInputs.some(input => input.enabled && input.listening && input.connected);
  return false;
}
