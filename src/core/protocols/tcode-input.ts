import type { ControlResult, ExternalControlCommand, ExternalControlSink, ProtocolInputConfig } from './input-types.ts';
export interface TCodeAxisInstruction { channel: string; value: number; intervalMs: number | null; speed: number | null }
export interface TCodeInstruction { commands: TCodeAxisInstruction[]; stop: boolean; queries: number[] }
export const maximumTCodeLineBytes = 4096;
export const maximumTCodeDurationMs = 60000;
export function parseTCodeLine(line: string): TCodeInstruction {
  if (line.length > maximumTCodeLineBytes || /[^\t\r\n\x20-\x7e]/.test(line)) throw new Error('TCode requires a bounded ASCII line.');
  line = line.replace(/[\r\n]+$/, ''); if (/[\r\n]/.test(line)) throw new Error('Parse one complete TCode line at a time.');
  const commands = new Map<string, TCodeAxisInstruction>(), queries: number[] = []; let stop = false;
  for (const raw of line.split(/[ \t]+/).filter(Boolean)) {
    const token = raw.toUpperCase();
    if (token === 'DSTOP') { stop = true; continue; }
    if (/^D[012]$/.test(token)) { queries.push(Number(token[1])); continue; }
    const match = /^([LRVA][0-9])([0-9]+)(?:([IS])([0-9]+))?$/.exec(token);
    if (!match?.[1] || !match[2]) throw new Error('Unsupported TCode instruction or smooth-motion modifier.');
    const amount = match[4] === undefined ? null : Number(match[4]);
    if (amount !== null && (!Number.isInteger(amount) || amount > 2147483647)) throw new Error('Invalid TCode timing.');
    if (match[3] === 'I' && amount !== null && amount > maximumTCodeDurationMs) throw new Error('TCode duration exceeds the input limit.');
    if (match[3] === 'S' && (amount === null || amount <= 0)) throw new Error('TCode speed must be positive.');
    commands.set(match[1], { channel: match[1], value: Math.min(Number(`0.${match[2]}`), 1 - Number.EPSILON / 2),
      intervalMs: match[3] === 'I' ? amount : null, speed: match[3] === 'S' ? amount : null });
  }
  if (stop && commands.size) throw new Error('A stop instruction cannot also start motion.');
  return { commands: [...commands.values()], stop, queries };
}
export class TCodeLineFramer {
  #pending = ''; #discarding = false;
  get pendingBytes(): number { return this.#pending.length; }
  reset(): void { this.#pending = ''; this.#discarding = false; }
  push(bytes: Uint8Array): string[] {
    const lines: string[] = [];
    for (const byte of bytes) {
      if (byte === 10 || byte === 13) { if (this.#discarding) this.#discarding = false; else if (this.#pending) lines.push(this.#pending); this.#pending = ''; continue; }
      if (this.#discarding) continue;
      if (byte > 127 || byte < 32 && byte !== 9 || this.#pending.length >= maximumTCodeLineBytes) {
        this.#pending = ''; this.#discarding = true; throw new Error('Invalid or oversized TCode frame; pending motion was discarded.');
      }
      this.#pending += String.fromCharCode(byte);
    }
    return lines;
  }
}
interface Trajectory { start: number; target: number; at: number; duration: number; knownStart: boolean }
export class TCodeInputSession {
  #targets = new Map<string, Trajectory>(); #acquired = false; #disposed = false; #epoch = 0; #lastAccepted: number;
  readonly config: ProtocolInputConfig; readonly sink: ExternalControlSink; readonly sessionId: string; readonly now: () => number;
  constructor(config: ProtocolInputConfig, sink: ExternalControlSink, sessionId: string, now: () => number = Date.now) {
    this.config = config; this.sink = sink; this.sessionId = sessionId; this.now = now; this.#lastAccepted = now();
    if (!config.features.length || config.features.some(feature => !/^[LRVA][0-9]$/.test(feature.channel))) throw new Error('TCode requires axis channels.');
  }
  get epoch(): number { return this.#epoch; }
  get remainingIdleTime(): number {
    const now = this.now(); let deadline = this.#lastAccepted + this.config.timeoutMs;
    for (const value of this.#targets.values()) deadline = Math.max(deadline, value.at + value.duration + this.config.timeoutMs);
    return this.#disposed ? 0 : Math.max(0, deadline - now);
  }
  tryAcquire(): ControlResult {
    if (this.#disposed) return { ok: false, error: 'The TCode session has ended.' };
    if (this.#acquired) return { ok: true };
    const result = this.sink.tryAcquire(this.config.id, this.sessionId); if (result.ok) { this.#acquired = true; this.#lastAccepted = this.now(); } return result;
  }
  processLine(line: string, expectedEpoch = this.#epoch): string {
    if (expectedEpoch !== this.#epoch) return 'ERR The pending TCode frame belongs to a cleared input generation.\n';
    const acquired = this.tryAcquire(); if (!acquired.ok) return `ERR ${acquired.error}\n`;
    try {
      const instruction = parseTCodeLine(line), now = this.now(), updates = new Map<string, Trajectory>(), commands: ExternalControlCommand[] = [];
      for (const command of instruction.commands) {
        if (!this.config.features.some(feature => feature.channel === command.channel)) throw new Error('TCode channel is not configured for this input.');
        const old = this.#targets.get(command.channel), known = !!old && (old.knownStart || now - old.at >= old.duration);
        const start = old ? trajectoryAt(old, now) : command.value; let duration = command.intervalMs ?? 0;
        if (command.speed !== null) {
          if (!known) throw new Error('A speed command needs a known previously commanded position.');
          duration = Math.ceil(Math.round(Math.abs(command.value - start) * 1000000 / command.speed * 1e9) / 1e9);
          if (duration > maximumTCodeDurationMs) throw new Error('TCode speed would exceed the input duration limit.');
        }
        commands.push({ channel: command.channel, value: command.value, durationMs: duration });
        updates.set(command.channel, { start, target: command.value, at: now, duration, knownStart: known || duration === 0 });
      }
      if (instruction.stop) this.stop();
      if (commands.length) {
        const result = this.sink.publish(this.config.id, this.sessionId, commands); if (!result.ok) throw new Error(result.error);
        for (const [channel, trajectory] of updates) this.#targets.set(channel, trajectory);
      }
      if (commands.length || instruction.stop || instruction.queries.length) { this.#lastAccepted = now; this.heartbeat(); }
      return instruction.queries.map(query => query === 0 ? 'Sensa external control bridge\n' : query === 1 ? 'TCode v0.3\n'
        : this.config.features.map(feature => feature.channel).sort().map(channel => `${channel} 0 9999\n`).join('')).join('');
    } catch (error) { this.stop(); return `ERR ${error instanceof Error ? error.message : 'Invalid TCode command.'}\n`; }
  }
  stop(): void { if (this.#acquired && !this.#disposed) this.sink.stop(this.config.id, this.sessionId); this.#targets.clear(); }
  resetMotionBaseline(): void { this.#targets.clear(); this.#epoch++; this.#lastAccepted = this.now(); }
  resetCommands(): void { this.#epoch++; this.stop(); this.#lastAccepted = this.now(); }
  heartbeat(): void { if (this.#acquired && !this.#disposed) this.sink.heartbeat(this.config.id, this.sessionId); }
  dispose(): void { if (this.#disposed) return; this.stop(); this.#disposed = true; if (this.#acquired) this.sink.release(this.config.id, this.sessionId); this.#acquired = false; }
}
function trajectoryAt(value: Trajectory, now: number): number { return value.duration <= 0 ? value.target : value.start + (value.target - value.start) * Math.max(0, Math.min(1, (now - value.at) / value.duration)); }
