import test from 'node:test';
import assert from 'node:assert/strict';
import { updateOscSourceSelection } from '../../src/node/host/start.ts';
import { OscServices } from '../../src/node/inputs/osc-services.ts';
import { OscParameterStore, type OscSource } from '../../src/core/protocols/osc.ts';
import { RuntimeEngine } from '../../src/core/runtime/runtime.ts';
import { normalizeConfiguration } from '../../src/core/runtime/configuration.ts';
import { defaultComputedSignalInputConfig } from '../../src/core/runtime/configuration-defaults.ts';
import type { RuntimeMotionFrame } from '../../src/core/runtime/model.ts';

const remembered = 'oscquery:name:Remembered';
const old: OscSource = { key: 'old-endpoint', label: 'Remembered', persistentId: remembered, address: '127.0.0.1', port: 9001 };
const other: OscSource = { ...old, key: 'other-endpoint', label: 'Other', persistentId: 'oscquery:name:Other', port: 9002 };
function rig() {
  const oscStore = new OscParameterStore(() => 1000), frames: RuntimeMotionFrame[] = [];
  const runtime = new RuntimeEngine(normalizeConfiguration({ osc: { enabled: false, preferredSourcePersistentId: remembered },
    signals: [{ oscPath: 'Depth', sourceMode: 'Direct', role: 'Depth' }] }),
  { now: () => 1000, oscStore, sendFrame: frame => { frames.push(frame); } });
  const osc = new OscServices(runtime.getConfig().osc, oscStore, { now: () => 1000 });
  return { runtime, oscStore, osc, frames, async close() { runtime.dispose(); await osc.dispose(); } };
}

test('remembered OSC identity waits for its own producer instead of reading another source at startup', async () => {
  const r = rig(), source = { ...defaultComputedSignalInputConfig(), oscPath: 'Depth' };
  try {
    r.oscStore.set('Depth', .9, other);
    assert.equal(r.oscStore.preferredSourceKey, 'unavailable:' + remembered);
    assert.equal(r.osc.snapshot()['selectedSourceKey'], 'unavailable:' + remembered);
    assert.equal(r.runtime.resolveSignalInput(source).valid, false);
    r.oscStore.set('Depth', .2, old);
    assert.equal(r.oscStore.preferredSourceKey, old.key); assert.equal(r.runtime.resolveSignalInput(source).value, .2);
  } finally { await r.close(); }
});
test('the saved unavailable OSC option retains its persistent identity and later resolves to its producer', async () => {
  const r = rig(); let saves = 0;
  try {
    const waiting = 'unavailable:' + remembered;
    const reply = await updateOscSourceSelection(waiting, { ...r, async save() { saves++; } });
    assert.equal(saves, 0); assert.equal(reply.persisted, true); assert.equal(reply.preferredSourcePersistentId, remembered);
    r.oscStore.set('Depth', .2, { ...old, persistentId: remembered.toUpperCase() });
    assert.equal(r.oscStore.preferredSourceKey, old.key);
  } finally { await r.close(); }
});
test('configuration replaces a remembered OSC identity with a waiting selection until its producer arrives', async () => {
  const r = rig(), source = { ...defaultComputedSignalInputConfig(), oscPath: 'Depth' }, persistentId = 'oscquery:name:Next';
  try {
    r.oscStore.set('Depth', .2, old);
    const config = structuredClone(r.runtime.getConfig()); config.osc.preferredSourcePersistentId = persistentId;
    r.runtime.applyConfiguration(config); await r.osc.reconfigure(r.runtime.getConfig().osc);
    r.oscStore.set('Depth', .3, old);
    assert.equal(r.oscStore.preferredSourceKey, 'unavailable:' + persistentId); assert.equal(r.runtime.resolveSignalInput(source).valid, false);
    r.oscStore.set('Depth', .8, { ...old, key: 'next-endpoint', persistentId });
    assert.equal(r.runtime.resolveSignalInput(source).value, .8);
  } finally { await r.close(); }
});
test('host clear forgets a remembered OSC identity before any endpoint has published', async () => {
  const r = rig(); let saves = 0;
  try {
    r.runtime.setInputActive(true); r.oscStore.preferredSourceKey = null;
    const reply = await updateOscSourceSelection(null, { ...r, async save() { saves++; } });
    assert.equal(saves, 1); assert.equal(reply.preferredSourcePersistentId, ''); assert.equal(reply.persisted, false);
    assert.equal(r.runtime.getConfig().osc.preferredSourcePersistentId, ''); assert.equal(r.osc.snapshot()['preferredSourcePersistentId'], '');
    assert.equal(r.runtime.getSnapshot()['inputActive'], false);
    r.oscStore.set('Depth', .8, old);
    assert.equal(r.oscStore.preferredSourceKey, null); assert.equal(r.osc.snapshot()['selectedSourceKey'], '');
  } finally { await r.close(); }
});

