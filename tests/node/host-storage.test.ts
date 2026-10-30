import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendFile, mkdtemp, open, readFile, readdir, rm, symlink, writeFile, type FileHandle } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AtomicConfigurationStore, RecordingStore } from '../../src/node/host/storage.ts';
test('configuration writes serialize atomically and rejected updates preserve the previous file', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sensa-host-store-'));
  try {
    const path = join(directory, 'config.json');
    const store = new AtomicConfigurationStore(path, value => {
      if (!value || typeof value !== 'object' || !('revision' in value) || typeof value.revision !== 'number') throw new Error('Invalid revision.');
      return { revision: value.revision };
    });
    assert.deepEqual(await store.load(() => ({ revision: 0 })), { revision: 0 });
    await Promise.all([store.save({ revision: 1 }), store.save({ revision: 2 })]);
    assert.deepEqual(await store.load(() => ({ revision: 0 })), { revision: 2 });
    await assert.rejects(store.save({ revision: 'bad' } as unknown as { revision: number }), /Invalid revision/);
    assert.equal(JSON.parse(await readFile(path, 'utf8')).revision, 2); assert.deepEqual(await readdir(directory), ['config.json']);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test('invalid existing JSON fails without replacing it or echoing a content snippet', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sensa-host-bad-config-'));
  try {
    const path = join(directory, 'config.json'), raw = '{"password":"fixture-private-fragment'; await writeFile(path, raw);
    const store = new AtomicConfigurationStore(path, value => value);
    await assert.rejects(store.load(() => ({})), { message: 'Configuration JSON is invalid.' }); assert.equal(await readFile(path, 'utf8'), raw);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test('a configuration writer that loses its ownership cannot replace the saved file', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sensa-host-ownership-'));
  try {
    let owned = true; const path = join(directory, 'config.json'), store = new AtomicConfigurationStore(path, value => value, () => owned);
    await store.save({ revision: 1 }); owned = false;
    await assert.rejects(store.save({ revision: 2 }), /ownership was lost/); assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), { revision: 1 });
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test('recording storage preserves the API inventory and bounds reads and path selection', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sensa-host-recording-'));
  try {
    const store = new RecordingStore(directory); await store.write('session.funscript', '{"actions":[]}');
    assert.equal(new TextDecoder().decode(await store.read('session.funscript')), '{"actions":[]}');
    const files = await store.list(); assert.equal(files[0]!.fileName, 'session.funscript'); assert.equal(files[0]!.size, 14); assert.equal(typeof files[0]!.modifiedAt, 'string');
    await assert.rejects(store.read('session.funscript', 2), /size limit/);
    await assert.rejects(store.write('session.funscript', '{}'));
    for (const name of ['../outside.funscript', '..\\outside.funscript', '/absolute.funscript', 'data.txt', 'config.json', 'bad\u0000.funscript', 'CON.funscript', 'aux.csv', 'COM1.jsonl']) assert.throws(() => store.resolveFile(name));
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test('recording reads and listing do not follow a symbolic link outside the directory', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'sensa-host-link-'));
  try {
    const root = join(directory, 'recordings'), store = new RecordingStore(root); await store.write('ordinary.funscript', '{}');
    const outside = join(directory, 'outside.funscript'); await writeFile(outside, 'outside');
    try { await symlink(outside, join(root, 'link.funscript')); }
    catch (error) { if (error instanceof Error && 'code' in error && error.code === 'EPERM') { t.skip('This runner cannot create symbolic links.'); return; } throw error; }
    await assert.rejects(store.read('link.funscript')); assert.deepEqual((await store.list()).map(row => row.fileName), ['ordinary.funscript']);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test('recording growth after the open-handle stat remains bounded during the read', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'sensa-host-growing-recording-'));
  try {
    const store = new RecordingStore(directory), filename = store.resolveFile('growing.csv');
    await writeFile(filename, '1234');
    const probe = await open(filename, 'r');
    const prototype = Object.getPrototypeOf(probe) as { stat: FileHandle['stat'] };
    const original = prototype.stat, identity = await probe.stat(); await probe.close();
    let grew = false;
    t.mock.method(prototype, 'stat', async function (this: FileHandle) {
      const snapshot = await original.call(this);
      assert.ok(snapshot);
      if (!grew && snapshot.ino === identity.ino && snapshot.dev === identity.dev) {
        grew = true; await appendFile(filename, '56789');
      }
      return snapshot;
    });
    await assert.rejects(store.read('growing.csv', 8), /size limit/);
    assert.equal(grew, true); assert.equal(await readFile(filename, 'utf8'), '123456789');
  } finally { t.mock.restoreAll(); await rm(directory, { recursive: true, force: true }); }
});
