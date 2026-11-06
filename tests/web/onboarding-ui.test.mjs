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
  stdin: { contents: "export {default as Onboarding} from './src/web/Onboarding.jsx'; export {default as Presets} from './src/web/ScenePresets.jsx'; export {default as GettingStarted} from './src/web/GettingStarted.jsx'; export {setLocale,t} from './src/web/i18n.js'; export {getOscMappingPresets,AXIS_PROFILE_PRESETS} from './src/web/configuration.js';", resolveDir: root },
  bundle: true, write: false, platform: 'node', format: 'esm', jsx: 'automatic', plugins: [{ name: 'shared-test-react', setup(builder) {
    builder.onResolve({ filter: /^react(?:\/.*)?$/ }, args => ({ path: pathToFileURL(require.resolve(args.path)).href, external: true }));
  } }],
});
const { Onboarding, Presets, GettingStarted, setLocale, t, getOscMappingPresets, AXIS_PROFILE_PRESETS } = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const render = (Component, props) => renderToStaticMarkup(React.createElement(Component, props));
const defaultProps = { state: { status: 'active', goal: 'manual', step: 'goal' }, onChange() {}, onNavigate() {}, onApplyInput() {}, onOpenPresets() {} };
function elements(node) {
  if (!React.isValidElement(node)) return [];
  return [node, ...React.Children.toArray(node.props.children).flatMap(elements)];
}
const byTestId = (tree, id) => elements(tree).find(element => element.props['data-testid'] === id);

for (const locale of ['zh-CN', 'en-US']) {
  test('inline guide has four navigable steps and allows preparation before connecting hardware in ' + locale, () => {
    setLocale(locale);
    const html = render(Onboarding, { ...defaultProps, state: { ...defaultProps.state, step: 'device' } });
    assert.match(html, /data-testid="onboarding-panel"[^>]*tabindex="-1"/);
    assert.equal((html.match(/data-testid="onboarding-step-/g) || []).length, 4);
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
    assert.match(missing, /data-testid="onboarding-complete" disabled=""/);
    assert.ok(missing.includes(t('还差一步')));
    const ready = render(Onboarding, { ...defaultProps, state, outputCount: 1, availableOutputs: 1, inputPrepared: true });
    assert.doesNotMatch(ready.match(/<button[^>]*data-testid="onboarding-complete"[^>]*>/)?.[0], /disabled=/);
    assert.ok(ready.includes(t('设置已备好')));
    assert.ok(ready.includes(t('返回控制页，检查目标后打开顶部“输入启用”。')));
    assert.doesNotMatch(ready, /role="switch"/);
  });
}

test('guide selection and progression dispatch only presentation actions; runtime changes need their own explicit button', () => {
  const actions = [], navigation = [], applied = [];
  const props = { ...defaultProps, onChange: action => actions.push(action), onNavigate: destination => navigation.push(destination), onApplyInput: goal => applied.push(goal) };
  const goal = Onboarding(props);
  byTestId(goal, 'onboarding-goal-script').props.onClick();
  byTestId(goal, 'onboarding-next').props.onClick();
  assert.deepEqual(actions, [{ type: 'goal', goal: 'script' }, { type: 'step', step: 'device' }]);
  assert.deepEqual(navigation, []); assert.deepEqual(applied, []);
  const input = Onboarding({ ...props, state: { status: 'active', goal: 'script', step: 'input' }, actualMode: 'manual' });
  byTestId(input, 'onboarding-prepare-input').props.onClick();
  assert.deepEqual(navigation, ['script']); assert.deepEqual(applied, []);
  byTestId(input, 'onboarding-apply-input').props.onClick();
  assert.deepEqual(applied, ['script']);
});

test('browser guide hides native listeners and recovers a saved unavailable goal as scene selection', () => {
  const html = render(Onboarding, { ...defaultProps, platform: { supportsListeners: false, inputModes: ['manual', 'script', 'combined'] },
    state: { status: 'active', goal: 'protocol', step: 'input' } });
  assert.match(html, /data-testid="onboarding-goal-manual"/); assert.match(html, /data-testid="onboarding-goal-script"/);
  assert.doesNotMatch(html, /data-testid="onboarding-goal-(osc|protocol)"/);
  assert.match(html, /data-testid="onboarding-step-goal" aria-current="step"/);
  assert.match(html, /data-testid="onboarding-next" disabled=""/);
});

test('dismissed first-run invitation becomes compact but keeps guide and scene entrypoints available', () => {
  const html = render(GettingStarted, { onboarding: { status: 'dismissed', goal: 'script', step: 'input' }, onNavigate() {} });
  assert.match(html, /scene-launchpad--compact/); assert.match(html, /data-testid="onboarding-resume"/);
  assert.match(html, /data-testid="open-scene-presets"/); assert.doesNotMatch(html, /onboarding-invitation/);
  assert.equal((html.match(/data-testid="setup-task-/g) || []).length, 4);
});

test('preset library exposes real catalogs, draft-only actions and capability-specific groups', () => {
  const props = { open: true, oscPresets: getOscMappingPresets({}), axisPresets: AXIS_PROFILE_PRESETS(), oscPresetId: 'ogb-touch',
    onClose() {}, onOscPresetChange() {}, onUseOscPreset() {}, onReviewAxisPreset() {} };
  const osc = render(Presets, props);
  for (const id of ['ogb-depth', 'ogb-touch', 'contact-position', 'contact-speed', 'native-pb-stretch']) assert.ok(osc.includes(`value="${id}"`), id);
  assert.match(osc, /data-testid="scene-osc-append"/); assert.match(osc, /data-testid="scene-osc-replace"/);
  assert.ok(osc.includes(t('追加到映射草稿')));
  assert.doesNotMatch(osc, /data-testid="scene-axis-preset"|role="switch"/);
  const browser = render(Presets, { ...props, supportsOsc: false });
  assert.doesNotMatch(browser, /scene-preset-tabs-osc|data-testid="scene-osc-preset"/);
  for (const preset of AXIS_PROFILE_PRESETS()) assert.ok(browser.includes(`value="${preset.id}"`), preset.id);
  assert.match(browser, /value="osr-first-run" selected=""/);
  assert.match(browser, /data-testid="scene-axis-review"/);
});
