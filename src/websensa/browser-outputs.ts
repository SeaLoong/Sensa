/** Browser system ports for the same output coordinator used by the desktop host. */
import type { ComputedSignalSample, MotionAxis, OutputDeviceConfig, RuntimeMotionFrame } from '../core/runtime/model.ts';
import { isMotionAxis } from '../core/runtime/model.ts';
import { resolveAxisProfile } from '../core/runtime/configuration.ts';
import { OutputLane, deadline } from '../core/outputs/lifecycle.ts';
import { defaultIntifaceFeatureRoute, resolveFeatureRoute } from '../core/outputs/intiface-routing.ts';
import { TCodeEncoder, durationFor, encodeJson, encodeMidi } from '../core/outputs/codecs.ts';
import { FunscriptSegments, SESSION_CSV_HEADER, encodeSessionRow } from '../core/outputs/recording.ts';
import type { FunscriptSegment, SessionRow } from '../core/outputs/recording.ts';
import type { AdapterContext, OutputAdapter, SignalOutputValue } from '../core/outputs/index.ts';
import { createOutputTransport, discoverIntiface, discoverMidi } from './transports.ts';
import type { EncodedOutputTransport, IntifaceDiscovery, NavigatorPorts, OutputConfig, SerialPortPort, SocketPort, TransportDependencies } from './transports.ts';
import type { SignalFrame } from '../core/types.ts';
import { detectCapabilities } from './capabilities.ts';
import { BLUETOOTH_PROFILES } from './device-codecs.ts';

