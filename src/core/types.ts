import type { MotionAxis } from './runtime/model.ts';

/** Protocol-neutral transport values; all hosts share the runtime's axis set. */
export type Axis = MotionAxis;
export type SignalValues = Partial<Record<Axis, number>>;
export type AxisValues = SignalValues;
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
