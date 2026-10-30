import { isAxis, normalized, tcodeFrame } from '../core/index.ts';
import type { Axis, Awaitable, NamedOutputTransport, SignalFrame } from '../core/index.ts';
import type { IntifaceFeatureRoute, MotionAxis } from '../core/runtime/model.ts';
import { isMotionAxis, neutralValues } from '../core/runtime/model.ts';
import { resolveFeatureRoute, resolveFeatureRouteValue } from '../core/outputs/intiface-routing.ts';
import { BLUETOOTH_PROFILES, createBluetoothTransport } from './device-codecs.ts';
import type { BluetoothAccess } from './device-codecs.ts';

export type OutputType = 'intiface' | 'serial' | 'tcode-ws' | 'json-ws' | 'http' | 'midi' | 'bluetooth';
export interface OutputConfig {
  type: OutputType;
  url?: string;
  axis?: Axis;
  name?: string;
  baudRate?: number;
  channel?: number;
  cc?: number;
  profile?: string;
  featureId?: string;
  mapDevice?: boolean;
  deviceId?: string;
  clockwise?: boolean;
  featureMappings?: readonly IntifaceFeatureRoute[];
  requireFeatureMappings?: boolean;
}
export interface SocketPort extends Pick<EventTarget, 'addEventListener' | 'removeEventListener'> {
  readonly readyState: number;
  readonly bufferedAmount: number;
  send(data: string): void;
  close(): void;
}
export interface SerialWriter {
  write(data: Uint8Array<ArrayBuffer>): Awaitable<void>;
  abort?(reason?: unknown): Awaitable<void>;
  releaseLock(): void;
}
export interface SerialPortPort {
  open(options: { baudRate: number }): Awaitable<void>;
  readonly writable: { getWriter(): SerialWriter } | null;
  close(): Awaitable<void>;
}
export interface MidiPortPort {
  readonly id: string;
  readonly name?: string | null;
  readonly state?: string;
  open(): Awaitable<unknown>;
  close(): Awaitable<unknown>;
  send(data: number[]): void;
}
export interface MidiAccessPort { readonly outputs: Pick<ReadonlyMap<string, MidiPortPort>, 'get' | 'values'> }
export interface NavigatorPorts {
  readonly bluetooth?: BluetoothAccess | undefined;
  readonly serial?: { requestPort(): PromiseLike<SerialPortPort> } | undefined;
  requestMIDIAccess?(options: { sysex: false }): PromiseLike<MidiAccessPort>;
}
export interface HttpReply {
  readonly ok: boolean;
  readonly status?: number;
  readonly body?: { cancel(): Awaitable<unknown> } | null;
}
interface SocketEntry { readonly kind: 'socket'; socket: SocketPort; refs: number; ready: Promise<void> }
interface IntifaceEntry { readonly kind: 'intiface'; peer: IntifacePeer; refs: number; ready: Promise<void> }
export interface TransportDependencies {
  WebSocket?: new (url: string) => SocketPort;
  pool?: Map<string, SocketEntry | IntifaceEntry>;
  timeoutMs?: number;
  navigator?: NavigatorPorts;
  fetch?: (url: string, options: RequestInit) => PromiseLike<HttpReply>;
}
/** The shared TCode encoder supplies already encoded text for every host. */
export interface EncodedOutputTransport extends NamedOutputTransport {
  sendText?(text: string): Promise<void>;
  readonly connected?: boolean;
}
export type IntifaceCommand = 'LinearCmd' | 'ScalarCmd' | 'RotateCmd';
interface FeatureDescriptor { ActuatorType?: string; FeatureDescriptor?: string }
interface DeviceMetadata { DeviceIndex: number; DeviceName: string; DeviceMessages: Partial<Record<IntifaceCommand, FeatureDescriptor[]>> }
export interface IntifaceFeature {
  id: string;
  deviceIndex: number;
  command: IntifaceCommand;
  index: number;
  axis: Axis;
  actuator?: string;
  name: string;
  deviceName: string;
}
export interface IntifaceDiscovery {
  readonly connected: boolean;
  features: IntifaceFeature[];
  subscribeFeatures(listener: (features: IntifaceFeature[]) => void): () => void;
  setScanning(enabled: boolean): Promise<void>;
  close(): void;
}
export interface MidiOutputDescription { id: string; name: string }
interface Reply { type: string; body: Record<string, unknown> }
interface PendingReply { resolve(reply: Reply): void; reject(error: unknown): void; timer: ReturnType<typeof setTimeout> }
interface PendingJson { resolve(): void; reject(error: unknown): void; timer: ReturnType<typeof setTimeout> }
interface LinearVector { Index: number; Position: number; Duration: number }
interface ScalarVector { Index: number; Scalar: number; ActuatorType?: string }
interface RotationVector { Index: number; Speed: number; Clockwise: boolean }
type CommandBody = { DeviceIndex: number; Vectors?: LinearVector[]; Scalars?: ScalarVector[]; Rotations?: RotationVector[] };
export interface IntifaceTransport extends NamedOutputTransport {
  readonly connected: boolean;
  readonly feature: IntifaceFeature;
  readonly mappings: readonly (IntifaceFeature & { sourceAxis: MotionAxis; invert?: boolean; directionAxis?: MotionAxis; clockwise?: boolean })[];
  readonly socket: SocketPort;
}

