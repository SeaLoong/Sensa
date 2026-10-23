import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSharedSessionBroker, createPortRealtimeSession, createRealtimeSessionPool, REALTIME_LIMITS } from '../../src/web/shared-realtime.js';
import { createElectedRealtimeWorker } from '../../src/web/elected-realtime.js';
import { createBrowserRealtimeSession } from '../../src/web/realtime-session.js';
import { build } from 'esbuild';
import { Script } from 'node:vm';
import { fileURLToPath } from 'node:url';

const flush = async () => { for (let i = 0; i < 4; i++) await new Promise(resolve => setImmediate(resolve)); };
function clock() {
  let now = 0, next = 0;
  const jobs = new Map();
  return {
    jobs, now: () => now,
    setTimeout(fn, delay) { const id = ++next; jobs.set(id, { fn, at: now + delay }); return id; },
    clearTimeout(id) { jobs.delete(id); },
    advance(ms) {
      now += ms;
      for (const [id, task] of [...jobs]) if (task.at <= now && jobs.delete(id)) task.fn();
    },
  };
}
function pair() {
  const left = { onmessage: null, closed: false, start() {}, close() { this.closed = true; } };
  const right = { ...left };
  const send = (peer, data) => { const cloned = structuredClone(data); queueMicrotask(() => { if (!peer.closed) peer.onmessage?.({ data: cloned }); }); };
  left.postMessage = data => { if (left.closed) throw new Error('closed port'); send(right, data); };
  right.postMessage = data => { if (right.closed) throw new Error('closed port'); send(left, data); };
  return [left, right];
}
function wireRig({ autoConnect = false } = {}) {
  const peers = [], commands = [];
  function createSession() {
    const peer = { stopped: false, observers: null,
      start(observers) { this.observers = observers; observers.onStatus('connecting'); if (autoConnect) observers.onStatus('connected'); },
      stop() { this.stopped = true; },
      request(path, options) { return new Promise((resolve, reject) => commands.push({ path, options, resolve, reject, peer })); },
    };
    peers.push(peer); return peer;
  }
  return { createSession, peers, commands };
}
function portRig() {
  const timers = clock(), wire = wireRig();
  const broker = createSharedSessionBroker({ createSession: wire.createSession, url: 'ws://sensa/api/ws', timers, now: timers.now });
  const client = () => {
    const [page, worker] = pair(); broker.addPort(worker);
    const states = [], snapshots = [];
    const session = createPortRealtimeSession({ createWorker: () => ({ port: page }), timers });
    session.start({ onStatus: value => states.push(value), onSnapshot: (...value) => snapshots.push(value) });
    return { session, states, snapshots, page, worker };
  };
  return { timers, wire, broker, client };
}

test('many page ports share one wire while identical local IDs resolve only in their owning page', async t => {
  const r = portRig(), clients = Array.from({ length: 20 }, r.client);
  t.after(() => { for (const client of clients) client.session.stop(); r.broker.dispose(); });
  await flush(); assert.equal(r.wire.peers.length, 1); assert.equal(r.broker.clientCount, 20);
  r.wire.peers[0].observers.onStatus('connected'); await flush();
  const first = clients[0].session.request('/api/config');
  const second = clients[1].session.request('/api/input/active', { method: 'PUT', body: { active: true } });
  await flush(); assert.equal(r.wire.commands.length, 2);
  r.wire.commands[1].resolve({ owner: 1 }); r.wire.commands[0].resolve({ owner: 0 });
  assert.deepEqual(await first, { owner: 0 }); assert.deepEqual(await second, { owner: 1 });
  r.wire.peers[0].observers.onSnapshot({ value: 0.4 }, ['ready']); await flush();
  assert.equal(clients.filter(client => client.snapshots.length === 1).length, 20);
  const last = r.client(); clients.push(last); await flush();
  assert.deepEqual(last.snapshots, [[{ value: 0.4 }, ['ready']]], 'A new page receives the current snapshot');
  clients[0].session.stop(); await flush();
  assert.equal(r.wire.peers[0].stopped, false); assert.equal(r.broker.clientCount, 20);
});

