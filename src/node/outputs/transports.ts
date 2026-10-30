import dgram from 'node:dgram';
import WebSocket from 'ws';
import { loadOptionalPackage } from '../native-packages.ts';
import net from 'node:net';
import tls from 'node:tls';
import type { MidiFactory, MidiPortHandle, SerialFactory, SerialPortHandle, SerialPortInfo, SocketChannel, SocketFactory } from '../../core/outputs/types.ts';
import { deadline } from '../../core/outputs/lifecycle.ts';
import { optionalRecord, hasControl } from '../../core/outputs/types.ts';

export const MAXIMUM_PAYLOAD_BYTES = 65536;
export function endpoint(value: string, schemes: readonly string[]): URL {
  const address = new URL(value);
  if (!schemes.includes(address.protocol) || !address.hostname || address.username || address.password || address.hash) throw new TypeError('Invalid output endpoint.');
  return address;
}
export function hostPort(host: string, port: number): void {
  if (!host || host.length > 253 || /[\s/]/u.test(host) || hasControl(host) || !Number.isInteger(port) || port < 1 || port > 65535) throw new TypeError('Invalid output host or port.');
}
export interface ByteTransport { readonly connected: boolean; connect(): Promise<void>; send(data: Uint8Array): Promise<void>; close(): Promise<void> }

