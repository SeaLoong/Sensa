import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { screenshotGallery } from '../../scripts/site-screenshots.mjs';

const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
function chunk(type, data = Buffer.alloc(0)) {
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  let crc = 0xffffffff;
  for (const byte of body) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  const result = Buffer.alloc(data.length + 12);
  result.writeUInt32BE(data.length); body.copy(result, 4);
  result.writeUInt32BE((crc ^ 0xffffffff) >>> 0, result.length - 4);
  return result;
}
function header({ width = 1, height = 1, depth = 8, color = 6, compression = 0, filter = 0, interlace = 0 } = {}) {
  const data = Buffer.alloc(13);
  data.writeUInt32BE(width); data.writeUInt32BE(height, 4);
  data.set([depth, color, compression, filter, interlace], 8);
  return chunk('IHDR', data);
}
const pixels = chunk('IDAT', deflateSync(Buffer.from([0, 255, 0, 0, 255])));
const end = chunk('IEND');
const png = (...parts) => Buffer.concat([signature, ...parts]);
const validPng = png(header(), pixels, end);

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sensa-gallery-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const source = path.join(root, 'source'), folder = path.join(source, 'docs/screenshots');
  const images = {};
  for (const viewport of ['desktop', 'mobile']) {
    await fs.mkdir(path.join(folder, viewport), { recursive: true });
    images[viewport] = {};
    for (const locale of ['en', 'zh-CN']) {
      const file = viewport + '/control-' + locale + '.png';
      await fs.writeFile(path.join(folder, file), validPng);
      images[viewport][locale] = { file, sha256: digest(validPng), language: locale === 'en' ? 'en-US' : 'zh-CN' };
    }
  }
  const catalog = { schema: 1, sourceCommit: 'a'.repeat(40), runId: '40015184919', attempt: '1',
    scenes: [{ id: 'control', en: 'Control', zh: '控制', images }] };
  const catalogPath = path.join(folder, 'catalog.json');
  const save = () => fs.writeFile(catalogPath, JSON.stringify(catalog));
  await save();
  const written = new Map();
  return { root, source, folder, catalog, catalogPath, save, written,
    run: () => screenshotGallery(source, async (name, bytes) => written.set(name, Buffer.from(bytes))),
    async replaceImage(bytes) {
      const record = catalog.scenes[0].images.desktop.en;
      await fs.writeFile(path.join(folder, record.file), bytes);
      record.sha256 = digest(bytes); await save();
    },
  };
}

test('gallery publishes the captured bytes and exact source, run and attempt', async t => {
  const f = await fixture(t);
  const html = await f.run();
  assert.equal(f.written.size, 5);
  for (const [file, bytes] of f.written) if (file.endsWith('.png')) assert.deepEqual(bytes, validPng);
  assert.deepEqual(JSON.parse(f.written.get('screenshots-manifest.json')), f.catalog);
  assert.match(html, /actions\/runs\/40015184919\/attempts\/1/);
  assert.match(html, /href="screenshots-manifest\.json"/);
  assert.match(html, /width="1" height="1"/);
  assert.match(html, /role="group" aria-label="Scenario"/);
  assert.match(html, /aria-pressed="true"/);
});

test('gallery validates complete capture identity and scene records before writing', async t => {
  const f = await fixture(t), original = structuredClone(f.catalog);
  const changes = [
    value => { value.sourceCommit = 'main'; },
    value => { value.runId = '0'; },
    value => { delete value.attempt; },
    value => { value.attempt = '1\n'; },
    value => { value.scenes.push(value.scenes[0]); },
    value => { value.scenes[0].en = {}; },
    value => { delete value.scenes[0].images.mobile; },
    value => { value.scenes[0].images.desktop.en.language = 'fr-FR'; },
  ];
  for (const change of changes) {
    const catalog = structuredClone(original); change(catalog);
    await fs.writeFile(f.catalogPath, JSON.stringify(catalog));
    await assert.rejects(f.run()); assert.equal(f.written.size, 0);
  }
  await fs.writeFile(f.catalogPath, 'null');
  await assert.rejects(f.run(), /Invalid screenshot catalog/);
});

test('gallery refuses traversal, absolute paths and mismatched viewport paths', async t => {
  const f = await fixture(t);
  for (const name of ['../image.png', '/image.png', 'desktop/../image.png', 'desktop\\image.png',
    'desktop/nested/image.png', 'desktop/.image.png', 'mobile/image.png']) {
    f.catalog.scenes[0].images.desktop.en.file = name; await f.save();
    await assert.rejects(f.run(), /Screenshot path/); assert.equal(f.written.size, 0);
  }
});

test('gallery rejects changed image bytes before any asset is published', async t => {
  const f = await fixture(t);
  await fs.writeFile(path.join(f.folder, f.catalog.scenes[0].images.mobile['zh-CN'].file), Buffer.from('changed'));
  await assert.rejects(f.run(), /differs from its reviewed capture/);
  assert.equal(f.written.size, 0);
});

