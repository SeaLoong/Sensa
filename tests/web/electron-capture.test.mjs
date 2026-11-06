import assert from 'node:assert/strict';
import test from 'node:test';
import { captureInitialWorkbench } from '../../scripts/smoke-electron.mjs';

function deferred() {
  let resolve, reject;
  const promise = new Promise((accept, fail) => { resolve = accept; reject = fail; });
  return { promise, resolve, reject };
}

/** Only a page contract fixture: no browser, application, file capture or service. */
const extraAxisNames = ['L1', 'L2', 'R0', 'R1', 'R2', 'V0', 'V1', 'V2', 'A0', 'A1', 'A2'];
function pageFixture({ loading = false, connected = true, checked = false, axisValues = {}, runtime = {}, mode = 'manual',
  primaryAxes = ['L0'], extraAxes = extraAxisNames, extrasOpen = false,
  extraDisclosureVisible = true, extraDisclosureTag = 'details', extraDisclosureCount = 1, leakedVisibleAxes = [] } = {}) {
  const app = deferred(), events = [], snapshots = [];
  app.promise.catch(() => {}); // A pre-barrier implementation must also fail cleanly.
  if (!loading) app.resolve();
  const overview = { runtime: { inputActive: false, isEmergency: false, ...runtime }, input: { mode } };
  const values = { L0: '500', L1: '500', L2: '500', ...axisValues };
  const state = { connected, checked };
  function control(kind, { axis, visible = true, count = 1 } = {}) {
    return {
      async waitFor(options) {
        assert.ok(['visible', 'attached'].includes(options.state));
        events.push(options.state + ':' + kind + (axis ? ':' + axis : ''));
        await app.promise;
        assert.equal(count, 1, 'A locator must resolve to exactly one attached element.');
        if (options.state === 'visible') assert.equal(visible, true, 'A collapsed extra axis is attached, not visible.');
      },
      async count() { return count; },
      async isVisible() { events.push('visibility:' + kind + (axis ? ':' + axis : '')); return visible && count === 1; },
      async isEnabled() { events.push('enabled:' + kind); return state.connected; },
      async isChecked() { events.push('checked:input'); return state.checked; },
      async inputValue() {
        assert.equal(count, 1, 'An axis value requires exactly one attached slider.');
        events.push('value:' + axis); return values[axis];
      },
    };
  }
  function sliders(axes, visible, { name, includeHidden = false } = {}) {
    const selected = axes.filter(axis => (visible || includeHidden || leakedVisibleAxes.includes(axis))
      && (!name || name.test(axis + ' fixture label')));
    return control('slider', { axis: name && selected[0], visible: visible || leakedVisibleAxes.includes(selected[0]), count: selected.length });
  }
  const page = {
    locator(selector) {
      if (selector === '.app-shell' || selector === '.manual-workspace') return control(selector);
      if (selector === '.manual-primary') return {
        getByRole(role, options) {
          assert.equal(role, 'slider');
          return sliders(primaryAxes, true, options);
        },
      };
      assert.equal(selector, 'details[data-testid="manual-more-axes"]');
      const count = extraDisclosureTag === 'details' ? extraDisclosureCount : 0;
      return {
        ...control('extra-axes', { visible: extraDisclosureVisible, count }),
        async getAttribute(name) { assert.equal(name, 'open'); return extrasOpen ? '' : null; },
        getByRole(role, options) {
          assert.equal(role, 'slider');
          return sliders(count === 1 ? extraAxes : [], extrasOpen && extraDisclosureVisible, options);
        },
      };
    },
    getByRole(role, { name }) {
      if (role === 'switch') {
        assert.ok(name.test('Input enabled') && name.test('输入启用'));
        return control('input');
      }
      assert.equal(role, 'button');
      assert.ok(name.test('Send once') && name.test('发送一次'));
      return control('send-once');
    },
    async evaluate() { events.push('fresh-service-state'); return structuredClone(overview); },
    async screenshot(options) { events.push('capture'); snapshots.push(options); },
  };
  return { page, events, snapshots, showWorkbench: app.resolve, failWorkbench: app.reject, state, overview };
}

