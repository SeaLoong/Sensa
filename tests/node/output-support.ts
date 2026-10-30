import { defaultOutputDeviceConfig, defaultSignalOutputBinding } from '../../src/core/runtime/configuration-defaults.ts';
import { createDefaultConfiguration } from '../../src/core/runtime/configuration.ts';
import { neutralValues } from '../../src/core/runtime/model.ts';
import type { OutputDeviceConfig, OutputDeviceType, RuntimeMotionFrame, MotionValues, AppConfig, SignalOutputBinding } from '../../src/core/runtime/model.ts';
import type { SocketChannel, OutputAdapter, SignalOutputValue } from '../../src/core/outputs/types.ts';

export function output(type: OutputDeviceType, id = 'out'): OutputDeviceConfig { return { ...defaultOutputDeviceConfig(), id, name: id, type, enabled: true }; }
export function configuration(outputs: OutputDeviceConfig[]): AppConfig { const config = createDefaultConfiguration(); config.outputs = outputs; return config; }
export function frame(values: Partial<MotionValues> = {}, extras: Partial<RuntimeMotionFrame> = {}): RuntimeMotionFrame { return { values: { ...neutralValues(), ...values }, deltaMs: 100, ...extras }; }
export function binding(id = 'binding', address = 'L0'): SignalOutputBinding { return { ...defaultSignalOutputBinding(), id, address }; }
export function deferred<T>(): { promise: Promise<T>; resolve(value: T): void; reject(error: Error): void } {
  let resolve!: (value: T) => void, reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject };
}
export class FakeSocket implements SocketChannel {
  open = true;
  sent: string[] = [];
  closeCount = 0;
  readonly messages = new Set<(text: string) => void>();
  readonly closures = new Set<(error: Error) => void>();
  readonly sender: (text: string, socket: FakeSocket) => void | Promise<void>;
  constructor(sender: (text: string, socket: FakeSocket) => void | Promise<void> = () => {}) { this.sender = sender; }
  async send(text: string): Promise<void> { if (!this.open) throw new Error('fake disconnected'); this.sent.push(text); await this.sender(text, this); }
  emit(value: unknown): void { const text = typeof value === 'string' ? value : JSON.stringify(value); for (const listener of this.messages) listener(text); }
  onMessage(listener: (text: string) => void): () => void { this.messages.add(listener); return () => this.messages.delete(listener); }
  onClose(listener: (error: Error) => void): () => void { this.closures.add(listener); return () => this.closures.delete(listener); }
  async close(): Promise<void> { if (!this.open) return; this.open = false; this.closeCount++; for (const listener of this.closures) listener(new Error('fake close')); }
}
export class MemoryAdapter implements OutputAdapter {
  connected = false;
  frames: RuntimeMotionFrame[] = [];
  signals: SignalOutputValue[] = [];
  stops = 0;
  closes = 0;
  async connect(): Promise<void> { this.connected = true; }
  async sendMotion(value: RuntimeMotionFrame): Promise<void> { this.frames.push(structuredClone(value)); }
  async sendSignal(value: SignalOutputValue): Promise<void> { this.signals.push(structuredClone(value)); }
  async stop(): Promise<void> { this.stops++; }
  async close(): Promise<void> { this.connected = false; this.closes++; }
}
