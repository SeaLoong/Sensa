import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('../../', import.meta.url));
const compiled = await build({
  absWorkingDir: root,
  stdin: { contents: "export { default as VectorGroup } from './src/web/ComputedVectorGroup.jsx'; export { default as Panel } from './src/web/ComputedSignalsPanel.jsx'; export { setLocale } from './src/web/i18n.js'; export * from './src/web/computed-signals.js';", resolveDir: root },
  bundle: true, write: false, platform: 'node', format: 'esm',
  plugins: [{ name: 'shared-test-react', setup(builder) {
    builder.onResolve({ filter: /^react$/ }, () => ({ path: pathToFileURL(require.resolve('react')).href, external: true }));
  } }],
});
const { VectorGroup, Panel, setLocale, computedVectorGroups, makeComputedVector, newSpatialComputedDraft } = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const render = (Component, props) => renderToStaticMarkup(React.createElement(Component, { onChange() {}, signals: [], pathOptions: [], pointOptions: [], ...props }));

test('XYZ groups expose their role and preserve signed coordinates in both interface languages', () => {
  for (const locale of ['zh-CN', 'en-US']) {
    setLocale(locale);
    const groups = computedVectorGroups('PlaneDepth');
    const html = render(VectorGroup, { group: groups[2], inputs: makeComputedVector('Constant', '', [0, -3, 4]) });
    assert.match(html, /<fieldset[^>]*data-vector="normal"/);
    assert.match(html, /<legend>[^<]+<\/legend>/);
    for (const axis of ['X', 'Y', 'Z']) {
      assert.match(html, new RegExp('>' + axis + '<'));
      assert.match(html, new RegExp('aria-label="' + axis + ' (?:分量|component)"'));
    }
    assert.match(html, /value="-3"/); assert.match(html, /value="4"/);
    assert.equal((html.match(/type="number"/g) || []).length, 3);
    assert.doesNotMatch(html, /data-testid="signal-source-mode"|移除输入|Remove input/);
    assert.match(html, /0 \/ 0 \/ 1/);
  }
});

test('tracking vector shortcuts describe exact metrics and separate advanced component sources', () => {
  setLocale('en-US');
  const group = computedVectorGroups('VectorAngle')[0];
  const forward = render(VectorGroup, { group, inputs: makeComputedVector('Forward', 'Sensa/Shader/42/**'), pointOptions: [
    { value: 'Sensa/Shader/42/**', label: 'Shader target' }, { value: 'Sensa/Contact/Target/**', label: 'Contact target' },
  ] });
  assert.match(forward, /ForwardX \/ ForwardY \/ ForwardZ/);
  assert.match(forward, /value="Sensa\/Shader\/42\/\*\*"/);
  assert.doesNotMatch(forward, /<option value="Sensa\/Contact/);
  const custom = render(VectorGroup, { group, inputs: ['DX', 'DY', 'DZ'].map(oscPath => ({ sourceMode: 'Computed', oscPath })) });
  assert.equal((custom.match(/data-testid="computed-vector-component"/g) || []).length, 3);
  assert.match(custom, /X component · DX/); assert.match(custom, /Z component · DZ/);
  const rawDirection = render(VectorGroup, { group, inputs: makeComputedVector('Position', 'Sensa/Contact/Target/**') });
  assert.equal((rawDirection.match(/data-testid="computed-vector-component"/g) || []).length, 3,
    'A custom XYZ direction stays editable instead of selecting a shortcut with different metrics.');
});

test('saved spatial summaries show metre and degree results and presets remain draft actions', () => {
  for (const locale of ['zh-CN', 'en-US']) {
    setLocale(locale);
    const depth = newSpatialComputedDraft([], 'PlaneDepth', 'Sensa/Contact/Target/**');
    const angle = newSpatialComputedDraft([depth], 'PlaneAngle');
    const html = render(Panel, { drafts: [depth, angle], runtimeSignals: [
      { id: depth.id, valid: true, value: -.25, coordinateFrame: 'AvatarRootMeters' },
      { id: angle.id, valid: true, value: -45, coordinateFrame: 'Angle' },
    ], onMap() {} });
    assert.match(html, /data-testid="computed-signal-value">-0.25 m<\/output>/);
    assert.match(html, /data-testid="computed-signal-value">-45°<\/output>/);
    assert.match(html, /data-testid="computed-spatial-presets"/);
    assert.match(html, /Tracking Frame · Origin \/ Forward/);
    assert.match(html, /<button[^>]+disabled=""[^>]*>(?:添加跟随平面草稿|Add following-plane drafts)<\/button>/);
    const dirty = render(Panel, { drafts: [depth], graphDirty: true, runtimeSignals: [{ id: depth.id, valid: true, value: 99 }], onMap() {} });
    assert.match(dirty, /data-testid="computed-signal-value">—<\/output>/);
  }
});
