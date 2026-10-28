import { test as baseTest, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { buildPages } from '../../scripts/build-pages.mjs';

// Standalone 3D gets the same software backend as offline guide tests.
// 独立站点三维复用离线图解的软件渲染配置，不改变应用fixture。
const test = baseTest.extend({
  launchOptions: [{ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }, { scope: 'worker', option: true }],
});
let server, base, directory;
const latestRelease = 'https://github.com/SeaLoong/Sensa/releases/latest';
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.txt': 'text/plain' };
test.beforeAll(async () => {
  if (process.env.SENSA_SITE_DIRECTORY) directory = path.resolve(process.env.SENSA_SITE_DIRECTORY);
  else {
    const parent = path.resolve('artifacts/e2e');
    await fs.mkdir(parent, { recursive: true });
    directory = await fs.mkdtemp(path.join(parent, 'site-'));
    await buildPages({ output: directory, commit: process.env.SENSA_SOURCE_COMMIT || process.env.GITHUB_SHA });
  }
  server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost');
      if (!url.pathname.startsWith('/Sensa/')) { response.writeHead(404).end(); return; }
      let name = decodeURIComponent(url.pathname.slice('/Sensa/'.length));
      if (!name || name.endsWith('/')) name += 'index.html';
      const file = path.resolve(directory, name);
      if (!file.startsWith(directory + path.sep)) { response.writeHead(403).end(); return; }
      response.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
      response.end(await fs.readFile(file));
    } catch { response.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = 'http://127.0.0.1:' + server.address().port + '/Sensa/';
});
test.afterAll(async () => { if (server) await new Promise(resolve => server.close(resolve)); });

async function captureSiteReview(page, info, name, images) {
  await page.evaluate(() => document.fonts.ready);
  const file = info.outputPath(name + '.png');
  const bytes = await page.screenshot({ path: file, fullPage: true });
  await info.attach(name, { path: file, contentType: 'image/png' });
  images.push({ attachment: name, sha256: createHash('sha256').update(bytes).digest('hex') });
}

async function inspectRunningScreenshots(page, info) {
  const image = page.locator('#screenshot-image');
  const scenes = page.locator('[data-screenshot-scene]');
  const catalog = JSON.parse(await fs.readFile(new URL('../../docs/screenshots/catalog.json', import.meta.url), 'utf8'));
  const locale = await page.locator('html').getAttribute('lang') === 'en-US' ? 'en' : 'zh-CN';
  const published = await (await page.request.get(base + 'screenshots-manifest.json')).json();
  expect(published).toEqual(catalog);
  await expect(scenes).toHaveCount(5);
  for (let index = 0; index < await scenes.count(); index++) {
    await scenes.nth(index).click();
    await expect(scenes.nth(index)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-screenshot-scene][aria-pressed=true]')).toHaveCount(1);
    expect(await scenes.nth(index).getAttribute('data-screenshot-scene')).toBe(catalog.scenes[index].id);
    for (const view of ['desktop', 'mobile']) {
      const button = page.locator(`[data-screenshot-view="${view}"]`);
      await button.click();
      await expect(button).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('[data-screenshot-view][aria-pressed=true]')).toHaveCount(1);
      const record = catalog.scenes[index].images[view][locale];
      await expect(image).toHaveAttribute('src', 'media/docs/screenshots/' + record.file);
      await expect.poll(() => image.evaluate(element => element.complete && element.naturalWidth > 0)).toBe(true);
      const title = locale === 'en' ? catalog.scenes[index].en : catalog.scenes[index].zh;
      const screen = locale === 'en' ? (view === 'desktop' ? 'Desktop' : 'Narrow') : (view === 'desktop' ? '桌面' : '窄屏');
      const language = record.language === 'en-US' ? 'English' : '简体中文';
      await expect(image).toHaveAttribute('alt', `${title} · ${screen} · ${language}`);
      await expect(page.locator('#screenshot-caption')).toHaveText(`${title} · ${screen} · ${language}`);
      const original = await page.locator('#screenshot-original').getAttribute('href');
      expect(original).toBe(await image.getAttribute('src'));
      expect(await page.locator('body').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    }
  }
  await scenes.first().click();
  await page.locator(`[data-screenshot-view="${info.project.name}"]`).click();
  await expect.poll(() => image.evaluate(element => element.complete && element.naturalWidth > 0)).toBe(true);
  await page.evaluate(() => scrollTo(0, 0));
}

async function inspectDocumentStyle(page) {
  await page.evaluate(() => document.fonts.ready);
  const scroll = await page.evaluate(() => ({ x: scrollX, y: scrollY }));
  const responsiveImages = [];
  for (const picture of await page.locator('article picture.doc-screenshot').all()) {
    const image = picture.locator('img');
    await image.scrollIntoViewIfNeeded();
    const expected = await picture.evaluate(element => {
      const source = [...element.querySelectorAll('source')].find(candidate => matchMedia(candidate.media).matches);
      return source ? new URL(source.getAttribute('srcset'), location.href).href : element.querySelector('img').src;
    });
    await expect.poll(() => image.evaluate(element => element.currentSrc)).toBe(expected);
    await image.evaluate(element => element.decode());
    responsiveImages.push({ expected, currentSrc: await image.evaluate(element => element.currentSrc) });
  }
  await page.evaluate(({ x, y }) => scrollTo(x, y), scroll);
  const evidence = await page.evaluate(() => {
    const layout = document.querySelector('.layout'), article = document.querySelector('article');
    const computed = getComputedStyle(layout);
    return { width: innerWidth, layout: computed.display, columns: computed.gridTemplateColumns,
      aside: getComputedStyle(layout.querySelector('aside')).display,
      font: getComputedStyle(article).fontFamily, header: getComputedStyle(document.querySelector('header')).display,
      pageFits: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
      css: [...document.querySelectorAll('link[rel=stylesheet]')].map(link => ({ href: link.href, loaded: Boolean(link.sheet) })),
      js: [...document.querySelectorAll('script[src]')].map(script => script.src),
      tables: [...document.querySelectorAll('.doc-scroll table')].map(table => ({
        display: getComputedStyle(table).display, overflow: getComputedStyle(table.parentElement).overflowX })),
      images: [...article.querySelectorAll('img')].filter(image => new URL(image.src).origin === location.origin)
        .map(image => ({ loaded: image.complete && image.naturalWidth > 0, width: image.getBoundingClientRect().width,
          articleWidth: article.getBoundingClientRect().width })),
    };
  });
  expect(evidence.header).toBe('flex');
  expect(evidence.font).toContain('sans-serif');
  expect(evidence.pageFits).toBe(true);
  expect(evidence.layout).toBe(evidence.width > 760 ? 'grid' : 'block');
  if (evidence.width > 1150) expect(evidence.columns.split(' ')).toHaveLength(3);
  if (evidence.width <= 1150) expect(evidence.aside).toBe('none');
  expect(evidence.css).toHaveLength(1);
  expect(evidence.css[0].loaded).toBe(true);
  expect(evidence.css[0].href).toMatch(/\/Sensa\/site\.[a-f0-9]{16}\.css$/);
  expect(evidence.js[0]).toMatch(/\/Sensa\/site\.[a-f0-9]{16}\.js$/);
  for (const table of evidence.tables) expect(table).toEqual({ display: 'table', overflow: 'auto' });
  for (const image of evidence.images) {
    expect(image.loaded).toBe(true);
    expect(image.width).toBeLessThanOrEqual(image.articleWidth + 1);
  }
  return { ...evidence, responsiveImages };
}

async function attachSiteReviewSource(info, images) {
  const file = path.join(directory, 'site-manifest.json');
  const bytes = await fs.readFile(file);
  const commit = process.env.SENSA_SOURCE_COMMIT || process.env.GITHUB_SHA;
  expect(JSON.parse(bytes).commit, 'site build uses the pinned E2E source').toBe(commit);
  await info.attach('site-review-manifest', { path: file, contentType: 'application/json' });
  const sourceFile = info.outputPath('site-review-source.json');
  await fs.writeFile(sourceFile, JSON.stringify({ schema: 1, commit,
    repository: process.env.GITHUB_REPOSITORY, runId: process.env.GITHUB_RUN_ID,
    attempt: process.env.GITHUB_RUN_ATTEMPT, project: info.project.name, testId: info.testId,
    siteManifestSha256: createHash('sha256').update(bytes).digest('hex'), images,
  }));
  await info.attach('site-review-source', { path: sourceFile, contentType: 'application/json' });
}

async function auditHome(page, info, language) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  // Full results preserve incomplete/manual-review evidence; this is not a compliance certificate.
  // 完整保留incomplete待审证据，不将零已检违规称为合规证书。
  await info.attach('pages-home-' + language + '-axe.json', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
  expect(result.violations, language + ' homepage detected violations').toEqual([]);
}

async function inspectWorkflowBadges(scope) {
  for (const [label, workflow] of [['CI', 'ci.yml'], ['E2E', 'e2e.yml'], ['Pages', 'pages.yml'], ['Release', 'release.yml']]) {
    const badge = scope.getByRole('link', { name: label, exact: true });
    await expect(badge).toHaveAttribute('href', 'https://github.com/SeaLoong/Sensa/actions/workflows/' + workflow);
    await expect(badge.getByRole('img', { name: label, exact: true })).toHaveAttribute('src',
      'https://github.com/SeaLoong/Sensa/actions/workflows/' + workflow + '/badge.svg');
  }
}

async function inspectFirstRunLinks(page, locale) {
  const links = page.locator('a[data-doc="docs/quick-start"]');
  await expect(links).toHaveCount(3);
  for (const link of await links.all()) {
    await expect(link).toHaveAttribute('href', locale + '/docs/quick-start.html');
  }
}

async function inspectHomeLayout(page, info, language) {
  await page.evaluate(() => document.fonts.ready);
  const layout = await page.locator('main.home').evaluate(home => {
    const rect = node => {
      const { left, right, top, bottom, width, height } = node.getBoundingClientRect();
      return { left, right, top, bottom, width, height };
    };
    const hero = home.querySelector('.hero');
    return {
      viewport: window.innerWidth, pageWidth: document.documentElement.clientWidth, home: rect(home),
      copy: rect(hero.querySelector('.hero-copy')), visual: rect(hero.querySelector('.hero-visual')),
      display: Object.fromEntries(['.hero', '.actions', '.package-section', '.package-actions'].map(selector =>
        [selector, getComputedStyle(home.querySelector(selector)).display])),
    };
  });
  expect(layout.display).toEqual({ '.hero': 'grid', '.actions': 'flex', '.package-section': 'grid', '.package-actions': 'flex' });
  expect(Math.abs(layout.home.left - (layout.pageWidth - layout.home.right)), 'centered homepage').toBeLessThan(1);
  if (layout.viewport > 760) {
    expect(layout.visual.left - layout.copy.right, 'desktop hero columns have space between them').toBeGreaterThanOrEqual(29);
    expect(Math.min(layout.copy.bottom, layout.visual.bottom) - Math.max(layout.copy.top, layout.visual.top),
      'desktop hero columns share the same row').toBeGreaterThan(0);
  } else {
    expect(layout.visual.top - layout.copy.bottom, 'narrow hero stacks the illustration below its copy').toBeGreaterThanOrEqual(27);
    expect(Math.abs(layout.copy.left - layout.visual.left), 'stacked hero left edges align').toBeLessThan(1);
    expect(Math.abs(layout.copy.width - layout.visual.width), 'stacked hero columns fill the same width').toBeLessThan(1);
  }
  const buttons = [];
  for (const button of await page.locator('.home .button:visible').all()) {
    await button.scrollIntoViewIfNeeded();
    const geometry = await button.evaluate(node => {
      const box = node.getBoundingClientRect();
      const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      const overlaps = [...document.querySelectorAll('.home .button')].some(other => {
        if (other === node || !other.getClientRects().length) return false;
        const otherBox = other.getBoundingClientRect();
        return Math.min(box.right, otherBox.right) > Math.max(box.left, otherBox.left)
          && Math.min(box.bottom, otherBox.bottom) > Math.max(box.top, otherBox.top);
      });
      return { label: node.innerText.trim(), display: getComputedStyle(node).display,
        width: box.width, height: box.height, centerHit: node === hit || node.contains(hit), overlaps };
    });
    expect(['flex', 'inline-flex'], geometry.label + ' flex action layout').toContain(geometry.display);
    expect(geometry.width, geometry.label + ' target width').toBeGreaterThanOrEqual(44);
    expect(geometry.height, geometry.label + ' target height').toBeGreaterThanOrEqual(44);
    expect(geometry.centerHit, geometry.label + ' center receives pointer events').toBe(true);
    expect(geometry.overlaps, geometry.label + ' target does not overlap another action').toBe(false);
    buttons.push(geometry);
  }
  expect(buttons.length, 'download, first-run and Unity setup actions are measured').toBeGreaterThanOrEqual(3);
  await info.attach('homepage-layout-' + language + '.json', {
    body: JSON.stringify({ ...layout, buttons }, null, 2), contentType: 'application/json',
  });
  await page.evaluate(() => window.scrollTo(0, 0));
}

async function inspectOverview(page, info, locale) {
  await page.goto(new URL(locale + '/README.html', base).href);
  const article = page.locator('article');
  await inspectWorkflowBadges(article);
  await expect(article.getByRole('link', { name: locale === 'en' ? 'Set up a flow' : '建立信号流程', exact: true }))
    .toHaveAttribute('href', 'docs/signal-pipeline.html');
  await expect(article).toContainText('DG-LAB');
  await expect(article).toContainText('MQTT');
  expect(await page.locator('body').evaluate(x => x.scrollWidth <= x.clientWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('pages-overview-' + locale + '.png'), fullPage: true });
}

test('@site standalone Pages language, document navigation and independent geometry', async ({ page }, testInfo) => {
  const errors = [];
  const reviewImages = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base);
  if (await page.locator('html').getAttribute('lang') !== 'en-US')
    await page.getByRole('button', { name: 'English', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en-US');
  await expect(page.getByRole('heading', { name: /Make your signals\s*work together\./ })).toBeVisible();
  const download = page.locator('#downloads a[data-download="release"]');
  await expect(download).toHaveCount(1);
  await expect(download).toHaveAccessibleName('Download');
  await expect(download).toHaveAttribute('href', latestRelease);
  await expect(page.locator('[data-installer], #download-status, .download-more')).toHaveCount(0);
  const heroFirstRunGuide = page.locator('.hero .actions a[data-doc="docs/quick-start"]');
  await expect(heroFirstRunGuide).toHaveCount(1);
  await expect(heroFirstRunGuide).toHaveAccessibleName('First-run guide');
  await inspectFirstRunLinks(page, 'en');
  await expect(page.locator('.entry-grid [data-doc="docs/signal-pipeline"]')).toHaveAttribute('href', /en\/docs\/signal-pipeline.html$/);
  await expect(page.locator('.entry-grid [data-doc="docs/guide"]')).toContainText('Connect and record');
  await expect(page.locator('.more-links [data-doc="docs/features"]')).toHaveAttribute('href', /en\/docs\/features.html$/);
  await expect(page.locator('.flow-preview > li')).toHaveCount(3);
  await expect(page.locator('.start-steps > li')).toHaveCount(3);
  await expect(page.locator('#start')).toContainText('http://127.0.0.1:5086');
  await expect(page.locator('.outputs-section')).toContainText('DG-LAB');
  await expect(page.locator('.outputs-section')).toContainText('MQTT');
  await expect(page.locator('.recording-section [data-doc]')).toHaveAttribute('href', /en\/docs\/signal-pipeline.html#record-and-inspect$/);
  await expect(page.locator('.documentation-links [data-doc="docs/computed-signals"]')).toHaveAttribute('href', /en\/docs\/computed-signals.html$/);
  await inspectWorkflowBadges(page.locator('.project-status'));
  if (await page.locator('body').getAttribute('data-vpm') === 'false') {
    await expect(page.locator('#vcc')).toBeHidden();
    await expect(page.locator('#vpm-status')).toContainText('No stable VPM');
  } else {
    await expect(page.locator('#vcc')).toBeVisible();
    await expect(page.locator('#vcc')).toHaveAttribute('href', 'vcc://vpm/addRepo?url=' + encodeURIComponent(new URL('vpm.json', base).href));
    await expect(page.locator('#vpm-status')).toContainText('Stable packages are available');
  }
  expect(await page.locator('body').evaluate(x => x.scrollWidth <= x.clientWidth)).toBe(true);
  await inspectHomeLayout(page, testInfo, 'en-US');
  await inspectRunningScreenshots(page, testInfo);
  await auditHome(page, testInfo, 'en-US');
  await captureSiteReview(page, testInfo, 'site-review-home-en-US', reviewImages);
  await page.locator('.entry-grid [data-doc="docs/signal-pipeline"]').click();
  await expect(page.getByRole('heading', { level: 1, name: 'Inputs, computation and outputs', exact: true })).toBeVisible();
  const navigation = page.locator('.navigation');
  const navigationToggle = navigation.locator('summary');
  const collapsibleNavigation = await navigationToggle.isVisible();
  if (collapsibleNavigation) {
    await expect(navigation).not.toHaveAttribute('open');
    await navigationToggle.click();
    await expect(navigation).toHaveAttribute('open', '');
  }
  const featuresLink = navigation.locator('a[href="features.html"]');
  await expect(featuresLink).toBeVisible();
  await expect(navigation.locator('.nav-group')).toHaveCount(3);
  const guideFilter = navigation.getByRole('searchbox', { name: 'Find a guide', exact: true });
  await guideFilter.fill('  CALCULATIONS  ');
  await expect(navigation.locator('[data-guide-link]:visible')).toHaveCount(1);
  await expect(navigation.getByRole('link', { name: 'Calculations', exact: true })).toBeVisible();
  await expect(guideFilter).toBeFocused();
  await guideFilter.fill('unmatched-guide-name');
  await expect(navigation.locator('[data-guide-link]:visible')).toHaveCount(0);
  await expect(navigation.getByRole('status')).toHaveText('No matching guide. Try a shorter name.');
  await guideFilter.clear();
  await expect(featuresLink).toBeVisible();
  await expect(navigation.getByRole('status')).toBeHidden();
  if (collapsibleNavigation) {
    await navigationToggle.click();
    await expect(navigation).not.toHaveAttribute('open');
    await expect(featuresLink).toBeHidden();
  }
  const originalViewport = page.viewportSize();
  await page.setViewportSize({ width: 600, height: originalViewport.height });
  await expect(navigationToggle).toBeVisible();
  await expect(navigation).not.toHaveAttribute('open');
  await page.setViewportSize({ width: 1200, height: originalViewport.height });
  await expect(navigation).toHaveAttribute('open', '');
  await expect(featuresLink).toBeVisible();
  await expect(navigationToggle).toBeHidden();
  await page.setViewportSize(originalViewport);
  await expect(page.getByRole('heading', { name: 'Record a manual track first', exact: true })).toBeVisible();
  await page.goto(base);
  if (await page.locator('html').getAttribute('lang') !== 'en-US')
    await page.getByRole('button', { name: 'English', exact: true }).click();
  await page.getByRole('button', { name: '简体中文', exact: true }).click();
  await expect(page.getByRole('button', { name: 'English', exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await expect(download).toHaveAccessibleName('下载');
  await expect(download).toHaveAttribute('href', latestRelease);
  await expect(page.locator('.entry-grid [data-doc="docs/signal-pipeline"]')).toHaveAttribute('href', /zh-CN\/docs\/signal-pipeline.html$/);
  await expect(page.locator('.entry-grid [data-doc="docs/guide"]')).toContainText('连接输出与录制');
  await expect(page.locator('.more-links [data-doc="docs/features"]')).toHaveAttribute('href', /zh-CN\/docs\/features.html$/);
  await expect(page.locator('#start')).toContainText('录下第一条轨道');
  await expect(page.locator('.recording-section [data-doc]')).toHaveAttribute('href',
    new RegExp('zh-CN/docs/signal-pipeline.html#' + encodeURIComponent('录制与观察') + '$'));
  await inspectFirstRunLinks(page, 'zh-CN');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await inspectHomeLayout(page, testInfo, 'zh-CN');
  await inspectRunningScreenshots(page, testInfo);
  await auditHome(page, testInfo, 'zh-CN');
  await captureSiteReview(page, testInfo, 'site-review-home-zh-CN', reviewImages);
  await expect(heroFirstRunGuide).toHaveAccessibleName('首次使用指南');
  await heroFirstRunGuide.click();
  await expect(page).toHaveURL(/zh-CN\/docs\/quick-start.html$/);
  await expect(page.locator('article h1')).toBeVisible();
  expect(await page.locator('body').evaluate(x => x.scrollWidth <= x.clientWidth)).toBe(true);
  await inspectDocumentStyle(page);
  await captureSiteReview(page, testInfo, 'site-review-guide-zh-CN', reviewImages);
  await inspectOverview(page, testInfo, 'zh-CN');
  await page.goto(new URL('zh-CN/docs/quick-start.html', base).href);
  await page.locator('header [data-locale="en"]').click();
  await expect(page).toHaveURL(/en\/docs\/quick-start.html$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en-US');
  expect(await page.locator('body').evaluate(x => x.scrollWidth <= x.clientWidth)).toBe(true);
  await inspectDocumentStyle(page);
  await captureSiteReview(page, testInfo, 'site-review-guide-en-US', reviewImages);
  await inspectOverview(page, testInfo, 'en');
  await page.goto(new URL('en/unity/top.sealoong.sensa/README.html', base).href);
  await inspectDocumentStyle(page);
  await page.goto(new URL('en/docs/quick-start.html', base).href);
  await page.locator('header a[href*="parameter-geometry.html"]').click();
  await expect(page.locator('#scene')).toBeVisible();
  await page.locator('#scene').selectOption('sensa-sps');
  await expect(page.locator('#scene-title')).toHaveText('SPS four-anchor tracking');
  await expect(page.locator('#path-prefix')).toHaveText('Sensa/SPS/*');
  await expect(page.locator('#three-scene')).toHaveAttribute('data-render-state', 'ready');
  await expect(page.locator('#three-scene canvas')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('pages-explorer-sps.png'), fullPage: true });
  await page.locator('#projection').selectOption('xz');
  await expect(page.locator('#values')).toContainText('P0');
  await expect(page.locator('a[href*="/docs/osc-parameters.html"]').first()).toHaveAttribute('href', /\/Sensa\/en\/docs\/osc-parameters.html$/);
  await page.locator('#scene').selectOption('contact-sdk');
  await expect(page.locator('#path-prefix')).toHaveText('Sensa/Contact/*');
  await expect(page.locator('#scene-title')).toHaveText('Contact direct tracking (SDK Beta)');
  await expect(page.locator('#three-scene')).toHaveAttribute('data-render-state', 'ready');
  await expect(page.locator('#values tr')).toHaveCount(12);
  await expect(page.locator('#values')).toContainText('Proximity_SenderVelocityMagnitude');
  await page.screenshot({ path: testInfo.outputPath('pages-explorer-contact.png'), fullPage: true });
  await page.goto(base + 'en/docs/contact-sdk.html');
  await expect(page.locator('article h1')).toHaveText('Contact direct tracking (SDK Beta)');
  await expect(page.locator('article a[href="https://github.com/vrchat/packages/releases/tag/3.10.6-beta.3"]').first()).toBeVisible();
  await expect(page.locator('article')).toContainText('advancedParameters');
  await expect(page.locator('article')).toContainText('_PointSeparation');
  const buildGuide = page.getByRole('link', { name: 'Unity build guide', exact: true });
  await expect(buildGuide).toBeVisible(); await buildGuide.click();
  await expect(page).toHaveURL(/\/en\/docs\/unity-build.html$/);
  await expect(page.locator('article h1')).toHaveText('Unity tracking components and build pipeline');
  await expect(page.locator('article')).toContainText('IEditorOnly');
  await expect(page.locator('article')).toContainText('BeforePlugin("nadena.dev.modular-avatar")');
  await expect(page.locator('article')).toContainText('-1026');
  await expect(page.locator('article a[href^="https://github.com/bdunderscore/modular-avatar/blob/"]').first()).toBeVisible();
  await expect(page.locator('article a[href^="https://github.com/VRCFury/vrcfury.com/blob/"]').first()).toBeVisible();
  expect(await page.locator('body').evaluate(x => x.scrollWidth <= x.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('pages-unity-build-en.png'), fullPage: true });
  await page.locator('header [data-locale="zh-CN"]').click();
  await expect(page).toHaveURL(/zh-CN\/docs\/unity-build.html$/);
  await expect(page.locator('article')).toContainText('构建顺序');
  await expect(page.locator('article')).toContainText('IEditorOnly');
  expect(await page.locator('body').evaluate(x => x.scrollWidth <= x.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('pages-unity-build-zh.png'), fullPage: true });
  expect(errors).toEqual([]);
  await attachSiteReviewSource(testInfo, reviewImages);
});
test('@site language priority, unsupported preferences and Chinese variants', async ({ browser }, testInfo) => {
  const cases = [
    { browser: 'fr-FR', expected: 'en-US' },
    { browser: 'zh-TW', expected: 'zh-CN' },
    { browser: 'fr-FR', saved: 'zh-CN', expected: 'zh-CN' },
    { browser: 'zh-TW', saved: 'zh-CN', requested: 'en-US', expected: 'zh-CN' },
    { browser: 'fr-FR', saved: 'zh-CN', requested: 'en-!!!', expected: 'zh-CN' },
    { browser: 'zh-TW', saved: 'en-!!!', expected: 'zh-CN' },
    { browser: 'en-US', saved: 'en-US', requested: ' ZH_tw ', expected: 'en-US' },
  ];
  for (const sample of cases) {
    const context = await browser.newContext({ locale: sample.browser, viewport: testInfo.project.use.viewport });
    try {
      if (sample.saved) await context.addInitScript(value => sessionStorage.setItem('sensa.locale', value), sample.saved);
      const page = await context.newPage();
      await page.goto(base + (sample.requested ? '?lang=' + encodeURIComponent(sample.requested) : ''));
      await expect(page.locator('html'), JSON.stringify(sample)).toHaveAttribute('lang', sample.expected);
      expect(new URL(page.url()).searchParams.has('lang')).toBe(false);
      expect(await page.locator('a[href*="lang="]').count()).toBe(0);
    } finally { await context.close(); }
  }
});

test('@site document language changes preserve the current section and discard unknown fragments', async ({ page }, info) => {
  const zhId = '3-启用输入并检查结果', enId = '3-enable-input-and-inspect-results';
  await page.goto(new URL('zh-CN/docs/quick-start.html#' + encodeURIComponent(zhId), base).href);
  const chinese = page.getByRole('heading', { name: '3. 启用输入并检查结果', exact: true });
  await expect(chinese).toHaveAttribute('id', zhId);
  await expect(chinese).toBeInViewport();
  const englishLink = page.locator('header [data-locale="en"]');
  await expect(englishLink).toHaveAttribute('href', new URL('en/docs/quick-start.html#' + enId, base).href);
  await englishLink.click();
  await expect(page).toHaveURL(new URL('en/docs/quick-start.html#' + enId, base).href);
  const english = page.getByRole('heading', { name: '3. Enable input and inspect results', exact: true });
  await expect(english).toHaveAttribute('tabindex', '-1');
  await expect(english).toBeInViewport();
  await page.locator('header [data-locale="zh-CN"]').click();
  await expect(page).toHaveURL(new URL('zh-CN/docs/quick-start.html#' + encodeURIComponent(zhId), base).href);
  await expect(chinese).toBeInViewport();

  await page.evaluate(() => { location.hash = 'unknown-section'; });
  await expect(englishLink).toHaveAttribute('href', new URL('en/docs/quick-start.html', base).href);
  await englishLink.click();
  await expect(page).toHaveURL(new URL('en/docs/quick-start.html', base).href);
  await expect(page.locator('article h1')).toBeInViewport();
  await info.attach('document-section-navigation.json', { body: JSON.stringify({
    chinese: zhId, english: enId, roundTripPreserved: true, unknownFragmentFallsBackToTop: true,
    viewport: page.viewportSize(),
  }), contentType: 'application/json' });
});

test('@site wide document tables and code remain keyboard scrollable at 320 pixels', async ({ page }, info) => {
  await page.setViewportSize({ width: 320, height: 800 });
  const evidence = [];
  for (const locale of ['zh-CN', 'en']) {
    const areas = [
      { kind: 'table', documentName: 'positioning', area: page.locator('.doc-scroll').filter({ has: page.locator('table') }).first(),
        label: locale === 'zh-CN' ? '表格；内容超宽时可横向滚动' : 'Table; scroll horizontally when needed' },
      { kind: 'code', documentName: 'development', area: page.locator('.doc-scroll').filter({ hasText: 'node scripts/benchmark-osc-preview.mjs --output artifacts/performance/osc-ranking.json' }).first(),
        label: locale === 'zh-CN' ? '代码示例；内容超宽时可横向滚动' : 'Code example; scroll horizontally when needed' },
    ];
    for (const { kind, documentName, area, label } of areas) {
      await page.goto(new URL(locale + '/docs/' + documentName + '.html', base).href);
      await page.evaluate(() => document.fonts.ready);
      await area.scrollIntoViewIfNeeded();
      await inspectDocumentStyle(page);
      await expect(area).toHaveAttribute('role', 'region');
      await expect(area).toHaveAttribute('aria-label', label);
      await expect(area).toHaveAttribute('tabindex', '0');
      expect(await area.evaluate(node => node.scrollWidth > node.clientWidth + 1)).toBe(true);
      await area.focus();
      await expect(area).toBeFocused();
      await area.press('ArrowRight');
      await expect.poll(() => area.evaluate(node => node.scrollLeft)).toBeGreaterThan(0);
      evidence.push({ locale, kind, ...await area.evaluate(node => ({
        scrollWidth: node.scrollWidth, clientWidth: node.clientWidth, scrollLeft: node.scrollLeft,
        focused: node === document.activeElement,
      })) });
      expect(await page.locator('body').evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    }
  }
  await info.attach('document-keyboard-scroll.json', { body: JSON.stringify(evidence), contentType: 'application/json' });
});


test('@site cached help pages recover when fingerprinted assets have expired', async ({ page }, info) => {
  const blocked = [], errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route(/\/site\.[a-f0-9]{16}\.(css|js)$/, async route => {
    blocked.push(route.request().url());
    await route.fulfill({ status: 404, body: 'Expired asset' });
  });
  await page.goto(new URL('en/unity/top.sealoong.sensa/README.html', base).href);
  await expect(page.locator('.layout')).toHaveCSS('display', info.project.name === 'mobile' ? 'block' : 'grid');
  await expect(page.locator('header')).toHaveCSS('display', 'flex');
  await expect(page.locator('link[rel=stylesheet]')).toHaveAttribute('href', '../../../site.css');
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem('sensa.locale'))).toBe('en-US');
  await expect(page.locator('script[src$="/site.js"]')).toHaveCount(1);
  await page.locator('header [data-locale="zh-CN"]').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await expect(page.locator('.layout')).toHaveCSS('display', info.project.name === 'mobile' ? 'block' : 'grid');
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem('sensa.locale'))).toBe('zh-CN');
  expect(blocked).toHaveLength(4);
  expect(errors).toEqual([]);
  await info.attach('help-assets-fallback.json', { body: JSON.stringify({ blocked, errors, recovered: true }), contentType: 'application/json' });
});

test('@site help screenshots switch between reviewed desktop and narrow captures', async ({ page }, info) => {
  const originalViewport = page.viewportSize(), evidence = [];
  for (const locale of ['en', 'zh-CN']) {
    await page.goto(new URL(locale + '/docs/screenshots.html', base).href);
    const suffix = locale === 'en' ? 'en-US' : 'zh-CN';
    const manualFile = locale === 'en' ? 'english-manual.png' : 'control-page.png';
    const manual = page.locator(`article picture img[src$="/desktop/${manualFile}"]`);
    const calculation = page.locator(`article picture img[src$="/desktop/computed-signal-editor-${suffix}.png"]`);
    for (const width of [1280, 390, 1280]) {
      await page.setViewportSize({ width, height: originalViewport.height });
      const state = await inspectDocumentStyle(page), viewport = width <= 760 ? 'mobile' : 'desktop';
      expect(await manual.evaluate(image => image.currentSrc)).toBe(new URL('media/docs/screenshots/' + viewport + '/' + manualFile, base).href);
      expect(await calculation.evaluate(image => image.currentSrc)).toBe(new URL('media/docs/screenshots/' + viewport + '/computed-signal-'
        + (viewport === 'mobile' ? 'settings-' : 'editor-') + suffix + '.png', base).href);
      expect(state.responsiveImages.length).toBeGreaterThanOrEqual(8);
      evidence.push({ locale, width, images: state.responsiveImages });
    }
  }
  await page.setViewportSize(originalViewport);
  await info.attach('document-responsive-images.json', { body: JSON.stringify(evidence, null, 2), contentType: 'application/json' });
});

test('@site local flowcharts render real readable SVG in both guide languages', async ({ page }, info) => {
  if (info.project.name === 'mobile') await page.setViewportSize({ width: 320, height: 844 });
  const external = [], errors = [], evidence = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== new URL(base).origin) { external.push(url.href); return route.abort(); }
    return route.continue();
  });
  for (const locale of ['en', 'zh-CN']) for (const [name, nodes] of [['protocol-inputs', 8], ['architecture', 20]]) {
    await page.goto(base + locale + '/docs/' + name + '.html');
    const figure = page.locator('[data-document-diagram]');
    await expect(figure).toHaveCount(1);
    await expect(figure).toHaveAttribute('data-diagram-state', 'rendered');
    const canvas = figure.locator('.doc-diagram-canvas'), graphic = canvas.locator('svg');
    await expect(graphic).toBeVisible();
    await expect(graphic).toHaveAttribute('role', 'img');
    await expect(graphic).toHaveAttribute('aria-label', locale === 'en' ? /^Flowchart:/ : /^流程图:/);
    await expect(graphic.locator('g.node')).toHaveCount(nodes);
    expect(await graphic.locator('path').count()).toBeGreaterThan(0);
    expect(await graphic.locator('text').count()).toBeGreaterThanOrEqual(nodes);
    await expect(figure.locator('.doc-diagram-source')).not.toHaveAttribute('open');
    await expect(figure.locator('.doc-diagram-status')).toBeHidden();
    const bounds = await graphic.evaluate(svg => {
      const view = svg.viewBox.baseVal;
      return { width: view.width, height: view.height, textBoxes: [...svg.querySelectorAll('g.node text')].map(text => ({
        width: text.getBBox().width, height: text.getBBox().height,
      })) };
    });
    expect(bounds.width).toBeGreaterThan(0);
    expect(bounds.height).toBeGreaterThan(0);
    expect(bounds.textBoxes.every(box => box.width > 0 && box.height > 0)).toBe(true);
    await canvas.scrollIntoViewIfNeeded();
    await expect(canvas).toHaveAttribute('tabindex', '0');
    expect(await canvas.evaluate(element => element.scrollWidth > element.clientWidth + 1)).toBe(true);
    await canvas.focus();
    await expect(canvas).toBeFocused();
    await canvas.press('ArrowRight');
    await expect.poll(() => canvas.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
    const scroll = await canvas.evaluate(element => ({ width: element.clientWidth, fullWidth: element.scrollWidth, left: element.scrollLeft }));
    expect(await page.locator('html').evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    const image = info.outputPath('flowchart-' + locale + '-' + name + '.png');
    await figure.screenshot({ path: image });
    await info.attach('flowchart-' + locale + '-' + name, { path: image, contentType: 'image/png' });
    await figure.locator('summary').click();
    await expect(figure.locator('.doc-diagram-source')).toHaveAttribute('open', '');
    await expect(figure.locator('.language-mermaid')).toContainText('flowchart LR');
    evidence.push({ locale, name, nodes, bounds, scroll });
  }
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
  await info.attach('flowchart-rendering.json', { body: JSON.stringify({ evidence, external, errors }, null, 2), contentType: 'application/json' });
});

test('@site flowchart source remains readable without JavaScript or when its local runtime is unavailable', async ({ browser }, info) => {
  const evidence = [];
  for (const mode of ['no-javascript', 'blocked-runtime']) {
    const context = await browser.newContext({ javaScriptEnabled: mode !== 'no-javascript', viewport: info.project.use.viewport });
    try {
      const page = await context.newPage();
      if (mode === 'blocked-runtime') await page.route('**/*', route => {
        const name = new URL(route.request().url()).pathname;
        return /\/document-diagrams(?:\.[a-f0-9]{16})?\.js$/.test(name) ? route.abort() : route.continue();
      });
      for (const locale of ['en', 'zh-CN']) for (const name of ['architecture', 'protocol-inputs']) {
        await page.goto(base + locale + '/docs/' + name + '.html');
        const figure = page.locator('[data-document-diagram]');
        await expect(figure.locator('.doc-diagram-source')).toHaveAttribute('open', '');
        await expect(figure.locator('.language-mermaid')).toBeVisible();
        await expect(figure.locator('.language-mermaid')).toContainText('flowchart LR');
        await expect(figure.locator('.doc-diagram-status')).toBeVisible();
        await expect(figure.locator('.doc-diagram-canvas')).toBeHidden();
        evidence.push({ mode, locale, name, sourceAvailable: true });
      }
    } finally { await context.close(); }
  }
  await info.attach('flowchart-fallback.json', { body: JSON.stringify(evidence, null, 2), contentType: 'application/json' });
});

test('@site unsafe flowchart source is rejected before image requests or callbacks execute', async ({ page }, info) => {
  const external = [];
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== new URL(base).origin) { external.push(url.href); return route.abort(); }
    if (url.pathname.endsWith('/en/docs/protocol-inputs.html')) {
      const response = await route.fetch();
      const original = await response.text();
      const payload = 'flowchart LR\n A[&lt;img src="https://diagram-payload.invalid/image" onerror="window.diagramPayload=true"&gt;] --> B\n';
      const body = original.replace(/(<code class="language-mermaid">)[\s\S]*?(<\/code>)/, '$1' + payload + '$2');
      expect(body).not.toBe(original);
      return route.fulfill({ response, body });
    }
    return route.continue();
  });
  await page.goto(base + 'en/docs/protocol-inputs.html');
  const figure = page.locator('[data-document-diagram]');
  await expect(figure).toHaveAttribute('data-diagram-state', 'error');
  await expect(figure.locator('.doc-diagram-canvas')).toBeHidden();
  await expect(figure.locator('.doc-diagram-source')).toHaveAttribute('open', '');
  await expect(figure.locator('.doc-diagram-status')).toContainText('could not be displayed');
  expect(await page.evaluate(() => Boolean(window.diagramPayload))).toBe(false);
  expect(external).toEqual([]);
  await info.attach('flowchart-unsafe-content.json', { body: JSON.stringify({ external, payloadExecuted: false }), contentType: 'application/json' });
});

