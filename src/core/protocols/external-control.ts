import { validateProtocolInputs } from './input-types.ts';
import type { ControlResult, ExternalControlBatch, ExternalControlCommand, ExternalControlSink, ProtocolInputConfig, ProtocolSample } from './input-types.ts';

interface Trajectory { command: Required<ExternalControlCommand>; start: number; at: number; sequence: number }
interface Source { config: ProtocolInputConfig; session: string | null; lastSeen: number; count: number; channels: Map<string, Trajectory> }
export interface ExternalControlEvents {
  onBatch?: (batch: ExternalControlBatch) => void;
  onStop?: (inputId: string, channel: string | null, sequence: number) => void;
  onChanged?: () => void;
  onCleared?: () => void;
}
const success: ControlResult = { ok: true };
const fail = (error: string): ControlResult => ({ ok: false, error });
const invalid = (reason: string): ProtocolSample => ({ value: null, valid: false, reason, timestampMs: 0,
  sourceKey: null, originKey: null, coordinateFrame: null });
/** Pure lease/trajectory owner. Hosts call expire() from their scheduling adapter. */
export class ExternalControlStore implements ExternalControlSink {
  #sources = new Map<string, Source>();
  #sequence = 0;
  #disposed = false;
  readonly events: ExternalControlEvents;
  readonly onCommandsCleared = new Set<() => void>();
  readonly onBatch = new Set<(batch: ExternalControlBatch) => void>();
  readonly onStop = new Set<(inputId: string, channel: string | null, sequence: number) => void>();
  readonly now: () => number;
  constructor(inputs: readonly ProtocolInputConfig[] = [], now: () => number = Date.now, events: ExternalControlEvents = {}) {
    this.now = now; this.events = events; this.configure(inputs);
  }
  configure(inputs: readonly ProtocolInputConfig[]): void {
    const previous = [...this.#sources.keys()];
    const configs = validateProtocolInputs(inputs);
    this.#sequence++;
    this.#sources = new Map(configs.filter(input => input.enabled).map(config => [config.id,
      { config, session: null, lastSeen: 0, count: 0, channels: new Map<string, Trajectory>() }]));
    for (const id of previous) this.#stopped(id, null);
    this.events.onChanged?.();
  }
  #deadline(source: Source): number {
    let until = source.lastSeen;
    if (['TCodeTcp', 'TCodeUdp', 'TCodeSerial', 'TCodeWebSocket', 'HandyHttp'].includes(source.config.type)) {
      for (const trajectory of source.channels.values()) until = Math.max(until, trajectory.at + trajectory.command.durationMs);
    }
    return until + source.config.timeoutMs;
  }
  tryAcquire(inputId: string, sessionId: string): ControlResult {
    this.expire();
    const source = this.#sources.get(inputId);
    if (this.#disposed || !source) return fail('Input is disabled.');
    if (!sessionId) return fail('Session identity is required.');
    if (source.session && source.session !== sessionId) return fail('Another client owns this input.');
    source.session = sessionId; source.lastSeen = this.now(); this.events.onChanged?.(); return success;
  }
  publish(inputId: string, sessionId: string, commands: readonly ExternalControlCommand[]): ControlResult {
    this.expire(); const source = this.#sources.get(inputId);
    if (this.#disposed || !source || source.session !== sessionId) return fail('The control session is unavailable.');
    if (commands.length < 1 || commands.length > 16) return fail('A command batch needs 1 to 16 channels.');
    const channels = new Set<string>();
    for (const command of commands) {
      const duration = command.durationMs ?? 0;
      if (!Number.isFinite(command.value) || command.value < 0 || command.value > 1 || !Number.isInteger(duration)
        || duration < 0 || duration > 600000 || channels.has(command.channel)
        || !source.config.features.some(feature => feature.channel === command.channel)) return fail('Invalid channel, value, duration or duplicate channel.');
      channels.add(command.channel);
    }
    const now = this.now(), sequence = ++this.#sequence;
    const accepted = commands.map(command => ({ channel: command.channel, value: command.value,
      durationMs: command.durationMs ?? 0, clockwise: command.clockwise ?? true }));
    for (const command of accepted) {
      const old = source.channels.get(command.channel);
      source.channels.set(command.channel, { command, start: old ? valueAt(old, now) : Number.NaN, at: now, sequence });
    }
    source.lastSeen = now; source.count += accepted.length;
    const batch = { inputId, sessionId, sequence, commands: accepted };
    this.events.onBatch?.(batch); for (const callback of this.onBatch) callback(batch); this.events.onChanged?.(); return success;
  }
  read(path: string, now = this.now()): ProtocolSample {
    const slash = path.indexOf('/'); if (slash <= 0) return invalid('Choose an input/channel.');
    const inputId = path.slice(0, slash), parts = path.slice(slash + 1).split('/'), channel = parts[0];
    const source = this.#sources.get(inputId), trajectory = channel ? source?.channels.get(channel) : undefined;
    if (!source?.session || !trajectory || now < source.lastSeen || now >= this.#deadline(source)) return invalid('Waiting for protocol input.');
    let value = Number.NaN;
    if (parts.length === 1 || parts.length === 2 && parts[1] === 'value') value = valueAt(trajectory, now);
    if (parts.length === 2 && (parts[1] === 'target' || parts[1] === 'speed')) value = trajectory.command.value;
    if (parts.length === 2 && parts[1] === 'clockwise') value = trajectory.command.clockwise ? 1 : 0;
    if (!Number.isFinite(value)) return invalid('The trajectory starting position is unknown, or the channel metric is invalid.');
    return { value, valid: true, reason: '', timestampMs: trajectory.at, sourceKey: null,
      originKey: `protocol:${inputId}:${source.session}:${path.slice(slash + 1)}`, coordinateFrame: null };
  }
  motionFrame(now = this.now()): { values: Record<string, number>; durations: Record<string, number>; activeAxes: string[] } {
    const values: Record<string, number> = {}, durations: Record<string, number> = {};
    for (const source of this.#sources.values()) {
      if (!source.session || !source.config.routeToMotion || now < source.lastSeen || now >= this.#deadline(source)) continue;
      for (const feature of source.config.features) {
        const target = source.channels.get(feature.channel);
        if (feature.targetAxis && target) { values[feature.targetAxis] = target.command.value; durations[feature.targetAxis] = target.command.durationMs; }
      }
    }
    return { values, durations, activeAxes: Object.keys(values) };
  }
  isCurrent(batch: ExternalControlBatch, channel: string): boolean {
    const source = this.#sources.get(batch.inputId), now = this.now();
    return !this.#disposed && !!source && source.session === batch.sessionId && now >= source.lastSeen
      && now < this.#deadline(source) && source.channels.get(channel)?.sequence === batch.sequence;
  }
  hasNewerCommand(inputId: string, channel: string | null, sequence: number): boolean {
    const source = this.#sources.get(inputId);
    return !!source && [...source.channels].some(([key, value]) => (channel === null || key === channel) && value.sequence > sequence);
  }
  stop(inputId: string, sessionId: string, channel?: string): void {
    const source = this.#sources.get(inputId); if (!source || source.session !== sessionId) return;
    if (channel === undefined) source.channels.clear(); else source.channels.delete(channel);
    source.lastSeen = this.now(); ++this.#sequence; this.#stopped(inputId, channel ?? null); this.events.onChanged?.();
  }
  release(inputId: string, sessionId: string): void {
    const source = this.#sources.get(inputId); if (!source || source.session !== sessionId) return;
    source.session = null; source.channels.clear(); ++this.#sequence; this.#stopped(inputId, null); this.events.onChanged?.();
  }
  heartbeat(inputId: string, sessionId: string): void {
    this.expire(); const source = this.#sources.get(inputId); if (source?.session === sessionId) source.lastSeen = this.now();
  }
  clearCommands(): void { this.#sequence++; for (const source of this.#sources.values()) source.channels.clear(); this.events.onCleared?.(); for (const callback of this.onCommandsCleared) callback(); }
  expire(): void {
    const now = this.now(); let changed = false;
    for (const [id, source] of this.#sources) if (source.session && (now < source.lastSeen || now >= this.#deadline(source))) {
      source.session = null; source.channels.clear(); changed = true; ++this.#sequence; this.#stopped(id, null);
    }
    if (changed) this.events.onChanged?.();
  }
  getStatus(inputId: string): { session: string | null; receivedCommands: number; channels: string[] } | null {
    const source = this.#sources.get(inputId);
    return source ? { session: source.session, receivedCommands: source.count, channels: [...source.channels.keys()] } : null;
  }
  getInput(inputId: string): ProtocolInputConfig | undefined { const source = this.#sources.get(inputId); return source ? structuredClone(source.config) : undefined; }
  snapshot(): Record<string, unknown>[] {
    return [...this.#sources.values()].map(source => ({ id: source.config.id, name: source.config.name, type: source.config.type,
      enabled: true, connected: source.session !== null, session: source.session, receivedCommands: source.count, channels: [...source.channels.keys()] }));
  }
  dispose(): void { if (this.#disposed) return; this.#disposed = true; this.configure([]); }
  #stopped(id: string, channel: string | null): void { this.events.onStop?.(id, channel, this.#sequence); for (const callback of this.onStop) callback(id, channel, this.#sequence); }
}
function valueAt(trajectory: Trajectory, now: number): number {
  if (trajectory.command.durationMs <= 0 || now - trajectory.at >= trajectory.command.durationMs) return trajectory.command.value;
  return trajectory.start + (trajectory.command.value - trajectory.start) * Math.min(1, Math.max(0, (now - trajectory.at) / trajectory.command.durationMs));
}