test('detaching a page rejects its request and late replies never reach another page', async t => {
  const r = portRig(), a = r.client(), b = r.client();
  t.after(() => { a.session.stop(); b.session.stop(); r.broker.dispose(); });
  await flush(); r.wire.peers[0].observers.onStatus('connected'); await flush();
  const pending = a.session.request('/api/input/manual', { method: 'PUT', body: { L0: 25 } });
  const rejected = assert.rejects(pending, /closed|关闭/i); await flush();
  a.session.stop(); await rejected; await flush();
  r.wire.commands[0].resolve({ old: true }); await flush();
  const fresh = b.session.request('/api/state/overview'); await flush();
  r.wire.commands[1].resolve({ fresh: true }); assert.deepEqual(await fresh, { fresh: true });
  assert.equal(r.broker.pendingCount, 0); assert.equal(r.wire.peers[0].stopped, false);
});

test('cancel before a broker task starts leaves no unhandled rejection or outgoing write', async () => {
  const timers = clock(), wire = wireRig({ autoConnect: true }), messages = [];
  const broker = createSharedSessionBroker({ createSession: wire.createSession, url: 'ws://sensa/api/ws', timers });
  const port = { start() {}, close() {}, postMessage: message => messages.push(message) };
  broker.addPort(port);
  const receive = data => port.onmessage({ data });
  receive({ type: 'attach' });
  receive({ type: 'request', id: 'cancelled', path: '/api/input/active', method: 'PUT', body: { active: true } });
  receive({ type: 'detach' });
  await flush();
  assert.equal(wire.commands.length, 0); assert.equal(broker.pendingCount, 0);
  assert.equal(messages.filter(message => message.type === 'response').length, 0);
  broker.dispose(); assert.equal(timers.jobs.size, 0);
});

test('reconnect clears stale snapshots and rejects commands without replaying them', async t => {
  const r = portRig(), a = r.client();
  t.after(() => { a.session.stop(); r.broker.dispose(); });
  await flush(); const peer = r.wire.peers[0]; peer.observers.onStatus('connected'); await flush();
  const pending = a.session.request('/api/input/active', { method: 'PUT', body: { active: true } });
  const rejected = assert.rejects(pending, /disconnected|断开/i); await flush();
  peer.observers.onStatus('disconnected'); await rejected; await flush();
  peer.observers.onStatus('connecting'); peer.observers.onStatus('connected'); await flush();
  assert.equal(r.wire.commands.length, 1, 'Interrupted commands are not replayed');
  r.wire.commands[0].resolve({ late: true });
  const b = r.client(); await flush(); assert.deepEqual(b.snapshots, []); b.session.stop();
});

test('request bounds, cancel, malformed bodies and startup failure release resources', async t => {
  const r = portRig(), a = r.client();
  t.after(() => { a.session.stop(); r.broker.dispose(); });
  await flush(); r.wire.peers[0].observers.onStatus('connected'); await flush();
  await assert.rejects(a.session.request('/outside'), /API|命令/);
  await assert.rejects(a.session.request('/api/config', { body: '{' }), SyntaxError);
  await assert.rejects(a.session.request('/api/config', { method: 'TRACE' }), /method|方式/);
  await assert.rejects(a.session.request('/api/config', { body: 'x'.repeat(REALTIME_LIMITS.bytes + 1) }), SyntaxError);
  await assert.rejects(a.session.request('/api/config', { body: { text: 'x'.repeat(REALTIME_LIMITS.bytes) } }), /4 MiB/);
  const pending = a.session.request('/api/state/overview');
  const rejected = assert.rejects(pending, /timed out|超时/); await flush();
  r.timers.advance(15000); await rejected; await flush(); assert.equal(r.broker.pendingCount, 0);
  r.wire.commands[0].resolve({ late: true });
  const timers = clock(); let unavailable = 0;
  const silent = createPortRealtimeSession({ createWorker: () => ({ port: pair()[0] }), timers, onUnavailable: () => unavailable++ });
  silent.start(); timers.advance(5000); assert.equal(unavailable, 1); silent.stop();
  assert.equal(timers.jobs.size, 0);
});

test('concurrent tab reads coalesce only until a write establishes a new read generation', async t => {
  const r = portRig(), a = r.client(), b = r.client();
  t.after(() => { a.session.stop(); b.session.stop(); r.broker.dispose(); });
  await flush(); r.wire.peers[0].observers.onStatus('connected'); await flush();
  const one = a.session.request('/api/config'), two = b.session.request('/api/config');
  await flush(); assert.equal(r.wire.commands.length, 1);
  const write = a.session.request('/api/config', { method: 'PUT', body: { name: 'next' } });
  await flush();
  const afterWrite = b.session.request('/api/config'); await flush();
  assert.equal(r.wire.commands.length, 3);
  r.wire.commands[0].resolve({ name: 'before' }); r.wire.commands[1].resolve({ saved: true });
  r.wire.commands[2].resolve({ name: 'after' });
  assert.deepEqual(await one, { name: 'before' }); assert.deepEqual(await two, { name: 'before' });
  assert.deepEqual(await write, { saved: true }); assert.deepEqual(await afterWrite, { name: 'after' });
});

