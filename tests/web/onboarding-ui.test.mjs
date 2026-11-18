import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('../../', import.meta.url));
const compiled = await build({ absWorkingDir: root,
  stdin: { contents: "export {default as Onboarding} from './src/web/Onboarding.jsx'; export {default as GettingStarted} from './src/web/GettingStarted.jsx'; export {setLocale,t} from './src/web/i18n.js';", resolveDir: root },
  bundle: true, write: false, platform: 'node', format: 'esm', jsx: 'automatic', plugins: [{ name: 'shared-test-react', setup(builder) {
    builder.onResolve({ filter: /^react(?:\/.*)?$/ }, args => ({ path: pathToFileURL(require.resolve(args.path)).href, external: true }));
  } }],
});
const { Onboarding, GettingStarted, setLocale, t } = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const render = (Component, props) => renderToStaticMarkup(React.createElement(Component, props));
const defaultProps = { state: { status: 'active', goal: 'manual', step: 'goal' }, onChange() {}, onNavigate() {}, onApplyInput() {}, onCreateProfile() {} };
function elements(node) {
  if (!React.isValidElement(node)) return [];
  return [node, ...React.Children.toArray(node.props.children).flatMap(elements)];
}
const byTestId = (tree, id) => elements(tree).find(element => element.props['data-testid'] === id);

