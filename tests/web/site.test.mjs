import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { buildPages, mapDocumentHeadings } from '../../scripts/build-pages.mjs';

const decodeAttribute = value => value.replace(/&(amp|quot|#39|lt|gt);/g, (_, entity) => ({ amp: '&', quot: '"', '#39': "'", lt: '<', gt: '>' })[entity]);

test('public guides build into bilingual routes with resolvable local links and offline diagram assets', async () => {
  const output = await fs.mkdtemp(path.join(os.tmpdir(), 'sensa-site-'));
  try {
    const manifest = await buildPages({ output, commit: 'site-unit-fixture' });
    assert.equal(manifest.commit, 'site-unit-fixture');
    assert.equal(Object.hasOwn(manifest.assets, 'download.html'), false, 'Downloads link directly to GitHub');
    assert.equal(manifest.routes.includes('download.html'), false);
    await assert.rejects(fs.stat(path.join(output, 'download.html')), { code: 'ENOENT' });
    for (const file of ['.github/pages/download.html', 'scripts/site-downloads.mjs'])
      await assert.rejects(fs.stat(new URL('../../' + file, import.meta.url)), { code: 'ENOENT' });
    for (const file of ['.github/pages/index.html', '.github/pages/site.js', 'scripts/build-pages.mjs',
      'README.md', 'README.zh-CN.md', 'README.en.md', 'docs/quick-start.md', 'docs/quick-start.en.md',
      'docs/development.md', 'docs/development.en.md']) {
      const source = await fs.readFile(new URL('../../' + file, import.meta.url), 'utf8');
      assert.doesNotMatch(source, /download\.html|[?&]asset=|SensaDownloads|sensa\.download\.|api\.github\.com\/repos\/SeaLoong\/Sensa\/releases/, file);
    }
    assert.ok((await fs.stat(path.join(output, '.nojekyll'))).isFile());
    assert.equal(Object.hasOwn(manifest.assets, '.nojekyll'), false);
    const assetNames = {};
    for (const extension of ['css', 'js']) {
      const file = await fs.readFile(new URL('../../.github/pages/site.' + extension, import.meta.url));
      const bytes = file;
      const digest = createHash('sha256').update(bytes).digest('hex');
      const name = 'site.' + digest.slice(0, 16) + '.' + extension;
      assetNames[extension] = name;
      assert.equal(manifest.assets[name], digest);
      assert.deepEqual(await fs.readFile(path.join(output, name)), bytes);
      assert.deepEqual(await fs.readFile(path.join(output, 'site.' + extension)), bytes, 'Cached legacy HTML keeps a compatible asset');
    }
    for (const route of ['en/README.html', 'zh-CN/README.html', 'en/docs/osc-parameters.html', 'zh-CN/docs/osc-parameters.html',
      'en/unity/top.sealoong.sensa/README.html', 'zh-CN/unity/top.sealoong.sensa/README.html']) assert.ok(manifest.routes.includes(route), route);
    for (const route of ['index.html', ...manifest.routes]) {
      const html = await fs.readFile(path.join(output, route), 'utf8');
      assert.match(html, /<main/);
      assert.doesNotMatch(html, /download\.html|[?&]asset=|data-installer|download-status|download-more/);
      if (route !== 'index.html')
        assert.match(html, /<header>[\s\S]*?<a data-download="release" href="https:\/\/github\.com\/SeaLoong\/Sensa\/releases\/latest">/);
      assert.doesNotMatch(html, /(?:file:\/\/|[A-Z]:[\\/](?:Users|Code)|__(?:VPM|SITE)_[A-Z_]+__)/);
      const stylesheet = html.match(/<link rel="stylesheet" href="([^"]+)" onerror="([^"]+)">/);
      const script = html.match(/<script defer src="([^"]+)" onerror="([^"]+)">/);
      assert.ok(stylesheet, 'Versioned stylesheet: ' + route);
      assert.ok(script, 'Versioned script: ' + route);
      for (const [extension, tag] of [['css', stylesheet], ['js', script]]) {
        const asset = new URL(tag[1], 'https://example.test/Sensa/' + route);
        assert.equal(asset.pathname, '/Sensa/' + assetNames[extension]);
        assert.equal(asset.search, '');
        const fallback = path.posix.relative(path.posix.dirname(route), 'site.' + extension);
        assert.ok(decodeAttribute(tag[2]).includes(JSON.stringify(fallback)), 'Fallback preserves document depth: ' + route);
      }
      if (route === 'index.html' || route === 'en/unity/top.sealoong.sensa/README.html') {
        const cssElement = { onerror: () => {}, href: stylesheet[1] };
        vm.runInNewContext('(function(){' + decodeAttribute(stylesheet[2]) + '}).call(element)', { element: cssElement });
        assert.equal(cssElement.onerror, null);
        assert.equal(new URL(cssElement.href, 'https://example.test/Sensa/' + route).pathname, '/Sensa/site.css');
        for (const readyState of ['loading', 'complete']) {
          const element = { onerror: () => {} }, loaded = [], events = new Map();
          const document = { readyState, createElement: name => { assert.equal(name, 'script'); return {}; },
            head: { append: item => loaded.push(item) },
            addEventListener: (name, handler, options) => { assert.equal(options.once, true); events.set(name, handler); } };
          vm.runInNewContext('(function(){' + decodeAttribute(script[2]) + '}).call(element)', { element, document });
          assert.equal(element.onerror, null);
          if (readyState === 'loading') { assert.equal(loaded.length, 0); events.get('DOMContentLoaded')(); }
          assert.equal(loaded.length, 1);
          assert.equal(new URL(loaded[0].src, 'https://example.test/Sensa/' + route).pathname, '/Sensa/site.js');
          assert.equal(loaded[0].onerror, undefined, 'The fallback has no retry loop');
        }
      }
      for (const match of html.matchAll(/(?:href|src|srcset)="([^"]+)"/g)) {
        const url = new URL(match[1].replaceAll('&amp;', '&'), 'https://example.test/Sensa/' + route);
        if (url.origin === 'https://example.test' || url.origin === 'https://sealoong.github.io')
          assert.equal(url.searchParams.has('lang'), false, 'Language-free navigation: ' + route);
        if (url.origin !== 'https://example.test') continue;
        const target = decodeURIComponent(url.pathname.replace(/^\/Sensa\//, ''));
        const info = await fs.stat(path.join(output, target));
        assert.ok(info.isFile() || info.isDirectory(), route + ' -> ' + target);
      }
    }
    const screenshotCatalog = JSON.parse(await fs.readFile(path.join(output, 'screenshots-manifest.json'), 'utf8'));
    const reviewedImages = new Map((screenshotCatalog.additionalImages || []).map(record => [record.file, record]));
    for (const scene of screenshotCatalog.scenes)
      for (const viewport of ['desktop', 'mobile'])
        for (const locale of ['en', 'zh-CN']) {
          const record = scene.images[viewport][locale]; reviewedImages.set(record.file, record);
        }
    for (const [route, desktop, mobile, alt] of [
      ['en/docs/quick-start.html', 'english-manual.png', 'english-manual.png', 'Manual controls in Sensa'],
      ['zh-CN/docs/quick-start.html', 'control-page.png', 'control-page.png', 'Sensa 实际运行界面'],
      ['en/docs/screenshots.html', 'computed-signal-editor-en-US.png', 'computed-signal-settings-en-US.png', 'Weighted calculation · desktop'],
      ['zh-CN/docs/screenshots.html', 'computed-signal-editor-zh-CN.png', 'computed-signal-settings-zh-CN.png', '加权计算 · 桌面'],
      ['en/docs/computed-signals.html', 'computed-signal-input-en-US.png', 'computed-signal-input-en-US.png', 'A calculation input with OSC path and weight'],
      ['zh-CN/docs/signal-pipeline.html', 'recording-controls.png', 'recording-controls.png', 'L0 录制面板'],
    ]) {
      const html = await fs.readFile(path.join(output, route), 'utf8');
      assert.ok(html.includes('<picture class="doc-screenshot"><source media="(max-width:760px)" srcset="../../media/docs/screenshots/mobile/'
        + mobile + '"><img src="../../media/docs/screenshots/desktop/' + desktop + '" alt="' + alt + '"></picture>'), route);
      assert.ok(html.includes('href="https://github.com/SeaLoong/Sensa/blob/main/docs/screenshots/mobile/' + mobile + '"'), 'Keep existing original-image links: ' + route);
      for (const file of ['desktop/' + desktop, 'mobile/' + mobile])
        assert.equal(manifest.assets['media/docs/screenshots/' + file], reviewedImages.get(file).sha256);
    }
    const overview = await fs.readFile(path.join(output, 'en/README.html'), 'utf8');
    for (const picture of overview.matchAll(/<picture\b[\s\S]*?<\/picture>/g))
      assert.equal(picture[0].includes('badge.svg'), false, 'Workflow badges retain their original markup');
    for (const workflow of ['ci', 'e2e', 'pages', 'release'])
      assert.ok(overview.includes('<img src="https://github.com/SeaLoong/Sensa/actions/workflows/' + workflow + '.yml/badge.svg"'));
    const packageGuide = await fs.readFile(path.join(output, 'en/unity/top.sealoong.sensa/README.html'), 'utf8');
    assert.match(packageGuide, /href="\.\.\/\.\.\/docs\/ogb-compatibility\.html"/);
    assert.doesNotMatch(packageGuide, /href="https:\/\/github\.com\/SeaLoong\/Sensa\/blob\/main\/docs\/ogb-compatibility\.en\.md"/);
    for (const locale of ['en', 'zh-CN']) {
      const downloadGuide = await fs.readFile(path.join(output, locale + '/docs/quick-start.html'), 'utf8');
      const article = downloadGuide.match(/<article>([\s\S]*?)<\/article>/)[1];
      assert.match(article, /href="https:\/\/github\.com\/SeaLoong\/Sensa\/releases\/latest"/);
      assert.doesNotMatch(article, /data-download=/, 'The guide contains ordinary release links');
      for (const format of ['win-x64-Setup.exe', 'win-x64-SingleFile.exe', 'win-x64.zip', 'linux-x64.tar.gz', 'osx-arm64.tar.gz'])
        assert.ok(downloadGuide.includes(format), 'Download format: ' + locale + ' ' + format);
      assert.ok(downloadGuide.indexOf('win-x64-Setup.exe') < downloadGuide.indexOf('win-x64-SingleFile.exe'), 'Installer is the first Windows choice');
      const calculations = await fs.readFile(path.join(output, locale + '/docs/computed-signals.html'), 'utf8');
      for (const operation of ['PointDistance', 'PlaneDepth', 'PlaneOffset', 'PlaneDepthFromAxes', 'PlaneOffsetFromAxes', 'VectorAngle', 'PlaneAngle'])
        assert.ok(calculations.includes('<code>' + operation + '</code>'), 'Spatial operation: ' + locale + ' ' + operation);
      const unity = await fs.readFile(path.join(output, locale + '/docs/unity-build.html'), 'utf8');
      assert.ok(unity.includes('<code>SensaTrackingFrame.prefab</code>'));
      assert.ok(unity.includes('<code>SensaTrackingFrame</code>'));
    }
    const guide = await fs.readFile(path.join(output, 'en/docs/guide.html'), 'utf8');
    const translatedGuide = await fs.readFile(path.join(output, 'zh-CN/docs/guide.html'), 'utf8');
    assert.equal((guide.match(/class="nav-group"/g) || []).length, 3);
    assert.match(guide, /<input type="search" data-guide-filter autocomplete="off">/);
    assert.match(guide, /<span>Find a guide<\/span>/);
    assert.match(translatedGuide, /<span>查找文档<\/span>/);
    assert.match(guide, /class="doc-breadcrumb"/);
    assert.doesNotMatch(guide, /Skip to content \/ 跳到正文/);
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
    assert.match(homepage, /Keep the movement\.\s+<br>Use it again\./, 'Narrow screens retain the space when the line break is hidden');
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
  const document = { documentElement: {}, body: { hasAttribute: name => name === 'data-home', dataset: { vpm: 'false' } },
    getElementById: name => elements[name],
    querySelectorAll: selector => ({ '[data-en]': [english], '[data-zh]': [chinese], '[data-doc]': [recording],
      '[data-label-en]': [label], '[data-diagram]': [] })[selector] || [] };
  vm.runInNewContext(source, { document, URL, location: new URL('https://example.test/Sensa/'),
    navigator: { languages: ['fr-FR'], language: 'fr-FR' },
    sessionStorage: { getItem() { throw new Error('Unavailable'); }, setItem() { throw new Error('Unavailable'); } },
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

test('homepage uses the tab or browser language and removes legacy language query parameters', async () => {
  const source = await fs.readFile(new URL('../../.github/pages/site.js', import.meta.url), 'utf8');
  for (const sample of [
    { saved: 'zh-CN', browser: ['en-US'], expected: 'zh-CN' },
    { saved: 'en-US', browser: ['zh-CN'], expected: 'en-US' },
    { saved: 'de-DE', browser: ['fr-FR', 'zh-TW'], expected: 'zh-CN' },
    { browser: ['fr-FR', 'en-GB'], expected: 'en-US' },
    { browser: ['fr-FR'], expected: 'en-US' },
  ]) {
    const values = new Map(sample.saved ? [['sensa.locale', sample.saved]] : []), events = new Map(), diagram = {};
    const location = new URL('https://example.test/Sensa/?lang=zh-CN&keep=1#start');
    const elements = { language: { addEventListener: (name, action) => events.set(name, action) },
      vcc: {}, 'copy-vpm': { addEventListener() {} }, 'vpm-status': {} };
    const document = { documentElement: {}, body: { hasAttribute: name => name === 'data-home', dataset: {} },
      getElementById: name => elements[name], querySelectorAll: selector => selector === '[data-diagram]' ? [diagram] : [] };
    let persistentReads = 0;
    vm.runInNewContext(source, { URL, document, location, navigator: { languages: sample.browser, language: sample.browser[0] },
      sessionStorage: { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) },
      localStorage: { getItem: () => { persistentReads++; return 'zh-CN'; } },
      history: { replaceState: (_, __, target) => { location.href = target.href; } } });
    assert.equal(document.documentElement.lang, sample.expected);
    assert.equal(persistentReads, 0);
    assert.equal(location.search, '?keep=1'); assert.equal(location.hash, '#start');
    assert.equal(diagram.href, 'parameter-geometry.html');
    events.get('click')();
    assert.equal(values.get('sensa.locale'), sample.expected === 'en-US' ? 'zh-CN' : 'en-US');
    assert.equal(location.search, '?keep=1'); assert.equal(location.hash, '#start');
  }
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
  const events = new Map(), clicks = new Map(), storage = new Map([['sensa.locale', 'zh-CN']]);
  const link = { href: 'https://example.test/Sensa/zh-CN/docs/guide.html',
    dataset: { locale: 'zh-CN', headingMap: JSON.stringify({ first: '开始' }) },
    addEventListener: (name, action) => clicks.set(name, action) };
  const wide = { scrollWidth: 900, clientWidth: 300, tabIndex: 0, firstElementChild: {} };
  const narrow = { scrollWidth: 299, clientWidth: 300, tabIndex: 0, firstElementChild: {} };
  const observed = [];
  vm.runInNewContext(source, { URL, location, navigator: { languages: ['en-US'], language: 'en-US' },
    sessionStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    document: { documentElement: { lang: 'en-US' }, body: { hasAttribute: () => false },
      querySelectorAll: selector => selector === '[data-locale]' ? [link] : selector === '.doc-scroll' ? [wide, narrow] : [],
      fonts: { ready: Promise.resolve() } },
    window: { addEventListener: (name, action) => events.set(name, action) },
    matchMedia: () => ({ matches: false }),
    ResizeObserver: class { observe(node) { observed.push(node); } },
  });
  await Promise.resolve();
  assert.equal(storage.get('sensa.locale'), 'en-US', 'The explicit guide language carries into homepage and explorer navigation');
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
