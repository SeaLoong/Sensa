/** Configuration decoding and validation shared by browser, Node and Electron. */
import type * as Model from './model.ts';
import { isMotionAxis, motionAxes } from './model.ts';
import * as defaults from './configuration-defaults.ts';
import { defaultProtocolInput, validateProtocolInputs } from '../protocols/input-types.ts';
import { matchesOscPath } from '../protocols/osc.ts';
import { sha256 } from './hash.ts';
import { encodeJson,encodeOsc,encodeMidi,encodeMqttConnect,encodeMqttPublish,dglabPulse } from '../outputs/codecs.ts';

export const outputTypes: readonly Model.OutputDeviceType[] = ['TCodeSerial', 'TCodeUdp', 'TCodeTcp', 'Intiface',
  'OscParameter', 'Dglab', 'Recording', 'HttpJson', 'WebSocketJson', 'Mqtt', 'Midi', 'Handy', 'Autoblow', 'VacuGlide', 'Lovense', 'TCodeWebSocket', 'Bluetooth', 'BleBridge', 'SensaHttp', 'SensaWebSocket'];
export const operations: readonly Model.ComputedSignalOperation[] = ['WeightedAverage', 'Average', 'Sum', 'Difference',
  'Product', 'Ratio', 'Minimum', 'Maximum', 'Magnitude', 'Smooth', 'DeadZone', 'Hysteresis', 'Delay', 'Derivative',
  'PeakHold', 'RisingEdge', 'FallingEdge', 'Pulse', 'Cooldown', 'Duration', 'Sine', 'Envelope', 'PointDistance',
  'PlaneDepth', 'PlaneOffset', 'VectorAngle', 'PlaneAngle', 'PlaneDepthFromAxes', 'PlaneOffsetFromAxes'];
export const pointMetrics: readonly Model.PointMetric[] = ['X','Y','Z','Distance','VelocityX','VelocityY','VelocityZ',
  'Speed','ProximitySpeed','RightX','RightY','RightZ','ForwardX','ForwardY','ForwardZ','AvatarScale'];
export const poseMetrics: readonly Model.PoseMetric[] = ['Depth','OffsetX','OffsetY','Yaw','Pitch','Roll'];
const modes = ['Direct','SensaPoint','SensaPose','Computed','Constant','Manual','Script','DeviceFeedback','RecordingReplay','Protocol'];
const curves: readonly Model.SignalCurve[] = ['Linear','EaseIn','EaseOut','SCurve'];
const roles: readonly Model.SignalRole[] = ['Depth','AngleX','AngleY','Twist','Surge','Sway','V0','V1','V2',
  'Auxiliary','Auxiliary1','Auxiliary2','GateEnable','DepthOverride'];
