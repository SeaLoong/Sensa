import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DesktopInstanceCoordinator } from '../../src/node/host/instance.ts';
test('one configuration has one lease owner and duplicate launches use authenticated private IPC', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sensa-owner-')), config = join(directory, 'config.json'), privateDirectory = join(directory, 'ipc');
  let owner: DesktopInstanceCoordinator | null = null;
  try {
    owner = await DesktopInstanceCoordinator.acquire(config, { privateDirectory, onCompromised: error => { throw error; } }); assert.ok(owner);
    assert.equal(await DesktopInstanceCoordinator.acquire(config, { privateDirectory, onCompromised: error => { throw error; } }), null);
    const opens: boolean[] = []; await owner.start(open => { opens.push(open); return 'http://127.0.0.1:7777'; });
    assert.deepEqual(await DesktopInstanceCoordinator.notifyOwner(config, true, { privateDirectory }), { ok: true, url: 'http://127.0.0.1:7777' }); assert.deepEqual(opens, [true]);
    await owner.close(); owner = null;
    const next = await DesktopInstanceCoordinator.acquire(config, { privateDirectory, onCompromised: error => { throw error; } }); assert.ok(next); await next.close();
  } finally { await owner?.close(); await rm(directory, { recursive: true, force: true }); }
});
test('an abandoned stale lease can be recovered without waiting for a real process', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sensa-stale-')), config = join(directory, 'config.json');
  try {
    const path = config + '.node.lock'; await mkdir(path); const before = new Date(Date.now() - 60_000); await utimes(path, before, before);
    const owner = await DesktopInstanceCoordinator.acquire(config, { privateDirectory: join(directory, 'ipc'), onCompromised: error => { throw error; } }); assert.ok(owner); await owner.close();
  } finally { await rm(directory, { recursive: true, force: true }); }
});
