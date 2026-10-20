import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attachPageLifecycle, createInitialSnapshotLoader, createRealtimeSession } from '../../src/web/realtime-session.js';

const flush = () => new Promise(resolve => setImmediate(resolve));

function initialRig() {
  const requests = [], applied = [], errors = [], loading = [];
  const session = { request(path) { return new Promise((resolve, reject) => requests.push({ path, resolve, reject })); } };
  const loader = createInitialSnapshotLoader(session, {
    onLoad: snapshot => applied.push(snapshot), onError: error => errors.push(error.message), onLoading: value => loading.push(value),
  });
  return { loader, requests, applied, errors, loading };
}

test('initial snapshot loads once after connection and preserves initialized drafts on reconnect / 连接后只完整初始化一次，重连不覆盖已有草稿', async () => {
  const r = initialRig();
  await r.loader.connection('connecting'); assert.equal(r.requests.length, 0);
  const first = r.loader.connection('connected');
  assert.equal(r.loader.connection('connected'), first);
  assert.equal(r.requests.length, 4);
  for (const request of r.requests) request.resolve({ path: request.path });
  await first;
  assert.equal(r.applied.length, 1);
  assert.equal(r.applied[0].config.path, '/api/config');
  assert.deepEqual(r.loading, [true, false]);
  await r.loader.connection('disconnected'); await r.loader.connection('connected');
  assert.equal(r.requests.length, 4);
  r.loader.dispose();
});

test('initial snapshot retries a failed connection and ignores every stale result / 初始读取失败后重试，丢弃失效连接的全部结果', async () => {
  const r = initialRig(), old = r.loader.connection('connected');
  await r.loader.connection('disconnected');
  const fresh = r.loader.connection('connected');
  for (const request of r.requests.slice(0, 4)) request.resolve({ old: true });
  await old;
  assert.deepEqual(r.applied, []); assert.deepEqual(r.loading, [true, true]);
  for (const request of r.requests.slice(4)) request.resolve({ fresh: true });
  await fresh;
  assert.equal(r.applied.length, 1); assert.deepEqual(r.applied[0].config, { fresh: true });
  assert.deepEqual(r.errors, []); assert.deepEqual(r.loading, [true, true, false]);
  r.loader.dispose();
});

test('initial failures remain retryable and disposing cannot apply late reads / 初始失败可重试，清理后迟到读取不能应用状态', async () => {
  const r = initialRig(), first = r.loader.connection('connected');
  r.requests[0].reject(new Error('temporary'));
  await first;
  assert.deepEqual(r.errors, ['temporary']); assert.deepEqual(r.loading, [true, false]);
  await r.loader.connection('disconnected');
  const next = r.loader.connection('connected'); r.loader.dispose();
  for (const request of r.requests) request.resolve({ late: true });
  await next;
  assert.deepEqual(r.applied, []); assert.deepEqual(r.loading, [true, false, true]);
});

test('page-cache suspension during initial requests retries through the same session interface / 初始请求期间进入页面缓存，恢复后通过同一会话 interface 重试', async t => {
  const r = rig(t), page = new EventTarget(), applied = [], errors = [];
  const initial = createInitialSnapshotLoader(r.session, { onLoad: value => applied.push(value), onError: error => errors.push(error) });
  const cleanup = attachPageLifecycle(r.session, page, { onStatus: status => { void initial.connection(status); } });
  await flush(); r.peers[0].open(); await flush();
  assert.equal(r.peers[0].sent.length, 4);
  page.dispatchEvent(new Event('pagehide'));
  page.dispatchEvent(new Event('pageshow'));
  await flush(); r.peers[1].open(); await flush();
  assert.equal(r.peers[1].sent.length, 4);
  for (const command of r.peers[0].sent) r.peers[0].receive({ id: command.id, data: { old: true } });
  for (const command of r.peers[1].sent) r.peers[1].receive({ id: command.id, data: { fresh: true } });
  await flush();
  assert.equal(applied.length, 1); assert.deepEqual(applied[0].config, { fresh: true }); assert.deepEqual(errors, []);
  initial.dispose(); cleanup();
});

test('page-cache restoration reconnects once and final cleanup detaches both listeners / 页面缓存恢复仅重连一次，最终清理移除两个监听器', async t => {
  const r = rig(t), listeners = new Map();
  const page = {
    addEventListener(type, listener) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(listener); },
    removeEventListener(type, listener) { listeners.get(type)?.delete(listener); },
    dispatch(type) { for (const listener of listeners.get(type) || []) listener(); },
  };
  const snapshots = [];
  const cleanup = attachPageLifecycle(r.session, page, { onSnapshot: snapshot => snapshots.push(snapshot) });
  await flush(); r.peers[0].open();
  page.dispatch('pageshow'); await flush();
  assert.equal(r.peers.length, 1, 'Normal pageshow must not create another socket / 初次显示不重复建连');
  page.dispatch('pagehide');
  assert.equal(r.peers[0].readyState, 3);
  page.dispatch('pageshow'); page.dispatch('pageshow'); await flush();
  assert.equal(r.peers.length, 2, 'Restoration creates exactly one peer / 恢复仅创建一个连接');
  r.peers[1].open();
  r.peers[0].receive({ type: 'state', data: { stale: true } });
  r.peers[1].receive({ type: 'state', data: { restored: true } });
  assert.deepEqual(snapshots, [{ restored: true }]);
  cleanup(); cleanup();
  assert.equal(r.peers[1].readyState, 3);
  assert.equal([...listeners.values()].reduce((sum, items) => sum + items.size, 0), 0);
  page.dispatch('pageshow'); await flush();
  assert.equal(r.peers.length, 2);
  assert.equal(r.scheduled.size, 0);
});
function rig(t, authenticate = async () => {}) {
  const peers = [], states = [], snapshots = [], scheduled = new Map();
  let timerId = 0;
  const timers = {
    setTimeout(fn, delay) { const id = ++timerId; scheduled.set(id, { fn, delay }); return id; },
    clearTimeout(id) { scheduled.delete(id); },
  };
  const session = createRealtimeSession({ url: 'ws://memory/session', authenticate, timers, timeoutMs: 100,
    createSocket: () => {
      const peer = { readyState: 0, sent: [],
        send(frame) { if (this.sendError) throw this.sendError; this.sent.push(JSON.parse(frame)); },
        close() { this.readyState = 3; this.onclose?.(); },
        open() { this.readyState = 1; this.onopen(); },
        receive(frame) { this.onmessage({ data: typeof frame === 'string' ? frame : JSON.stringify(frame) }); },
      };
      peers.push(peer); return peer;
    },
  });
  t.after(() => { session.stop(); assert.equal(scheduled.size, 0, 'No leaked timers / 不遗留计时器'); });
  session.start({ onStatus: value => states.push(value), onSnapshot: (...args) => snapshots.push(args) });
  return { session, peers, states, snapshots, scheduled, async tick(delay) {
    for (const [id, entry] of [...scheduled]) if (entry.delay === delay) { scheduled.delete(id); entry.fn(); }
    await flush();
  } };
}

