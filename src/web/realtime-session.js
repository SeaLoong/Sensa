import { t } from './i18n.js';

// Initial reads are one attempt per connection until a complete snapshot applies.
// 初始读取按连接代次执行，完整应用一次后不再覆盖用户草稿。
export function createInitialSnapshotLoader(session, observers = {}) {
  let disposed = false, loaded = false, generation = 0, pending = null;
  return {
    connection(status) {
      if (disposed || loaded) return Promise.resolve();
      if (status !== 'connected') { generation++; pending = null; return Promise.resolve(); }
      if (pending) return pending;
      const attempt = ++generation;
      const current = () => !disposed && generation === attempt;
      observers.onLoading?.(true);
      pending = (async () => {
        try {
          const [config, overview, logs, serialPorts] = await Promise.all([
            session.request('/api/config'), session.request('/api/state/overview'),
            session.request('/api/state/logs'), session.request('/api/meta/serial-ports'),
          ]);
          if (!current()) return;
          observers.onLoad?.({ config, overview, logs, serialPorts });
          loaded = true;
        } catch (error) { if (current()) observers.onError?.(error); }
        finally { if (current()) { pending = null; observers.onLoading?.(false); } }
      })();
      return pending;
    },
    dispose() { disposed = true; generation++; pending = null; },
  };
}

// Keep one session attached across page-cache suspension and restoration.
// 页面进入缓存时暂停会话，恢复时重连；最终清理后不再响应页面事件。
export function attachPageLifecycle(session, page, observers = {}) {
  let attached = true;
  const start = () => { if (attached) session.start(observers); };
  const stop = () => { observers.onStatus?.('disconnected'); session.stop(); };
  page.addEventListener('pagehide', stop);
  page.addEventListener('pageshow', start);
  start();
  return () => {
    if (!attached) return;
    attached = false;
    page.removeEventListener('pagehide', stop);
    page.removeEventListener('pageshow', start);
    session.stop();
  };
}

// The session owns authentication, reconnects and command correlation.
// 会话统一管理鉴权、重连和命令关联；断线命令永不重放。
export function createRealtimeSession({
  url,
  authenticate = async () => {
    const response = await fetch('/api/session', { credentials: 'same-origin' });
    if (!response.ok) throw new Error('Session rejected / 会话被拒绝');
  },
  createSocket = address => new WebSocket(address),
  timers = globalThis,
  timeoutMs = 15000,
} = {}) {
  let running = false, generation = 0, sequence = 0, socket = null, retry = null;
  let observers = {};
  const waiting = new Set(), pending = new Map();
  const status = value => observers.onStatus?.(value);
  const fail = reason => {
    for (const collection of [waiting, pending]) {
      for (const item of collection.values()) { timers.clearTimeout(item.timer); item.reject(reason); }
      collection.clear();
    }
  };
  const release = () => {
    for (const item of waiting) { timers.clearTimeout(item.timer); item.resolve(socket); }
    waiting.clear();
  };
  const schedule = delay => {
    if (running) retry = timers.setTimeout(connect, delay);
  };
  async function connect() {
    const attempt = ++generation;
    status('connecting');
    let peer;
    try {
      await authenticate();
      if (!running || generation !== attempt) return;
      peer = createSocket(url);
    } catch {
      if (running && generation === attempt) { status('error'); schedule(3000); }
      return;
    }
    socket = peer;
    const current = () => running && generation === attempt && socket === peer;
    peer.onopen = () => { if (current()) { status('connected'); release(); } };
    peer.onmessage = event => {
      if (!current()) return;
      let message;
      try { message = JSON.parse(event.data); } catch { return; }
      if (message?.type === 'state') { observers.onSnapshot?.(message.data || null, message.logs); return; }
      const id = String(message?.id || ''), command = pending.get(id);
      if (!command) return;
      pending.delete(id); timers.clearTimeout(command.timer);
      if (message.ok === false) command.reject(new Error(message.data?.error || message.error || t("请求失败")));
      else command.resolve(message.data);
    };
    peer.onerror = () => { if (current()) status('error'); };
    peer.onclose = () => {
      if (!current()) return;
      socket = null;
      fail(new Error(t("实时连接已断开")));
      status('disconnected');
      schedule(1500);
    };
  }
  function ready() {
    if (socket?.readyState === 1) return Promise.resolve(socket);
    if (!running) return Promise.reject(new Error(t("实时连接已关闭")));
    return new Promise((resolve, reject) => {
      const item = { resolve, reject };
      item.timer = timers.setTimeout(() => {
        waiting.delete(item); reject(new Error(t("实时连接未就绪，请稍后重试。")));
      }, timeoutMs);
      waiting.add(item);
    });
  }
  return {
    start(nextObservers = {}) {
      observers = nextObservers;
      if (running) return;
      running = true;
      void connect();
    },
    stop() {
      running = false; generation++;
      timers.clearTimeout(retry); retry = null;
      const previous = socket; socket = null;
      fail(new Error(t("实时连接已关闭")));
      if (previous && previous.readyState < 2) {
        try { previous.close(1000, 'Page closed / 页面关闭'); } catch { /* Closed peer / 连接已关闭。 */ }
      }
    },
    ready,
    async request(path, options = {}) {
      const body = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
      const peer = await ready();
      if (!running || socket !== peer || peer.readyState !== 1) throw new Error(t("实时连接已断开"));
      const id = String(++sequence);
      const message = { id, method: options.method || 'GET', path, ...(body === undefined ? {} : { body }) };
      return new Promise((resolve, reject) => {
        const command = { resolve, reject };
        command.timer = timers.setTimeout(() => {
          pending.delete(id); reject(new Error(t("请求超时：{0}", [path])));
        }, timeoutMs);
        pending.set(id, command);
        try { peer.send(JSON.stringify(message)); }
        catch (error) { pending.delete(id); timers.clearTimeout(command.timer); reject(error instanceof Error ? error : new Error(t("发送请求失败。"))); }
      });
    },
  };
}
