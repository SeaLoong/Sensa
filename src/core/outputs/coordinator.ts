import type { AppConfig, ComputedSignalSample, OutputDeviceConfig, RuntimeMotionFrame, SignalOutputBinding, MotionAxis } from '../runtime/model.ts';
import { invalidSample, neutralValues } from '../runtime/model.ts';
import type { OutputAdapter, ResolveInput, SignalOutputValue, SignalValueType } from './types.ts';
import { clamp, safeError, optionalRecord } from './types.ts';
import { mapBinding } from '../runtime/motion.ts';
import { SignalReplay } from './recording.ts';
import { OutputTelemetry } from './telemetry.ts';
import type { OutputTarget } from './telemetry.ts';
import { typedValue, encodeMidi } from './codecs.ts';

export interface AdapterContext { configuration(): AppConfig; canSend(): boolean; telemetry?: OutputTelemetry }
export interface OutputCoordinatorOptions {
  createAdapter(config: OutputDeviceConfig, context: AdapterContext): OutputAdapter | Promise<OutputAdapter>;
  now?: () => number;
  canSend?: () => boolean;
  changed?: () => void;
  log?: (message: string) => void;
  readRecording?(fileName: string): Promise<string>;
}
interface Route {
  observed: boolean; valid: boolean; reason: string; rawValue: number | null; value: number | null;
  sentValue: number | null; queuedAtMs: number; eventHigh: boolean; revision: number;
}
interface Delivery { binding: SignalOutputBinding; sample: ComputedSignalSample; value: number; at: number; revision: number; stopping: boolean }
interface Destination {
  adapter: OutputAdapter | null; key: string; epoch: number; lastError: string | null; sentCount: number; lastSendAtMs: number | null;
  routes: Map<string, Route>; latest: Map<string, Delivery>; events: Delivery[]; motion: RuntimeMotionFrame | null;
  draining: Promise<void> | null; closing: Promise<void> | null; stopping: Promise<void> | null; connecting: Promise<boolean> | null; replay: SignalReplay;
  telemetry: OutputTelemetry; requestedTargets: OutputTarget[]; lastRequestedAtUtc: string | null;
}
export const motionOutputTypes = new Set(['TCodeSerial', 'TCodeUdp', 'TCodeTcp', 'TCodeWebSocket', 'Intiface', 'Handy', 'Autoblow', 'VacuGlide', 'Lovense', 'BleBridge', 'Bluetooth', 'SensaHttp', 'SensaWebSocket']);
function connectionKey(output: OutputDeviceConfig): string { return JSON.stringify({ ...output, enabled: false, name: '', motionProfileId: '', signal: { ...output.signal, bindings: output.type === 'Midi' ? output.signal.bindings.map(binding => binding.address) : [] } }); }
function route(): Route { return { observed: false, valid: false, reason: '', rawValue: null, value: null, sentValue: null, queuedAtMs: -Infinity, eventHigh: false, revision: 0 }; }


