import assert from 'node:assert/strict';
import test from 'node:test';
import { captureInitialWorkbench } from '../../scripts/smoke-electron.mjs';

function deferred() {
  let resolve, reject;
  const promise = new Promise((accept, fail) => { resolve = accept; reject = fail; });
  return { promise, resolve, reject };
}

/** Only a page contract fixture: no browser, application, file capture or service. */
function pageFixture({ loading = false, connected = true, checked = false, axisValues = {}, runtime = {}, mode = 'manual' } = {}) {
  const app = deferred(), events = [], snapshots = [];
  app.promise.catch(() => {}); // A pre-barrier implementation must also fail cleanly.
  if (!loading) app.resolve();
  const overview = { runtime: { inputActive: false, isEmergency: false, ...runtime }, input: { mode } };
  const values = { L0: '500', L1: '500', L2: '500', ...axisValues };
  const state = { connected, checked };
  function control(kind, axis) {
    return {
      async waitFor(options) {
        assert.deepEqual(options, { state: 'visible' });
        events.push('visible:' + kind + (axis ? ':' + axis : ''));
        await app.promise;
      },
      async isEnabled() { events.push('enabled:' + kind); return state.connected; },
      async isChecked() { events.push('checked:input'); return state.checked; },
      async inputValue() { events.push('value:' + axis); return values[axis]; },
    };
  }
  const page = {
    locator(selector) {
      if (selector === '.app-shell' || selector === '.manual-workspace') return control(selector);
      assert.equal(selector, '.manual-primary');
      return {
        getByRole(role, { name }) {
          assert.equal(role, 'slider');
          const axis = ['L0', 'L1', 'L2'].find(candidate => name.test(candidate + ' fixture label'));
          assert.ok(axis, 'Actual shared-workbench axis names are required');
          return control('slider', axis);
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
    assert.deepEqual(proof, { inputActive: false, isEmergency: false, inputMode: 'manual', manualAxes: { L0: 500, L1: 500, L2: 500 } });
    for (const milestone of ['visible:.app-shell', 'visible:.manual-workspace', 'enabled:input', 'enabled:send-once',
      'checked:input', 'value:L0', 'value:L1', 'value:L2', 'fresh-service-state']) {
      assert.ok(fixture.events.indexOf(milestone) < fixture.events.indexOf('capture'), milestone);
    }
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
