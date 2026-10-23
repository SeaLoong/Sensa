import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { buildPages, mapDocumentHeadings } from '../../scripts/build-pages.mjs';

test('public guides build into bilingual routes with resolvable local links and offline diagram assets', async () => {
  const output = await fs.mkdtemp(path.join(os.tmpdir(), 'sensa-site-'));
  try {
    const manifest = await buildPages({ output, commit: 'site-unit-fixture' });
    assert.equal(manifest.commit, 'site-unit-fixture');
    assert.ok((await fs.stat(path.join(output, '.nojekyll'))).isFile());
    assert.equal(Object.hasOwn(manifest.assets, '.nojekyll'), false);
    for (const route of ['en/README.html', 'zh-CN/README.html', 'en/docs/osc-parameters.html', 'zh-CN/docs/osc-parameters.html',
      'en/unity/top.sealoong.sensa/README.html', 'zh-CN/unity/top.sealoong.sensa/README.html']) assert.ok(manifest.routes.includes(route), route);
    for (const route of ['index.html', ...manifest.routes]) {
      const html = await fs.readFile(path.join(output, route), 'utf8');
      assert.match(html, /<main/);
      assert.doesNotMatch(html, /(?:file:\/\/|[A-Z]:[\\/](?:Users|Code)|__VPM_[A-Z_]+__)/);
      for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
        const url = new URL(match[1].replaceAll('&amp;', '&'), 'https://example.test/Sensa/' + route);
        if (url.origin !== 'https://example.test') continue;
        const target = decodeURIComponent(url.pathname.replace(/^\/Sensa\//, ''));
        const info = await fs.stat(path.join(output, target));
        assert.ok(info.isFile() || info.isDirectory(), route + ' -> ' + target);
      }
    }
    const packageGuide = await fs.readFile(path.join(output, 'en/unity/top.sealoong.sensa/README.html'), 'utf8');
    assert.match(packageGuide, /href="\.\.\/\.\.\/docs\/ogb-compatibility\.html"/);
    assert.doesNotMatch(packageGuide, /href="https:\/\/github\.com\/SeaLoong\/Sensa\/blob\/main\/docs\/ogb-compatibility\.en\.md"/);
    const guide = await fs.readFile(path.join(output, 'en/docs/guide.html'), 'utf8');
    const translatedGuide = await fs.readFile(path.join(output, 'zh-CN/docs/guide.html'), 'utf8');
    const headingMap = JSON.parse(guide.match(/data-heading-map="([^"]+)"/)[1].replaceAll('&quot;', '"').replaceAll('&amp;', '&'));
    assert.ok(Object.keys(headingMap).length > 3, 'Language links map corresponding sections');
    for (const [original, translated] of Object.entries(headingMap)) {
      assert.ok(guide.includes('id="' + original + '" tabindex="-1"'));
      assert.ok(translatedGuide.includes('id="' + translated + '" tabindex="-1"'));
    }
    const parameterGuide = await fs.readFile(path.join(output, 'en/docs/osc-parameters.html'), 'utf8');
    assert.match(parameterGuide, /<div class="doc-scroll" role="region" tabindex="0" aria-label="Table; scroll horizontally when needed"><table>/);
    const developmentGuide = await fs.readFile(path.join(output, 'en/docs/development.html'), 'utf8');
    assert.match(developmentGuide, /<div class="doc-scroll" role="region" tabindex="0" aria-label="Code example; scroll horizontally when needed"><pre>/);
    const review = await fs.readFile(path.join(output, 'en/docs/ui-visual-review.html'), 'utf8');
    const reviewSource = await fs.readFile(new URL('../../docs/ui-visual-review.en.md', import.meta.url), 'utf8');
    const pinned = reviewSource.match(/https:\/\/github\.com\/SeaLoong\/Sensa\/blob\/[0-9a-f]{7,40}\/[^)\s]+\.md/)?.[0];
    assert.ok(pinned, 'The research record retains a pinned Markdown reference');
    assert.ok(review.includes('href="' + pinned + '"'), 'Pinned research references stay external');
    assert.match(await fs.readFile(path.join(output, 'parameter-geometry.html'), 'utf8'), /name="sensa-site-root" content="\.\/"/);
    const files = Object.keys(manifest.assets).filter(x => x.startsWith('assets/'));
    assert.equal(files.length, 6);
    assert.ok(files.includes('assets/osc-parameter-reference.js'));
    assert.deepEqual(manifest.vpmVersions, []);
    assert.match(await fs.readFile(path.join(output, 'index.html'), 'utf8'), /data-vpm="false"/);
    for (const asset of files) assert.match(manifest.assets[asset], /^[a-f0-9]{64}$/);
    // Render the already-verified historical index correctly even without executing JavaScript.
    // 已验证历史索引在不执行JS时也必须显示真实可用状态。
    const historical = { name: 'Sensa', url: 'https://sealoong.github.io/Sensa/vpm.json',
      packages: { 'top.sealoong.sensa': { versions: { '0.1.0': { name: 'top.sealoong.sensa', version: '0.1.0',
        url: 'https://sealoong.github.io/Sensa/packages/top.sealoong.sensa/0.1.0/top.sealoong.sensa.zip', sha256: '0'.repeat(64) } } } } };
    const indexText = JSON.stringify(historical);
    await fs.writeFile(path.join(output, 'vpm.json'), indexText);
    const available = await buildPages({ output, commit: 'historical-vpm-fixture' });
    assert.deepEqual(available.vpmVersions, ['0.1.0']);
    assert.equal(await fs.readFile(path.join(output, 'vpm.json'), 'utf8'), indexText);
    const homepage = await fs.readFile(path.join(output, 'index.html'), 'utf8');
    assert.match(homepage, /data-vpm="true"/);
    assert.match(homepage, /Stable packages are available/);
    assert.doesNotMatch(homepage, /No stable VPM package|__VPM_[A-Z_]+__/);
    const installLink = homepage.match(/<a\b[^>]*\bid="vcc"[^>]*>/)?.[0];
    assert.ok(installLink);
    assert.doesNotMatch(installLink, /\bhidden\b/);
    assert.ok(installLink.includes('href="vcc://vpm/addRepo?url=' + encodeURIComponent(historical.url) + '"'));
    for (const section of ['start', 'possibilities-heading', 'outputs-heading', 'recording-heading', 'unity-heading', 'documentation'])
      assert.ok(homepage.includes('id="' + section + '"'), 'Homepage task section: ' + section);
    assert.match(homepage, /data-fragment-en="record-and-inspect" data-fragment-zh="录制与观察"/);
    assert.match(homepage, /<noscript>[\s\S]*href="en\/README.html"[\s\S]*href="zh-CN\/README.html"[\s\S]*<\/noscript>/);
    for (const label of ['CI', 'E2E', 'Pages', 'Release']) assert.ok(homepage.includes('alt="' + label + '"'));
  } finally { await fs.rm(output, { recursive: true, force: true }); }
});

