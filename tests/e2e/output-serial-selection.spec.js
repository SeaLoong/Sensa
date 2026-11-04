import { test, expect } from '@playwright/test';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { buildPages } from '../../scripts/build-pages.mjs';
import { controlWorkspace, inputActivation, manualMotion, openWorkbench } from './websensa-workbench.js';

let server, directory, base;
const pageErrors = [], requests = [];
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };

test.beforeAll(async () => {
  if (process.env.SENSA_SITE_DIRECTORY) directory = path.resolve(process.env.SENSA_SITE_DIRECTORY);
  else {
    await fs.mkdir('artifacts/e2e', { recursive: true });
    directory = await fs.mkdtemp(path.resolve('artifacts/e2e/serial-selection-'));
    await buildPages({ output: directory, commit: process.env.SENSA_SOURCE_COMMIT || process.env.GITHUB_SHA });
  }
  server = http.createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost');
    requests.push(url.pathname);
    if (!url.pathname.startsWith('/Sensa/')) { response.writeHead(404).end(); return; }
    const name = decodeURIComponent(url.pathname.slice('/Sensa/'.length)) || 'index.html';
    const file = path.resolve(directory, name.endsWith('/') ? name + 'index.html' : name);
    if (!file.startsWith(directory + path.sep)) { response.writeHead(403).end(); return; }
    try {
      response.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
      response.end(await fs.readFile(file));
    } catch { response.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = 'http://127.0.0.1:' + server.address().port;
});

test.beforeEach(({ page }) => {
  pageErrors.length = 0;
  requests.length = 0;
  page.on('pageerror', error => pageErrors.push(error.message));
});

test.afterEach(async ({}, info) => {
  const backendRequests = requests.filter(endpoint => /^\/(?:Sensa\/)?(?:api|ws)(?:\/|$)/.test(endpoint));
  await info.attach('browser-serial-static-host.json', { body: JSON.stringify({ pageErrors, backendRequests }), contentType: 'application/json' });
  expect(pageErrors, 'Browser JavaScript errors / 浏览器 JavaScript 错误').toEqual([]);
  expect(backendRequests, 'Static WebSensa does not require a backend / 静态 WebSensa 无需后端').toEqual([]);
});

test.afterAll(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});

async function installMockSerial(page, { authorized = ['first', 'chosen'], deferred = false } = {}) {
  await page.addInitScript(({ authorized: initiallyAuthorized, deferred: waitForSelection }) => {
    const state = { events: [], authorized: [...initiallyAuthorized], deferred: waitForSelection, hardwareExecution: false };
    globalThis.websensaSerialFixture = state;
    const ports = Object.fromEntries(['first', 'chosen'].map((id, index) => {
      let opened = false;
      return [id, {
        getInfo: () => ({ usbVendorId: 0x1234, usbProductId: index + 1 }),
        writable: { getWriter: () => ({
          async write(bytes) {
            if (!opened) throw new Error('Mock serial port is closed');
            state.events.push({ type: 'write', id, text: new TextDecoder().decode(bytes) });
          },
          releaseLock() { state.events.push({ type: 'release', id }); },
        }) },
        async open(options) { opened = true; state.events.push({ type: 'open', id, ...options }); },
        async close() { opened = false; state.events.push({ type: 'close', id }); },
      }];
    }));
    Object.defineProperty(navigator, 'serial', { configurable: true, value: {
      async getPorts() { return state.authorized.map(id => ports[id]); },
      async requestPort() {
        state.events.push({ type: 'choose', id: 'chosen' });
        if (state.deferred) await new Promise(resolve => { state.completeSelection = resolve; });
        if (!state.authorized.includes('chosen')) state.authorized.push('chosen');
        return ports.chosen;
      },
    } });
  }, { authorized, deferred });
}