for (const locale of ['zh-CN', 'en-US']) {
  test('spotlight guide has seven navigable steps and allows preparation before connecting hardware in ' + locale, () => {
    setLocale(locale);
    const html = render(Onboarding, { ...defaultProps, state: { ...defaultProps.state, step: 'device' } });
    assert.match(html, /data-testid="onboarding-panel"[^>]*tabindex="-1"/);
    assert.match(html, /<details className="onboarding-jump">|<details class="onboarding-jump">/);
    assert.ok(html.indexOf('onboarding-panel__body') < html.indexOf('onboarding-jump'));
    assert.equal((html.match(/data-testid="onboarding-step-/g) || []).length, 7);
    assert.match(html, /data-testid="onboarding-step-device" aria-current="step"/);
    assert.doesNotMatch(html.match(/<button[^>]*data-testid="onboarding-next"[^>]*>/)?.[0], /disabled=/);
    assert.ok(html.includes(t('可用输出 {0}/{1}', [0, 0])));
    assert.match(html, /data-testid="onboarding-connect-device"/);
    assert.doesNotMatch(html, /<dialog|role="switch"/);
  });

  test('final review distinguishes missing setup from prepared-but-inactive input in ' + locale, () => {
    setLocale(locale);
    const state = { ...defaultProps.state, step: 'ready' };
    const missing = render(Onboarding, { ...defaultProps, state });
    assert.doesNotMatch(missing, /data-testid="onboarding-complete" disabled=""/);
    assert.ok(missing.includes(t('还差一步')));
    assert.match(missing, /data-testid="onboarding-review-input"/);
    assert.match(missing, /data-testid="onboarding-review-device"/);
    const ready = render(Onboarding, { ...defaultProps, state, outputCount: 1, availableOutputs: 1, inputPrepared: true });
    assert.doesNotMatch(ready.match(/<button[^>]*data-testid="onboarding-complete"[^>]*>/)?.[0], /disabled=/);
    assert.ok(ready.includes(t('设置已备好')));
    assert.doesNotMatch(ready, /data-testid="onboarding-review-(input|device)"/);
    assert.ok(ready.includes(t('检查高亮的输入启用开关。完成引导不会启用输入，准备好后由你打开。')));
    assert.doesNotMatch(ready, /role="switch"/);
  });
}

test('guide selection and progression dispatch only presentation actions; runtime changes need their own explicit button', () => {
  const actions = [], navigation = [], applied = [];
  const props = { ...defaultProps, onChange: action => actions.push(action), onNavigate: destination => navigation.push(destination), onApplyInput: goal => applied.push(goal) };
  const goal = Onboarding(props);
  byTestId(goal, 'onboarding-goal-script').props.onClick();
  byTestId(goal, 'onboarding-next').props.onClick();
  assert.deepEqual(actions, [{ type: 'goal', goal: 'script' }, { type: 'step', step: 'input' }]);
  assert.deepEqual(navigation, []); assert.deepEqual(applied, []);
  const input = Onboarding({ ...props, state: { status: 'active', goal: 'script', step: 'input' }, actualMode: 'manual' });
  byTestId(input, 'onboarding-prepare-input').props.onClick();
  assert.deepEqual(navigation, ['script']); assert.deepEqual(applied, []);
  byTestId(input, 'onboarding-apply-input').props.onClick();
  assert.deepEqual(applied, ['script']);
});

test('review repairs only missing setup and never applies input or connects a device', () => {
  const actions = [], applied = [], navigation = [];
  const props = { ...defaultProps, state: { ...defaultProps.state, step: 'ready' },
    onChange: action => actions.push(action), onApplyInput: value => applied.push(value),
    onNavigate: value => navigation.push(value) };
  const missing = Onboarding(props);
  byTestId(missing, 'onboarding-review-input').props.onClick();
  byTestId(missing, 'onboarding-review-device').props.onClick();
  assert.deepEqual(actions, [{ type: 'step', step: 'input' }, { type: 'step', step: 'device' }]);
  assert.deepEqual(applied, []); assert.deepEqual(navigation, []);
  const inputReady = Onboarding({ ...props, inputPrepared: true });
  assert.equal(byTestId(inputReady, 'onboarding-review-input'), undefined);
  assert.ok(byTestId(inputReady, 'onboarding-review-device'));
  const outputReady = Onboarding({ ...props, outputCount: 2, availableOutputs: 1 });
  assert.ok(byTestId(outputReady, 'onboarding-review-input'));
  assert.equal(byTestId(outputReady, 'onboarding-review-device'), undefined);
});

test('browser guide hides native listeners and recovers a saved unavailable goal as scene selection', () => {
  const html = render(Onboarding, { ...defaultProps, platform: { supportsListeners: false, inputModes: ['manual', 'script', 'combined'] },
    state: { status: 'active', goal: 'protocol', step: 'input' } });
  assert.match(html, /data-testid="onboarding-goal-manual"/); assert.match(html, /data-testid="onboarding-goal-script"/);
  assert.doesNotMatch(html, /data-testid="onboarding-goal-(osc|protocol)"/);
  assert.match(html, /data-testid="onboarding-step-goal" aria-current="step"/);
  assert.match(html, /data-testid="onboarding-next" disabled=""/);
});

test('dismissed guide resumes from the header without duplicating input tabs', () => {
  const html = render(GettingStarted, { onboarding: { status: 'dismissed', goal: 'script', step: 'input' }, onNavigate() {} });
  assert.match(html, /data-testid="onboarding-resume"/);
  assert.doesNotMatch(html, /data-testid="open-scene-presets"/); assert.doesNotMatch(html, /onboarding-invitation/);
  assert.doesNotMatch(html, /scene-launchpad|setup-task-/);
});

test('each preparation step gives ordered instructions in both languages', () => {
  for (const locale of ['zh-CN', 'en-US']) {
    setLocale(locale);
    for (const goal of ['manual', 'script', 'osc', 'protocol']) for (const step of ['input', 'mapping', 'axes', 'device', 'diagnostics']) {
      const html = render(Onboarding, { ...defaultProps, state: { status: 'active', goal, step } });
      assert.match(html, /class="onboarding-instructions"/);
      assert.equal((html.match(/<li>/g) || []).length, 3);
      assert.doesNotMatch(html, /scene-presets/);
      if (locale === 'en-US') assert.doesNotMatch(html, /[\u4e00-\u9fff]/);
    }
  }
});

test('OSC review links missing saved mappings back to the axis mapping editor', () => {
  const state = { status: 'active', step: 'ready', goal: 'osc' };
  const props = { ...defaultProps, state, inputPrepared: true, availableOutputs: 1 };
  const actions = [];
  const review = Onboarding({ ...props, onChange: action => actions.push(action) });
  byTestId(review, 'onboarding-complete').props.onClick();
  assert.deepEqual(actions.splice(0), [{ type: 'dismiss' }]);
  assert.equal(byTestId(review, 'onboarding-review-input'), undefined);
  byTestId(review, 'onboarding-review-mapping').props.onClick();
  assert.deepEqual(actions, [{ type: 'step', step: 'mapping' }]);
  assert.equal(byTestId(Onboarding({ ...props, savedMappingCount: 1 }), 'onboarding-review-mapping'), undefined);
});
