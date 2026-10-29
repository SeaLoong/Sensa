import { test, expect } from '@playwright/test';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { WebSocketServer } from 'ws';
import { buildPages } from '../../scripts/build-pages.mjs';

let server, sockets, directory, base;
const commands = [], requests = [], connections = [];
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
test.beforeAll(async () => {
  if (process.env.SENSA_SITE_DIRECTORY) directory = path.resolve(process.env.SENSA_SITE_DIRECTORY);
  else {
    await fs.mkdir('artifacts/e2e', { recursive: true }); directory = await fs.mkdtemp(path.resolve('artifacts/e2e/websensa-'));
    await buildPages({ output: directory, commit: process.env.SENSA_SOURCE_COMMIT || process.env.GITHUB_SHA });
  }
  server = http.createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost');
    requests.push(url.pathname);
    if (url.pathname === '/sink') {
      response.setHeader('Access-Control-Allow-Origin', '*'); response.setHeader('Access-Control-Allow-Headers', 'Content-Type,X-Sensa-Session'); response.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
      if (request.method === 'OPTIONS') { response.writeHead(204).end(); return; }
      let body = ''; for await (const bytes of request) body += bytes;
      commands.push({ type: 'http', value: JSON.parse(body) }); response.writeHead(204).end(); return;
    }
    if (!url.pathname.startsWith('/Sensa/')) { response.writeHead(404).end(); return; }
    const name = decodeURIComponent(url.pathname.slice('/Sensa/'.length)) || 'index.html';
    const file = path.resolve(directory, name.endsWith('/') ? name + 'index.html' : name);
    if (!file.startsWith(directory + path.sep)) { response.writeHead(403).end(); return; }
    try { response.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream'); response.end(await fs.readFile(file)); }
    catch { response.writeHead(404).end(); }
  });
  sockets = new WebSocketServer({ noServer: true });
  server.on('upgrade', (request, socket, head) => sockets.handleUpgrade(request, socket, head, peer => {
    const endpoint = new URL(request.url, 'http://localhost').pathname;
    connections.push(endpoint);
    peer.on('message', bytes => {
      const value = bytes.toString();
      if (endpoint !== '/intiface') { commands.push({ type: endpoint.slice(1), value: endpoint === '/json' ? JSON.parse(value) : value }); if (endpoint === '/json') peer.send(JSON.stringify({ ok: true })); return; }
      const [type, body] = Object.entries(JSON.parse(value)[0])[0]; commands.push({ type: 'intiface', command: type, body });
      let reply = { Ok: { Id: body.Id } };
      if (type === 'RequestServerInfo') reply = { ServerInfo: { Id: body.Id, MessageVersion: 3, MaxPingTime: 1000 } };
      if (type === 'RequestDeviceList') reply = { DeviceList: { Id: body.Id, Devices: [
        { DeviceIndex: 0, DeviceName: 'Position device', DeviceMessages: { LinearCmd: [{ ActuatorType: 'Linear', FeatureDescriptor: 'Stroke' }] } },
        { DeviceIndex: 1, DeviceName: 'Vibration device', DeviceMessages: { ScalarCmd: [{ ActuatorType: 'Vibrate', FeatureDescriptor: 'Motor' }] } },
      ] } };
      peer.send(JSON.stringify([reply]));
    });
  }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = 'http://127.0.0.1:' + server.address().port;
});
test.beforeEach(() => { commands.length = 0; requests.length = 0; connections.length = 0; });
test.afterEach(() => { for (const socket of sockets.clients) socket.terminate(); });
test.afterAll(async () => { if (sockets) await new Promise(resolve => sockets.close(resolve)); if (server) await new Promise(resolve => server.close(resolve)); });
async function open(page) { await page.goto(base + '/Sensa/websensa/?lang=en'); await expect(page.getByRole('heading', { name: 'Put signals to work' })).toBeVisible(); }
async function outputPage(page) { await page.getByRole('tab', { name: /^Outputs/ }).click(); }
async function addOutput(page, type, endpoint) {
  await outputPage(page); await page.getByLabel('Output type').selectOption(type);
  if (endpoint) await page.getByLabel('Endpoint URL').fill(endpoint);
  await page.getByRole('button', { name: 'Connect output', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Connect output', exact: true })).toBeEnabled();
  await expect(page.getByRole('alert')).toHaveCount(0);
}
async function setRange(locator, value) { await locator.evaluate((element, next) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(element, String(next)); element.dispatchEvent(new Event('input', { bubbles: true })); element.dispatchEvent(new Event('change', { bubbles: true })); }, value); }

test('@site @transport WebSensa sends manual fanout and scripts to actual independent WS/HTTP mock endpoints without a backend', async ({ page }, info) => {
  await open(page);
  await addOutput(page, 'tcode-ws', base.replace('http:', 'ws:') + '/tcode');
  await addOutput(page, 'json-ws', base.replace('http:', 'ws:') + '/json');
  await addOutput(page, 'http', base + '/sink');
  await expect(page.getByText('3 connected', { exact: true })).toBeVisible();
  expect(commands.filter(item => item.type === 'tcode' && item.value.startsWith('L0'))).toHaveLength(0);
  await page.getByRole('tab', { name: /^Control/ }).click();
  await setRange(page.getByLabel('L0 Stroke'), 73);
  await page.getByLabel('Input enabled').check();
  await expect.poll(() => commands.some(item => item.type === 'tcode' && item.value === 'L07299\n')).toBe(true);
  await expect.poll(() => commands.some(item => item.type === 'json' && item.value.values?.L0 === .73)).toBe(true);
  await expect.poll(() => commands.some(item => item.type === 'http' && item.value.values?.L0 === .73)).toBe(true);
  await page.getByLabel('Record L0 track').check(); await setRange(page.getByLabel('L0 Stroke'), 81);
  const downloadEvent = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download recording' }).click();
  const download = await downloadEvent; expect(download.suggestedFilename()).toBe('WebSensa-recording.funscript');
  await page.getByRole('button', { name: 'Script', exact: true }).click(); await expect(page.getByLabel('Input enabled')).not.toBeChecked();
  await page.getByLabel('Funscript file').setInputFiles({ name: 'nonzero.funscript', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ actions: [{ at: 0, pos: 80 }, { at: 60000, pos: 20 }] })) });
  await expect(page.getByText(/0\.00 s \/ 60\.00 s · 80%/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeDisabled();
  await page.getByLabel('Loop', { exact: true }).check(); await page.getByLabel('Playback speed').selectOption('2');
  await page.getByLabel('Input enabled').check(); await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await expect.poll(() => commands.filter(item => item.type === 'json' && item.value.type === 'signal').length).toBeGreaterThan(2);
  await page.getByRole('button', { name: 'Emergency stop', exact: true }).click(); await expect(page.getByLabel('Input enabled')).not.toBeChecked();
  await expect.poll(() => commands.filter(item => item.type === 'tcode').at(-1)?.value).toBe('DSTOP\n');
  await expect.poll(() => commands.filter(item => item.type === 'json').at(-1)?.value.type).toBe('stop');
  await expect.poll(() => commands.filter(item => item.type === 'http').at(-1)?.value.type).toBe('stop');
  const sent = commands.filter(item => item.value?.type === 'signal' || item.type === 'tcode' && item.value.startsWith('L0')).length;
  await page.getByRole('button', { name: 'Clear stop', exact: true }).click(); await page.waitForTimeout(180);
  expect(commands.filter(item => item.value?.type === 'signal' || item.type === 'tcode' && item.value.startsWith('L0')).length).toBe(sent);
  expect(requests.some(endpoint => /^\/(api|ws)(\/|$)/.test(endpoint))).toBe(false);
  await info.attach('websensa-fanout.json', { body: JSON.stringify({ commands, connections, backendRequests: false }), contentType: 'application/json' });
  await info.attach('websensa-control-' + info.project.name, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
});

test('@site @transport WebSensa multiplexes two Intiface devices through one actual socket and stops/removes only their device owner', async ({ page }, info) => {
  await open(page); await outputPage(page);
  await page.getByLabel('Endpoint URL').fill(base.replace('http:', 'ws:') + '/intiface');
  await page.getByRole('button', { name: 'Scan devices' }).click(); await expect(page.getByLabel('Device and feature')).toBeVisible();
  await page.getByLabel('Device and feature').selectOption('0:LinearCmd:0'); await page.getByRole('button', { name: 'Connect output', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Connect output', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Scan devices' }).click(); await page.getByLabel('Device and feature').selectOption('1:ScalarCmd:0');
  await page.getByRole('button', { name: 'Connect output', exact: true }).click(); await expect(page.getByText('2 connected', { exact: true })).toBeVisible();
  expect(connections.filter(endpoint => endpoint === '/intiface')).toHaveLength(1);
  expect(commands.filter(item => ['LinearCmd', 'ScalarCmd'].includes(item.command))).toHaveLength(0);
  await page.getByRole('tab', { name: /^Control/ }).click(); const vibrationAxis = page.locator('.websensa-axis-choices').getByRole('checkbox', { name: 'V0', exact: true }); await vibrationAxis.click(); await expect(vibrationAxis).toBeChecked();
  await setRange(page.getByLabel('L0 Stroke'), 64); await setRange(page.getByLabel('V0 Intensity'), 38); await page.getByLabel('Input enabled').check();
  await expect.poll(() => commands.some(item => item.command === 'LinearCmd' && item.body.DeviceIndex === 0 && item.body.Vectors[0].Position === .64)).toBe(true);
  await expect.poll(() => commands.some(item => item.command === 'ScalarCmd' && item.body.DeviceIndex === 1 && item.body.Scalars[0].Scalar === .38)).toBe(true);
  await outputPage(page); const outputs = page.locator('.websensa-row'); await expect(outputs).toHaveCount(2);
  await outputs.first().getByRole('button', { name: 'Disconnect and remove' }).click(); await expect(outputs).toHaveCount(1);
  await expect.poll(() => commands.filter(item => item.command === 'StopDeviceCmd').at(-1)?.body.DeviceIndex).toBe(0);
  const scalarBefore = commands.filter(item => item.command === 'ScalarCmd').length;
  await expect.poll(() => commands.filter(item => item.command === 'ScalarCmd').length).toBeGreaterThan(scalarBefore);
  expect(connections.filter(endpoint => endpoint === '/intiface')).toHaveLength(1);
  await page.getByLabel('Input enabled').uncheck();
  await expect.poll(() => commands.filter(item => item.command === 'StopDeviceCmd').at(-1)?.body.DeviceIndex).toBe(1);
  await info.attach('websensa-intiface-multiplex.json', { body: JSON.stringify({ commands, connections }), contentType: 'application/json' });
  await info.attach('websensa-outputs-' + info.project.name, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
});

test('@site @input WebSensa receives explicitly paired explorer frames without arming and expires a lost stream', async ({ page, context }, info) => {
  // This same-origin parent supplies the real opener relationship; no browser
  // hardware or executable backend participates in the cross-window exchange.
  await page.goto(base + '/Sensa/');
  const session = 'a'.repeat(32), popupEvent = context.waitForEvent('page');
  await page.evaluate(url => { window.__websensa = window.open(url, 'websensa-test'); }, base + '/Sensa/websensa/?lang=en&input=explorer&session=' + session);
  const popup = await popupEvent; await expect(popup.getByRole('heading', { name: 'Put signals to work' })).toBeVisible();
  await popup.getByRole('button', { name: 'Parameter explorer', exact: true }).click();
  await popup.getByRole('button', { name: 'Connect parameter explorer', exact: true }).click();
  await page.evaluate(({ session }) => window.__websensa.postMessage({ type: 'sensa.signal.v1', session, sequence: 1, timestamp: Date.now(), axes: { L0: .72 } }, location.origin), { session });
  await expect(popup.getByText('L0 72%', { exact: true })).toBeVisible(); await expect(popup.getByLabel('Input enabled')).not.toBeChecked();
  await popup.getByLabel('Input enabled').check(); await expect(popup.getByLabel('Input enabled')).toBeChecked();
  await expect(popup.getByLabel('Input enabled')).not.toBeChecked({ timeout: 5000 });
  await page.evaluate(({ session }) => window.__websensa.postMessage({ type: 'sensa.signal.v1', session, sequence: 2, timestamp: Date.now(), axes: { L0: .9 } }, location.origin), { session });
  await expect(popup.getByText('L0 90%', { exact: true })).toBeVisible(); await expect(popup.getByLabel('Input enabled')).not.toBeChecked();
  await popup.getByLabel('Input enabled').check();
  await page.evaluate(({ session }) => window.__websensa.postMessage({ type: 'sensa.signal.stop.v1', session, sequence: 3, timestamp: Date.now() }, location.origin), { session });
  await expect(popup.getByLabel('Input enabled')).not.toBeChecked();
  await info.attach('websensa-explorer-lifecycle.json', { body: JSON.stringify({ origin: new URL(base).origin, explicitPairing: true, automaticActivation: false, expiryStopped: true, explicitStop: true }), contentType: 'application/json' });
  await popup.close();
});
