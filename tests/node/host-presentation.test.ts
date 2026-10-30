import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { OscParameterStore, type OscSource } from '../../src/core/protocols/osc.ts';
import { createDefaultConfiguration } from '../../src/core/runtime/configuration.ts';
import { defaultSignalMapping } from '../../src/core/runtime/configuration-defaults.ts';
import { RuntimeEngine } from '../../src/core/runtime/runtime.ts';
import { buildOverview } from '../../src/core/runtime/presentation.ts';
import { record } from '../../src/core/runtime/application.ts';
import { OutputCoordinator } from '../../src/core/outputs/coordinator.ts';
import { OscServices } from '../../src/node/inputs/osc-services.ts';

function fixture(t: TestContext) {
  let now = 100;
  const store = new OscParameterStore(() => now), config = createDefaultConfiguration();
  config.osc.enabled = config.osc.oscQueryEnabled = false;
  config.signals = ['CI/Depth', 'CI/*', 'CI/Flag', 'CI/Counter'].map(oscPath => ({ ...defaultSignalMapping(), oscPath }));
  const runtime = new RuntimeEngine(config, { now: () => now, oscStore: store });
  const osc = new OscServices(config.osc, store, { now: () => now });
  const outputs = new OutputCoordinator(config, { createAdapter: () => { throw new Error('No device adapters in presentation units.'); } });
  t.after(async () => { runtime.dispose(); await osc.dispose(); await outputs.close(); });
  return { store, osc, at: (value: number) => { now = value; },
    overview: () => buildOverview(runtime, { outputs, oscSnapshot: () => osc.snapshot(), readOscLatest: pattern => store.tryGetLatest(pattern) }) };
}
const source = (key: string): OscSource => ({ key, label: key + ' producer', persistentId: 'fixture:' + key, address: '127.0.0.1', port: 9001 });
function latest(overview: Record<string, unknown>, index: number) {
  return record(record((overview['signals'] as unknown[])[index])['latest']);
}

test('signal overview exposes raw numeric OSC values while parameter previews retain formatted text', t => {
  const rig = fixture(t);
  rig.store.set('CI/Depth', .75, source('one'), 'Float');
  rig.store.set('CI/Flag', true, source('one'), 'Bool');
  rig.store.set('CI/Counter', 7, source('one'), 'Int');
  const overview = rig.overview();
  assert.equal(latest(overview, 0)['value'], .75);
  assert.equal(latest(overview, 0)['type'], 'Float');
  assert.equal(latest(overview, 0)['sourceKey'], 'one');
  assert.equal(latest(overview, 0)['sourcePersistentId'], 'fixture:one');
  assert.equal(latest(overview, 2)['value'], 1);
  assert.equal(latest(overview, 3)['value'], 7);
  const preview = record(overview['osc'])['preview'] as unknown[];
  assert.equal(record(preview.find(value => record(value)['path'] === 'CI/Depth'))['value'], '0.75');
});

test('signal overview resolves wildcard paths and follows the selected producer without falling back', t => {
  const rig = fixture(t);
  rig.store.set('CI/Depth', .25, source('one'), 'Float');
  rig.at(200); rig.store.set('CI/Depth', .75, source('two'), 'Float');
  rig.at(300); rig.store.set('CI/DepthExtra', .5, source('one'), 'Float');
  assert.equal(latest(rig.overview(), 0)['value'], .75);
  assert.equal(latest(rig.overview(), 1)['path'], 'CI/DepthExtra');
  assert.equal(latest(rig.overview(), 1)['value'], .5);
  rig.store.preferredSourceKey = 'one';
  assert.equal(latest(rig.overview(), 0)['value'], .25);
  rig.store.preferredSourceKey = 'unavailable:remembered';
  for (const row of rig.overview()['signals'] as unknown[]) assert.equal(record(row)['latest'], null);
});