const featureTypes = ['Vibrate','Oscillate','Rotate','Position','HwPositionWithDuration','Led','Temperature','Constrict','Spray'];
const protocolOutputs: readonly Model.OutputDeviceType[] = ['OscParameter','Dglab','Recording','HttpJson','WebSocketJson','Mqtt','Midi'];
export const isProtocolOutput = (type: Model.OutputDeviceType): boolean => protocolOutputs.includes(type);
export const usesBindings = (output: Model.OutputDeviceConfig): boolean => isProtocolOutput(output.type) || output.signal.bindings.length > 0;
export function requireConfiguration(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
export function object(value: unknown): Record<string, unknown> {
  requireConfiguration(value !== null && typeof value === 'object' && !Array.isArray(value), 'Expected a configuration object.');
  const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const [key, item] of Object.entries(value)) {
    requireConfiguration(!['__proto__','prototype','constructor'].includes(key.toLowerCase()), 'Invalid configuration property.');
    const lower = key.toLowerCase();
    requireConfiguration(!Object.hasOwn(result, lower), 'Duplicate case-insensitive configuration property.');
    result[lower] = item;
  }
  return result;
}
/** Defaults form the structural schema; array elements are decoded by their own schema below. */
export function decode<T extends object>(value: unknown, fallback: T): T {
  if (value === undefined || value === null) return structuredClone(fallback);
  const input = object(value), output: Record<string, unknown> = {};
  for (const [key, defaultValue] of Object.entries(fallback)) {
    let item = input[key.toLowerCase()];
    if (typeof item === 'number' && typeof defaultValue === 'string') {
      const enumSchema: Record<string, readonly string[]> = {
        type: defaultValue === 'TCodeSerial' ? outputTypes : [],
        operation: operations, pointMetric: pointMetrics, poseMetric: poseMetrics, curve: curves, role: roles,
        mode: defaultValue === 'EventDriven' ? ['EventDriven','FixedRate'] : ['Normal','Locked','Ignored'],
        commandMode: ['None','Interval','Speed'], rampType: ['None','Linear','EaseIn','EaseOut','EaseInOut'],
        speedUnitBase: ['Per100ms','PerSecond'], slopeMode: ['None','Speed','Interval','NoSlope'],
      };
      const choices = enumSchema[key];
      if (choices?.length) {
        requireConfiguration(Number.isInteger(item) && choices[item] !== undefined, `Invalid enum value for ${key}.`);
        item = choices[item];
      }
    }
    if (item === undefined || item === null && defaultValue !== null && (typeof defaultValue === 'object' || typeof defaultValue === 'string')) output[key] = structuredClone(defaultValue);
    else if (Array.isArray(defaultValue)) {
      requireConfiguration(Array.isArray(item), `Expected an array for ${key}.`); output[key] = item.slice();
    } else if (defaultValue !== null && typeof defaultValue === 'object') output[key] = decode(item, defaultValue);
    else if (defaultValue === null) {
      requireConfiguration(item === null || typeof item === 'number' && Number.isFinite(item), `Expected a nullable number for ${key}.`);
      output[key] = item;
    } else {
      requireConfiguration(typeof item === typeof defaultValue && (typeof item !== 'number' || Number.isFinite(item)), `Invalid configuration value for ${key}.`);
      output[key] = item;
    }
  }
  return output as T;
}
const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
const port = (value: number, fallback: number): number => Number.isInteger(value) && value > 0 && value <= 65535 ? value : fallback;
const clean = (value: string, fallback = ''): string => value.trim() || fallback;
function choice<T extends string>(value: unknown, choices: readonly T[], fallback?: T): T {
  const found = typeof value === 'string' ? choices.find(item => item.toLowerCase() === value.toLowerCase())
    : typeof value === 'number' && Number.isInteger(value) ? choices[value] : undefined;
  if (found !== undefined) return found;
  if (fallback !== undefined) return fallback;
  throw new Error('Unsupported configuration choice.');
}
function unique(value: string, occupied: Set<string>, fallback: string): string {
  const base = clean(value, fallback); let result = base, suffix = 2;
  while (occupied.has(result.toLowerCase())) result = `${base}-${suffix++}`;
  occupied.add(result.toLowerCase()); return result;
}
export function normalizeMotionProfile(value: unknown, useGlobal = false): Model.TCodeMotionProfile {
  const result = decode(value, defaults.defaultTCodeMotionProfile()); result.useGlobal = value === undefined ? useGlobal : result.useGlobal;
  for (const axis of motionAxes) {
    const key = axis.toLowerCase() as Exclude<keyof Model.TCodeMotionProfile, 'useGlobal'>;
    const item = result[key];
    [item.min,item.max] = [clamp(item.min,0,999),clamp(item.max,0,999)].sort((a,b) => a-b) as [number,number];
    [item.remapMin,item.remapMax] = [clamp(item.remapMin,0,999),clamp(item.remapMax,0,999)].sort((a,b) => a-b) as [number,number];
    item.maxSpeed = clamp(Math.trunc(item.maxSpeed),1,999); item.lockValue = clamp(item.lockValue,0,1);
    item.mode = choice(item.mode,['Normal','Locked','Ignored'],'Normal');
    item.commandMode = choice(item.commandMode,['None','Interval','Speed'],'Interval');
    item.rampType = choice(item.rampType,['None','Linear','EaseIn','EaseOut','EaseInOut'],'None');
  }
  return result;
}
export function normalizeSignal(value: unknown): Model.SignalMapping {
  const item = decode(value, defaults.defaultSignalMapping());
  item.sourceMode = ['OgbDepth','OgbTouch','SpsSocketDepth','SensaPose','SensaPoint','Computed'].includes(item.sourceMode) ? item.sourceMode : 'Direct';
  item.oscPath = item.oscPath.trim(); item.poseMetric = choice(item.poseMetric,poseMetrics,'Depth');
  item.pointMetric = choice(item.pointMetric,pointMetrics,'Z'); item.curve = choice(item.curve,curves); item.role = choice(item.role,roles);
  item.mappedMin = clamp(item.mappedMin ?? 0,0,999); item.mappedMax = clamp(item.mappedMax ?? 999,item.mappedMin,999);
  return item;
}
export function normalizeInput(value: unknown): Model.ComputedSignalInputConfig {
  const item = decode(value, defaults.defaultComputedSignalInputConfig());
  item.sourceMode = item.sourceMode.trim(); item.oscPath = item.oscPath.trim();
  requireConfiguration(modes.includes(item.sourceMode) && (item.sourceMode === 'Constant' || item.oscPath.length > 0)
    && item.oscPath.length <= 512 && item.weight >= 0, 'Choose a complete, finite signal source.');
  item.pointMetric = choice(item.pointMetric,pointMetrics); item.poseMetric = choice(item.poseMetric,poseMetrics); return item;
}
export function isTemporal(operation: Model.ComputedSignalOperation): boolean {
  return ['Smooth','Hysteresis','Delay','Derivative','PeakHold','RisingEdge','FallingEdge','Pulse','Cooldown','Duration','Sine','Envelope'].includes(operation);
}
export function isGeometry(operation: Model.ComputedSignalOperation): boolean {
  return ['PointDistance','PlaneDepth','PlaneOffset','VectorAngle','PlaneAngle','PlaneDepthFromAxes','PlaneOffsetFromAxes'].includes(operation);
}
export function normalizeComputedSignals(values: readonly unknown[]): Model.ComputedSignalConfig[] {
  requireConfiguration(values.length <= 64, 'Use at most 64 computed signals.'); const ids = new Set<string>();
  const result = values.map(value => {
    const item = decode(value,defaults.defaultComputedSignalConfig()); item.id = item.id.trim(); item.name = item.name.trim();
    requireConfiguration(/^[A-Za-z][A-Za-z0-9_-]{0,47}$/.test(item.id) && !ids.has(item.id) && item.name.length <= 80, 'Computed signal IDs must be valid and unique.'); ids.add(item.id);
    item.operation = choice(item.operation,operations); item.inputs = item.inputs.map(normalizeInput);
    const n = item.inputs.length, op = item.operation;
    const validCount = ['PointDistance','VectorAngle','PlaneAngle'].includes(op) ? n === 6
      : ['PlaneDepth','PlaneOffset'].includes(op) ? n === 9 : ['PlaneDepthFromAxes','PlaneOffsetFromAxes'].includes(op) ? n === 12
      : op === 'Sine' ? n <= 1 : ['Difference','Ratio'].includes(op) ? n === 2 : isTemporal(op) || op === 'DeadZone' ? n === 1 : n >= 1 && n <= 16;
    requireConfiguration(validCount, 'Computed signal input count does not match its operation.');
    requireConfiguration((item.maxAgeMs === 0 || item.maxAgeMs >= 100 && item.maxAgeMs <= 60000)
      && Number.isInteger(item.maxAgeMs) && item.timeMs >= 0 && item.timeMs <= 60000 && Number.isInteger(item.timeMs)
      && item.frequencyHz >= 0 && item.frequencyHz <= 100, 'Invalid computed signal timing.');
    requireConfiguration(op !== 'DeadZone' || item.threshold >= 0, 'Dead zone must be non-negative.');
    requireConfiguration(op !== 'Hysteresis' || item.releaseThreshold <= item.threshold, 'Hysteresis thresholds are reversed.');
    requireConfiguration(op !== 'WeightedAverage' || item.inputs.some(input => input.weight > 0), 'Weighted average needs a positive weight.'); return item;
  });
  const lookup = new Map(result.map(item => [item.id,item])), visiting = new Set<string>(), depths = new Map<string,number>();
  const visit = (id: string): number => {
    requireConfiguration(!visiting.has(id), 'Computed signals must not contain cycles.'); const previous = depths.get(id); if (previous !== undefined) return previous;
    const item = lookup.get(id); requireConfiguration(item, `Unknown computed signal: ${id}`); visiting.add(id);
    let depth = 1; for (const input of item.inputs) if (input.sourceMode === 'Computed') depth = Math.max(depth,1+visit(input.oscPath));
    requireConfiguration(depth <= 16, 'Computed signal chains support at most 16 levels.'); visiting.delete(id); depths.set(id,depth); return depth;
  };
  for (const item of result) visit(item.id); return result;
}
export function requiredInputLeaves(definitions:readonly Model.ComputedSignalConfig[],ids:readonly string[]):Model.ComputedSignalInputConfig[] {
  const lookup=new Map(definitions.map(item=>[item.id,item])),visited=new Set<string>(),leaves=new Map<string,Model.ComputedSignalInputConfig>();
  const visit=(id:string):void=>{if(visited.has(id))return;visited.add(id);const item=lookup.get(id);requireConfiguration(item,'Unknown computed signal: '+id);
    for(const input of item.inputs){if(item.operation==='WeightedAverage'&&input.weight===0)continue;if(input.sourceMode==='Computed')visit(input.oscPath);
      else if(input.sourceMode!=='Constant')leaves.set(JSON.stringify([input.sourceMode,input.oscPath,input.pointMetric,input.poseMetric]),structuredClone(input));}};
  for(const id of ids)visit(id);return [...leaves.values()];
}
export function normalizeFeatureRoutes(values: readonly unknown[]): Model.IntifaceFeatureRoute[] {
  requireConfiguration(values.length <= 32,'At most 32 Intiface feature mappings are supported.');
  const result: Model.IntifaceFeatureRoute[] = [];
  for (const value of values) {
    const item = decode(value,defaults.defaultIntifaceFeatureRoute()); item.deviceName = item.deviceName.trim(); item.directionAxis = item.directionAxis.trim();
    requireConfiguration(featureTypes.includes(item.outputType) && isMotionAxis(item.sourceAxis)
      && (!item.directionAxis || item.outputType === 'Rotate' && isMotionAxis(item.directionAxis))
      && (item.featureIndex === null || Number.isInteger(item.featureIndex) && item.featureIndex >= 0 && item.featureIndex <= 0xffffffff)
      && item.deviceName.length <= 256 && !hasControlCharacters(item.deviceName),'Invalid Intiface feature route.');
    requireConfiguration(!result.some(previous => (previous.outputType === item.outputType
      || ['Position','HwPositionWithDuration'].includes(previous.outputType) && ['Position','HwPositionWithDuration'].includes(item.outputType))
      && (!previous.deviceName || !item.deviceName || previous.deviceName === item.deviceName)
      && (previous.featureIndex === null || item.featureIndex === null || previous.featureIndex === item.featureIndex)), 'Intiface feature routes overlap.'); result.push(item);
  }
  return result;
}
export function normalizeSignalOutput(rawValue: unknown): Model.SignalOutputOptions {
  const result = decode(rawValue,defaults.defaultSignalOutputOptions());
  requireConfiguration(result.bindings.length <= 64 && result.channel >= 0 && result.channel <= 1 && Number.isInteger(result.channel)
    && result.maxIntensity >= 0 && result.maxIntensity <= 1000 && result.taskDurationMs >= 100 && result.taskDurationMs <= 1000
    && result.waveformFrames.length <= 100 && ['Funscript','JsonLines','Csv'].includes(result.recordingFormat)
    && result.recordingName.length <= 80,'Invalid output options.');
  result.waveformFrames = result.waveformFrames.map(value => { requireConfiguration(typeof value === 'string','Invalid waveform frame.'); return value; });
  const ids = new Set<string>();
  result.bindings = result.bindings.map((value,index) => {
    const binding = decode(value,defaults.defaultSignalOutputBinding()); binding.source = normalizeInput(binding.source);
    binding.id = clean(binding.id,`Binding${index+1}`); binding.name = binding.name.trim(); binding.address = binding.address.trim();
    requireConfiguration(binding.id.length <= 80 && !ids.has(binding.id),'Output binding IDs must be unique.'); ids.add(binding.id);
    requireConfiguration(binding.channel === null || Number.isInteger(binding.channel) && binding.channel >= 0 && binding.channel <= 1,'Invalid output channel.');
    requireConfiguration(binding.inputMin !== binding.inputMax && Number.isFinite(binding.inputMax-binding.inputMin)
      && binding.rateHz >= 1 && binding.rateHz <= 100 && Number.isInteger(binding.rateHz) && binding.epsilon >= 0 && binding.epsilon <= 1000000
      && ['Float','Int','Bool'].includes(binding.valueType) && ['OnChange','FixedRate','OnEvent'].includes(binding.sendMode)
      && curves.includes(binding.curve as Model.SignalCurve),'Invalid output binding range, rate or conversion.'); return binding;
  }); return result;
}
export function validateDeviceOptions(options: Model.DeviceProtocolOptions): void {
  requireConfiguration(isMotionAxis(options.axis) && [2,3].includes(options.apiVersion)
    && ['Vibrate','Rotate','Pump','Thrusting','Fingering','Suction'].includes(options.function)
    && options.speed >= 0 && options.speed <= 100 && options.offsetMs >= -60000 && options.offsetMs <= 60000
    && options.requestTimeoutMs >= 100 && options.requestTimeoutMs <= 15000 && options.minIntervalMs >= 25 && options.minIntervalMs <= 10000
    && ['Csv','Funscript'].includes(options.scriptFormat) && options.scriptTimeoutMs >= 100 && options.scriptTimeoutMs <= 180000,'Invalid vendor API options.');
  for (const item of [options.connectionKey,options.apiKey,options.authToken,options.deviceId]) requireConfiguration(item.length <= 4096 && !hasControlCharacters(item),'Invalid vendor identifier or credentials.');
  for (const item of [options.connectionKey,options.apiKey,options.authToken]) requireConfiguration(!/[^\x21-\x7e]/.test(item),'API credentials must use visible ASCII.');
  requireConfiguration(options.trustedClusterHost.length <= 253 && !/[:/@]/.test(options.trustedClusterHost),'Invalid exact vendor cluster hostname.');
  if (options.endpoint) {
    const url = new URL(options.endpoint); requireConfiguration(['http:','https:'].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash,'Invalid API endpoint.');
    requireConfiguration(url.protocol === 'https:' || isLocalHost(url.hostname),'Remote vendor API requires HTTPS.');
  }
  if (options.scriptUrl) { const url = new URL(options.scriptUrl); requireConfiguration(options.scriptUrl.length <= 8192 && ['http:','https:'].includes(url.protocol) && !url.username && !url.password,'Invalid script URL.'); }
}
export function isLocalHost(host: string): boolean {
  const value = host.toLowerCase().replace(/^\[|\]$/g,'');
  if (value === 'localhost' || value.endsWith('.local') || value === '::1' || value.startsWith('fe80:') || /^f[cd][0-9a-f]{2}:/.test(value)) return true;
  const parts = value.split('.').map(Number); return parts.length === 4 && parts.every(n => Number.isInteger(n) && n >= 0 && n <= 255)
    && (parts[0] === 127 || parts[0] === 10 || parts[0] === 192 && parts[1] === 168 || parts[0] === 172 && (parts[1] ?? 0) >= 16 && (parts[1] ?? 0) <= 31);
}
export function canonicalHost(host: string): string {
  const value = host.trim().toLowerCase(); if (value === 'localhost') return '127.0.0.1';
  try {
    const canonical = new URL(`http://${value.includes(':') && !value.startsWith('[') ? `[${value}]` : value}`).hostname;
    const mapped = /^\[::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})\]$/.exec(canonical);
    if (mapped) { const first=parseInt(mapped[1]??'',16),last=parseInt(mapped[2]??'',16);return [first>>8,first&255,last>>8,last&255].join('.'); }
    return canonical;
  } catch { return value; }
}
export function resolveAxisProfile(config: Model.AppConfig, id?: string | null): Model.AxisProfileConfig {
  const fallback = config.axisProfiles.find(profile => profile.isDefault) ?? config.axisProfiles[0];
  requireConfiguration(fallback,'Configuration has no axis profile.'); return config.axisProfiles.find(profile => profile.id.toLowerCase() === id?.toLowerCase()) ?? fallback;
}
function socketTarget(value:string):string {
  const url=new URL(value);return `${url.protocol}//${canonicalHost(url.hostname)}:${url.port||(url.protocol==='wss:'?443:80)}${url.pathname}${url.search}`;
}
function scopeOverlap(left:{name:string;index:number|null},right:{name:string;index:number|null}):boolean {
  if(left.index!==null&&right.index!==null)return left.index===right.index;
  return !left.name&&left.index===null || !right.name&&right.index===null || Boolean(left.name&&right.name&&left.name===right.name);
}
/** Endpoint sharing retains independent explicit device scopes. Names are case-sensitive. */
export function intifaceScopesOverlap(left:Model.OutputDeviceConfig,right:Model.OutputDeviceConfig):boolean {
  if(socketTarget(left.websocketAddress)!==socketTarget(right.websocketAddress))return false;
  return scopeOverlap({name:left.intifaceDeviceName??'',index:left.intifaceDeviceIndex??null},{name:right.intifaceDeviceName??'',index:right.intifaceDeviceIndex??null});
}
export function outputTargetKeys(output:Model.OutputDeviceConfig):string[] {
  if(output.type==='TCodeSerial'){const path=output.comPort.trim();return path?['serial:'+(/^com[0-9]+$/i.test(path)?path.toUpperCase():path)]:[];}
  if(output.type==='TCodeUdp'||output.type==='TCodeTcp')return [`${output.type}:${canonicalHost(output.host)}:${output.port}`];
  if(output.type==='TCodeWebSocket')return ['tcode-ws:'+socketTarget(output.websocketAddress)];
  if(output.type==='Intiface')return ['intiface:'+socketTarget(output.websocketAddress),...(output.manageEngineProcess?['intiface-engine:'+output.port]:[])];
  if(['Bluetooth','BleBridge'].includes(output.type)&&output.bridge?.device){const value=output.bridge.device;return ['ble:'+(/^(?:[a-f0-9]{2}:){5}[a-f0-9]{2}$|^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value)?value.toLowerCase():value)];}
  if(['Handy','Autoblow','VacuGlide','Lovense'].includes(output.type)){
    const identity=output.type==='Lovense'?output.device.deviceId:output.device.connectionKey;if(!identity)return [];
    const fallback=output.type==='Handy'?'https://www.handyfeeling.com/':output.type==='Lovense'?'https://127-0-0-1.lovense.club:30010/':'https://latency.autoblowapi.com/';
    const url=new URL(output.device.endpoint||fallback);return [`vendor:${output.type}:${url.protocol}:${canonicalHost(url.hostname)}:${url.port||(url.protocol==='https:'?443:80)}:${sha256(identity)}`];
  }
  return [];
}
export function outputTargetsOverlap(left:Model.OutputDeviceConfig,right:Model.OutputDeviceConfig):boolean {
  if(left.type==='Intiface'&&right.type==='Intiface'){
    if(socketTarget(left.websocketAddress)===socketTarget(right.websocketAddress))return intifaceScopesOverlap(left,right);
    return left.manageEngineProcess&&right.manageEngineProcess&&left.port===right.port;
  }
  const keys=new Set(outputTargetKeys(left));return outputTargetKeys(right).some(key=>keys.has(key));
}
export function normalizeConfiguration(rawValue: unknown, resetTransient = false): Model.AppConfig {
  const result = decode(rawValue,defaults.defaultAppConfig()); result.schemaVersion = 5;
  const ids = new Set<string>();
  result.axisProfiles = result.axisProfiles.map((value,index) => {
    const item = decode(value,defaults.defaultAxisProfileConfig()); item.id = unique(item.id,ids,`axis-profile-${index+1}`);
    item.name = clean(item.name,`轴配置 ${index+1}`); item.motion = normalizeMotionProfile(item.motion); return item;
  });
  if (!result.axisProfiles.length) result.axisProfiles.push({...defaults.defaultAxisProfileConfig(),isDefault:true});
  const defaultProfile = result.axisProfiles.find(profile => profile.isDefault) ?? result.axisProfiles[0]; requireConfiguration(defaultProfile,'Missing default profile.');
  for (const profile of result.axisProfiles) profile.isDefault = profile === defaultProfile;
  if (!result.axisProfiles.some(profile => profile.id.toLowerCase() === 'global-default')) defaultProfile.id = unique('global-default',ids,'axis-profile-default');
  result.signals = result.signals.map(normalizeSignal); result.computedSignals = normalizeComputedSignals(result.computedSignals);
  result.protocolInputs = validateProtocolInputs(result.protocolInputs.map(item => {
    const input = decode(item,defaultProtocolInput());
    const featureDefault = defaultProtocolInput().features[0];
    requireConfiguration(featureDefault,'Missing protocol feature schema.');
    input.features = input.features.map(feature => decode(feature,featureDefault));
    return input;
  }));
  result.osc.inputTimeoutMs = clamp(result.osc.inputTimeoutMs,0,600000); result.osc.receiverHost = clean(result.osc.receiverHost,'127.0.0.1'); result.osc.receiverPort = port(result.osc.receiverPort,9001);
  result.osc.oscQueryUrl = clean(result.osc.oscQueryUrl,'http://127.0.0.1:9001/'); result.osc.oscQueryPolling.rateHz = clamp(result.osc.oscQueryPolling.rateHz,1,30);
  result.osc.oscQueryReceiver.serviceName = clean(result.osc.oscQueryReceiver.serviceName,'Sensa'); result.osc.oscQueryReceiver.httpPort = port(result.osc.oscQueryReceiver.httpPort,9010);
  result.osc.preferredSourcePersistentId = result.osc.preferredSourcePersistentId.trim(); result.osc.ogbControl.host = clean(result.osc.ogbControl.host,'127.0.0.1'); result.osc.ogbControl.port = port(result.osc.ogbControl.port,9000);
  result.osc.hub.mode = choice(result.osc.hub.mode,['EventDriven','FixedRate'],'EventDriven'); result.osc.hub.fixedRateHz = clamp(result.osc.hub.fixedRateHz,1,240);
  result.osc.allowedSourceAddresses = [...new Set(result.osc.allowedSourceAddresses.map(item => {
    requireConfiguration(typeof item === 'string','Invalid OSC source address.');const value=clean(item);if(!value)return '';
    requireConfiguration(isIpAddress(value),'OSC source allow-list entries must be IP addresses.');
    const canonical=canonicalHost(value).replace(/^\[|\]$/g,'');
    requireConfiguration(canonical.includes(':') ? /^[0-9a-f:]+$/.test(canonical) : canonical.split('.').every(part=>Number(part)>=0&&Number(part)<=255),'Invalid OSC source address.');
    return canonical;
  }).filter(Boolean))].slice(0,32);
  const hubIds = new Set<string>(); result.osc.hub.targets = result.osc.hub.targets.map((item,index) => {
    const target = decode(item,defaults.defaultOscHubTargetConfig()); target.id = unique(target.id,hubIds,`osc-hub-target-${index+1}`); target.name = clean(target.name,`Hub 目标 ${index+1}`); target.host = clean(target.host,'127.0.0.1'); target.port = port(target.port,9002+index); return target;
  });
  result.webUi.host = clean(result.webUi.host,'127.0.0.1'); result.webUi.port = port(result.webUi.port,5086); result.webUi.title = clean(result.webUi.title,'Sensa WebUI');
  const outputs = new Set<string>(), ordinals = new Map<string,number>();
  requireConfiguration(result.outputs.length <= 64,'At most 64 outputs are supported.');
  result.outputs = result.outputs.map(value => {
    const item = decode(value,defaults.defaultOutputDeviceConfig()); item.type = choice(item.type,outputTypes);
    item.intifaceDeviceName = (item.intifaceDeviceName ?? '').trim();
    requireConfiguration(item.intifaceDeviceName.length <= 256 && !hasControlCharacters(item.intifaceDeviceName)
      && (item.intifaceDeviceIndex == null || Number.isInteger(item.intifaceDeviceIndex) && item.intifaceDeviceIndex >= 0 && item.intifaceDeviceIndex <= 0xffffffff), 'Invalid Intiface device scope.');
    if (['HttpJson','WebSocketJson','SensaHttp','SensaWebSocket'].includes(item.type) && object(value)['websocketaddress'] === undefined) item.websocketAddress = '';
    const rawBridge = object(value)['bridge'];
    if (rawBridge !== undefined && rawBridge !== null) {
      const bridge = object(rawBridge), protocol = bridge['protocol'];
      requireConfiguration(!Object.hasOwn(bridge,'python') && !Object.hasOwn(bridge,'scriptpath'), 'BLE interpreter and script paths are trusted host settings, not writable configuration.');
      requireConfiguration(typeof protocol === 'string' && ['loob','thrust-sync','svakom-v1','lovense-single','youou-vx001'].includes(protocol), 'Choose a supported BLE protocol.');
      const device = bridge['device'] ?? '';
      requireConfiguration(typeof device === 'string' && device.length <= 512 && !hasControlCharacters(device), 'Invalid BLE device identity.');
      item.bridge = { protocol: protocol as Model.BridgeProtocol, device };
      for (const key of ['adapter'] as const) {
        const option = bridge[key.toLowerCase()];
        if (option !== undefined) {
          requireConfiguration(typeof option === 'string' && option.length <= 4096 && !option.includes('\0'), 'Invalid BLE bridge option.');
          item.bridge[key] = option;
        }
      }
      if (bridge['listenport'] !== undefined) { const listenPort = bridge['listenport']; requireConfiguration(typeof listenPort === 'number' && Number.isInteger(listenPort) && listenPort >= 0 && listenPort <= 65535, 'Invalid BLE bridge port.'); item.bridge.listenPort = listenPort; }
    }
    const ordinal = (ordinals.get(item.type) ?? 0)+1; ordinals.set(item.type,ordinal);
    const prefix = ({TCodeSerial:'output-tcode-serial',TCodeUdp:'output-tcode-udp',TCodeTcp:'output-tcode-tcp',Intiface:'output-intiface'} as Partial<Record<Model.OutputDeviceType,string>>)[item.type] ?? 'output-device';
    const defaultName = ({TCodeSerial:'TCode 串口',TCodeUdp:'TCode UDP',TCodeTcp:'TCode TCP',Intiface:'Intiface'} as Partial<Record<Model.OutputDeviceType,string>>)[item.type] ?? '输出设备';
    item.id = unique(item.id,outputs,`${prefix}-${ordinal}`); item.name = clean(item.name,`${defaultName} ${ordinal}`);
    item.motionProfileId = resolveAxisProfile(result,item.motionProfileId).id; item.comPort = clean(item.comPort,'COM3'); item.host = clean(item.host,'127.0.0.1');
    item.port = port(item.port,({TCodeUdp:9999,TCodeTcp:9998,Intiface:12345,OscParameter:9000,Mqtt:1883} as Partial<Record<Model.OutputDeviceType,number>>)[item.type] ?? 0);
    item.speedUnitBase = choice(item.speedUnitBase,['Per100ms','PerSecond'],'Per100ms'); item.slopeMode = choice(item.slopeMode,['None','Speed','Interval','NoSlope'],'None');
    item.vibrationAxis = ['V1','V2','L0'].includes(item.vibrationAxis.trim().toUpperCase()) ? item.vibrationAxis.trim().toUpperCase() : 'V0';
    item.signal = normalizeSignalOutput(item.signal); item.intifaceFeatures = normalizeFeatureRoutes(item.intifaceFeatures);
    item.device = decode(item.device,defaults.defaultDeviceProtocolOptions()); if (['Handy','Autoblow','VacuGlide','Lovense'].includes(item.type)) validateDeviceOptions(item.device);
    return item;
  });
  const presetIds = new Set<string>(); result.oscMappingPresets = result.oscMappingPresets.map((value,index) => {
    const item = decode(value,defaults.defaultOscMappingPresetConfig()); item.id = unique(item.id,presetIds,`osc-preset-${index+1}`); item.name = clean(item.name,`OSC 预设 ${index+1}`); item.description = item.description.trim(); item.mappings = item.mappings.map(normalizeSignal).filter(mapping => mapping.oscPath); return item;
  });
  result.deviceRoutes = result.deviceRoutes.map(item => decode(item,defaults.defaultDeviceRouteEntry()));
  validateConfiguration(result); syncMirroredFields(result);
  if (resetTransient) resetTransientRuntimeState(result); return result;
}
export function resetTransientRuntimeState(config: Model.AppConfig): void {
  for (const output of config.outputs) output.enabled = false;
  config.tCode.enabled = config.udpTCode.enabled = config.tcpTCode.enabled = config.intiface.enabled = false;
}
export function configurationForPersistence(config: Model.AppConfig): Model.AppConfig {
  const result = normalizeConfiguration(config); resetTransientRuntimeState(result); return result;
}
export function createDefaultConfiguration(): Model.AppConfig { return normalizeConfiguration(defaults.defaultAppConfig(),true); }
function syncMirroredFields(config: Model.AppConfig): void {
  const profile = resolveAxisProfile(config).motion, axis = profile.l0;
  config.tCode.minPos = axis.min; config.tCode.maxPos = axis.max; config.tCode.maxVelocity = axis.maxSpeed; config.tCode.l0Invert = axis.invert;
  config.tCodeProfiles.global = structuredClone(profile);
  for (const [type,key] of [['TCodeSerial','serial'],['TCodeUdp','udp'],['TCodeTcp','tcp']] as const) {
    const output = config.outputs.find(candidate => candidate.type === type); const mirrored = structuredClone(resolveAxisProfile(config,output?.motionProfileId).motion);
    mirrored.useGlobal = !output || resolveAxisProfile(config,output.motionProfileId).isDefault; config.tCodeProfiles[key] = mirrored;
    if (type === 'TCodeSerial') { config.tCode.enabled = output?.enabled ?? false; if (output) {config.tCode.comPort = output.comPort;config.tCode.preferSpeedMode = mirrored.l0.commandMode === 'Speed';} }
    else { const target = type === 'TCodeUdp' ? config.udpTCode : config.tcpTCode; target.enabled = output?.enabled ?? false; if (output) { target.host=output.host; target.port=output.port; } }
  }
  const intiface = config.outputs.find(output => output.type === 'Intiface'); config.intiface.enabled = intiface?.enabled ?? false;
  if (intiface) Object.assign(config.intiface,{manageEngineProcess:intiface.manageEngineProcess,websocketAddress:intiface.websocketAddress,port:intiface.port,vibrationAxis:intiface.vibrationAxis,featureRoutes:intiface.intifaceFeatures});
}
export function validateConfiguration(config: Model.AppConfig): void {
  const computed = new Set(config.computedSignals.map(item => item.id)), occupied = new Set<string>();
  const intifaceScopes = new Map<string, { name: string; index: number | null }[]>();
  for (const mapping of [...config.signals,...config.oscMappingPresets.flatMap(item => item.mappings)]) requireConfiguration(mapping.sourceMode !== 'Computed' || computed.has(mapping.oscPath),'Mapping references an unknown computed signal.');
  const point = config.signals.filter(item => item.sourceMode === 'SensaPoint'), pose = config.signals.filter(item => item.sourceMode === 'SensaPose');
  requireConfiguration(!(point.length && pose.length) && new Set(point.map(item => item.oscPath)).size <= 1 && new Set(pose.map(item => item.oscPath)).size <= 1
    && ![...point,...pose].some(item => ['GateEnable','DepthOverride'].includes(item.role)),'Spatial mappings need one shared target and ordinary output roles.');
  const addTarget = (key: string): void => {requireConfiguration(!occupied.has(key),'Outputs duplicate a physical target.');occupied.add(key);};
  for (const output of config.outputs) {
    if (output.type === 'TCodeSerial') for(const key of outputTargetKeys(output))addTarget(key);
    if (['TCodeUdp','TCodeTcp'].includes(output.type)) addTarget(`${output.type}:${canonicalHost(output.host)}:${output.port}`);
    if (output.type === 'TCodeWebSocket') { const url = new URL(output.websocketAddress); requireConfiguration(['ws:','wss:'].includes(url.protocol) && !url.username && !url.password&&!url.hash,'Invalid TCode WebSocket URL.'); for(const key of outputTargetKeys(output))addTarget(key); }
    if (['SensaHttp','SensaWebSocket'].includes(output.type) && (output.enabled || output.websocketAddress)) { const url = new URL(output.websocketAddress); requireConfiguration((output.type === 'SensaHttp' ? ['http:','https:'] : ['ws:','wss:']).includes(url.protocol) && !url.username && !url.password && !url.hash,'Invalid Sensa connection URL.'); }
    if (['Bluetooth','BleBridge'].includes(output.type)) for(const key of outputTargetKeys(output))addTarget(key);
    if (output.type === 'Intiface') {
      const url = new URL(output.websocketAddress); requireConfiguration(['ws:','wss:'].includes(url.protocol) && !url.username && !url.password && !url.hash,'Invalid Intiface URL.');
      const key = `${url.protocol}//${canonicalHost(url.hostname)}:${url.port || (url.protocol === 'wss:' ? 443 : 80)}${url.pathname}${url.search}`;
      const scope = { name: output.intifaceDeviceName ?? '', index: output.intifaceDeviceIndex ?? null }, previous = intifaceScopes.get(key) ?? [];
      requireConfiguration(!previous.some(item => scopeOverlap(item,scope)), 'Outputs duplicate or overlap an Intiface device scope.');
      previous.push(scope); intifaceScopes.set(key,previous);
    }
    if (['Handy','Autoblow','VacuGlide','Lovense'].includes(output.type)) for(const key of outputTargetKeys(output))addTarget(key);
    if (!usesBindings(output)) continue;
    requireConfiguration(!output.enabled || output.signal.bindings.length > 0,'Enabled output needs a signal binding.');
    if (['HttpJson','WebSocketJson'].includes(output.type) && (output.enabled || output.websocketAddress)) { const url = new URL(output.websocketAddress); requireConfiguration((output.type === 'HttpJson' ? ['http:','https:'] : ['ws:','wss:']).includes(url.protocol) && !url.username && !url.password && !url.hash,'Invalid output URL.'); }
    if(['OscParameter','Mqtt'].includes(output.type)) {
      const host=output.type==='OscParameter'&&output.signal.vrChat?'127.0.0.1':output.host,actualPort=output.type==='OscParameter'&&output.signal.vrChat?9000:output.port;
      requireConfiguration(host.trim().length>0&&host.length<=253&&!/[\s/@?#]/.test(host)&&!hasControlCharacters(host)&&Number.isInteger(actualPort)&&actualPort>=1&&actualPort<=65535,'Choose a host and valid output port.');
      if(output.type==='Mqtt')encodeMqttConnect(output.signal.mqttClientId||'sensa-'+output.id);
    }
    const addresses = new Set<string>();
    for (const binding of output.signal.bindings) {
      requireConfiguration(binding.source.sourceMode !== 'Computed' || computed.has(binding.source.oscPath),'Output references an unknown computed signal.');
      requireConfiguration([binding.outputMin,binding.outputMax,binding.stopValue].every(value => Math.abs(value) <= 3.4028234663852886e38
        && (binding.valueType !== 'Int' || value >= -2147483648 && value <= 2147483647)),'Output range exceeds the selected value type.');
      if (!isProtocolOutput(output.type)) requireConfiguration(isMotionAxis(binding.address) && [binding.outputMin,binding.outputMax,binding.stopValue].every(value => value >= 0 && value <= 1),'Motion bindings need a supported axis and values from zero to one.');
      if (output.type === 'OscParameter') {
        requireConfiguration(/^\/[^\s*?[\]{}]{1,511}$/.test(binding.address),'OSC output needs a complete parameter address.');
        const host=output.signal.vrChat?'127.0.0.1':output.host,actualPort=output.signal.vrChat?9000:output.port;
        const local=isLoopbackHost(host);
        requireConfiguration(!(config.osc.enabled&&actualPort===config.osc.receiverPort&&(isAnyHost(config.osc.receiverHost)||canonicalHost(host)===canonicalHost(config.osc.receiverHost)||local&&isLoopbackHost(config.osc.receiverHost))), 'OSC output cannot target Sensa\'s own listener.');
        if(output.signal.vrChat||local&&actualPort===9000){const reads=binding.source.sourceMode==='Computed'?requiredInputLeaves(config.computedSignals,[binding.source.oscPath]):[binding.source];
          const canonical=(path:string):string=>path.replace(/^\//,'').replace(/^avatar\/parameters\//,'');
          requireConfiguration(!reads.some(input=>input.sourceMode==='Direct'&&matchesOscPath(canonical(input.oscPath),canonical(binding.address))), 'Choose a separate parameter to avoid direct OSC feedback.');}
      }
      if (output.type === 'Dglab') requireConfiguration(['Intensity','Pulse'].includes(binding.address),'DG-LAB bindings target Intensity or Pulse.');
      if (output.type === 'Recording') requireConfiguration(binding.address.length <= 80,'Recording ID is too long.');
      if(['Handy','Autoblow','VacuGlide','Lovense'].includes(output.type))requireConfiguration(binding.address===output.device.axis,'Vendor bindings must target the configured source axis.');
      if(output.type==='Intiface')requireConfiguration(binding.address==='L0'||binding.address===output.vibrationAxis||output.intifaceFeatures.some(route=>route.sourceAxis===binding.address||route.outputType==='Rotate'&&route.directionAxis===binding.address),'Choose an axis used by an advertised Intiface feature.');
      for(const value of [binding.outputMin,binding.outputMax,binding.stopValue]) {
        const scalar={address:binding.address,value,type:binding.valueType as 'Float'|'Int'|'Bool'};
        if(output.type==='Midi')encodeMidi(scalar);
        if(output.type==='OscParameter')encodeOsc(scalar);
        if(['HttpJson','WebSocketJson','Mqtt'].includes(output.type)){const payload=encodeJson({...scalar,address:output.type==='Mqtt'?output.signal.mqttTopicPrefix+binding.address:binding.address});if(output.type==='Mqtt')encodeMqttPublish(output.signal.mqttTopicPrefix+binding.address,payload);}
      }
      const address = (output.type === 'Recording' ? binding.address || binding.id : binding.address)+(output.type === 'Dglab' ? `:${binding.channel ?? output.signal.channel}` : '');
      requireConfiguration(!addresses.has(address),'Output bindings duplicate a destination.'); addresses.add(address);
    }
    if(output.type==='Dglab') {
      if(output.signal.serverUrl){const url=new URL(output.signal.serverUrl);requireConfiguration(['ws:','wss:'].includes(url.protocol)&&!url.username&&!url.password&&!url.hash,'Invalid DG-LAB server URL.');}
      for(const id of [output.signal.clientId,output.signal.slotId])requireConfiguration(!id||/^[A-Za-z0-9_-]{1,128}$/.test(id),'Invalid DG-LAB identifier.');
      if(output.signal.waveformFrames.length)dglabPulse({clientId:'validation',slotId:'validation',channel:0},output.signal.waveformFrames,output.signal.taskDurationMs,output.signal.waveformFrames[0]?.length===6?2:3);
    }
  }
  if (config.osc.oscQueryPolling.enabled) requireConfiguration(config.osc.oscQueryEnabled,'OSCQuery polling needs the OSCQuery client.');
  if (config.osc.oscQueryReceiver.enabled) requireConfiguration((config.osc.oscQueryReceiver.advertiseAvatar || config.osc.oscQueryReceiver.advertiseTracking)
    && config.osc.oscQueryReceiver.httpPort !== config.webUi.port,'OSCQuery receiver needs a namespace and its own port.');
  const hubTargets=new Set<string>();
  for(const target of config.osc.hub.targets){const key=canonicalHost(target.host)+':'+target.port;requireConfiguration(!hubTargets.has(key),'OSC hub targets duplicate a UDP destination.');hubTargets.add(key);
    requireConfiguration(!(config.osc.hub.enabled&&config.osc.enabled&&target.port===config.osc.receiverPort&&(isAnyHost(config.osc.receiverHost)||canonicalHost(target.host)===canonicalHost(config.osc.receiverHost)||isLoopbackHost(target.host)&&isLoopbackHost(config.osc.receiverHost))), 'OSC hub cannot forward into its own listener.');}
  if(config.osc.ogbControl.enabled){const host=canonicalHost(config.osc.ogbControl.host);requireConfiguration(isUnicastIp(host),'OGB control needs a unicast IP address.');
    requireConfiguration(!(config.osc.enabled&&config.osc.ogbControl.port===config.osc.receiverPort&&(isAnyHost(config.osc.receiverHost)||host===canonicalHost(config.osc.receiverHost)||isLoopbackHost(host)&&isLoopbackHost(config.osc.receiverHost))), 'OGB control cannot target Sensa\'s own listener.');}
}
function isAnyHost(host:string):boolean{return ['0.0.0.0','::','[::]','*','any'].includes(host.trim().toLowerCase());}
function isLoopbackHost(host:string):boolean {const value=canonicalHost(host).replace(/^\[|\]$/g,'');return value==='::1'||/^127(?:\.\d{1,3}){3}$/.test(value);}
function isUnicastIp(host:string):boolean {
  const value=host.replace(/^\[|\]$/g,'');
  if(value.includes(':'))return isIpAddress(value)&&value!=='::'&&!value.startsWith('ff');
  const parts=value.split('.').map(Number);return parts.length===4&&parts.every(n=>Number.isInteger(n)&&n>=0&&n<=255)&&parts[0]!==0&&(parts[0]??256)<224;
}
function isIpAddress(value:string):boolean {
  if(value.includes(':')){try{const host=new URL(`http://${value.startsWith('[')?value:'['+value+']'}`).hostname;return host.startsWith('[')&&host.endsWith(']');}catch{return false;}}
  return /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(value)&&value.split('.').every(part=>Number(part)<=255);
}

function hasControlCharacters(value:string):boolean {return [...value].some(character=>{const code=character.codePointAt(0)??0;return code<32||code===127;});}
