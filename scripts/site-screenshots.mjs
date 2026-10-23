import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const bilingual = (en, zh) => `<span data-en>${escape(en)}</span><span data-zh hidden>${escape(zh)}</span>`;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const MAX_IMAGE_BYTES = 32 * 1024 * 1024;
const MAX_DIMENSION = 16384;
const MAX_PIXELS = 64 * 1024 * 1024;
const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) value = crcTable[(value ^ byte) & 255] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

async function readSourceFile(source, name, limit) {
  let file = source;
  const parts = name.split('/');
  for (let index = 0; index < parts.length; index++) {
    file = path.join(file, parts[index]);
    const stat = await fs.lstat(file);
    if (stat.isSymbolicLink() || (index === parts.length - 1 ? !stat.isFile() : !stat.isDirectory()))
      throw new Error('Screenshot sources must use regular files and directories: ' + name);
    if (index === parts.length - 1 && stat.size > limit) throw new Error('Screenshot source exceeds its size limit: ' + name);
  }
  return fs.readFile(file);
}

/** Check the PNG container and dimensions; browser E2E checks actual image decoding. */
function pngDimensions(bytes) {
  const invalid = () => { throw new Error('Screenshot must contain a complete PNG with valid chunks and bounded dimensions'); };
  if (bytes.length < 45 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) invalid();
  let offset = 8, width, height, color, depth, palette = false, dataSeen = false, dataBytes = 0, dataEnded = false;
  while (offset < bytes.length) {
    if (bytes.length - offset < 12) invalid();
    const length = bytes.readUInt32BE(offset), end = offset + length + 12;
    if (end > bytes.length) invalid();
    const type = bytes.toString('latin1', offset + 4, offset + 8);
    if (!/^[A-Za-z]{2}[A-Z][A-Za-z]$/.test(type)
        || crc32(bytes.subarray(offset + 4, end - 4)) !== bytes.readUInt32BE(end - 4)) invalid();
    if (offset === 8 && type !== 'IHDR') invalid();
    if (type === 'IHDR') {
      if (offset !== 8 || length !== 13) invalid();
      width = bytes.readUInt32BE(offset + 8); height = bytes.readUInt32BE(offset + 12);
      depth = bytes[offset + 16]; color = bytes[offset + 17];
      const depths = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };
      if (!width || !height || width > MAX_DIMENSION || height > MAX_DIMENSION || width * height > MAX_PIXELS
          || !depths[color]?.includes(depth) || bytes[offset + 18] !== 0 || bytes[offset + 19] !== 0
          || bytes[offset + 20] > 1) invalid();
    } else if (type === 'PLTE') {
      if (palette || dataSeen || !length || length > 768 || length % 3 || [0, 4].includes(color)
          || color === 3 && length / 3 > 2 ** depth) invalid();
      palette = true;
    } else if (type === 'IDAT') {
      if (dataEnded || color === 3 && !palette) invalid();
      dataSeen = true;
      dataBytes += length;
    } else if (type === 'IEND') {
      if (length || !dataBytes || end !== bytes.length) invalid();
      return { width, height };
    } else if (/^[A-Z]/.test(type)) invalid();
    if (dataSeen && type !== 'IDAT') dataEnded = true;
    offset = end;
  }
  invalid();
}

