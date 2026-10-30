import assert from 'node:assert/strict';
import test from 'node:test';
import { setImmediate } from 'node:timers/promises';
import { OutputCoordinator } from '../../src/core/outputs/coordinator.ts';
import { sample, invalidSample } from '../../src/core/runtime/model.ts';
import type { OutputDeviceConfig } from '../../src/core/runtime/model.ts';
import { configuration, output, frame, binding, MemoryAdapter, deferred } from './output-support.ts';

test('independent output lanes keep a slow destination from delaying fast destinations and coalesce latest motion', async () => {
  const release = deferred<void>(), started = deferred<void>(), slow = new MemoryAdapter(), fast = new MemoryAdapter();
  const original = slow.sendMotion.bind(slow); let first = true;
  slow.sendMotion = async value => { await original(value); if (first) { first = false; started.resolve(); await release.promise; } };
  const coordinator = new OutputCoordinator(configuration([output('TCodeTcp', 'slow'), output('TCodeTcp', 'fast')]), { createAdapter: config => config.id === 'slow' ? slow : fast, canSend: () => true });
  await coordinator.connectEnabled(); await coordinator.sendFrame(frame({ L0: .1 })); await started.promise;
  await Promise.all([coordinator.sendFrame(frame({ L0: .4 })), coordinator.sendFrame(frame({ L0: .9 }))]); await setImmediate();
  assert.equal(fast.frames.at(-1)?.values.L0, .9); assert.equal(slow.frames.length, 1);
  release.resolve(); await coordinator.flush(); assert.deepEqual(slow.frames.map(value => value.values.L0), [.1, .9]); await coordinator.close();
});
test('whole-output stop is a barrier before a frame from a newly enabled generation', async () => {
  const release = deferred<void>(), started = deferred<void>(), adapter = new MemoryAdapter(), events: string[] = [];
  let first = true;
  adapter.sendMotion = async value => { events.push('frame:' + value.values.L0); if (first) { first = false; started.resolve(); await release.promise; } };
  adapter.stop = async () => { events.push('stop'); };
  const coordinator = new OutputCoordinator(configuration([output('TCodeTcp')]), { createAdapter: () => adapter, canSend: () => true });
  await coordinator.connectEnabled(); await coordinator.sendFrame(frame({ L0: .1 })); await started.promise;
  const stopping = coordinator.emergencyStop(); await coordinator.sendFrame(frame({ L0: .8 })); assert.deepEqual(events, ['frame:0.1']);
  release.resolve(); await stopping; await coordinator.flush(); assert.deepEqual(events, ['frame:0.1', 'stop', 'frame:0.8']); await coordinator.close();
});
test('disabling input drops pending old motion and never emits it after stop', async () => {
  let active = true; const release = deferred<void>(), started = deferred<void>(), adapter = new MemoryAdapter(), events: string[] = [];
  adapter.sendMotion = async value => { events.push(String(value.values.L0)); started.resolve(); await release.promise; };
  adapter.stop = async () => { events.push('stop'); };
  const coordinator = new OutputCoordinator(configuration([output('TCodeUdp')]), { createAdapter: () => adapter, canSend: () => active });
  await coordinator.connectEnabled(); await coordinator.sendFrame(frame({ L0: .1 })); await started.promise; await coordinator.sendFrame(frame({ L0: .9 }));
  active = false; const stopping = coordinator.emergencyStop(); release.resolve(); await stopping; await coordinator.flush(); assert.deepEqual(events, ['0.1', 'stop']); await coordinator.close();
});
test('per-binding invalidity cancels stale targets and sends the configured stop value once', async () => {
  const device = output('HttpJson'); device.signal.bindings = [binding('x', 'motor')]; device.signal.bindings[0]!.stopValue = .2;
  const adapter = new MemoryAdapter(), release = deferred<void>(), started = deferred<void>(); let first = true;
  adapter.sendSignal = async value => { adapter.signals.push(value); if (first) { first = false; started.resolve(); await release.promise; } };
  const coordinator = new OutputCoordinator(configuration([device]), { createAdapter: () => adapter, canSend: () => true });
  await coordinator.connectEnabled(); coordinator.updateBindings(0, () => sample(.1, 0)); await started.promise;
  coordinator.updateBindings(100, () => sample(.8, 100)); coordinator.updateBindings(200, () => invalidSample('expired'));
  release.resolve(); await coordinator.flush(); assert.deepEqual(adapter.signals.map(value => value.value), [.1, .2]);
  coordinator.updateBindings(300, () => invalidSample('expired')); await coordinator.flush(); assert.equal(adapter.signals.length, 2); await coordinator.close();
});
test('binding range curves, send rate and epsilon run in the shared coordinator', async () => {
  const device = output('HttpJson'), route = binding('x', 'motor'); route.outputMin = 10; route.outputMax = 20; route.curve = 'SCurve'; route.rateHz = 10; route.epsilon = .1; device.signal.bindings = [route];
  const adapter = new MemoryAdapter(), coordinator = new OutputCoordinator(configuration([device]), { createAdapter: () => adapter, canSend: () => true });
  await coordinator.connectEnabled(); coordinator.updateBindings(0, () => sample(.5, 0)); await coordinator.flush(); assert.equal(adapter.signals[0]?.value, 15);
  coordinator.updateBindings(50, () => sample(.9, 50)); await coordinator.flush(); assert.equal(adapter.signals.length, 1);
  coordinator.updateBindings(100, () => sample(.501, 100)); await coordinator.flush(); assert.equal(adapter.signals.length, 1);
  coordinator.updateBindings(200, () => sample(1, 200)); await coordinator.flush(); assert.equal(adapter.signals.at(-1)?.value, 20); await coordinator.close();
});
test('OnEvent does not repeatedly fire while high and resets after input stop', async () => {
  const device = output('HttpJson'), route = binding('event', 'trigger'); route.sendMode = 'OnEvent'; device.signal.bindings = [route];
  const adapter = new MemoryAdapter(), coordinator = new OutputCoordinator(configuration([device]), { createAdapter: () => adapter, canSend: () => true });
  await coordinator.connectEnabled(); for (const [at, value] of [[0, 1], [50, 1], [100, 0], [150, 1]] as const) { coordinator.updateBindings(at, () => sample(value, at)); await coordinator.flush(); }
  assert.equal(adapter.signals.length, 2); await coordinator.emergencyStop(); coordinator.updateBindings(200, () => sample(1, 200)); await coordinator.flush(); assert.equal(adapter.signals.at(-1)?.value, 1); await coordinator.close();
});
test('spatial or OSC gate stop leaves independent bindings running', async () => {
  const motion = output('TCodeTcp', 'motion'), bound = output('HttpJson', 'bound'); bound.signal.bindings = [binding('x', 'motor')];
  const adapters = new Map([['motion', new MemoryAdapter()], ['bound', new MemoryAdapter()]]);
  const coordinator = new OutputCoordinator(configuration([motion, bound]), { createAdapter: config => adapters.get(config.id)!, canSend: () => true });
  await coordinator.connectEnabled(); coordinator.updateBindings(0, () => sample(.6, 0)); await coordinator.flush(); await coordinator.stopUnbound();
  assert.equal(adapters.get('motion')?.stops, 1); assert.equal(adapters.get('bound')?.stops, 0); assert.equal(adapters.get('bound')?.connected, true); await coordinator.close();
});
test('configuration enabled transitions match existing automatic connect/disconnect behavior', async () => {
  const created: { config: OutputDeviceConfig; adapter: MemoryAdapter }[] = [];
  const initial = output('TCodeTcp'); initial.enabled = false;
  const coordinator = new OutputCoordinator(configuration([initial]), { createAdapter: config => { const adapter = new MemoryAdapter(); created.push({ config, adapter }); return adapter; }, canSend: () => true });
  const enabled = structuredClone(initial); enabled.enabled = true; await coordinator.reconfigure(configuration([enabled])); assert.equal(coordinator.isConnected('out'), true);
  await coordinator.disconnect('out'); await coordinator.reconfigure(configuration([enabled])); assert.equal(coordinator.isConnected('out'), false, 'unrelated saves do not undo a manual disconnection');
  const newTarget = structuredClone(enabled); newTarget.port = 40000; await coordinator.reconfigure(configuration([newTarget])); assert.equal(coordinator.isConnected('out'), true);
  newTarget.enabled = false; await coordinator.reconfigure(configuration([newTarget])); assert.equal(coordinator.isConnected('out'), false); assert.ok(created.every(value => value.adapter.closes >= 1)); await coordinator.close();
});
test('a late adapter creation after disconnect is closed without being published', async () => {
  const adapter = new MemoryAdapter(), created = deferred<MemoryAdapter>();
  const coordinator = new OutputCoordinator(configuration([output('TCodeTcp')]), { createAdapter: () => created.promise });
  const connecting = coordinator.connect('out'); await coordinator.disconnect('out'); created.resolve(adapter); assert.equal(await connecting, false); assert.equal(adapter.closes, 1); assert.equal(coordinator.isConnected('out'), false);
});
test('snapshot preserves existing WebUI routes/vendor fields and missing-primary discovery stays empty', async () => {
  const device = output('Handy'); device.signal.bindings = [binding()]; const adapter = new MemoryAdapter();
  const rich = Object.assign(adapter, { scriptState: () => ({ supported: true, loopSupported: true, prepared: true, playing: false, loop: true, positionMs: 123 }) });
  const coordinator = new OutputCoordinator(configuration([device]), { createAdapter: () => rich }); await coordinator.connect('out');
  const view = coordinator.snapshot()[0] as { signalStatus: { routes: unknown[] }; deviceApi: { supportsScripts: boolean; scriptPrepared: boolean; scriptLoop: boolean } };
  assert.equal(view.signalStatus.routes.length, 1); assert.equal(view.deviceApi.scriptPrepared, true); assert.equal(view.deviceApi.scriptLoop, true); assert.deepEqual(coordinator.devices(''), []); await coordinator.close();
});
test('vendor play and seek require current activation, not the caller request snapshot', async () => {
  const device = output('Handy'), adapter = new MemoryAdapter(); let invoked = false;
  const rich = Object.assign(adapter, { async vendorScript() { invoked = true; } });
  const coordinator = new OutputCoordinator(configuration([device]), { createAdapter: () => rich }); await coordinator.connect('out');
  await assert.rejects(coordinator.vendorScript('out', 'play'), /Enable input/u); assert.equal(invoked, false); await coordinator.close();
});
test('failed destinations stop and close independently while healthy fanout continues', async () => {
  const failed = new MemoryAdapter(), healthy = new MemoryAdapter();
  failed.sendMotion = async () => { throw new Error('simulated transport failure'); };
  const coordinator = new OutputCoordinator(configuration([output('TCodeTcp', 'failed'), output('TCodeTcp', 'healthy')]), { createAdapter: config => config.id === 'failed' ? failed : healthy, canSend: () => true });
  await coordinator.connectEnabled(); await coordinator.sendFrame(frame({ L0: .3 })); await coordinator.flush();
  assert.equal(failed.stops, 1); assert.equal(failed.closes, 1); assert.equal(coordinator.isConnected('failed'), false); assert.equal(healthy.frames.at(-1)?.values.L0, .3);
  await coordinator.sendFrame(frame({ L0: .8 })); await coordinator.flush(); assert.equal(healthy.frames.at(-1)?.values.L0, .8); assert.equal(failed.stops, 1); await coordinator.close();
});
test('disconnecting a bound protocol sends its configured fallback before closing', async () => {
  const device = output('Midi'), route = binding('cc', 'CC/1/7'); route.stopValue = 12; device.signal.bindings = [route]; const adapter = new MemoryAdapter();
  const coordinator = new OutputCoordinator(configuration([device]), { createAdapter: () => adapter, canSend: () => true }); await coordinator.connect('out'); await coordinator.disconnect('out'); assert.equal(adapter.signals.at(-1)?.value, 12); assert.equal(adapter.closes, 1);
});
test('late connection while already active receives the latest motion, but gate stop clears stale motion', async () => {
  const adapter = new MemoryAdapter(), coordinator = new OutputCoordinator(configuration([output('TCodeTcp')]), { createAdapter: () => adapter, canSend: () => true });
  await coordinator.sendFrame(frame({ L0: .6 })); await coordinator.connect('out'); await coordinator.flush(); assert.equal(adapter.frames.at(-1)?.values.L0, .6);
  await coordinator.disconnect('out'); await coordinator.stopUnbound(); await coordinator.connect('out'); await coordinator.flush(); assert.equal(adapter.frames.length, 1); await coordinator.close();
});
