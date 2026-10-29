import test from 'node:test';
import assert from 'node:assert/strict';
import { attachPagePresence, pagePresenceId } from '../../src/web/page-presence.js';

const settle = () => new Promise(resolve => setImmediate(resolve));
function fixture(fetch) {
  const listeners = new Map(), scheduled = [], beacons = [];
  const options = {
    id: 'test-tab', fetch,
    window: { addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name) },
    navigator: { sendBeacon: (...args) => { beacons.push(args); return true; } },
    setTimeout: (fn, ms) => { const job = { fn, ms, cancelled: false }; scheduled.push(job); return job; },
    clearTimeout: job => { if (job) job.cancelled = true; },
  };
  return { options, listeners, scheduled, beacons };
}

test('page presence acquires the local session, refreshes its own lease and releases on page hide', async () => {
  const requests = [];
  const state = fixture(async (...request) => { requests.push(request); return { ok: true }; });
  const dispose = attachPagePresence(state.options);
  await settle();
  assert.equal(requests[0][0], '/api/session');
  assert.deepEqual(JSON.parse(requests[1][1].body), { id: 'test-tab', open: true, revision: 1 });
  assert.equal(state.scheduled[0].ms, 5000);
  state.listeners.get('pagehide')();
  assert.equal(state.scheduled[0].cancelled, true);
  assert.deepEqual(JSON.parse(await state.beacons[0][1].text()), { id: 'test-tab', open: false, revision: 2 });
  state.listeners.get('pageshow')();
  await settle();
  assert.equal(requests.length, 4);
  dispose(); dispose();
  assert.equal(state.listeners.size, 0);
  assert.equal(state.beacons.length, 2);
});

test('a page disposed while session authentication is pending never resurrects its presence', async () => {
  let finish;
  const requests = [];
  const state = fixture((...request) => { requests.push(request); return new Promise(resolve => { finish = resolve; }); });
  const dispose = attachPagePresence(state.options);
  dispose(); finish({ ok: true }); await settle();
  assert.equal(requests.length, 1);
  assert.equal(state.scheduled.length, 0);
});

test('failed network refreshes remain bounded and do not open browser windows', async () => {
  const state = fixture(async () => { throw new Error('offline'); });
  const dispose = attachPagePresence(state.options);
  await settle();
  assert.equal(state.scheduled.length, 1);
  dispose();
  assert.equal(state.scheduled[0].cancelled, true);
});

test('ordinary HTTP LAN pages can identify their lease without secure-context randomUUID', () => {
  assert.match(pagePresenceId({}), /^[A-Za-z0-9_-]{1,64}$/);
  assert.notEqual(pagePresenceId({}), pagePresenceId({}));
  assert.equal(pagePresenceId({ randomUUID: () => 'secure-context-id' }), 'secure-context-id');
});