const socketPool = new Map<string, SocketEntry | IntifaceEntry>();
const intifacePool = new Map<string, SocketEntry | IntifaceEntry>();
const midiOwners = new Map<string, Set<string>>();
const serialOwners = new Map<SerialPortPort, symbol>();
const httpOwners = new Set<string>();
const MAX_BUFFER = 1048576;
function object(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('Expected a protocol object.');
  return value as Record<string, unknown>;
}
function list(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error('Expected a protocol list.');
  return value;
}
function deviceMetadata(value: unknown): DeviceMetadata {
  const device = object(value);
  if (typeof device.DeviceIndex !== 'number' || !Number.isSafeInteger(device.DeviceIndex) || device.DeviceIndex < 0
    || typeof device.DeviceName !== 'string') throw new Error('Invalid Buttplug device identity.');
  const rawMessages = object(device.DeviceMessages), messages: DeviceMetadata['DeviceMessages'] = {};
  for (const command of ['LinearCmd', 'ScalarCmd', 'RotateCmd'] as const) {
    if (rawMessages[command] === undefined) continue;
    messages[command] = list(rawMessages[command]).map(raw => {
      const item = object(raw), result: FeatureDescriptor = {};
      if (item.ActuatorType !== undefined) {
        if (typeof item.ActuatorType !== 'string') throw new Error('Invalid actuator type.');
        result.ActuatorType = item.ActuatorType;
      }
      if (command === 'ScalarCmd' && result.ActuatorType === undefined) throw new Error('A scalar feature needs its actuator type.');
      if (item.FeatureDescriptor !== undefined) {
        if (typeof item.FeatureDescriptor !== 'string') throw new Error('Invalid feature name.');
        result.FeatureDescriptor = item.FeatureDescriptor;
      }
      return result;
    });
  }
  return { DeviceIndex: device.DeviceIndex, DeviceName: device.DeviceName, DeviceMessages: messages };
}
function requiredUrl(config: Pick<OutputConfig, 'url'>): string {
  if (!config.url) throw new Error('Choose an endpoint URL.');
  return config.url;
}
export function endpointUrl(value: string, protocols: readonly string[]): string {
  const url = new URL(value);
  if (!protocols.includes(url.protocol) || url.username || url.password || url.hash) throw new Error('Choose a valid endpoint URL.');
  return url.href;
}
function withDeadline<T>(operation: Awaitable<T>, timeoutMs: number, onTimeout?: () => void, onLate?: (value: T) => void): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined, expired = false;
  const task = Promise.resolve(operation);
  task.then(value => { if (expired) onLate?.(value); }, () => {}).catch(() => {});
  return Promise.race([task, new Promise<never>((_, reject) => {
    timer = setTimeout(() => { expired = true; try { onTimeout?.(); } catch { /* Preserve deadline failure. */ } reject(new Error('Device write timed out.')); }, timeoutMs);
  })]).finally(() => clearTimeout(timer));
}
export function signalPacket(frame: SignalFrame) {
  return { type: 'signal' as const, ...frame, commands: Object.entries(frame.values).map(([channel, value]) => ({ channel, value: normalized(value), durationMs: frame.durationMs || 0 })) };
}
function jsonSocketPeer(socket: SocketPort, timeoutMs: number) {
  const pending: PendingJson[] = [];
  const failed = (error: unknown) => { for (const item of pending.splice(0)) { clearTimeout(item.timer); item.reject(error); } };
  const message = (event: Event) => {
    const item = pending.shift();
    if (!item) return;
    clearTimeout(item.timer);
    try {
      if (!('data' in event) || typeof event.data !== 'string' || event.data.length > 65536) throw new Error('Invalid JSON acknowledgement.');
      const decoded: unknown = JSON.parse(event.data), reply = object(decoded);
      if (reply.ok !== true) {
        const error = reply.error;
        const details = typeof error === 'object' && error !== null && 'message' in error ? error.message : error;
        throw new Error(typeof details === 'string' ? details : 'The endpoint rejected this command.');
      }
      item.resolve();
    } catch (error) { item.reject(error); failed(error); socket.close(); }
  };
  const closed = () => failed(new Error('JSON WebSocket disconnected.'));
  socket.addEventListener('message', message); socket.addEventListener('close', closed);
  return {
    request(body: object): Promise<void> {
      return new Promise<void>((resolve, reject) => {
        const item: PendingJson = { resolve, reject, timer: setTimeout(() => { const error = new Error('JSON acknowledgement timed out.'); failed(error); socket.close(); }, timeoutMs) };
        pending.push(item);
        try { sendSocket(socket, JSON.stringify(body)); } catch (error) { pending.splice(pending.indexOf(item), 1); clearTimeout(item.timer); reject(error); }
      });
    },
    interrupt() { if (pending.length && socket.readyState === 1) { void this.request({ command: 'stop', type: 'stop' }).catch(() => {}); } },
    close() { socket.removeEventListener('message', message); socket.removeEventListener('close', closed); failed(new Error('JSON output closed.')); },
  };
}
function socketReady(socket: SocketPort, timeoutMs = 5000): Promise<void> {
  if (socket.readyState === 1) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const done = (error?: Error) => {
      clearTimeout(timer);
      socket.removeEventListener('open', opened); socket.removeEventListener('close', closed); socket.removeEventListener('error', failed);
      if (error) { socket.close(); reject(error); } else resolve();
    };
    const opened = () => done(), closed = () => done(new Error('WebSocket closed before connecting.'));
    const failed = () => done(new Error('Unable to connect to the WebSocket endpoint.'));
    socket.addEventListener('open', opened); socket.addEventListener('close', closed); socket.addEventListener('error', failed);
    timer = setTimeout(() => done(new Error('WebSocket connection timed out.')), timeoutMs);
  });
}
function sendSocket(socket: SocketPort, value: string): void {
  if (socket.readyState !== 1) throw new Error('WebSocket disconnected.');
  if (socket.bufferedAmount > MAX_BUFFER) throw new Error('The endpoint is not reading commands.');
  socket.send(value);
}
interface SocketOptions extends TransportDependencies { protocol?: string; exclusive?: boolean }
async function pooledSocket(url: string, options: SocketOptions = {}) {
  const { WebSocket: Socket = globalThis.WebSocket, pool = socketPool, timeoutMs = 5000, protocol = 'raw', exclusive = false } = options;
  const endpoint = endpointUrl(url, ['ws:', 'wss:']), key = protocol + ':' + endpoint;
  const current = pool.get(key);
  let entry = current?.kind === 'socket' ? current : undefined;
  if (!entry || entry.socket.readyState > 1) {
    const socket = new Socket(endpoint);
    entry = { kind: 'socket', socket, refs: 0, ready: socketReady(socket, timeoutMs) };
    pool.set(key, entry);
    const selected = entry;
    socket.addEventListener('close', () => { if (pool.get(key) === selected) pool.delete(key); });
  }
  if (exclusive && entry.refs > 0) throw new Error('This endpoint already has an output. Use a different endpoint path for another target.');
  const selected = entry;
  selected.refs++;
  try { await selected.ready; }
  catch (error) { selected.refs--; if (pool.get(key) === selected) pool.delete(key); throw error; }
  let released = false;
  return { socket: selected.socket, release() {
    if (released) return; released = true;
    if (--selected.refs === 0) { if (pool.get(key) === selected) pool.delete(key); selected.socket.close(); }
  } };
}

