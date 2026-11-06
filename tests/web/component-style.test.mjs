import test from 'node:test';
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
  stdin: { contents: "export { Button, ButtonLink, Disclosure, Field, Section, TaskTile, WorkspaceHeader } from './src/web/ui.tsx'; export { SelectField, ValueSliderField, RangeField } from './src/web/controls.jsx';", resolveDir: root },
  bundle: true, write: false, platform: 'node', format: 'esm', jsx: 'automatic',
  plugins: [{ name: 'shared-test-react', setup(builder) {
    builder.onResolve({ filter: /^react(?:\/.*)?$/ }, args => ({ path: pathToFileURL(require.resolve(args.path)).href, external: true }));
  } }],
});
const { Button, ButtonLink, Disclosure, Field, Section, TaskTile, WorkspaceHeader, SelectField, ValueSliderField, RangeField } = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const render = (Component, props, children) => renderToStaticMarkup(React.createElement(Component, props, children));

test('disclosure uses a native collapsed summary and preserves editable contents', () => {
  const html = render(Disclosure, { title: 'More axes', description: 'L1 · R0', id: 'axes', name: 'manual', className: 'manual-more-axes', 'data-testid': 'axes' },
    React.createElement('input', { 'aria-label': 'Rotation', defaultValue: '.5' }));
  assert.match(html, /^<details[^>]*id="axes"[^>]*name="manual"/);
  assert.match(html, /class="disclosure manual-more-axes"/);
  assert.doesNotMatch(html.match(/^<details[^>]*>/)[0], /\bopen=/);
  assert.equal((html.match(/<summary/g) || []).length, 1);
  assert.match(html, /<summary class="disclosure__summary">.*More axes.*L1 · R0.*<\/summary>/);
  assert.match(html, /<div class="disclosure__body"><input aria-label="Rotation" value="\.5"\/><\/div>/);
  assert.doesNotMatch(html, /\b(?:disabled|inert|hidden|tabindex)=/);
});

test('disclosure actions stay outside the native toggle and supports native open state', () => {
  const props = { title: 'Advanced settings', actions: React.createElement(Button, null, 'Reset'), defaultOpen: true };
  const html = render(Disclosure, props, React.createElement('p', null, 'Settings'));
  assert.match(html, /^<details[^>]*open=""/);
  assert.doesNotMatch(html.match(/<summary.*?<\/summary>/)[0], /<button|role=|tabindex=/);
  assert.match(html, /<\/summary><div class="disclosure__body"><div class="actions disclosure__actions"><button.*Reset.*<\/button><\/div><p>Settings<\/p>/);
  assert.doesNotMatch(render(Disclosure, { ...props, open: false }).match(/^<details[^>]*>/)[0], /\bopen=/);
  assert.match(render(Disclosure, { title: 'Advanced settings', open: true }), /^<details[^>]*open=""/);
});

test('button links share button appearance while preserving anchor behavior', () => {
  for (const props of [{}, { tone: 'primary' }, { tone: 'danger', variant: 'outline', size: 'small', className: 'custom-action' }]) {
    const button = render(Button, props, 'Continue');
    const link = render(ButtonLink, { ...props, href: '/guide/', target: '_blank', rel: 'noreferrer' }, 'Continue');
    assert.equal(link.match(/class="([^"]*)"/)[1], button.match(/class="([^"]*)"/)[1]);
    assert.match(link, /^<a[^>]*href="\/guide\/"[^>]*target="_blank"[^>]*rel="noreferrer">Continue<\/a>$/);
    assert.doesNotMatch(link, /<button/);
  }
});

test('field labels and hints preserve caller identities without adding visible help by default', () => {
  for (const multiline of [false, true]) {
    const html = render(Field, { id: 'device-name', label: 'Name', hint: 'Used in the output list', multiline, 'aria-describedby': 'connection-help' });
    assert.match(html, /<label[^>]*for="device-name"/);
    assert.match(html, new RegExp(`<${multiline ? 'textarea' : 'input'}[^>]*id="device-name"[^>]*aria-describedby="connection-help device-name-hint"`));
    assert.match(html, /<span class="sr-only" id="device-name-hint">Used in the output list<\/span>/);
    assert.doesNotMatch(html, /visibleHint|field__hint/);
  }
  const select = render(SelectField, { id: 'transport', label: 'Connection', title: 'Choose a transport', value: 'serial', options: [{ value: 'serial', label: 'Serial' }], onChange() {}, 'aria-describedby': 'connection-help' });
  assert.match(select, /<label[^>]*for="transport"/);
  assert.match(select, /<select[^>]*id="transport"[^>]*aria-describedby="connection-help transport-hint"/);
  assert.match(select, /<span class="sr-only" id="transport-hint">Choose a transport<\/span>/);
});

