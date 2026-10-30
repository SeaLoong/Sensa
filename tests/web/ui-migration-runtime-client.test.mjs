import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalRuntimeClient, createRemoteRuntimeClient, runtimeJson, runtimePath } from '../../src/web/runtime-client.ts';

function clock() {
  let sequence = 0;
  const callbacks = new Map();
  return { callbacks, setInterval(callback) { const id = ++sequence; callbacks.set(id, callback); return id; },
    clearInterval(id) { callbacks.delete(id); },
    async fire() { for (const callback of callbacks.values()) callback(); await new Promise(resolve => setImmediate(resolve)); } };
}
function local(overrides = {}) {
  const timers = clock(), state = { active: false, manual: .25 }, commands = [];
  const client = createLocalRuntimeClient({ timers, snapshot: () => state, logs: () => [{ message: 'ready' }],
    deactivate: () => { state.active = false; }, facade: { async execute(method, path, body) {
      commands.push({ method, path, body });
      if (path === '/api/input/active') state.active = body.active;
      return { statusCode: 200, success: true, data: state };
    } }, ...overrides });
  return { client, timers, state, commands };
}

test('one local client executes the shared facade and owns snapshot/result copies', async () => {
  const { client, state, commands } = local(), snapshots = [], statuses = [];
  client.start({ onStatus: status => statuses.push(status), onSnapshot: value => snapshots.push(value) });
  const result = await client.request('/api/input/active', { method: 'PUT', body: '{"active":true}' });
  assert.equal(state.active, true); assert.deepEqual(commands, [{ method: 'PUT', path: '/api/input/active', body: { active: true } }]);
  result.active = false; snapshots.at(-1).manual = .9;
  assert.equal(state.active, true); assert.equal(state.manual, .25);
  assert.deepEqual(statuses, ['connected']);
  await client.dispose(); assert.equal(state.active, false);
});

test('page suspension stops input; resume attaches one timer without reactivation', async () => {
  const { client, state, timers } = local();
  client.start(); client.start(); assert.equal(timers.callbacks.size, 1);
  await client.request('/api/input/active', { method: 'PUT', body: { active: true } });
  client.stop(); assert.equal(state.active, false); assert.equal(timers.callbacks.size, 0);
  await assert.rejects(client.request('/api/config'), /closed/);
  client.start(); assert.equal(state.active, false); assert.equal(timers.callbacks.size, 1);
  await client.dispose(); assert.equal(timers.callbacks.size, 0); assert.throws(() => client.start(), /disposed/);
});

test('an in-flight command completing after suspension cannot leave input reactivated', async () => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const state = { active: true };
  const { client } = local({ snapshot: () => state, deactivate: () => { state.active = false; },
    facade: { async execute() { await pending; state.active = true; return { statusCode: 200, success: true, data: state }; } } });
  client.start(); const action = client.request('/api/input/active', { method: 'PUT', body: { active: true } });
  await Promise.resolve(); client.stop(); assert.equal(state.active, false); release();
  await assert.rejects(action, /closed/); assert.equal(state.active, false); await client.dispose();
});

test('local tick does not overlap when a slow delivery is pending', async () => {
  let release, ticks = 0;
  const pending = new Promise(resolve => { release = resolve; });
  const { client, timers } = local({ tick: async () => { ticks++; await pending; } });
  client.start(); await timers.fire(); await timers.fire(); assert.equal(ticks, 1);
  release(); await new Promise(resolve => setImmediate(resolve)); await timers.fire(); assert.equal(ticks, 2);
  await client.dispose();
});

test('a restored page waits for an old command before accepting fresh activation', async () => {
  let release, requests = 0;
  const pending = new Promise(resolve => { release = resolve; });
  const state = { active: false };
  const { client } = local({ snapshot: () => state, deactivate: () => { state.active = false; },
    facade: { async execute() { if (++requests === 1) await pending; state.active = true; return { statusCode: 200, success: true, data: state }; } } });
  client.start(); const old = client.request('/api/input/active', { method: 'PUT', body: { active: true } });
  await Promise.resolve(); client.stop(); client.start();
  const fresh = client.request('/api/input/active', { method: 'PUT', body: { active: true } });
  await Promise.resolve(); assert.equal(requests, 1); release();
  await assert.rejects(old, /closed/); await fresh; assert.equal(state.active, true);
  await client.dispose();
});

test('canonical API paths reject foreign URLs, traversal, fragments and separators', () => {
  assert.equal(runtimePath('/api/output/recordings?format=funscript'), '/api/output/recordings?format=funscript');
  for (const path of ['https://other.test/api/config', '//other.test/api/config', '/api/../config', '/api/%2e%2e/config',
    '/api/config#fragment', '/api/\\config', '/api/config\n', '/config', '/api/%zz']) assert.throws(() => runtimePath(path));
  const original = { nested: { value: .5 } }, copy = runtimeJson(original); copy.nested.value = 1;
  assert.equal(original.nested.value, .5);
  assert.throws(() => runtimeJson({ value: 'x'.repeat(4 * 1024 * 1024) }), /limit/);
  let deep = {}; for (let i = 0; i < 70; i++) deep = { next: deep };
  assert.throws(() => runtimeJson(deep), /nested/);
});

test('local fetch serves the facade explicitly and preserves HTTP errors for callers', async () => {
  const { client, commands } = local({ facade: { async execute() { return { statusCode: 400, success: false, data: { error: 'Invalid saved configuration.' } }; } } });
  client.start();
  const response = await client.fetch('/api/config', { method: 'PUT', body: '{}' });
  assert.equal(response.status, 400); assert.equal(response.ok, false); assert.deepEqual(await response.json(), { error: 'Invalid saved configuration.' });
  await assert.rejects(client.request('/api/config'), /Invalid saved configuration/);
  assert.deepEqual(commands, []); await client.dispose();
});

test('aborted local requests never reach the command facade', async () => {
  const { client, commands } = local(), abort = new AbortController(); client.start(); abort.abort();
  await assert.rejects(client.request('/api/input/active', { method: 'PUT', body: { active: true }, signal: abort.signal }), { name: 'AbortError' });
  assert.deepEqual(commands, []); await client.dispose();
});

test('remote transport preserves the shared session and validates snapshots at its boundary', async () => {
  let hooks, stops = 0; const requests = [], fetches = [], states = [], statuses = [];
  const client = createRemoteRuntimeClient({ start(value) { hooks = value; }, stop() { stops++; },
    async request(path, options) { requests.push({ path, options }); return { ok: true }; } },
  async (path, options) => { fetches.push({ path, options }); return new Response('{}'); });
  client.start({ onStatus: value => statuses.push(value), onSnapshot: value => states.push(value) });
  hooks.onStatus('connected'); hooks.onSnapshot({ input: { active: false } }, []);
  hooks.onSnapshot('invalid state', []); assert.deepEqual(statuses, ['connected', 'error']); assert.equal(states.length, 1);
  assert.deepEqual(await client.request('/api/input/active', { method: 'PUT', body: '{"active":true}' }), { ok: true });
  assert.deepEqual(requests[0].options.body, { active: true });
  await client.fetch('/api/control/output/device/script-prepare', { method: 'POST', body: '{}', credentials: 'omit', redirect: 'follow' });
  assert.equal(fetches[0].options.credentials, 'same-origin'); assert.equal(fetches[0].options.redirect, 'error');
  await client.dispose(); assert.equal(stops, 1); await assert.rejects(client.request('/api/config'), /disposed/);
});
