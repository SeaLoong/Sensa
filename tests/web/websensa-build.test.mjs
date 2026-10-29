import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { webSensaAssets, buildWebSensa } from '../../scripts/build-websensa.mjs';

test('standalone WebSensa builds local executable resources with dependency notices and no external script', async () => {
  const files = await webSensaAssets();
  assert.deepEqual([...files.keys()].sort(), ['app.bundle.css', 'app.bundle.js', 'app.bundle.js.LEGAL.txt', 'index.html']);
  const html = files.get('index.html').toString();
  assert.match(html, /<div id="app-root"><\/div>/);
  assert.doesNotMatch(html, /<script[^>]+src="https?:/);
  for (const reference of html.matchAll(/(?:src|href)="\.\/([^"?#]+)"/g))
    assert.ok(files.has(reference[1]), 'Standalone HTML dependency: ' + reference[1]);
  assert.ok(files.get('app.bundle.js').length > 100000);
  assert.match(files.get('app.bundle.js.LEGAL.txt').toString(), /React|react/);
  assert.match(files.get('app.bundle.css').toString(), /websensa/);
  const output = await fs.mkdtemp(path.join(os.tmpdir(), 'sensa-standalone-web-'));
  try {
    await buildWebSensa({ output });
    assert.deepEqual((await fs.readdir(output)).sort(), [...files.keys()].sort());
    for (const [name, expected] of files)
      assert.deepEqual(await fs.readFile(path.join(output, name)), expected);
  } finally { await fs.rm(output, { recursive: true, force: true }); }
});
