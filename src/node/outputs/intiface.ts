import { SerializedAdapter } from './adapters.ts';
import { resolveFeatureRoute, overridesDefaultFeature, resolveFeatureRouteValue, defaultIntifaceFeatureRoute } from '../../core/outputs/intiface-routing.ts';
import { startInstalledEngine } from './engine.ts';
import { delay } from '../../core/outputs/lifecycle.ts';
import type { BridgeProcess } from '../../core/outputs/types.ts';
import { nodeSocketFactory } from './transports.ts';
import type { OutputDependencies, OutputDeviceConfig, RuntimeMotionFrame, SignalOutputValue, SocketChannel } from '../../core/outputs/types.ts';
import type { MotionAxis } from '../../core/runtime/model.ts';
import { optionalRecord, record } from '../../core/outputs/types.ts';
import { durationFor, roundAway } from '../../core/outputs/codecs.ts';

interface Pending { resolve(value: Record<string, unknown>): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }
interface FeatureDefinition { index: number; description: string; output: Record<string, { value: [number, number]; duration?: [number, number] }> }
let ownerSequence = 0;
interface DeviceScope { name: string; index: number | null }
interface DeviceDefinition { index: number; name: string; features: FeatureDefinition[] }
const MAXIMUM_PENDING = 64;
function integer(value: unknown, minimum = 0, maximum = 4294967295): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < minimum || value > maximum) throw new TypeError('Invalid Buttplug protocol integer.');
  return value;
}
function range(value: unknown): [number, number] {
  if (!Array.isArray(value) || value.length !== 2) throw new TypeError('Intiface capability must advertise a range.');
  const minimum = integer(value[0], -2147483648, 2147483647), maximum = integer(value[1], minimum, 2147483647);
  return [minimum, maximum];
}
function parseDevice(value: unknown): DeviceDefinition {
  const data = record(value), index = integer(data['DeviceIndex']);
  if (typeof data['DeviceName'] !== 'string' || data['DeviceName'].length > 256) throw new TypeError('Invalid Intiface device name.');
  const featureRows = record(data['DeviceFeatures']);
  if (Object.keys(featureRows).length > 4096) throw new RangeError('Intiface device advertises too many features.');
  const features: FeatureDefinition[] = [];
  for (const [key, row] of Object.entries(featureRows)) {
    const feature = record(row), output: FeatureDefinition['output'] = {};
    const outputs = optionalRecord(feature['Output']) ?? {};
    for (const [type, raw] of Object.entries(outputs)) {
      if (!['Vibrate', 'Oscillate', 'Rotate', 'Position', 'HwPositionWithDuration', 'Led', 'Temperature', 'Constrict', 'Spray'].includes(type)) continue;
      const definition = record(raw), bounds = range(definition['Value']);
      if (type === 'HwPositionWithDuration') output[type] = { value: bounds, duration: range(definition['Duration']) };
      else output[type] = { value: bounds };
    }
    features.push({ index: integer(feature['FeatureIndex'] ?? Number(key)), description: typeof feature['FeatureDescription'] === 'string' ? feature['FeatureDescription'].slice(0, 256) : '', output });
  }
  if (new Set(features.map(feature => feature.index)).size !== features.length) throw new TypeError('Intiface feature indexes are duplicated.');
  return { index, name: data['DeviceName'], features };
}
function boundedJson(text: string): unknown {
  const value: unknown = JSON.parse(text);
  const inspect = (node: unknown, depth: number): void => {
    if (depth > 64) throw new RangeError('Buttplug JSON exceeds maximum depth.');
    if (Array.isArray(node)) { if (node.length > 8192) throw new RangeError('Buttplug array exceeds maximum size.'); for (const item of node) inspect(item, depth + 1); }
    else if (node && typeof node === 'object') for (const item of Object.values(node)) inspect(item, depth + 1);
  };
  inspect(value, 0); return value;
}

