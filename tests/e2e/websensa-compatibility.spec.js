import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { WebSocketServer } from 'ws';
import { buildPages } from '../../scripts/build-pages.mjs';

let server, signalServer, sockets, directory, base, httpBase, sourceProof, runtimeBrowser;
const wire = [], requests = [], httpRequests = [], browserAssets = [], pageErrors = [];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.txt': 'text/plain' };

test.beforeAll(async () => {
  if (process.env.GITHUB_ACTIONS !== 'true') throw new Error('Browser compatibility acceptance is Actions-only');
  const source = process.env.SENSA_SOURCE_COMMIT || process.env.GITHUB_SHA;
  expect(source).toMatch(/^[a-f0-9]{40}$/);
  if (process.env.SENSA_SITE_DIRECTORY) directory = path.resolve(process.env.SENSA_SITE_DIRECTORY);
  else {
    await fs.mkdir('artifacts/e2e', { recursive: true });
    directory = await fs.mkdtemp(path.resolve('artifacts/e2e/webcompat-'));
    await buildPages({ output: directory, commit: source });
  }
  const manifestBytes = await fs.readFile(path.join(directory, 'site-manifest.json'));
  const manifest = JSON.parse(manifestBytes);
  expect(manifest.commit).toBe(source);
  const html = await fs.readFile(path.join(directory, 'websensa/index.html'));
  const names = [...html.toString().matchAll(/(?:src|href)="\.\/([^"?#]+)"/g)].map(match => match[1]);
  expect(names.filter(name => /^app\.bundle\.[a-f0-9]{16}\.js$/.test(name))).toHaveLength(1);
  expect(names.filter(name => /^app\.bundle\.[a-f0-9]{16}\.css$/.test(name))).toHaveLength(1);
  const assets = await Promise.all(names.map(async name => {
    expect(name).toMatch(/^[A-Za-z0-9_.-]+$/);
    const bytes = await fs.readFile(path.join(directory, 'websensa', name));
    return { path: 'websensa/' + name, sha256: hash(bytes), bytes: bytes.length };
  }));
  sourceProof = { schema: 1, sourceCommit: source, runId: process.env.GITHUB_RUN_ID, attempt: process.env.GITHUB_RUN_ATTEMPT,
    repository: process.env.GITHUB_REPOSITORY, siteManifestSha256: hash(manifestBytes), htmlSha256: hash(html), assets,
    siteDirectoryReused: Boolean(process.env.SENSA_SITE_DIRECTORY), backendUsed: false, hardwareUsed: false,
    scope: 'Compatibility behavior of these exact static bytes; this does not replace the complete Chromium comparison gate.' };
  const serve = async (request, response) => {
    try {
      const pathname = new URL(request.url, 'http://fixture').pathname;
      requests.push(pathname);
      if (pathname === '/signal') {
        httpRequests.push({ method: request.method, origin: request.headers.origin || '' });
        response.setHeader('Access-Control-Allow-Origin', '*');
        response.setHeader('Access-Control-Allow-Headers', 'Content-Type,X-Sensa-Session');
        response.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
        if (request.method === 'OPTIONS') { response.writeHead(204).end(); return; }
        if (request.method !== 'POST') { response.writeHead(405).end(); return; }
        let data = ''; for await (const bytes of request) { data += bytes; if (data.length > 65536) throw new Error('Oversized fixture request'); }
        wire.push({ transport: 'http', body: JSON.parse(data) }); response.writeHead(204).end(); return;
      }
      if (!pathname.startsWith('/Sensa/')) { response.writeHead(404).end(); return; }
      let name = decodeURIComponent(pathname.slice('/Sensa/'.length));
      if (!name || name.endsWith('/')) name += 'index.html';
      const file = path.resolve(directory, name);
      if (!file.startsWith(directory + path.sep)) { response.writeHead(403).end(); return; }
      response.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
      response.end(await fs.readFile(file));
    } catch { response.writeHead(400).end(); }
  };
  server = http.createServer(serve); signalServer = http.createServer(serve);
  sockets = new WebSocketServer({ noServer: true });
  server.on('upgrade', (request, socket, head) => {
    if (request.url !== '/device') { socket.destroy(); return; }
    sockets.handleUpgrade(request, socket, head, peer => peer.on('message', (bytes, binary) => {
      wire.push({ transport: 'ws', binary, text: bytes.toString() });
    }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = 'http://127.0.0.1:' + server.address().port;
  await new Promise(resolve => signalServer.listen(0, '127.0.0.1', resolve));
  httpBase = 'http://127.0.0.1:' + signalServer.address().port;
});

test.beforeEach(async ({ page, browserName, browser }) => {
  runtimeBrowser = { name: browserName, version: browser.version() };
  wire.length = 0; requests.length = 0; httpRequests.length = 0; browserAssets.length = 0; pageErrors.length = 0;
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('response', response => {
    const url = new URL(response.url());
    if (url.origin === base && /^\/Sensa\/websensa\/app\.bundle\.[a-f0-9]{16}\.(?:css|js)$/.test(url.pathname))
      browserAssets.push(response.body().then(bytes => ({ path: url.pathname.slice('/Sensa/'.length), sha256: hash(bytes) })));
  });
});
test.afterEach(async ({}, info) => {
  try {
    const actualAssets = await Promise.all(browserAssets);
    await info.attach('webcompat-source.json', { body: JSON.stringify({ ...sourceProof,
      project: info.project.name, browser: runtimeBrowser.name, browserVersion: runtimeBrowser.version,
      viewport: info.project.use.viewport, testId: info.testId, browserAssets: actualAssets }), contentType: 'application/json' });
    await info.attach('webcompat-wire.json', { body: JSON.stringify({ wire, httpRequests, pageErrors, backendRequests: requests.filter(url => /^\/api(?:\/|$)/.test(url)) }), contentType: 'application/json' });
    for (const expected of sourceProof.assets) expect(actualAssets).toContainEqual({ path: expected.path, sha256: expected.sha256 });
    expect(pageErrors).toEqual([]);
  } finally {
    for (const peer of sockets.clients) peer.terminate();
  }
});
test.afterAll(async () => {
  if (sockets) await new Promise(resolve => sockets.close(resolve));
  for (const listener of [server, signalServer])
    if (listener) { listener.closeAllConnections(); await new Promise(resolve => listener.close(resolve)); }
});

async function open(page, query = '?lang=en') {
  await page.goto(base + '/Sensa/websensa/' + query);
  await expect(page.getByRole('heading', { name: 'Put signals to work' })).toBeVisible();
}
async function addOutput(page, type, endpoint) {
  await page.getByRole('tab', { name: /^Outputs/ }).click();
  await page.getByLabel('Output type', { exact: true }).selectOption(type);
  await page.getByLabel('Endpoint URL', { exact: true }).fill(endpoint);
  await page.getByRole('button', { name: 'Connect output', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Connect output', exact: true })).toBeEnabled();
  await expect(page.getByRole('alert')).toHaveCount(0);
}
async function setRange(locator, value) {
  await locator.evaluate((element, next) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(element, String(next));
    element.dispatchEvent(new Event('input', { bubbles: true })); element.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

// The same two cases also run in the ordinary Chromium suite and Pages checks.
test('@site @webcompat WebSensa manual and scripts reach real WS/HTTP mock connections and stop', async ({ page }, info) => {
  await open(page);
  await addOutput(page, 'tcode-ws', base.replace('http:', 'ws:') + '/device');
  await addOutput(page, 'http', httpBase + '/signal');
  await expect(page.getByText('2 connected', { exact: true })).toBeVisible();
  expect(wire.filter(item => item.transport === 'ws' && item.text.startsWith('L0'))).toHaveLength(0);
  expect(wire.filter(item => item.transport === 'http' && item.body.type === 'signal')).toHaveLength(0);
  await page.getByRole('tab', { name: /^Control/ }).click();
  await setRange(page.getByLabel('L0 Stroke'), 67);
  await page.getByLabel('Input enabled', { exact: true }).click();
  await expect(page.getByLabel('Input enabled', { exact: true })).toBeChecked();
  await expect.poll(() => wire.some(item => item.transport === 'ws' && item.text === 'L06699\n')).toBe(true);
  await expect.poll(() => wire.some(item => item.transport === 'http' && item.body.type === 'signal' && item.body.values?.L0 === .67)).toBe(true);
  await page.getByRole('button', { name: 'Script', exact: true }).click();
  await expect(page.getByLabel('Input enabled', { exact: true })).not.toBeChecked();
  const beforePlay = wire.filter(item => item.transport === 'http' && item.body.type === 'signal').length;
  await page.getByLabel('Funscript file', { exact: true }).setInputFiles({ name: 'compatibility.funscript', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ actions: [{ at: 0, pos: 80 }, { at: 10000, pos: 20 }] })) });
  await expect(page.getByText(/0\.00 s \/ 10\.00 s · 80%/)).toBeVisible();
  expect(wire.filter(item => item.transport === 'http' && item.body.type === 'signal')).toHaveLength(beforePlay);
  await page.getByLabel('Input enabled', { exact: true }).click();
  await expect(page.getByLabel('Input enabled', { exact: true })).toBeChecked();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await expect.poll(() => wire.filter(item => item.transport === 'http' && item.body.type === 'signal').length).toBeGreaterThan(beforePlay + 2);
  await expect.poll(() => new Set(wire.filter(item => item.transport === 'http' && item.body.type === 'signal').slice(beforePlay).map(item => item.body.values.L0)).size).toBeGreaterThan(1);
  await expect.poll(() => wire.filter(item => item.transport === 'ws' && item.text.startsWith('L0')).length).toBeGreaterThan(3);
  await page.getByRole('button', { name: 'Emergency stop', exact: true }).click();
  await expect(page.getByLabel('Input enabled', { exact: true })).not.toBeChecked();
  await expect.poll(() => wire.filter(item => item.transport === 'ws').at(-1)?.text).toBe('DSTOP\n');
  await expect.poll(() => wire.filter(item => item.transport === 'http').at(-1)?.body.type).toBe('stop');
  const sent = wire.filter(item => item.transport === 'http' && item.body.type === 'signal').length;
  await page.getByRole('button', { name: 'Clear stop', exact: true }).click();
  await expect(page.getByLabel('Input enabled', { exact: true })).not.toBeChecked();
  await expect.poll(() => page.getByRole('button', { name: 'Play', exact: true }).isDisabled()).toBe(true);
  expect(wire.filter(item => item.transport === 'http' && item.body.type === 'signal')).toHaveLength(sent);
  expect(requests.filter(url => /^\/api(?:\/|$)/.test(url))).toEqual([]);
  expect(httpRequests.some(request => request.method === 'OPTIONS' && request.origin === base)).toBe(true);
  await info.attach('webcompat-manual-script-' + info.project.name, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
});

test('@site @webcompat WebSensa detects missing platform APIs and keeps accessible bilingual network alternatives', async ({ page }, info) => {
  await page.addInitScript(() => {
    for (const name of ['serial', 'bluetooth', 'requestMIDIAccess']) Object.defineProperty(navigator, name, { configurable: true, value: undefined });
    if (new URL(location.href).searchParams.has('http-only')) Object.defineProperty(window, 'WebSocket', { configurable: true, value: undefined });
  });
  const evidence = [];
  for (const [language, label, headings] of [['en', 'Language', ['Control', 'Outputs', 'Help']], ['zh-CN', '语言', ['控制', '输出', '使用帮助']]]) {
    await page.goto(base + '/Sensa/websensa/?lang=' + language);
    await expect(page.locator('html')).toHaveAttribute('lang', language === 'en' ? 'en-US' : 'zh-CN');
    const control = page.getByRole('tab', { name: new RegExp('^' + headings[0]) });
    await control.focus(); await control.press('ArrowRight');
    const outputs = page.getByRole('tab', { name: new RegExp('^' + headings[1]) });
    await expect(outputs).toBeFocused(); await expect(outputs).toHaveAttribute('aria-selected', 'true');
    const select = page.getByLabel(language === 'en' ? 'Output type' : '输出类型', { exact: true });
    for (const type of ['serial', 'bluetooth', 'midi']) await expect(select.locator(`option[value="${type}"]`)).toBeDisabled();
    for (const type of ['intiface', 'tcode-ws', 'json-ws', 'http']) await expect(select.locator(`option[value="${type}"]`)).toBeEnabled();
    const features = await page.evaluate(() => ({ webSocket: typeof WebSocket, fetch: typeof fetch,
      serial: typeof navigator.serial?.requestPort, bluetooth: typeof navigator.bluetooth?.requestDevice,
      midi: typeof navigator.requestMIDIAccess, secureContext: isSecureContext,
      pageFits: document.documentElement.scrollWidth <= innerWidth + 1 }));
    expect(features).toMatchObject({ webSocket: 'function', fetch: 'function', serial: 'undefined', bluetooth: 'undefined', midi: 'undefined', pageFits: true });
    await select.selectOption('http');
    await expect(page.getByRole('button', { name: language === 'en' ? 'Connect output' : '连接输出', exact: true })).toBeEnabled();
    await expect(page.getByLabel(label, { exact: true })).toBeVisible();
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    await info.attach('webcompat-axe-' + language + '.json', { body: JSON.stringify(axe, null, 2), contentType: 'application/json' });
    expect(axe.violations).toEqual([]);
    await outputs.press('ArrowRight');
    await expect(page.getByRole('tab', { name: new RegExp('^' + headings[2]) })).toBeFocused();
    evidence.push({ language, features, axeViolations: axe.violations.length, keyboardTabs: true });
  }
  await open(page, '?lang=en&http-only=1');
  await page.getByRole('tab', { name: /^Outputs/ }).click();
  const fallback = page.getByRole('button', { name: 'Use JSON HTTP', exact: true });
  await expect(fallback).toBeVisible();
  await expect(page.getByRole('button', { name: 'Connect output', exact: true })).toBeDisabled();
  await fallback.click();
  await expect(page.getByLabel('Output type', { exact: true })).toHaveValue('http');
  await page.getByLabel('Endpoint URL', { exact: true }).fill(httpBase + '/signal');
  await page.getByRole('button', { name: 'Connect output', exact: true }).click();
  await expect(page.getByText('1 connected', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: /^Control/ }).click();
  await setRange(page.getByLabel('L0 Stroke'), 25);
  await page.getByLabel('Input enabled', { exact: true }).click();
  await expect.poll(() => wire.some(item => item.transport === 'http' && item.body.type === 'signal' && item.body.values?.L0 === .25)).toBe(true);
  await page.getByRole('button', { name: 'Emergency stop', exact: true }).click();
  await expect.poll(() => wire.filter(item => item.transport === 'http').at(-1)?.body.type).toBe('stop');
  expect(httpRequests.some(request => request.method === 'OPTIONS' && request.origin === base)).toBe(true);
  await info.attach('webcompat-capabilities.json', { body: JSON.stringify({ evidence, httpFallbackUsed: true, devicePermissionRequests: false }), contentType: 'application/json' });
  await info.attach('webcompat-fallback-' + info.project.name, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
});