test('gallery verifies and publishes additional guide images in the public capture manifest', async t => {
  const f = await fixture(t);
  f.catalog.additionalImages = ['desktop/tracking.png', 'mobile/recording.png'].map(file => ({
    file, sha256: digest(validPng), language: 'zh-CN',
  }));
  for (const record of f.catalog.additionalImages) await fs.writeFile(path.join(f.folder, record.file), validPng);
  await f.save();
  const html = await f.run();
  assert.equal(f.written.size, 7);
  for (const record of f.catalog.additionalImages)
    assert.deepEqual(f.written.get('media/docs/screenshots/' + record.file), validPng);
  assert.deepEqual(JSON.parse(f.written.get('screenshots-manifest.json')), f.catalog);
  assert.doesNotMatch(html, /tracking\.png|recording\.png/, 'Guide-only images do not add gallery scenes');
});

test('invalid additional guide captures prevent publication of the entire gallery', async t => {
  const f = await fixture(t);
  const file = 'desktop/tracking.png';
  await fs.writeFile(path.join(f.folder, file), validPng);
  const record = { file, sha256: digest(validPng), language: 'zh-CN' };
  for (const additional of [null, {}, [null], [{ ...record, file: '../tracking.png' }],
    [{ ...record, sha256: 'b'.repeat(64) }], [{ ...record, language: 'fr' }]]) {
    f.catalog.additionalImages = additional; await f.save();
    await assert.rejects(f.run()); assert.equal(f.written.size, 0);
  }
  f.catalog.additionalImages = [record]; await f.save();
  const external = path.join(f.root, 'outside.png');
  await fs.rename(path.join(f.folder, file), external);
  await fs.symlink(external, path.join(f.folder, file));
  await assert.rejects(f.run(), /regular files and directories/);
  assert.equal(f.written.size, 0);
});

test('gallery rejects screenshot file, parent directory and catalog symlinks', async t => {
  for (const target of ['file', 'directory', 'catalog']) {
    await t.test(target, async t => {
      const f = await fixture(t);
      const original = target === 'file' ? path.join(f.folder, 'desktop/control-en.png')
        : target === 'directory' ? path.join(f.folder, 'desktop') : f.catalogPath;
      const external = path.join(f.root, 'external');
      await fs.rename(original, external);
      await fs.symlink(external, original, target === 'directory' ? 'dir' : 'file');
      await assert.rejects(f.run(), /regular files and directories/);
      assert.equal(f.written.size, 0);
    });
  }
});

test('gallery bounds image and catalog sizes before reading their contents', async t => {
  const f = await fixture(t);
  await fs.truncate(path.join(f.folder, 'desktop/control-en.png'), 32 * 1024 * 1024 + 1);
  await assert.rejects(f.run(), /size limit/);
  await fs.truncate(f.catalogPath, 1024 * 1024 + 1);
  await assert.rejects(f.run(), /size limit/);
  assert.equal(f.written.size, 0);
});

test('gallery rejects truncated, corrupt and incomplete PNG containers even with matching hashes', async t => {
  const f = await fixture(t), corrupt = Buffer.from(validPng);
  corrupt[corrupt.length - 1] ^= 1;
  const invalid = [
    validPng.subarray(0, 24), corrupt, png(pixels, end), png(header(), end),
    png(header(), pixels), png(header(), pixels, end, Buffer.from('trailing')),
    png(header(), header(), pixels, end), png(header(), pixels, chunk('IEND', Buffer.from([0]))),
    png(header(), chunk('IDAT'), end), png(header(), chunk('ABCD'), pixels, end),
    png(header(), pixels, chunk('tEXt', Buffer.from('label\0value')), pixels, end),
    png(chunk('\xc9HDR', Buffer.alloc(13)), pixels, end),
  ];
  for (const bytes of invalid) {
    await f.replaceImage(bytes);
    await assert.rejects(f.run(), /complete PNG/); assert.equal(f.written.size, 0);
  }
});

test('gallery validates PNG dimensions, pixel count and IHDR encoding fields', async t => {
  const f = await fixture(t);
  for (const fields of [{ width: 0 }, { height: 0 }, { width: 16385 }, { height: 16385 },
    { width: 8193, height: 8193 }, { depth: 3 }, { color: 1 }, { compression: 1 }, { filter: 1 }, { interlace: 2 }]) {
    await f.replaceImage(png(header(fields), pixels, end));
    await assert.rejects(f.run(), /complete PNG/); assert.equal(f.written.size, 0);
  }
});

test('gallery accepts ordinary ancillary chunks and consecutive image-data chunks', async t => {
  const f = await fixture(t);
  await f.replaceImage(png(header(), chunk('tEXt', Buffer.from('label\0value')), chunk('IDAT'), pixels, end));
  await f.run();
  assert.equal(f.written.size, 5);
});

test('gallery preserves image language and escapes labels in HTML and embedded JSON', async t => {
  const f = await fixture(t);
  f.catalog.scenes[0].en = '</script><img src=x onerror=alert(1)>';
  f.catalog.scenes[0].images.desktop['zh-CN'].language = 'en-US';
  await f.save();
  const html = await f.run();
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /&lt;\/script&gt;/);
  const scenes = JSON.parse(html.match(/id="screenshot-data">([\s\S]*?)<\/script>/)[1]);
  assert.equal(scenes[0].en, f.catalog.scenes[0].en);
  assert.equal(scenes[0].images.desktop['zh-CN'].language, 'en-US');
});