export interface BrowserSerialPort extends SerialPortPort { getInfo?(): { usbVendorId?: number | undefined; usbProductId?: number | undefined }; }
export interface BrowserNavigatorPorts extends NavigatorPorts {
  readonly serial?: { requestPort(): PromiseLike<BrowserSerialPort>; getPorts?(): PromiseLike<BrowserSerialPort[]> };
}
export interface BrowserRecordingFile {
  fileName: string; name: string; format: string; sizeBytes: number; durationMs: number;
  startOffsetMs: number; signals: string[]; createdAt: string;
}
export class BrowserRecordingStore {
  #files = new Map<string, { entry: BrowserRecordingFile; content: string }>();
  #bytes = 0;
  #sequence = 0;
  publish(label: string, format: 'Funscript' | 'Csv' | 'JsonLines', content: string,
    metadata: { durationMs?: number; startOffsetMs?: number; signals?: string[] } = {}): BrowserRecordingFile {
    const sizeBytes = new TextEncoder().encode(content).byteLength;
    if (this.#bytes + sizeBytes > 64 * 1024 * 1024 || this.#files.size >= 1024) throw new RangeError('Browser recordings reached the current page storage limit.');
    const fileName = label.replace(/[^\p{L}\p{N}_.-]/gu, '_').slice(0, 64) + '-' + Date.now() + '-' + (++this.#sequence)
      + (format === 'Funscript' ? '.funscript' : format === 'Csv' ? '.csv' : '.jsonl');
    const entry: BrowserRecordingFile = { fileName, name: fileName, format, sizeBytes, durationMs: metadata.durationMs ?? 0,
      startOffsetMs: metadata.startOffsetMs ?? 0, signals: metadata.signals ?? [], createdAt: new Date().toISOString() };
    this.#files.set(fileName, { entry, content }); this.#bytes += sizeBytes; return { ...entry };
  }
  list(): BrowserRecordingFile[] { return [...this.#files.values()].reverse().map(value => ({ ...value.entry, signals: [...value.entry.signals] })); }
  read(name: string): string {
    const row = this.#files.get(name);
    if (!row) throw new Error('Choose a completed recording from this page.');
    return row.content;
  }
}

/** Discovery has no permission side effects; the explicit picker owns granting access. */
export class BrowserDevices {
  readonly dependencies: TransportDependencies;
  readonly navigator: BrowserNavigatorPorts;
  #serial = new Map<string, BrowserSerialPort>();
  #serialIds = new WeakMap<BrowserSerialPort, string>();
  #serialSequence = 0;
  #page = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
  constructor(dependencies: TransportDependencies & { navigator?: BrowserNavigatorPorts } = {}) {
    this.dependencies = dependencies; this.navigator = dependencies.navigator ?? globalThis.navigator ?? {};
  }
  serialId(port: BrowserSerialPort): string {
    let id = this.#serialIds.get(port);
    if (!id) { id = `webserial-${this.#page}-${++this.#serialSequence}`; this.#serialIds.set(port, id); this.#serial.set(id, port); }
    return id;
  }
  async listSerialPorts(): Promise<{ portName: string; description: string }[]> {
    const ports = await this.navigator.serial?.getPorts?.() ?? [];
    for (const port of ports) this.serialId(port);
    return [...this.#serial].map(([portName, port]) => {
      const info = port.getInfo?.();
      return { portName, description: info?.usbVendorId ? `USB ${info.usbVendorId.toString(16)}:${info.usbProductId?.toString(16) ?? ''}` : 'Web Serial' };
    });
  }
  async selectSerialPort(): Promise<void> {
    if (!this.navigator.serial?.requestPort) throw new Error('This browser does not provide Web Serial.');
    this.serialId(await this.navigator.serial.requestPort());
  }
  selectedSerial(id: string): TransportDependencies {
    const port = this.#serial.get(id);
    if (!port) throw new Error('Choose an authorized serial port for this page.');
    return { ...this.dependencies, navigator: { ...(this.navigator.bluetooth ? { bluetooth: this.navigator.bluetooth } : {}),
      ...(this.navigator.requestMIDIAccess ? { requestMIDIAccess: this.navigator.requestMIDIAccess.bind(this.navigator) } : {}),
      serial: { requestPort: () => Promise.resolve(port) } } };
  }
  listMidiPorts(): ReturnType<typeof discoverMidi> { return discoverMidi({ navigator: this.navigator }); }
  outputTypes(environment: unknown = globalThis): string[] {
    const report = detectCapabilities(environment), outputs: string[] = [];
    if (report.outputs['intiface'].available) outputs.push('Intiface', 'TCodeWebSocket', 'SensaWebSocket', 'WebSocketJson');
    if (report.outputs['http'].available) outputs.push('SensaHttp', 'HttpJson');
    if (report.outputs['serial'].available) outputs.push('TCodeSerial');
    if (report.outputs['bluetooth'].available) outputs.push('Bluetooth');
    if (report.outputs['midi'].available) outputs.push('Midi');
    return [...outputs, 'Recording'];
  }
}

abstract class BrowserAdapter implements OutputAdapter {
  protected lane = new OutputLane();
  protected ready = false;
  get connected(): boolean { return this.ready; }
  connect(): Promise<void> { return this.lane.enqueue(async () => { if (!this.connected) {
    if (this.ready) { await this.closing(); this.ready = false; }
    try { await this.open(); this.ready = true; } catch (error) { await this.closing(); throw error; }
  } }, false); }
  sendMotion(frame: RuntimeMotionFrame): Promise<void> { return this.lane.enqueue(async () => { this.requireReady(); await this.motion(frame); }); }
  sendSignal(value: SignalOutputValue): Promise<void> { return this.lane.enqueue(async () => { this.requireReady(); await this.signal(value); }); }
  stop(): Promise<void> { return this.lane.barrier(async () => { if (this.ready) await this.stopping(); }); }
  close(): Promise<void> { return this.lane.close(async () => { try { if (this.ready) await this.stopping(); } finally { this.ready = false; await this.closing(); } }); }
  protected requireReady(): void { if (!this.connected) throw new Error('Connect the output first.'); }
  protected abstract open(): Promise<void>;
  protected abstract motion(frame: RuntimeMotionFrame): Promise<void>;
  protected abstract signal(value: SignalOutputValue): Promise<void>;
  protected abstract stopping(): Promise<void>;
  protected abstract closing(): Promise<void>;
}
function transportFrame(frame: RuntimeMotionFrame): SignalFrame {
  const values: Partial<Record<MotionAxis, number>> = {};
  for (const axis of frame.activeAxes ?? Object.keys(frame.values)) if (isMotionAxis(axis)) values[axis] = frame.values[axis];
  return { values, durationMs: durationFor(frame), timeMs: Date.now() };
}
class BrowserMotionAdapter extends BrowserAdapter {
  #transport: EncodedOutputTransport | null = null;
  #encoder = new TCodeEncoder();
  readonly config: OutputDeviceConfig; readonly context: AdapterContext; readonly ports: BrowserDevices;
  constructor(config: OutputDeviceConfig, context: AdapterContext, ports: BrowserDevices) { super(); this.config = config; this.context = context; this.ports = ports; }
  override get connected(): boolean { return this.ready && !!this.#transport && this.#transport.connected !== false; }
  protected async open(): Promise<void> {
    const config = this.config;
    const options: OutputConfig = config.type === 'TCodeSerial' ? { type: 'serial', baudRate: 115200 }
      : config.type === 'TCodeWebSocket' ? { type: 'tcode-ws', url: config.websocketAddress }
      : config.type === 'SensaHttp' ? { type: 'http', url: config.websocketAddress }
      : config.type === 'SensaWebSocket' ? { type: 'json-ws', url: config.websocketAddress }
      : { type: 'bluetooth', profile: config.bridge?.protocol ?? 'loob' };
    this.#transport = await createOutputTransport(options, config.type === 'TCodeSerial' ? this.ports.selectedSerial(config.comPort) : this.ports.dependencies);
    this.#encoder.reset();
  }
  protected async motion(frame: RuntimeMotionFrame): Promise<void> {
    if (!this.#transport) throw new Error('Output is disconnected.');
    if (this.config.type.startsWith('TCode')) {
      const line = this.#encoder.encode(frame, resolveAxisProfile(this.context.configuration(), this.config.motionProfileId).motion, this.config);
      if (line) {
        if (!this.#transport.sendText) throw new Error('The transport does not accept shared TCode frames.');
        await this.#transport.sendText(line);
        this.context.telemetry?.recordTCode(line);
      }
    } else if (this.config.type === 'Bluetooth') {
      const profile = BLUETOOTH_PROFILES.find(value => value.id === this.config.bridge?.protocol) ?? BLUETOOTH_PROFILES[0];
      if (!profile) throw new Error('Choose a Bluetooth profile.');
      const sourceAxis = isMotionAxis(this.config.device.axis) ? this.config.device.axis : profile.axis;
      if (frame.activeAxes && !frame.activeAxes.includes(sourceAxis)) return;
      await this.#transport.send({ ...transportFrame(frame), values: { [profile.axis]: frame.values[sourceAxis] } });
      this.context.telemetry?.recordTarget(sourceAxis, profile.name, frame.values[sourceAxis] * 100);
    } else { const sent = transportFrame(frame); await this.#transport.send(sent); this.context.telemetry?.recordTargets(Object.entries(sent.values).map(([key, value]) => ({ key, label: key, value: (value ?? 0) * 100, maximum: 100 }))); }
  }
  protected async signal(_value: SignalOutputValue): Promise<void> { throw new Error('Motion output needs an axis frame.'); }
  protected async stopping(): Promise<void> { await this.#transport?.stop(); }
  protected async closing(): Promise<void> { await this.#transport?.close(); this.#transport = null; }
}

interface BrowserSocketLease { socket: SocketPort; release(): void; }
interface BrowserSocketEntry { socket: SocketPort; ready: Promise<void>; refs: number; }
class BrowserSocketPool {
  #entries = new Map<string, BrowserSocketEntry>();
  async acquire(address: string, dependencies: TransportDependencies): Promise<BrowserSocketLease> {
    const url = new URL(address);
    if (!['ws:', 'wss:'].includes(url.protocol) || url.username || url.password || url.hash) throw new Error('Choose a WebSocket endpoint.');
    const key = url.href;
    let entry = this.#entries.get(key);
    if (!entry || entry.socket.readyState > 1) {
      const Socket = dependencies.WebSocket ?? globalThis.WebSocket, socket = new Socket(key);
      const ready = socket.readyState === 1 ? Promise.resolve() : new Promise<void>((resolve, reject) => {
        const cleanup = () => { socket.removeEventListener('open', opened); socket.removeEventListener('error', failed); socket.removeEventListener('close', failed); };
        const opened = () => { cleanup(); resolve(); }, failed = () => { cleanup(); reject(new Error('WebSocket connection failed.')); };
        socket.addEventListener('open', opened, { once: true }); socket.addEventListener('error', failed, { once: true }); socket.addEventListener('close', failed, { once: true });
      });
      entry = { socket, ready: deadline(ready, dependencies.timeoutMs ?? 5000, 'WebSocket connection', () => socket.close()), refs: 0 };
      this.#entries.set(key, entry);
    }
    const selected = entry; selected.refs++;
    const release = () => { if (--selected.refs === 0) { if (this.#entries.get(key) === selected) this.#entries.delete(key); selected.socket.close(); } };
    try { await selected.ready; } catch (error) { release(); throw error; }
    let released = false;
    return { socket: selected.socket, release() { if (!released) { released = true; release(); } } };
  }
}
class BrowserSignalAdapter extends BrowserAdapter {
  #socket: BrowserSocketLease | null = null;
  #midi = new Map<string, EncodedOutputTransport>();
  readonly config: OutputDeviceConfig; readonly ports: BrowserDevices; readonly sockets: BrowserSocketPool;
  constructor(config: OutputDeviceConfig, ports: BrowserDevices, sockets: BrowserSocketPool) { super(); this.config = config; this.ports = ports; this.sockets = sockets; }
  override get connected(): boolean { return this.ready && (this.config.type !== 'WebSocketJson' || this.#socket?.socket.readyState === 1)
    && (this.config.type !== 'Midi' || [...this.#midi.values()].every(transport => transport.connected !== false)); }
  protected async open(): Promise<void> {
    if (this.config.type === 'WebSocketJson') this.#socket = await this.sockets.acquire(this.config.websocketAddress, this.ports.dependencies);
    if (this.config.type === 'HttpJson') {
      const url = new URL(this.config.websocketAddress);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash) throw new Error('Choose an HTTP endpoint.');
    }
    if (this.config.type === 'Midi') {
      const ports = await this.ports.listMidiPorts();
      if (!ports.some(port => port.id === this.config.signal.midiPortName || port.name === this.config.signal.midiPortName)) throw new Error('Choose an available MIDI output.');
    }
  }
  protected async motion(_frame: RuntimeMotionFrame): Promise<void> { throw new Error('Configure this output with signal bindings.'); }
  protected async signal(value: SignalOutputValue): Promise<void> {
    if (this.config.type === 'HttpJson') {
      const abort = new AbortController(), timer = setTimeout(() => abort.abort(), this.ports.dependencies.timeoutMs ?? 5000);
      try {
        const reply = await (this.ports.dependencies.fetch ?? globalThis.fetch)(this.config.websocketAddress, {
          method: 'POST', credentials: 'omit', redirect: 'error', headers: { 'Content-Type': 'application/json' },
          body: new TextDecoder().decode(encodeJson(value)), signal: abort.signal,
        });
        try { if (!reply.ok) throw new Error('HTTP output rejected the signal.'); } finally { await reply.body?.cancel(); }
      } finally { clearTimeout(timer); }
    } else if (this.config.type === 'WebSocketJson') {
      const socket = this.#socket?.socket;
      if (!socket || socket.readyState !== 1 || socket.bufferedAmount > 1048576) throw new Error('WebSocket output is unavailable or congested.');
      socket.send(new TextDecoder().decode(encodeJson(value)));
    } else if (this.config.type === 'Midi') {
      const bytes = encodeMidi(value), channel = ((bytes[0] ?? 0xb0) & 15) + 1, controller = bytes[1] ?? 0;
      let transport = this.#midi.get(value.address);
      if (!transport) {
        const ports = await this.ports.listMidiPorts(), port = ports.find(candidate => candidate.id === this.config.signal.midiPortName || candidate.name === this.config.signal.midiPortName);
        if (!port) throw new Error('MIDI output disappeared.');
        transport = await createOutputTransport({ type: 'midi', deviceId: port.id, channel, cc: controller, axis: 'V0' }, { ...this.ports.dependencies, navigator: this.ports.navigator });
        this.#midi.set(value.address, transport);
      }
      await transport.send({ values: { V0: (bytes[2] ?? 0) / 127 }, durationMs: 0, timeMs: Date.now() });
    }
  }
  protected async stopping(): Promise<void> { /* The shared coordinator owns each binding's stop value. */ }
  protected async closing(): Promise<void> {
    this.#socket?.release(); this.#socket = null;
    await Promise.all([...this.#midi.values()].map(transport => transport.close())); this.#midi.clear();
  }
}
class BrowserIntifaceAdapter extends BrowserAdapter {
  #discovery: IntifaceDiscovery | null = null;
  #transports = new Map<number, EncodedOutputTransport>();
  #transportKeys = new Map<number, string>();
  #unsub: (() => void) | null = null;
  #generation = 0;
  #updating: Promise<void> = Promise.resolve();
  #features: IntifaceDiscovery['features'] = [];
  readonly config: OutputDeviceConfig; readonly devicesPort: BrowserDevices; readonly context: AdapterContext;
  constructor(config: OutputDeviceConfig, devicesPort: BrowserDevices, context: AdapterContext) { super(); this.config = config; this.devicesPort = devicesPort; this.context = context; }
  override get connected(): boolean { return this.ready && this.#discovery?.connected === true; }
  protected async open(): Promise<void> {
    const generation = ++this.#generation;
    this.#discovery = await discoverIntiface(this.config.websocketAddress, this.devicesPort.dependencies);
    const update = (features: IntifaceDiscovery['features']) => {
      this.#features = features;
      this.#updating = this.#updating.catch(() => {}).then(async () => {
        if (generation !== this.#generation) return;
        const selected = features.filter(feature => (this.config.intifaceDeviceIndex == null || this.config.intifaceDeviceIndex === feature.deviceIndex)
          && (!this.config.intifaceDeviceName || this.config.intifaceDeviceName === feature.deviceName));
        const indices = new Set(selected.map(feature => feature.deviceIndex));
        if (this.config.intifaceDeviceName && this.config.intifaceDeviceIndex == null && indices.size > 1)
          throw new Error('Several Intiface devices share this name; select a specific device index.');
        for (const [index, transport] of this.#transports) if (!indices.has(index)) { this.context.telemetry?.removePrefix(`#${index}/`); this.#transports.delete(index); this.#transportKeys.delete(index); await transport.close(); }
        for (const index of indices) {
          const key = JSON.stringify(selected.filter(item => item.deviceIndex === index));
          if (this.#transportKeys.get(index) === key) continue;
          const previous = this.#transports.get(index);
          if (previous) { this.context.telemetry?.removePrefix(`#${index}/`); this.#transports.delete(index); this.#transportKeys.delete(index); try { await previous.stop(); } finally { await previous.close(); } }
          const feature = selected.find(item => item.deviceIndex === index); if (!feature) continue;
          const featureMappings = selected.filter(item => item.deviceIndex === index).flatMap(item => {
            const type = item.command === 'LinearCmd' ? 'HwPositionWithDuration' : item.command === 'RotateCmd' ? 'Rotate' : item.actuator ?? 'Vibrate';
            const explicit = resolveFeatureRoute(this.config.intifaceFeatures, item.deviceName, item.index, type)
              ?? (item.command === 'LinearCmd' ? resolveFeatureRoute(this.config.intifaceFeatures, item.deviceName, item.index, 'Position') : undefined);
            const route = explicit ?? defaultIntifaceFeatureRoute(item.deviceName, item.index, type, isMotionAxis(this.config.vibrationAxis) ? this.config.vibrationAxis : 'V0');
            return route ? [route] : [];
          });
          const transport = await createOutputTransport({ type: 'intiface', url: this.config.websocketAddress, featureId: feature.id, mapDevice: true,
            featureMappings, requireFeatureMappings: true }, { ...this.devicesPort.dependencies, onTargets: targets => this.context.telemetry?.recordTargets(targets) });
          if (generation !== this.#generation) { await transport.close(); return; }
          this.#transports.set(index, transport); this.#transportKeys.set(index, key);
        }
      });
      void this.#updating.catch(() => {});
    };
    this.#unsub = this.#discovery.subscribeFeatures(update); await this.#updating;
  }
  devices(): unknown[] {
    return [...new Set(this.#features.map(feature => feature.deviceIndex))].map(index => {
      const features = this.#features.filter(feature => feature.deviceIndex === index);
      return { index, name: features[0]?.deviceName ?? '', features: features.map(feature => ({ index: feature.index,
        description: feature.name, outputTypes: [feature.command === 'LinearCmd' ? 'HwPositionWithDuration' : feature.command === 'RotateCmd' ? 'Rotate' : feature.actuator ?? 'Vibrate'], range: [0, 1] })) };
    });
  }
  async scan(enabled: boolean): Promise<void> { this.requireReady(); await this.#discovery?.setScanning(enabled); }
  protected async motion(frame: RuntimeMotionFrame): Promise<void> { await this.#updating; await Promise.all([...this.#transports.values()].map(transport => transport.send(transportFrame(frame)))); }
  protected async signal(_value: SignalOutputValue): Promise<void> { throw new Error('Intiface output needs an axis frame.'); }
  protected async stopping(): Promise<void> { await this.#updating.catch(() => {}); await Promise.all([...this.#transports.values()].map(transport => transport.stop())); }
  protected async closing(): Promise<void> {
    this.#generation++; this.#unsub?.(); this.#unsub = null;
    this.#discovery?.close(); this.#discovery = null;
    await this.#updating.catch(() => {}); await Promise.all([...this.#transports.values()].map(transport => transport.close())); this.#transports.clear(); this.#transportKeys.clear();
  }
}
class BrowserRecordingAdapter extends BrowserAdapter {
  #segments = new FunscriptSegments();
  #rows: string[] = [];
  #started = 0;
  #size = 0;
  #rowCount = 0;
  #full = false;
  #files: BrowserRecordingFile[] = [];
  readonly config: OutputDeviceConfig; readonly store: BrowserRecordingStore; readonly now: () => number;
  constructor(config: OutputDeviceConfig, store: BrowserRecordingStore, now: () => number) { super(); this.config = config; this.store = store; this.now = now; }
  protected async open(): Promise<void> { this.#started = this.now(); this.#segments = new FunscriptSegments(); this.#size = 0; this.#rowCount = 0; this.#full = false;
    this.#rows = this.config.signal.recordingFormat === 'Csv' ? [SESSION_CSV_HEADER] : [JSON.stringify({ type: 'sensa-session', version: 1 })]; }
  protected async motion(_frame: RuntimeMotionFrame): Promise<void> { throw new Error('Recording output uses signal bindings.'); }
  protected async signal(value: SignalOutputValue): Promise<void> {
    this.appendSample(value.address, { value: value.value, valid: true, reason: '', sourceKey: null, timestampMs: value.timestampMs ?? this.now(), coordinateFrame: value.coordinateFrame ?? null, originKey: null }, value.value, value.timestampMs ?? this.now());
  }
  recordSample(id: string, sample: ComputedSignalSample, value: number | null, now: number): Promise<void> {
    return this.lane.enqueue(async () => { this.requireReady(); this.appendSample(id, sample, value, now); });
  }
  appendSample(id: string, sample: ComputedSignalSample, value: number | null, now: number): void {
      if (this.config.signal.recordingFormat === 'Funscript') { for (const segment of this.#segments.append(id, sample, value, now)) this.publish(segment); }
      else {
        if (this.#full) return;
        const row: SessionRow = { timeMs: Math.max(0, now - this.#started), signalId: id, rawValue: sample.value, value: sample.valid ? value : null, valid: sample.valid,
          reason: sample.reason, sourceKey: sample.sourceKey, coordinateFrame: sample.coordinateFrame };
        const encoded = encodeSessionRow(row, this.config.signal.recordingFormat === 'Csv');
        const size = new TextEncoder().encode(encoded).length + 1;
        if (++this.#rowCount > 250000 || this.#size + size > 64 * 1024 * 1024) { this.#full = true; return; }
        this.#size += size; this.#rows.push(encoded);
      }
  }
  publish(segment: FunscriptSegment): void {
    this.#files.push(this.store.publish(this.config.signal.recordingName || this.config.name, 'Funscript', JSON.stringify({ version: '1.0', inverted: false, range: 100,
      actions: segment.actions, metadata: { signalId: segment.signalId, startOffsetMs: segment.startOffsetMs } }), {
      durationMs: segment.actions.at(-1)?.at ?? 0, startOffsetMs: segment.startOffsetMs, signals: [segment.signalId],
    }));
  }
  snapshot(): unknown { return { recordingFormat: this.config.signal.recordingFormat, recordingFiles: this.#files.map(file => ({ ...file })), recordingFull: this.#full || this.#segments.full, recordingError: null }; }
  protected async stopping(): Promise<void> {
    if (this.config.signal.recordingFormat === 'Funscript') for (const segment of this.#segments.complete(this.now())) this.publish(segment);
    else if (this.#rows.length > 1) {
      this.#files.push(this.store.publish(this.config.signal.recordingName || this.config.name, this.config.signal.recordingFormat === 'Csv' ? 'Csv' : 'JsonLines', this.#rows.join('\n') + '\n', { durationMs: Math.max(0, this.now() - this.#started) }));
      this.#rows = [this.#rows[0] ?? '']; this.#size = 0; this.#started = this.now();
    }
  }
  protected async closing(): Promise<void> { /* Completed recordings belong to the page store. */ }
}

export function createBrowserOutputFactory(devices = new BrowserDevices(), recordings = new BrowserRecordingStore(), now: () => number = Date.now):
  (config: OutputDeviceConfig, context: AdapterContext) => OutputAdapter {
  const sockets = new BrowserSocketPool();
  return (config, context) => {
    if (config.type === 'Recording') return new BrowserRecordingAdapter(config, recordings, now);
    if (config.type === 'Intiface') return new BrowserIntifaceAdapter(config, devices, context);
    if (['HttpJson', 'WebSocketJson', 'Midi'].includes(config.type)) return new BrowserSignalAdapter(config, devices, sockets);
    if (['TCodeSerial', 'TCodeWebSocket', 'SensaHttp', 'SensaWebSocket', 'Bluetooth'].includes(config.type)) return new BrowserMotionAdapter(config, context, devices);
    throw new Error(`No browser adapter is registered for ${config.type}.`);
  };
}
export function browserBluetoothProfiles(): readonly { value: string; label: string }[] {
  return BLUETOOTH_PROFILES.map(profile => ({ value: profile.id, label: profile.name }));
}
