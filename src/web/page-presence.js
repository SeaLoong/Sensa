// A page heartbeat is independent of the shared backend connection: a worker
// may briefly outlive its last tab, and a restored page gets its own lease.
export function pagePresenceId(source = globalThis.crypto) {
  // Ordinary HTTP LAN pages may lack randomUUID. This identifies a short-lived
  // page lease, not a credential, so a timestamp/random suffix also works.
  return source?.randomUUID?.() ?? `page-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function attachPagePresence({
  fetch: request = globalThis.fetch,
  window: target = globalThis.window,
  navigator: browser = globalThis.navigator,
  id = pagePresenceId(),
  setTimeout: schedule = globalThis.setTimeout,
  clearTimeout: cancel = globalThis.clearTimeout,
} = {}) {
  let stopped = false, suspended = false, timer, generation = 0, revision = 0;
  const body = open => JSON.stringify({ id, open, revision: ++revision });
  const update = async () => {
    const current = generation;
    try {
      await request('/api/session', { credentials: 'same-origin' });
      if (!stopped && !suspended && current === generation)
        await request('/api/ui/presence', { method: 'POST', credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' }, body: body(true) });
    } catch { /* Normal realtime status already exposes a disconnected service. */ }
    if (!stopped && !suspended && current === generation) timer = schedule(update, 5000);
  };
  const release = () => {
    generation++; cancel(timer);
    try {
      const sent = browser?.sendBeacon?.('/api/ui/presence', new Blob([body(false)], { type: 'application/json' }));
      if (!sent) void request('/api/ui/presence', { method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' }, body: body(false), keepalive: true }).catch(() => {});
    } catch { /* The short server-side lease also expires after a process crash. */ }
  };
  const hide = () => { if (!suspended) { suspended = true; release(); } };
  const show = () => { if (suspended && !stopped) { suspended = false; void update(); } };
  target.addEventListener('pagehide', hide);
  target.addEventListener('pageshow', show);
  void update();
  return () => {
    if (stopped) return;
    stopped = true;
    release();
    target.removeEventListener('pagehide', hide);
    target.removeEventListener('pageshow', show);
  };
}
