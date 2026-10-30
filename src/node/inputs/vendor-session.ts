import { createHash, randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { ExternalControlCommand, ExternalControlSink, ProtocolInputConfig } from '../../core/protocols/input-types.ts';
import { ExternalControlStore } from '../../core/protocols/external-control.ts';
import { maximumProtocolScriptDurationMs, parseProtocolScript } from '../../core/protocols/script-input.ts';
import type { ProtocolScriptTrajectory } from '../../core/protocols/script-input.ts';
import { downloadProtocolScript, InputHttpError, readJsonBody, readScriptFile } from './http-utils.ts';
import { inputBoolean, inputNumber, inputText } from './http-session.ts';
import type { HttpInputOptions, InputReply } from './http-session.ts';
/** Selectable-endpoint Autoblow/VacuGlide APIs retain script, speed and finite-task semantics. */
export class VendorInputSession {
  readonly config: ProtocolInputConfig; readonly sink: ExternalControlSink; readonly now: () => number; readonly downloadScript: typeof downloadProtocolScript;
  #instance = randomUUID(); #owner: string | null = null; #session: string | null = null; #lastActivity = 0; #disposed = false;
  #scripts = new Map<string, ProtocolScriptTrajectory>(); #script: ProtocolScriptTrajectory | null = null; #scriptToken = '';
  #mode = 'ONLINE_CONNECTED'; #started = 0; #taskStarted = 0; #positionMs = 0; #offset = 0; #low = 0; #high = 1; #speed = 0; #loop = false;
  #positionKnown = false; #motionStart = 0; #motionTarget = 0; #motionAt = 0; #motionDuration = 0; #generation = 0; #fetch: AbortController | null = null;
  #clear = (): void => this.resetCommands();
  constructor(config: ProtocolInputConfig, sink: ExternalControlSink, options: HttpInputOptions = {}) {
    this.config = config; this.sink = sink; this.now = options.now ?? Date.now; this.downloadScript = options.downloadScript ?? downloadProtocolScript;
    if (sink instanceof ExternalControlStore) sink.onCommandsCleared.add(this.#clear);
  }
  get vacu(): boolean { return this.config.type === 'VacuGlideHttp'; }
  #feature(actuator: string): string {
    const feature = this.config.features.find(value => value.actuator === actuator); if (!feature) throw new InputHttpError(422, `Configure a ${actuator} feature for this operation.`); return feature.channel;
  }
  #scriptFeature(): { channel: string; position: boolean } {
    const position = this.config.features.find(value => value.actuator === 'Position');
    if (position) return { channel: position.channel, position: true };
    if (this.vacu) return { channel: this.#feature('Scalar'), position: false };
    throw new InputHttpError(422, 'Autoblow script trajectories require a Position feature.');
  }
  #acquire(identity: string): void {
    if (this.#disposed) throw new InputHttpError(503, 'The input has stopped.');
    if (this.#session && !['SYNC_SCRIPT_PLAYING', 'TARGET_SPEED_PLAYING', 'OSCILLATOR_PLAYING', 'GO_TO'].includes(this.#mode)
      && this.now() - this.#lastActivity >= this.config.timeoutMs) this.#release();
    if (this.#owner && this.#owner !== identity) throw new InputHttpError(409, 'Another source owns this input.');
    const session = this.#session ?? `${this.#instance}:${createHash('sha256').update(identity).digest('hex')}`;
    const acquired = this.sink.tryAcquire(this.config.id, session); if (!acquired.ok) throw new InputHttpError(409, acquired.error);
    this.#owner = identity; this.#session = session; this.#lastActivity = this.now();
  }
  async handle(req: IncomingMessage, path: string, identity: string): Promise<InputReply> {
    if (this.#disposed) throw new InputHttpError(503, 'The input has stopped.');
    const prefix = this.vacu ? '/vacuglide' : '/autoblow';
    path = path.replace(/\/+$/, ''); if (!path.startsWith(`${prefix}/`)) throw new InputHttpError(404, 'Unknown API endpoint.');
    const operation = path.slice(prefix.length), method = req.method ?? 'GET';
    if (method === 'GET') {
      if (!['/connected', '/info', '/state'].includes(operation)) throw new InputHttpError(405, 'This operation requires PUT.');
      return { status: 200, body: operation === '/connected' ? { connected: true, deviceType: this.vacu ? 'vacuglide' : 'autoblow-ultra', emulated: true }
        : operation === '/info' ? { deviceType: this.vacu ? 'vacuglide' : 'autoblow-ultra', firmwareStatus: 'EMULATED', firmwareVersion: 'Sensa', hardwareVersion: 'virtual', emulated: true } : this.state() };
    }
    if (method !== 'PUT') throw new InputHttpError(405, 'Use GET or PUT as documented.');
    const upload = ['/sync-script/upload-csv', '/sync-script/upload-funscript'].includes(operation), download = ['/sync-script/upload-csv-url', '/sync-script/upload-funscript-url'].includes(operation);
    if (upload || download) {
      this.#acquire(identity); this.resetCommands(); const generation = this.#generation, controller = new AbortController(); this.#fetch = controller;
      try {
        const csv = operation.includes('-csv');
        const script = upload ? parseProtocolScript(await readScriptFile(req), csv)
          : await this.downloadScript(inputText(await readJsonBody(req), 'url'), csv, { signal: controller.signal });
        if (this.#disposed || generation !== this.#generation || this.#owner !== identity) throw new InputHttpError(409, 'Script preparation was superseded.');
        if (this.#scripts.size >= 8) { const key = this.#scripts.keys().next().value; if (key) this.#scripts.delete(key); }
        this.#scriptToken = randomUUID(); this.#scripts.set(this.#scriptToken, script); this.#script = script; this.#positionMs = 0; this.#loop = false; this.#mode = 'SYNC_SCRIPT_PAUSED'; this.#lastActivity = this.now();
      } finally { if (this.#fetch === controller) this.#fetch = null; }
      return { status: 200, body: this.state() };
    }
    const body = await readJsonBody(req); this.#acquire(identity); return { status: 200, body: this.command(operation, body) };
  }
  command(operation: string, body: Record<string, unknown>): unknown {
    if (operation === '/sync-script/load-token') {
      const token = inputText(body, 'scriptToken'), script = this.#scripts.get(token); if (!script) throw new InputHttpError(404, 'Unknown local script token.');
      this.resetCommands(); this.#scriptToken = token; this.#script = script; this.#positionMs = 0; this.#loop = false; this.#mode = 'SYNC_SCRIPT_PAUSED';
    } else if (operation === '/sync-script/loop') {
      const loop = inputBoolean(body, 'loop'); if (loop && (!this.#script || this.#script.durationMs <= 0)) throw new InputHttpError(400, 'Load a script with a positive duration before looping.');
      this.#positionMs = this.#currentTime(); this.#started = this.now(); this.#loop = loop;
    } else if (operation === '/sync-script/start') {
      if (!this.#script) throw new InputHttpError(400, 'SYNC_SCRIPT_NOT_LOADED'); this.#scriptFeature(); const start = inputNumber(body, 'startTimeMs', 0, maximumProtocolScriptDurationMs, true);
      this.resetCommands(); this.#positionMs = start; this.#taskStarted = this.#started = this.now(); this.#mode = 'SYNC_SCRIPT_PLAYING'; this.#publishCurrent();
    } else if (operation === '/sync-script/stop') { this.#positionMs = this.#currentTime(); this.resetCommands(); this.#mode = 'SYNC_SCRIPT_PAUSED'; }
    else if (operation === '/sync-script/offset') { this.#offset = inputNumber(body, 'offsetTimeMs', -600000, 600000, true); if (this.#mode === 'SYNC_SCRIPT_PLAYING') this.#publishCurrent(); }
    else if (operation === '/goto' && !this.vacu) {
      const target = inputNumber(body, 'position', 0, 100) / 100, speed = inputNumber(body, 'speed', 0, 100) / 100; const channel = this.#feature('Position');
      if (!speed) { this.resetCommands(); this.#speed = 0; } else {
        const current = this.#knownPosition(), duration = this.#duration(current, target, speed); this.resetCommands(); this.#establish(current); this.#mode = 'GO_TO'; this.#speed = speed; this.#publish([{ channel, value: target, durationMs: duration }]);
      }
    } else if (operation === '/oscillate' && !this.vacu) {
      const speed = inputNumber(body, 'speed', 0, 100) / 100, low = inputNumber(body, 'minY', 0, 100) / 100, high = inputNumber(body, 'maxY', 0, 100) / 100;
      if (high - low < .1 - Number.EPSILON) throw new InputHttpError(400, 'Oscillator endpoints must be at least 10 percent apart.');
      this.#feature('Position'); const origin = speed > 0 ? this.#knownPosition() : 0;
      this.resetCommands(); this.#speed = speed; this.#low = low; this.#high = high; this.#mode = 'OSCILLATOR_PAUSED';
      if (speed > 0) { this.#establish(origin); this.#mode = 'OSCILLATOR_PLAYING'; this.#oscillate(); }
    } else if (operation === '/oscillate/start' && !this.vacu) {
      if (this.#speed <= 0) throw new InputHttpError(400, 'Set a positive oscillator speed first.'); this.#knownPosition(); this.#mode = 'OSCILLATOR_PLAYING'; this.#oscillate();
    } else if (operation === '/oscillate/stop' && !this.vacu) { this.resetCommands(); this.#mode = 'OSCILLATOR_PAUSED'; }
    else if (operation === '/target-speed' && this.vacu) {
      const intensity = inputNumber(body, 'targetSpeed', 0, 100) / 100, channel = this.#feature('Scalar'); this.resetCommands(); this.#mode = 'TARGET_SPEED_PLAYING'; this.#speed = intensity; this.#publish([{ channel, value: intensity }]);
    } else if (operation === '/target-speed/stop' && this.vacu) { this.resetCommands(); this.#speed = 0; this.#mode = 'TARGET_SPEED_PAUSED'; }
    else throw new InputHttpError(404, 'This API operation is not implemented for this input type.');
    return this.state();
  }
  #currentTime(): number {
    const at = this.#mode === 'SYNC_SCRIPT_PLAYING' ? this.#positionMs + this.now() - this.#started : this.#positionMs;
    return this.#loop && this.#script && this.#script.durationMs > 0 ? at % this.#script.durationMs : Math.min(maximumProtocolScriptDurationMs, at);
  }
  #publishCurrent(): void {
    const script = this.#script; if (!script) return; const feature = this.#scriptFeature(); let at = this.#currentTime() + this.#offset;
    at = this.#loop && script.durationMs > 0 ? ((at % script.durationMs) + script.durationMs) % script.durationMs : Math.max(0, Math.min(script.durationMs, at));
    this.#publish([{ channel: feature.channel, value: feature.position ? script.sample(at) : Math.min(1, Math.max(0, script.speedPerSecond(at))) }]);
  }
  #publish(commands: ExternalControlCommand[]): void {
    if (!this.#session || !this.sink.publish(this.config.id, this.#session, commands).ok) { this.#release(); throw new InputHttpError(409, 'The control lease is unavailable.'); }
    const first = commands[0]; if (first && this.config.features.find(feature => feature.channel === first.channel)?.actuator === 'Position') {
      this.#motionStart = this.#positionKnown ? this.#position() : first.value; this.#motionTarget = first.value; this.#motionAt = this.now(); this.#motionDuration = first.durationMs ?? 0; this.#positionKnown = true;
    }
  }
  #position(): number { return this.#motionDuration === 0 ? this.#motionTarget : this.#motionStart + (this.#motionTarget - this.#motionStart) * Math.max(0, Math.min(1, (this.now() - this.#motionAt) / this.#motionDuration)); }
  #knownPosition(): number { if (!this.#positionKnown) throw new InputHttpError(422, 'The starting position is unknown; first play a position script.'); return this.#position(); }
  #establish(position: number): void { this.#positionKnown = true; this.#motionStart = this.#motionTarget = position; this.#motionDuration = 0; this.#motionAt = this.now(); }
  #duration(from: number, to: number, speed: number): number { const duration = Math.ceil(Math.abs(to - from) / (speed * this.config.maxSpeedPerSecond) * 1000); if (!Number.isFinite(duration) || duration > 600000) throw new InputHttpError(422, 'The calibrated move would exceed ten minutes.'); return Math.max(1, duration); }
  #oscillate(): void { const current = this.#knownPosition(), target = this.#motionTarget >= this.#high ? this.#low : this.#high; this.#publish([{ channel: this.#feature('Position'), value: target, durationMs: this.#duration(current, target, this.#speed) }]); }
  tick(): void {
    if (this.#disposed || !this.#session) return; const now = this.now();
    if (this.#mode === 'SYNC_SCRIPT_PLAYING' && now - this.#taskStarted >= this.config.maxScriptDurationMs) { this.resetCommands(); this.#mode = 'SYNC_SCRIPT_PAUSED'; this.#lastActivity = now; return; }
    if (['TARGET_SPEED_PLAYING', 'OSCILLATOR_PLAYING', 'GO_TO'].includes(this.#mode) && now - this.#lastActivity >= this.config.timeoutMs) { this.#release(); return; }
    if (['SYNC_SCRIPT_PLAYING', 'TARGET_SPEED_PLAYING', 'OSCILLATOR_PLAYING', 'GO_TO'].includes(this.#mode)) {
      this.sink.heartbeat(this.config.id, this.#session);
      try {
        if (this.#mode === 'SYNC_SCRIPT_PLAYING') {
          this.#publishCurrent(); if (!this.#loop && this.#script && this.#currentTime() + this.#offset >= this.#script.durationMs) { const end = this.#script.durationMs; this.resetCommands(); this.#positionMs = end; this.#mode = 'SYNC_SCRIPT_PAUSED'; this.#lastActivity = now; }
        } else if (this.#mode === 'OSCILLATOR_PLAYING') { if (now - this.#motionAt >= this.#motionDuration) this.#oscillate(); }
        else if (this.#mode === 'GO_TO') { if (now - this.#motionAt >= this.#motionDuration) { this.#mode = 'ONLINE_CONNECTED'; this.#lastActivity = now; } }
        else this.#publish([{ channel: this.#feature('Scalar'), value: this.#speed }]);
      } catch { this.#release(); }
    } else if (now - this.#lastActivity >= this.config.timeoutMs) this.#release();
  }
  state(): Record<string, unknown> {
    return { operationalMode: this.#mode, position: this.#positionKnown ? this.#position() * 100 : null, oscillatorTargetSpeed: this.#speed * 100,
      oscillatorLowPoint: this.#low * 100, oscillatorHighPoint: this.#high * 100, targetSpeed: this.#speed * 100, syncScriptCurrentTime: this.#currentTime(),
      syncScriptOffsetTime: this.#offset, syncScriptToken: this.#scriptToken, syncScriptLoop: this.#loop, emulated: true,
      scriptScalarConversion: 'clamp(abs(delta position01) / delta seconds, 0, 1)', maxSpeedPerSecond: this.config.maxSpeedPerSecond };
  }
  resetCommands(): void { this.#generation++; this.#fetch?.abort(); this.#fetch = null; if (this.#session) this.sink.stop(this.config.id, this.#session); if (this.#mode === 'SYNC_SCRIPT_PLAYING') this.#positionMs = this.#currentTime(); this.#positionKnown = false; this.#mode = this.#script ? 'SYNC_SCRIPT_PAUSED' : 'ONLINE_CONNECTED'; }
  #release(): void { this.resetCommands(); if (this.#session) this.sink.release(this.config.id, this.#session); this.#session = this.#owner = null; this.#script = null; this.#scriptToken = ''; this.#scripts.clear(); this.#positionMs = 0; this.#loop = false; }
  dispose(): void { if (this.#disposed) return; this.#disposed = true; this.#release(); if (this.sink instanceof ExternalControlStore) this.sink.onCommandsCleared.delete(this.#clear); }
}
