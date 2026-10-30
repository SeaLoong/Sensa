/** Shared command application used by Node HTTP/WS and the browser-local host. */
import type { AppConfig, RuntimeMotionFrame, MotionAxis, TCodeCommandMode } from './model.ts';
import { buildOverview, type PresentationServices } from './presentation.ts';

export type JsonRecord = Record<string, unknown>;
export interface CommandResult { statusCode: number; success: boolean; data: unknown; }
export interface ScriptOptions {
  restart?: boolean; loop?: boolean; speed?: number; updateLoopRange?: boolean;
  axis?: MotionAxis;
  loopStartMs?: number | null; loopEndMs?: number | null;
}
export interface RuntimeApplicationPort {
  getConfig(): AppConfig;
  getSnapshot(): unknown;
  getScriptSnapshot(): unknown;
  getComputedSignals(): unknown;
  blockInputActivation(): () => void;
  applyConfiguration(config: AppConfig): unknown;
  setInputMode(mode: string): unknown;
  setInputActive(active: boolean): unknown;
  setManual(frame: RuntimeMotionFrame | null): unknown;
  emergencyStop(): unknown;
  clearEmergency(): unknown;
  resetSignalProcessing(): unknown;
  setOscSource(source: string | null): unknown;
  loadScript(name: string, content: string | unknown, options?: ScriptOptions): unknown;
  playScript(options?: ScriptOptions): unknown;
  pauseScript(): unknown;
  stopScript(): unknown;
  clearScript(): unknown;
  configureScript(options: ScriptOptions): unknown;
  seekScript(positionMs: number): unknown;
  stepScript(direction: number): unknown;
  startRecording(name?: string): unknown;
  stopRecording(): unknown;
  getRecordingSnapshot(): unknown;
  exportRecording(): unknown;
}
export interface ApplicationOutputPort {
  snapshot(): unknown[];
  isConnected(id: string): boolean;
  connect(id: string): Promise<boolean>;
  disconnect(id: string): Promise<void>;
  emergencyStop(): Promise<void>;
  devices(id: string): unknown[];
  startScanning(id: string): Promise<void>;
  stopScanning(id: string): Promise<void>;
  refreshDeviceInfo(id: string): Promise<unknown>;
  vendorScript(id: string, action: string, options?: { url?: string; positionMs?: number; loop?: boolean }): Promise<unknown>;
  replayAction(id: string, action: string, fileName?: string, timeMs?: number): Promise<unknown> | unknown;
}
export interface ApplicationServices extends PresentationServices {
  outputs: ApplicationOutputPort;
  applyConfiguration(value: unknown): Promise<AppConfig>;
  selectOscSource(sourceKey: string | null): Promise<unknown> | unknown;
  refreshOscQuery(): Promise<unknown>;
  syncOsc(): Promise<void> | void;
  listSerialPorts(): Promise<unknown[]> | unknown[];
  listMidiPorts(): Promise<unknown[]> | unknown[];
  listRecordings(): Promise<unknown[]> | unknown[];
  readRecording(name: string): Promise<string>;
  logs(): unknown[];
  notify(): void;
  log(message: string, level?: 'Debug' | 'Info' | 'Warning' | 'Error'): void;
  now?: () => number;
  inputChange?<T>(operation: () => Promise<T> | T): Promise<T>;
}
export function record(value: unknown, message = 'Missing request body. / 缺少请求正文。'): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(message);
  return value as JsonRecord;
}
const bodyNames = new Map(['active', 'mode', 'enabled', 'sourceKey', 'fileName', 'content', 'loop', 'speed', 'restart',
  'updateLoopRange', 'loopStartMs', 'loopEndMs', 'positionMs', 'outputId', 'timeMs', 'url', 'motionMode', 'motionValue', 'axis', 'axes',
  'l0', 'l1', 'l2', 'r0', 'r1', 'r2', 'v0', 'v1', 'v2', 'a0', 'a1', 'a2'].map(name => [name.toLowerCase(), name]));
