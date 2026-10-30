import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createBrowserWorkbench } from '../../src/websensa/browser-runtime.ts';
import { resolveWebSensaLocale, saveWebSensaLocale } from '../../src/websensa/locale.ts';

const require = createRequire(import.meta.url);
const compiled = await build({ entryPoints: ['src/websensa/WebSensa.tsx'], bundle: true, write: false, platform: 'node', format: 'esm', jsx: 'automatic', loader: { '.js': 'jsx' }, plugins: [{ name: 'shared-test-react', setup(builder) {
  builder.onResolve({ filter: /^react(?:\/.*)?$/ }, args => ({ path: pathToFileURL(require.resolve(args.path)).href, external: true }));
} }] });
const source = compiled.outputFiles[0].text;
const { default: WebSensa } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const render = props => renderToStaticMarkup(React.createElement(WebSensa, props));
const makeHost = options => createBrowserWorkbench({ page: null, storage: null, ...options });

test('WebSensa preserves explicit query, shared tab language and persistent fallback in the correct order', () => {
  const browser = { location: { href: 'https://example.test/websensa/?lang=zh-CN' }, sessionStorage: { getItem: () => 'en-US' }, localStorage: { getItem: () => 'en' }, navigator: { languages: ['en-US'] } };
  assert.equal(resolveWebSensaLocale(browser), 'zh'); browser.location.href = 'https://example.test/websensa/';
  assert.equal(resolveWebSensaLocale(browser), 'en'); browser.sessionStorage.getItem = () => 'zh_CN'; assert.equal(resolveWebSensaLocale(browser), 'zh');
  browser.sessionStorage.getItem = () => { throw new Error('denied'); }; browser.localStorage.getItem = () => 'zh'; assert.equal(resolveWebSensaLocale(browser), 'zh');
  browser.localStorage.getItem = () => 'unsupported'; assert.equal(resolveWebSensaLocale(browser), 'en');
});

test('WebSensa language saves both shared tab and page preference without requiring storage access', () => {
  const values = []; const browser = { sessionStorage: { setItem: (...args) => values.push(args) }, localStorage: { setItem: (...args) => values.push(args) } };
  assert.equal(saveWebSensaLocale('zh-CN', browser), true); assert.deepEqual(values, [['sensa.locale', 'zh-CN'], ['websensa.locale', 'zh']]);
  assert.equal(saveWebSensaLocale('xx', browser), false); assert.equal(saveWebSensaLocale('en', { sessionStorage: { setItem() { throw new Error(); } } }), true);
});

test('WebSensa renders the complete shared workbench with actual local runtime state', async () => {
  const host = makeHost({ environment: { fetch() {} } });
  const html = render({ host });
  assert.match(html, /class="app-shell"/); assert.match(html, /workspace-sidebar/); assert.match(html, /workspace-scroll/);
  assert.match(html, /WebSensa/); assert.match(html, /Input enabled/); assert.match(html, /Emergency stop/);
  assert.match(html, /aria-label="Motion axes"/); assert.match(html, /value="SensaHttp"/);
  assert.doesNotMatch(html, /value="password|localhost.*api|app\.bundle.*cdn/);
  await host.client.dispose();
});

test('the unified output menu retains supported browser transports and disables host-only choices', async () => {
  const host = makeHost({ environment: { fetch() {} } });
  const html = render({ host });
  for (const type of ['Intiface', 'TCodeSerial', 'TCodeWebSocket', 'Bluetooth', 'SensaHttp', 'SensaWebSocket', 'HttpJson', 'WebSocketJson', 'Midi', 'Recording']) assert.ok(html.includes('value="' + type + '"'), type);
  assert.match(html, /<option value="TCodeSerial" disabled=""/);
  assert.match(html, /<option value="TCodeUdp" disabled=""/);
  assert.match(html, /<option value="SensaHttp"[^>]*>Sensa · HTTP/);
  assert.match(html, /<option value="Recording">/);
  assert.doesNotMatch(html, /<input[^>]*type="password"/);
  await host.client.dispose();
});

test('the browser workbench exposes all twelve manual axes and keeps input inactive', async () => {
  const host = makeHost();
  const html = render({ host });
  for (const axis of ['L0', 'L1', 'L2', 'R0', 'R1', 'R2', 'V0', 'V1', 'V2', 'A0', 'A1', 'A2']) assert.ok(html.includes('>' + axis + '</label>'), axis);
  assert.match(html, /type="checkbox"[^>]*checked=""[^>]*\/>L0/);
  assert.equal(host.runtime.getSnapshot().inputActive, false);
  await host.client.dispose();
});

test('server and browser entry points resolve to the same workbench without a second signal engine', async () => {
  assert.doesNotMatch(source, /class SensaEngine|function SensaEngine/);
  assert.match(source, /function Workbench\(/);
  const host = makeHost(); const snapshot = host.initialSnapshot();
  snapshot.overview.runtime.inputActive = true;
  assert.equal(host.runtime.getSnapshot().inputActive, false);
  assert.equal(host.platform.inputModes.includes('osc'), false);
  await host.client.dispose();
});

test('the shared renderer disables native adapters reported unavailable by the actual host', async () => {
  const host = makeHost();
  const initial = host.initialSnapshot();
  initial.overview.capabilities = { outputs: [{ type: 'TCodeSerial', available: false }, { type: 'SensaHttp', available: true }, { type: 'Recording', available: true }] };
  host.platform = { name: 'Sensa' }; host.initialSnapshot = () => initial;
  const html = render({ host });
  assert.match(html, /<option value="TCodeSerial" disabled=""/);
  assert.match(html, /<option value="Intiface" disabled=""/);
  assert.match(html, /<option value="SensaHttp"[^>]*>Sensa · HTTP/);
  await host.client.dispose();
});