test('desktop capture waits for hydrated and connected controls even when the service is already ready', async () => {
  const fixture = pageFixture({ loading: true, connected: false });
  const capture = captureInitialWorkbench(fixture.page, 'isolated-capture.png');
  try {
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(fixture.snapshots, [], 'The loading shell cannot be accepted as a workbench capture');
    fixture.showWorkbench();
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(fixture.snapshots, [], 'Visible controls still awaiting the connection cannot be captured');
    fixture.state.connected = true;
    const proof = await capture;
    assert.deepEqual(fixture.snapshots, [{ path: 'isolated-capture.png' }]);
    assert.deepEqual(proof, { inputActive: false, isEmergency: false, inputMode: 'manual', manualAxes: { L0: 500, L1: 500, L2: 500 },
      visibleManualAxes: ['L0'], extraAxesCollapsed: true, extraAxisCount: 11 });
    for (const milestone of ['visible:.app-shell', 'visible:.manual-workspace', 'enabled:input', 'enabled:send-once',
      'checked:input', 'visible:extra-axes', 'visible:slider:L0', 'attached:slider:L1', 'attached:slider:L2',
      'visibility:slider:L0', 'visibility:slider:L1', 'visibility:slider:L2',
      'value:L0', 'value:L1', 'value:L2', 'fresh-service-state']) {
      assert.ok(fixture.events.indexOf(milestone) < fixture.events.indexOf('capture'), milestone);
      assert.ok(fixture.events.includes(milestone), milestone);
    }
    assert.equal(fixture.events.includes('visible:slider:L1') || fixture.events.includes('visible:slider:L2'), false);
  } finally {
    fixture.state.connected = true; fixture.showWorkbench();
    await capture.catch(() => {});
  }
});

test('desktop capture rejects an armed UI or service instead of recording a contradictory initial state', async () => {
  for (const options of [{ checked: true }, { runtime: { inputActive: true } }]) {
    const fixture = pageFixture(options);
    await assert.rejects(captureInitialWorkbench(fixture.page, 'unused.png'), /input|Input/);
    assert.deepEqual(fixture.snapshots, []);
  }
});

test('desktop capture requires each actual initial axis value', async () => {
  for (const axis of ['L0', 'L1', 'L2']) {
    const fixture = pageFixture({ axisValues: { [axis]: '700' } });
    await assert.rejects(captureInitialWorkbench(fixture.page, 'unused.png'), /500/);
    assert.deepEqual(fixture.snapshots, []);
  }
});

test('desktop capture propagates failed workbench readiness without taking a screenshot', async () => {
  const fixture = pageFixture({ loading: true });
  const capture = captureInitialWorkbench(fixture.page, 'unused.png');
  fixture.failWorkbench(new Error('isolated workbench failed to render'));
  await assert.rejects(capture, /failed to render/);
  assert.deepEqual(fixture.snapshots, []);
});

test('desktop capture rejects emergency and unexpected input mode snapshots', async () => {
  for (const options of [{ runtime: { isEmergency: true } }, { mode: 'osc' }]) {
    const fixture = pageFixture(options);
    await assert.rejects(captureInitialWorkbench(fixture.page, 'unused.png'), /Emergency|manual/);
    assert.deepEqual(fixture.snapshots, []);
  }
});

test('desktop page contract keeps L1 and L2 outside the visible primary controls', async () => {
  const { page } = pageFixture();
  const primary = page.locator('.manual-primary');
  assert.equal(await primary.getByRole('slider').count(), 1);
  for (const axis of ['L1', 'L2']) {
    const oldSelector = primary.getByRole('slider', { name: new RegExp('^' + axis + '\\s') });
    assert.equal(await oldSelector.count(), 0);
    await assert.rejects(oldSelector.waitFor({ state: 'visible' }), /exactly one attached/);
  }
  const extras = page.locator('details[data-testid="manual-more-axes"]');
  assert.equal(await extras.getByRole('slider').count(), 0);
  assert.equal(await extras.getByRole('slider', { includeHidden: true }).count(), 11);
});

test('desktop capture rejects an incorrect visible manual axis layout', async () => {
  for (const options of [{ primaryAxes: ['L0', 'L1'] }, { primaryAxes: ['L1'] },
    { leakedVisibleAxes: ['L1'] }, { leakedVisibleAxes: ['L2'] }]) {
    const fixture = pageFixture(options);
    await assert.rejects(captureInitialWorkbench(fixture.page, 'unused.png'), /one axis|exactly one attached|Only L0/);
    assert.deepEqual(fixture.snapshots, []);
  }
});

test('desktop capture requires one visible closed native extra-axis disclosure', async () => {
  for (const options of [{ extrasOpen: true }, { extraDisclosureVisible: false },
    { extraDisclosureTag: 'div' }, { extraDisclosureCount: 2 }]) {
    const fixture = pageFixture(options);
    await assert.rejects(captureInitialWorkbench(fixture.page, 'unused.png'), /closed|visible|exactly one attached/);
    assert.deepEqual(fixture.snapshots, []);
  }
});

test('desktop capture requires all eleven mounted extras including hidden L1 and L2', async () => {
  for (const extraAxes of [extraAxisNames.slice(1), [...extraAxisNames, 'X0'],
    extraAxisNames.map(axis => axis === 'L1' ? 'X0' : axis), extraAxisNames.map(axis => axis === 'L2' ? 'X0' : axis)]) {
    const fixture = pageFixture({ extraAxes });
    await assert.rejects(captureInitialWorkbench(fixture.page, 'unused.png'), /eleven|exactly one attached/);
    assert.deepEqual(fixture.snapshots, []);
  }
});
