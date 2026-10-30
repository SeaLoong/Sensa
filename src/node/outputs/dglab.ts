import { SerializedAdapter } from './adapters.ts';
import { nodeSocketFactory, endpoint } from './transports.ts';
import { deadline } from '../../core/outputs/lifecycle.ts';
import { dglabClear, dglabOperation, dglabPulse, dglabReset } from '../../core/outputs/codecs.ts';
import type { DglabTarget } from '../../core/outputs/codecs.ts';
import type { OutputDependencies, OutputDeviceConfig, RuntimeMotionFrame, SignalOutputValue, SocketChannel } from '../../core/outputs/types.ts';
import { identifier, optionalRecord, record } from '../../core/outputs/types.ts';

interface DglabDevice { slotId: string; name: string; type: string; props: Record<string, unknown>; slotState: Record<string, unknown>; updatedAtMs: number }
interface DglabClient { clientId: string; devices: Map<string, DglabDevice>; lastAction: number | null; actionSequence: number; updatedAtMs: number }
interface Pending { resolve(value: unknown): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }
function nestedNumber(node: unknown, path: string): number | null {
  const segments = path.split('.'); if (segments.length > 16) return null;
  for (const segment of segments) { if (['__proto__', 'prototype', 'constructor'].includes(segment)) return null; node = optionalRecord(node)?.[segment]; }
  return typeof node === 'boolean' ? node ? 1 : 0 : typeof node === 'number' && Number.isFinite(node) ? node : null;
}
function merge(target: Record<string, unknown>, patch: Record<string, unknown>, depth = 0): void {
  if (depth > 16) throw new RangeError('DG-LAB property nesting exceeds its limit.');
  for (const [key, value] of Object.entries(patch)) {
    if (['__proto__', 'constructor', 'prototype'].includes(key)) continue;
    const child = optionalRecord(value), old = optionalRecord(target[key]);
    if (child && old) merge(old, child, depth + 1); else target[key] = structuredClone(value);
  }
}

