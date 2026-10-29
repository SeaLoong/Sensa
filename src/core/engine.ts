import { isAxis, normalized, parseFunscript, scriptValue } from './funscript.ts';
import type { Axis, EngineClock, EngineSnapshot, InputMode, OutputDetails, OutputTransport, SignalFrame, SignalValues } from './types.ts';

type QueueItem = { kind: 'stop'; promise: Promise<void>; resolve: () => void; epoch: number }
  | { kind: 'frame' | 'terminal'; frame: SignalFrame; promise: Promise<void>; resolve: () => void; epoch: number };

function defaultClock(): EngineClock {
  let nextToken = 0;
  const timers = new Map<number, ReturnType<typeof setInterval>>();
  return {
    now: () => performance.now(),
    interval(callback, periodMs) { const token = ++nextToken; timers.set(token, setInterval(callback, periodMs)); return token; },
    clear(token) { const native = timers.get(token); if (native !== undefined) clearInterval(native); timers.delete(token); },
  };
}

// Each destination has a coalescing queue and a stop barrier. A slow device
// cannot hold up another output or replay old targets after a stop.
export class OutputLane {
  readonly transport: OutputTransport;
  readonly onError: (error: unknown) => void;
  queue: QueueItem[];
  running: boolean;
  closed: boolean;
  closing = false;
  epoch: number;
  constructor(transport: OutputTransport, onError: (error: unknown) => void = () => {}) {
    this.transport = transport; this.onError = onError; this.queue = []; this.running = false; this.closed = false; this.epoch = 0;
  }
  send(frame: SignalFrame): Promise<void> {
    if (this.closed || this.closing) return Promise.resolve();
    const last = this.queue.at(-1);
    if (last?.kind === 'frame') { last.frame = frame; return last.promise; }
    return this.enqueue('frame', frame);
  }
  stop(): Promise<void> {
    if (this.closed) return Promise.resolve();
    this.epoch++; this.transport.interrupt?.();
    this.queue = this.queue.filter(item => {
      if (item.kind !== 'stop') { item.resolve(); return false; }
      return true;
    });
    return this.enqueue('stop');
  }
  finish(frame: SignalFrame): Promise<void> {
    if (this.closed || this.closing) return Promise.resolve();
    this.queue = this.queue.filter(item => { if (item.kind !== 'stop') { item.resolve(); return false; } return true; });
    return this.enqueue('terminal', frame);
  }
  enqueue(kind: 'stop'): Promise<void>;
  enqueue(kind: 'frame' | 'terminal', frame: SignalFrame): Promise<void>;
  enqueue(kind: QueueItem['kind'], frame?: SignalFrame): Promise<void> {
    let resolve: () => void = () => {};
    const promise = new Promise<void>(done => { resolve = done; });
    if (kind === 'stop') this.queue.push({ kind, promise, resolve, epoch: this.epoch });
    else {
      if (!frame) throw new Error('A queued signal needs its frame.');
      this.queue.push({ kind, frame, promise, resolve, epoch: this.epoch });
    }
    void this.drain();
    return promise;
  }
  async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      while (this.queue.length) {
        const item = this.queue.shift();
        if (!item) break;
        try {
          await (item.kind === 'stop' ? this.transport.stop() : this.transport.send(item.frame));
          if (item.kind === 'terminal') await this.transport.stop();
        }
        catch (error) {
          if (item.kind !== 'stop' && item.epoch !== this.epoch) continue;
          this.closed = true;
          for (const pending of this.queue.splice(0)) pending.resolve();
          try { await this.transport.stop(); } catch { /* A disconnected endpoint cannot acknowledge stop. */ }
          try { await this.transport.close(); } catch { /* Preserve the original delivery error. */ }
          this.onError(error);
        }
        finally { item.resolve(); }
      }
    } finally { this.running = false; }
  }
  async close(): Promise<void> {
    if (this.closed) return;
    this.closing = true;
    await this.stop();
    this.closed = true;
    await this.transport.close();
  }
}

