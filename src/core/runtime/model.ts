/** Host-neutral runtime contracts. JSON names retain the desktop API. */

import type { ProtocolInputConfig } from '../protocols/input-types.ts';

export type { ProtocolInputConfig } from '../protocols/input-types.ts';

export type TCodeProfileTarget = 'Global' | 'TCode' | 'Udp' | 'Tcp';

export type OutputDeviceType = 'TCodeSerial' | 'TCodeUdp' | 'TCodeTcp' | 'Intiface' | 'OscParameter' | 'Dglab' | 'Recording' | 'HttpJson' | 'WebSocketJson' | 'Mqtt' | 'Midi' | 'Handy' | 'Autoblow' | 'VacuGlide' | 'Lovense' | 'TCodeWebSocket' | 'Bluetooth' | 'BleBridge' | 'SensaHttp' | 'SensaWebSocket';

export type TCodeAxisMode = 'Normal' | 'Locked' | 'Ignored';

export type TCodeCommandMode = 'None' | 'Interval' | 'Speed';

export type TCodeSpeedUnitBase = 'Per100ms' | 'PerSecond';

export type TCodeSlopeMode = 'None' | 'Speed' | 'Interval' | 'NoSlope';

export type TCodeRampType = 'None' | 'Linear' | 'EaseIn' | 'EaseOut' | 'EaseInOut';

export type OscHubMode = 'EventDriven' | 'FixedRate';

export type ComputedSignalOperation = 'WeightedAverage' | 'Average' | 'Sum' | 'Difference' | 'Product' | 'Ratio' | 'Minimum' | 'Maximum' | 'Magnitude' | 'Smooth' | 'DeadZone' | 'Hysteresis' | 'Delay' | 'Derivative' | 'PeakHold' | 'RisingEdge' | 'FallingEdge' | 'Pulse' | 'Cooldown' | 'Duration' | 'Sine' | 'Envelope' | 'PointDistance' | 'PlaneDepth' | 'PlaneOffset' | 'VectorAngle' | 'PlaneAngle' | 'PlaneDepthFromAxes' | 'PlaneOffsetFromAxes';

export type SignalRole = 'Depth' | 'AngleX' | 'AngleY' | 'Twist' | 'Surge' | 'Sway' | 'V0' | 'V1' | 'V2' | 'Auxiliary' | 'Auxiliary1' | 'Auxiliary2' | 'GateEnable' | 'DepthOverride';

export type SignalCurve = 'Linear' | 'EaseIn' | 'EaseOut' | 'SCurve';

export interface TCodeConfig {
  comPort: string;
  maxPos: number;
  minPos: number;
  maxVelocity: number;
  l0Invert: boolean;
  preferSpeedMode: boolean;
  enabled: boolean;
}

export interface TCodeAxisConfig {
  min: number;
  max: number;
  remapMin: number;
  remapMax: number;
  maxSpeed: number;
  invert: boolean;
  mode: TCodeAxisMode;
  commandMode: TCodeCommandMode;
  rampType: TCodeRampType;
  lockValue: number;
}

export interface TCodeMotionProfile {
  useGlobal: boolean;
  l0: TCodeAxisConfig;
  l1: TCodeAxisConfig;
  l2: TCodeAxisConfig;
  r0: TCodeAxisConfig;
  r1: TCodeAxisConfig;
  r2: TCodeAxisConfig;
  v0: TCodeAxisConfig;
  v1: TCodeAxisConfig;
  v2: TCodeAxisConfig;
  a0: TCodeAxisConfig;
  a1: TCodeAxisConfig;
  a2: TCodeAxisConfig;
}

export interface TCodeProfilesConfig {
  global: TCodeMotionProfile;
  serial: TCodeMotionProfile;
  udp: TCodeMotionProfile;
  tcp: TCodeMotionProfile;
}

export interface AxisProfileConfig {
  id: string;
  name: string;
  isDefault: boolean;
  motion: TCodeMotionProfile;
}

export interface OscMappingPresetConfig {
  id: string;
  name: string;
  description: string;
  mappings: SignalMapping[];
}