test('auth precedes opening; concurrent commands correlate independently of state pushes / 鉴权后建连，并发请求与状态推送互不干扰', async t => {
  let allow;
  const r = rig(t, () => new Promise(resolve => { allow = resolve; }));
  assert.equal(r.peers.length, 0);
  allow(); await flush(); r.peers[0].open();
  const first = r.session.request('/api/config'), second = r.session.request('/api/input/active', { method: 'PUT', body: '{"active":true}' });
  await flush();
  const [read, write] = r.peers[0].sent;
  assert.equal(read.method, 'GET'); assert.deepEqual(write.body, { active: true });
  r.peers[0].receive('broken frame');
  r.peers[0].receive({ type: 'state', data: { runtime: { inputActive: false } }, logs: ['stopped'] });
  r.peers[0].receive({ id: write.id, ok: true, data: { accepted: true } });
  r.peers[0].receive({ id: read.id, ok: false, data: { error: 'rejected' } });
  await assert.rejects(first, /rejected/);
  assert.deepEqual(await second, { accepted: true });
  assert.deepEqual(r.snapshots, [[{ runtime: { inputActive: false } }, ['stopped']]]);
  assert.deepEqual(r.states, ['connecting', 'connected']);
  assert.equal(r.scheduled.size, 0);
});

test('disconnect rejects commands and ready waiters; reconnect ignores old frames and never replays / 断线拒绝请求，重连丢弃旧帧且不重放命令', async t => {
  const r = rig(t); await flush(); const old = r.peers[0]; old.open();
  const interrupted = r.session.request('/api/input/manual', { method: 'PUT', body: { L0: 999 } });
  const rejected = assert.rejects(interrupted, /断开|disconnected/i);
  await flush(); old.close(); await rejected;
  const waiting = r.session.ready();
  await r.tick(1500); const current = r.peers[1]; current.open(); await waiting;
  old.receive({ type: 'state', data: { stale: true } });
  assert.deepEqual(r.snapshots, []);
  assert.deepEqual(current.sent, []);
  const next = r.session.request('/api/state/overview'); await flush();
  assert.notEqual(current.sent[0].id, old.sent[0].id);
  current.receive({ id: current.sent[0].id, data: { fresh: true } });
  assert.deepEqual(await next, { fresh: true });
});

test('authentication failure retries; stopping during authentication cannot reopen / 鉴权失败重试，关闭期间的迟到鉴权不会重新建连', async t => {
  let attempts = 0, release;
  const r = rig(t, async () => { if (++attempts === 1) throw new Error('denied'); await new Promise(resolve => { release = resolve; }); });
  await flush(); assert.deepEqual(r.states, ['connecting', 'error']);
  await r.tick(3000); r.session.stop(); release(); await flush();
  assert.equal(r.peers.length, 0);
  await assert.rejects(r.session.ready(), /关闭|closed/i);
});

test('readiness and command timeouts, send failures and malformed bodies release all resources / 等待与请求超时、发送失败和无效请求均释放资源', async t => {
  const r = rig(t); await flush();
  const waiting = r.session.ready(); const timedOut = assert.rejects(waiting, /就绪|ready/i);
  await r.tick(100); await timedOut;
  r.peers[0].open();
  await assert.rejects(r.session.request('/invalid', { body: '{' }), SyntaxError);
  const slow = r.session.request('/slow'); const expired = assert.rejects(slow, /超时|timeout|timed out/i);
  await flush(); await r.tick(100); await expired;
  r.peers[0].sendError = new Error('wire failed');
  await assert.rejects(r.session.request('/send'), /wire failed/);
  assert.equal(r.scheduled.size, 0);
});

test('stop rejects every pending request and readiness waiter, without scheduling reconnect / 关闭拒绝所有待处理请求与等待，并取消重连', async t => {
  const r = rig(t); await flush();
  const waiting = r.session.ready(), rejected = assert.rejects(waiting, /关闭|closed/i);
  r.session.stop(); await rejected;
  r.session.start(); await flush(); r.peers[1].open();
  const request = r.session.request('/pending'), interrupted = assert.rejects(request, /关闭|closed/i);
  await flush(); r.session.stop(); await interrupted;
  assert.equal(r.scheduled.size, 0);
});
