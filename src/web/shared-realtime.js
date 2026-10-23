// One command stream can serve several page clients without sharing their request IDs.
// 多个页面共用命令连接，各页面的请求、取消和生命周期分别管理。
export const REALTIME_LIMITS = Object.freeze({ clients: 64, pending: 512, wire: 128, perClient: 32, bytes: 4 * 1024 * 1024 });
const disconnected = () => new Error('Realtime connection disconnected / 实时连接已断开');
const closed = () => new Error('Realtime connection closed / 实时连接已关闭');
const encodeSize = value => new globalThis.TextEncoder().encode(JSON.stringify(value)).byteLength;
const validId = id => typeof id === 'string' && /^[A-Za-z0-9:_-]{1,100}$/.test(id);

function requestFrame(path, options = {}) {
  if (typeof path !== 'string' || !path.startsWith('/api/') || path.length > 2048)
    throw new Error('Choose an API command / 请选择有效的服务命令');
  const method = options.method || 'GET';
  if (!['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) throw new Error('Unsupported request method / 不支持此请求方式');
  const body = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
  const frame = { path, method, ...(body === undefined ? {} : { body }) };
  if (encodeSize(frame) > REALTIME_LIMITS.bytes) throw new Error('Request exceeds 4 MiB / 请求超过 4 MiB');
  return frame;
}

/** A message-port broker; the same core runs inside SharedWorker and a Web Locks leader. */
export function createSharedSessionBroker({ createSession, url, timers = globalThis,
  now = () => Date.now(), leaseMs = 120000, sweepMs = 20000 } = {}) {
  const clients = new Map();
  const reads = new Map();
  let session = null, status = 'disconnected', latest = null, sweep = null, disposed = false, sequence = 0, pending = 0;
  let readGeneration = 0;
  const send = (port, message) => { try { port.postMessage(message); return true; } catch { return false; } };
  const broadcast = message => { for (const port of clients.keys()) send(port, message); };
  function stopEmpty() {
    if (clients.size) return;
    timers.clearTimeout(sweep); sweep = null;
    session?.stop(); session = null; status = 'disconnected'; latest = null;
    reads.clear(); readGeneration++;
  }
  function detach(port, notify = false) {
    const client = clients.get(port);
    if (!client) return;
    clients.delete(port);
    for (const token of client.pending.values()) { token.active = false; pending--; }
    client.pending.clear();
    if (notify) send(port, { type: 'released' });
    try { port.close?.(); } catch { /* The page may already have closed. */ }
    stopEmpty();
  }
  function scheduleSweep() {
    if (sweep || !clients.size || disposed) return;
    sweep = timers.setTimeout(() => {
      sweep = null;
      for (const [port, client] of clients) if (now() - client.seen > leaseMs) detach(port, true);
      scheduleSweep();
    }, sweepMs);
  }
  function startSession() {
    if (session) return;
    session = createSession({ url });
    session.start({
      onStatus(value) {
        status = value;
        if (value !== 'connected') { latest = null; reads.clear(); readGeneration++; }
        broadcast({ type: 'status', value });
      },
      onSnapshot(data, logs) {
        latest = { type: 'snapshot', data, logs };
        broadcast(latest);
      },
    });
  }
  function attach(port) {
    if (clients.has(port)) { clients.get(port).seen = now(); send(port, { type: 'attached' }); send(port, { type: 'status', value: status }); return; }
    if (clients.size >= REALTIME_LIMITS.clients) { send(port, { type: 'unavailable', error: 'Shared session is full / 共享会话已满' }); return; }
    clients.set(port, { id: ++sequence, seen: now(), pending: new Map() });
    send(port, { type: 'attached' });
    if (session) {
      send(port, { type: 'status', value: status });
      if (status === 'connected' && latest) send(port, latest);
    } else startSession();
    scheduleSweep();
  }
  function receive(port, message) {
    if (disposed || !message || typeof message !== 'object') return;
    if (message.type === 'attach') { attach(port); return; }
    const client = clients.get(port);
    if (!client) return;
    client.seen = now();
    if (message.type === 'detach') { detach(port); return; }
    if (message.type === 'heartbeat') { send(port, { type: 'alive' }); return; }
    if (message.type === 'cancel') {
      const token = client.pending.get(message.id);
      if (token) { token.active = false; client.pending.delete(message.id); pending--; }
      return;
    }
    if (message.type !== 'request' || !validId(message.id)) return;
    const respond = (ok, data) => send(port, { type: 'response', id: message.id, ok, ...(ok ? { data } : { error: data }) });
    if (client.pending.has(message.id)) { respond(false, 'Request ID is already pending / 请求标识正在使用'); return; }
    if (pending >= REALTIME_LIMITS.pending || client.pending.size >= REALTIME_LIMITS.perClient) {
      respond(false, 'Too many pending commands / 等待处理的命令过多'); return;
    }
    let frame;
    try { frame = requestFrame(message.path, message); } catch (error) { respond(false, error.message); return; }
    if (status !== 'connected') { respond(false, disconnected().message); return; }
    const token = { active: true }; client.pending.set(message.id, token); pending++;
    // The transport owns wire IDs. IDs reused by another tab never address this response.
    const currentSession = session;
    const readKey = frame.method === 'GET' ? readGeneration + '|' + JSON.stringify(frame) : null;
    if (frame.method !== 'GET') readGeneration++;
    let task = readKey && reads.get(readKey);
    if (!task) {
      task = Promise.resolve().then(() => {
        if (session !== currentSession || status !== 'connected') throw disconnected();
        if (frame.method !== 'GET' && (!token.active || clients.get(port) !== client)) throw closed();
        return currentSession.request(frame.path, frame);
      });
      if (readKey) {
        reads.set(readKey, task);
        task.then(() => { if (reads.get(readKey) === task) reads.delete(readKey); },
          () => { if (reads.get(readKey) === task) reads.delete(readKey); });
      }
    }
    task.then(data => {
      if (token.active && clients.get(port) === client) respond(true, data);
    }, error => {
      if (token.active && clients.get(port) === client) respond(false, error?.message || disconnected().message);
    }).finally(() => {
      if (client.pending.get(message.id) === token) { client.pending.delete(message.id); pending--; }
      token.active = false;
    });
  }
  return {
    addPort(port) {
      if (disposed) return;
      port.onmessage = event => receive(port, event.data);
      port.onmessageerror = () => detach(port);
      port.start?.();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const port of [...clients.keys()]) detach(port, true);
      stopEmpty();
    },
    get clientCount() { return clients.size; },
    get pendingCount() { return pending; },
  };
}

/** Page-side transport for either a real worker port or the elected-tab adapter. */
export function createPortRealtimeSession({ createWorker, timers = globalThis, timeoutMs = 15000,
  startupMs = 5000, heartbeatMs = 20000, now = () => Date.now(), onUnavailable = () => {} } = {}) {
  let running = false, generation = 0, connectionGeneration = 0, worker = null, port = null, sequence = 0, status = 'disconnected';
  let heartbeat = null, startup = null, retry = null, observers = {};
  let lastMessage = 0;
  const pending = new Map(), waiters = new Set();
  const emit = value => { status = value; observers.onStatus?.(value); };
  const fail = error => {
    for (const group of [pending, waiters]) {
      for (const item of group.values()) { timers.clearTimeout(item.timer); item.reject(error); }
      group.clear();
    }
  };
  function closePort() {
    timers.clearTimeout(heartbeat); timers.clearTimeout(startup); heartbeat = startup = null;
    try { port?.postMessage({ type: 'detach' }); } catch { /* Failed workers cannot receive detach. */ }
    try { port?.close?.(); } catch { /* Already closed. */ }
    try { worker?.dispose?.(); } catch { /* Elected-tab teardown. */ }
    port = worker = null;
  }
  function unavailable() {
    if (!running) return;
    running = false; generation++; closePort(); fail(disconnected()); emit('error'); onUnavailable();
  }
  function connect() {
    const attempt = ++generation;
    connectionGeneration++;
    lastMessage = now();
    emit('connecting');
    try {
      worker = createWorker(); port = worker.port;
      const current = () => running && generation === attempt;
      worker.onerror = () => { if (current()) unavailable(); };
      const beat = () => {
        if (!current()) return;
        if (now() - lastMessage > heartbeatMs * 3) { unavailable(); return; }
        try { port.postMessage({ type: 'heartbeat' }); } catch { unavailable(); return; }
        heartbeat = timers.setTimeout(beat, heartbeatMs);
      };
      port.onmessage = event => {
        if (!current()) return;
        const message = event.data;
        if (!message || typeof message !== 'object') return;
        lastMessage = now();
        if (message.type === 'attached') { timers.clearTimeout(startup); startup = null; return; }
        if (message.type === 'unavailable') { unavailable(); return; }
        if (message.type === 'reset') {
          connectionGeneration++;
          fail(disconnected()); emit('disconnected'); emit('connecting');
          port.postMessage({ type: 'attach' }); return;
        }
        if (message.type === 'released') {
          connectionGeneration++;
          fail(disconnected()); emit('disconnected'); generation++; closePort();
          retry = timers.setTimeout(() => { retry = null; if (running) connect(); }, 1000); return;
        }
        if (message.type === 'status') {
          emit(message.value);
          if (message.value === 'connected') {
            for (const item of waiters) { timers.clearTimeout(item.timer); item.resolve(); }
            waiters.clear();
          } else if (message.value === 'disconnected' || message.value === 'error') { connectionGeneration++; fail(disconnected()); }
          return;
        }
        if (message.type === 'snapshot') { observers.onSnapshot?.(message.data, message.logs); return; }
        if (message.type !== 'response') return;
        const item = pending.get(message.id);
        if (!item) return;
        pending.delete(message.id); timers.clearTimeout(item.timer);
        if (message.ok === false) item.reject(new Error(message.error || disconnected().message));
        else item.resolve(message.data);
      };
      port.onmessageerror = () => { if (current()) unavailable(); };
      port.start?.();
      startup = timers.setTimeout(unavailable, startupMs);
      port.postMessage({ type: 'attach' });
      if (current()) heartbeat = timers.setTimeout(beat, heartbeatMs);
    } catch { unavailable(); }
  }
  function ready() {
    if (!running) return Promise.reject(closed());
    if (status === 'connected') return Promise.resolve();
    if (waiters.size >= REALTIME_LIMITS.perClient) return Promise.reject(new Error('Too many pending commands / 等待处理的命令过多'));
    return new Promise((resolve, reject) => {
      const item = { resolve, reject };
      item.timer = timers.setTimeout(() => { waiters.delete(item); reject(new Error('Realtime connection not ready / 实时连接未就绪')); }, timeoutMs);
      waiters.add(item);
    });
  }
  return {
    start(next = {}) { observers = next; if (!running) { running = true; connect(); } },
    stop() { running = false; generation++; timers.clearTimeout(retry); retry = null; closePort(); fail(closed()); status = 'disconnected'; },
    ready,
    async request(path, options = {}) {
      const frame = requestFrame(path, options), attempt = generation, connection = connectionGeneration;
      await ready();
      if (!running || generation !== attempt || connectionGeneration !== connection || status !== 'connected') throw disconnected();
      if (pending.size >= REALTIME_LIMITS.perClient) throw new Error('Too many pending commands / 等待处理的命令过多');
      const id = String(++sequence);
      return new Promise((resolve, reject) => {
        const item = { resolve, reject };
        item.timer = timers.setTimeout(() => {
          pending.delete(id);
          try { port?.postMessage({ type: 'cancel', id }); } catch { /* Lost transport. */ }
          reject(new Error('Request timed out / 请求超时'));
        }, timeoutMs);
        pending.set(id, item);
        try { port.postMessage({ type: 'request', id, ...frame }); }
        catch (error) { pending.delete(id); timers.clearTimeout(item.timer); reject(error); }
      });
    },
  };
}

/** Reference-counted page singleton; transport selection is independent of UI components. */
export function createRealtimeSessionPool({ createDirectSession, createSharedSession = null,
  createElectedSession = null } = {}) {
  const entries = new Map();
  return {
    create(options = {}) {
      const key = String(options.url) + '|' + String(options.workerUrl || '');
      let entry = entries.get(key);
      if (!entry) {
        entry = { clients: new Set(), transport: null, status: 'disconnected', latest: null, generation: 0, sharing: 'page' };
        entries.set(key, entry);
      }
      const client = { active: false, observers: {}, pending: new Set() };
      function select(index = 0) {
        const attempt = ++entry.generation;
        const choices = [createSharedSession, createElectedSession, createDirectSession];
        while (!choices[index] && index < 2) index++;
        entry.sharing = ['shared-worker', 'web-locks', 'page'][index];
        const onUnavailable = () => {
          if (entry.generation !== attempt || !entry.clients.size) return;
          entry.generation++; entry.transport?.stop();
          select(Math.min(index + 1, 2));
        };
        entry.transport = choices[index]({ ...options, onUnavailable });
        entry.transport.start({
          onStatus(value) {
            if (entry.generation !== attempt) return;
            entry.status = value;
            if (value !== 'connected') entry.latest = null;
            for (const user of entry.clients) user.observers.onStatus?.(value);
          },
          onSnapshot(...args) {
            if (entry.generation !== attempt) return;
            entry.latest = args;
            for (const user of entry.clients) user.observers.onSnapshot?.(...args);
          },
        });
      }
      function owned(invoke) {
        if (!client.active) return Promise.reject(closed());
        if (client.pending.size >= REALTIME_LIMITS.perClient) return Promise.reject(new Error('Too many pending commands / 等待处理的命令过多'));
        const transport = entry.transport, generation = entry.generation;
        return new Promise((resolve, reject) => {
          const token = { reject }; client.pending.add(token);
          Promise.resolve().then(() => {
            if (!client.active) throw closed();
            if (entry.transport !== transport || entry.generation !== generation) throw disconnected();
            return invoke(transport);
          }).then(value => {
            if (client.pending.delete(token)) resolve(value);
          }, error => { if (client.pending.delete(token)) reject(error); });
        });
      }
      return {
        get connectionSharing() { return entry.sharing; },
        start(observers = {}) {
          client.observers = observers;
          if (client.active) return;
          client.active = true; entry.clients.add(client);
          if (!entry.transport) select();
          else {
            observers.onStatus?.(entry.status);
            if (entry.status === 'connected' && entry.latest) observers.onSnapshot?.(...entry.latest);
          }
        },
        stop() {
          if (!client.active) return;
          client.active = false; entry.clients.delete(client);
          for (const token of client.pending) token.reject(closed());
          client.pending.clear(); client.observers = {};
          if (!entry.clients.size) {
            entry.generation++; entry.transport?.stop(); entry.transport = null;
            entry.status = 'disconnected'; entry.latest = null;
          }
        },
        ready() { return owned(transport => transport.ready()); },
        request(path, options) { return owned(transport => transport.request(path, options)); },
      };
    },
  };
}
