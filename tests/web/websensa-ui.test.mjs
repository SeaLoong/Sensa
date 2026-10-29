import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SensaEngine } from '../../src/core/index.ts';
import { resolveWebSensaLocale, saveWebSensaLocale } from '../../src/websensa/locale.ts';
import { detectCapabilities } from '../../src/websensa/capabilities.ts';

const require = createRequire(import.meta.url);
const compiled = await build({ entryPoints: ['src/websensa/WebSensa.tsx'], bundle: true, write: false, platform: 'node', format: 'esm', jsx: 'automatic', plugins: [{ name: 'shared-test-react', setup(builder) {
  builder.onResolve({ filter: /^react(?:\/.*)?$/ }, args => ({ path: pathToFileURL(require.resolve(args.path)).href, external: true }));
} }] });
const { default: WebSensa } = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const render = props => renderToStaticMarkup(React.createElement(WebSensa, props));

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

test('WebSensa renders the desktop workbench shell and named controls in both languages without a backend', () => {
  for (const initialLanguage of ['en', 'zh']) {
    const html = render({ initialLanguage });
    assert.match(html, /app-shell websensa/); assert.match(html, /workspace-sidebar/); assert.match(html, /workspace-scroll/);
    assert.match(html, initialLanguage === 'en' ? /Input enabled/ : /输入启用/);
    assert.match(html, initialLanguage === 'en' ? /Emergency stop/ : /紧急停止/);
    assert.match(html, /aria-label="L0 (?:Stroke|主轴)"/); assert.match(html, /aria-selected="true"/);
    assert.doesNotMatch(html, /value="password|localhost.*api|app\.bundle.*cdn/);
  }
});

test('WebSensa output form exposes explicit device discovery and all browser transport choices', () => {
  const html = render({ initialLanguage: 'en', initialPage: 'outputs' });
  for (const type of ['intiface', 'serial', 'tcode-ws', 'json-ws', 'http', 'midi', 'bluetooth']) assert.ok(html.includes('value="' + type + '"'));
  assert.match(html, /Scan devices/); assert.match(html, /Different devices share one connection/);
  assert.match(html, /<button[^>]*disabled=""[^>]*>Connect output<\/button>/);
  assert.doesNotMatch(html, /<input[^>]*type="password"/);
});

test('WebSensa script preview is paused and cannot play before explicit input activation', async () => {
  const controller = new SensaEngine();
  await controller.loadScript({ inverted: true, actions: [{ at: 0, pos: 20 }, { at: 1000, pos: 80 }] }, 'nonzero.funscript');
  const html = render({ controller, initialLanguage: 'en' });
  assert.match(html, /nonzero\.funscript/); assert.match(html, /0\.00 s \/ 1\.00 s · 80%/);
  assert.match(html, /<button[^>]*disabled=""[^>]*>Play<\/button>/);
  assert.match(html, /Playback speed/); assert.match(html, /Script target axis/); assert.match(html, /Script trajectory/);
  await controller.dispose();
});

test('WebSensa explorer source lets all motion axes be selected and keeps activation separate', async () => {
  const controller = new SensaEngine(); await controller.setMode('external'); controller.receiveExternal({ R2: .63 });
  const html = render({ controller, initialLanguage: 'en' });
  for (const axis of ['L0', 'L1', 'L2', 'R0', 'R1', 'R2', 'V0']) assert.ok(html.includes(axis));
  assert.match(html, /Receiving/); assert.match(html, /R2 63%/); assert.equal(controller.snapshot().active, false);
  await controller.dispose();
});


test('WebSensa disables unavailable browser outputs and offers an actual available route', () => {
  const capabilities = detectCapabilities({ fetch() {} });
  const html = render({ initialLanguage: 'en', initialPage: 'outputs', capabilities });
  assert.match(html, /<option value="intiface" disabled=""/);
  assert.match(html, /<option value="serial" disabled=""/);
  assert.match(html, /<option value="http">JSON · HTTP<\/option>/);
  assert.match(html, /WebSocket is unavailable/);
  assert.match(html, /Use JSON HTTP/);
  assert.match(html, /<button[^>]*disabled=""[^>]*>Connect output<\/button>/);
});