/** The established API accepts .NET-style case-insensitive property names. */
export function commandBody(value: unknown): JsonRecord {
  const source = record(value), result = Object.create(null) as JsonRecord, seen = new Set<string>();
  for (const [name, item] of Object.entries(source)) {
    const folded = name.toLowerCase();
    if (seen.has(folded)) throw new Error(`Duplicate request property: ${name}.`);
    seen.add(folded); result[bodyNames.get(folded) ?? name] = item;
  }
  return result;
}
function text(value: unknown, name: string, optional = false): string {
  if (optional && value === undefined) return '';
  if (typeof value !== 'string') throw new Error(`Invalid ${name}.`);
  return value;
}
function numeric(value: unknown, name: string, fallback?: number): number {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`Invalid ${name}.`);
  return value;
}
function boolean(value: unknown, name: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`Specify a boolean ${name}.`);
  return value;
}
function scriptOptions(body: JsonRecord): ScriptOptions {
  const result: ScriptOptions = {};
  if (body['axis'] !== undefined) {
    if (typeof body['axis'] !== 'string' || !AXES.includes(body['axis'] as MotionAxis)) throw new Error('Invalid script axis.');
    result.axis = body['axis'] as MotionAxis;
  }
  for (const key of ['restart', 'loop', 'updateLoopRange'] as const) if (body[key] !== undefined) result[key] = boolean(body[key], key);
  if (body['speed'] !== undefined) result.speed = numeric(body['speed'], 'speed');
  for (const key of ['loopStartMs', 'loopEndMs'] as const) {
    if (body[key] !== undefined) result[key] = body[key] === null ? null : numeric(body[key], key);
  }
  return result;
}
const AXES: readonly MotionAxis[] = ['L0', 'L1', 'L2', 'R0', 'R1', 'R2', 'V0', 'V1', 'V2', 'A0', 'A1', 'A2'];
function manualFrame(body: JsonRecord): RuntimeMotionFrame {
  const values = {} as Record<MotionAxis, number>;
  for (const axis of AXES) {
    const raw = numeric(body[axis.toLowerCase()], axis, 0);
    if (!Number.isInteger(raw)) throw new Error(`Invalid integer ${axis}.`);
    values[axis] = Math.min(999, Math.max(0, raw)) / 1000;
  }
  const rawMode = body['motionMode'];
  let mode: TCodeCommandMode | undefined;
  if (rawMode !== undefined && rawMode !== null) {
    const modes: readonly TCodeCommandMode[] = ['None', 'Interval', 'Speed'];
    mode = typeof rawMode === 'number' && Number.isInteger(rawMode) ? modes[rawMode]
      : typeof rawMode === 'string' ? modes.find(value => value.toLowerCase() === rawMode.toLowerCase()) : undefined;
    if (!mode) throw new Error('Invalid motion mode.');
  }
  const raw = numeric(body['motionValue'], 'motionValue', 0);
  if (!Number.isInteger(raw)) throw new Error('Invalid integer motionValue.');
  const motionValue = mode === 'None' ? undefined : Math.max(1, Math.min(mode === 'Interval' ? 1000 : 999, raw > 0 ? raw : mode === 'Interval' ? 100 : 999));
  const axes = body['axes'];
  if (axes !== undefined && (!Array.isArray(axes) || axes.length < 1 || axes.length > AXES.length || new Set(axes).size !== axes.length || !axes.every(axis => typeof axis === 'string' && AXES.includes(axis as MotionAxis)))) throw new Error('Select 1–12 distinct manual axes.');
  return { values, deltaMs: 0, ...(axes === undefined ? {} : { activeAxes: axes as MotionAxis[] }), ...(mode ? { requestedCommandMode: mode } : {}),
    ...(motionValue === undefined ? {} : { requestedMotionValue: motionValue }) };
}
function ok(data: unknown): CommandResult { return { statusCode: 200, success: true, data }; }
function failure(statusCode: number, error: string): CommandResult { return { statusCode, success: false, data: { ok: false, error } }; }