export interface OutputDeviceConfig {
  bridge?: BluetoothBridgeOptions;
  intifaceDeviceName?: string;
  intifaceDeviceIndex?: number | null;
  device: DeviceProtocolOptions;
  intifaceFeatures: IntifaceFeatureRoute[];
  signal: SignalOutputOptions;
  id: string;
  name: string;
  type: OutputDeviceType;
  enabled: boolean;
  motionProfileId: string;
  comPort: string;
  host: string;
  port: number;
  preferSpeedMode: boolean;
  speedUnitBase: TCodeSpeedUnitBase;
  slopeMode: TCodeSlopeMode;
  manageEngineProcess: boolean;
  websocketAddress: string;
  vibrationAxis: string;
}

export type BridgeProtocol = 'loob' | 'thrust-sync' | 'svakom-v1' | 'lovense-single' | 'youou-vx001';
export interface BluetoothBridgeOptions {
  protocol: BridgeProtocol;
  device: string;
  listenPort?: number;
  adapter?: string;
}

export interface UdpTCodeConfig {
  enabled: boolean;
  host: string;
  port: number;
}

export interface TcpTCodeConfig {
  enabled: boolean;
  host: string;
  port: number;
}

export interface IntifaceConfig {
  featureRoutes: IntifaceFeatureRoute[];
  enabled: boolean;
  manageEngineProcess: boolean;
  websocketAddress: string;
  port: number;
  vibrationAxis: string;
}

export interface OscHubTargetConfig {
  id: string;
  name: string;
  enabled: boolean;
  host: string;
  port: number;
}

export interface OscHubConfig {
  enabled: boolean;
  mode: OscHubMode;
  fixedRateHz: number;
  forwardAvatarChange: boolean;
  targets: OscHubTargetConfig[];
}

export interface OscQueryReceiverAdvertiseConfig {
  enabled: boolean;
  serviceName: string;
  httpPort: number;
  advertiseAvatar: boolean;
  advertiseTracking: boolean;
}

export interface OscQueryPollingConfig {
  enabled: boolean;
  rateHz: number;
}

export interface OgbControlConfig {
  enabled: boolean;
  host: string;
  port: number;
}

export interface OscReceiverConfig {
  enabled: boolean;
  receiverHost: string;
  receiverPort: number;
  inputTimeoutMs: number;
  ogbControl: OgbControlConfig;
  allowExperimentalSpatialInput: boolean;
  allowedSourceAddresses: string[];
  oscQueryEnabled: boolean;
  oscQueryUrl: string;
  oscQueryPolling: OscQueryPollingConfig;
  oscQueryReceiver: OscQueryReceiverAdvertiseConfig;
  preferredSourcePersistentId: string;
  hub: OscHubConfig;
}

export interface WebUiConfig {
  host: string;
  port: number;
  title: string;
}

export interface DeviceRouteEntry {
  deviceName: string;
  sendL0: boolean;
  sendV0: boolean;
  enabled: boolean;
}

export interface AppConfig {
  schemaVersion: number;
  osc: OscReceiverConfig;
  webUi: WebUiConfig;
  intiface: IntifaceConfig;
  tCode: TCodeConfig;
  tCodeProfiles: TCodeProfilesConfig;
  axisProfiles: AxisProfileConfig[];
  outputs: OutputDeviceConfig[];
  udpTCode: UdpTCodeConfig;
  tcpTCode: TcpTCodeConfig;
  signals: SignalMapping[];
  computedSignals: ComputedSignalConfig[];
  protocolInputs: ProtocolInputConfig[];
  oscMappingPresets: OscMappingPresetConfig[];
  deviceRoutes: DeviceRouteEntry[];
}

export interface ComputedSignalConfig {
  id: string;
  name: string;
  operation: ComputedSignalOperation;
  inputs: ComputedSignalInputConfig[];
  maxAgeMs: number;
  timeMs: number;
  threshold: number;
  releaseThreshold: number;
  frequencyHz: number;
  amplitude: number;
  offset: number;
}

export interface ComputedSignalInputConfig {
  sourceMode: string;
  oscPath: string;
  pointMetric: PointMetric;
  poseMetric: PoseMetric;
  weight: number;
  value: number;
}