class IntifacePeer {
  readonly socket: SocketPort;
  readonly timeoutMs: number;
  id = 0;
  readonly requests = new Map<number, PendingReply>();
  devices = new Map<number, DeviceMetadata>();
  readonly owners = new Set<number>();
  readonly featureListeners = new Set<(features: IntifaceFeature[]) => void>();
  readonly message: (event: Event) => void;
  readonly closed: () => void;
  ping: ReturnType<typeof setInterval> | undefined;
  constructor(socket: SocketPort, { timeoutMs = 5000 }: Pick<TransportDependencies, 'timeoutMs'> = {}) {
    this.socket = socket; this.timeoutMs = timeoutMs;
    this.message = (event: Event) => {
      try {
        if (!('data' in event) || typeof event.data !== 'string' || event.data.length > MAX_BUFFER) throw new Error('Invalid Buttplug message.');
        const decoded: unknown = JSON.parse(event.data), batch = list(decoded);
        if (batch.length > 1024) throw new Error('Invalid Buttplug batch.');
        for (const rawMessage of batch) {
          const entries = Object.entries(object(rawMessage));
          if (entries.length !== 1) throw new Error('Invalid Buttplug command.');
          const entry = entries[0];
          if (!entry) throw new Error('Invalid Buttplug command.');
          const [type, rawBody] = entry, body = object(rawBody);
          if (type === 'DeviceAdded') { const device = deviceMetadata(body); this.devices.set(device.DeviceIndex, device); }
          if (type === 'DeviceRemoved') {
            if (typeof body.DeviceIndex !== 'number' || !Number.isSafeInteger(body.DeviceIndex)) throw new Error('Invalid removed device.');
            this.devices.delete(body.DeviceIndex);
          }
          if (type === 'DeviceList') this.devices = new Map(list(body.Devices).map(value => { const device = deviceMetadata(value); return [device.DeviceIndex, device]; }));
          if (['DeviceAdded', 'DeviceRemoved', 'DeviceList'].includes(type)) this.notifyFeatures();
          const request = typeof body.Id === 'number' ? this.requests.get(body.Id) : undefined;
          if (request) {
            if (typeof body.Id === 'number') this.requests.delete(body.Id);
            clearTimeout(request.timer);
            if (type === 'Error') request.reject(new Error(typeof body.ErrorMessage === 'string' ? body.ErrorMessage : 'Buttplug rejected the command.'));
            else request.resolve({ type, body });
          }
        }
      } catch (error) { this.fail(error); this.socket.close(); }
    };
    this.closed = () => this.fail(new Error('Buttplug disconnected.'));
    socket.addEventListener('message', this.message); socket.addEventListener('close', this.closed);
  }
  request(type: string, body: object = {}, signal?: AbortSignal): Promise<Reply> {
    const id = ++this.id;
    if (signal?.aborted) return Promise.reject(new DOMException('Command interrupted.', 'AbortError'));
    return new Promise<Reply>((resolve, reject) => {
      const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', aborted); this.requests.delete(id); };
      const aborted = () => { cleanup(); reject(new DOMException('Command interrupted.', 'AbortError')); };
      const timer = setTimeout(() => { cleanup(); reject(new Error('Buttplug response timed out.')); }, this.timeoutMs);
      this.requests.set(id, { resolve: value => { cleanup(); resolve(value); }, reject: error => { cleanup(); reject(error); }, timer });
      signal?.addEventListener('abort', aborted, { once: true });
      try { sendSocket(this.socket, JSON.stringify([{ [type]: { Id: id, ...body } }])); }
      catch (error) { cleanup(); reject(error); }
    });
  }
  async initialize(): Promise<void> {
    const info = await this.request('RequestServerInfo', { ClientName: 'WebSensa', MessageVersion: 3 });
    if (info.type !== 'ServerInfo' || info.body.MessageVersion !== 3) throw new Error('This endpoint needs Buttplug v3 support.');
    const maxPing = info.body.MaxPingTime;
    if (typeof maxPing === 'number' && Number.isFinite(maxPing) && maxPing > 0) {
      this.ping = setInterval(() => { void this.request('Ping').catch(error => { this.fail(error); this.socket.close(); }); }, Math.max(20, Math.floor(maxPing / 2)));
    }
    const devices = await this.request('RequestDeviceList');
    if (devices.type !== 'DeviceList') throw new Error('The endpoint did not return a device list.');
  }
  async refresh(): Promise<IntifaceFeature[]> {
    await this.request('StartScanning');
    const result = await this.request('RequestDeviceList');
    if (result.type !== 'DeviceList') throw new Error('The endpoint did not return a device list.');
    return this.features();
  }
  notifyFeatures(): void { for (const listener of this.featureListeners) { try { listener(this.features()); } catch { /* Observers do not own the connection. */ } } }
  subscribeFeatures(listener: (features: IntifaceFeature[]) => void): () => void { this.featureListeners.add(listener); listener(this.features()); return () => { this.featureListeners.delete(listener); }; }
  features(): IntifaceFeature[] {
    const results: IntifaceFeature[] = [], linear: Axis[] = ['L0', 'L1', 'L2'], rotation: Axis[] = ['R0', 'R1', 'R2'];
    for (const device of this.devices.values()) {
      for (const command of ['LinearCmd', 'ScalarCmd', 'RotateCmd'] as const) {
        const features = device.DeviceMessages[command];
        if (!features) continue;
        for (const [index, descriptor] of features.entries()) {
          results.push({ id: `${device.DeviceIndex}:${command}:${index}`, deviceIndex: device.DeviceIndex, command, index,
            axis: command === 'LinearCmd' ? linear[Math.min(index, 2)] ?? 'L0' : command === 'RotateCmd' ? rotation[Math.min(index, 2)] ?? 'R0' : 'V0',
            ...(descriptor.ActuatorType === undefined ? {} : { actuator: descriptor.ActuatorType }),
            deviceName: device.DeviceName, name: `${device.DeviceName} · ${descriptor.FeatureDescriptor || descriptor.ActuatorType || command} ${index}` });
        }
      }
    }
    return results;
  }
  fail(error: unknown): void { clearInterval(this.ping); for (const request of this.requests.values()) { clearTimeout(request.timer); request.reject(error); } this.requests.clear(); }
  close(): void { this.fail(new Error('Buttplug connection closed.')); this.socket.removeEventListener('message', this.message); this.socket.removeEventListener('close', this.closed); this.socket.close(); }
}
async function acquireIntiface(url: string, dependencies: TransportDependencies = {}) {
  const { WebSocket: Socket = globalThis.WebSocket, pool = intifacePool, timeoutMs = 5000 } = dependencies;
  const key = endpointUrl(url, ['ws:', 'wss:']), current = pool.get(key);
  let entry = current?.kind === 'intiface' ? current : undefined;
  if (!entry || entry.peer.socket.readyState > 1) {
    const socket = new Socket(key), peer = new IntifacePeer(socket, { timeoutMs });
    entry = { kind: 'intiface', peer, refs: 0, ready: socketReady(socket, timeoutMs).then(() => peer.initialize()) };
    pool.set(key, entry);
    const selected = entry;
    socket.addEventListener('close', () => { if (pool.get(key) === selected) pool.delete(key); });
  }
  const selected = entry;
  selected.refs++;
  try { await selected.ready; }
  catch (error) { if (--selected.refs === 0) selected.peer.close(); if (pool.get(key) === selected) pool.delete(key); throw error; }
  let released = false;
  return { peer: selected.peer, release() { if (released) return; released = true; if (--selected.refs === 0) { if (pool.get(key) === selected) pool.delete(key); selected.peer.close(); } } };
}
export async function discoverIntiface(url: string, dependencies?: TransportDependencies): Promise<IntifaceDiscovery> {
  const lease = await acquireIntiface(url, dependencies);
  try {
    const features = await lease.peer.refresh(), subscriptions = new Set<() => void>(); let closed = false;
    return { features, get connected() { return !closed && lease.peer.socket.readyState === 1; }, subscribeFeatures(listener) { const unsubscribe = lease.peer.subscribeFeatures(listener); subscriptions.add(unsubscribe); return () => { unsubscribe(); subscriptions.delete(unsubscribe); }; },
      async setScanning(enabled) { const result = await lease.peer.request(enabled ? 'StartScanning' : 'StopScanning'); if (result.type !== 'Ok') throw new Error('Buttplug did not acknowledge scanning.'); },
      close() { if (closed) return; closed = true; for (const unsubscribe of subscriptions) unsubscribe(); subscriptions.clear(); void lease.peer.request('StopScanning').catch(() => {}); lease.release(); } };
  }
  catch (error) { lease.release(); throw error; }
}
export async function createIntifaceTransport(config: Pick<OutputConfig, 'url' | 'axis' | 'featureId' | 'mapDevice' | 'clockwise' | 'featureMappings' | 'requireFeatureMappings'>, dependencies?: TransportDependencies): Promise<IntifaceTransport> {
  const lease = await acquireIntiface(requiredUrl(config), dependencies);
  const features = lease.peer.features(), feature = config.featureId ? features.find(item => item.id === config.featureId) : features[0];
  if (!feature) { lease.release(); throw new Error('Scan and choose an available device feature.'); }
  const axis = config.axis || feature.axis;
  if (!isAxis(axis)) { lease.release(); throw new Error('Choose a source axis.'); }
  if (lease.peer.owners.has(feature.deviceIndex)) { lease.release(); throw new Error('This Intiface device already has an output. Use its existing feature mappings.'); }
  lease.peer.owners.add(feature.deviceIndex);
  const matchingRoute = (item: IntifaceFeature) => {
    const routes = config.featureMappings ?? [];
    return item.command === 'LinearCmd'
      ? resolveFeatureRoute(routes, item.deviceName, item.index, 'HwPositionWithDuration') ?? resolveFeatureRoute(routes, item.deviceName, item.index, 'Position')
      : resolveFeatureRoute(routes, item.deviceName, item.index, item.command === 'RotateCmd' ? 'Rotate' : item.actuator ?? 'Vibrate');
  };
  const mappings: (IntifaceFeature & { sourceAxis: MotionAxis; invert?: boolean; directionAxis?: MotionAxis; clockwise?: boolean })[] = config.mapDevice ? features.filter(item => item.deviceIndex === feature.deviceIndex
    && (item.command === 'ScalarCmd' || item.index < 3 || matchingRoute(item))
    && (!config.requireFeatureMappings || matchingRoute(item))).map(item => {
      const route = matchingRoute(item);
      return { ...item, sourceAxis: route && isMotionAxis(route.sourceAxis) ? route.sourceAxis : item.axis,
        ...(route ? { invert: route.invert, clockwise: route.clockwise, ...(isMotionAxis(route.directionAxis) ? { directionAxis: route.directionAxis } : {}) } : {}) };
    })
    : [{ ...feature, sourceAxis: axis }];
  let closed = false, sending: AbortController | undefined;
  const lastValues = neutralValues();
  return { interrupt() { sending?.abort(); }, name: config.mapDevice ? feature.deviceName : feature.name, feature, mappings, socket: lease.peer.socket,
    get connected() { return !closed && lease.peer.socket.readyState === 1; },
    async send(frame) {
      if (closed) throw new Error('The output is disconnected.');
      const abort = new AbortController(); sending = abort;
      const commands = new Map<IntifaceCommand, CommandBody>();
      const activeAxes: MotionAxis[] = [];
      for (const [frameAxis, value] of Object.entries(frame.values)) {
        if (!isMotionAxis(frameAxis) || value === undefined) continue;
        lastValues[frameAxis] = normalized(value); activeAxes.push(frameAxis);
      }
      for (const mapping of mappings) {
        const route: IntifaceFeatureRoute = { deviceName: mapping.deviceName, featureIndex: mapping.index, outputType: mapping.command,
          sourceAxis: mapping.sourceAxis, directionAxis: mapping.directionAxis ?? '', invert: mapping.invert ?? false,
          clockwise: mapping.clockwise ?? config.clockwise !== false };
        const resolved = resolveFeatureRouteValue(route, { values: lastValues, deltaMs: frame.durationMs, activeAxes });
        if (!resolved.active) continue;
        const value = resolved.value;
        let body = commands.get(mapping.command);
        if (!body) { body = { DeviceIndex: feature.deviceIndex }; commands.set(mapping.command, body); }
        if (mapping.command === 'LinearCmd') (body.Vectors ||= []).push({ Index: mapping.index, Position: value, Duration: frame.durationMs || 0 });
        else if (mapping.command === 'ScalarCmd') (body.Scalars ||= []).push({ Index: mapping.index, Scalar: value, ...(mapping.actuator === undefined ? {} : { ActuatorType: mapping.actuator }) });
        else (body.Rotations ||= []).push({ Index: mapping.index, Speed: value, Clockwise: resolved.clockwise });
      }
      try { for (const [command, body] of commands) {
        const result = await lease.peer.request(command, body, abort.signal);
        if (result.type !== 'Ok') throw new Error('Buttplug did not acknowledge the command.');
      } } finally { if (sending === abort) sending = undefined; }
    },
    async stop() { if (!closed && lease.peer.socket.readyState === 1) await lease.peer.request('StopDeviceCmd', { DeviceIndex: feature.deviceIndex }); },
    async close() { if (!closed) { closed = true; lease.peer.owners.delete(feature.deviceIndex); lease.release(); } },
  };
}