async function newSerialOutput(page) {
  await openWorkbench(page, base + '/Sensa/websensa/?lang=en');
  await controlWorkspace(page);
  await page.getByTestId('output-type').selectOption('TCodeSerial');
  await page.getByTestId('add-output').click();
  const dialog = page.getByRole('dialog', { name: 'Output settings', exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}

test('WebSensa serial picker saves and writes to the chosen non-first port / 串口选择器保存并写入用户选中的非首端口',
  { tag: ['@config', '@transport', '@site'] }, async ({ page }, info) => {
    await installMockSerial(page);
    const dialog = await newSerialOutput(page);
    const serial = dialog.getByLabel('Serial port', { exact: true });
    const chosenId = await serial.locator('option').filter({ hasText: 'USB 1234:2' }).getAttribute('value');
    const firstId = await serial.locator('option').filter({ hasText: 'USB 1234:1' }).getAttribute('value');
    expect(chosenId).toMatch(/^webserial-/);
    expect(chosenId).not.toBe(firstId);
    await expect(serial).toHaveValue(firstId);
    await expect(serial.locator('option[value=""]')).toHaveText('Choose serial port');
    await dialog.getByRole('button', { name: 'Choose serial port', exact: true }).click();
    await expect(serial).toHaveValue(chosenId);
    await dialog.getByLabel('Name', { exact: true }).fill('Chosen serial target');
    await dialog.getByRole('button', { name: 'Save output', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    const card = page.locator('.output-card').filter({ has: page.getByRole('heading', { name: 'Chosen serial target', exact: true }) });
    await expect(card.getByTestId('serial-target')).toContainText(chosenId);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('sensa.web.configuration.v1')).outputs);
    expect(saved.find(output => output.name === 'Chosen serial target').comPort).toBe(chosenId);
    await card.getByRole('button', { name: 'Enable', exact: true }).click();
    await expect(card.locator('.output-identity').getByText('Connected', { exact: true })).toBeVisible();
    await manualMotion(page, 'L0', 730);
    await inputActivation(page).check();
    await expect.poll(() => page.evaluate(() => globalThis.websensaSerialFixture.events.some(event =>
      event.type === 'write' && event.id === 'chosen' && /L0\d+/.test(event.text)))).toBe(true);
    await inputActivation(page).uncheck();
    await expect.poll(() => page.evaluate(() => globalThis.websensaSerialFixture.events.some(event =>
      event.type === 'write' && event.id === 'chosen' && event.text === 'DSTOP\n'))).toBe(true);
    const fixture = await page.evaluate(() => ({ events: globalThis.websensaSerialFixture.events,
      hardwareExecution: globalThis.websensaSerialFixture.hardwareExecution }));
    expect(fixture.events.filter(event => event.type === 'choose')).toHaveLength(1);
    expect(fixture.events.some(event => event.id === 'first' && ['open', 'write'].includes(event.type))).toBe(false);
    await info.attach('browser-serial-selection.json', { body: JSON.stringify({ firstId, chosenId, saved, ...fixture }), contentType: 'application/json' });
  });

test('a pending browser serial picker cannot change a reopened draft for the same output / 延迟串口选择不能覆盖同一输出的新草稿',
  { tag: ['@config', '@site'] }, async ({ page }) => {
    await installMockSerial(page, { authorized: [], deferred: true });
    const dialog = await newSerialOutput(page);
    await expect(dialog.getByLabel('Serial port', { exact: true })).toHaveValue('COM3');
    await expect(dialog.getByLabel('Serial port', { exact: true }).locator('option:checked')).toHaveText('COM3 · Currently unavailable');
    await expect(dialog.getByLabel('Serial port', { exact: true }).locator('option[value=""]')).toHaveText('No serial ports detected');
    await dialog.getByRole('button', { name: 'Choose serial port', exact: true }).click();
    await expect.poll(() => page.evaluate(() => typeof globalThis.websensaSerialFixture.completeSelection)).toBe('function');
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await page.locator('.output-card').getByRole('button', { name: 'Configure', exact: true }).click();
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('Name', { exact: true }).fill('Fresh serial draft');
    await page.evaluate(() => globalThis.websensaSerialFixture.completeSelection());
    // The new option proves that the pending picker's refresh completed before
    // checking that its old captured draft was left untouched.
    await expect(dialog.getByLabel('Serial port', { exact: true }).locator('option').filter({ hasText: 'USB 1234:2' })).toHaveCount(1);
    await expect(dialog.getByLabel('Serial port', { exact: true })).toHaveValue('COM3');
    await expect(dialog.getByLabel('Name', { exact: true })).toHaveValue('Fresh serial draft');
    await dialog.getByRole('button', { name: 'Save output', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('sensa.web.configuration.v1')).outputs);
    expect(saved.find(output => output.name === 'Fresh serial draft').comPort).toBe('COM3');
  });
