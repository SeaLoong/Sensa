import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { buildPages, localPublishedToolLink, mapDocumentHeadings } from '../../scripts/build-pages.mjs';
import { documentDiagramAssets } from '../../scripts/site-diagrams.mjs';
import { overviewTaskLinks } from '../e2e/site-overview-contracts.js';

const decodeAttribute = value => value.replace(/&(amp|quot|#39|lt|gt);/g, (_, entity) => ({ amp: '&', quot: '"', '#39': "'", lt: '<', gt: '>' })[entity]);

test('public guides build into bilingual routes with resolvable local links and offline diagram assets', async () => {
  const output = await fs.mkdtemp(path.join(os.tmpdir(), 'sensa-site-'));
  try {
    const manifest = await buildPages({ output, commit: 'site-unit-fixture' });
    assert.equal(manifest.commit, 'site-unit-fixture');
    for (const locale of ['en', 'zh-CN']) {
      const route = locale + '/docs/features.html';
      for (const [published, target] of [['parameter-geometry.html', 'parameter-geometry.html'], ['websensa/', 'websensa/index.html'], ['websensa/index.html', 'websensa/index.html']]) {
        const local = localPublishedToolLink('https://sealoong.github.io/Sensa/' + published + '?input=explorer#controls', route);
        assert.equal(local, '../../' + target + '?input=explorer#controls', 'Shared tool query and fragment survive local publishing');
      }
    }
    assert.equal(localPublishedToolLink('https://example.org/Sensa/parameter-geometry.html?input=explorer#controls', 'en/docs/features.html'), null, 'Unrelated origins remain external');
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
      if (route !== 'index.html' && !/^(?:en|zh-CN)\/index\.html$/.test(route))
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
        assert.equal(url.hostname === 'sealoong.github.io' && url.pathname === '/Sensa/parameter-geometry.html', false,
          'Published explorer links stay on the tested/offline site origin: ' + route);
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
    for (const locale of ['en', 'zh-CN']) {
      const html = await fs.readFile(path.join(output, locale + '/README.html'), 'utf8');
      const article = html.match(/<article>([\s\S]*?)<\/article>/)[1];
      for (const { name, href } of overviewTaskLinks(locale)) {
        const links = [...article.matchAll(/<a href="([^"]+)">([^<]+)<\/a>/g)].filter(link => link[2] === name);
        assert.equal(links.length, 1, locale + ' overview has one task link: ' + name);
        assert.equal(decodeAttribute(links[0][1]), href, locale + ' overview task destination: ' + name);
      }
    }
    const packageGuide = await fs.readFile(path.join(output, 'en/unity/top.sealoong.sensa/README.html'), 'utf8');
    assert.match(packageGuide, /href="\.\.\/\.\.\/docs\/ogb-compatibility\.html"/);
    assert.doesNotMatch(packageGuide, /href="https:\/\/github\.com\/SeaLoong\/Sensa\/blob\/main\/docs\/ogb-compatibility\.en\.md"/);
    for (const locale of ['en', 'zh-CN']) {
      const downloadGuide = await fs.readFile(path.join(output, locale + '/docs/quick-start.html'), 'utf8');
      const article = downloadGuide.match(/<article>([\s\S]*?)<\/article>/)[1];
      assert.match(article, /href="https:\/\/github\.com\/SeaLoong\/Sensa\/releases\/latest"/);
      assert.doesNotMatch(article, /data-download=/, 'The guide contains ordinary release links');
      if (locale === 'zh-CN')
        for (const label of ['OSR／SR6／TCode', 'VRChat／SPS', '手动'])
          assert.ok(article.includes('<strong>' + label + '</strong>：'), 'First-run device/source labels render as emphasis: ' + label);
      const installReference = await fs.readFile(path.join(output, locale + '/docs/features.html'), 'utf8');
      const installArticle = installReference.match(/<article>([\s\S]*?)<\/article>/)[1];
      const explorerLink = installArticle.match(/<a href="([^"]*parameter-geometry\.html[^"]*)">/);
      assert.ok(explorerLink, 'Feature reference links to the shared explorer: ' + locale);
      const explorerUrl = new URL(decodeAttribute(explorerLink[1]), 'https://example.test/Sensa/' + locale + '/docs/features.html');
      assert.equal(explorerUrl.origin, 'https://example.test', 'Explorer inherits the document session on the same origin');
      assert.equal(explorerUrl.pathname, '/Sensa/parameter-geometry.html');
      assert.match(installArticle, /<a href="https:\/\/github\.com\/SeaLoong\/Sensa\/releases\/latest">/, 'The install reference offers a direct download without JavaScript');
      assert.doesNotMatch(installArticle, /data-download=/, 'The install reference keeps an ordinary release link');
      const referenceAnchor = locale === 'en' ? 'configuration-and-development' : '配置与开发';
      assert.ok([...article.matchAll(/href="features\.html#([^"]+)"/g)].some(match => decodeURIComponent(match[1]) === referenceAnchor), 'The first-run guide links to install format details: ' + locale);
      for (const format of ['win-x64-Setup.exe', 'win-x64-SingleFile.exe', 'win-x64.zip', 'linux-x64.tar.gz', 'osx-arm64.tar.gz'])
        assert.ok(installReference.includes(format), 'Download format reference: ' + locale + ' ' + format);
      assert.ok(installReference.indexOf('win-x64-Setup.exe') < installReference.indexOf('win-x64-SingleFile.exe'), 'Installer is the first Windows choice');
      const calculations = await fs.readFile(path.join(output, locale + '/docs/computed-signals.html'), 'utf8');
      for (const operation of ['PointDistance', 'PlaneDepth', 'PlaneOffset', 'PlaneDepthFromAxes', 'PlaneOffsetFromAxes', 'VectorAngle', 'PlaneAngle'])
        assert.ok(calculations.includes('<code>' + operation + '</code>'), 'Spatial operation: ' + locale + ' ' + operation);
      const unity = await fs.readFile(path.join(output, locale + '/docs/unity-build.html'), 'utf8');
      assert.ok(unity.includes('<code>SensaTrackingFrame.prefab</code>'));
      assert.ok(unity.includes('<code>SensaTrackingFrame</code>'));
      const landing = await fs.readFile(path.join(output, locale + '/docs/start.html'), 'utf8');
      assert.match(landing, /<body class="guide-landing" data-guide-landing>/);
      assert.doesNotMatch(landing, /<details class="navigation"|<aside/);
      assert.match(landing, /<article>[\s\S]*<ul>[\s\S]*<a href="quick-start\.html">/);
      for (const route of [locale + '/docs/start.html', locale + '/docs/devices.html', locale + '/docs/features.html', locale + '/index.html']) {
        assert.ok(manifest.routes.includes(route), route);
        const page = await fs.readFile(path.join(output, route), 'utf8');
        const primary = page.match(/<nav data-site-nav[^>]*>([\s\S]*?)<\/nav>/)?.[1];
        assert.ok(primary, 'Dedicated primary navigation: ' + route);
        for (const [key, target] of [['features', locale + '/docs/features.html'], ['devices', locale + '/docs/devices.html'], ['guides', locale + '/docs/start.html'], ['websensa', 'websensa/']]) {
          const link = primary.match(new RegExp('<a data-site-destination="' + key + '"[^>]*href="([^"]+)"'));
          assert.ok(link, route + ': ' + key);
          const destination = new URL(decodeAttribute(link[1]), 'https://example.test/Sensa/' + route);
          assert.equal(destination.pathname.replace(/index\.html$/, ''), '/Sensa/' + target.replace(/index\.html$/, ''));
          assert.equal(destination.hash, '', 'Primary navigation opens a real destination page');
        }
      }
      const localizedHome = await fs.readFile(path.join(output, locale + '/index.html'), 'utf8');
      assert.match(localizedHome, new RegExp('data-home-locale="' + locale + '"'));
      assert.doesNotMatch(localizedHome, /<base\b/);
      assert.ok(localizedHome.includes(locale === 'en' ? '<span data-en>Features</span>' : '<span data-zh>功能</span>'), 'Selected language is visible without JavaScript');
      assert.ok(localizedHome.includes(locale === 'en' ? '<span data-zh hidden>功能</span>' : '<span data-en hidden>Features</span>'), 'Other language is hidden in static HTML');
      const gallery = JSON.parse(localizedHome.match(/<script type="application\/json" id="screenshot-data">([^<]+)<\/script>/)[1]);
      assert.ok(localizedHome.includes('src="../' + gallery[0].images.desktop[locale].url + '"'), 'No-JS gallery starts in the explicit page language');
    }
    const guide = await fs.readFile(path.join(output, 'en/docs/guide.html'), 'utf8');
    const translatedGuide = await fs.readFile(path.join(output, 'zh-CN/docs/guide.html'), 'utf8');
    for (const locale of ['en', 'zh-CN']) {
      const localizedGuide = locale === 'en' ? guide : translatedGuide;
      assert.ok(manifest.routes.includes(locale + '/tools/protocol-bridge/README.html'));
      assert.ok(localizedGuide.includes('href="protocol-inputs.html"'));
      assert.ok(localizedGuide.includes('href="../tools/protocol-bridge/README.html"'));
      const protocolGuide = await fs.readFile(path.join(output, locale + '/docs/protocol-inputs.html'), 'utf8');
      assert.match(protocolGuide, /href="\.\.\/tools\/protocol-bridge\/README\.html"/);
      assert.doesNotMatch(protocolGuide, /href="https:\/\/github\.com\/SeaLoong\/Sensa\/blob\/main\/tools\/protocol-bridge\/README/);
    }
    const diagrams = await documentDiagramAssets();
    const diagramDigest = createHash('sha256').update(diagrams.content).digest('hex');
    const diagramName = 'document-diagrams.' + diagramDigest.slice(0, 16) + '.js';
    assert.equal(manifest.assets[diagramName], diagramDigest);
    assert.deepEqual(await fs.readFile(path.join(output, diagramName)), diagrams.content);
    assert.deepEqual(await fs.readFile(path.join(output, 'document-diagrams.js')), diagrams.content);
    assert.deepEqual(await fs.readFile(path.join(output, 'document-diagrams.LICENSE.txt')), diagrams.license);
    for (const locale of ['en', 'zh-CN']) for (const name of ['architecture', 'protocol-inputs']) {
      const html = await fs.readFile(path.join(output, locale + '/docs/' + name + '.html'), 'utf8');
      assert.match(html, /<figure class="doc-diagram" data-document-diagram/);
      assert.match(html, /<details class="doc-diagram-source" open>/);
      assert.ok(html.includes('src="../../' + diagramName + '"'));
      assert.match(html, /document-diagrams\.js/);
      assert.doesNotMatch(html, /<script[^>]+src="https?:/);
    }
    assert.doesNotMatch(guide, /<script[^>]+document-diagrams/);
    assert.doesNotMatch(await fs.readFile(path.join(output, 'index.html'), 'utf8'), /<script[^>]+document-diagrams/);
    assert.equal((guide.match(/class="nav-group"/g) || []).length, 3);
    for (const localizedGuide of [guide, translatedGuide]) {
      const referenceGroups = [...localizedGuide.matchAll(/<details class="nav-group" data-guide-group([^>]*)>([\s\S]*?)<\/details>/g)];
      assert.equal(referenceGroups.length, 2, 'Reference and development guides use native disclosures');
      assert.ok(referenceGroups.every(group => !/\bopen\b/.test(group[1])), 'Beginner guides keep technical groups closed');
    }
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
    for (const reference of [parameterGuide, developmentGuide]) {
      const activeGroups = [...reference.matchAll(/<details class="nav-group" data-guide-group([^>]*)>([\s\S]*?)<\/details>/g)].filter(group => group[2].includes('aria-current="page"'));
      assert.equal(activeGroups.length, 1);
      assert.match(activeGroups[0][1], /\bopen\b/, 'The current technical guide stays visible in its navigation group');
    }
    const review = await fs.readFile(path.join(output, 'en/docs/ui-visual-review.html'), 'utf8');
    const reviewSource = await fs.readFile(new URL('../../docs/ui-visual-review.en.md', import.meta.url), 'utf8');
    const pinned = reviewSource.match(/https:\/\/github\.com\/SeaLoong\/Sensa\/blob\/[0-9a-f]{7,40}\/[^)\s]+\.md/)?.[0];
    assert.ok(pinned, 'The research record retains a pinned Markdown reference');
    assert.ok(review.includes('href="' + pinned + '"'), 'Pinned research references stay external');
    assert.match(await fs.readFile(path.join(output, 'parameter-geometry.html'), 'utf8'), /name="sensa-site-root" content="\.\/"/);
    const files = Object.keys(manifest.assets).filter(x => x.startsWith('assets/'));
    assert.deepEqual(files.sort(), ['osc-parameter-reference.js', 'parameter-geometry-3d.js', 'parameter-geometry-3d.LICENSE.txt',
      'parameter-geometry-model.js', 'parameter-geometry-signal.js', 'parameter-geometry-style.css', 'parameter-geometry-view.js']
      .map(name => 'assets/' + name).sort());
    const standalone = await fs.readFile(path.join(output, 'websensa/index.html'), 'utf8');
    assert.match(standalone, /name="sensa-explorer-url" content="\.\.\/parameter-geometry.html"/);
    for (const match of standalone.matchAll(/(?:src|href)="\.\/([^"?#]+)"/g)) {
      assert.ok(Object.hasOwn(manifest.assets, 'websensa/' + match[1]), 'Standalone page dependency: ' + match[1]);
      assert.match(match[1], /^app\.bundle\.[0-9a-f]{16}\.(?:css|js)$/);
    }
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
    const hero = homepage.match(/<section class="hero"[\s\S]*?<\/section>/)?.[0];
    assert.ok(hero, 'The product purpose appears before the task choices and gallery');
    assert.match(hero, /<h1[^>]*><span data-en>Connect VRChat \/ SPS and funscripts to OSR and other interactive devices\.<\/span><span data-zh hidden>连接 VRChat \/ SPS 与 funscript，联动 OSR 等互动设备。<\/span><\/h1>/);
    const actions = hero.match(/<div id="downloads" class="actions">([\s\S]*?)<\/div>/)?.[1];
    assert.match(actions, /^<a class="button primary" data-download="release" href="https:\/\/github\.com\/SeaLoong\/Sensa\/releases\/latest">/);
    assert.match(actions, /Download Sensa[\s\S]*Open WebSensa/);
    assert.match(hero, /VRChat → Sensa → OSR/);
    const tasks = homepage.match(/<div class="entry-grid">([\s\S]*?)<\/section>/)?.[1];
    assert.deepEqual([...tasks.matchAll(/data-doc="([^"]+)"/g)].map(match => match[1]), ['docs/usage-scenarios', 'docs/guide', 'docs/websensa']);
    const advanced = homepage.match(/<details id="advanced" class="advanced-section">([\s\S]*?)<\/details>/)?.[1];
    assert.ok(advanced, 'Technical capabilities are available through a closed native disclosure');
    for (const capability of ['unity-heading', 'data-diagram', 'docs/computed-signals', 'docs/development', 'copy-vpm'])
      assert.ok(advanced.includes(capability), 'Technical capability remains discoverable: ' + capability);
    const visibleOverview = homepage.slice(0, homepage.indexOf('<details id="advanced"'));
    for (const section of ['outputs-heading', 'recording-heading', 'editions-heading', 'features-heading'])
      assert.ok(visibleOverview.includes('id="' + section + '"'), 'Core capability is visible without opening advanced reference: ' + section);
    assert.match(visibleOverview, /<div class="capability-grid">[\s\S]*DG-LAB[\s\S]*MQTT/);
    assert.match(visibleOverview, /<table>[\s\S]*<th scope="col">WebSensa<\/th>[\s\S]*No native UDP\/TCP listener/);
    assert.ok(homepage.indexOf('id="purpose-heading"') < homepage.indexOf('class="entry-grid"'));
    assert.ok(homepage.indexOf('class="entry-grid"') < homepage.indexOf('id="screenshot-image"'));
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
  assert.equal(document.title, 'Sensa — VRChat, SPS and funscripts for your devices');
  assert.equal(recording.href, 'https://example.test/Sensa/en/docs/signal-pipeline.html#record-and-inspect');
  assert.equal(label['aria-label'], 'Main navigation');
  callbacks.get('click')();
  assert.equal(document.documentElement.lang, 'zh-CN');
  assert.equal(document.title, 'Sensa — 连接 VRChat、SPS、funscript 与互动设备');
  assert.equal(english.hidden, true); assert.equal(chinese.hidden, false);
  assert.equal(recording.href, 'https://example.test/Sensa/zh-CN/docs/signal-pipeline.html#' + encodeURIComponent('录制与观察'));
  assert.equal(label['aria-label'], '主导航'); assert.equal(elements.language.textContent, 'English');
  assert.equal(elements.vcc.hidden, true); assert.equal(elements['copy-vpm'].hidden, true);
  callbacks.get('click')(); assert.equal(recording.href, 'https://example.test/Sensa/en/docs/signal-pipeline.html#record-and-inspect');
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
    assert.equal(diagram.href, 'https://example.test/Sensa/parameter-geometry.html');
    events.get('click')();
    assert.equal(values.get('sensa.locale'), sample.expected === 'en-US' ? 'zh-CN' : 'en-US');
    assert.equal(location.search, '?keep=1'); assert.equal(location.hash, '#start');
  }
  const events = new Map(), navigations = [], values = new Map([['sensa.locale', 'en-US']]);
  const location = new URL('https://example.test/Sensa/zh-CN/index.html#recording-heading');
  location.assign = target => navigations.push(target);
  const guide = { dataset: { doc: 'docs/start' } }, diagram = {};
  const scene = { id: 'manual', en: 'Manual', zh: '手动', images: { desktop: {
    en: { url: 'media/manual-en.png', width: 800, height: 600, language: 'en-US' },
    'zh-CN': { url: 'media/manual-zh.png', width: 800, height: 600, language: 'zh-CN' },
  } } };
  const elements = { language: { addEventListener: (name, action) => events.set(name, action) },
    vcc: {}, 'copy-vpm': { addEventListener() {} }, 'vpm-status': {}, 'recording-heading': {},
    'screenshot-data': { textContent: JSON.stringify([scene]) }, 'screenshot-image': {}, 'screenshot-caption': {}, 'screenshot-original': {} };
  const document = { documentElement: {}, currentScript: { src: 'https://example.test/Sensa/site.1234.js' },
    body: { hasAttribute: name => name === 'data-home', dataset: { homeLocale: 'zh-CN', vpm: 'true' } },
    getElementById: name => elements[name], querySelectorAll: selector => selector === '[data-doc]' ? [guide] : selector === '[data-diagram]' ? [diagram] : [] };
  vm.runInNewContext(source, { URL, document, location, navigator: { languages: ['en-US'], language: 'en-US' },
    sessionStorage: { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) }, matchMedia: () => ({ matches: false }) });
  assert.equal(document.documentElement.lang, 'zh-CN', 'Explicit homepage language overrides tab/browser preferences');
  assert.equal(values.get('sensa.locale'), 'zh-CN', 'Explicit homepage language carries into WebSensa and the explorer');
  assert.equal(guide.href, 'https://example.test/Sensa/zh-CN/docs/start.html');
  assert.equal(diagram.href, 'https://example.test/Sensa/parameter-geometry.html');
  assert.equal(elements['screenshot-image'].src, 'https://example.test/Sensa/media/manual-zh.png');
  assert.equal(elements['screenshot-original'].href, elements['screenshot-image'].src);
  assert.equal(elements.vcc.href, 'vcc://vpm/addRepo?url=' + encodeURIComponent('https://example.test/Sensa/vpm.json'));
  events.get('click')();
  assert.equal(navigations[0], 'https://example.test/Sensa/en/index.html#recording-heading');
  location.hash = '#unknown'; events.get('click')();
  assert.equal(navigations[1], 'https://example.test/Sensa/en/index.html', 'Unknown fragments do not follow the language switch');
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

test('guide search reveals matching technical groups and restores the reader\'s disclosure choices', async () => {
  const source = await fs.readFile(new URL('../../.github/pages/site.js', import.meta.url), 'utf8');
  const beginner = { textContent: 'First run', hidden: false };
  const technical = { textContent: 'OSC parameter reference', hidden: false };
  const development = { textContent: 'Development', hidden: false };
  const group = (link, collapsible, open = false) => ({
    open, hidden: false, hasAttribute: name => name === 'data-guide-group' && collapsible,
    querySelectorAll: selector => selector === '[data-guide-link]' ? [link] : [],
  });
  const groups = [group(beginner, false), group(technical, true), group(development, true, true)];
  const empty = { hidden: true }, events = new Map();
  const navigation = { querySelectorAll: selector => selector === '[data-guide-link]' ? [beginner, technical, development] : groups,
    querySelector: selector => selector === '.guide-empty' ? empty : null };
  const input = { value: '', closest: selector => selector === '.navigation' ? navigation : null,
    addEventListener: (name, handler) => events.set(name, handler) };
  const filter = value => { input.value = value; events.get('input')(); };
  vm.runInNewContext(source, { URL, location: new URL('https://example.test/Sensa/en/docs/quick-start.html'),
    navigator: { languages: ['en-US'], language: 'en-US' }, sessionStorage: { getItem: () => null, setItem() {} },
    document: { documentElement: { lang: 'en-US' }, body: { hasAttribute: () => false },
      querySelectorAll: selector => selector === '[data-guide-filter]' ? [input] : [] },
    window: { addEventListener() {} }, matchMedia: () => ({ matches: false }),
  });
  filter('  OSC  ');
  assert.equal(beginner.hidden, true);
  assert.equal(technical.hidden, false);
  assert.equal(groups[1].open, true, 'A matching technical guide is visible inside its native disclosure');
  assert.equal(groups[2].hidden, true);
  assert.equal(empty.hidden, true);
  filter('unmatched');
  assert.equal(groups.every(item => item.hidden), true);
  assert.equal(empty.hidden, false);
  filter('');
  assert.equal(groups.every(item => !item.hidden), true);
  assert.equal(groups[1].open, false, 'Search restores a previously closed group');
  assert.equal(groups[2].open, true, 'Search restores a previously open group');
  assert.equal(empty.hidden, true);
  groups[1].open = true;
  filter('development'); filter('');
  assert.equal(groups[1].open, true, 'A later search preserves the reader\'s updated choice');
});
