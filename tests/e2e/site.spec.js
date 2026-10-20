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
