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

test('@site standalone Pages language, document navigation and independent geometry', async ({ page }, testInfo) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base + '?lang=en-US');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en-US');
  await expect(page.getByRole('heading', { name: 'From contact to control.' })).toBeVisible();
  if (await page.locator('body').getAttribute('data-vpm') === 'false') {
    await expect(page.locator('#vcc')).toBeHidden();
    await expect(page.locator('#vpm-status')).toContainText('No stable VPM');
  } else {
    await expect(page.locator('#vcc')).toBeVisible();
    await expect(page.locator('#vcc')).toHaveAttribute('href', 'vcc://vpm/addRepo?url=' + encodeURIComponent(new URL('vpm.json', base).href));
    await expect(page.locator('#vpm-status')).toContainText('Stable packages are available');
  }
  expect(await page.locator('body').evaluate(x => x.scrollWidth <= x.clientWidth)).toBe(true);
  await auditHome(page, testInfo, 'en-US');
  await page.screenshot({ path: testInfo.outputPath('pages-home-en.png'), fullPage: true });
  await page.getByRole('button', { name: '简体中文', exact: true }).click();
  await expect(page.getByRole('button', { name: 'English', exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await expect(page.locator('a[data-doc="docs/quick-start"]')).toHaveAttribute('href', /zh-CN\/docs\/quick-start.html$/);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await auditHome(page, testInfo, 'zh-CN');
  await page.screenshot({ path: testInfo.outputPath('pages-home-zh.png'), fullPage: true });
  await page.locator('a[data-doc="docs/quick-start"]').click();
  await expect(page).toHaveURL(/zh-CN\/docs\/quick-start.html$/);
  await expect(page.locator('article h1')).toBeVisible();
  expect(await page.locator('body').evaluate(x => x.scrollWidth <= x.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('pages-guide-zh.png'), fullPage: true });
  await page.locator('header [data-locale="en"]').click();
  await expect(page).toHaveURL(/en\/docs\/quick-start.html$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en-US');
  expect(await page.locator('body').evaluate(x => x.scrollWidth <= x.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('pages-guide-en.png'), fullPage: true });
  await page.locator('header a[href*="parameter-geometry.html"]').click();
  await expect(page.locator('#scene')).toBeVisible();
  await page.locator('#scene').selectOption('sensa-sps');
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
  const zhId = '3-检查手动方向和停止', enId = '3-check-manual-direction-and-stop';
  await page.goto(new URL('zh-CN/docs/quick-start.html#' + encodeURIComponent(zhId), base).href);
  const chinese = page.getByRole('heading', { name: '3. 检查手动方向和停止', exact: true });
  await expect(chinese).toHaveAttribute('id', zhId);
  await expect(chinese).toBeInViewport();
  const englishLink = page.locator('header [data-locale="en"]');
  await expect(englishLink).toHaveAttribute('href', new URL('en/docs/quick-start.html#' + enId, base).href);
  await englishLink.click();
  await expect(page).toHaveURL(new URL('en/docs/quick-start.html#' + enId, base).href);
  const english = page.getByRole('heading', { name: '3. Check manual direction and stop', exact: true });
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
