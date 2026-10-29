import { AXES } from '../core/index.js';

export function createExplorerInput({ opener, origin, session, receive, stop, now = Date.now }) {
  if (!opener || !/^https?:\/\//.test(origin) || !/^[\w-]{16,128}$/.test(session)) return null;
  let lastSequence = -1, enabled = false;
  return {
    connect() { enabled = true; opener.postMessage({ type: 'sensa.signal.ready.v1', session }, origin); },
    handle(event) {
      const message = event.data;
      if (!enabled || event.source !== opener || event.origin !== origin || !message || message.session !== session
        || !Number.isSafeInteger(message.sequence) || message.sequence <= lastSequence
        || !Number.isFinite(message.timestamp) || Math.abs(now() - message.timestamp) > 5000) return false;
      if (message.type === 'sensa.signal.stop.v1') { lastSequence = message.sequence; void stop(); return true; }
      if (message.type !== 'sensa.signal.v1' || !message.axes || typeof message.axes !== 'object' || Array.isArray(message.axes)) return false;
      const entries = Object.entries(message.axes);
      if (!entries.length || entries.length > AXES.length || entries.some(([axis, value]) => !AXES.includes(axis)
        || typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1)) return false;
      lastSequence = message.sequence; receive(Object.fromEntries(entries)); return true;
    },
    disconnect() { enabled = false; void stop(); },
  };
}