export interface SignalMapping {
  sourceMode: string;
  poseMetric: PoseMetric;
  pointMetric: PointMetric;
  oscPath: string;
  invertDirection: boolean;
  vrchatMin: number;
  vrchatMax: number;
  curve: SignalCurve;
  role: SignalRole;
  mappedMin: number | null;
  mappedMax: number | null;
  isOgbSocket: boolean;
  isOgbPlug: boolean;
}

export interface SignalOutputOptions {
  bindings: SignalOutputBinding[];
  vrChat: boolean;
  serverUrl: string;
  clientId: string;
  slotId: string;
  channel: number;
  maxIntensity: number;
  taskDurationMs: number;
  waveformFrames: string[];
  recordingFormat: string;
  recordingName: string;
  midiPortName: string;
  mqttTopicPrefix: string;
  mqttClientId: string;
  mqttUseTls: boolean;
}

export interface SignalOutputBinding {
  id: string;
  name: string;
  source: ComputedSignalInputConfig;
  address: string;
  valueType: string;
  channel: number | null;
  inputMin: number;
  inputMax: number;
  outputMin: number;
  outputMax: number;
  stopValue: number;
  rateHz: number;
  epsilon: number;
  sendMode: string;
  curve: string;
}

export interface DeviceProtocolOptions {
  endpoint: string;
  connectionKey: string;
  deviceId: string;
  axis: string;
  apiVersion: number;
  apiKey: string;
  authToken: string;
  function: string;
  speed: number;
  offsetMs: number;
  trustedClusterHost: string;
  scriptUrl: string;
  scriptFormat: string;
  scriptTimeoutMs: number;
  requestTimeoutMs: number;
  minIntervalMs: number;
}

export interface IntifaceFeatureRoute {
  deviceName: string;
  featureIndex: number | null;
  outputType: string;
  sourceAxis: string;
  directionAxis: string;
  clockwise: boolean;
  invert: boolean;
}

export const motionAxes = ['L0', 'L1', 'L2', 'R0', 'R1', 'R2', 'V0', 'V1', 'V2', 'A0', 'A1', 'A2'] as const;

export type MotionAxis = typeof motionAxes[number];

export type PointMetric = 'X' | 'Y' | 'Z' | 'Distance' | 'VelocityX' | 'VelocityY' | 'VelocityZ' | 'Speed' | 'ProximitySpeed' | 'RightX' | 'RightY' | 'RightZ' | 'ForwardX' | 'ForwardY' | 'ForwardZ' | 'AvatarScale';

export type PoseMetric = 'Depth' | 'OffsetX' | 'OffsetY' | 'Yaw' | 'Pitch' | 'Roll';

export type RuntimeInputMode = 'Manual' | 'Osc' | 'Script' | 'Protocol' | 'Combined';

export type MotionValues = Record<MotionAxis, number>;

export interface RuntimeMotionFrame {
  values: MotionValues;
  deltaMs: number;
  activeAxes?: readonly MotionAxis[];
  requestedCommandMode?: TCodeCommandMode;
  requestedMotionValue?: number;
}

export interface ComputedSignalSample {
  value: number | null; valid: boolean; reason: string; sourceKey: string | null;
  timestampMs: number; coordinateFrame: string | null; originKey: string | null;
}

export function sample(value: number, timestampMs: number, sourceKey: string | null = null, coordinateFrame: string | null = null, originKey: string | null = null): ComputedSignalSample {
  return Number.isFinite(value) ? { value, valid: true, reason: '', sourceKey, timestampMs, coordinateFrame, originKey } : invalidSample('Waiting for a finite signal value.');
}

export function invalidSample(reason: string): ComputedSignalSample {
  return { value: null, valid: false, reason, sourceKey: null, timestampMs: 0, coordinateFrame: null, originKey: null };
}

export function neutralValues(): MotionValues {
  return { L0: .5, L1: .5, L2: .5, R0: .5, R1: .5, R2: .5, V0: 0, V1: 0, V2: 0, A0: .5, A1: .5, A2: .5 };
}

export function isMotionAxis(value: unknown): value is MotionAxis { return typeof value === 'string' && motionAxes.some(axis => axis === value); }