export async function createOutputTransport(config: OutputConfig, dependencies: TransportDependencies = {}): Promise<EncodedOutputTransport> {
  const nav: NavigatorPorts = dependencies.navigator || globalThis.navigator || {};
  if (config.type === 'intiface') return createIntifaceTransport(config, dependencies);
  if (config.type === 'bluetooth') {
    const profile = BLUETOOTH_PROFILES.find(item => item.id === config.profile);
    if (!profile) throw new Error('Choose a Bluetooth profile.');
    const transport = await createBluetoothTransport(profile.id, nav.bluetooth ? { bluetooth: nav.bluetooth } : {});
    const sourceAxis = config.axis || profile.axis;
    return { ...transport, get connected() { return transport.connected; }, send: frame => {
      const value = frame.values[sourceAxis];
      return value === undefined ? Promise.resolve() : transport.send({ ...frame, values: { [profile.axis]: value } });
    } };
  }
  if (config.type === 'serial') {
    if (!nav.serial) throw new Error('Web Serial is available in supported Chromium browsers.');
    const baudRate = Number(config.baudRate ?? 115200);
    if (!Number.isInteger(baudRate) || baudRate < 300 || baudRate > 3000000) throw new Error('Choose a valid serial baud rate.');
    const port = await nav.serial.requestPort();
    if (serialOwners.has(port)) throw new Error('This serial port already has an output.');
    const owner = Symbol('serial owner'); serialOwners.set(port, owner);
    const owns = () => serialOwners.get(port) === owner;
    const release = () => { if (owns()) serialOwners.delete(port); };
    let writer: SerialWriter | undefined, nativeOpen: Promise<void> | undefined, opening = true, abandoned = false;
    const timeoutMs = dependencies.timeoutMs ?? 5000;
    const abandon = () => { try { Promise.resolve(writer?.abort?.(new Error('Device write timed out.'))).catch(() => {}); } catch { /* Closed writer. */ } };
    try {
      nativeOpen = Promise.resolve(port.open({ baudRate }));
      nativeOpen.then(() => { opening = false; }, () => { opening = false; if (abandoned) release(); });
      await withDeadline(nativeOpen, timeoutMs, undefined, () => {
        if (owns()) void withDeadline(Promise.resolve().then(() => port.close()), timeoutMs).catch(() => {}).finally(release);
      });
      if (!port.writable) throw new Error('The serial port is not writable.');
      writer = port.writable.getWriter();
    } catch (error) {
      if (!nativeOpen) opening = false;
      if (opening) abandoned = true;
      if (!opening) { try { if (owns()) await withDeadline(port.close(), timeoutMs); } catch { /* Port may not have opened. */ } finally { release(); } }
      throw error;
    }
    const selectedWriter = writer;
    let closed = false;
    const write = (bytes: string) => withDeadline(selectedWriter.write(new TextEncoder().encode(bytes)), timeoutMs, abandon);
    return { name: 'TCode serial', get connected() { return !closed && port.writable !== null; }, async sendText(text) { if (closed) throw new Error('Serial disconnected.'); await write(text); },
      async send(frame) { if (closed) throw new Error('Serial disconnected.'); await write(tcodeFrame(frame.values, frame.durationMs)); },
      async stop() { if (!closed) await write('DSTOP\n'); },
      async close() { if (!closed) { closed = true; try { selectedWriter.releaseLock(); } catch { abandon(); } try { await withDeadline(port.close(), timeoutMs, abandon); } finally { release(); } } } };
  }
  if (config.type === 'midi') {
    if (!nav.requestMIDIAccess) throw new Error('This browser does not provide Web MIDI.');
    const access = await nav.requestMIDIAccess({ sysex: false }), available = [...access.outputs.values()];
    const output = config.deviceId ? access.outputs.get(config.deviceId) : available.length === 1 ? available[0] : null;
    if (!output) throw new Error(available.length ? 'Choose a MIDI output.' : 'No MIDI output is available.');
    const channel = Number(config.channel ?? 1), cc = Number(config.cc ?? 1), axis = config.axis || 'L0';
    if (!Number.isInteger(channel) || channel < 1 || channel > 16 || !Number.isInteger(cc) || cc < 0 || cc > 127) throw new Error('Choose MIDI channel 1–16 and CC 0–127.');
    const owners = midiOwners.get(output.id) || new Set<string>(), key = channel + ':' + cc;
    if (owners.has(key)) throw new Error('This MIDI channel and CC already have an output.');
    owners.add(key); midiOwners.set(output.id, owners);
    try { await output.open(); } catch (error) { owners.delete(key); if (!owners.size) midiOwners.delete(output.id); throw error; }
    let closed = false;
    return { name: output.name || 'MIDI CC', get connected() { return !closed && output.state !== 'disconnected'; }, async send(frame) { if (closed) throw new Error('MIDI disconnected.'); const value = frame.values[axis]; if (value !== undefined) output.send([0xb0 + channel - 1, cc, Math.round(normalized(value) * 127)]); },
      async stop() { if (!closed) output.send([0xb0 + channel - 1, cc, 0]); },
      async close() { if (!closed) { closed = true; owners.delete(key); if (!owners.size) { midiOwners.delete(output.id); await output.close(); } } } };
  }
  if (config.type === 'http') {
    const url = endpointUrl(requiredUrl(config), ['http:', 'https:']);
    if (httpOwners.has(url)) throw new Error('This HTTP endpoint already has an output.');
    httpOwners.add(url);
    let closed = false, sending: AbortController | undefined;
    const session = 'websensa-' + (globalThis.crypto?.randomUUID?.() || Date.now().toString(36) + '-' + Math.random().toString(36).slice(2));
    const send = async (body: object, isFrame = false): Promise<void> => {
      if (closed) throw new Error('HTTP output disconnected.');
      const abort = new AbortController(), timer = setTimeout(() => abort.abort(), 5000);
      if (isFrame) sending = abort;
      try { const response = await (dependencies.fetch || globalThis.fetch)(url, { method: 'POST', credentials: 'omit', redirect: 'error', headers: { 'Content-Type': 'application/json', 'X-Sensa-Session': session }, body: JSON.stringify(body), signal: abort.signal });
        if (!response.ok) throw new Error('HTTP output returned status ' + response.status);
        await response.body?.cancel(); }
      finally { clearTimeout(timer); if (sending === abort) sending = undefined; }
    };
    return { name: 'JSON HTTP', get connected() { return !closed; }, send: frame => send(signalPacket(frame), true), stop: () => closed ? Promise.resolve() : send({ command: 'stop', type: 'stop' }),
      async close() { if (!closed) { closed = true; sending?.abort(); httpOwners.delete(url); } } };
  }
  if (!['tcode-ws', 'json-ws'].includes(config.type)) throw new Error('Choose an output type.');
  const lease = await pooledSocket(requiredUrl(config), { ...dependencies, protocol: config.type, exclusive: true });
  const peer = config.type === 'json-ws' ? jsonSocketPeer(lease.socket, dependencies.timeoutMs ?? 5000) : null;
  let closed = false;
  return { name: config.type === 'tcode-ws' ? 'TCode WebSocket' : 'JSON WebSocket', socket: lease.socket,
    get connected() { return !closed && lease.socket.readyState === 1; },
    ...(config.type === 'tcode-ws' ? { async sendText(text: string) { if (closed) throw new Error('The output is disconnected.'); sendSocket(lease.socket, text); } } : {}),
    interrupt() { peer?.interrupt(); },
    async send(frame) { if (closed) throw new Error('The output is disconnected.');
      if (peer) await peer.request(signalPacket(frame)); else sendSocket(lease.socket, tcodeFrame(frame.values, frame.durationMs)); },
    async stop() { if (!closed && lease.socket.readyState === 1) { if (peer) await peer.request({ command: 'stop', type: 'stop' }); else sendSocket(lease.socket, 'DSTOP\n'); } },
    async close() { if (!closed) { closed = true; peer?.close(); lease.release(); } },
  };
}
export async function discoverMidi({ navigator: nav = globalThis.navigator }: Pick<TransportDependencies, 'navigator'> = {}): Promise<MidiOutputDescription[]> {
  if (!nav?.requestMIDIAccess) throw new Error('This browser does not provide Web MIDI.');
  const access = await nav.requestMIDIAccess({ sysex: false });
  return [...access.outputs.values()].map(output => ({ id: output.id, name: output.name || output.id }));
}