test('dead page leases reclaim the last connection and all broker timers', async () => {
  const timers = clock(), wire = wireRig(), broker = createSharedSessionBroker({ createSession: wire.createSession,
    url: 'ws://sensa/api/ws', timers, now: timers.now });
  const [page, port] = pair(); broker.addPort(port); page.postMessage({ type: 'attach' }); await flush();
  assert.equal(broker.clientCount, 1);
  timers.advance(120001); await flush();
  assert.equal(broker.clientCount, 0); assert.equal(wire.peers[0].stopped, true); assert.equal(timers.jobs.size, 0);
  broker.dispose();
});

test('an unresponsive shared process expires without retaining page requests or timers', async () => {
  const timers = clock(), [page, worker] = pair(); let fallback = 0;
  worker.onmessage = event => {
    if (event.data.type === 'attach') {
      worker.postMessage({ type: 'attached' }); worker.postMessage({ type: 'status', value: 'connected' });
    }
  };
  const session = createPortRealtimeSession({ timers, now: timers.now,
    createWorker: () => ({ port: page }), onUnavailable: () => fallback++ });
  session.start(); await flush(); await session.ready();
  const request = session.request('/api/config'), rejected = assert.rejects(request, /timed out|超时/);
  await flush(); timers.advance(15001); await rejected;
  timers.advance(65000); await flush(); assert.equal(fallback, 1);
  session.stop(); assert.equal(timers.jobs.size, 0);
});

test('errors from an old released port cannot tear down its replacement', async () => {
  const timers = clock(), workers = []; let fallback = 0;
  const session = createPortRealtimeSession({ timers, now: timers.now, onUnavailable: () => fallback++,
    createWorker() {
      const [page, remote] = pair(), worker = { port: page, remote };
      remote.onmessage = event => {
        if (event.data.type === 'attach') {
          remote.postMessage({ type: 'attached' }); remote.postMessage({ type: 'status', value: 'connected' });
        }
      };
      workers.push(worker); return worker;
    } });
  session.start(); await flush(); await session.ready();
  const previous = workers[0];
  previous.remote.postMessage({ type: 'released' }); await flush();
  timers.advance(1000); await flush(); await session.ready();
  assert.equal(workers.length, 2);
  previous.onerror(new Error('late error')); previous.port.onmessageerror();
  await session.ready(); assert.equal(fallback, 0);
  session.stop(); assert.equal(timers.jobs.size, 0);
});

test('browser sessions reject another origin, port or endpoint before constructing a transport', () => {
  const previous = globalThis.location;
  globalThis.location = { href: 'http://localhost:8900/' };
  try {
    assert.throws(() => createBrowserRealtimeSession({ url: 'ws://localhost:8901/api/ws' }), /Sensa/);
    assert.throws(() => createBrowserRealtimeSession({ url: 'ws://other.example/api/ws' }), /Sensa/);
    assert.throws(() => createBrowserRealtimeSession({ url: 'ws://localhost:8900/elsewhere' }), /Sensa/);
    const session = createBrowserRealtimeSession({ url: 'ws://localhost:8900/api/ws' });
    assert.equal(session.connectionSharing, 'page'); session.stop();
  } finally { if (previous === undefined) delete globalThis.location; else globalThis.location = previous; }
});

