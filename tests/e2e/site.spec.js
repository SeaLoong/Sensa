import { test as baseTest, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { buildPages } from '../../scripts/build-pages.mjs';

// Standalone 3D gets the same software backend as offline guide tests.
// 独立站点三维复用离线图解的软件渲染配置，不改变应用fixture。
const test = baseTest.extend({
  launchOptions: [{ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }, { scope: 'worker', option: true }],
});
let server, base, directory;
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.txt': 'text/plain' };
test.beforeAll(async () => {
  if (process.env.SENSA_SITE_DIRECTORY) directory = path.resolve(process.env.SENSA_SITE_DIRECTORY);
  else {
    const parent = path.resolve('artifacts/e2e');
    await fs.mkdir(parent, { recursive: true });
    directory = await fs.mkdtemp(path.join(parent, 'site-'));
    await buildPages({ output: directory });
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
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base + '?lang=en-US');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en-US');
  await expect(page.getByRole('heading', { name: /Make your signals\s*work together\./ })).toBeVisible();
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
  await auditHome(page, testInfo, 'en-US');
  const homeEn = await page.screenshot({ path: testInfo.outputPath('pages-home-en.png'), fullPage: true });
  await testInfo.attach('homepage-en-US', { body: homeEn, contentType: 'image/png' });
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
  await page.goto(base + '?lang=en-US');
  await page.getByRole('button', { name: '简体中文', exact: true }).click();
  await expect(page.getByRole('button', { name: 'English', exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
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
  await auditHome(page, testInfo, 'zh-CN');
  const homeZh = await page.screenshot({ path: testInfo.outputPath('pages-home-zh.png'), fullPage: true });
  await testInfo.attach('homepage-zh-CN', { body: homeZh, contentType: 'image/png' });
  await expect(heroFirstRunGuide).toHaveAccessibleName('首次使用指南');
  await heroFirstRunGuide.click();
  await expect(page).toHaveURL(/zh-CN\/docs\/quick-start.html$/);
  await expect(page.locator('article h1')).toBeVisible();
  expect(await page.locator('body').evaluate(x => x.scrollWidth <= x.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('pages-guide-zh.png'), fullPage: true });
  await inspectOverview(page, testInfo, 'zh-CN');
  await page.goto(new URL('zh-CN/docs/quick-start.html', base).href);
  await page.locator('header [data-locale="en"]').click();
  await expect(page).toHaveURL(/en\/docs\/quick-start.html$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en-US');
  expect(await page.locator('body').evaluate(x => x.scrollWidth <= x.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('pages-guide-en.png'), fullPage: true });
  await inspectOverview(page, testInfo, 'en');
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
  await expect(page.locator('article a[href="https://github.com/vrchat/packages/releases/tag/3.10.6-beta.2"]').first()).toBeVisible();
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
});
test('@site language priority, unsupported preferences and Chinese variants', async ({ browser }, testInfo) => {
  const cases = [
    { browser: 'fr-FR', expected: 'en-US' },
    { browser: 'zh-TW', expected: 'zh-CN' },
    { browser: 'fr-FR', saved: 'zh-CN', expected: 'zh-CN' },
    { browser: 'zh-TW', saved: 'zh-CN', requested: 'en-US', expected: 'en-US' },
    { browser: 'fr-FR', saved: 'zh-CN', requested: 'en-!!!', expected: 'zh-CN' },
    { browser: 'zh-TW', saved: 'en-!!!', expected: 'zh-CN' },
    { browser: 'en-US', saved: 'en-US', requested: ' ZH_tw ', expected: 'zh-CN' },
  ];
  for (const sample of cases) {
    const context = await browser.newContext({ locale: sample.browser, viewport: testInfo.project.use.viewport });
    try {
      if (sample.saved) await context.addInitScript(value => localStorage.setItem('sensa.locale', value), sample.saved);
      const page = await context.newPage();
      await page.goto(base + (sample.requested ? '?lang=' + encodeURIComponent(sample.requested) : ''));
      await expect(page.locator('html'), JSON.stringify(sample)).toHaveAttribute('lang', sample.expected);
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