class IntifacePeer {
  socket: SocketChannel | null = null;
  generation = 0;
  devices = new Map<number, DeviceDefinition>();
  owners = new Map<number, string>();
  scopes = new Map<string, DeviceScope>();
  pending = new Map<number, Pending>();
  #sequence = 0;
  #heartbeat: ReturnType<typeof setInterval> | null = null;
  #opening: Promise<void> | null = null;
  readonly address: string;
  readonly dependencies: OutputDependencies;
  constructor(address: string, dependencies: OutputDependencies) { this.address = address; this.dependencies = dependencies; }
  get connected(): boolean { return this.socket?.open === true; }
  async connect(): Promise<void> {
    if (this.connected) return;
    if (this.#opening) return this.#opening;
    this.#opening = this.open();
    try { await this.#opening; } finally { this.#opening = null; }
  }
  async open(): Promise<void> {
    const socket = await (this.dependencies.socketFactory ?? nodeSocketFactory)(this.address, 5000);
    this.generation++; this.socket = socket; const generation = this.generation;
    socket.onMessage(text => { if (this.socket !== socket || this.generation !== generation) return; try { this.receive(text); } catch { this.fail('Intiface returned an invalid protocol message.'); } });
    socket.onClose(() => { if (this.socket === socket && this.generation === generation) this.fail('Intiface disconnected.'); });
    try {
      const info = await this.request('RequestServerInfo', { ClientName: 'Sensa', ProtocolVersionMajor: 4, ProtocolVersionMinor: 0 });
      if (info['ProtocolVersionMajor'] !== 4) throw new Error('This native adapter requires Buttplug wire v4.');
      await this.request('RequestDeviceList', {});
      const ping = typeof info['MaxPingTime'] === 'number' ? info['MaxPingTime'] : 0;
      if (ping > 0) { this.#heartbeat = setInterval(() => { void this.request('Ping', {}, Math.max(100, ping / 2)).catch(() => this.fail('Intiface heartbeat failed.')); }, Math.max(50, Math.floor(ping / 2))); this.#heartbeat.unref?.(); }
    } catch (error) { this.fail('Intiface initialization failed.'); throw error; }
  }
  async request(type: string, body: Record<string, unknown>, timeoutMs = 3000): Promise<Record<string, unknown>> {
    const socket = this.socket;
    if (!socket?.open) throw new Error('Intiface is disconnected.');
    if (this.pending.size >= MAXIMUM_PENDING + (type === 'StopCmd' ? 4 : 0)) throw new Error('Intiface request queue is full.');
    do { this.#sequence = this.#sequence >= 4294967295 ? 1 : this.#sequence + 1; } while (this.pending.has(this.#sequence));
    const id = this.#sequence;
    const promise = new Promise<Record<string, unknown>>((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('Intiface acknowledgement timed out.')); this.fail('Intiface acknowledgement timed out.'); }, Math.max(1, timeoutMs));
      timer.unref?.(); this.pending.set(id, { resolve, reject, timer });
    });
    try { await socket.send(JSON.stringify([{ [type]: { Id: id, ...body } }])); }
    catch { const pending = this.pending.get(id); if (pending) { this.pending.delete(id); clearTimeout(pending.timer); pending.reject(new Error('Intiface send failed.')); } }
    return promise;
  }
  receive(text: string): void {
    const rows = boundedJson(text);
    if (!Array.isArray(rows) || rows.length > 8192) throw new TypeError('Buttplug messages must be an array.');
    for (const raw of rows) {
      const row = record(raw), entries = Object.entries(row);
      if (entries.length !== 1 || !entries[0]) throw new TypeError('Buttplug message must have one envelope.');
      const [type, payload] = entries[0], body = record(payload), id = integer(body['Id'] ?? 0);
      if (type === 'DeviceList') {
        const devices = body['Devices'];
        if (!Array.isArray(devices) && !optionalRecord(devices)) throw new TypeError('Invalid Intiface device list.');
        const values = Object.values(devices as object);
        if (values.length > 1024) throw new RangeError('Too many Intiface devices.');
        const next = new Map<number, DeviceDefinition>(); for (const value of values) { const device = parseDevice(value); if (next.has(device.index)) throw new TypeError('Duplicate Intiface device.'); next.set(device.index, device); }
        this.devices = next;
      } else if (type === 'DeviceAdded') { const device = parseDevice(body); if (!this.devices.has(device.index) && this.devices.size >= 1024) throw new RangeError('Too many Intiface devices.'); this.devices.set(device.index, device); }
      else if (type === 'DeviceRemoved') { const index = integer(body['DeviceIndex']); this.devices.delete(index); this.owners.delete(index); }
      const pending = this.pending.get(id);
      if (pending) { this.pending.delete(id); clearTimeout(pending.timer); if (type === 'Error') pending.reject(new Error('Intiface rejected the operation.')); else pending.resolve(body); }
      if (type.startsWith('Device')) this.dependencies.changed?.();
    }
  }
  registerScope(owner: string, scope: DeviceScope): void {
    for (const [other, value] of this.scopes) {
      if (other === owner) continue;
      const all = !scope.name && scope.index === null, otherAll = !value.name && value.index === null;
      const sameIndex = scope.index !== null && scope.index === value.index;
      const sameName = !!scope.name && scope.name === value.name && (scope.index === null || value.index === null);
      if (all || otherAll || sameIndex || sameName) throw new Error('This Intiface device scope overlaps another output.');
    }
    this.scopes.set(owner, scope);
  }
  claim(index: number, owner: string): void { const existing = this.owners.get(index); if (existing && existing !== owner) throw new Error('This Intiface device is already controlled by another output.'); this.owners.set(index, owner); }
  release(owner: string): void { this.scopes.delete(owner); for (const [index, value] of this.owners) if (value === owner) this.owners.delete(index); }
  fail(reason: string): void {
    const socket = this.socket; this.socket = null; this.generation++;
    if (this.#heartbeat) clearInterval(this.#heartbeat); this.#heartbeat = null;
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new Error(reason)); } this.pending.clear(); this.devices.clear(); this.owners.clear(); this.scopes.clear();
    if (socket) void socket.close(); this.dependencies.changed?.();
  }
}