export class SensaEngine {
  readonly now: EngineClock['now'];
  readonly interval: EngineClock['interval'];
  readonly clear: EngineClock['clear'];
  deliveryEpoch: number;
  revision: number;
  changing: number;
  readonly listeners: Set<(snapshot: EngineSnapshot) => void>;
  readonly outputs: Map<string, OutputLane>;
  nextId: number;
  state: EngineSnapshot;
  externalValues: SignalValues = {};
  externalAt: number | undefined;
  recordingStart = 0;
  anchor = 0;
  anchorPosition = 0;
  timer: number | undefined;
  liveTimer: number | undefined;
  constructor(clock: Partial<EngineClock> = {}) {
    const defaults = defaultClock();
    const { now = defaults.now, interval = defaults.interval, clear = defaults.clear } = clock;
    this.now = now; this.interval = interval; this.clear = clear;
    this.deliveryEpoch = 0; this.revision = 0; this.changing = 0; this.listeners = new Set(); this.outputs = new Map(); this.nextId = 0;
    this.state = { active: false, emergency: false, mode: 'manual', externalConnected: false, externalName: '', playing: false, loop: false, speed: 1,
      positionMs: 0, script: null, scriptName: '', scriptAxis: 'L0', values: { L0: 0.5, L1: 0.5, L2: 0.5, R0: 0.5, R1: 0.5, R2: 0.5, V0: 0 },
      axes: ['L0'], outputs: [], errors: [], recordedActions: [], recording: false };
  }
  snapshot(): EngineSnapshot { return { ...this.state, values: { ...this.state.values }, axes: [...this.state.axes], outputs: [...this.state.outputs], recordedActions: [...this.state.recordedActions] }; }
  subscribe(listener: (snapshot: EngineSnapshot) => void): () => void { this.listeners.add(listener); listener(this.snapshot()); return () => { this.listeners.delete(listener); }; }
  publish(): void { for (const listener of this.listeners) listener(this.snapshot()); }
  report(error: unknown, id: string): void {
    const message = error instanceof Error ? error.message : String(error);
    this.state.errors = [...this.state.errors.slice(-9), { id, message }];
    const output = this.state.outputs.find(item => item.id === id);
    if (output) { output.error = message; output.connected = false; }
    this.publish();
  }
  addOutput(name: string, transport: OutputTransport, details: OutputDetails = {}): string {
    const id = 'output-' + (++this.nextId);
    this.outputs.set(id, new OutputLane(transport, error => this.report(error, id)));
    this.state.outputs = [...this.state.outputs, { id, name, ...details, connected: true, error: '' }];
    if (transport.subscribeDisconnect) transport.subscribeDisconnect(() => {
      if (this.outputs.has(id)) this.report(new Error('The output disconnected. Reconnect to use it again.'), id);
    });
    if (transport.socket?.addEventListener) transport.socket.addEventListener('close', () => {
      if (this.outputs.has(id)) this.report(new Error('The output disconnected.'), id);
    }, { once: true });
    this.publish(); return id;
  }
  async removeOutput(id: string): Promise<void> {
    const lane = this.outputs.get(id);
    this.outputs.delete(id);
    this.state.outputs = this.state.outputs.filter(item => item.id !== id); this.publish();
    if (lane) await lane.close();
  }
  frame(): SignalFrame {
    let values: SignalValues = Object.fromEntries(this.state.axes.map(axis => [axis, this.state.values[axis]]));
    if (this.state.mode === 'external') values = Object.fromEntries(Object.entries(this.externalValues).filter(([axis]) => isAxis(axis) && this.state.axes.includes(axis)));
    if (this.state.mode === 'script' && this.state.script) {
      values = { [this.state.scriptAxis]: scriptValue(this.state.script, this.state.positionMs) };
    }
    return { values, durationMs: 0, timeMs: Math.round(this.now()) };
  }
  send(): Promise<void> {
    if (!this.state.active || this.state.emergency) return Promise.resolve();
    const frame = this.frame();
    if (!Object.keys(frame.values).length) return Promise.resolve();
    this.recordPoint(false);
    return Promise.all([...this.outputs.values()].map(lane => lane.send(frame))).then(() => {});
  }
  setManual(axis: Axis, value: number): void {
    if (!isAxis(axis)) throw new Error('Unknown axis.');
    this.state.values = { ...this.state.values, [axis]: normalized(value) };
    if (this.state.mode === 'manual') void this.send();
    this.publish();
  }
  async setAxes(axes: readonly Axis[]): Promise<void> {
    if (!axes.length || new Set(axes).size !== axes.length || axes.some(axis => !isAxis(axis))) throw new Error('Choose valid axes.');
    return this.reconfigure(() => { this.state.axes = [...axes]; });
  }
  async setMode(mode: InputMode): Promise<void> {
    if (!['manual', 'script', 'external'].includes(mode)) throw new Error('Unknown input mode.');
    return this.reconfigure(() => { this.state.mode = mode; });
  }
  async activate(active: boolean): Promise<void> {
    if (!active) return this.stop();
    if (this.changing) throw new Error('Wait for the input settings to finish updating.');
    if (this.state.emergency) throw new Error('Clear the stop first.');
    if (this.state.mode === 'external' && (this.externalAt === undefined || this.now() - this.externalAt > 1000)) throw new Error('Connect a live parameter signal first.');
    if (this.state.active) return;
    if (this.state.mode === 'external' && !this.state.axes.some(axis => this.externalValues?.[axis] !== undefined)) throw new Error('Select an axis provided by the parameter explorer.');
    this.deliveryEpoch++; this.state.active = true; this.publish();
    this.liveTimer = this.interval(() => {
      if (this.state.mode === 'external' && (this.externalAt === undefined || this.now() - this.externalAt > 1000)) { this.state.externalConnected = false; void this.stop(); }
      else if (this.state.mode !== 'script') void this.send();
    }, 100);
    await this.send();
  }
  async stop(emergency = false): Promise<void> {
    this.deliveryEpoch++;
    this.recordPoint(true);
    this.state.active = false; this.state.playing = false; this.state.recording = false;
    if (emergency) this.state.emergency = true;
    this.stopTimer(); if (this.liveTimer !== undefined) this.clear(this.liveTimer); this.liveTimer = undefined; this.publish();
    await Promise.all([...this.outputs.values()].map(lane => lane.stop()));
  }
  clearEmergency(): void { this.state.emergency = false; this.publish(); }
  async loadScript(input: unknown, name = 'Script'): Promise<void> {
    const script = parseFunscript(input);
    return this.reconfigure(() => { this.state.script = script; this.state.scriptName = name; this.state.positionMs = 0; this.state.mode = 'script'; });
  }
  seek(positionMs: number): void {
    if (!this.state.script || !Number.isFinite(positionMs)) throw new Error('Load a script first.');
    this.state.positionMs = Math.max(0, Math.min(this.state.script.durationMs, positionMs));
    this.anchor = this.now(); this.anchorPosition = this.state.positionMs;
    if (this.state.active) void this.send(); this.publish();
  }
  setSpeed(speed: number): void {
    if (!Number.isFinite(speed) || speed < 0.1 || speed > 4) throw new Error('Speed must be between 0.1 and 4.');
    if (this.state.playing) this.tick();
    this.state.speed = speed; this.anchor = this.now(); this.anchorPosition = this.state.positionMs; this.publish();
  }
  setLoop(loop: boolean): void {
    if (this.state.playing) this.tick();
    this.anchor = this.now(); this.anchorPosition = this.state.positionMs;
    this.state.loop = Boolean(loop); this.publish();
  }
  async setScriptAxis(axis: Axis): Promise<void> { if (!isAxis(axis)) throw new Error('Unknown axis.'); return this.reconfigure(() => { this.state.scriptAxis = axis; }); }
  play(): void {
    if (!this.state.script || this.state.mode !== 'script' || !this.state.active || this.state.emergency) throw new Error('Load a script and enable input to play.');
    if (this.state.playing) return;
    if (this.state.positionMs >= this.state.script.durationMs) this.state.positionMs = 0;
    this.state.playing = true; this.anchor = this.now(); this.anchorPosition = this.state.positionMs;
    this.timer = this.interval(() => this.tick(), 40); void this.send(); this.publish();
  }
  pause(): Promise<void> {
    if (this.state.playing) this.tick();
    this.state.playing = false; this.stopTimer(); this.publish();
    // A paused browser script stops device activity; the timeline retains its target.
    return Promise.all([...this.outputs.values()].map(lane => lane.stop())).then(() => {});
  }
  tick(): void {
    const script = this.state.script;
    if (!this.state.playing || !script) return;
    let next = this.anchorPosition + Math.max(0, this.now() - this.anchor) * this.state.speed;
    const duration = script.durationMs;
    if (next >= duration) {
      if (this.state.loop && duration > 0) next %= duration;
      else {
        this.state.positionMs = duration;
        const finalFrame = this.frame();
        this.deliveryEpoch++; this.state.active = false; this.state.playing = false; this.stopTimer();
        if (this.liveTimer !== undefined) this.clear(this.liveTimer); this.liveTimer = undefined;
        for (const lane of this.outputs.values()) void lane.finish(finalFrame);
        this.publish(); return;
      }
    }
    this.state.positionMs = next; void this.send(); this.publish();
  }
  receiveExternal(values: unknown, name = 'Parameter explorer'): void {
    if (typeof values !== 'object' || values === null || Array.isArray(values)) throw new Error('Invalid parameter signal.');
    const entries: [string, unknown][] = Object.entries(values);
    if (!entries.length || entries.length > 7) throw new Error('Invalid parameter signal.');
    const validated: SignalValues = {};
    for (const [axis, value] of entries) {
      if (!isAxis(axis) || typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) throw new Error('Invalid parameter signal.');
      validated[axis] = value;
    }
    if (this.state.mode === 'external' && this.state.active && this.externalAt !== undefined && this.now() - this.externalAt > 1000) void this.stop();
    this.externalValues = validated; this.externalAt = this.now();
    this.state.externalConnected = true; this.state.externalName = name;
    if (this.state.mode === 'external' && this.state.active) {
      if (this.state.axes.some(axis => this.externalValues[axis] !== undefined)) void this.send();
      else void this.stop();
    }
    this.publish();
  }
  async externalDisconnected(): Promise<void> { this.externalValues = {}; this.externalAt = undefined; this.state.externalConnected = false; if (this.state.mode === 'external') await this.stop(); this.publish(); }
  record(enabled: boolean): void {
    if (enabled && (!this.state.active || this.state.mode !== 'manual')) throw new Error('Enable manual input to record.');
    if (!enabled) this.recordPoint(true);
    this.state.recording = enabled;
    if (enabled) { this.recordingStart = this.now(); this.state.recordedActions = []; void this.send(); }
    this.publish();
  }
  recordPoint(terminal: boolean): void {
    if (!this.state.recording) return;
    const value = this.frame().values.L0;
    if (value === undefined) return;
    const at = Math.max(0, Math.min(604800000, Math.round(this.now() - this.recordingStart)));
    const pos = Math.round(value * 100), actions = this.state.recordedActions, last = actions.at(-1);
    if (last?.at === at) actions[actions.length - 1] = { at, pos };
    else if (terminal || last?.pos !== pos) {
      if (actions.length >= 200000) actions[actions.length - 1] = { at, pos };
      else actions.push({ at, pos });
    }
    if (at >= 604800000 || actions.length >= 200000) this.state.recording = false;
  }
  async reconfigure(update: () => void): Promise<void> {
    const revision = ++this.revision; this.changing++;
    try { await this.stop(); if (this.revision === revision) { update(); this.publish(); } }
    finally { this.changing--; }
  }
  stopTimer(): void { if (this.timer !== undefined) this.clear(this.timer); this.timer = undefined; }
  async dispose(): Promise<void> { await this.stop(); await Promise.all([...this.outputs.keys()].map(id => this.removeOutput(id))); this.listeners.clear(); }
}
