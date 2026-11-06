import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createDefaultConfiguration } from '../../src/core/runtime/configuration.ts';

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('../../', import.meta.url));
const compiled = await build({
  absWorkingDir: root,
  stdin: { contents: "export { AxisProfileEditor, MotionAxisEditor } from './src/web/configuration-views.jsx'; export { AXIS_PROFILE_DEFS } from './src/web/configuration.js'; export { setLocale, t } from './src/web/i18n.js';", resolveDir: root },
  bundle: true, write: false, platform: 'node', format: 'esm', jsx: 'automatic',
  plugins: [{ name: 'shared-test-react', setup(builder) {
    builder.onResolve({ filter: /^react(?:\/.*)?$/ }, args => ({ path: pathToFileURL(require.resolve(args.path)).href, external: true }));
  } }],
});
const { AxisProfileEditor, MotionAxisEditor, AXIS_PROFILE_DEFS, setLocale, t } = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const render = (Component, props) => renderToStaticMarkup(React.createElement(Component, { onChange() {}, ...props }));
const motion = () => createDefaultConfiguration().axisProfiles[0].motion;

for (const locale of ['zh-CN', 'en-US']) {
  test('axis profile exposes twelve named keyboard tabs and one labelled editor in ' + locale, () => {
    setLocale(locale);
    const profile = motion();
    profile.l0.remapMin = 200; profile.l0.remapMax = 800;
    const html = render(AxisProfileEditor, { value: profile });
    assert.equal((html.match(/role="tab"/g) || []).length, 12);
    assert.equal((html.match(/aria-selected="true"/g) || []).length, 1);
    assert.equal((html.match(/role="tabpanel"/g) || []).length, 1);
    assert.equal((html.match(/data-axis-key=/g) || []).length, 1);
    assert.match(html, /data-axis-key="l0"/);
    for (const axis of AXIS_PROFILE_DEFS()) {
      assert.ok(html.includes('>' + axis.axis + '</span>'));
      assert.ok(html.includes(' ' + axis.label + '</span>'));
    }
    const rangeLegends = [...html.matchAll(/<legend\b[^>]*>([^<]*)/g)].map(match => match[1].trim());
    assert.equal(rangeLegends.length, 2, 'Both native range legends remain present');
    for (const range of ['映射范围', '边界范围']) {
      assert.ok(rangeLegends.includes(t(range)));
      for (const end of ['起点', '终点']) assert.ok(html.includes('aria-label="' + t('{0}{1}', [t(range), t(end)]) + '"'));
    }
    assert.ok(html.includes('aria-label="' + t('{0}数值', [t('速度限制')]) + '"'));
    assert.match(html, /value="200"/); assert.match(html, /value="800"/);
    assert.doesNotMatch(html, /<details/);
  });
}

test('disabled axis editing keeps mode, endpoint, slope and speed controls inside native disabled boundaries', () => {
  setLocale('en-US');
  const html = render(AxisProfileEditor, { value: motion(), disabled: true });
  assert.match(html, /<select[^>]*disabled=""/);
  assert.match(html, /<fieldset class="axis-editor__fields" disabled=""/);
  assert.equal((html.match(/class="range-field"/g) || []).length, 2);
  const numeric = [...html.matchAll(/<input[^>]*type="number"[^>]*>/g)].map(match => match[0]);
  assert.equal(numeric.length, 5);
  const speed = numeric.find(input => input.includes('aria-label="Speed limit value"'));
  assert.match(speed, /disabled=""/);
});

test('locked and ignored modes keep their distinct controls and preserve normalized position and speed semantics', () => {
  setLocale('en-US');
  const axis = AXIS_PROFILE_DEFS().find(item => item.key === 'r0');
  const profile = { ...motion().r0, mode: 'Locked', invert: true, lockValue: .62, commandMode: 'None', maxSpeed: 333 };
  const html = render(MotionAxisEditor, { axisDefinition: axis, value: profile });
  assert.match(html, /value="LockedInverted" selected=""/);
  assert.doesNotMatch(html, /class="range-field"/);
  const position = [...html.matchAll(/<input[^>]*>/g)].map(match => match[0]).find(input => input.includes('aria-label="Locked position value"'));
  assert.match(position, /min="0"/); assert.match(position, /max="1"/); assert.match(position, /step="0\.01"/); assert.match(position, /value="0\.62"/);
  assert.match(html, /value="333"/);
  assert.match(html, /value="None" selected=""/);
  const ignored = render(MotionAxisEditor, { axisDefinition: axis, value: { ...profile, mode: 'Ignored' } });
  assert.equal((ignored.match(/<select/g) || []).length, 1);
  assert.doesNotMatch(ignored, /<input/);
  assert.match(ignored, /This axis is ignored/);
});
