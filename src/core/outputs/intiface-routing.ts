import type { IntifaceFeatureRoute, MotionAxis, RuntimeMotionFrame } from '../runtime/model.ts';
import { clamp } from './types.ts';

/** Device names retain the existing case-sensitive protocol identity. */
export function featureRouteMatches(route: IntifaceFeatureRoute, deviceName: string, featureIndex: number): boolean {
  return (!route.deviceName || route.deviceName === deviceName) && (route.featureIndex === null || route.featureIndex === undefined || route.featureIndex === featureIndex);
}
export function sameIntifaceCapability(first: string, second: string): boolean {
  return first === second || ['Position', 'HwPositionWithDuration'].includes(first) && ['Position', 'HwPositionWithDuration'].includes(second);
}
export function resolveFeatureRoute(routes: readonly IntifaceFeatureRoute[], deviceName: string, featureIndex: number, outputType: string): IntifaceFeatureRoute | undefined {
  return routes.find(route => featureRouteMatches(route, deviceName, featureIndex) && route.outputType === outputType);
}
export function overridesDefaultFeature(routes: readonly IntifaceFeatureRoute[], deviceName: string, featureIndex: number, outputType: string): boolean {
  return routes.some(route => featureRouteMatches(route, deviceName, featureIndex) && sameIntifaceCapability(route.outputType, outputType));
}
/** Shared default actuator routing; explicit feature mappings take precedence. */
export function defaultIntifaceFeatureRoute(deviceName: string, featureIndex: number, outputType: string, vibrationAxis: MotionAxis = 'V0'): IntifaceFeatureRoute | undefined {
  if (!['Position', 'HwPositionWithDuration', 'Vibrate'].includes(outputType)) return undefined;
  return { deviceName, featureIndex, outputType, sourceAxis: outputType === 'Vibrate' ? vibrationAxis : 'L0', invert: outputType !== 'Vibrate', directionAxis: '', clockwise: true };
}
export function resolveFeatureRouteValue(route: IntifaceFeatureRoute, frame: RuntimeMotionFrame): { active: boolean; value: number; clockwise: boolean } {
  const axis = route.sourceAxis as MotionAxis, direction = route.directionAxis as MotionAxis;
  const active = !frame.activeAxes || frame.activeAxes.includes(axis) || !!direction && frame.activeAxes.includes(direction);
  let value = clamp(frame.values[axis]); if (route.invert) value = 1 - value;
  const clockwise = direction ? clamp(frame.values[direction]) >= .5 : route.clockwise;
  return { active, value, clockwise };
}
