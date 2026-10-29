import { AXES, isAxis } from '../core/index.ts';
import type { SignalValues } from '../core/index.ts';

interface ExplorerPeer {
  postMessage(message: unknown, targetOrigin: string): void;
}
export interface ExplorerMessageEvent {
  readonly source: unknown;
  readonly origin: string;
  readonly data: unknown;
}
export interface ExplorerInputOptions {
  opener: unknown;
  origin: string;
  session: string;
  receive(values: SignalValues): void;
  stop(): unknown;
  now?: () => number;
}
export interface ExplorerInput {
  connect(): void;
  handle(event: ExplorerMessageEvent): boolean;
  disconnect(): void;
}
function isPeer(value: unknown): value is ExplorerPeer {
  return typeof value === 'object' && value !== null && 'postMessage' in value && typeof value.postMessage === 'function';
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export function createExplorerInput({ opener, origin, session, receive, stop, now = Date.now }: ExplorerInputOptions): ExplorerInput | null {
  if (!isPeer(opener) || !/^https?:\/\//.test(origin) || !/^[\w-]{16,128}$/.test(session)) return null;
  let lastSequence = -1, enabled = false;
  return {
    connect() { enabled = true; opener.postMessage({ type: 'sensa.signal.ready.v1', session }, origin); },
    handle(event) {
      const message = event.data;
      if (!enabled || event.source !== opener || event.origin !== origin || !isRecord(message) || message.session !== session
        || typeof message.sequence !== 'number' || !Number.isSafeInteger(message.sequence) || message.sequence <= lastSequence
        || typeof message.timestamp !== 'number' || !Number.isFinite(message.timestamp) || Math.abs(now() - message.timestamp) > 5000) return false;
      if (message.type === 'sensa.signal.stop.v1') { lastSequence = message.sequence; void stop(); return true; }
      if (message.type !== 'sensa.signal.v1' || !isRecord(message.axes)) return false;
      const entries = Object.entries(message.axes), values: SignalValues = {};
      if (!entries.length || entries.length > AXES.length) return false;
      for (const [axis, value] of entries) {
        if (!isAxis(axis) || typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) return false;
        values[axis] = value;
      }
      lastSequence = message.sequence; receive(values); return true;
    },
    disconnect() { enabled = false; void stop(); },
  };
}
