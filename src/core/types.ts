/** Protocol-neutral values and ports used by the shared signal engine. */
export type Axis = 'L0' | 'L1' | 'L2' | 'R0' | 'R1' | 'R2' | 'V0';
export type SignalValues = Partial<Record<Axis, number>>;
export type AxisValues = SignalValues;
export type InputMode = 'manual' | 'script' | 'external';
export type Awaitable<T> = T | PromiseLike<T>;

export interface SignalFrame {
  readonly values: Readonly<SignalValues>;
  readonly durationMs: number;
  readonly timeMs: number;
}
export interface FunscriptAction {
  readonly at: number;
  readonly pos: number;
}
export interface Script {
  readonly actions: readonly FunscriptAction[];
  readonly durationMs: number;
}
export type ParsedScript = Script;

export interface OutputTransport {
  readonly name?: string;
  readonly socket?: Pick<EventTarget, 'addEventListener'>;
  send(frame: SignalFrame): Awaitable<void>;
  stop(): Awaitable<void>;
  close(): Awaitable<void>;
  interrupt?(): void;
  subscribeDisconnect?(listener: () => void): void | (() => void);
}
export interface NamedOutputTransport extends OutputTransport {
  readonly name: string;
}
export interface OutputDetails {
  type?: string;
  axis?: string;
}
export interface OutputSummary extends OutputDetails {
  id: string;
  name: string;
  connected: boolean;
  error: string;
}
export interface EngineError {
  id: string;
  message: string;
}
/** Hosts exchange numeric timer tokens; native timer handles remain private. */
export interface EngineClock {
  now(): number;
  interval(callback: () => void, periodMs: number): number;
  clear(token: number): void;
}
export type Clock = EngineClock;
export interface EngineSnapshot {
  active: boolean;
  emergency: boolean;
  mode: InputMode;
  externalConnected: boolean;
  externalName: string;
  playing: boolean;
  loop: boolean;
  speed: number;
  positionMs: number;
  script: Script | null;
  scriptName: string;
  scriptAxis: Axis;
  values: Record<Axis, number>;
  axes: Axis[];
  outputs: OutputSummary[];
  errors: EngineError[];
  recordedActions: FunscriptAction[];
  recording: boolean;
}