export class DglabAdapter extends SerializedAdapter {
  #socket: SocketChannel | null = null;
  #targetId: string | null = null;
  #clients = new Map<string, DglabClient>();
  #pending = new Map<string, Pending>();
  #sequence = 0;
  #generation = 0;
  #heartbeat: ReturnType<typeof setInterval> | null = null;
  #pongs = 0;
  #hello: (() => void) | null = null;
  #controlled = new Map<string, DglabTarget>();
  #commandError: string | null = null;
  #lastError: string | null = null;
  readonly config: OutputDeviceConfig;
  readonly dependencies: OutputDependencies;
  constructor(config: OutputDeviceConfig, dependencies: OutputDependencies = {}) { super(); this.config = config; this.dependencies = dependencies;  }
  override get connected(): boolean { return this.ready && this.#socket?.open === true && this.#targetId !== null && this.#commandError === null; }
  now(): number { return this.dependencies.now?.() ?? Date.now(); }
  protected async connectCore(): Promise<void> {
    const address = this.config.signal.serverUrl || 'wss://trex.dungeon-lab.cn/v4'; endpoint(address, ['ws:', 'wss:']);
    const hello = new Promise<void>(resolve => { this.#hello = resolve; }); this.#generation++; this.#commandError = this.#lastError = null;
    this.#socket = await (this.dependencies.socketFactory ?? nodeSocketFactory)(address, 8000);
    const socket = this.#socket, generation = this.#generation;
    this.#socket.onMessage(text => { if (this.#socket !== socket || this.#generation !== generation) return; try { this.receive(text); } catch { this.fail('DG-LAB returned invalid discovery data.'); } });
    this.#socket.onClose(() => { if (this.#socket === socket && this.#generation === generation) this.fail('DG-LAB relay disconnected.'); });
    try {
      await deadline(hello, 8000, 'DG-LAB relay greeting', () => this.fail('DG-LAB relay greeting timed out.'));
      this.#heartbeat = setInterval(() => { if (++this.#pongs > 3) { this.fail('DG-LAB relay heartbeat timed out.'); return; } void this.#socket?.send('{"type":"ping"}').catch(() => this.fail('DG-LAB relay heartbeat failed.')); }, 2000); this.#heartbeat.unref?.();
    } catch (error) { this.fail('DG-LAB initialization failed.'); throw error; }
  }
  receive(text: string): void {
    const frame = record(JSON.parse(text) as unknown), type = frame['type'], clientId = frame['clientId'];
    if (type === 'hello') {
      if (typeof clientId !== 'string') return; identifier(clientId);
      if (this.#targetId !== null && this.#targetId !== clientId) throw new Error('DG-LAB pairing identity changed.');
      this.#targetId = clientId; this.#hello?.(); this.#hello = null;
    } else if (type === 'pong') this.#pongs = 0;
    else if (type === 'idle_timeout' || type === 'error') this.fail('DG-LAB relay rejected the connection.');
    else if (typeof clientId === 'string') {
      if (type === 'client_attached' && this.#targetId) {
        identifier(clientId); if (!this.#clients.has(clientId)) { if (this.#clients.size >= 32) throw new RangeError('DG-LAB APP limit exceeded.'); this.#clients.set(clientId, { clientId, devices: new Map(), lastAction: null, actionSequence: 0, updatedAtMs: this.now() }); }
      } else if (type === 'client_disconnected') {
        this.#clients.delete(clientId);
        for (const [key, waiter] of this.#pending) if (key.startsWith(clientId + '\0')) { this.#pending.delete(key); clearTimeout(waiter.timer); waiter.reject(new Error('DG-LAB APP disconnected.')); }
        for (const [key, target] of this.#controlled) if (target.clientId === clientId) this.#controlled.delete(key);
      } else if (type === 'message' && this.#clients.has(clientId)) {
        const data = record(frame['data']); this.applyDevices(clientId, data);
        if (data['t'] === 'resp') {
          const id = data['reqId'] ?? data['requestId']; if (typeof id !== 'string') return;
          const key = clientId + '\0' + id, waiter = this.#pending.get(key);
          if (waiter) { this.#pending.delete(key); clearTimeout(waiter.timer); if (typeof data['error'] === 'string' && data['error']) waiter.reject(new Error('DG-LAB APP rejected the operation.')); else waiter.resolve(data['result'] ?? null); }
        }
      }
    }
    this.dependencies.changed?.();
  }
  applyDevices(clientId: string, data: Record<string, unknown>): void {
    const client = this.#clients.get(clientId); if (!client) return;
    const event = data['t'] === 'ev' ? data['ev'] : null;
    const replace = event === 'devices.snapshot' ? data['devices'] : data['t'] === 'resp' ? optionalRecord(data['result'])?.['devices'] : null;
    if (Array.isArray(replace)) {
      if (replace.length > 256) throw new RangeError('DG-LAB device limit exceeded.');
      const ids = new Set<string>(); for (const raw of replace) { const id = this.upsert(client, raw); if (id) ids.add(id); }
      for (const id of client.devices.keys()) if (!ids.has(id)) client.devices.delete(id);
    } else if (event === 'devices.patch') {
      if (Array.isArray(data['added'])) for (const value of data['added']) this.upsert(client, value);
      if (Array.isArray(data['removed'])) for (const value of data['removed']) if (typeof value === 'string') client.devices.delete(value);
    } else if (event === 'slots.patch' && Array.isArray(data['slots'])) {
      for (const raw of data['slots']) {
        const patch = optionalRecord(raw); if (!patch || typeof patch['slotId'] !== 'string') continue;
        const device = client.devices.get(patch['slotId']); if (!device) continue;
        const props = optionalRecord(patch['props']), slot = optionalRecord(patch['slotState']);
        if (props) merge(device.props, props); if (slot) merge(device.slotState, slot); this.validateDevice(device); device.updatedAtMs = this.now();
      }
    } else if (event === 'custom.action' && typeof data['action'] === 'number' && Number.isInteger(data['action']) && data['action'] >= 0 && data['action'] <= 9) { client.lastAction = data['action']; client.actionSequence++; }
    client.updatedAtMs = this.now();
    for (const [key, target] of this.#controlled) if (!this.canOperate(target)) this.#controlled.delete(key);
  }
  upsert(client: DglabClient, raw: unknown): string | null {
    const value = optionalRecord(raw); if (!value || typeof value['slotId'] !== 'string') return null;
    const id = identifier(value['slotId']); let device = client.devices.get(id);
    if (!device) { if ([...this.#clients.values()].reduce((sum, row) => sum + row.devices.size, 0) >= 256) throw new RangeError('DG-LAB device limit exceeded.'); device = { slotId: id, name: '', type: '', props: {}, slotState: {}, updatedAtMs: this.now() }; client.devices.set(id, device); }
    if (typeof value['name'] === 'string') device.name = value['name']; if (typeof value['type'] === 'string') device.type = value['type'];
    if (optionalRecord(value['props'])) device.props = structuredClone(value['props'] as Record<string, unknown>);
    if (optionalRecord(value['slotState'])) device.slotState = structuredClone(value['slotState'] as Record<string, unknown>);
    this.validateDevice(device); device.updatedAtMs = this.now(); return id;
  }
  validateDevice(device: DglabDevice): void { if (device.name.length > 256 || device.type.length > 256 || Buffer.byteLength(JSON.stringify([device.props, device.slotState])) > 32768) throw new RangeError('DG-LAB device properties exceed their limits.'); }
  canOperate(target: DglabTarget): boolean { const device = this.#clients.get(target.clientId)?.devices.get(target.slotId); return !!device && device.slotState['hasDevice'] !== false && device.props['connectState'] !== 'disconnected'; }
  request(clientId: string, method: string, data: unknown, timeoutMs = 3000): Promise<unknown> {
    identifier(clientId); const socket = this.#socket;
    if (!socket?.open || !this.#targetId || !this.#clients.has(clientId)) return Promise.reject(new Error('DG-LAB APP is not connected.'));
    const stopping = method === 'device.op.clear' || optionalRecord(data)?.['t'] === 7;
    if (this.#pending.size >= 32 + (stopping ? 4 : 0)) return Promise.reject(new Error('DG-LAB request queue is full.'));
    const id = `${this.#generation}-${++this.#sequence}`, key = clientId + '\0' + id;
    const promise = new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => { this.#pending.delete(key); reject(new Error('DG-LAB APP response timed out.')); }, timeoutMs); timer.unref?.();
      this.#pending.set(key, { resolve, reject, timer });
    });
    void socket.send(JSON.stringify({ type: 'message', clientId, data: { t: 'req', reqId: id, m: method, data } })).catch(() => this.fail('DG-LAB write failed.'));
    return promise;
  }
  target(channel = this.config.signal.channel): DglabTarget { return { clientId: this.config.signal.clientId, slotId: this.config.signal.slotId, channel }; }
  protected async signalCore(sample: SignalOutputValue): Promise<void> {
    const target = this.target(sample.channel ?? this.config.signal.channel);
    if (this.#commandError || !this.canOperate(target)) throw new Error('Choose an attached DG-LAB device and channel.');
    const key = `${target.clientId}\0${target.slotId}\0${target.channel}`; this.#controlled.set(key, target);
    const duration = this.config.signal.taskDurationMs;
    let operation: Record<string, unknown>;
    if (sample.address === 'Pulse') {
      if (sample.value <= 0) { await this.stopTarget(target); return; }
      const frames = this.config.signal.waveformFrames; operation = dglabPulse(target, frames, duration, frames[0]?.length === 6 ? 2 : 3);
    } else if (sample.address === 'Intensity') {
      const state = this.#clients.get(target.clientId)?.devices.get(target.slotId)?.slotState;
      const channel = optionalRecord(state?.[target.channel === 0 ? 'channelA' : 'channelB']);
      const maximum = typeof channel?.['intensityMax'] === 'number' ? channel['intensityMax'] : Infinity;
      const amount = channel?.['isMuted'] === true ? 0 : Math.min(sample.value, maximum, this.config.signal.maxIntensity);
      operation = dglabOperation(target, amount, duration);
    } else throw new Error('DG-LAB bindings use Intensity or Pulse.');
    const generation = this.#generation;
    try { await this.request(target.clientId, 'device.op', operation, Math.max(3000, duration + 1000)); this.dependencies.telemetry?.recordTarget(`${target.slotId}/${target.channel}/${sample.address}`, sample.address, sample.address === 'Intensity' ? Number(operation['v']) : 1, sample.address === 'Intensity' ? Math.max(1, this.config.signal.maxIntensity) : 1); }
    catch (error) { if (generation === this.#generation) this.#commandError = this.#lastError = 'DG-LAB command failed; reconnect before sending more commands.'; this.dependencies.changed?.(); throw error; }
  }
  async stopTarget(target: DglabTarget): Promise<void> {
    const results = await Promise.allSettled([this.request(target.clientId, 'device.op.clear', dglabClear(target), 500), this.request(target.clientId, 'device.op', dglabReset(target), 500)]);
    this.#controlled.delete(`${target.clientId}\0${target.slotId}\0${target.channel}`);
    const failed = results.find(result => result.status === 'rejected'); if (failed?.status === 'rejected') throw failed.reason;
  }
  protected async motionCore(_frame: RuntimeMotionFrame): Promise<void> { throw new Error('DG-LAB uses explicit signal bindings.'); }
  protected async stopCore(): Promise<void> { const targets = [...this.#controlled.values()]; const results = await Promise.allSettled(targets.map(target => this.stopTarget(target))); const failed = results.find(result => result.status === 'rejected'); if (failed?.status === 'rejected') throw failed.reason; }
  override stop(): Promise<void> { return this.lane.barrier(async () => { if (this.#socket?.open) await this.stopCore(); }); }
  protected async closeCore(): Promise<void> { try { if (this.#socket?.open) await this.stopCore(); } catch { /* The finite task lease still expires when stop cannot be acknowledged. */ } finally { this.fail('DG-LAB disconnected.'); } }
  fail(reason: string): void {
    const socket = this.#socket; this.#socket = null; this.#targetId = null; this.#generation++; this.#lastError = reason;
    if (this.#heartbeat) clearInterval(this.#heartbeat); this.#heartbeat = null;
    for (const waiter of this.#pending.values()) { clearTimeout(waiter.timer); waiter.reject(new Error(reason)); } this.#pending.clear(); this.#clients.clear(); this.#controlled.clear();
    if (socket) void socket.close(); this.dependencies.changed?.();
  }
  devices(): readonly unknown[] { return [...this.#clients.values()].flatMap(client => [...client.devices.values()].map(device => ({ ...device, clientId: client.clientId }))); }
  snapshot(): unknown {
    const url = new URL(this.config.signal.serverUrl || 'wss://trex.dungeon-lab.cn/v4'); if (this.#targetId) url.searchParams.set('tid', this.#targetId);
    return { connected: this.connected, state: this.#commandError ? 'CommandError' : !this.#socket?.open ? 'Disconnected' : this.#clients.size ? 'Paired' : 'WaitingForApp', targetId: this.#targetId,
      pairingUrl: this.#targetId ? url.href : null, appPairingUrl: this.#targetId ? 'https://dungeon-lab.cn/s/?v=1&action=socket&url=' + encodeURIComponent(url.href) : null,
      clients: [...this.#clients.values()].map(client => ({ ...client, devices: [...client.devices.values()] })), devices: this.devices(), lastError: this.#lastError, generation: this.#generation };
  }
  feedback(path: string): number | null {
    const target = this.target(), client = this.#clients.get(target.clientId); if (!this.connected || !client) return null;
    if (path === 'action') return client.lastAction;
    if (path === 'actionSequence') return client.actionSequence;
    if (/^action\.[0-9]$/u.test(path)) return client.lastAction === null ? null : client.lastAction === Number(path.slice(7)) ? 1 : 0;
    if (path === 'connected') return this.canOperate(target) ? 1 : 0;
    const device = client.devices.get(target.slotId); if (!device) return null;
    return path.startsWith('props.') ? nestedNumber(device.props, path.slice(6)) : path.startsWith('slotState.') ? nestedNumber(device.slotState, path.slice(10)) : null;
  }
}