export class IntifacePool {
  #peers = new Map<string, { peer: IntifacePeer; owners: Set<string> }>();
  #engines = new Map<string, { opening: Promise<BridgeProcess | null>; owners: Set<string> }>();
  #engineClosures = new Map<string, Promise<void>>();
  readonly dependencies: OutputDependencies;
  constructor(dependencies: OutputDependencies = {}) { this.dependencies = dependencies; }
  async acquire(address: string, owner: string, manageEngine = false): Promise<IntifacePeer> {
    const key = new URL(address).href;
    let entry = this.#peers.get(key);
    if (!entry) { entry = { peer: new IntifacePeer(key, this.dependencies), owners: new Set() }; this.#peers.set(key, entry); }
    entry.owners.add(owner);
    try {
      let managed: BridgeProcess | null = null;
      if (manageEngine || this.#engines.has(key)) {
        await this.#engineClosures.get(key);
        let engine = this.#engines.get(key);
        if (!engine && manageEngine) { engine = { opening: startInstalledEngine(address, this.dependencies), owners: new Set(entry.owners) }; this.#engines.set(key, engine); }
        if (engine) {
        engine.owners.add(owner); managed = await engine.opening;
        }
      }
      const until = Date.now() + (managed ? 3000 : 0);
      while (true) { try { await entry.peer.connect(); return entry.peer; } catch (error) { if (Date.now() >= until) throw error; await delay(150); } }
    } catch (error) { await this.release(address, owner); throw error; }
  }
  async release(address: string, owner: string): Promise<void> {
    const key = new URL(address).href, entry = this.#peers.get(key); if (!entry) return;
    entry.peer.release(owner); entry.owners.delete(owner);
    if (!entry.owners.size) { entry.peer.fail('Intiface connection released.'); this.#peers.delete(key); }
    const engine = this.#engines.get(key);
    if (engine) {
      engine.owners.delete(owner);
      if (!engine.owners.size) {
        this.#engines.delete(key);
        const closing = engine.opening.catch(() => null).then(process => process?.stop()).then(() => {});
        this.#engineClosures.set(key, closing);
        try { await closing; } finally { if (this.#engineClosures.get(key) === closing) this.#engineClosures.delete(key); }
      }
    }
  }
}

export class IntifaceAdapter extends SerializedAdapter {
  #peer: IntifacePeer | null = null;
  #last = new Map<string, string>();
  #peerGeneration = -1;
  #owner = 'intiface-output-' + ++ownerSequence;
  readonly config: OutputDeviceConfig;
  readonly dependencies: OutputDependencies;
  readonly pool: IntifacePool;
  constructor(config: OutputDeviceConfig, dependencies: OutputDependencies = {}, pool = new IntifacePool(dependencies)) { super(); this.config = config; this.dependencies = dependencies; this.pool = pool;  }
  override get connected(): boolean { return this.ready && this.#peer?.connected === true && this.#peer.generation === this.#peerGeneration; }
  protected async connectCore(): Promise<void> {
    this.#peer = await this.pool.acquire(this.config.websocketAddress, this.#owner, this.config.manageEngineProcess); this.#peerGeneration = this.#peer.generation;
    try { this.#peer.registerScope(this.#owner, { name: this.config.intifaceDeviceName ?? '', index: this.config.intifaceDeviceIndex ?? null }); for (const device of this.selectedDevices()) this.#peer.claim(device.index, this.#owner); }
    catch (error) { await this.pool.release(this.config.websocketAddress, this.#owner); this.#peer = null; throw error; }
  }
  selectedDevices(): DeviceDefinition[] {
    const name = this.config.intifaceDeviceName ?? '', index = this.config.intifaceDeviceIndex ?? null;
    const selected = [...(this.#peer?.devices.values() ?? [])].filter(device => (!name || name === device.name) && (index === null || index === device.index));
    if (name && index === null && selected.length > 1) throw new Error('Several Intiface devices share this name; select a specific device index.');
    return selected;
  }
  devices(): readonly unknown[] { return [...(this.#peer?.devices.values() ?? [])].map(device => ({ index: device.index, name: device.name,
    features: device.features.map(feature => ({ index: feature.index, description: feature.description, outputTypes: Object.keys(feature.output), output: feature.output })),
    positionFeatures: device.features.filter(feature => feature.output['Position'] || feature.output['HwPositionWithDuration']).length,
    vibrateFeatures: device.features.filter(feature => feature.output['Vibrate']).length })); }
  async scan(enabled: boolean): Promise<void> { this.requireReady(); await this.#peer?.request(enabled ? 'StartScanning' : 'StopScanning', {}); }
  protected async motionCore(frame: RuntimeMotionFrame): Promise<void> {
    const peer = this.#peer; if (!peer) throw new Error('Intiface is disconnected.');
    const until = Date.now() + 500, epoch = this.lane.epoch;
    for (const device of this.selectedDevices()) {
      peer.claim(device.index, this.#owner);
      for (const feature of device.features) {
        const types = Object.keys(feature.output);
        for (const type of types) {
          const route = resolveFeatureRoute(this.config.intifaceFeatures, device.name, feature.index, type);
          const overridesPosition = overridesDefaultFeature(this.config.intifaceFeatures, device.name, feature.index, 'Position');
          if (!route && type === 'Position' && feature.output['HwPositionWithDuration']) continue;
          if (!route && (type !== 'Position' && type !== 'HwPositionWithDuration' && type !== 'Vibrate' || overridesPosition && (type === 'Position' || type === 'HwPositionWithDuration'))) continue;
          const resolvedRoute = route ?? defaultIntifaceFeatureRoute(device.name, feature.index, type, this.config.vibrationAxis as MotionAxis);
          if (!resolvedRoute) continue;
          const routed = resolveFeatureRouteValue(resolvedRoute, frame); if (!routed.active) continue;
          const normalized = routed.value;
          const definition = feature.output[type]; if (!definition) continue;
          const [minimum, maximum] = definition.value;
          let value: number;
          if (type === 'Rotate') {
            const clockwise = routed.clockwise;
            if (minimum > 0 || maximum < 0 || normalized > 0 && (clockwise ? maximum === 0 : minimum === 0)) throw new RangeError('Intiface rotation does not advertise this direction.');
            value = roundAway(normalized * (clockwise ? maximum : minimum));
          } else value = roundAway(minimum + normalized * (maximum - minimum));
          const command: Record<string, unknown> = { Value: value };
          if (type === 'HwPositionWithDuration') {
            const duration = durationFor(frame), bounds = definition.duration;
            if (!bounds || duration < bounds[0] || duration > bounds[1]) throw new RangeError('Position duration is outside the advertised Intiface range.');
            command['Duration'] = duration;
          }
          const key = `${device.index}:${feature.index}:${type}`, serialized = JSON.stringify(command);
          if (this.#last.get(key) === serialized) continue;
          if (this.lane.epoch !== epoch) return;
          const remaining = until - Date.now(); if (remaining <= 0) throw new Error('Intiface frame exceeded its output deadline.');
          await peer.request('OutputCmd', { DeviceIndex: device.index, FeatureIndex: feature.index, Command: { [type]: command } }, remaining);
          this.#last.set(key, serialized);
        }
      }
    }
  }
  protected async signalCore(_value: SignalOutputValue): Promise<void> { throw new Error('Intiface requires an axis motion frame.'); }
  protected async stopCore(): Promise<void> {
    const peer = this.#peer; this.#last.clear(); if (!peer) return;
    const indexes = [...peer.owners].filter(([, owner]) => owner === this.#owner).map(([index]) => index);
    await Promise.all(indexes.map(index => peer.request('StopCmd', { DeviceIndex: index }, 500)));
  }
  protected async closeCore(): Promise<void> { await this.pool.release(this.config.websocketAddress, this.#owner); this.#peer = null; this.#last.clear(); }
}