test('all field variants use the same explicit visible hint treatment', () => {
  const cases = [
    [Field, { label: 'Name', hint: 'Help' }],
    [SelectField, { label: 'Transport', title: 'Help', options: [], onChange() {} }],
    [ValueSliderField, { label: 'Position', title: 'Help', value: .5, min: 0, max: 1, onChange() {} }],
    [RangeField, { label: 'Range', title: 'Help', value: [0, 1], sliderMin: 0, sliderMax: 1, onChange() {} }],
  ];
  for (const [Component, props] of cases) {
    const html = render(Component, { ...props, visibleHint: true });
    const hint = html.match(/<span class="field__hint" id="([^"]+)">Help<\/span>/);
    assert.ok(hint);
    assert.ok(html.includes(`aria-describedby="${hint[1]}"`));
    assert.doesNotMatch(html, /visibleHint/);
  }
});

test('task tiles retain native button semantics with text labels and decorative affordances', () => {
  const html = render(TaskTile, { title: 'Play a script', description: 'Choose a track before enabling input',
    icon: React.createElement('svg', { 'data-icon': 'script' }), className: 'scene-choice', disabled: true, 'data-testid': 'script-task' });
  assert.match(html, /^<button type="button"[^>]*class="[^"]*task-tile scene-choice"[^>]*disabled=""/);
  assert.match(html, /data-testid="script-task"/);
  assert.match(html, /<strong class="task-tile__title">Play a script<\/strong>/);
  assert.match(html, /<small class="task-tile__description">Choose a track before enabling input<\/small>/);
  assert.match(html, /<span class="task-tile__icon" aria-hidden="true">/);
  assert.match(html, /class="task-tile__arrow"[^>]*aria-hidden="true"[^>]*focusable="false"/);
  assert.doesNotMatch(html, /aria-pressed|\bselected=|<a\b|role="button"/);
});

test('task tile selection is explicit and supports a compact title-only entry', () => {
  for (const selected of [true, false]) {
    const html = render(TaskTile, { title: 'Manual controls', selected });
    assert.match(html, new RegExp(`aria-pressed="${selected}"`));
    assert.doesNotMatch(html, /<small|\bselected=/);
  }
});

test('workspace and section headers share hierarchy without nesting their action buttons', () => {
  const actions = React.createElement(Button, { 'aria-label': 'Open presets' }, 'Presets');
  const html = render(WorkspaceHeader, { id: 'setup-heading', title: 'Choose a task', eyebrow: 'Step 1 of 4',
    description: 'Prepare the input before enabling it.', actions, headingLevel: 3 });
  assert.match(html, /^<header id="setup-heading" class="workspace-header">/);
  assert.match(html, /<h3 class="workspace-header__title">Choose a task<\/h3>/);
  assert.match(html, /<p class="workspace-header__eyebrow">Step 1 of 4<\/p>/);
  assert.match(html, /<div class="actions workspace-header__actions"><button[^>]*aria-label="Open presets"/);
  assert.doesNotMatch(html, /headingLevel|actionsClassName|<h2/);
  const section = render(Section, { title: 'Devices', actions }, React.createElement('p', null, 'Connected outputs'));
  assert.match(section, /class="workspace-header section__header"/);
  assert.match(section, /<h2 class="workspace-header__title">Devices<\/h2>/);
  assert.match(section, /class="actions workspace-header__actions section__actions"/);
  assert.match(section, /<\/header><p>Connected outputs<\/p><\/section>$/);
});

test('numeric control groups accept layout classes and retain native disabled semantics', () => {
  const value = render(ValueSliderField, { label: 'Position', className: 'primary-value', value: 500, min: 0, max: 999, disabled: true, onChange() {} });
  assert.match(value, /^<div class="value-field primary-value">/);
  assert.match(value, /<label class="field__label"/);
  assert.equal((value.match(/disabled=""/g) || []).length, 2);
  const range = render(RangeField, { label: 'Travel range', className: 'axis-limits', value: [0, 999], sliderMin: 0, sliderMax: 999, disabled: true, onChange() {} });
  assert.match(range, /^<fieldset class="range-field axis-limits" disabled="">/);
  assert.match(range, /<legend class="field__label">/);
  assert.equal((range.match(/type="number"/g) || []).length, 2);
});