test('homepage switches task anchors and accessible labels with unavailable preference storage', async () => {
  const source = await fs.readFile(new URL('../../.github/pages/site.js', import.meta.url), 'utf8');
  const callbacks = new Map(), english = { hidden: false }, chinese = { hidden: true };
  const recording = { href: '', dataset: { doc: 'docs/signal-pipeline', fragmentEn: 'record-and-inspect', fragmentZh: '录制与观察' } };
  const label = { dataset: { labelEn: 'Main navigation', labelZh: '主导航' }, setAttribute(name, value) { this[name] = value; } };
  const elements = { language: { addEventListener: (name, action) => callbacks.set(name, action) },
    vcc: {}, 'copy-vpm': { addEventListener() {} }, 'vpm-status': {} };
  const document = { documentElement: {}, body: { hasAttribute: () => true, dataset: { vpm: 'false' } },
    getElementById: name => elements[name],
    querySelectorAll: selector => ({ '[data-en]': [english], '[data-zh]': [chinese], '[data-doc]': [recording],
      '[data-label-en]': [label], '[data-diagram]': [] })[selector] || [] };
  vm.runInNewContext(source, { document, URL, location: new URL('https://example.test/Sensa/'),
    navigator: { languages: ['fr-FR'], language: 'fr-FR' },
    localStorage: { getItem() { throw new Error('Unavailable'); }, setItem() { throw new Error('Unavailable'); } },
  });
  assert.equal(document.documentElement.lang, 'en-US');
  assert.equal(recording.href, 'en/docs/signal-pipeline.html#record-and-inspect');
  assert.equal(label['aria-label'], 'Main navigation');
  callbacks.get('click')();
  assert.equal(document.documentElement.lang, 'zh-CN');
  assert.equal(english.hidden, true); assert.equal(chinese.hidden, false);
  assert.equal(recording.href, 'zh-CN/docs/signal-pipeline.html#' + encodeURIComponent('录制与观察'));
  assert.equal(label['aria-label'], '主导航'); assert.equal(elements.language.textContent, 'English');
  assert.equal(elements.vcc.hidden, true); assert.equal(elements['copy-vpm'].hidden, true);
  callbacks.get('click')(); assert.equal(recording.href, 'en/docs/signal-pipeline.html#record-and-inspect');
});

