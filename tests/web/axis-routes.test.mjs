import assert from 'node:assert/strict';
import test from 'node:test';
import { encodeOscMessage, parseOscPacket, OscParameterStore } from '../../src/core/protocols/osc.ts';
import { RuntimeEngine } from '../../src/core/runtime/runtime.ts';
import { axisRoutePresets, appendRouteSteps, previousMappingSource, routeDependencies } from '../../src/web/axis-routes.js';

import { makeSignalDraft } from '../../src/web/configuration.js';

function buildAxisRoute(path, steps, role, existing) {
  return appendRouteSteps(makeSignalDraft({ oscPath: path, role }), steps, existing);
}

test('adding processing to an existing calculated mapping keeps its calibration and upstream identity', () => {
  const draft = makeSignalDraft({ oscPath: 'Blend', sourceMode: 'Computed', role: 'V0', mappedMin: 200, invertDirection: true });
  const route = appendRouteSteps(draft, axisRoutePresets()[1].steps, [{ id: 'Blend' }]);
  assert.deepEqual(route.mapping, { ...draft, oscPath: route.steps[0].id });
  assert.deepEqual({ ...route.mapping, ...previousMappingSource(route.mapping, route.steps) }, draft);
  assert.partialDeepStrictEqual(route.steps[0].inputs, [{ sourceMode: 'Computed', oscPath: 'Blend' }]);
});

test('each route preset connects the OSC input through precisely its ordered steps to L0', () => {
  const presets = axisRoutePresets();
  assert.deepEqual(presets.map(preset => preset.steps.map(step => step.operation)), [[], ['Smooth'], ['DeadZone', 'Smooth']]);
  for (const preset of presets) {
    const path = '/avatar/parameters/Depth';
    const { mapping, steps } = buildAxisRoute(' ' + path + ' ', preset.steps, 'Depth', [{ id: 'Signal1' }]);
    let expectedSource = { sourceMode: 'Direct', oscPath: 'Depth' };
    for (const [index, step] of steps.entries()) {
      assert.notEqual(step.id, 'Signal1');
      assert.partialDeepStrictEqual(step, preset.steps[index]);
      assert.partialDeepStrictEqual(step.inputs, [expectedSource]);
      expectedSource = { sourceMode: 'Computed', oscPath: step.id };
    }
    assert.partialDeepStrictEqual(mapping, { ...expectedSource, role: 'Depth', vrchatMin: 0, vrchatMax: 1, mappedMin: 0, mappedMax: 999 });
    assert.deepEqual(routeDependencies(mapping, Object.freeze(steps)), steps);
  }
});

test('route drafts enforce the calculation limits without blocking pass-through routes', () => {
  const step = { operation: 'Smooth' }, path = '/depth', existing = Array.from({ length: 64 }, (_, i) => ({ id: 'Signal' + (i + 1) }));
  assert.equal(buildAxisRoute('  ', [], 'Depth', []), null);
  assert.equal(buildAxisRoute(path, [step], 'Depth', existing), null);
  assert.equal(buildAxisRoute(path, Array(17).fill(step), 'Depth', []), null);
  assert.equal(buildAxisRoute(path, [], 'Depth', existing).mapping.oscPath, path);
});

test('a shared upstream input appears once even when an unfinished graph contains a cycle', () => {
  const input = oscPath => ({ sourceMode: 'Computed', oscPath });
  const shared = { id: 'shared', inputs: [input('sum')] }, sum = { id: 'sum', inputs: [input('shared'), input('shared')] };
  assert.deepEqual(routeDependencies(input('sum'), [sum, shared]), [shared, sum]);
});

test('all presets drive L0 from a decoded VRChat packet when configured with its full address', async () => {
  const address = '/avatar/parameters/Depth';
  for (const preset of axisRoutePresets()) {
    const { steps, mapping } = buildAxisRoute(address, preset.steps, 'Depth', []);
    let now = 1000;
    const frames = [], store = new OscParameterStore(() => now);
    const runtime = new RuntimeEngine({ signals: [mapping], computedSignals: steps }, {
      now: () => now, oscStore: store, sendFrame(frame) { frames.push(frame.values.L0); },
    });
    const receive = value => {
      const [parameter] = parseOscPacket(encodeOscMessage(address, value, 'Float')).values;
      store.set(parameter.path, parameter.value);
    };
    runtime.setInputMode('Osc');
    receive(0.03);
    runtime.setInputActive(true);
    await runtime.flush();
    now += 50;
    receive(0.8);
    runtime.tick();
    await runtime.flush();
    assert.ok(frames.length >= 2, preset.value);
    assert.ok(frames.at(-1) > frames[0], preset.value);
    if (preset.value === 'direct') assert.ok(Math.abs(frames.at(-1) - 0.8) < 0.002);
    if (preset.value === 'filtered') assert.equal(frames[0], 0);
  }
});
