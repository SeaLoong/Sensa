import { createSharedSessionBroker, REALTIME_LIMITS } from './shared-realtime.js';

// Web Locks owns leader exclusivity. BroadcastChannel only transports messages.
// Web Locks 负责唯一领导者；BroadcastChannel 只传递消息，不参与伪锁选举。
export function createElectedRealtimeWorker({ url, createSession, environment = globalThis,
  timers = globalThis, now = () => Date.now(), announceMs = 15000 } = {}) {
  const identity = environment.crypto.randomUUID();
  const key = 'sensa-realtime:' + url;
  const channel = new environment.BroadcastChannel(key);
  const abort = new environment.AbortController();
  let stopped = false, leader = null, epoch = null, ownEpoch = null, broker = null;
  let term = 0, ownTerm = 0;
  let attach = null, announced = null, release = null;
  const ports = new Map(), retiredEpochs = new Set();
  const worker = { onerror: null, dispose };
  const port = {
    onmessage: null,
    onmessageerror: null,
    start() {},
    postMessage(message) {
      if (stopped) throw new Error('Shared page session closed / 共享页面会话已关闭');
      if (message.type === 'attach') attach = message;
      if (leader && epoch) route({ type: 'client', sender: identity, to: leader, epoch, message });
      else if (message.type !== 'attach' && message.type !== 'heartbeat')
        throw new Error('Waiting for the shared connection / 正在等待共享连接');
    },
    close: dispose,
  };
  worker.port = port;
  function post(message) { if (!stopped) channel.postMessage(message); }
  function deliver(message) { if (!stopped) port.onmessage?.({ data: message }); }
  function announce() {
    if (stopped || !broker) return;
    const message = { type: 'leader', sender: identity, epoch: ownEpoch, term: ownTerm };
    post(message); acceptLeader(message);
    announced = timers.setTimeout(announce, announceMs);
  }
  function acceptLeader(message) {
    if (typeof message.epoch !== 'string' || !message.epoch || !message.sender ||
      !Number.isSafeInteger(message.term) || message.term < 1 || message.term < term || retiredEpochs.has(message.epoch)) return;
    // Only the lock holder may lead. Its queued predecessor announcements can arrive later.
    // 锁持有者只接受自己的任期；其他页面也忽略已结束任期的延迟公告。
    if (broker && (message.sender !== identity || message.epoch !== ownEpoch)) return;
    const previous = epoch;
    if (previous && previous !== message.epoch) retire(previous);
    term = message.term;
    leader = message.sender; epoch = message.epoch;
    if (previous && previous !== epoch) deliver({ type: 'reset' });
    else if (!previous && attach) route({ type: 'client', sender: identity, to: leader, epoch, message: attach });
  }
  function retire(value) {
    retiredEpochs.add(value);
    if (retiredEpochs.size > 256) retiredEpochs.delete(retiredEpochs.values().next().value);
  }
  function virtualPort(id) {
    let peer = ports.get(id);
    if (peer) return peer;
    peer = {
      onmessage: null,
      start() {},
      postMessage(message) {
        if (!broker || !ownEpoch) return;
        const envelope = { type: 'server', sender: identity, to: id, epoch: ownEpoch, message };
        if (id === identity) deliver(message); else post(envelope);
      },
      close() { ports.delete(id); },
    };
    ports.set(id, peer); broker.addPort(peer); return peer;
  }
  function route(message) {
    if (message.to === identity && broker && message.epoch === ownEpoch) {
      let peer = ports.get(message.sender);
      if (!peer && message.message?.type === 'attach') {
        if (ports.size >= REALTIME_LIMITS.clients) {
          post({ type: 'server', sender: identity, to: message.sender, epoch: ownEpoch,
            message: { type: 'unavailable', error: 'Shared session is full / 共享会话已满' } });
          return;
        }
        peer = virtualPort(message.sender);
      }
      peer?.onmessage?.({ data: message.message });
    } else post(message);
  }
  channel.onmessage = event => {
    if (stopped) return;
    const message = event.data;
    if (!message || typeof message !== 'object' || typeof message.sender !== 'string') return;
    if (message.type === 'hello' && broker) { post({ type: 'leader', sender: identity, epoch: ownEpoch, term: ownTerm }); return; }
    if (message.type === 'leader') { acceptLeader(message); return; }
    if (message.type === 'depart' && message.sender === leader && message.epoch === epoch) {
      retire(epoch); leader = epoch = null; deliver({ type: 'reset' }); return;
    }
    if (message.type === 'client' && message.to === identity && broker && message.epoch === ownEpoch) { route(message); return; }
    if (message.type === 'server' && message.to === identity && message.sender === leader && message.epoch === epoch)
      deliver(message.message);
  };
  channel.onmessageerror = () => worker.onerror?.(new Error('Shared message rejected / 共享消息无法读取'));
  function dispose() {
    if (stopped) return;
    if (broker) post({ type: 'depart', sender: identity, epoch: ownEpoch });
    stopped = true;
    timers.clearTimeout(announced); announced = null;
    broker?.dispose(); broker = null; ports.clear();
    abort.abort(); release?.(); release = null;
    channel.close();
  }
  // Lock release follows complete broker teardown, including its WebSocket.
  // 先完整关闭 broker 与 WebSocket，再释放领导锁。
  Promise.resolve().then(() => environment.navigator.locks.request(key, { signal: abort.signal }, async () => {
    if (stopped) return;
    ownEpoch = environment.crypto.randomUUID();
    ownTerm = ++term;
    broker = createSharedSessionBroker({ createSession, url, timers, now });
    announce();
    await new Promise(resolve => { release = resolve; if (stopped) resolve(); });
  })).catch(error => { if (!stopped && error?.name !== 'AbortError') worker.onerror?.(error); });
  post({ type: 'hello', sender: identity });
  return worker;
}