test('failed host clear restores a remembered OSC identity with no current endpoint without rearming', async () => {
  const r = rig();
  try {
    r.runtime.setInputActive(true);
    await assert.rejects(updateOscSourceSelection(null, { ...r, async save() {
      assert.equal(r.osc.snapshot()['preferredSourcePersistentId'], ''); throw new Error('Disk unavailable');
    } }), /Disk unavailable/);
    assert.equal(r.runtime.getConfig().osc.preferredSourcePersistentId, remembered);
    assert.equal(r.osc.snapshot()['preferredSourcePersistentId'], remembered); assert.equal(r.oscStore.preferredSourceKey, 'unavailable:' + remembered);
    assert.equal(r.runtime.getSnapshot()['inputActive'], false);
    r.oscStore.set('Depth', .8, { ...old, key: 'reconnected-endpoint' });
    assert.equal(r.oscStore.preferredSourceKey, 'reconnected-endpoint');
  } finally { await r.close(); }
});

test('failed host selection restores the old OSC intent after its catalog entry disappears and reconnects by identity', async () => {
  const r = rig(), source = { ...defaultComputedSignalInputConfig(), oscPath: 'Depth' };
  try {
    r.oscStore.set('Depth', .2, old); r.oscStore.set('Depth', .9, other); r.runtime.setInputActive(true);
    await assert.rejects(updateOscSourceSelection(other.key, { ...r, async save() {
      assert.equal(r.osc.snapshot()['preferredSourcePersistentId'], other.persistentId);
      r.oscStore.clearSource(old.key); throw new Error('Disk unavailable');
    } }), /Disk unavailable/);
    assert.equal(r.oscStore.preferredSourceKey, old.key); assert.equal(r.osc.snapshot()['selectedSourceKey'], old.key);
    assert.equal(r.osc.snapshot()['preferredSourcePersistentId'], remembered); assert.equal(r.runtime.getConfig().osc.preferredSourcePersistentId, remembered);
    assert.equal(r.runtime.resolveSignalInput(source).valid, false); assert.equal(r.runtime.getSnapshot()['inputActive'], false);
    r.oscStore.set('Depth', .7, { ...old, key: 'reconnected-endpoint' });
    assert.equal(r.runtime.resolveSignalInput(source).value, .7);
    r.oscStore.set('Depth', .95, other); assert.equal(r.oscStore.preferredSourceKey, 'reconnected-endpoint');
  } finally { await r.close(); }
});

test('a persistent OSC endpoint change reaches active routing on the next host tick', async () => {
  const r = rig();
  try {
    r.oscStore.set('Depth', .2, old);
    await updateOscSourceSelection(old.key, { ...r, async save() {} });
    r.runtime.setInputMode('Osc'); r.runtime.setInputActive(true); await r.runtime.flush();
    assert.ok(Math.abs((r.frames.at(-1)?.values.L0 ?? 0) - .1998) < 1e-8);
    r.oscStore.set('Depth', .8, { ...old, key: 'reconnected-endpoint', port: 9010 });
    assert.equal(r.oscStore.preferredSourceKey, 'reconnected-endpoint');
    r.runtime.tick(); await r.runtime.flush();
    assert.ok(Math.abs((r.frames.at(-1)?.values.L0 ?? 0) - .7992) < 1e-8);
    assert.equal(r.runtime.getSnapshot()['inputActive'], true);
  } finally { await r.close(); }
});
