import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { manifestFiles, safeAssetPath } from '../../src/node/asset-manifest.ts';
import type { AssetReader } from '../../src/node/asset-manifest.ts';
import { extractNativePackages, loadOptionalPackage } from '../../src/node/native-packages.ts';
import { createResourceReader } from '../../src/node/resources.ts';

function fixture(files: Record<string, string>, native = false): { assets: AssetReader; manifest: Record<string, unknown>; data: Map<string, ArrayBuffer> } {
  const data = new Map<string, ArrayBuffer>();
  const rows = Object.entries(files).map(([path, content]) => {
    const bytes = Buffer.from(content), asset = (native ? 'native/' : 'web/') + path;
    data.set(asset, Uint8Array.from(bytes).buffer);
    return { path, asset, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  });
  const manifest: Record<string, unknown> = { schema: 1, files: rows, ...(native ? { platform: process.platform, arch: process.arch,
    modules: process.versions.modules, nodeVersion: process.versions.node, packages: ['serialport', '@julusian/midi'] } : {}) };
  data.set(native ? 'native-manifest.json' : 'web-manifest.json', Uint8Array.from(Buffer.from(JSON.stringify(manifest))).buffer);
  return { assets: { isSea: () => true, getAsset: key => { const value = data.get(key); if (!value) throw new Error('Missing fixture asset'); return value; } }, manifest, data };
}
function nativeFixture(extra: Record<string, string> = {}) {
  return fixture({ 'node_modules/serialport/package.json': '{"name":"serialport","main":"index.js"}',
    'node_modules/serialport/index.js': 'module.exports={marker:"serial"};',
    'node_modules/@julusian/midi/package.json': '{"name":"@julusian/midi","main":"index.js"}',
    'node_modules/@julusian/midi/index.js': 'module.exports={marker:"midi"};', ...extra }, true);
}

test('resource paths reject traversal, alternate streams and cross-platform aliases', () => {
  for (const name of ['../outside', '/outside', 'a//b', 'a/./b', 'a\\b', 'C:/outside', 'a:stream', 'aux.txt', 'x. ', 'a\0b'])
    assert.throws(() => safeAssetPath(name), /asset path/);
  assert.equal(safeAssetPath('node_modules/@serialport/stream/dist/index.js'), 'node_modules/@serialport/stream/dist/index.js');
});
test('embedded resources require declared names and exact original size and SHA', () => {
  const f = fixture({ 'index.html': '<h1>Sensa</h1>' }), read = createResourceReader({ assets: f.assets });
  assert.equal(Buffer.from(read('index.html') ?? []).toString(), '<h1>Sensa</h1>');
  assert.equal(read('../index.html'), undefined); assert.equal(read('missing.html'), undefined);
  f.data.set('web/index.html', Uint8Array.from(Buffer.from('same length?')).buffer);
  assert.throws(() => read('index.html'), /size or SHA/);
});
test('manifest rejects case-colliding inventory before any extraction', () => {
  const f = fixture({ 'A.js': 'a', 'a.js': 'b' });
  assert.throws(() => manifestFiles(f.manifest, 'web/'), /Duplicate/);
});
test('folder resources stay inside the selected root and reject symlink descendants', t => {
  const parent = mkdtempSync(join(tmpdir(), 'sensa-resource-unit-')); t.after(() => rmSync(parent, { recursive: true, force: true }));
  const web = join(parent, 'web'), outside = join(parent, 'outside'); mkdirSync(web); mkdirSync(outside);
  writeFileSync(join(web, 'index.html'), 'safe'); writeFileSync(join(outside, 'private.txt'), 'private');
  symlinkSync(outside, join(web, 'alias'), process.platform === 'win32' ? 'junction' : 'dir');
  const read = createResourceReader({ directory: web, assets: { isSea: () => false, getAsset: () => { throw new Error('Unexpected SEA'); } } });
  assert.equal(Buffer.from(read('index.html') ?? []).toString(), 'safe');
  assert.equal(read('../outside/private.txt'), undefined); assert.equal(read('alias/private.txt'), undefined);
});
test('native dependencies extract as ordinary private files into distinct per-process roots', t => {
  const parent = mkdtempSync(join(tmpdir(), 'sensa-native-unit-')); t.after(() => rmSync(parent, { recursive: true, force: true }));
  const f = nativeFixture(), a = extractNativePackages({ assets: f.assets, temporaryDirectory: parent, registerCleanup: false });
  const b = extractNativePackages({ assets: f.assets, temporaryDirectory: parent, registerCleanup: false });
  t.after(a.dispose); t.after(b.dispose); assert.notEqual(a.directory, b.directory);
  assert.equal(readFileSync(join(a.directory, 'node_modules/serialport/index.js'), 'utf8'), 'module.exports={marker:"serial"};');
  assert.equal(lstatSync(join(a.directory, 'node_modules/serialport/index.js')).isSymbolicLink(), false);
  assert.ok(!readdirSync(join(a.directory, 'node_modules/serialport')).some(name => name.endsWith('.sensa-partial')));
  if (process.platform !== 'win32') {
    assert.equal(lstatSync(a.directory).mode & 0o777, 0o700);
    assert.equal(lstatSync(join(a.directory, 'node_modules/serialport/index.js')).mode & 0o777, 0o600);
  }
});
test('native integrity and runtime mismatch fail before writing any directory', t => {
  const parent = mkdtempSync(join(tmpdir(), 'sensa-native-unit-')); t.after(() => rmSync(parent, { recursive: true, force: true }));
  const f = nativeFixture(); f.data.set('native/node_modules/serialport/index.js', new ArrayBuffer(0));
  assert.throws(() => extractNativePackages({ assets: f.assets, temporaryDirectory: parent }), /size or SHA/);
  assert.deepEqual(readdirSync(parent), []);
  const bad = nativeFixture(); bad.manifest['modules'] = 'wrong';
  bad.data.set('native-manifest.json', Uint8Array.from(Buffer.from(JSON.stringify(bad.manifest))).buffer);
  assert.throws(() => extractNativePackages({ assets: bad.assets, temporaryDirectory: parent }), /runtime/);
  assert.deepEqual(readdirSync(parent), []);
});
test('native module loads from verified files and never falls back to outside modules', async t => {
  const parent = mkdtempSync(join(tmpdir(), 'sensa-native-unit-')); t.after(() => rmSync(parent, { recursive: true, force: true }));
  const outsider = join(parent, 'node_modules/outside-package'); mkdirSync(outsider, { recursive: true });
  writeFileSync(join(outsider, 'index.js'), 'globalThis.__sensaOutsideWasLoaded=true;module.exports={};');
  const f = nativeFixture({ 'node_modules/serialport/index.js': 'module.exports=require("outside-package");' });
  await assert.rejects(loadOptionalPackage('serialport', { assets: f.assets, temporaryDirectory: parent, registerCleanup: false,
    require: (name, root) => { assert.ok(root); return createRequire(join(root, 'entry.cjs'))(name) as unknown; } }), /outside its verified/);
  assert.equal(Reflect.get(globalThis, '__sensaOutsideWasLoaded'), undefined);
  assert.equal(readdirSync(parent).some(name => name.startsWith('sensa-native-')), false);
  assert.equal(existsSync(join(outsider, 'index.js')), true);
});
test('non-SEA native loader keeps an injectable unknown module boundary', async () => {
  const module = { SerialPort: () => ({ fixture: true }) };
  assert.equal(await loadOptionalPackage('serialport', { assets: { isSea: () => false, getAsset: () => { throw new Error('No assets'); } }, require: name => {
    assert.equal(name, 'serialport'); return module;
  } }), module);
});
