import type { AppConfig, OutputDeviceConfig, RuntimeMotionFrame, ComputedSignalInputConfig, ComputedSignalSample } from '../runtime/model.ts';
import type { OutputTelemetry } from './telemetry.ts';

export type { AppConfig, OutputDeviceConfig, RuntimeMotionFrame };
export type SignalValueType = 'Float' | 'Int' | 'Bool';
export interface SignalOutputValue {
  address: string;
  value: number;
  type?: SignalValueType;
  signalId?: string;
  unit?: string;
  timestampMs?: number;
  coordinateFrame?: string | null;
  channel?: number;
}
export interface OutputStatus {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
  connected: boolean;
  state: string;
  error: string | null;
  lastError: string | null;
  lastSendAtMs: number | null;
  sentCount: number;
  devices?: readonly unknown[];
  script?: VendorScriptState;
  telemetry: { state: string; sendCount: number; lastSendAtMs: number | null; targets: readonly unknown[] };
}
export interface VendorScriptState {
  supported: boolean;
  loopSupported: boolean;
  prepared: boolean;
  playing: boolean;
  loop: boolean;
  positionMs: number;
}
export interface OutputAdapter {
  readonly connected: boolean;
  connect(): Promise<void>;
  sendMotion(frame: RuntimeMotionFrame): Promise<void>;
  sendSignal(value: SignalOutputValue): Promise<void>;
  stop(): Promise<void>;
  close(): Promise<void>;
  devices?(): readonly unknown[];
  scan?(enabled: boolean): Promise<void>;
  vendorScript?(action: string, value?: unknown): Promise<void>;
  scriptState?(): VendorScriptState;
  feedback?(path: string): number | null;
  snapshot?(): unknown;
  refreshDeviceInfo?(): Promise<unknown>;
  recordSample?(id: string, sample: ComputedSignalSample, value: number | null, now: number): Promise<void>;
}
export interface SerialPortInfo { path: string; manufacturer?: string; serialNumber?: string; vendorId?: string; productId?: string }
export interface SerialPortHandle {
  write(bytes: Uint8Array): Promise<void>;
  drain(): Promise<void>;
  close(): Promise<void>;
  onData?(listener: (bytes: Uint8Array) => void): () => void;
}
export interface SerialFactory {
  list(): Promise<readonly SerialPortInfo[]>;
  open(path: string, baudRate: number, signal?: AbortSignal): Promise<SerialPortHandle>;
}
export interface MidiPortHandle { send(bytes: readonly number[]): Promise<void>; close(): Promise<void>; claim?(messages: readonly Uint8Array[]): void }
export interface MidiFactory { list(): Promise<readonly string[]>; open(name: string): Promise<MidiPortHandle> }
export interface SocketChannel {
  readonly open: boolean;
  send(message: string): Promise<void>;
  close(): Promise<void>;
  onMessage(listener: (text: string) => void): () => void;
  onClose(listener: (error: Error) => void): () => void;
}
export type SocketFactory = (address: string, timeoutMs: number) => Promise<SocketChannel>;
export interface BridgeProcess {
  readonly exited: Promise<number | null>;
  readonly ready?: Promise<void>;
  stop(): Promise<void>;
}
export interface OutputDependencies {
  telemetry?: OutputTelemetry;
  now?: () => number;
  canSend?: () => boolean;
  log?: (message: string) => void;
  changed?: () => void;
  fetch?: typeof fetch;
  socketFactory?: SocketFactory;
  serialFactory?: SerialFactory;
  midiFactory?: MidiFactory;
  recordingDirectory?: string;
  baseDirectory?: string;
  bridgePython?: string;
  bridgeScriptPath?: string;
  bridgeDiagnostics?: (executable: string, args: readonly string[]) => Promise<unknown>;
  engineProcessFactory?: (executable: string, args: readonly string[]) => BridgeProcess;
  bridgeProcessFactory?: (executable: string, args: readonly string[]) => BridgeProcess;
}
export type ResolveInput = (input: ComputedSignalInputConfig) => ComputedSignalSample;

export function finite(value: number, name = 'Output value'): number {
  if (!Number.isFinite(value)) throw new TypeError(`${name} must be finite.`);
  return value;
}
export function clamp(value: number, min = 0, max = 1): number { return Math.min(max, Math.max(min, finite(value))); }
export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Expected a JSON object.');
  return value as Record<string, unknown>;
}
export function optionalRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
export function hasControl(value: string): boolean { return [...value].some(character => { const code = character.codePointAt(0) ?? 0; return code < 32 || code === 127; }); }
export function identifier(value: string): string {
  if (!value || value.length > 256 || hasControl(value)) throw new TypeError('Invalid protocol identifier.');
  return value;
}
export function safeError(error: unknown): string {
  return error instanceof Error ? error.message : 'Output operation failed.';
}
