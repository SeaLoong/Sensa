/** Protocol-neutral external input contracts shared by all hosts. */
export type ProtocolInputType = 'Buttplug' | 'TCodeTcp' | 'TCodeUdp' | 'TCodeSerial' | 'TCodeWebSocket'
  | 'IntifaceDevice' | 'JsonHttp' | 'JsonWebSocket' | 'LovenseHttp' | 'HandyHttp' | 'AutoblowHttp' | 'VacuGlideHttp';
export type ProtocolActuator = 'Position' | 'Scalar' | 'Rotation';
export type ProtocolScalarType = 'Vibrate' | 'Oscillate' | 'Constrict' | 'Led' | 'Temperature' | 'Spray';
export interface ProtocolFeatureConfig {
  channel: string;
  name: string;
  actuator: ProtocolActuator;
  scalarType: ProtocolScalarType;
  targetAxis: string;
}
export interface ProtocolInputConfig {
  id: string;
  name: string;
  type: ProtocolInputType;
  enabled: boolean;
  host: string;
  port: number;
  path: string;
  address: string;
  identifier: string;
  comPort: string;
  baudRate: number;
  timeoutMs: number;
  routeToMotion: boolean;
  maxSpeedPerSecond: number;
  maxScriptDurationMs: number;
  features: ProtocolFeatureConfig[];
}
export interface ExternalControlCommand {
  channel: string;
  value: number;
  durationMs?: number;
  clockwise?: boolean;
}
export interface ExternalControlBatch {
  inputId: string;
  sessionId: string;
  sequence: number;
  commands: readonly ExternalControlCommand[];
}
export type ControlResult = { ok: true } | { ok: false; error: string };
export interface ExternalControlSink {
  tryAcquire(inputId: string, sessionId: string): ControlResult;
  publish(inputId: string, sessionId: string, commands: readonly ExternalControlCommand[]): ControlResult;
  stop(inputId: string, sessionId: string, channel?: string): void;
  release(inputId: string, sessionId: string): void;
  heartbeat(inputId: string, sessionId: string): void;
}
export interface ProtocolSample {
  value: number | null;
  valid: boolean;
  reason: string;
  timestampMs: number;
  sourceKey: string | null;
  originKey: string | null;
  coordinateFrame: string | null;
}
export const protocolInputTypes: readonly ProtocolInputType[] = ['Buttplug', 'TCodeTcp', 'TCodeUdp', 'TCodeSerial',
  'TCodeWebSocket', 'IntifaceDevice', 'JsonHttp', 'JsonWebSocket', 'LovenseHttp', 'HandyHttp', 'AutoblowHttp', 'VacuGlideHttp'];
export function isWebInput(type: ProtocolInputType): boolean {
  return !['TCodeTcp', 'TCodeUdp', 'TCodeSerial', 'IntifaceDevice'].includes(type);
}
export function normalizeInputPath(value: string | undefined): string {
  const path = value?.trim().replace(/\/+$/, '') || '/';
  if (path.length > 256 || !/^\/(?:[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*)?$/.test(path)) {
    throw new Error('Protocol input path must use slash-separated letters, digits, dashes or underscores.');
  }
  return path;
}
export function defaultProtocolInput(id = ''): ProtocolInputConfig {
  return { id, name: 'Protocol input', type: 'Buttplug', enabled: false, host: '127.0.0.1', port: 12400,
    path: '/', address: 'ws://127.0.0.1:54817', identifier: '', comPort: '', baudRate: 115200,
    timeoutMs: 10000, routeToMotion: true, maxSpeedPerSecond: 1, maxScriptDurationMs: 3600000,
    features: [{ channel: 'L0', name: 'Stroke', actuator: 'Position', scalarType: 'Vibrate', targetAxis: 'L0' }] };
}
export function validateProtocolInputs(inputs: readonly ProtocolInputConfig[]): ProtocolInputConfig[] {
  if (inputs.length > 16) throw new Error('At most 16 protocol inputs are supported.');
  const identifiers = new Set<string>(), axes = new Set<string>();
  return inputs.map(input => {
    const id = input.id.trim();
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(id) || identifiers.has(id)) throw new Error('Protocol input IDs must be unique identifiers.');
    identifiers.add(id);
    if (!protocolInputTypes.includes(input.type)) throw new Error('Unsupported protocol input type.');
    if (!Number.isInteger(input.port) || input.port < 0 || input.port > 65535 || !Number.isInteger(input.timeoutMs)
      || input.timeoutMs < 1000 || input.timeoutMs > 600000 || !Number.isInteger(input.baudRate)
      || input.baudRate < 1200 || input.baudRate > 4000000) throw new Error('Invalid protocol input port, timeout or baud rate.');
    if (!Number.isFinite(input.maxSpeedPerSecond) || input.maxSpeedPerSecond < .01 || input.maxSpeedPerSecond > 20
      || !Number.isInteger(input.maxScriptDurationMs) || input.maxScriptDurationMs < 1000 || input.maxScriptDurationMs > 3600000) {
      throw new Error('Invalid virtual device speed or script duration.');
    }
    if (input.features.length < 1 || input.features.length > 16) throw new Error('A protocol input needs 1–16 features.');
    const channels = new Set<string>();
    const features = input.features.map(feature => {
      if (!/^[a-zA-Z0-9_-]{1,64}$/.test(feature.channel) || channels.has(feature.channel)) throw new Error('Feature channels must be unique identifiers.');
      channels.add(feature.channel);
      if (!['Position', 'Scalar', 'Rotation'].includes(feature.actuator)
        || !['Vibrate', 'Oscillate', 'Constrict', 'Led', 'Temperature', 'Spray'].includes(feature.scalarType)) throw new Error('Unsupported actuator type.');
      if (feature.targetAxis && !/^[LRVA][0-2]$/.test(feature.targetAxis)) throw new Error('Invalid target axis.');
      if (feature.actuator === 'Rotation' && feature.targetAxis) throw new Error('Rotation speed needs a computed binding.');
      if (feature.actuator === 'Scalar' && feature.targetAxis && !feature.targetAxis.startsWith('V')) throw new Error('Scalar intensity maps directly only to vibration axes.');
      if (input.enabled && input.routeToMotion && feature.targetAxis) {
        if (axes.has(feature.targetAxis)) throw new Error('Enabled protocol inputs cannot directly control the same axis.');
        axes.add(feature.targetAxis);
      }
      if (['TCodeTcp', 'TCodeUdp', 'TCodeSerial', 'TCodeWebSocket', 'IntifaceDevice'].includes(input.type)
        && (!/^[LRVA][0-9]$/.test(feature.channel) || feature.actuator === 'Rotation')) throw new Error('TCode features require LRVA axis channels.');
      return { ...feature, name: feature.name.trim() };
    });
    return { ...input, id, name: input.name.trim(), path: normalizeInputPath(input.path), features };
  });
}