/** One routing implementation for browser, Node and Electron hosts. */
export class OutputCoordinator {
  #configuration: AppConfig;
  #options: OutputCoordinatorOptions;
  #destinations = new Map<string, Destination>();
  #generation = 0;
  #lastFrame: RuntimeMotionFrame | null = null;
  #stopping = false;
  #stopPromise: Promise<void> | null = null;
  canSend: () => boolean;
  constructor(configuration: AppConfig, options: OutputCoordinatorOptions) {
    this.#configuration = configuration; this.#options = options; this.canSend = options.canSend ?? (() => false);
    for (const output of configuration.outputs) this.#destinations.set(output.id, this.destination(output));
  }
  get configuration(): AppConfig { return this.#configuration; }
  now(): number { return this.#options.now?.() ?? Date.now(); }
  destination(output: OutputDeviceConfig): Destination { return { adapter: null, key: connectionKey(output), epoch: 0, lastError: null, sentCount: 0, lastSendAtMs: null, routes: new Map(output.signal.bindings.map(binding => [binding.id, route()])), latest: new Map(), events: [], motion: null, draining: null, closing: null, stopping: null, connecting: null, replay: new SignalReplay(() => this.now()), telemetry: new OutputTelemetry(() => this.now()), requestedTargets: [], lastRequestedAtUtc: null }; }
  output(id: string): OutputDeviceConfig { const output = this.#configuration.outputs.find(candidate => candidate.id === id); if (!output) throw new Error('Output was not found.'); return output; }
  state(id: string): Destination { const state = this.#destinations.get(id); if (!state) throw new Error('Output was not found.'); return state; }
  isConnected(id: string): boolean { return this.#destinations.get(id)?.adapter?.connected === true; }
  async connect(id: string): Promise<boolean> {
    const state = this.state(id); if (state.closing) await state.closing;
    const output = this.output(id);
    if (state.adapter?.connected) return true;
    if (state.connecting) return state.connecting;
    const epoch = state.epoch;
    const opening = (async (): Promise<boolean> => {
      try {
        const adapter = state.adapter ?? await this.#options.createAdapter(output, { configuration: () => this.#configuration, canSend: () => this.canSend(), telemetry: state.telemetry });
        if (state.epoch !== epoch) { await adapter.close(); return false; }
        state.adapter = adapter; await adapter.connect();
        if (state.epoch !== epoch) { await adapter.close(); if (state.adapter === adapter) state.adapter = null; return false; }
        state.lastError = null; state.telemetry.setState('idle', true); state.lastSendAtMs = null;
        if (this.canSend() && output.enabled && !output.signal.bindings.length && motionOutputTypes.has(output.type) && this.#lastFrame) { state.motion = structuredClone(this.#lastFrame); if (!this.#stopping && !state.stopping) void this.drain(output, state); }
        this.#options.changed?.(); return adapter.connected;
      } catch (error) { state.lastError = safeError(error); state.telemetry.setState('error'); this.#options.log?.(`[Output ${output.id}] ${state.lastError}`); this.#options.changed?.(); return false; }
    })();
    state.connecting = opening;
    try { return await opening; } finally { if (state.connecting === opening) state.connecting = null; }
  }
  async connectEnabled(): Promise<void> { await Promise.all(this.#configuration.outputs.filter(output => output.enabled).map(output => this.connect(output.id))); }
  async disconnect(id: string): Promise<void> {
    const state = this.state(id); if (state.closing) return state.closing;
    const closing = this.disconnectCore(id, state).finally(() => { if (state.closing === closing) state.closing = null; });
    state.closing = closing; return closing;
  }
  private async disconnectCore(id: string, state: Destination): Promise<void> { state.epoch++; state.latest.clear(); state.events = []; state.motion = null;
    if (state.stopping) await state.stopping;
    if (state.draining) await state.draining;
    const adapter = state.adapter; state.adapter = null;
    let stopError: string | null = null;
    try {
      const output = this.output(id);
      if (adapter) await this.sendStopValues(output, adapter);
    } catch (error) { stopError = safeError(error); }
    try { await adapter?.close(); state.lastError = stopError; } catch (error) { state.lastError = safeError(error); }
    state.telemetry.setState(state.lastError ? 'error' : 'idle', !state.lastError); state.requestedTargets = []; state.lastRequestedAtUtc = null; if (!state.lastError) state.lastSendAtMs = null;
    for (const entry of state.routes.values()) { entry.sentValue = null; entry.eventHigh = false; entry.observed = false; }
    this.#options.changed?.();
  }
  async disconnectAll(): Promise<void> { await Promise.all([...this.#destinations.keys()].map(id => this.disconnect(id))); }
  async close(): Promise<void> { await this.disconnectAll(); }
  async reconfigure(configuration: AppConfig): Promise<void> {
    await this.emergencyStop();
    const previous = new Map(this.#destinations), previousConfig = new Map(this.#configuration.outputs.map(output => [output.id, output]));
    const next = new Map<string, Destination>(), connect: string[] = [];
    for (const output of configuration.outputs) {
      const existing = previous.get(output.id), former = previousConfig.get(output.id), key = connectionKey(output);
      if (existing && existing.key === key) { existing.routes = new Map(output.signal.bindings.map(binding => [binding.id, route()])); next.set(output.id, existing); previous.delete(output.id); }
      else next.set(output.id, this.destination(output));
      if (output.enabled && (!former || !former.enabled || !existing || existing.key !== key)) connect.push(output.id);
    }
    for (const [id] of previous) await this.disconnect(id);
    this.#configuration = configuration; this.#destinations = next;
    for (const output of configuration.outputs) if (!output.enabled && (this.state(output.id).adapter || this.state(output.id).connecting)) await this.disconnect(output.id);
    await Promise.all(connect.map(id => this.connect(id)));
    this.#options.changed?.();
  }
  async sendFrame(frame: RuntimeMotionFrame): Promise<void> {
    if (!this.canSend()) return;
    this.#lastFrame = structuredClone(frame);
    for (const output of this.#configuration.outputs) {
      if (!output.enabled || output.signal.bindings.length || !motionOutputTypes.has(output.type)) continue;
      const state = this.state(output.id); if (!state.adapter?.connected) continue;
      this.recordRequestedMotion(state, frame);
      state.motion = structuredClone(frame); if (!this.#stopping && !state.stopping) void this.drain(output, state);
    }
  }
  sendMotion(frame: RuntimeMotionFrame): Promise<void> { return this.sendFrame(frame); }
  private recordRequestedMotion(state: Destination, frame: RuntimeMotionFrame): void {
    state.lastRequestedAtUtc = new Date(this.now()).toISOString();
    state.requestedTargets = Object.entries(frame.values).filter(([axis, value]) => Number.isFinite(value) && (!frame.activeAxes || frame.activeAxes.includes(axis as MotionAxis))).map(([key, value]) => ({ key, label: key, value, maximum: 1 }));
  }
  private recordAccepted(state: Destination, previousVersion: number): void { if (state.telemetry.version !== previousVersion) { state.sentCount++; const timestamp = state.telemetry.snapshot().lastSentAtUtc; state.lastSendAtMs = timestamp === null ? null : Date.parse(timestamp); } }
  private recordSignalFallback(state: Destination, output: OutputDeviceConfig, item: Delivery, previousVersion: number): void {
    if (state.telemetry.version === previousVersion && !(output.type === 'Recording' && item.stopping)) {
      const sample = { address: item.binding.address, value: item.value, type: item.binding.valueType as SignalValueType };
      const value = output.type === 'Midi' ? encodeMidi(sample)[2] ?? 0 : Number(typedValue(sample));
      state.telemetry.recordTarget(item.binding.address || item.binding.id, item.binding.name || item.binding.address, value, output.type === 'Midi' ? 127 : Math.max(1, Math.abs(item.binding.outputMin), Math.abs(item.binding.outputMax)));
    }
    this.recordAccepted(state, previousVersion);
  }
  async flush(): Promise<void> { while (true) { const active = [...this.#destinations.values()].flatMap(state => state.draining ? [state.draining] : []); if (!active.length) return; await Promise.all(active); } }
  updateBindings(now: number, resolve: ResolveInput): void {
    if (!this.canSend()) return;
    for (const output of this.#configuration.outputs) {
      const state = this.state(output.id); if (!output.enabled || !state.adapter?.connected) continue;
      for (const binding of output.signal.bindings) {
        const sample = resolve(binding.source), status = state.routes.get(binding.id) ?? route(); state.routes.set(binding.id, status);
        const valid = sample.valid && sample.value !== null && Number.isFinite(sample.value), value = valid ? mapBinding(binding, sample.value!) : null;
        const changedValidity = status.valid !== valid;
        if (changedValidity) { status.revision++; status.eventHigh = false; state.latest.delete(binding.id); state.events = state.events.filter(event => event.binding.id !== binding.id); }
        status.valid = valid; status.reason = sample.reason; status.rawValue = sample.value; status.value = value;
        if (!valid) {
          if (changedValidity || !status.observed) state.latest.set(binding.id, { binding, sample, value: binding.stopValue, at: now, revision: status.revision, stopping: true });
          status.observed = true; continue;
        }
        status.observed = true;
        if (binding.sendMode === 'OnEvent' || output.type === 'Dglab' && binding.address === 'Pulse' && binding.sendMode !== 'FixedRate') {
          const high = value! >= (output.type === 'Dglab' ? .5 : Number.MIN_VALUE);
          if (high && !status.eventHigh && state.events.length < 64) state.events.push({ binding, sample, value: value!, at: now, revision: status.revision, stopping: false });
          status.eventHigh = high; continue;
        }
        const heartbeat = output.type === 'Dglab' && binding.address === 'Intensity';
        let interval = heartbeat ? Math.min(1000 / binding.rateHz, output.signal.taskDurationMs / 2) : 1000 / binding.rateHz;
        if (output.type === 'Dglab' && binding.address === 'Pulse') interval = Math.max(100, Math.floor(Math.min(interval, Math.max(100, output.signal.taskDurationMs / 2)) / 100) * 100);
        if (now - status.queuedAtMs < interval || !heartbeat && binding.sendMode === 'OnChange' && status.sentValue !== null && Math.abs(status.sentValue - value!) <= binding.epsilon) continue;
        status.queuedAtMs = now;
        state.latest.set(binding.id, { binding, sample, value: value!, at: now, revision: status.revision, stopping: false });
      }
      if (!this.#stopping && !state.stopping && (state.latest.size || state.events.length)) void this.drain(output, state);
    }
  }
  drain(output: OutputDeviceConfig, state: Destination): Promise<void> {
    if (state.draining) return state.draining;
    const epoch = state.epoch, generation = this.#generation;
    const work = async (): Promise<void> => {
      while (state.epoch === epoch && this.#generation === generation && this.canSend() && state.adapter?.connected) {
        const frame = state.motion; state.motion = null;
        const deliveries = [...state.latest.values(), ...state.events]; state.latest.clear(); state.events = [];
        if (!frame && !deliveries.length) return;
        try {
          if (frame) { const version = state.telemetry.version; await state.adapter.sendMotion(frame); this.recordAccepted(state, version); }
          const values = neutralValues(), axes: MotionAxis[] = [];
          for (const item of deliveries) {
            const status = state.routes.get(item.binding.id);
            if (state.epoch !== epoch || this.#generation !== generation || !this.canSend() || !status || status.revision !== item.revision) continue;
            const version = state.telemetry.version;
            if (output.type === 'Recording' && state.adapter.recordSample) {
              await state.adapter.recordSample(item.binding.address || item.binding.id, item.sample, item.stopping ? null : item.value, item.at);
            } else if (motionOutputTypes.has(output.type)) {
              const axis = item.binding.address as MotionAxis; values[axis] = clamp(item.value); axes.push(axis);
            } else {
              const sample: SignalOutputValue = { address: item.binding.address, value: item.value, type: item.binding.valueType as SignalValueType, signalId: item.binding.id, timestampMs: item.at, coordinateFrame: item.sample.coordinateFrame,
                ...(item.binding.channel === null ? {} : { channel: item.binding.channel }) };
              await state.adapter.sendSignal(sample);
            }
            status.sentValue = item.value; if (!motionOutputTypes.has(output.type)) this.recordSignalFallback(state, output, item, version);
          }
          if (axes.length && this.canSend() && this.#generation === generation && state.epoch === epoch) { const routed: RuntimeMotionFrame = { values, deltaMs: 0, activeAxes: [...new Set(axes)], requestedCommandMode: 'None' }; this.recordRequestedMotion(state, routed); const version = state.telemetry.version; await state.adapter.sendMotion(routed); this.recordAccepted(state, version); }
          state.lastError = null;
        } catch (error) {
          state.lastError = safeError(error); state.telemetry.setState('error'); state.requestedTargets = []; state.lastRequestedAtUtc = null; state.epoch++; state.latest.clear(); state.events = []; state.motion = null;
          const failed = state.adapter; state.adapter = null;
          const cleanup = (async (): Promise<void> => {
            try { if (failed) { await this.sendStopValues(output, failed); await failed.stop(); } } catch { /* Retain the original delivery error when stopping cannot be confirmed. */ }
            finally { try { await failed?.close(); } catch { /* The failed lane remains disconnected. */ } }
          })();
          state.closing = cleanup;
          try { await cleanup; } finally { if (state.closing === cleanup) state.closing = null; }
          this.#options.log?.(`[Output ${output.id}] ${state.lastError}`); return;
        }
      }
    };
    const draining: Promise<void> = Promise.resolve().then(work).finally(() => {
      if (state.draining === draining) state.draining = null; this.#options.changed?.();
      if (!this.#stopping && !state.stopping && this.canSend() && state.adapter?.connected && (state.motion || state.latest.size || state.events.length)) return this.drain(output, state);
    });
    state.draining = draining;
    return draining;
  }
  private async sendStopValues(output: OutputDeviceConfig, adapter: OutputAdapter): Promise<void> {
    if (!adapter.connected || motionOutputTypes.has(output.type) || output.type === 'Dglab' || output.type === 'Recording') return;
    const deadline = Date.now() + 3000;
    for (const binding of output.signal.bindings) {
      if (Date.now() >= deadline) throw new Error('Output stop-value deadline exceeded.');
      await adapter.sendSignal({ address: binding.address, value: binding.stopValue, type: binding.valueType as SignalValueType, signalId: binding.id, timestampMs: this.now() });
    }
  }
  async emergencyStop(): Promise<void> {
    if (this.#stopPromise) return this.#stopPromise;
    this.#stopping = true; this.#lastFrame = null;
    const stopping = (async (): Promise<void> => {
    this.#generation++;
    await Promise.all([...this.#destinations].map(async ([id, state]) => {
      state.epoch++; state.motion = null; state.latest.clear(); state.events = [];
      state.requestedTargets = []; state.lastRequestedAtUtc = null;
      for (const status of state.routes.values()) { status.sentValue = null; status.queuedAtMs = -Infinity; status.eventHigh = false; status.observed = false; }
      if (state.stopping) await state.stopping;
      if (state.draining) await state.draining;
      if (!state.adapter?.connected) return;
      const output = this.output(id);
      try {
        await this.sendStopValues(output, state.adapter);
        await state.adapter.stop(); state.lastError = null; state.telemetry.setState('stopped', true); state.lastSendAtMs = null;
      } catch (error) { state.lastError = safeError(error); state.telemetry.setState('error'); this.#options.log?.(`[Output ${id}] Stop could not be confirmed.`); }
    }));
    this.#options.changed?.();
    })().finally(() => {
      this.#stopping = false; this.#stopPromise = null;
      if (this.canSend()) for (const output of this.#configuration.outputs) {
        const state = this.#destinations.get(output.id);
        if (state?.adapter?.connected && (state.motion || state.latest.size || state.events.length)) void this.drain(output, state);
      }
    });
    this.#stopPromise = stopping;
    return stopping;
  }
  async stopUnbound(): Promise<void> {
    this.#lastFrame = null;
    await Promise.all(this.#configuration.outputs.filter(output => !output.signal.bindings.length && motionOutputTypes.has(output.type)).map(async output => {
      const state = this.state(output.id); if (state.stopping) return state.stopping;
      state.epoch++; state.motion = null; state.latest.clear(); state.events = [];
      state.requestedTargets = []; state.lastRequestedAtUtc = null;
      const stopping = (async (): Promise<void> => {
        if (state.draining) await state.draining;
        if (!state.adapter?.connected) return;
        try { await state.adapter.stop(); state.lastError = null; state.telemetry.setState('stopped', true); state.lastSendAtMs = null; } catch (error) { state.lastError = safeError(error); state.telemetry.setState('error'); }
      })().finally(() => {
        state.stopping = null;
        if (!this.#stopping && this.canSend() && state.adapter?.connected && state.motion) void this.drain(output, state);
      });
      state.stopping = stopping; return stopping;
    }));
    this.#options.changed?.();
  }
  stopAll(): Promise<void> { return this.emergencyStop(); }
  devices(id: string): unknown[] { return [...(this.#destinations.get(id)?.adapter?.devices?.() ?? [])]; }
  async startScanning(id: string): Promise<void> { const adapter = this.state(id).adapter; if (!adapter?.scan) throw new Error('This output does not support scanning.'); await adapter.scan(true); }
  async stopScanning(id: string): Promise<void> { await this.state(id).adapter?.scan?.(false); }
  async refreshDeviceInfo(id: string): Promise<unknown> { return this.state(id).adapter?.refreshDeviceInfo?.() ?? null; }
  async vendorScript(id: string, action: string, options?: { url?: string; positionMs?: number; loop?: boolean }): Promise<unknown> {
    const adapter = this.state(id).adapter; if (!adapter?.vendorScript) throw new Error('This output does not support synchronized scripts.');
    if ((action === 'play' || action === 'seek') && !this.canSend()) throw new Error('Enable input before playing a device script.');
    await adapter.vendorScript(action, options); this.#options.changed?.(); const script = adapter.scriptState?.(); return { ok: true, script, scriptPrepared: script?.prepared, scriptPlaying: script?.playing, scriptPositionMs: script?.positionMs, supportsScriptLoop: script?.loopSupported, scriptLoop: script?.loop };
  }
  async replayAction(id: string, action: string, fileName?: string, timeMs?: number): Promise<unknown> {
    const replay = this.state(id).replay;
    if (action === 'load') { if (!fileName || !this.#options.readRecording) throw new Error('Choose an available recording.'); replay.load(fileName, await this.#options.readRecording(fileName)); }
    else if (action === 'play') replay.play(); else if (action === 'pause') replay.pause(); else if (action === 'seek') replay.seek(timeMs ?? 0); else throw new Error('Unknown replay action.');
    this.#options.changed?.(); return replay.snapshot();
  }
  readReplay(outputId: string, signalId: string): ComputedSignalSample { return this.#destinations.get(outputId)?.replay.sample(signalId) ?? invalidSample('Replay output is unavailable.'); }
  readFeedback(outputId: string, path: string): ComputedSignalSample {
    const state = this.#destinations.get(outputId); if (!state) return invalidSample('Output feedback is unavailable.');
    const value = path === 'connected' ? state.adapter?.connected ? 1 : 0 : state.adapter?.feedback?.(path) ?? null;
    return value === null ? invalidSample('Waiting for device feedback.') : { value, valid: true, reason: '', sourceKey: null, timestampMs: this.now(), coordinateFrame: null, originKey: 'device:' + outputId + ':' + path };
  }
  snapshot(): unknown[] {
    return this.#configuration.outputs.map(output => {
      const state = this.state(output.id), adapter = state.adapter, connected = adapter?.connected === true;
      const profile = this.#configuration.axisProfiles.find(candidate => candidate.id.toLowerCase() === output.motionProfileId.toLowerCase());
      const adapterSnapshot = optionalRecord(adapter?.snapshot?.()) ?? {}, vendor = adapter?.scriptState?.();
      const bindings = output.signal.bindings.map(binding => { const status = state.routes.get(binding.id) ?? route(); return { id: binding.id, name: binding.name, address: binding.address, ...status }; });
      return { id: output.id, name: output.name, type: output.type, enabled: output.enabled, connected, state: state.lastError ? 'error' : connected ? 'connected' : 'disconnected', lastError: state.lastError,
        signalStatus: { connected, status: state.lastError ? 'error' : connected ? 'connected' : 'disconnected', error: state.lastError, bindings, routes: bindings.map(binding => ({ ...binding, lastSentMs: state.lastSendAtMs })), replay: state.replay.snapshot(), ...(output.type === 'Dglab' ? { ...adapterSnapshot, status: adapterSnapshot['state'], error: adapterSnapshot['lastError'], pairingUrl: adapterSnapshot['appPairingUrl'] ?? adapterSnapshot['pairingUrl'] } : {}), ...(output.type === 'Recording' ? (adapter?.snapshot?.() as Record<string, unknown> ?? {}) : {}) },
        profileId: output.type.startsWith('TCode') ? output.motionProfileId : null, profileName: profile?.name ?? null,
        tcodeSettings: output.type.startsWith('TCode') ? { speedUnitBase: output.speedUnitBase, slopeMode: output.slopeMode } : null,
        tcodeDeviceInfo: output.type.startsWith('TCode') ? adapter?.devices?.()[0] ?? { supported: false, reason: 'Not connected.' } : null,
        summary: output.type === 'TCodeSerial' ? output.comPort : output.type === 'TCodeTcp' || output.type === 'TCodeUdp' ? `${output.host}:${output.port}` : output.type === 'Intiface' ? output.websocketAddress : output.name,
        telemetry: { ...state.telemetry.snapshot(), sendCount: state.sentCount, lastSendAtMs: state.lastSendAtMs, requestedTargets: state.requestedTargets.map(target => ({ ...target })), lastRequestedAtUtc: state.lastRequestedAtUtc }, deviceApi: vendor ? { ...vendor, supportsStreaming: true, commandKind: output.type === 'VacuGlide' ? 'Speed' : output.type === 'Lovense' ? 'Intensity' : 'Position', supportsScripts: vendor.supported, supportsScriptLoop: vendor.loopSupported, scriptLoop: vendor.loop, scriptPrepared: vendor.prepared, scriptPlaying: vendor.playing, scriptPositionMs: vendor.positionMs, lastError: state.lastError } : null, devices: this.devices(output.id) };
    });
  }
}
