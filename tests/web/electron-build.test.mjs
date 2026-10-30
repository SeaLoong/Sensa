import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { copyCliResources } from '../../scripts/build-electron.mjs';

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