/** One command dispatcher, with host-specific files/devices injected as ports. */
export class ApplicationFacade {
  readonly runtime: RuntimeApplicationPort;
  readonly services: ApplicationServices;
  constructor(runtime: RuntimeApplicationPort, services: ApplicationServices) { this.runtime = runtime; this.services = services; }
  overview(): JsonRecord { return buildOverview(this.runtime, this.services); }
  envelope(): JsonRecord { return { type: 'state', data: this.overview(), logs: this.services.logs().slice(-50) }; }
  private inputMode(): string { return String(record(this.runtime.getSnapshot())['inputMode'] ?? 'Manual').toLowerCase(); }
  private scriptResult(): JsonRecord { return { ok: true, inputMode: this.inputMode(), script: this.runtime.getScriptSnapshot() }; }
  async execute(method: string, path: string, value?: unknown): Promise<CommandResult> {
    const ordered = method.toUpperCase() !== 'GET' && (path.startsWith('/api/input/') && !['/api/input/active', '/api/input/osc/source'].includes(path)
      // Stop must reach the adapter's cancellation barrier while preparation is
      // still holding the mutation queue. Other script changes stay ordered.
      || path.startsWith('/api/output/replay/') || /^\/api\/control\/output\/[^/]+\/script-(?:prepare|play|seek|loop)$/.test(path));
    if (ordered && this.services.inputChange) {
      try { return await this.services.inputChange(() => this.dispatch(method, path, value)); }
      catch (error) { return failure(400, error instanceof Error ? error.message : 'Input setup failed.'); }
    }
    return this.dispatch(method, path, value);
  }
  private async dispatch(method: string, path: string, value?: unknown): Promise<CommandResult> {
    method = method.toUpperCase();
    try {
      let data: unknown;
      const body = () => commandBody(value);
      if (method === 'GET' && path === '/api/config') data = this.runtime.getConfig();
      else if (method === 'PUT' && path === '/api/config') data = await this.services.applyConfiguration(body());
      else if (method === 'GET' && path === '/api/state/overview') data = this.overview();
      else if (method === 'GET' && path === '/api/state/logs') data = this.services.logs();
      else if (method === 'GET' && path === '/api/meta/serial-ports') data = await this.services.listSerialPorts();
      else if (method === 'GET' && path === '/api/meta/midi-ports') data = await this.services.listMidiPorts();
      else if (method === 'GET' && path === '/api/meta/capabilities') data = this.services.capabilities?.() ?? { outputs: [] };
      else if (method === 'GET' && path === '/api/output/recordings') data = await this.services.listRecordings();
      else if (method === 'PUT' && path === '/api/input/osc/source') {
        const key = body()['sourceKey'];
        if (key !== null && key !== undefined && typeof key !== 'string') throw new Error('Invalid OSC source key.');
        data = await this.services.selectOscSource(typeof key === 'string' ? key : null);
      } else if (method === 'POST' && path === '/api/input/oscquery/refresh') data = await this.services.refreshOscQuery();
      else if (method === 'PUT' && path === '/api/input/active') {
        this.runtime.setInputActive(boolean(body()['active'], 'active')); await this.services.syncOsc();
        data = { ok: true, active: record(this.runtime.getSnapshot())['inputActive'], oscListening: this.services.oscSnapshot?.()['listening'] ?? false };
      } else if (method === 'PUT' && path === '/api/input/mode') {
        const mode = text(body()['mode'], 'mode');
        if (!['manual', 'osc', 'script', 'protocol', 'combined'].includes(mode.toLowerCase())) throw new Error('Choose a supported input mode.');
        const release = mode.toLowerCase() === this.inputMode() ? () => {} : this.runtime.blockInputActivation();
        try { this.runtime.setInputMode(mode); await this.services.syncOsc(); } finally { release(); }
        data = { ok: true, mode: this.inputMode(), oscListening: this.services.oscSnapshot?.()['listening'] ?? false };
      } else if (method === 'PUT' && path === '/api/input/manual') {
        const request = body();
        const enabled = request['enabled'] === undefined ? false : boolean(request['enabled'], 'enabled');
        const frame = enabled ? manualFrame(request) : null;
        const release = enabled && !['manual', 'combined'].includes(this.inputMode()) ? this.runtime.blockInputActivation() : () => {};
        try {
          this.runtime.setManual(frame);
          if (enabled && this.inputMode() !== 'combined') this.runtime.setInputMode('Manual');
          await this.services.syncOsc();
          data = { ok: true, inputMode: this.inputMode(), command: record(this.runtime.getSnapshot())['manualCommand'] ?? '' };
        } finally { release(); }
      } else if (method === 'DELETE' && path === '/api/input/manual') {
        this.runtime.setManual(null); data = { ok: true, inputMode: this.inputMode() };
      } else if (method === 'POST' && /^\/api\/control\/(?:runtime|loop)\/emergency-stop$/.test(path)) {
        this.runtime.emergencyStop(); await this.services.outputs.emergencyStop(); data = { ok: true, isEmergency: true };
      } else if (method === 'POST' && /^\/api\/control\/(?:runtime|loop)\/clear-emergency$/.test(path)) {
        this.runtime.clearEmergency(); data = { ok: true, isEmergency: record(this.runtime.getSnapshot())['isEmergency'] ?? false };
      } else if (method === 'POST' && path === '/api/input/script/load') {
        const request = body(), name = text(request['fileName'], 'fileName'), content = text(request['content'], 'content');
        if (!name.trim() || !content.trim()) throw new Error('Select a script file with content. / 请选择脚本文件。');
        const release = this.runtime.blockInputActivation();
        try { this.runtime.loadScript(name, content, scriptOptions(request)); await this.services.syncOsc(); data = this.scriptResult(); }
        finally { release(); }
      } else if (method === 'POST' && path === '/api/input/script/load-recording') {
        const name = text(body()['fileName'], 'fileName');
        if (!name.endsWith('.funscript')) throw new Error('Choose a completed Funscript recording.');
        const previous = record(this.runtime.getScriptSnapshot()), release = this.runtime.blockInputActivation();
        try { this.runtime.loadScript(name, await this.services.readRecording(name), scriptOptions(previous)); await this.services.syncOsc(); data = this.scriptResult(); }
        finally { release(); }
      } else if (method === 'POST' && path === '/api/input/script/play') {
        const options = scriptOptions(body()), changedMode = !['script', 'combined'].includes(this.inputMode());
        const release = changedMode ? this.runtime.blockInputActivation() : () => {};
        try { if (this.inputMode() !== 'combined') this.runtime.setInputMode('Script'); await this.services.syncOsc(); this.runtime.resetSignalProcessing(); this.runtime.playScript(options); data = this.scriptResult(); }
        finally { release(); }
      } else if (method === 'POST' && path === '/api/input/script/pause') { this.runtime.resetSignalProcessing(); this.runtime.pauseScript(); data = this.scriptResult(); }
      else if (method === 'POST' && path === '/api/input/script/stop') { this.runtime.resetSignalProcessing(); this.runtime.stopScript(); data = this.scriptResult(); }
      else if (method === 'PUT' && path === '/api/input/script/configure') { this.runtime.configureScript(scriptOptions(body())); data = this.scriptResult(); }
      else if (method === 'PUT' && path === '/api/input/script/seek') {
        this.runtime.resetSignalProcessing(); this.runtime.seekScript(numeric(body()['positionMs'], 'positionMs')); data = this.scriptResult();
      } else if (method === 'POST' && /^\/api\/input\/script\/action-(?:prev|next)$/.test(path)) { this.runtime.stepScript(path.endsWith('next') ? 1 : -1); data = this.scriptResult(); }
      else if (method === 'DELETE' && path === '/api/input/script') { this.runtime.clearScript(); data = this.scriptResult(); }
      else if (method === 'POST' && /^\/api\/recording\/(?:start|stop|export)$/.test(path)) {
        if (path.endsWith('start')) this.runtime.startRecording(); else this.runtime.stopRecording();
        const exported = path.endsWith('export') ? this.runtime.exportRecording() : null;
        data = path.endsWith('export') ? { fileName: `sensa-${new Date((this.services.now ?? Date.now)()).toISOString().replace(/[^0-9]/g, '').slice(0, 14)}.funscript`, content: typeof exported === 'string' ? exported : JSON.stringify(exported, null, 2) }
          : this.runtime.getRecordingSnapshot();
      } else if (method === 'POST' && /^\/api\/output\/replay\/(?:load|play|pause|seek)$/.test(path)) {
        const request = body(), action = path.split('/').at(-1)!;
        const release = action === 'load' ? this.runtime.blockInputActivation() : () => {};
        try {
          if (action === 'load') await this.services.outputs.emergencyStop();
          this.runtime.resetSignalProcessing();
          data = await this.services.outputs.replayAction(text(request['outputId'], 'outputId'), action,
            request['fileName'] === undefined ? undefined : text(request['fileName'], 'fileName'), numeric(request['timeMs'], 'timeMs', 0));
        } finally { release(); }
      } else if (method === 'POST') {
        const result = await this.outputCommand(path, value);
        if (result) { if (result.success) this.services.notify(); return result; }
        return failure(404, `Unknown command / 未知命令: ${method} ${path}`);
      } else return failure(404, `Unknown command / 未知命令: ${method} ${path}`);
      if (method !== 'GET') this.services.notify();
      return ok(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Command failed.';
      this.services.log(`[Command] ${method} ${path}: ${message}`, 'Error');
      return failure(400, message);
    }
  }
  private async outputCommand(path: string, value: unknown): Promise<CommandResult | null> {
    const modern = /^\/api\/control\/output\/([^/]+)\/(connect|disconnect|scan-start|scan-stop|device-info-refresh|script-prepare|script-play|script-seek|script-stop|script-loop)$/.exec(path);
    const legacy = /^\/api\/control\/(tcode|udp|tcp|intiface)\/(connect|disconnect|scan-start|scan-stop)$/.exec(path);
    if (!modern && !legacy) return null;
    const types = { tcode: 'TCodeSerial', udp: 'TCodeUdp', tcp: 'TCodeTcp', intiface: 'Intiface' };
    const config = this.runtime.getConfig();
    const output = modern ? config.outputs.find(item => item.id === modern[1])
      : config.outputs.find(item => item.type === types[legacy![1] as keyof typeof types]);
    if (!output) return failure(404, 'Output does not exist. / 输出不存在。');
    const action = (modern ?? legacy)![2]!, outputs = this.services.outputs;
    if (action === 'connect') {
      const connected = await outputs.connect(output.id);
      return ok({ ok: connected, connected: outputs.isConnected(output.id), isConnected: outputs.isConnected(output.id), outputId: output.id, type: output.type,
        message: connected ? `${output.name} 已连接。 / Connected.` : `${output.name} 连接失败。 / Connection failed.` });
    }
    if (action === 'disconnect') { await outputs.disconnect(output.id); return ok({ ok: true, connected: outputs.isConnected(output.id), isConnected: outputs.isConnected(output.id), outputId: output.id, type: output.type, message: `${output.name} 已断开。 / Disconnected.` }); }
    if (action === 'scan-start' || action === 'scan-stop') {
      if (output.type !== 'Intiface') return failure(400, 'Only Intiface outputs support scanning.');
      if (action === 'scan-start') await outputs.startScanning(output.id); else await outputs.stopScanning(output.id);
      return ok({ ok: true, outputId: output.id });
    }
    if (action === 'device-info-refresh') {
      if (!output.type.startsWith('TCode')) return failure(400, 'Only TCode outputs support device information.');
      await outputs.refreshDeviceInfo(output.id); return ok({ ok: true, outputId: output.id });
    }
    const request = action === 'script-stop' ? {} : commandBody(value);
    const scriptAction = action.slice(7);
    const options: { url?: string; positionMs?: number; loop?: boolean } = {};
    if (request['url'] !== undefined) options.url = text(request['url'], 'url');
    if (scriptAction === 'seek' || request['positionMs'] !== undefined) options.positionMs = numeric(request['positionMs'], 'positionMs');
    if (scriptAction === 'loop') options.loop = boolean(request['loop'], 'loop');
    const release = scriptAction === 'prepare' ? this.runtime.blockInputActivation() : () => {};
    try {
      if (scriptAction === 'prepare') { await outputs.emergencyStop(); this.runtime.resetSignalProcessing(); }
      return ok(await outputs.vendorScript(output.id, scriptAction, options));
    } finally { release(); }
  }
}
