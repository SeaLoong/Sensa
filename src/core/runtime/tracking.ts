/** Public Unity/OSC geometry and tracking. No host, device or browser dependency. */
import { oscNumber, matchesOscPath, type OscEntry, type OscSnapshotEntry } from '../protocols/osc.ts';
import type { PointMetric, PoseMetric } from './model.ts';

export interface PosePoint { x: number; y: number; z: number }
export interface MarkerFit { valid: boolean; position: PosePoint; radius: number; residual: number; reason: string }
const point = (x = 0, y = 0, z = 0): PosePoint => ({ x, y, z });
export const addPoint = (a: PosePoint, b: PosePoint): PosePoint => point(a.x + b.x, a.y + b.y, a.z + b.z);
export const subtractPoint = (a: PosePoint, b: PosePoint): PosePoint => point(a.x - b.x, a.y - b.y, a.z - b.z);
export const scalePoint = (a: PosePoint, n: number): PosePoint => point(a.x * n, a.y * n, a.z * n);
export const dotPoint = (a: PosePoint, b: PosePoint): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const crossPoint = (a: PosePoint, b: PosePoint): PosePoint => point(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
export const pointLength = (a: PosePoint): number => Math.hypot(a.x, a.y, a.z);
const clamp = (n: number, min: number, max: number): number => Math.max(min, Math.min(max, n));
const span = Math.fround(.35), markerRadius = Math.fround(.001), receiverRadius = 2;
export const poseProtocol = Object.freeze({ prefix: 'Sensa/Pose/v1', pointPrefix: 'Sensa/Point/v1', handlePrefix: 'Sensa/Handle/v1',
  anchorHalfSpan: span, receiverRadius, markerRadius, minimumProximity: Math.fround(.00001), maximumProximity: Math.fround(.99999),
  positionRadius: Math.fround(Math.fround(Math.fround(receiverRadius * Math.fround(1 - Math.fround(.00001))) + markerRadius)
    - Math.fround(Math.fround(1.7320508) * span) - Math.fround(.001)),
  apertureRadius: Math.fround(.04), maximumTiltDegrees: 65, maximumFitResidual: Math.fround(.002), maximumSampleAgeMs: 1000 });
export const fixedAnchorProtocol = Object.freeze({ prefix: 'Sensa/SPS', coordinateFrame: 'AvatarRootLocal',
  anchorHalfSpan: span, receiverRadius, markerRadius, center: Object.freeze(point(0, 1, 0)),
  positionHalfRange: 2, maximumFitResidual: Math.fround(.01), minimumProximity: Math.fround(.001), maximumProximity: Math.fround(.999),
  maximumSampleAgeMs: 1250, sampleSteps: 32, maximumWorldContactRadius: 3 });
export const poseAnchors: readonly PosePoint[] = Array.from({ length: 8 }, (_, i) => point(i & 1 ? span : -span, i & 2 ? span : -span, i & 4 ? span : -span));
export const pointAnchorIndices: readonly number[] = [0, 3, 5, 6];
export const fixedAnchors: readonly PosePoint[] = [0, 5, 3, 6].map(bits => addPoint(fixedAnchorProtocol.center, point(bits & 1 ? span : -span, bits & 2 ? span : -span, bits & 4 ? span : -span)));
export function isSampleActive(value: number): boolean { return Number.isFinite(value) && value > 0 && value <= 1 && Number.isInteger(value * 32); }
const invalidFit = (reason: string, radius = 0): MarkerFit => ({ valid: false, position: point(), radius, residual: 0, reason });
const validRanges = (values: readonly number[], minimum: number, maximum: number): boolean => values.every(value => Number.isFinite(value) && value > minimum && value < maximum);

export function fitLocalTetrahedron(proximity: readonly number[]): MarkerFit {
  if (proximity.length !== 4) return invalidFit('四面体采样不完整');
  if (!validRanges(proximity, poseProtocol.minimumProximity, poseProtocol.maximumProximity)) return invalidFit('本地点离开采样体积或接收器饱和');
  const distances = proximity.map(value => receiverRadius * (1 - value) + markerRadius);
  let position = point();
  for (const [i, distance] of distances.entries()) {
    const anchor = poseAnchors[pointAnchorIndices[i] ?? -1];
    if (!anchor) throw new Error('Invalid internal point anchor.');
    position = addPoint(position, scalePoint(anchor, -distance * distance));
  }
  position = scalePoint(position, 1 / (8 * span * span));
  const residual = Math.sqrt(distances.reduce((sum, distance, i) => {
    const anchor = poseAnchors[pointAnchorIndices[i] ?? -1];
    return sum + (anchor ? (pointLength(subtractPoint(position, anchor)) - distance) ** 2 : Infinity);
  }, 0) / 4);
  const valid = residual <= poseProtocol.maximumFitResidual && pointLength(position) <= poseProtocol.positionRadius;
  return { valid, position, radius: markerRadius, residual, reason: valid ? '' : '四面体拟合不一致或超出范围；检查尺寸、缩放和同标签干扰' };
}

export function fitMarker(proximity: readonly number[]): MarkerFit {
  if (proximity.length !== 8) return invalidFit('采样不完整');
  if (!validRanges(proximity, poseProtocol.minimumProximity, poseProtocol.maximumProximity)) return invalidFit('标记离开采样体积或接收器饱和');
  const surface = proximity.map(value => receiverRadius * (1 - value));
  const at = (radius: number): { position: PosePoint; error: number } => {
    let position = point();
    for (const [i, anchor] of poseAnchors.entries()) position = addPoint(position, scalePoint(anchor, -(((surface[i] ?? NaN) + radius) ** 2)));
    position = scalePoint(position, 1 / (16 * span * span));
    const error = Math.sqrt(poseAnchors.reduce((sum, anchor, i) => sum + (pointLength(subtractPoint(position, anchor)) - (surface[i] ?? NaN) - radius) ** 2, 0) / 8);
    return { position, error };
  };
  const step = .00025; let bestRadius = 0, best = at(0);
  for (let i = 1; i <= 80; i++) { const fit = at(i * step); if (fit.error < best.error) { best = fit; bestRadius = i * step; } }
  let low = Math.max(0, bestRadius - step), high = Math.min(.02, bestRadius + step);
  for (let i = 0; i < 24; i++) {
    const left = low + (high - low) / 3, right = high - (high - low) / 3;
    if (at(left).error < at(right).error) high = right; else low = left;
  }
  bestRadius = (low + high) / 2; best = at(bestRadius);
  const valid = best.error <= poseProtocol.maximumFitResidual && pointLength(best.position) <= poseProtocol.positionRadius;
  return { valid, position: best.position, radius: bestRadius, residual: best.error, reason: valid ? '' : '几何拟合不一致或超出有效体积；检查混入的发送器与缩放' };
}

export function fitFixedAnchors(proximity: readonly number[]): MarkerFit {
  if (proximity.length !== 4) return invalidFit('需要四个固定锚点 / Four fixed anchors are required', markerRadius);
  if (!validRanges(proximity, fixedAnchorProtocol.minimumProximity, fixedAnchorProtocol.maximumProximity)) return invalidFit('根点超出共同覆盖区域或采样饱和 / Root is outside common coverage or a sample is saturated', markerRadius);
  const distances = proximity.map(value => receiverRadius * (1 - value) + markerRadius);
  let offset = point();
  for (const [i, anchor] of fixedAnchors.entries()) offset = addPoint(offset, scalePoint(subtractPoint(anchor, fixedAnchorProtocol.center), -((distances[i] ?? NaN) ** 2)));
  offset = scalePoint(offset, 1 / (8 * span * span));
  const position = addPoint(fixedAnchorProtocol.center, offset);
  const residual = Math.sqrt(fixedAnchors.reduce((sum, anchor, i) => sum + (pointLength(subtractPoint(position, anchor)) - (distances[i] ?? NaN)) ** 2, 0) / 4);
  const valid = Math.abs(offset.x) <= 2 && Math.abs(offset.y) <= 2 && Math.abs(offset.z) <= 2 && residual <= fixedAnchorProtocol.maximumFitResidual;
  return { valid, position, radius: markerRadius, residual, reason: valid ? '' : '固定锚点拟合不一致；检查目标、缩放和丢包 / Fixed-anchor fit is inconsistent; check target, scaling and packet loss' };
}

export type TrackingKind = 'Point' | 'Handle' | 'SpsRoot' | 'ShaderRoot' | 'ContactRoot';
export interface TrackingObservation {
  key: string; prefix: string; instance: string; party: string; sourceKey: string; sourceLabel: string;
  timestampMs: number; kind: TrackingKind; coordinateFrame: string; coordinateUnit: string; valid: boolean; reason: string;
  sampleCount: number; expectedSampleCount: number; isMappablePoint: boolean; isLocalPoint: boolean;
  experimental: boolean; position: PosePoint; radius: number; residual: number; displayHalfRange: number; displayCenter: PosePoint;
  supportedMetrics: PointMetric[]; measurementPaths: string[]; metrics: Partial<Record<PointMetric, number>>; supportsVelocity: boolean;
  velocity: PosePoint | null; speed: number | null; proximitySpeed: number | null;
  right: PosePoint | null; forward: PosePoint | null; avatarScale: number | null;
}
interface EntryGroup { sourceKey: string; prefix: string; parts: string[]; rows: { parts: string[]; entry: OscEntry }[] }
function groups(entries: readonly OscSnapshotEntry[], sourceKey: string | null | undefined, accept: (parts: string[]) => boolean, prefixParts: number): EntryGroup[] {
  const result = new Map<string, EntryGroup>();
  for (const { path, entry } of entries) {
    if (sourceKey && entry.source.key !== sourceKey) continue;
    const parts = path.split('/'); if (!accept(parts)) continue;
    const prefix = parts.slice(0, prefixParts).join('/'), key = entry.source.key + '|' + prefix;
    let group = result.get(key);
    if (!group) { group = { sourceKey: entry.source.key, prefix, parts, rows: [] }; result.set(key, group); }
    group.rows.push({ parts, entry });
  }
  return [...result.values()].sort((a, b) => a.sourceKey < b.sourceKey ? -1 : a.sourceKey > b.sourceKey ? 1 : a.prefix < b.prefix ? -1 : a.prefix > b.prefix ? 1 : 0).slice(0, 64);
}
function observation(group: EntryGroup, kind: TrackingKind, instance: string, party = 'Self'): TrackingObservation {
  const root = kind === 'SpsRoot' || kind === 'ShaderRoot', local = kind === 'Point' || kind === 'Handle';
  return { key: group.sourceKey + '|' + group.prefix, prefix: group.prefix, sourceKey: group.sourceKey,
    sourceLabel: group.rows[0]?.entry.source.label ?? group.sourceKey, instance, party, timestampMs: 0, kind,
    coordinateFrame: kind === 'ContactRoot' ? 'AvatarRootMeters' : root ? 'AvatarRootLocal' : 'ReferenceLocal',
    coordinateUnit: kind === 'ContactRoot' ? 'm' : 'local', valid: false, reason: '', sampleCount: 0,
    expectedSampleCount: kind === 'ShaderRoot' || kind === 'ContactRoot' ? 3 : 4,
    isMappablePoint: party === 'Self', isLocalPoint: local, experimental: true, position: point(), radius: 0, residual: 0,
    displayHalfRange: root ? 2 : poseProtocol.positionRadius, displayCenter: root ? { ...fixedAnchorProtocol.center } : point(),
    supportedMetrics: ['X', 'Y', 'Z', 'Distance'], measurementPaths: [], metrics: {}, supportsVelocity: false,
    velocity: null, speed: null, proximitySpeed: null, right: null, forward: null, avatarScale: null };
}
function finalize(row: TrackingObservation): TrackingObservation {
  row.metrics = { X: row.position.x, Y: row.position.y, Z: row.position.z, Distance: pointLength(row.position) };
  if (row.velocity && row.speed !== null && row.proximitySpeed !== null) {
    Object.assign(row.metrics, { VelocityX: row.velocity.x, VelocityY: row.velocity.y, VelocityZ: row.velocity.z, Speed: row.speed, ProximitySpeed: row.proximitySpeed }); row.supportsVelocity = true;
  }
  if (row.right) Object.assign(row.metrics, { RightX: row.right.x, RightY: row.right.y, RightZ: row.right.z });
  if (row.forward) Object.assign(row.metrics, { ForwardX: row.forward.x, ForwardY: row.forward.y, ForwardZ: row.forward.z });
  if (row.avatarScale !== null) row.metrics.AvatarScale = row.avatarScale;
  row.supportedMetrics = Object.keys(row.metrics) as PointMetric[];
  return row;
}
export function getMetric(row: TrackingObservation, metric: PointMetric): number | undefined { return row.metrics[metric]; }
export const trackingMatches = (row: TrackingObservation, pattern: string): boolean => row.measurementPaths.some(path => matchesOscPath(pattern, path));
function fields(group: EntryGroup): Map<string, OscEntry> { return new Map(group.rows.map(row => [row.parts.at(-1) ?? '', row.entry])); }
function fieldValue(map: ReadonlyMap<string, OscEntry>, key: string): number { const entry = map.get(key); return entry ? oscNumber(entry.value) : NaN; }
const fresh = (timestamp: number, now: number, limit: number): boolean => timestamp <= now && now - timestamp <= limit;
const validAxis = (axis: PosePoint): boolean => [axis.x, axis.y, axis.z].every(n => Number.isFinite(n) && Math.abs(n) <= 8) && pointLength(axis) > 1e-6;
const contactPosition = ['Proximity_SenderLocalPositionX', 'Proximity_SenderLocalPositionY', 'Proximity_SenderLocalPositionZ'];
const contactVelocity = ['Proximity_SenderVelocityX', 'Proximity_SenderVelocityY', 'Proximity_SenderVelocityZ'];
export const contactLeaves = ['Proximity', 'Proximity_SenderType', ...contactPosition, ...contactVelocity, 'Proximity_SenderVelocityMagnitude', 'Proximity_ProximitySpeed', 'Sample', 'Radius'];
export const shaderFields = ['Frame', 'X', 'Y', 'Z', 'RightX', 'RightY', 'RightZ', 'ForwardX', 'ForwardY', 'ForwardZ', 'AvatarScale', 'Valid'];

export function observeTracking(entries: readonly OscSnapshotEntry[], sourceKey?: string | null, now = Date.now(), maxAge = 0): TrackingObservation[] {
  const local = groups(entries, sourceKey, parts => parts.length === 7 && parts[0] === 'Sensa'
    && (parts[1] === 'Point' || parts[1] === 'Handle') && parts[2] === 'v1' && (parts[4] === 'Self' || parts[4] === 'Others')
    && parts[5] === 'Root' && /^A[0-7]$/.test(parts[6] ?? ''), 5).map(group => {
    const kind = group.parts[1] === 'Handle' ? 'Handle' : 'Point', party = group.parts[4] ?? '', row = observation(group, kind, group.parts[3] ?? '', party);
    const samples = [...group.rows].sort((a, b) => (a.parts[6] ?? '').localeCompare(b.parts[6] ?? ''));
    const fit = samples.every((sample, i) => sample.parts[6] === 'A' + i) ? fitLocalTetrahedron(samples.map(sample => oscNumber(sample.entry.value))) : invalidFit('采样编号不完整 / Sample indices are incomplete');
    row.valid = fit.valid && fit.radius < .0199 && party === 'Self'; row.radius = fit.radius; row.residual = fit.residual;
    row.reason = row.valid ? '实验局部估计 / Experimental local estimate' : party !== 'Self' ? '本地点仅接受 Self 采样 / Local points require Self samples' : fit.valid ? '球半径达到拟合上限；检查相对缩放' : fit.reason;
    row.sampleCount = samples.length; row.timestampMs = Math.min(...samples.map(sample => sample.entry.timestampMs));
    if (kind === 'Handle') {
      const grabbed = entries.find(item => item.entry.source.key === group.sourceKey && item.path === group.prefix + '/Handle_IsGrabbed')?.entry;
      if (!grabbed || oscNumber(grabbed.value) !== 1) { row.valid = false; row.reason = '等待抓取 PB 把手'; }
      else row.timestampMs = Math.min(row.timestampMs, grabbed.timestampMs);
    }
    if (maxAge > 0 && !fresh(row.timestampMs, now, maxAge)) { row.valid = false; row.reason = '部分坐标或抓取状态已超时 / A coordinate or grab state has expired'; }
    row.position = row.valid ? fit.position : point(); row.measurementPaths = Array.from({ length: 4 }, (_, i) => group.prefix + '/Root/A' + i);
    return finalize(row);
  });
  const fixed = groups(entries, sourceKey, parts => parts.length === 4 && parts[0] === 'Sensa' && parts[1] === 'SPS'
    && !!parts[2] && (parts[3] === 'Sample' || /^P[0-9]$/.test(parts[3] ?? '')), 3).map(group => {
    const row = observation(group, 'SpsRoot', group.parts[2] ?? ''), map = fields(group);
    const samples = [...map.entries()].filter(([key]) => key.startsWith('P')).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
    const fit = samples.length === 4 && samples.every(([key], i) => key === 'P' + i) ? fitFixedAnchors(samples.map(([, entry]) => oscNumber(entry.value))) : invalidFit('需要完整 P0–P3 采样 / Complete P0–P3 samples are required');
    row.timestampMs = map.get('Sample')?.changedAtMs ?? 0;
    const active = map.has('Sample') && isSampleActive(fieldValue(map, 'Sample')) && fresh(row.timestampMs, now, maxAge > 0 ? Math.min(maxAge, 1250) : 1250);
    row.valid = fit.valid && active; row.position = row.valid ? fit.position : point(); row.radius = fit.radius; row.residual = fit.residual; row.sampleCount = samples.length;
    row.reason = !active ? 'SPS 采样停用或活动计数无效／冻结 / SPS sampling is inactive or its counter is invalid/frozen' : fit.valid ? '固定锚点根坐标；非同帧采样 / Fixed-anchor root coordinates; samples are not atomic' : fit.reason;
    row.measurementPaths = Array.from({ length: 4 }, (_, i) => group.prefix + '/P' + i); return finalize(row);
  });
  const shader = groups(entries, sourceKey, parts => parts.length === 4 && parts[0] === 'Sensa' && parts[1] === 'Shader' && shaderFields.includes(parts[3] ?? ''), 3).map(group => {
    const row = observation(group, 'ShaderRoot', group.parts[2] ?? ''), map = fields(group), complete = shaderFields.every(key => map.has(key));
    const vector = (prefix: string): PosePoint => point(fieldValue(map, prefix + 'X'), fieldValue(map, prefix + 'Y'), fieldValue(map, prefix + 'Z'));
    const position = vector(''), right = vector('Right'), forward = vector('Forward'), scale = fieldValue(map, 'AvatarScale'), frame = fieldValue(map, 'Frame');
    row.timestampMs = map.get('Frame')?.changedAtMs ?? 0; row.sampleCount = ['X', 'Y', 'Z'].filter(key => map.has(key)).length;
    const idValid = /^[1-9][0-9]{0,4}$/.test(row.instance) && Number(row.instance) <= 65535;
    const ordered = shaderFields.every((key, i) => map.get(key)?.sourceSequence === (map.get('Frame')?.sourceSequence ?? NaN) + i);
    const inBounds = [position.x, position.y - 1, position.z].every(n => Number.isFinite(n) && Math.abs(n) <= 2);
    const axesValid = validAxis(right) && validAxis(forward) && pointLength(crossPoint(right, forward)) > pointLength(right) * pointLength(forward) * 1e-4;
    row.valid = complete && idValid && ordered && inBounds && fieldValue(map, 'Valid') === 1 && axesValid && Number.isFinite(scale) && scale > 0 && scale <= 8
      && Number.isInteger(frame) && frame >= 0 && frame <= 65535 && fresh(row.timestampMs, now, maxAge > 0 ? Math.min(maxAge, 500) : 500);
    row.reason = row.valid ? '已接收原生根点编码；坐标非设备回读 / Native root frame received; coordinates are not device feedback' : '等待完整、新鲜且身份匹配的原生根点包 / Waiting for a complete fresh native-root packet with matching identity';
    row.position = row.valid ? position : point(); row.right = row.valid ? right : null; row.forward = row.valid ? forward : null; row.avatarScale = row.valid ? scale : null;
    row.measurementPaths = shaderFields.filter(key => key !== 'Frame' && key !== 'Valid').map(key => group.prefix + '/' + key); return finalize(row);
  });
  const contact = groups(entries, sourceKey, parts => parts.length === 4 && parts[0] === 'Sensa' && parts[1] === 'Contact'
    && !!parts[2]?.trim() && contactLeaves.includes(parts[3] ?? ''), 3).map(group => {
    const row = observation(group, 'ContactRoot', group.parts[2] ?? ''), map = fields(group), complete = contactLeaves.every(key => map.has(key));
    const vector = (keys: string[]): PosePoint => point(fieldValue(map, keys[0] ?? ''), fieldValue(map, keys[1] ?? ''), fieldValue(map, keys[2] ?? ''));
    const position = vector(contactPosition), velocity = vector(contactVelocity), radius = fieldValue(map, 'Radius'), speed = fieldValue(map, 'Proximity_SenderVelocityMagnitude');
    const proximity = fieldValue(map, 'Proximity'), self = fieldValue(map, 'Proximity_SenderType') === 1;
    row.timestampMs = map.get('Sample')?.changedAtMs ?? 0;
    const active = map.has('Sample') && isSampleActive(fieldValue(map, 'Sample')) && fresh(row.timestampMs, now, maxAge > 0 ? Math.min(maxAge, 1000) : 1000);
    const finite = complete && [...map.values()].every(entry => Number.isFinite(oscNumber(entry.value)));
    const inBounds = radius > 0 && radius <= 3 && pointLength(position) <= radius + .003 && speed >= 0;
    row.valid = finite && self && proximity > 0 && proximity <= 1 && inBounds && active;
    row.reason = !complete ? '等待完整 Contact 参数 / Waiting for complete Contact parameters' : !self || !(proximity > 0 && proximity <= 1) ? '等待专用 Self Contact 发送器 / Waiting for the dedicated Self Contact sender'
      : !active ? 'Contact 采样停用或活动计数无效／冻结 / Contact sampling is inactive or its counter is invalid/frozen' : !finite || !inBounds ? 'Contact 坐标、速度或接收半径无效 / Contact coordinates, velocity or receiver radius are invalid'
        : 'Contact 直接定位；位置以米、速度以米每秒表示 / Direct Contact tracking; position in metres and velocity in metres per second';
    row.position = row.valid ? position : point(); row.radius = Number.isFinite(radius) ? radius : 0; row.displayHalfRange = row.radius;
    row.sampleCount = contactPosition.filter(key => map.has(key)).length;
    row.velocity = row.valid ? velocity : null; row.speed = row.valid ? speed : null; row.proximitySpeed = row.valid ? fieldValue(map, 'Proximity_ProximitySpeed') : null;
    row.measurementPaths = [...contactPosition, ...contactVelocity, 'Proximity_SenderVelocityMagnitude', 'Proximity_ProximitySpeed'].map(key => group.prefix + '/' + key);
    return finalize(row);
  });
  return [...local, ...fixed, ...shader, ...contact];
}

export interface PoseObservation {
  key: string; prefix: string; sourceKey: string; sourceLabel: string; instance: string; party: string;
  coordinateFrame: string; experimental: boolean; valid: boolean; engaged: boolean; reason: string; sampleCount: number; timestampMs: number;
  root: PosePoint; tip: PosePoint; side: PosePoint; intersection: PosePoint; depth: number; axialDepth: number;
  penLength: number; yaw: number; pitch: number; roll: number; residual: number; estimatedMarkerRadius: number; offsetX: number; offsetY: number;
}
export function getPoseMetric(row: PoseObservation, metric: PoseMetric): number {
  return metric === 'OffsetX' ? row.intersection.x : metric === 'OffsetY' ? row.intersection.y : metric === 'Yaw' ? row.yaw : metric === 'Pitch' ? row.pitch : metric === 'Roll' ? row.roll : row.depth;
}
export function poseMatches(row: PoseObservation, pattern: string): boolean {
  return ['Root', 'Tip', 'Side'].some(marker => Array.from({ length: 8 }, (_, i) => `${row.prefix}/${marker}/A${i}`).some(path => matchesOscPath(pattern, path)));
}
export function observePoses(entries: readonly OscSnapshotEntry[], sourceKey?: string | null, now = Date.now(), maxAge = 0): PoseObservation[] {
  return groups(entries, sourceKey, parts => parts.length === 7 && parts[0] === 'Sensa' && parts[1] === 'Pose' && parts[2] === 'v1'
    && (parts[4] === 'Self' || parts[4] === 'Others') && ['Root', 'Tip', 'Side'].includes(parts[5] ?? '') && /^A[0-7]$/.test(parts[6] ?? ''), 5).map(group => {
    const row: PoseObservation = { key: group.sourceKey + '|' + group.prefix, prefix: group.prefix, sourceKey: group.sourceKey,
      sourceLabel: group.rows[0]?.entry.source.label ?? group.sourceKey, instance: group.parts[3] ?? '', party: group.parts[4] ?? '',
      coordinateFrame: 'ReferenceLocal', experimental: true, valid: false, engaged: false, reason: '等待完整的 24 路采样', sampleCount: group.rows.length,
      timestampMs: Math.min(...group.rows.map(item => item.entry.timestampMs)), root: point(), tip: point(), side: point(), intersection: point(),
      depth: 0, axialDepth: 0, penLength: 0, yaw: 0, pitch: 0, roll: 0, residual: 0, estimatedMarkerRadius: 0, offsetX: 0, offsetY: 0 };
    const fits = new Map<string, MarkerFit>();
    for (const marker of ['Root', 'Tip', 'Side']) {
      const samples = group.rows.filter(item => item.parts[5] === marker).sort((a, b) => (a.parts[6] ?? '').localeCompare(b.parts[6] ?? ''));
      if (samples.length !== 8 || samples.some((sample, i) => sample.parts[6] !== 'A' + i)) return row;
      const fit = fitMarker(samples.map(sample => oscNumber(sample.entry.value)));
      if (!fit.valid) { row.reason = marker + ': ' + fit.reason; row.residual = fit.residual; return row; }
      fits.set(marker, fit);
    }
    const root = fits.get('Root')?.position ?? point(), tip = fits.get('Tip')?.position ?? point(), side = fits.get('Side')?.position ?? point();
    let axis = subtractPoint(tip, root); const length = pointLength(axis);
    if (length < .02 || length > .5) { row.reason = '根部与尖端间距异常'; return row; }
    axis = scalePoint(axis, 1 / length);
    if (Math.abs(axis.z) <= .001) { Object.assign(row, { root, tip, side, reason: '轴线与孔口平面平行，没有唯一交点' }); return row; }
    let right = subtractPoint(side, root); right = subtractPoint(right, scalePoint(axis, dotPoint(right, axis)));
    if (pointLength(right) < .005) { row.reason = '侧向标记与轴线重合，无法确定扭转'; return row; }
    right = scalePoint(right, 1 / pointLength(right));
    let referenceRight = crossPoint(point(0, 1, 0), axis);
    if (pointLength(referenceRight) < .01) { row.reason = '方向接近奇异位置'; return row; }
    referenceRight = scalePoint(referenceRight, 1 / pointLength(referenceRight));
    const yaw = Math.atan2(axis.x, axis.z) * 180 / Math.PI, pitch = Math.asin(clamp(axis.y, -1, 1)) * 180 / Math.PI;
    const roll = Math.atan2(dotPoint(crossPoint(referenceRight, right), axis), dotPoint(referenceRight, right)) * 180 / Math.PI;
    const tilt = Math.acos(clamp(axis.z, -1, 1)) * 180 / Math.PI, intersection = subtractPoint(tip, scalePoint(axis, tip.z / axis.z));
    const radial = Math.hypot(intersection.x, intersection.y);
    const engaged = tilt <= 65 && radial <= poseProtocol.apertureRadius && tip.z > 0;
    Object.assign(row, { valid: true, engaged, root, tip, side, intersection, penLength: length, yaw, pitch, roll,
      reason: engaged ? '实验局部估计 / Experimental local estimate' : tilt > 65 ? '入射角过大或方向反转' : radial > poseProtocol.apertureRadius ? '轴线没有穿过孔口' : '尚未进入孔口',
      depth: engaged ? clamp(tip.z / (length * axis.z), 0, 1) : 0, axialDepth: Math.max(0, tip.z),
      residual: Math.max(...[...fits.values()].map(fit => fit.residual)), estimatedMarkerRadius: [...fits.values()].reduce((sum, fit) => sum + fit.radius, 0) / 3,
      offsetX: intersection.x, offsetY: intersection.y });
    if (maxAge > 0 && !fresh(row.timestampMs, now, maxAge)) { row.valid = false; row.engaged = false; row.depth = 0; row.reason = '部分姿态采样已超时 / A pose sample has expired'; }
    return row;
  });
}