test('language section maps require a matching outline instead of guessing from mismatched headings', () => {
  const original = [{ tag: 'h1', id: 'guide' }, { tag: 'h2', id: 'first' }, { tag: 'h3', id: 'detail' }];
  const translated = [{ tag: 'h1', id: '使用指南' }, { tag: 'h2', id: '开始' }, { tag: 'h3', id: '细节' }];
  assert.deepEqual(mapDocumentHeadings(original, translated), { guide: '使用指南', first: '开始', detail: '细节' });
  assert.deepEqual(mapDocumentHeadings(original, translated.slice(0, 2)), {});
  assert.deepEqual(mapDocumentHeadings(original, translated.map(heading => ({ ...heading, tag: 'h2' }))), {});
});

test('document enhancement preserves heading links and makes only overflowing examples keyboard stops', async () => {
  const source = await fs.readFile(new URL('../../.github/pages/site.js', import.meta.url), 'utf8');
  const location = new URL('https://example.test/Sensa/en/docs/guide.html#first');
  const events = new Map(), clicks = new Map(), storage = new Map();
  const link = { href: 'https://example.test/Sensa/zh-CN/docs/guide.html',
    dataset: { locale: 'zh-CN', headingMap: JSON.stringify({ first: '开始' }) },
    addEventListener: (name, action) => clicks.set(name, action) };
  const wide = { scrollWidth: 900, clientWidth: 300, tabIndex: 0, firstElementChild: {} };
  const narrow = { scrollWidth: 299, clientWidth: 300, tabIndex: 0, firstElementChild: {} };
  const observed = [];
  vm.runInNewContext(source, { URL, location, navigator: { languages: ['en-US'], language: 'en-US' },
    localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    document: { body: { hasAttribute: () => false },
      querySelectorAll: selector => selector === '[data-locale]' ? [link] : selector === '.doc-scroll' ? [wide, narrow] : [],
      fonts: { ready: Promise.resolve() } },
    window: { addEventListener: (name, action) => events.set(name, action) },
    matchMedia: () => ({ matches: false }),
    ResizeObserver: class { observe(node) { observed.push(node); } },
  });
  await Promise.resolve();
  assert.equal(new URL(link.href).hash, '#' + encodeURIComponent('开始'));
  assert.equal(wide.tabIndex, 0);
  assert.equal(narrow.tabIndex, -1);
  assert.deepEqual(observed, [wide, wide.firstElementChild, narrow, narrow.firstElementChild]);
  location.hash = '#content'; events.get('hashchange')();
  assert.equal(new URL(link.href).hash, '#content');
  location.hash = '#unknown'; events.get('hashchange')();
  assert.equal(new URL(link.href).hash, '');
  location.hash = '#%invalid'; events.get('hashchange')();
  assert.equal(new URL(link.href).hash, '');
  wide.scrollWidth = 300; events.get('resize')();
  assert.equal(wide.tabIndex, -1);
  clicks.get('click')();
  assert.equal(storage.get('sensa.locale'), 'zh-CN');
});
