import { t } from './i18n.js';
import { PROTOCOL_AXES } from './protocol-inputs.js';

export const INTIFACE_OUTPUT_TYPES = Object.freeze(['Vibrate', 'Oscillate', 'Rotate', 'Position', 'HwPositionWithDuration', 'Led', 'Temperature', 'Constrict', 'Spray']);
export function makeIntifaceFeatureRoute(route = {}) {
  return { deviceName: '', featureIndex: null, outputType: 'Rotate', sourceAxis: 'V0', directionAxis: '', clockwise: true, invert: false, ...route };
}
export function stripIntifaceFeatureRoutes(routes = []) {
  return routes.map(route => ({ deviceName: String(route.deviceName || '').trim(),
    featureIndex: route.featureIndex === '' || route.featureIndex == null ? null : Number(route.featureIndex),
    outputType: route.outputType || 'Rotate', sourceAxis: route.sourceAxis || 'V0', directionAxis: String(route.directionAxis || '').trim(),
    clockwise: route.clockwise !== false, invert: route.invert === true }));
}
export function intifaceFeatureErrors(routes = []) {
  const errors = [];
  if (!Array.isArray(routes)) return [t('请填写有效的 Intiface 执行器映射。')];
  if (routes.length > 32) errors.push(t('最多配置 32 条 Intiface 执行器映射。'));
  const normalized = stripIntifaceFeatureRoutes(routes);
  for (const [index, route] of normalized.entries()) {
    if (!INTIFACE_OUTPUT_TYPES.includes(route.outputType) || !PROTOCOL_AXES.includes(route.sourceAxis)
      || route.directionAxis && (!PROTOCOL_AXES.includes(route.directionAxis) || route.outputType !== 'Rotate'))
      errors.push(t('请检查执行器类型、来源轴和旋转方向轴。'));
    if (route.featureIndex !== null && (!Number.isInteger(route.featureIndex) || route.featureIndex < 0 || route.featureIndex > 4294967295))
      errors.push(t('特征索引须为空或 0–4294967295 的整数。'));
    if (route.deviceName.length > 256 || /[\u0000-\u001f\u007f]/.test(route.deviceName)) errors.push(t('设备名称须为不超过 256 个字符的单行文字。'));
    const position = type => ['Position', 'HwPositionWithDuration'].includes(type);
    if (normalized.slice(0, index).some(previous => (previous.outputType === route.outputType || position(previous.outputType) && position(route.outputType))
      && (!previous.deviceName || !route.deviceName || previous.deviceName === route.deviceName)
      && (previous.featureIndex === null || route.featureIndex === null || previous.featureIndex === route.featureIndex)))
      errors.push(t('执行器映射重叠；请选择不同设备、特征或控制能力。'));
  }
  return [...new Set(errors)];
}

// Mirror runtime feature selection: an explicit mapping overrides only its
// matching capability; unrelated position/vibration features retain defaults.
export function intifaceDeviceRoutable(device, routes = []) {
  const mappings = Array.isArray(routes) ? routes : [];
  const nameMatches = route => !route.deviceName || route.deviceName === device.name;
  const position = type => type === 'Position' || type === 'HwPositionWithDuration';
  if (!Array.isArray(device.features) || device.features.length === 0)
    return device.positionFeatures > 0 || device.vibrateFeatures > 0;
  return device.features.some(feature => {
    const types = Array.isArray(feature.outputTypes) ? feature.outputTypes : [];
    const matching = mappings.filter(route => nameMatches(route)
      && (route.featureIndex == null || route.featureIndex === feature.index));
    if (matching.some(route => INTIFACE_OUTPUT_TYPES.includes(route.outputType) && types.includes(route.outputType))) return true;
    const defaultPosition = types.some(position) && !matching.some(route => position(route.outputType));
    const defaultVibration = types.includes('Vibrate') && !matching.some(route => route.outputType === 'Vibrate');
    return defaultPosition || defaultVibration;
  });
}
