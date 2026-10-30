import { randomUUID } from 'node:crypto';
import { SerializedAdapter } from './adapters.ts';
import { nodeSocketFactory, endpoint } from './transports.ts';
import { deadline } from '../../core/outputs/lifecycle.ts';
import { durationFor } from '../../core/outputs/codecs.ts';
import { record } from '../../core/outputs/types.ts';
import type { OutputDependencies, OutputDeviceConfig, RuntimeMotionFrame, SignalOutputValue, SocketChannel } from '../../core/outputs/types.ts';

/** Sensa frame commands are distinct from generic address/value JSON outputs. */
export class SensaMotionAdapter extends SerializedAdapter {
  readonly config: OutputDeviceConfig;
  readonly dependencies: OutputDependencies;
  #socket: SocketChannel | null = null;
  #session = 'node-' + randomUUID();
  #ack: { resolve(): void; reject(error: Error): void } | null = null;
  constructor(config: OutputDeviceConfig, dependencies: OutputDependencies = {}) { super(); this.config = config; this.dependencies = dependencies; }
  override get connected(): boolean { return this.ready && (this.config.type === 'SensaHttp' || this.#socket?.open === true); }
  protected async connectCore(): Promise<void> {
    if (this.config.type === 'SensaHttp') { endpoint(this.config.websocketAddress, ['http:', 'https:']); return; }
    this.#socket = await (this.dependencies.socketFactory ?? nodeSocketFactory)(this.config.websocketAddress, 5000);
    this.#socket.onMessage(text => {
      const ack = this.#ack; if (!ack) return;
      try { const value = record(JSON.parse(text) as unknown); if (value['ok'] !== true) throw new Error('Sensa endpoint rejected the command.'); this.#ack = null; ack.resolve(); }
      catch { this.#ack = null; ack.reject(new Error('Sensa returned an invalid acknowledgement.')); void this.#socket?.close(); }
    });
    this.#socket.onClose(() => { this.#ack?.reject(new Error('Sensa WebSocket disconnected.')); this.#ack = null; });
  }
  async request(body: object): Promise<void> {
    if (this.config.type === 'SensaHttp') {
      const response = await (this.dependencies.fetch ?? fetch)(this.config.websocketAddress, { method: 'POST', headers: { 'content-type': 'application/json', 'X-Sensa-Session': this.#session }, body: JSON.stringify(body), signal: AbortSignal.timeout(5000), redirect: 'error' });
      try { if (!response.ok) throw new Error(`Sensa HTTP output rejected the command (HTTP ${response.status}).`); } finally { await response.body?.cancel(); }
    } else {
      if (this.#ack) throw new Error('Sensa acknowledgement is still pending.');
      const acknowledgement = new Promise<void>((resolve, reject) => { this.#ack = { resolve, reject }; });
      try { await this.#socket?.send(JSON.stringify(body)); await deadline(acknowledgement, 5000, 'Sensa acknowledgement', () => { this.#ack?.reject(new Error('Sensa acknowledgement timed out.')); void this.#socket?.close(); }); }
      finally { this.#ack = null; }
    }
  }
  protected async motionCore(frame: RuntimeMotionFrame): Promise<void> {
    const durationMs = durationFor(frame), values = Object.fromEntries(Object.entries(frame.values).filter(([axis]) => !frame.activeAxes || frame.activeAxes.includes(axis as keyof typeof frame.values)));
    await this.request({ type: 'signal', values, durationMs, commands: Object.entries(values).map(([channel, value]) => ({ channel, value, durationMs })) });
  }
  protected async signalCore(_value: SignalOutputValue): Promise<void> { throw new Error('Sensa frame output requires an axis frame.'); }
  protected async stopCore(): Promise<void> { await this.request({ command: 'stop', type: 'stop' }); }
  protected async closeCore(): Promise<void> { this.#ack?.reject(new Error('Sensa output closed.')); this.#ack = null; const socket = this.#socket; this.#socket = null; await socket?.close(); }
}