test('the shipped classic worker authenticates once and multiplexes ports without a DOM', async () => {
  const result = await build({ entryPoints: [fileURLToPath(new URL('../../src/web/realtime-worker.js', import.meta.url))],
    bundle: true, write: false, format: 'iife', target: ['chrome110', 'firefox115', 'safari16'] });
  const timers = clock(), sockets = [], authentication = [];
  class WebSocket {
    constructor(url) { this.url = url; this.readyState = 0; this.sent = []; sockets.push(this); }
    send(frame) { this.sent.push(JSON.parse(frame)); }
    close() { this.readyState = 3; this.onclose?.(); }
  }
  const scope = { location: { href: 'http://127.0.0.1:8900/realtime-worker.bundle.js' }, URL, WebSocket,
    TextEncoder, navigator: {}, setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout,
    fetch: async (...args) => { authentication.push(args); return { ok: true }; } };
  new Script(result.outputFiles[0].text).runInNewContext(scope);
  const pairs = Array.from({ length: 20 }, pair), messages = pairs.map(() => []);
  pairs.forEach(([page, worker], index) => {
    page.onmessage = event => messages[index].push(event.data);
    scope.onconnect({ ports: [worker] }); page.postMessage({ type: 'attach' });
  });
  await flush(); assert.equal(authentication.length, 1); assert.equal(sockets.length, 1);
  assert.equal(authentication[0][0], '/api/session'); assert.equal(authentication[0][1].credentials, 'same-origin');
  assert.equal(sockets[0].url, 'ws://127.0.0.1:8900/api/ws');
  sockets[0].readyState = 1; sockets[0].onopen(); await flush();
  assert.equal(messages.filter(frames => frames.some(frame => frame.type === 'status' && frame.value === 'connected')).length, 20);
  pairs[0][0].postMessage({ type: 'request', id: 'same-id', method: 'GET', path: '/api/config' });
  pairs[1][0].postMessage({ type: 'request', id: 'same-id', method: 'PUT', path: '/api/input/active', body: { active: false } });
  await flush(); assert.equal(sockets[0].sent.length, 2);
  const [one, two] = sockets[0].sent;
  assert.notEqual(one.id, two.id);
  sockets[0].onmessage({ data: JSON.stringify({ id: two.id, ok: true, data: { owner: 1 } }) });
  sockets[0].onmessage({ data: JSON.stringify({ id: one.id, ok: true, data: { owner: 0 } }) });
  await flush();
  assert.equal(messages[0].find(frame => frame.type === 'response').data.owner, 0);
  assert.equal(messages[1].find(frame => frame.type === 'response').data.owner, 1);
  for (const [page] of pairs) page.postMessage({ type: 'detach' });
  await flush(); assert.equal(sockets[0].readyState, 3); assert.equal(timers.jobs.size, 0);
});

test('same-page clients reference-count one session and one client cannot stop another', async () => {
  const wire = wireRig({ autoConnect: true }), pool = createRealtimeSessionPool({ createDirectSession: wire.createSession });
  const a = pool.create({ url: 'ws://sensa/api/ws' }), b = pool.create({ url: 'ws://sensa/api/ws' });
  const snapshots = []; a.start(); b.start({ onSnapshot: value => snapshots.push(value) });
  assert.equal(wire.peers.length, 1); assert.equal(a.connectionSharing, 'page');
  const pending = a.request('/api/config'), rejected = assert.rejects(pending, /closed|关闭/i);
  await flush(); a.stop(); await rejected; assert.equal(wire.peers[0].stopped, false);
  wire.peers[0].observers.onSnapshot({ update: 2 }); assert.deepEqual(snapshots, [{ update: 2 }]);
  wire.commands[0].resolve({ late: true }); b.stop(); assert.equal(wire.peers[0].stopped, true);
  a.start(); assert.equal(wire.peers.length, 2); a.stop();
});

test('fallback selection rejects an interrupted generation and keeps one page connection', async () => {
  const wire = wireRig({ autoConnect: true }); let shared, elected;
  const failed = setter => options => ({
    start(observers) { setter(() => { observers.onStatus('error'); options.onUnavailable(); }); observers.onStatus('connecting'); },
    stop() {}, ready() { return new Promise(() => {}); }, request() { return new Promise(() => {}); },
  });
  const pool = createRealtimeSessionPool({ createDirectSession: wire.createSession,
    createSharedSession: failed(fn => shared = fn), createElectedSession: failed(fn => elected = fn) });
  const a = pool.create({ url: 'ws://sensa/api/ws' }), b = pool.create({ url: 'ws://sensa/api/ws' });
  a.start(); b.start(); assert.equal(a.connectionSharing, 'shared-worker');
  const interrupted = a.request('/api/input/active', { method: 'PUT', body: { active: true } });
  const rejected = assert.rejects(interrupted, /disconnected|断开/);
  shared(); elected(); await rejected;
  assert.equal(a.connectionSharing, 'page'); assert.equal(wire.peers.length, 1); assert.equal(wire.commands.length, 0);
  a.stop(); assert.equal(wire.peers[0].stopped, false); b.stop();
});