test('@site downloads stay direct in both languages without JavaScript or remote services', async ({ browser }, info) => {
  const evidence = [];
  for (const javaScriptEnabled of [true, false]) {
    for (const locale of ['en-US', 'zh-CN']) {
      const context = await browser.newContext({ javaScriptEnabled, locale, viewport: info.project.use.viewport });
      const remoteRequests = [], navigation = [], errors = [];
      try {
        // Keep the site local, deny every remote dependency and intercept only the clicked destination.
        // 站点本地加载，阻断所有外部依赖，仅拦截点击后的 GitHub 目标页。
        await context.route('**/*', async route => {
          const url = route.request().url();
          if (url.startsWith(base)) return route.continue();
          remoteRequests.push(url);
          if (url === latestRelease && route.request().isNavigationRequest())
            return route.fulfill({ contentType: 'text/html', body: '<title>GitHub latest release</title><p>GitHub latest release</p>' });
          return route.abort('internetdisconnected');
        });
        const page = await context.newPage();
        page.on('pageerror', error => errors.push(error.message));
        page.on('request', request => {
          if (request.isNavigationRequest() && request.frame() === page.mainFrame()) navigation.push(request.url());
        });
        const clickDirectly = async link => {
          await expect(link).toHaveAttribute('href', latestRelease);
          await expect(link).not.toHaveAttribute('aria-disabled', 'true');
          navigation.length = 0;
          await link.click();
          await expect(page).toHaveURL(latestRelease);
          expect(navigation, 'One ordinary anchor navigation reaches GitHub directly').toEqual([latestRelease]);
        };
        await page.goto(base);
        const homeLanguage = javaScriptEnabled ? locale : 'en-US';
        await expect(page.locator('html')).toHaveAttribute('lang', homeLanguage);
        const download = page.locator('#downloads a[data-download="release"]');
        await expect(page.locator('#downloads a[data-download]')).toHaveCount(1);
        await expect(download).toHaveAccessibleName(homeLanguage === 'zh-CN' ? '下载' : 'Download');
        await expect(page.locator('#downloads a[data-doc="docs/quick-start"]')).toHaveCount(1);
        await expect(page.locator('[data-installer], #download-status, .download-more, a[href*="download.html"], a[href*="?asset="]')).toHaveCount(0);
        await clickDirectly(download);

        const routeLocale = locale === 'en-US' ? 'en' : 'zh-CN';
        for (const documentName of ['docs/quick-start', 'docs/development', 'README']) {
          await page.goto(base + routeLocale + '/' + documentName + '.html');
          const headerDownload = page.locator('header a[data-download="release"]');
          await expect(headerDownload).toHaveCount(1);
          await expect(headerDownload).toHaveAccessibleName(locale === 'zh-CN' ? '下载' : 'Download');
          await expect(headerDownload).toHaveAttribute('href', latestRelease);
          const articleDownloads = page.locator('article a[href="' + latestRelease + '"]');
          expect(await articleDownloads.count(), 'The guide has a plain link to the same latest release').toBeGreaterThan(0);
          await expect(page.locator('article [data-download], a[href*="download.html"], a[href*="?asset="]')).toHaveCount(0);
          if (documentName === 'docs/quick-start') {
            for (const format of ['win-x64-Setup.exe', 'win-x64-SingleFile.exe', 'win-x64.zip', 'linux-x64.tar.gz', 'osx-arm64.tar.gz'])
              await expect(page.locator('article')).toContainText(format);
          }
          await clickDirectly(articleDownloads.first());
          await page.goto(base + routeLocale + '/' + documentName + '.html');
          await clickDirectly(headerDownload);
        }
        expect(remoteRequests.filter(url => new URL(url).hostname === 'api.github.com'), 'Reading pages never queries the releases API').toEqual([]);
        expect(errors).toEqual([]);
        evidence.push({ javaScriptEnabled, locale, remoteDependenciesBlocked: true,
          destination: latestRelease, directNavigationVerified: true, errors });
      } finally { await context.close(); }
    }
  }
  await info.attach('download-links.json', { body: JSON.stringify(evidence), contentType: 'application/json' });
});
