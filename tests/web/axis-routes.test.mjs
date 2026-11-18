import assert from 'node:assert/strict';
import test from 'node:test';
import { axisRoutePresets, buildAxisRoute, routeDependencies } from '../../src/web/axis-routes.js';

test('each route preset connects the OSC input through precisely its ordered steps to L0', () => {
  const presets = axisRoutePresets();
  assert.deepEqual(presets.map(preset => preset.steps.map(step => step.operation)), [[], ['Smooth'], ['DeadZone', 'Smooth']]);
  for (const preset of presets) {
    const path = '/avatar/parameters/Depth';
    const { mapping, steps } = buildAxisRoute(' ' + path + ' ', preset.steps, 'Depth', [{ id: 'Signal1' }]);
    let expectedSource = { sourceMode: 'Direct', oscPath: path };
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