function channelEnvironment() {
  const channels = new Map(), locks = new Map(); let serial = 0;
  class BroadcastChannel {
    constructor(name) { this.name = name; this.closed = false; if (!channels.has(name)) channels.set(name, new Set()); channels.get(name).add(this); }
    postMessage(message) {
      if (this.closed) throw new Error('closed channel');
      for (const peer of channels.get(this.name)) if (peer !== this) {
        const data = structuredClone(message); queueMicrotask(() => { if (!peer.closed) peer.onmessage?.({ data }); });
      }
    }
    close() { this.closed = true; channels.get(this.name).delete(this); }
  }
  const navigator = { locks: { request(name, { signal }, run) {
    if (!locks.has(name)) locks.set(name, { active: false, queued: [] });
    const state = locks.get(name);
    const pump = () => {
      if (state.active) return;
      const item = state.queued.shift(); if (!item) return;
      state.active = true; item.acquired = true;
      Promise.resolve().then(() => item.run({ name })).then(item.resolve, item.reject).finally(() => { state.active = false; pump(); });
    };
    return new Promise((resolve, reject) => {
      const item = { run, resolve, reject, acquired: false };
      const abort = () => {
        if (item.acquired) return;
        state.queued = state.queued.filter(value => value !== item);
        reject(new DOMException('aborted', 'AbortError'));
      };
      if (signal.aborted) { abort(); return; }
      signal.addEventListener('abort', abort, { once: true });
      state.queued.push(item); pump();
    });
  } } };
  return { BroadcastChannel, navigator, AbortController, crypto: { randomUUID: () => 'client-' + ++serial } };
}
test('Web Locks fallback shares one wire across pages and elects a successor without replay', async t => {
  const environment = channelEnvironment(), wire = wireRig({ autoConnect: true }), timers = clock();
  const observer = new environment.BroadcastChannel('sensa-realtime:ws://sensa/api/ws'), announcements = [];
  observer.onmessage = event => { if (event.data.type === 'leader') announcements.push(event.data); };
  const make = () => {
    const session = createPortRealtimeSession({ timers, createWorker: () => createElectedRealtimeWorker({
      url: 'ws://sensa/api/ws', createSession: wire.createSession, environment, timers, now: timers.now,
    }) });
    const states = []; session.start({ onStatus: state => states.push(state) }); return { session, states };
  };
  const a = make(), b = make(), c = make();
  t.after(() => { a.session.stop(); b.session.stop(); c.session.stop(); observer.close(); });
  await flush(); assert.equal(wire.peers.length, 1);
  await Promise.all([a.session.ready(), b.session.ready(), c.session.ready()]);
  const old = b.session.request('/api/input/manual', { method: 'PUT', body: { L0: 30 } });
  const rejected = assert.rejects(old, /disconnected|断开/); await flush();
  assert.equal(wire.commands.length, 1);
  a.session.stop(); await flush(); await rejected;
  assert.equal(wire.peers[0].stopped, true); assert.equal(wire.peers.length, 2);
  assert.equal(wire.commands.length, 1, 'Successor never replays the previous write');
  await b.session.ready(); await c.session.ready();
  observer.postMessage(announcements[0]); await flush();
  assert.equal(b.states.at(-1), 'connected'); assert.equal(c.states.at(-1), 'connected',
    'A queued predecessor announcement cannot redirect the successor or its followers');
  const fresh = c.session.request('/api/state/overview'); await flush();
  wire.commands[1].resolve({ current: true }); assert.deepEqual(await fresh, { current: true });
  wire.commands[0].resolve({ stale: true }); await flush();
  b.session.stop(); await flush();
  await c.session.ready(); assert.equal(wire.peers.length, 3);
  c.session.stop(); await flush(); assert.equal(timers.jobs.size, 0);
});

test('different Sensa URLs keep separate elected leaders and commands', async t => {
  const environment = channelEnvironment(), wire = wireRig({ autoConnect: true }), timers = clock();
  const sessions = [8900, 8901].map(port => createPortRealtimeSession({ timers, createWorker: () => createElectedRealtimeWorker({
    url: 'ws://localhost:' + port + '/api/ws', createSession: wire.createSession, environment, timers, now: timers.now,
  }) }));
  t.after(() => sessions.forEach(session => session.stop()));
  for (const session of sessions) session.start(); await flush();
  assert.equal(wire.peers.length, 2); await Promise.all(sessions.map(session => session.ready()));
});
