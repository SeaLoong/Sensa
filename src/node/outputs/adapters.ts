import { createHash } from 'node:crypto';
import { mkdir, open, readdir, rename, lstat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { FunscriptSegments, encodeSessionRow, SESSION_CSV_HEADER } from '../../core/outputs/recording.ts';
import type { FunscriptSegment } from '../../core/outputs/recording.ts';
import type { ComputedSignalSample } from '../../core/runtime/model.ts';
import path from 'node:path';
import { OutputLane, deadline } from '../../core/outputs/lifecycle.ts';
import { TcpTransport, UdpTransport, SerialTransport, endpoint, nodeMidiFactory, nodeSocketFactory } from './transports.ts';
import type { ByteTransport } from './transports.ts';
import type { OutputAdapter, OutputDependencies, OutputDeviceConfig, RuntimeMotionFrame, SignalOutputValue, SocketChannel, MidiPortHandle } from '../../core/outputs/types.ts';
import type { TCodeMotionProfile } from '../../core/runtime/model.ts';
import { TCodeEncoder, encodeJson, encodeMidi, encodeOsc, encodeMqttConnect, encodeMqttPublish, concatBytes } from '../../core/outputs/codecs.ts';

export abstract class SerializedAdapter implements OutputAdapter {
  protected lane = new OutputLane();
  protected ready = false;
  get connected(): boolean { return this.ready; }
  connect(): Promise<void> { return this.lane.enqueue(async () => { if (!this.connected) { if (this.ready) await this.closeCore(); this.ready = false; try { await this.connectCore(); this.ready = true; } catch (error) { await this.closeCore(); throw error; } } }, false); }
  sendMotion(frame: RuntimeMotionFrame): Promise<void> { return this.lane.enqueue(async () => { this.requireReady(); await this.motionCore(frame); }); }
  sendSignal(value: SignalOutputValue): Promise<void> { return this.lane.enqueue(async () => { this.requireReady(); await this.signalCore(value); }); }
  stop(): Promise<void> { return this.lane.barrier(async () => { if (this.connected) await this.stopCore(); }); }
  async close(): Promise<void> {
    await this.lane.close(async () => { try { if (this.connected) await this.stopCore(); } finally { this.ready = false; await this.closeCore(); } });
  }
  protected requireReady(): void { if (!this.connected) throw new Error('Connect the output first.'); }
  protected abstract connectCore(): Promise<void>;
  protected abstract signalCore(value: SignalOutputValue): Promise<void>;
  protected abstract motionCore(frame: RuntimeMotionFrame): Promise<void>;
  protected abstract stopCore(): Promise<void>;
  protected abstract closeCore(): Promise<void>;
}

export class TCodeAdapter extends SerializedAdapter {
  protected encoder = new TCodeEncoder();
  #profileReference: TCodeMotionProfile | undefined;
  protected transport: ByteTransport;
  #deviceInfo: unknown = null;
  #lastFrame: RuntimeMotionFrame | null = null;
  #lastFullAt = -Infinity;
  #refreshing = false;
  #refreshTimer: ReturnType<typeof setInterval> | null = null;
  readonly config: OutputDeviceConfig;
  readonly profile: TCodeMotionProfile | (() => TCodeMotionProfile) | undefined;
  readonly dependencies: OutputDependencies;
  constructor(config: OutputDeviceConfig, profile: TCodeMotionProfile | (() => TCodeMotionProfile) | undefined, dependencies: OutputDependencies = {}, transport?: ByteTransport) {
    super(); this.config = config; this.profile = profile; this.dependencies = dependencies;
    this.transport = transport ?? (config.type === 'TCodeSerial' ? new SerialTransport(config.comPort, dependencies.serialFactory)
      : config.type === 'TCodeUdp' ? new UdpTransport(config.host, config.port) : new TcpTransport(config.host, config.port));
  }
  override get connected(): boolean { return this.ready && this.transport.connected; }
  protected async connectCore(): Promise<void> {
    try {
      await this.transport.connect(); this.encoder.reset(); this.#lastFrame = null; this.#lastFullAt = -Infinity;
      if (this.transport instanceof SerialTransport && this.transport.canRead) await this.queryInfo();
      if (this.config.type === 'TCodeUdp' && !this.config.signal.bindings.length) {
        this.#refreshTimer = setInterval(() => {
          if (this.#refreshing || !this.#lastFrame || !this.connected || this.dependencies.canSend && !this.dependencies.canSend()) return;
          this.#refreshing = true; void this.sendMotion(this.#lastFrame).catch(() => { this.ready = false; }).finally(() => { this.#refreshing = false; });
        }, 1000); this.#refreshTimer.unref?.();
      }
    } catch (error) { await this.transport.close(); throw error; }
  }
  protected async motionCore(frame: RuntimeMotionFrame): Promise<void> {
    const profile = typeof this.profile === 'function' ? this.profile() : this.profile;
    if (profile !== this.#profileReference) { this.encoder.reset(); this.#profileReference = profile; }
    const now = this.dependencies.now?.() ?? Date.now(), refresh = this.config.type === 'TCodeUdp' && now - this.#lastFullAt >= 1000;
    const line = this.encoder.encode(frame, profile, this.config, refresh);
    if (line) { await this.transport.send(new TextEncoder().encode(line)); if (refresh) this.#lastFullAt = now; }
    this.#lastFrame = structuredClone(frame);
  }
  protected async signalCore(value: SignalOutputValue): Promise<void> {
    throw new Error(`Motion output requires a complete frame for ${value.address}.`);
  }
  protected async stopCore(): Promise<void> { this.#lastFrame = null; this.encoder.reset(); await this.transport.send(new TextEncoder().encode('DSTOP\n')); }
  protected async closeCore(): Promise<void> { this.#lastFrame = null; if (this.#refreshTimer) clearInterval(this.#refreshTimer); this.#refreshTimer = null; await this.transport.close(); }
  devices(): readonly unknown[] { return this.#deviceInfo ? [this.#deviceInfo] : []; }
  async refreshDeviceInfo(): Promise<unknown> {
    if (!(this.transport instanceof SerialTransport)) return null;
    return this.lane.enqueue(async () => { this.requireReady(); await this.queryInfo(); }, false).then(() => this.#deviceInfo);
  }
  private async queryInfo(): Promise<void> {
    const transport = this.transport; if (!(transport instanceof SerialTransport)) return;
    const parts: string[] = [];
      for (const command of ['D0', 'D1', 'D2']) {
        let collected = '';
        let resolve: (() => void) | undefined;
        let quiet: ReturnType<typeof setTimeout> | undefined;
        const received = new Promise<void>(yes => { resolve = yes; });
        const remove = transport.onData(bytes => {
          collected += new TextDecoder('utf-8', { fatal: false }).decode(bytes);
          if (collected.length > 4096) { collected = collected.slice(0, 4096); resolve?.(); }
          else if (command === 'D2') { if (quiet) clearTimeout(quiet); quiet = setTimeout(() => resolve?.(), 50); }
          else if (collected.includes('\n')) resolve?.();
        });
        try { await transport.send(new TextEncoder().encode(command + '\n')); await deadline(received, 500, 'TCode device information'); parts.push(collected.trim()); }
        catch { parts.push(''); }
        finally { if (quiet) clearTimeout(quiet); remove(); }
      }
      this.#deviceInfo = { firmwareVersion: parts[0] || null, tCodeVersion: parts[1] || null, axisDescriptors: (parts[2] ?? '').split(/[\r\n]+/u).filter(Boolean), supported: parts.some(Boolean), status: parts.some(Boolean) ? 'Connected' : 'Device information unavailable.', updatedAtUtc: new Date().toISOString() };
  }
}

export class TCodeWebSocketAdapter extends SerializedAdapter {
  #socket: SocketChannel | null = null;
  #encoder = new TCodeEncoder();
  #profileReference: TCodeMotionProfile | undefined;
  readonly config: OutputDeviceConfig;
  readonly profile: TCodeMotionProfile | (() => TCodeMotionProfile) | undefined;
  readonly dependencies: OutputDependencies;
  constructor(config: OutputDeviceConfig, profile: TCodeMotionProfile | (() => TCodeMotionProfile) | undefined, dependencies: OutputDependencies = {}) { super(); this.config = config; this.profile = profile; this.dependencies = dependencies;  }
  override get connected(): boolean { return this.ready && this.#socket?.open === true; }
  protected async connectCore(): Promise<void> { this.#socket = await (this.dependencies.socketFactory ?? nodeSocketFactory)(this.config.websocketAddress, 3000); this.#socket.onMessage(() => {}); this.#encoder.reset(); }
  protected async motionCore(frame: RuntimeMotionFrame): Promise<void> { const profile = typeof this.profile === 'function' ? this.profile() : this.profile; if (profile !== this.#profileReference) { this.#encoder.reset(); this.#profileReference = profile; } const text = this.#encoder.encode(frame, profile, this.config); if (text) await this.#socket?.send(text); }
  protected async signalCore(_value: SignalOutputValue): Promise<void> { throw new Error('TCode output requires a motion frame.'); }
  protected async stopCore(): Promise<void> { this.#encoder.reset(); await this.#socket?.send('DSTOP\n'); }
  protected async closeCore(): Promise<void> { const socket = this.#socket; this.#socket = null; await socket?.close(); }
}

export class SignalAdapter extends SerializedAdapter {
  #udp: UdpTransport | null = null;
  #socket: SocketChannel | null = null;
  #midi: MidiPortHandle | null = null;
  #mqtt: MqttTransport | null = null;
  readonly config: OutputDeviceConfig;
  readonly dependencies: OutputDependencies;
  constructor(config: OutputDeviceConfig, dependencies: OutputDependencies = {}) { super(); this.config = config; this.dependencies = dependencies;  }
  override get connected(): boolean {
    return this.ready && (this.config.type === 'WebSocketJson' ? this.#socket?.open === true : this.config.type === 'OscParameter' ? this.#udp?.connected === true : this.config.type === 'Mqtt' ? this.#mqtt?.connected === true : this.config.type === 'Midi' ? this.#midi !== null : true);
  }
  protected async connectCore(): Promise<void> {
    const config = this.config;
    if (config.type === 'OscParameter') { this.#udp = new UdpTransport(config.signal.vrChat ? '127.0.0.1' : config.host, config.signal.vrChat ? 9000 : config.port); await this.#udp.connect(); }
    else if (config.type === 'WebSocketJson') { this.#socket = await (this.dependencies.socketFactory ?? nodeSocketFactory)(config.websocketAddress, 3000); this.#socket.onMessage(() => {}); }
    else if (config.type === 'HttpJson') endpoint(config.websocketAddress, ['http:', 'https:']);
    else if (config.type === 'Midi') { this.#midi = await (this.dependencies.midiFactory ?? nodeMidiFactory).open(config.signal.midiPortName); this.#midi.claim?.(config.signal.bindings.map(binding => encodeMidi({ address: binding.address, value: binding.stopValue, type: binding.valueType as 'Float' | 'Int' | 'Bool' }))); }
    else if (config.type === 'Mqtt') { this.#mqtt = new MqttTransport(config); await this.#mqtt.connect(); }
  }
  protected async signalCore(sample: SignalOutputValue): Promise<void> {
    if (this.config.type === 'OscParameter') await this.#udp?.send(encodeOsc(sample));
    else if (this.config.type === 'Midi') await this.#midi?.send([...encodeMidi(sample)]);
    else if (this.config.type === 'Mqtt') await this.#mqtt?.publish(this.config.signal.mqttTopicPrefix + sample.address, encodeJson({ ...sample, address: this.config.signal.mqttTopicPrefix + sample.address }));
    else if (this.config.type === 'WebSocketJson') await this.#socket?.send(new TextDecoder().decode(encodeJson(sample)));
    else if (this.config.type === 'HttpJson') {
      const payload = encodeJson(sample); if (payload.length > 65536) throw new RangeError('Output payload exceeds 64 KiB.');
      // Finish the acknowledged request before a queued stop target is sent.
      const response = await (this.dependencies.fetch ?? fetch)(this.config.websocketAddress, { method: 'POST', headers: { 'content-type': 'application/json' }, body: payload, signal: AbortSignal.timeout(3000), redirect: 'error' });
      try { if (!response.ok) throw new Error(`HTTP output rejected the command (HTTP ${response.status}).`); }
      finally { await response.body?.cancel(); }
    }
  }
  protected async motionCore(_frame: RuntimeMotionFrame): Promise<void> { throw new Error('This output requires configured signal bindings.'); }
  protected async stopCore(): Promise<void> { /* Per-binding stop values are owned by the coordinator. */ }
  protected async closeCore(): Promise<void> { await Promise.allSettled([this.#udp?.close(), this.#socket?.close(), this.#midi?.close(), this.#mqtt?.close()]); this.#udp = null; this.#socket = null; this.#midi = null; this.#mqtt = null; }
}

class MqttTransport extends TcpTransport {
  #buffer: Uint8Array = new Uint8Array();
  #accepted: (() => void) | null = null;
  #rejected: ((error: Error) => void) | null = null;
  #remove: (() => void) | null = null;
  #heartbeat: ReturnType<typeof setInterval> | null = null;
  #awaitingPong = false;
  readonly config: OutputDeviceConfig;
  constructor(config: OutputDeviceConfig) { super(config.host, config.port, 3000, config.signal.mqttUseTls); this.config = config;  }
  override async connect(): Promise<void> {
    await super.connect();
    const accepted = new Promise<void>((resolve, reject) => { this.#accepted = resolve; this.#rejected = reject; });
    this.#remove = this.onData(value => this.consume(value));
    try {
      await super.send(encodeMqttConnect(this.config.signal.mqttClientId || 'sensa-' + this.config.id));
      await deadline(accepted, 3000, 'MQTT acknowledgement', () => { void this.close(); });
      this.#heartbeat = setInterval(() => { if (this.#awaitingPong) { void this.close(); return; } this.#awaitingPong = true; void super.send(Uint8Array.of(0xc0, 0)).catch(() => this.close()); }, 15000);
      this.#heartbeat.unref?.();
    } catch (error) { await this.close(); throw error; }
  }
  consume(chunk: Uint8Array): void {
    if (this.#buffer.length + chunk.length > 65541) { this.#rejected?.(new Error('MQTT packet exceeds 64 KiB.')); void this.close(); return; }
    this.#buffer = concatBytes(this.#buffer, chunk);
    while (this.#buffer.length >= 2) {
      const header = this.#buffer[0]; let length = 0, multiplier = 1, index = 1, complete = false;
      for (; index < Math.min(5, this.#buffer.length); index++) {
        const digit = this.#buffer[index]; if (digit === undefined) return;
        length += (digit & 127) * multiplier; multiplier *= 128;
        if (!(digit & 128)) { index++; complete = true; break; }
      }
      if (!complete) { if (index === 5) { this.#rejected?.(new Error('Invalid MQTT packet length.')); void this.close(); } return; }
      if (length > 65536) { this.#rejected?.(new Error('MQTT packet exceeds 64 KiB.')); void this.close(); return; }
      if (this.#buffer.length < index + length) return;
      const data = this.#buffer.slice(index, index + length); this.#buffer = this.#buffer.slice(index + length);
      if (header === 0x20 && data.length === 2 && data[0] === 0 && data[1] === 0 && this.#accepted) { this.#accepted(); this.#accepted = null; this.#rejected = null; }
      else if (header === 0xd0 && !data.length && !this.#accepted) this.#awaitingPong = false;
      else { this.#rejected?.(new Error('MQTT broker rejected the clean session or sent an unexpected packet.')); void this.close(); return; }
    }
  }
  async publish(topic: string, bytes: Uint8Array): Promise<void> { await this.sendFramed(encodeMqttPublish(topic, bytes), 131080); }
  override async close(): Promise<void> { if (this.#heartbeat) clearInterval(this.#heartbeat); this.#heartbeat = null; this.#remove?.(); this.#remove = null; this.#accepted = null; this.#rejected = null; this.#buffer = new Uint8Array(); await super.close(); }
}

export interface RecordingEntry { fileName: string; name: string; path: string; format: string; size: number; sizeBytes: number; durationMs: number; startOffsetMs: number; signals: string[]; createdAt: string; modifiedAt: string }
export class RecordingAdapter extends SerializedAdapter {
  readonly config: OutputDeviceConfig;
  readonly directory: string;
  readonly now: () => number;
  #segments = new FunscriptSegments();
  #file: Awaited<ReturnType<typeof open>> | null = null;
  #filename: string | null = null;
  #startedAt: number | null = null;
  #rows = 0;
  #bytes = 0;
  #full = false;
  #files: { fileName: string; signalId: string; segment: number; startOffsetMs: number; durationMs: number }[] = [];
  constructor(config: OutputDeviceConfig, directory: string, now: () => number = Date.now) { super(); this.config = config; this.directory = directory; this.now = now; }
  protected async connectCore(): Promise<void> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 }); this.#startedAt = null; this.#segments = new FunscriptSegments(); this.#rows = this.#bytes = 0; this.#full = false;
    if (this.config.signal.recordingFormat !== 'Funscript') {
      const name = this.safeName('session') + (this.config.signal.recordingFormat === 'Csv' ? '.csv' : '.jsonl'); this.#filename = name;
      this.#file = await open(path.join(this.directory, name), 'wx', 0o600);
      await this.#file.write(this.config.signal.recordingFormat === 'Csv' ? SESSION_CSV_HEADER + '\n' : '{"type":"sensa-session","format":1}\n');
      this.#files.push({ fileName: name, signalId: '', segment: 1, startOffsetMs: 0, durationMs: 0 });
    }
  }
  safeName(address: string): string { const label = (this.config.signal.recordingName || this.config.name || this.config.id || 'Sensa').replace(/[^a-zA-Z0-9_-]/gu, '_').slice(0, 40); return `${label}-${createHash('sha256').update(address).digest('hex').slice(0, 12)}-${this.now()}-${Math.random().toString(36).slice(2, 8)}`; }
  async recordSample(id: string, sample: ComputedSignalSample, value: number | null, now: number): Promise<void> { await this.lane.enqueue(async () => { this.requireReady(); await this.append(id, sample, value, now); }); }
  async append(id: string, sample: ComputedSignalSample, value: number | null, now: number): Promise<void> {
    this.#startedAt ??= now;
    if (this.config.signal.recordingFormat === 'Funscript') {
      for (const segment of this.#segments.append(id, sample, value, now)) await this.publish(segment);
      this.#full = this.#segments.full; return;
    }
    if (this.#full) return;
    if (!this.#file) throw new Error('Recording file is unavailable.');
    const row = encodeSessionRow({ timeMs: Math.max(0, now - this.#startedAt), signalId: id, rawValue: sample.value, value: sample.valid ? value : null, valid: sample.valid, reason: sample.reason, sourceKey: sample.sourceKey, coordinateFrame: sample.coordinateFrame }, this.config.signal.recordingFormat === 'Csv') + '\n';
    const size = Buffer.byteLength(row);
    if (++this.#rows > 250000 || this.#bytes + size > 64 * 1024 * 1024) { this.#full = true; await this.#file.sync(); return; }
    await this.#file.write(row); this.#bytes += size;
  }
  protected async signalCore(sample: SignalOutputValue): Promise<void> {
    await this.append(sample.address || sample.signalId || 'value', { value: sample.value, valid: true, reason: '', sourceKey: null, timestampMs: sample.timestampMs ?? this.now(), coordinateFrame: sample.coordinateFrame ?? null, originKey: null }, sample.value, sample.timestampMs ?? this.now());
  }
  protected async motionCore(_frame: RuntimeMotionFrame): Promise<void> { throw new Error('Recording uses signal bindings.'); }
  async publish(segment: FunscriptSegment): Promise<void> {
    if (!segment.actions.length) return;
    const name = this.safeName(segment.signalId) + '.funscript', target = path.join(this.directory, name), temporary = target + '.partial';
    const file = await open(temporary, 'wx', 0o600);
    try { await file.writeFile(JSON.stringify({ version: '1.0', inverted: false, range: 100, actions: segment.actions, metadata: { signalId: segment.signalId, segment: segment.segment, startOffsetMs: segment.startOffsetMs } })); await file.sync(); }
    finally { await file.close(); }
    await rename(temporary, target); this.#files.push({ fileName: name, signalId: segment.signalId, segment: segment.segment, startOffsetMs: segment.startOffsetMs, durationMs: segment.actions.at(-1)?.at ?? 0 });
  }
  protected async stopCore(): Promise<void> { for (const segment of this.#segments.complete(this.now())) await this.publish(segment); await this.#file?.sync(); }
  protected async closeCore(): Promise<void> { await this.#file?.close(); this.#file = null; }
  snapshot(): unknown { return { fileName: this.#filename ?? this.#files.at(-1)?.fileName ?? '', recordingFile: this.#filename ?? this.#files.at(-1)?.fileName ?? '', recordingFiles: [...this.#files], recordingFull: this.#full, recordingError: null }; }
}

export async function listRecordings(directory: string): Promise<RecordingEntry[]> {
  await mkdir(directory, { recursive: true, mode: 0o700 }); const result: RecordingEntry[] = [];
  for (const name of (await readdir(directory)).filter(candidate => /\.(funscript|jsonl|csv)$/u.test(candidate))) {
    const filename = path.join(directory, name), info = await lstat(filename); if (!info.isFile() || info.isSymbolicLink()) continue;
    result.push({ fileName: name, name, path: name, format: name.endsWith('.funscript') ? 'Funscript' : name.endsWith('.csv') ? 'Csv' : 'JsonLines', size: info.size, sizeBytes: info.size, durationMs: 0, startOffsetMs: 0, signals: [], createdAt: info.birthtime.toISOString(), modifiedAt: info.mtime.toISOString() });
  }
  return result.sort((left, right) => right.modifiedAt.localeCompare(left.modifiedAt)).slice(0, 200);
}
export async function readRecording(directory: string, name: string): Promise<string> {
  if (!name || name !== path.basename(name) || !/\.(funscript|jsonl|csv)$/u.test(name)) throw new Error('Choose a recording file from the recording list.');
  const filename = path.join(directory, name), metadata = await lstat(filename);
  if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error('Recording must be a regular file.');
  const file = await open(filename, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const maximum = 64 * 1024 * 1024, info = await file.stat();
    if (!info.isFile() || info.size > maximum || info.ino !== metadata.ino || info.dev !== metadata.dev) throw new RangeError('Recording file is invalid or too large.');
    // Keep the same bound if another local writer extends this already-open file.
    const chunks: Buffer[] = []; let length = 0;
    while (true) { const chunk = Buffer.allocUnsafe(Math.min(65536, maximum + 1 - length)), read = await file.read(chunk, 0, chunk.length, null); if (!read.bytesRead) break; length += read.bytesRead; if (length > maximum) throw new RangeError('Recording file is invalid or too large.'); chunks.push(chunk.subarray(0, read.bytesRead)); }
    return Buffer.concat(chunks, length).toString('utf8');
  }
  finally { await file.close(); }
}
