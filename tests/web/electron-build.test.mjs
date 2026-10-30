import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { flipFuses, getCurrentFuseWire, FuseState, FuseV1Options } from '@electron/fuses';
import { copyCliResources, fusePolicy } from '../../scripts/build-electron.mjs';

test('Electron embeds the same visible CLI files as the portable archive, including nested resources', async t => {
  const temporary = await mkdtemp(join(tmpdir(), '.sensa-cli-copy-'));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const source = join(temporary, '.source'), destination = join(temporary, 'desktop-cli');
  const shipped = ['Sensa', 'BUILD-INFO.json', 'NODE-BUILD.json', 'THIRD-PARTY-NOTICES.txt',
    'web/app.bundle.js', 'web/docs/assets/parameter-geometry-3d.js', 'tools/protocol-bridge/bridge.py'];
  for (const name of [...shipped, '.sensa-node-build', '.hidden/private.json', 'web/.cache/private.js',
    'tools/protocol-bridge/.venv/private.py']) {
    const filename = join(source, name); await mkdir(join(filename, '..'), { recursive: true });
    await writeFile(filename, 'isolated fixture: ' + name);
  }
  await copyCliResources(source, destination);
  const files = (await readdir(destination, { recursive: true, withFileTypes: true })).filter(entry => entry.isFile())
    .map(entry => relative(destination, join(entry.parentPath, entry.name)).replaceAll('\\', '/')).sort();
  assert.deepEqual(files, [...shipped].sort());
  for (const name of shipped) assert.equal(await readFile(join(destination, name), 'utf8'), 'isolated fixture: ' + name);
});

for (const platform of ['linux', 'darwin', 'win32']) {
  test(`stock Electron ${platform} fuse bytes retain the shipped V8 snapshot and explicit security policy`, async t => {
    const temporary = await mkdtemp(join(tmpdir(), 'sensa-fuse-wire-'));
    t.after(() => rm(temporary, { recursive: true, force: true }));
    // Synthetic fuse-wire bytes only: this file is never an executable or launched.
    const fixture = join(temporary, 'electron-fuse-wire.fixture');
    await writeFile(fixture, Buffer.concat([Buffer.from('isolated fixture\0dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX'),
      Buffer.from([1, 9]), Buffer.from('000000000')]));
    const policy = fusePolicy(platform);
    assert.equal(policy.strictlyRequireAllFuses, true);
    assert.equal(policy.resetAdHocDarwinSignature, true);
    assert.equal(await flipFuses(fixture, policy), 1);
    const actual = await getCurrentFuseWire(fixture);
    assert.equal(actual[FuseV1Options.LoadBrowserProcessSpecificV8Snapshot], FuseState.DISABLE,
      'standard Electron artifacts use the shipped snapshot, without a custom browser_v8_context_snapshot.bin');
    assert.deepEqual(actual, { version: '1',
      [FuseV1Options.RunAsNode]: FuseState.DISABLE,
      [FuseV1Options.EnableCookieEncryption]: FuseState.ENABLE,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: FuseState.DISABLE,
      [FuseV1Options.EnableNodeCliInspectArguments]: FuseState.DISABLE,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: platform === 'linux' ? FuseState.DISABLE : FuseState.ENABLE,
      [FuseV1Options.OnlyLoadAppFromAsar]: FuseState.ENABLE,
      [FuseV1Options.LoadBrowserProcessSpecificV8Snapshot]: FuseState.DISABLE,
      [FuseV1Options.GrantFileProtocolExtraPrivileges]: FuseState.DISABLE,
      [FuseV1Options.WasmTrapHandlers]: FuseState.ENABLE });
  });
}