/** Publish only the selected, reviewed browser captures used in the guides. */
export async function screenshotGallery(source, write) {
  source = await fs.realpath(source);
  const catalog = JSON.parse(await readSourceFile(source, 'docs/screenshots/catalog.json', 1024 * 1024));
  if (!catalog || typeof catalog !== 'object' || Array.isArray(catalog)) throw new Error('Invalid screenshot catalog');
  const runId = String(catalog.runId || ''), attempt = String(catalog.attempt || '');
  if (catalog.schema !== 1 || !/^[a-f0-9]{40}$/.test(catalog.sourceCommit || '')
      || !/^[1-9]\d*$/.test(runId) || !/^[1-9]\d*$/.test(attempt)
      || !Array.isArray(catalog.scenes) || !catalog.scenes.length
      || catalog.additionalImages !== undefined && !Array.isArray(catalog.additionalImages))
    throw new Error('Screenshot catalog requires a reviewed source, Actions run and attempt');
  const scenes = [], ids = new Set(), files = new Map();
  const image = async (record, viewport) => {
    if (!record || typeof record.file !== 'string' || !/^(desktop|mobile)\/[a-zA-Z0-9-]+\.png$/.test(record.file)
        || viewport && !record.file.startsWith(viewport + '/') || !/^[a-f0-9]{64}$/.test(record.sha256 || '')
        || !['en-US', 'zh-CN'].includes(record.language))
      throw new Error('Screenshot path must belong to its viewport');
    const bytes = await readSourceFile(source, 'docs/screenshots/' + record.file, MAX_IMAGE_BYTES);
    if (createHash('sha256').update(bytes).digest('hex') !== record.sha256)
      throw new Error('Documentation screenshot differs from its reviewed capture: ' + record.file);
    const dimensions = pngDimensions(bytes);
    const url = 'media/docs/screenshots/' + record.file;
    files.set(url, bytes);
    return { url, ...dimensions, language: record.language };
  };
  for (const scene of catalog.scenes) {
    if (!scene || !/^[a-z][a-z-]*$/.test(scene.id) || ids.has(scene.id)
        || typeof scene.en !== 'string' || !scene.en.trim() || typeof scene.zh !== 'string' || !scene.zh.trim())
      throw new Error('Invalid screenshot scene');
    ids.add(scene.id);
    const images = {};
    for (const viewport of ['desktop', 'mobile']) {
      images[viewport] = {};
      for (const locale of ['en', 'zh-CN']) {
        images[viewport][locale] = await image(scene.images?.[viewport]?.[locale], viewport);
      }
    }
    scenes.push({ id: scene.id, en: scene.en, zh: scene.zh, images });
  }
  for (const record of catalog.additionalImages || []) await image(record);
  for (const [name, bytes] of files) await write(name, bytes);
  await write('screenshots-manifest.json', JSON.stringify({ ...catalog, runId, attempt }, null, 2) + '\n');
  const first = scenes[0], initial = first.images.desktop.en;
  const data = JSON.stringify(scenes).replaceAll('<', '\\u003c');
  return `<section id="screenshots" class="home-section screenshot-section" aria-labelledby="screenshots-heading">
<div class="section-heading"><p class="eyebrow">${bilingual('THE RUNNING WORKBENCH', '实际运行界面')}</p><h2 id="screenshots-heading">${bilingual('See each way of working', '看看不同方式怎样使用')}</h2><p>${bilingual('Explore the controls, parameter list and calculations at desktop and narrow widths.', '切换场景和屏幕宽度，查看控制、参数列表与计算在实际运行中的样子。')}</p></div>
<div class="screenshot-controls"><div class="screenshot-scenes" role="group" aria-label="Scenario" data-label-en="Scenario" data-label-zh="使用场景">${scenes.map((s, i) => `<button type="button" data-screenshot-scene="${s.id}" aria-pressed="${i === 0}">${bilingual(s.en, s.zh)}</button>`).join('')}</div>
<div class="screenshot-views" role="group" aria-label="Screen width" data-label-en="Screen width" data-label-zh="屏幕宽度"><button type="button" data-screenshot-view="desktop" aria-pressed="true">${bilingual('Desktop', '桌面')}</button><button type="button" data-screenshot-view="mobile" aria-pressed="false">${bilingual('Narrow', '窄屏')}</button></div></div>
<figure class="running-screenshot"><a id="screenshot-original" href="${initial.url}" aria-label="Open original screenshot" data-label-en="Open original screenshot" data-label-zh="打开原始截图"><img id="screenshot-image" src="${initial.url}" alt="${escape(first.en)}" width="${initial.width}" height="${initial.height}" loading="lazy" decoding="async"></a><figcaption id="screenshot-caption">${escape(first.en)}</figcaption></figure>
<p class="caption">${bilingual('Captured in GitHub Actions: Sensa running in Chromium, with isolated simulated device connections. Desktop 1280 × 900; narrow 390 × 844. Some images show individual panels.', '截图来自 GitHub Actions 中实际运行的 Sensa 与 Chromium，设备连接使用隔离的模拟传输。桌面视口 1280 × 900，窄屏视口 390 × 844；部分图片展示单个功能面板。')} <a href="https://github.com/SeaLoong/Sensa/actions/runs/${runId}/attempts/${attempt}">${bilingual('Capture run ↗', '查看采集运行 ↗')}</a> · <a href="screenshots-manifest.json">${bilingual('Capture details', '采集记录')}</a></p>
<script type="application/json" id="screenshot-data">${data}</script></section>`;
}
