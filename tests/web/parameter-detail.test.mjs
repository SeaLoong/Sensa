import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveOscParameterDetail } from '../../src/web/osc-workspace.js';

const opened = { path: 'Custom/Depth', sourceKey: 'a', value: '.1', timestampMs: 1000 };

test('parameter details follow the selected source and its current sample', () => {
  const next = { ...opened, value: '.7', timestampMs: 2000 };
  const other = { ...opened, sourceKey: 'b', value: '.9', timestampMs: 3000 };
  assert.deepEqual(resolveOscParameterDetail(opened, [other, next]), { entry: next, mode: 'live' });
  assert.deepEqual(resolveOscParameterDetail(opened, [other]), { entry: opened, mode: 'missing' });
  assert.deepEqual(resolveOscParameterDetail(opened, []), { entry: opened, mode: 'missing' });
  assert.equal(resolveOscParameterDetail(null, [next]), null);
});

test('frozen and disconnected details distinguish displayed values from live reception', () => {
  const frozen = { ...opened, value: '.2', timestampMs: 1500 };
  assert.deepEqual(resolveOscParameterDetail(opened, [frozen], { frozen: true }), { entry: frozen, mode: 'frozen' });
  assert.deepEqual(resolveOscParameterDetail(opened, [frozen], { connected: false }), { entry: frozen, mode: 'offline' });
  assert.deepEqual(resolveOscParameterDetail(opened, [frozen], { frozen: true, connected: false }), { entry: frozen, mode: 'frozen' });
  assert.deepEqual(resolveOscParameterDetail(opened, null), { entry: opened, mode: 'missing' });
});
