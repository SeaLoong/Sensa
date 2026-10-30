import { createHash, randomUUID } from 'node:crypto';
import type { ExternalControlCommand, ExternalControlSink, ProtocolFeatureConfig, ProtocolInputConfig } from '../../core/protocols/input-types.ts';
import { ExternalControlStore } from '../../core/protocols/external-control.ts';
import { jsonObject } from '../../core/protocols/strict-json.ts';
import type { ProtocolScriptTrajectory } from '../../core/protocols/script-input.ts';
import { downloadProtocolScript, InputHttpError } from './http-utils.ts';
export interface InputReply { status: number; body: unknown }
export interface HttpInputOptions { now?: () => number; downloadScript?: typeof downloadProtocolScript }
interface Effect { commands: ExternalControlCommand[]; started: number; duration: number; running: number; pause: number; isRunning: boolean }
interface Motion { start: number | null; target: number; at: number; duration: number }
const result = (body: unknown): InputReply => ({ status: 200, body });
export function inputNumber(body: Record<string, unknown>, key: string, low: number, high: number, integer = false): number {
  const value = body[key]; if (typeof value !== 'number' || !Number.isFinite(value) || value < low || value > high || integer && !Number.isInteger(value)) throw new InputHttpError(400, `${key} must be a finite ${integer ? 'integer' : 'number'} within range.`); return value;
}
export function inputText(body: Record<string, unknown>, key: string): string { const value = body[key]; if (typeof value !== 'string' || !value.length || value.length > 4096) throw new InputHttpError(400, `${key} must be a nonempty string.`); return value; }
export function inputBoolean(body: Record<string, unknown>, key: string): boolean { const value = body[key]; if (typeof value !== 'boolean') throw new InputHttpError(400, `${key} must be boolean.`); return value; }
/** One HTTP input owns one client identity, finite task and asynchronous preparation generation. */
export class HttpInputSession {
  readonly config: ProtocolInputConfig; readonly sink: ExternalControlSink; readonly now: () => number;
  readonly downloadScript: typeof downloadProtocolScript;
  #owner: string | null = null; #session: string | null = null; #instance = randomUUID(); #lastActivity = 0; #disposed = false;
  #effect: Effect | null = null; #mode = 0; #minimum = 0; #maximum = 100; #offset = 0; #velocity = 0;
  #alternating = false; #motion: Motion | null = null; #finiteAt: number | null = null; #finiteDuration = 0;
  #script: ProtocolScriptTrajectory | null = null; #generation = 0; #preparation: AbortController | null = null;
  #playing = false; #loop = false; #scriptStarted = 0; #taskStarted = 0; #scriptStart = 0;
  #clear = (): void => this.resetCommands();
  constructor(config: ProtocolInputConfig, sink: ExternalControlSink, options: HttpInputOptions = {}) {
    this.config = config; this.sink = sink; this.now = options.now ?? Date.now; this.downloadScript = options.downloadScript ?? downloadProtocolScript;
    if (sink instanceof ExternalControlStore) sink.onCommandsCleared.add(this.#clear);
  }
  get disposed(): boolean { return this.#disposed; }
  #feature(channel: string): ProtocolFeatureConfig { const value = this.config.features.find(feature => feature.channel === channel); if (!value) throw new InputHttpError(400, 'This channel is not configured for the input.'); return value; }
  #actuator(type: string, index = 0): ProtocolFeatureConfig { const feature = this.config.features.filter(value => value.actuator === type)[index]; if (!feature) throw new InputHttpError(400, 'This actuator is not configured for the input.'); return feature; }
  #acquire(identity: string): void {
    if (this.#disposed) throw new InputHttpError(503, 'The input has stopped.');
    this.#expire(); if (this.#owner && this.#owner !== identity) throw new InputHttpError(409, 'Another source owns this input.');
    const session = this.#session ?? `${this.#instance}:${createHash('sha256').update(identity).digest('hex')}`;
    const acquired = this.sink.tryAcquire(this.config.id, session); if (!acquired.ok) throw new InputHttpError(409, acquired.error);
    this.#owner = identity; this.#session = session; this.#lastActivity = this.now();
  }
  #publish(identity: string, commands: ExternalControlCommand[]): void {
    this.#acquire(identity); const accepted = this.sink.publish(this.config.id, this.#session ?? '', commands);
    if (!accepted.ok) throw new InputHttpError(409, accepted.error); this.#lastActivity = this.now();
  }
  #stop(channel?: string): void { if (this.#session) this.sink.stop(this.config.id, this.#session, channel); }
  #release(): void { this.resetCommands(); if (this.#session) { this.#stop(); this.sink.release(this.config.id, this.#session); } this.#session = this.#owner = null; }
  releaseIdentity(identity: string): void { if (this.#owner === identity) this.#release(); }
  #expire(): void {
    const now = this.now(), finiteMove = this.#finiteAt !== null && now - this.#finiteAt < this.#finiteDuration + this.config.timeoutMs;
    const finiteEffect = this.#effect !== null && this.#effect.duration > 0 && now - this.#effect.started < this.#effect.duration;
    if (!this.#playing && !finiteEffect && !finiteMove && this.#session && now - this.#lastActivity >= this.config.timeoutMs) this.#release();
  }
  async process(path: string, method: string, rawBody: unknown, identity: string, query = new URLSearchParams()): Promise<InputReply> {
    if (this.#disposed) throw new InputHttpError(503, 'The input has stopped.');
    path = path.replace(/\/+$/, '') || '/';
    if (this.config.type === 'JsonHttp' || this.config.type === 'JsonWebSocket') return this.processJson(path, method, rawBody, identity);
    const body = jsonObject(rawBody);
    if (this.config.type === 'LovenseHttp') return this.#lovense(path, method, body, identity, query);
    if (this.config.type === 'HandyHttp') return await this.#handy(path, method, body, identity);
    throw new InputHttpError(404, 'This API operation is not supported.');
  }
  processJson(path: string, method: string, rawBody: unknown, identity: string): InputReply {
    if (this.#disposed) throw new InputHttpError(503, 'The input has stopped.');
    if ((path === '/' || path === '/status') && method === 'GET') return result({ ok: true, inputId: this.config.id, channels: this.config.features.map(feature => ({ channel: feature.channel, actuator: feature.actuator })) });
    if (!['POST', 'PUT'].includes(method)) throw new InputHttpError(405, 'Commands require POST or PUT.');
    const body = jsonObject(rawBody); if (!['/', '/command', '/commands', '/stop', '/heartbeat'].includes(path)) throw new InputHttpError(404, 'Unknown command endpoint.');
    const operation = 'command' in body ? inputText(body, 'command') : '';
    if (operation === 'status') return this.processJson('/status', 'GET', {}, identity);
    if (!['', 'stop', 'heartbeat'].includes(operation)) throw new InputHttpError(400, 'Unknown JSON control command.');
    if (path === '/stop' || operation === 'stop') {
      if ('commands' in body || 'value' in body) throw new InputHttpError(400, 'A stop request cannot also start a command.');
      const channel = 'channel' in body ? inputText(body, 'channel') : undefined; if (channel) this.#feature(channel);
      this.#acquire(identity); this.#stop(channel); return result({ ok: true });
    }
    if (path === '/heartbeat' || operation === 'heartbeat') { this.#acquire(identity); if (this.#session) this.sink.heartbeat(this.config.id, this.#session); return result({ ok: true }); }
    const source = 'commands' in body ? body['commands'] : [body];
    if (!Array.isArray(source) || source.length < 1 || source.length > 16) throw new InputHttpError(400, 'Use 1–16 commands per batch.');
    const commands = (source as unknown[]).map(raw => {
      const command = jsonObject(raw), key = 'channel' in command ? 'channel' : 'path' in command ? 'path' : 'address';
      const channel = inputText(command, key).replace(/^\/+/, ''); this.#feature(channel);
      return { channel, value: inputNumber(command, 'value', 0, 1), durationMs: 'durationMs' in command ? inputNumber(command, 'durationMs', 0, 600000, true) : 0,
        clockwise: !('clockwise' in command) || inputBoolean(command, 'clockwise') };
    });
    if (new Set(commands.map(command => command.channel)).size !== commands.length) throw new InputHttpError(400, 'Command channels must be unique in a batch.');
    this.#publish(identity, commands); return result({ ok: true, accepted: commands.length });
  }
  #lovense(path: string, method: string, body: Record<string, unknown>, identity: string, query: URLSearchParams): InputReply {
    const success = (): InputReply => result({ code: 200, type: 'OK' });
    if (path === '/command') {
      if (method !== 'POST') throw new InputHttpError(405, 'The command API requires POST.');
      const command = inputText(body, 'command');
      if (command === 'GetToys') return result({ code: 200, type: 'OK', data: { toys: JSON.stringify({ [this.config.id]: { id: this.config.id, name: 'Sensa Virtual Device', nickName: this.config.name, status: '1', version: '', capabilities: [...new Set(this.config.features.map(feature => feature.actuator))] } }), platform: 'sensa', appType: 'remote' } });
      if (command === 'GetToyName') return result({ code: 200, type: 'OK', data: ['Sensa Virtual Device'] });
      if (command !== 'Function') throw new InputHttpError(400, 'Unsupported Lovense command.');
      if ('apiVer' in body) inputNumber(body, 'apiVer', 1, 1, true); if ('toy' in body && inputText(body, 'toy') !== this.config.id) throw new InputHttpError(400, 'Unknown toy ID.');
      const action = inputText(body, 'action'), duration = seconds(body, 'timeSec', true), running = 'loopRunningSec' in body ? seconds(body, 'loopRunningSec', false) : 0,
        pause = 'loopPauseSec' in body ? seconds(body, 'loopPauseSec', false) : 0;
      if ((running === 0) !== (pause === 0)) throw new InputHttpError(400, 'Provide both loopRunningSec and loopPauseSec.');
      const stopPrevious = !('stopPrevious' in body) || inputNumber(body, 'stopPrevious', 0, 1, true) === 1;
      if (!stopPrevious && this.#effect) throw new InputHttpError(400, 'Concurrent timed Function effects are not supported.');
      if (action === 'Stop') { this.#acquire(identity); this.#effect = null; this.#stop(); return success(); }
      const commands = new Map<string, ExternalControlCommand>(); let all: number | null = null;
      const actions = action.split(','); if (actions.length > 16) throw new InputHttpError(400, 'Use 1–16 actions.');
      for (const actionEntry of actions) {
        const pair = /^(All|Vibrate|Rotate):(\d+)$/.exec(actionEntry); if (!pair?.[1] || !pair[2] || Number(pair[2]) > 20) throw new InputHttpError(400, 'Unsupported action or strength.');
        const strength = Number(pair[2]) / 20;
        if (pair[1] === 'All') { if (all !== null) throw new InputHttpError(400, 'Repeated All action.'); all = strength; continue; }
        const features = this.config.features.filter(feature => pair[1] === 'Vibrate' ? feature.actuator === 'Scalar' && feature.scalarType === 'Vibrate' : feature.actuator === 'Rotation');
        if (!features.length) throw new InputHttpError(400, 'This actuator is not configured.');
        for (const feature of features) { if (commands.has(feature.channel)) throw new InputHttpError(400, 'Repeated or overlapping action channel.'); commands.set(feature.channel, { channel: feature.channel, value: strength }); }
      }
      if (all !== null) for (const feature of this.config.features.filter(candidate => candidate.actuator === 'Rotation' || candidate.actuator === 'Scalar' && candidate.scalarType === 'Vibrate')) if (!commands.has(feature.channel)) commands.set(feature.channel, { channel: feature.channel, value: all });
      if (!commands.size) throw new InputHttpError(400, 'No compatible actuators are configured.');
      this.#acquire(identity); if (stopPrevious) { this.#effect = null; this.#stop(); } this.#publish(identity, [...commands.values()]);
      this.#effect = duration || running ? { commands: [...commands.values()], started: this.now(), duration, running, pause, isRunning: true } : null; return success();
    }
    if (method !== 'GET') throw new InputHttpError(405, 'This LAN operation requires GET.');
    if (query.getAll('v').length > 1 || query.getAll('t').length > 1) throw new InputHttpError(400, 'Repeated Lovense query field.');
    if (query.has('t') && query.get('t') !== this.config.id) throw new InputHttpError(400, 'Unknown toy ID.');
    if (path === '/Stop') { this.#acquire(identity); this.#effect = null; this.#stop(); return success(); }
    if (!['/Vibrate', '/Vibrate1', '/Vibrate2', '/Rotate', '/RotateClockwise', '/RotateAntiClockwise'].includes(path)) throw new InputHttpError(404, 'Unsupported Lovense LAN operation.');
    const raw = query.get('v') ?? ''; if (!/^\d+$/.test(raw) || Number(raw) > 20) throw new InputHttpError(400, 'v must be an integer from 0 to 20.');
    const feature = path.startsWith('/Vibrate') ? this.config.features.filter(value => value.actuator === 'Scalar' && value.scalarType === 'Vibrate')[path === '/Vibrate2' ? 1 : 0] : this.#actuator('Rotation');
    if (!feature) throw new InputHttpError(400, 'This vibration feature is not configured.');
    this.#publish(identity, [{ channel: feature.channel, value: Number(raw) / 20, clockwise: path !== '/RotateAntiClockwise' }]); this.#effect = null; return success();
  }
  async #handy(path: string, method: string, body: Record<string, unknown>, identity: string): Promise<InputReply> {
    path = path.replace(/^\/api\/(?:handy|handy-rest)\/v2(?=\/)/, '');
    if (method === 'GET') {
      const fields: Record<string, unknown> = { '/connected': { connected: this.config.enabled }, '/info': { fwVersion: '3.3.0', fwStatus: 0, hwVersion: 'virtual', model: 'Sensa Virtual Device', deviceName: this.config.name, virtualDevice: true },
        '/mode': { result: 0, mode: this.#mode }, '/slide': { result: 0, min: this.#minimum, max: this.#maximum }, '/settings': { result: 0, slideMin: this.#minimum, slideMax: this.#maximum },
        '/servertime': { serverTime: this.now() }, '/hstp/time': { result: 0, time: this.now() }, '/hstp/offset': { result: 0, offset: this.#offset }, '/hamp/velocity': { result: 0, velocity: this.#velocity },
        '/hssp/loop': { result: 0, activated: this.#loop }, '/hssp/state': { result: 0, state: this.#playing ? 4 : this.#script ? 3 : 0 }, '/hamp/state': { result: 0, state: this.#alternating ? 2 : 1 } };
      if (!(path in fields)) throw new InputHttpError(404, 'Unsupported Handy RESTv2 query.'); return result(fields[path]);
    }
    if (method !== 'PUT') throw new InputHttpError(405, 'Handy RESTv2 mutations require PUT.');
    const success = (): InputReply => result({ result: 0 });
    const mode = (value: number): void => { if (this.#mode !== value) throw new InputHttpError(409, 'Select the matching Handy operation mode first.'); };
    if (path === '/mode') { const value = inputNumber(body, 'mode', 0, 2, true); this.#acquire(identity); this.resetCommands(); this.#stop(); this.#mode = value; return success(); }
    if (path === '/slide') {
      if ('fixed' in body && inputBoolean(body, 'fixed')) throw new InputHttpError(400, 'Specify min and max instead of fixed-width slide translation.');
      const minimum = 'min' in body ? inputNumber(body, 'min', 0, 100) : this.#minimum, maximum = 'max' in body ? inputNumber(body, 'max', 0, 100) : this.#maximum;
      if (minimum >= maximum) throw new InputHttpError(400, 'The slide minimum must be less than its maximum.');
      this.#acquire(identity); this.#alternating = false; this.#freeze(); this.#stop(); this.#minimum = minimum; this.#maximum = maximum; return result({ result: 0, min: minimum, max: maximum });
    }
    if (path === '/hstp/offset') { const value = inputNumber(body, 'offset', -600000, 600000, true); this.#acquire(identity); this.#offset = value; return success(); }
    if (path === '/hdsp/xpt' || path === '/hdsp/xpvp') {
      mode(2); const position = inputNumber(body, 'position', 0, 100) / 100;
      let duration = path === '/hdsp/xpt' ? inputNumber(body, 'duration', 0, 600000, true) : 0;
      const speed = path === '/hdsp/xpvp' ? inputNumber(body, 'velocity', 0, 100) : 0;
      for (const key of ['stopOnTarget', 'immediateResponse']) if (key in body) inputBoolean(body, key);
      this.#acquire(identity); this.#alternating = false;
      if (path === '/hdsp/xpvp') { if (!speed) { this.#freeze(); this.#stop(); return result({ result: 3 }); } duration = this.#travel(position, speed); }
      this.#sendPosition(identity, position, duration, true); return result({ result: 1 });
    }
    if (path === '/hamp/velocity') {
      mode(0); const speed = inputNumber(body, 'velocity', 0, 100);
      if (speed > 0 && (this.#maximum - this.#minimum) / 100 / (this.config.maxSpeedPerSecond * speed / 100) * 1000 > 600000) throw new InputHttpError(400, 'A full alternating sweep exceeds the duration limit.');
      this.#acquire(identity); if (this.#alternating && this.#motion) { if (!speed) { this.#alternating = false; this.#freeze(); this.#stop(); } else this.#sendPosition(identity, this.#motion.target, this.#travel(this.#motion.target, speed)); }
      this.#velocity = speed; return result({ result: 0, velocity: speed });
    }
    if (path === '/hamp/start') {
      mode(0); this.#acquire(identity); if (!this.#velocity) return result({ result: 1, state: 1 });
      if ((this.#maximum - this.#minimum) / 100 / (this.config.maxSpeedPerSecond * this.#velocity / 100) * 1000 > 600000) throw new InputHttpError(400, 'A full alternating sweep exceeds the duration limit.');
      const current = this.#position(); if (current === null) throw new InputHttpError(409, 'Establish a commanded position with HDSP first.');
      const target = current <= (this.#minimum + this.#maximum) / 200 ? this.#maximum / 100 : this.#minimum / 100;
      this.#sendPosition(identity, target, this.#travel(target, this.#velocity)); this.#alternating = true; return result({ result: 0, state: 2 });
    }
    if (path === '/hamp/stop' || path === '/hssp/stop') { mode(path === '/hamp/stop' ? 0 : 1); this.#acquire(identity); this.resetCommands(); this.#stop(); return path === '/hamp/stop' ? result({ result: 0, state: 1 }) : success(); }
    if (path === '/hssp/loop') { mode(1); const loop = inputBoolean(body, 'activated'); this.#acquire(identity); this.#loop = loop; return success(); }
    if (path === '/hssp/setup') {
      mode(1); const url = inputText(body, 'url'), hash = 'sha256' in body ? inputText(body, 'sha256') : undefined;
      const format = 'format' in body ? inputText(body, 'format') : new URL(url).pathname.toLowerCase().endsWith('.funscript') ? 'funscript' : 'csv';
      if (!['csv', 'funscript'].includes(format) || hash && !/^[a-f\d]{64}$/i.test(hash)) throw new InputHttpError(400, 'Invalid script format or SHA-256.');
      this.#acquire(identity); this.resetCommands(); this.#script = null; this.#stop(); const generation = this.#generation, controller = new AbortController(); this.#preparation = controller;
      try {
        const script = await this.downloadScript(url, format === 'csv', { signal: controller.signal, ...(hash ? { sha256: hash } : {}) });
        if (this.#disposed || generation !== this.#generation || this.#owner !== identity || this.#mode !== 1) throw new InputHttpError(409, 'The script preparation was superseded.');
        this.#script = script; return result({ result: 1 });
      } finally { if (this.#preparation === controller) this.#preparation = null; }
    }
    if (path === '/hssp/play') {
      mode(1); const script = this.#script; if (!script) throw new InputHttpError(409, 'Prepare a script before playback.');
      const start = inputNumber(body, 'startTime', 0, script.durationMs, true), age = 'estimatedServerTime' in body ? this.now() - inputNumber(body, 'estimatedServerTime', 0, Number.MAX_SAFE_INTEGER, true) : 0;
      if (Math.abs(age) > 600000) throw new InputHttpError(400, 'The server-time estimate is outside the synchronization window.');
      this.#acquire(identity); this.resetCommands(); this.#taskStarted = this.#scriptStarted = this.now(); this.#scriptStart = Math.max(0, Math.min(script.durationMs, start + age)); this.#playing = true; this.#publishScript(); return success();
    }
    throw new InputHttpError(404, 'Unsupported Handy RESTv2 operation.');
  }
  #position(): number | null { const motion = this.#motion; if (!motion) return null; const elapsed = this.now() - motion.at; if (elapsed >= motion.duration) return motion.target; return motion.start === null ? null : motion.start + (motion.target - motion.start) * Math.max(0, Math.min(1, elapsed / motion.duration)); }
  #freeze(): void { const position = this.#position(); this.#finiteAt = null; this.#motion = position === null ? null : { start: position, target: position, at: this.now(), duration: 0 }; }
  #travel(target: number, speed: number): number {
    const current = this.#position(); if (current === null) throw new InputHttpError(409, 'A speed command needs a known commanded starting position.');
    const duration = Math.ceil(Math.abs(Math.min(this.#maximum / 100, Math.max(this.#minimum / 100, target)) - current) / (this.config.maxSpeedPerSecond * speed / 100) * 1000);
    if (!Number.isFinite(duration) || duration > 600000) throw new InputHttpError(400, 'The commanded movement exceeds the duration limit.'); return duration;
  }
  #sendPosition(identity: string, position: number, duration: number, finite = false): void {
    const current = this.#position(), target = Math.max(this.#minimum / 100, Math.min(this.#maximum / 100, position));
    this.#publish(identity, [{ channel: this.#actuator('Position').channel, value: target, durationMs: duration }]); this.#motion = { start: current, target, at: this.now(), duration }; this.#finiteAt = finite ? this.now() : null; this.#finiteDuration = duration;
  }
  #publishScript(): void {
    const script = this.#script, session = this.#session; if (!this.#playing || !script || !session) return;
    if (this.now() - this.#taskStarted >= this.config.maxScriptDurationMs) { this.#playing = false; this.#stop(this.#actuator('Position').channel); return; }
    const position = this.#scriptStart + this.now() - this.#scriptStarted + this.#offset; if (position < 0) return;
    const finished = position >= script.durationMs && !this.#loop, at = this.#loop && script.durationMs > 0 ? position % script.durationMs : Math.min(position, script.durationMs);
    const duration = finished ? 0 : Math.min(50, Math.max(0, script.durationMs - at));
    const target = Math.max(this.#minimum / 100, Math.min(this.#maximum / 100, script.sample(at + duration))), current = this.#position();
    const published = this.sink.publish(this.config.id, session, [{ channel: this.#actuator('Position').channel, value: target, durationMs: duration }]);
    if (!published.ok) { this.#release(); return; } this.#motion = { start: current, target, at: this.now(), duration };
    if (finished) { this.#playing = false; this.#stop(this.#actuator('Position').channel); }
  }
  tick(): void {
    if (this.#disposed) return; this.#expire(); const now = this.now(), session = this.#session; if (!session) return;
    const effect = this.#effect;
    if (effect) {
      const elapsed = now - effect.started;
      if (effect.duration > 0 && elapsed >= effect.duration) { this.#effect = null; for (const command of effect.commands) this.#stop(command.channel); }
      else {
        if (effect.duration > 0) this.sink.heartbeat(this.config.id, session);
        if (effect.running) { const running = elapsed % (effect.running + effect.pause) < effect.running;
          if (running !== effect.isRunning) { effect.isRunning = running; if (!this.sink.publish(this.config.id, session, running ? effect.commands : effect.commands.map(command => ({ ...command, value: 0 }))).ok) this.#release(); }
        }
      }
    }
    if (this.#alternating && this.#motion && now - this.#motion.at >= this.#motion.duration) {
      const target = this.#motion.target >= (this.#minimum + this.#maximum) / 200 ? this.#minimum / 100 : this.#maximum / 100;
      const duration = this.#travel(target, this.#velocity), start = this.#position();
      if (!this.sink.publish(this.config.id, session, [{ channel: this.#actuator('Position').channel, value: target, durationMs: duration }]).ok) this.#release();
      else this.#motion = { start, target, at: now, duration };
    }
    this.#publishScript();
  }
  resetCommands(): void { this.#effect = null; this.#alternating = false; this.#freeze(); this.#playing = false; this.#generation++; this.#preparation?.abort(); this.#preparation = null; }
  dispose(): void { if (this.#disposed) return; this.#disposed = true; this.#release(); if (this.sink instanceof ExternalControlStore) this.sink.onCommandsCleared.delete(this.#clear); }
}
function seconds(body: Record<string, unknown>, key: string, zero: boolean): number { const value = inputNumber(body, key, 0, 600); if (value === 0 && zero) return 0; if (value <= 1) throw new InputHttpError(400, `${key} must exceed one second.`); return Math.round(value * 1000); }
