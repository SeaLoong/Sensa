import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Render the actual panel with React's shared server instance, without a browser.
const require = createRequire(import.meta.url);
const compiled = await build({
  absWorkingDir: fileURLToPath(new URL('../../', import.meta.url)),
  stdin: { contents: "export { default } from './src/web/SpsRootPanel.jsx'; export { setLocale } from './src/web/i18n.js';", resolveDir: fileURLToPath(new URL('../../', import.meta.url)) },
  bundle: true, write: false, platform: 'node', format: 'esm',
  plugins: [{ name: 'shared-test-react', setup(builder) {
    builder.onResolve({ filter: /^react$/ }, () => ({ path: pathToFileURL(require.resolve('react')).href, external: true }));
  } }],
});
const { default: SpsRootPanel, setLocale } = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));

const root = (options = {}) => ({ key: 'local|Sensa/Contact/Root', instance: 'Root', kind: 'ContactRoot', party: 'Self', sourceLabel: 'Test',
  prefix: 'Sensa/Contact/Root', sourceKey: 'local', valid: true, sampleCount: 3, expectedSampleCount: 3, isMappablePoint: true,
  coordinateFrame: 'AvatarRootMeters', coordinateUnit: 'm', displayHalfRange: 2, displayCenter: { x: 0, y: 0, z: 0 },
  position: { x: .02, y: .1, z: .15 }, velocity: { x: -.1, y: .2, z: .3 }, speed: .4, proximitySpeed: -.2,
  supportsVelocity: true, residual: 0, ...options });
const render = observation => renderToStaticMarkup(React.createElement(SpsRootPanel, { observations: [observation] }));
const text = html => html.replace(/<[^>]+>/g, '');
const metric = (html, name) => text(html.match(new RegExp('<dd data-testid="' + name + '">([\\s\\S]*?)</dd>'))?.[1] || '');

test('Contact panel presents metres, native velocity and coverage separately from fitting / Contact面板分别呈现米制坐标、原生速度和覆盖半径', () => {
  for (const locale of ['zh-CN', 'en-US']) {
    setLocale(locale);
    const html = render(root());
    assert.equal(metric(html, 'point-position'), '0.020 / 0.100 / 0.150 m');
    assert.equal(metric(html, 'point-coverage-radius'), '2.000 m');
    assert.equal(metric(html, 'point-velocity'), '-0.100 / 0.200 / 0.300 m/s');
    assert.equal(metric(html, 'point-speed'), '0.400 m/s');
    assert.equal(metric(html, 'point-proximity-speed'), '-0.200 /s');
    assert.match(html, /3\/3/);
    assert.doesNotMatch(html, /距离拟合误差|Distance fit error|NaN|Infinity/);
    for (const value of ['VelocityX', 'VelocityY', 'VelocityZ', 'Speed', 'ProximitySpeed'])
      assert.match(html, new RegExp('<option value="' + value + '"'));
  }
});

test('invalid Contact data clears motion readings while legacy roots keep their measurement presentation / Contact失效清空运动读数且旧根点保留原有呈现', () => {
  setLocale('en-US');
  const invalid = render(root({ valid: false, velocity: null, speed: null, proximitySpeed: null, supportsVelocity: false }));
  for (const name of ['point-position', 'point-velocity', 'point-speed', 'point-proximity-speed']) assert.equal(metric(invalid, name), '—');
  for (const kind of ['SpsRoot', 'ShaderRoot']) {
    const html = render(root({ kind, coordinateFrame: 'AvatarRootLocal', expectedSampleCount: kind === 'SpsRoot' ? 4 : 3, sampleCount: kind === 'SpsRoot' ? 4 : 3 }));
    assert.match(metric(html, 'point-position'), /local units$/);
    assert.match(html, /Distance fit error/);
    assert.doesNotMatch(html, /data-testid="point-(velocity|speed|proximity-speed|coverage-radius)"|<option value="Speed"/);
  }
});