export class UdpTransport implements ByteTransport {
  #socket: dgram.Socket | null = null;
  readonly host: string;
  readonly port: number;
  readonly timeoutMs: number;
  constructor(host: string, port: number, timeoutMs = 3000) { this.host = host; this.port = port; this.timeoutMs = timeoutMs;  hostPort(host, port); }
  get connected(): boolean { return this.#socket !== null; }
  async connect(): Promise<void> {
    if (this.#socket) return;
    const socket = dgram.createSocket(net.isIP(this.host.replace(/^\[|\]$/gu, '')) === 6 ? 'udp6' : 'udp4');
    socket.on('error', () => { if (this.#socket === socket) { this.#socket = null; socket.close(); } });
    this.#socket = socket;
    try { await deadline(new Promise<void>((resolve, reject) => {
      socket.once('error', reject);
      socket.connect(this.port, this.host.replace(/^\[|\]$/gu, ''), () => { socket.removeListener('error', reject); resolve(); });
    }), this.timeoutMs, 'UDP connection', () => { socket.close(); this.#socket = null; }); }
    catch (error) { if (this.#socket === socket) await this.close(); throw error; }
  }
  async send(data: Uint8Array): Promise<void> {
    if (data.length > 65507) throw new RangeError('UDP output exceeds one datagram.');
    const socket = this.#socket; if (!socket) throw new Error('UDP output is disconnected.');
    await deadline(new Promise<void>((resolve, reject) => socket.send(data, error => error ? reject(new Error('UDP write failed.')) : resolve())), this.timeoutMs, 'UDP write');
  }
  async close(): Promise<void> {
    const socket = this.#socket; this.#socket = null;
    if (socket) await new Promise<void>(resolve => { try { socket.close(() => resolve()); } catch { resolve(); } });
  }
}

export class TcpTransport implements ByteTransport {
  protected socket: net.Socket | null = null;
  readonly host: string;
  readonly port: number;
  readonly timeoutMs: number;
  readonly useTls: boolean;
  constructor(host: string, port: number, timeoutMs = 3000, useTls = false) { this.host = host; this.port = port; this.timeoutMs = timeoutMs; this.useTls = useTls;  hostPort(host, port); }
  get connected(): boolean { return this.socket !== null && !this.socket.destroyed && this.socket.writable; }
  async connect(): Promise<void> {
    if (this.connected) return;
    const host = this.host.replace(/^\[|\]$/gu, '');
    const socket = this.useTls ? tls.connect({ host, port: this.port, servername: net.isIP(host) ? undefined : host }) : net.createConnection({ host, port: this.port });
    this.socket = socket; socket.setNoDelay(true);
    socket.on('error', () => { if (this.socket === socket) this.socket = null; socket.destroy(); });
    socket.on('close', () => { if (this.socket === socket) this.socket = null; });
    await deadline(new Promise<void>((resolve, reject) => {
      const error = (): void => reject(new Error('TCP connection failed.'));
      socket.once('error', error);
      socket.once(this.useTls ? 'secureConnect' : 'connect', () => { socket.removeListener('error', error); resolve(); });
    }), this.timeoutMs, 'TCP connection', () => { socket.destroy(); if (this.socket === socket) this.socket = null; });
  }
  async send(data: Uint8Array): Promise<void> { return this.sendFramed(data, MAXIMUM_PAYLOAD_BYTES); }
  protected async sendFramed(data: Uint8Array, maximumBytes: number): Promise<void> {
    if (data.length > maximumBytes) throw new RangeError('Output payload exceeds 64 KiB.');
    const socket = this.socket; if (!socket || !this.connected) throw new Error('TCP output is disconnected.');
    await deadline(new Promise<void>((resolve, reject) => socket.write(data, error => error ? reject(new Error('TCP write failed.')) : resolve())), this.timeoutMs, 'TCP write', () => socket.destroy());
  }
  onData(listener: (value: Uint8Array) => void): () => void {
    const socket = this.socket; if (!socket) throw new Error('TCP output is disconnected.');
    socket.on('data', listener); return () => socket.off('data', listener);
  }
  async close(): Promise<void> { const socket = this.socket; this.socket = null; socket?.destroy(); }
}

interface WsRaw {
  readyState: number;
  bufferedAmount: number;
  on(event: string, callback: (...args: unknown[]) => void): void;
  off(event: string, callback: (...args: unknown[]) => void): void;
  send(data: string, callback: (error?: Error) => void): void;
  close(code?: number, reason?: string): void;
  terminate(): void;
}

export const nodeSocketFactory: SocketFactory = async (address, timeoutMs) => {
  endpoint(address, ['ws:', 'wss:']);
  const raw = new WebSocket(address, { maxPayload: 1048576, handshakeTimeout: timeoutMs, followRedirects: false }) as unknown as WsRaw;
  const messages = new Set<(text: string) => void>();
  const buffered: string[] = []; let bufferedBytes = 0;
  const closed = new Set<(error: Error) => void>();
  let ended = false;
  const end = (reason: string): void => { if (ended) return; ended = true; for (const listener of closed) listener(new Error(reason)); messages.clear(); closed.clear(); };
  raw.on('error', () => end('WebSocket transport failed.'));
  raw.on('close', () => end('WebSocket transport closed.'));
  raw.on('message', (value, binary) => {
    try {
      if (binary === true || !(typeof value === 'string' || value instanceof Uint8Array)) throw new TypeError('WebSocket JSON requires UTF-8 text.');
      const text = typeof value === 'string' ? value : new TextDecoder('utf-8', { fatal: true }).decode(value);
      if (Buffer.byteLength(text, 'utf8') > 1048576) throw new RangeError('WebSocket message exceeds 1 MiB.');
      if (!messages.size) { bufferedBytes += Buffer.byteLength(text); if (buffered.length >= 32 || bufferedBytes > 1048576) throw new RangeError('Unclaimed WebSocket messages exceed 1 MiB.'); buffered.push(text); }
      else for (const listener of messages) listener(text);
    } catch { end('WebSocket message was invalid.'); raw.terminate(); }
  });
  try {
    await deadline(new Promise<void>((resolve, reject) => {
      raw.on('open', () => { if (ended) reject(new Error('WebSocket closed while opening.')); else resolve(); });
      const onError = (): void => reject(new Error('WebSocket connection failed.'));
      raw.on('error', onError); raw.on('close', onError);
    }), timeoutMs, 'WebSocket connection', () => raw.terminate());
  } catch (error) { raw.terminate(); throw error; }
  const result: SocketChannel = {
    get open() { return !ended && raw.readyState === 1; },
    async send(message) {
      if (ended || raw.readyState !== 1) throw new Error('WebSocket is disconnected.');
      if (Buffer.byteLength(message, 'utf8') > 1048576 || raw.bufferedAmount > 1048576) throw new RangeError('WebSocket output backlog exceeds 1 MiB.');
      await deadline(new Promise<void>((resolve, reject) => raw.send(message, error => error ? reject(new Error('WebSocket write failed.')) : resolve())), timeoutMs, 'WebSocket write', () => raw.terminate());
    },
    async close() { end('WebSocket closed.'); raw.terminate(); },
    onMessage(listener) { messages.add(listener); for (const text of buffered.splice(0)) listener(text); bufferedBytes = 0; return () => messages.delete(listener); },
    onClose(listener) { closed.add(listener); return () => closed.delete(listener); },
  };
  return result;
};

interface SerialRaw {
  open(callback: (error?: Error | null) => void): void;
  write(bytes: Uint8Array, callback: (error?: Error | null) => void): void;
  drain(callback: (error?: Error | null) => void): void;
  close(callback: (error?: Error | null) => void): void;
  on(event: string, callback: (...args: unknown[]) => void): void;
  off(event: string, callback: (...args: unknown[]) => void): void;
  isOpen: boolean;
}
interface SerialConstructor {
  new(options: { path: string; baudRate: number; autoOpen: boolean }): SerialRaw;
  list(): Promise<SerialPortInfo[]>;
}
async function serialConstructor(): Promise<SerialConstructor> {
  const module = optionalRecord(await loadOptionalPackage('serialport'));
  if (typeof module?.['SerialPort'] !== 'function') throw new Error('Install the optional serialport binding for this platform.');
  return module['SerialPort'] as unknown as SerialConstructor;
}
export const nodeSerialFactory: SerialFactory = {
  async list() { const Constructor = await serialConstructor(); return Constructor.list(); },
  async open(path, baudRate, signal) {
    signal?.throwIfAborted();
    const Constructor = await serialConstructor(); signal?.throwIfAborted(); const raw = new Constructor({ path, baudRate, autoOpen: false });
    let closed = false; raw.on('error', () => { closed = true; });
    const opening = new Promise<void>((resolve, reject) => raw.open(error => error ? reject(new Error('Serial port could not be opened.')) : resolve()));
    try { await deadline(opening, 3000, 'Serial opening'); signal?.throwIfAborted(); }
    catch (error) { closed = true; void opening.then(() => { if (raw.isOpen) raw.close(() => {}); }, () => {}); throw error; }
    return {
      async write(bytes) { if (closed) throw new Error('Serial port is closed.'); await deadline(new Promise<void>((resolve, reject) => raw.write(bytes, error => error ? reject(new Error('Serial write failed.')) : resolve())), 3000, 'Serial write'); },
      async drain() { if (closed) throw new Error('Serial port is closed.'); await deadline(new Promise<void>((resolve, reject) => raw.drain(error => error ? reject(new Error('Serial drain failed.')) : resolve())), 3000, 'Serial drain'); },
      async close() { if (!raw.isOpen) { closed = true; return; } closed = true; await deadline(new Promise<void>(resolve => raw.close(() => resolve())), 1000, 'Serial close'); },
      onData(listener) { const callback = (value: unknown): void => { if (value instanceof Uint8Array) listener(value); }; raw.on('data', callback); return () => raw.off('data', callback); },
    };
  },
};

interface MidiRaw { getPortCount(): number; getPortName(index: number): string; openPort(index: number): void; closePort(): void; sendMessage(bytes: number[]): void }
async function midiOutput(): Promise<MidiRaw> {
  const module = optionalRecord(await loadOptionalPackage('@julusian/midi'));
  const constructor = module?.['Output'] ?? optionalRecord(module?.['default'])?.['Output'];
  if (typeof constructor !== 'function') throw new Error('Install the optional MIDI binding for this platform.');
  return new (constructor as unknown as { new(): MidiRaw })();
}
export const nodeMidiFactory: MidiFactory = {
  async list() { const output = await midiOutput(); try { return Array.from({ length: output.getPortCount() }, (_, index) => output.getPortName(index)); } finally { output.closePort(); } },
  async open(name) {
    const output = await midiOutput(); const indexes: number[] = [];
    const numeric = /^[0-9]+$/u.test(name) ? Number(name) : -1;
    if (numeric >= 0 && numeric < output.getPortCount()) indexes.push(numeric);
    else for (let index = 0; index < output.getPortCount(); index++) if (output.getPortName(index) === name) indexes.push(index);
    if (indexes.length !== 1 || indexes[0] === undefined) { output.closePort(); throw new Error('Select one MIDI output port by its unique name or ID.'); }
    output.openPort(indexes[0]); let closed = false;
    return { async send(bytes) { if (closed) throw new Error('MIDI port is closed.'); output.sendMessage([...bytes]); }, async close() { if (!closed) { closed = true; output.closePort(); } } } satisfies MidiPortHandle;
  },
};

export class SerialTransport implements ByteTransport {
  #handle: SerialPortHandle | null = null;
  #generation = 0;
  #attempt: AbortController | null = null;
  readonly path: string;
  readonly factory: SerialFactory;
  readonly timeoutMs: number;
  constructor(path: string, factory: SerialFactory = nodeSerialFactory, timeoutMs = 3000) { this.path = path; this.factory = factory; this.timeoutMs = timeoutMs; }
  get connected(): boolean { return this.#handle !== null; }
  async connect(): Promise<void> {
    if (this.#handle) return;
    const generation = this.#generation, controller = new AbortController(); this.#attempt = controller;
    const opening = this.factory.open(this.path, 115200, controller.signal); let abandoned = false;
    void opening.then(handle => { if (abandoned || generation !== this.#generation) void handle.close().catch(() => {}); }, () => {});
    try {
      const handle = await deadline(opening, this.timeoutMs, 'Serial opening', () => { abandoned = true; controller.abort(); });
      if (generation !== this.#generation) throw new Error('Serial opening was cancelled.');
      this.#handle = handle;
    } catch (error) { abandoned = true; throw error; }
  }
  async send(data: Uint8Array): Promise<void> { const handle = this.#handle; if (!handle) throw new Error('Serial output is disconnected.'); await handle.write(data); await handle.drain(); }
  get canRead(): boolean { return typeof this.#handle?.onData === 'function'; }
  onData(listener: (bytes: Uint8Array) => void): () => void { return this.#handle?.onData?.(listener) ?? (() => {}); }
  async close(): Promise<void> { this.#generation++; this.#attempt?.abort(); this.#attempt = null; const handle = this.#handle; this.#handle = null; await handle?.close(); }
}
