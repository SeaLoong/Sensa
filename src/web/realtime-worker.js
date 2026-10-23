import { createRealtimeSession } from './realtime-session.js';
import { createSharedSessionBroker } from './shared-realtime.js';

// One worker identity is scoped to this exact origin and Sensa socket URL.
const scope = globalThis;
const url = new URL('/api/ws', scope.location.href);
url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
const broker = createSharedSessionBroker({ createSession: createRealtimeSession, url: url.href });
scope.onconnect = event => {
  for (const port of event.ports) broker.addPort(port);
};
