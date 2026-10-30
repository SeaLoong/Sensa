import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BrowserPagePresence } from '../../src/node/host/presence.ts';
test('page-close tombstones reject delayed older heartbeats until the lease expires', () => {
  let now = 0; const presence = new BrowserPagePresence(() => now);
  assert.equal(presence.update('page-A', true, 1), true); assert.equal(presence.count, 1);
  presence.update('page-A', false, 3); presence.update('page-A', true, 2); assert.equal(presence.count, 0);
  now = 20_000; presence.update('page-A', true, 1); assert.equal(presence.count, 1);
});
test('browser launch tracks actual pages and applies the short launch grace period', () => {
  let now = 0; const presence = new BrowserPagePresence(() => now);
  assert.equal(presence.tryBeginLaunch(), true); assert.equal(presence.tryBeginLaunch(), false);
  now = 3_000; assert.equal(presence.tryBeginLaunch(), true);
  presence.update('page', true, 0); now += 3_000; assert.equal(presence.tryBeginLaunch(), false);
  now += 20_000; assert.equal(presence.tryBeginLaunch(), true);
});
test('presence validates revisions and bounds independent tab entries', () => {
  const presence = new BrowserPagePresence(() => 0);
  for (const [id, open, revision] of [['../bad', true, 0], ['okay', 'true', 0], ['okay', true, -1], ['okay', true, 0.5]]) assert.equal(presence.update(id, open, revision), false);
  for (let index = 0; index < 128; index++) assert.equal(presence.update(`page-${index}`, true, 0), true);
  assert.equal(presence.update('overflow', true, 0), false); assert.equal(presence.update('page-0', false, 1), true); assert.equal(presence.count, 127);
});
