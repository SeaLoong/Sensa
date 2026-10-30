import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import test, { type TestContext } from 'node:test';
import { setImmediate } from 'node:timers/promises';
import { ApplicationFacade } from '../../src/core/runtime/application.ts';
import { RuntimeEngine } from '../../src/core/runtime/runtime.ts';
import { OutputCoordinator } from '../../src/node/outputs/index.ts';
import { deadline } from '../../src/core/outputs/lifecycle.ts';
import { configuration, deferred, output } from './output-support.ts';

async function fixture(t: TestContext) {
  const began = deferred<void>(), cancelled = deferred<void>(), paths: string[] = [];
  const pending = new Set<http.ServerResponse>();
  let cancelledSetups = 0, setupResponse: http.ServerResponse | undefined;
  const reply = (response: http.ServerResponse, value: object): void => {
    if (response.destroyed || response.writableEnded) return;
    response.writeHead(200, { 'content-type': 'application/json' }); response.end(JSON.stringify(value));
  };
  const server = http.createServer((request, response) => {
    const path = new URL(request.url ?? '/', 'http://fixture').pathname; paths.push(path); request.resume();
    if (path === '/hssp/setup') {
      setupResponse = response; pending.add(response);
      response.on('close', () => {
        pending.delete(response);
        if (!response.writableFinished) { cancelledSetups++; cancelled.resolve(); }
      });
      began.resolve();
    } else reply(response, path === '/connected' ? { connected: true }
      : path === '/info' ? { fwVersion: '3.0.0' }
      : path === '/servertime' ? { serverTime: Date.now() } : {});
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const config = output('Handy'); config.device.endpoint = `http://127.0.0.1:${address.port}/`;
  config.device.connectionKey = 'isolated-facade-test'; config.device.scriptTimeoutMs = 60000;
  let coordinator: OutputCoordinator | undefined;
  const runtime = new RuntimeEngine(configuration([config]), {
    stopOutputs: () => coordinator?.emergencyStop(),
  });
  coordinator = new OutputCoordinator(runtime.getConfig(), {
    canSend: () => runtime.getSnapshot()['inputActive'] === true && runtime.getSnapshot()['isEmergency'] !== true,
  });
  const outputs = coordinator;
  // Match both actual hosts: preparation/configuration mutations share one serial tail.
  let mutationTail: Promise<unknown> = Promise.resolve();
  const app = new ApplicationFacade(runtime, {
    outputs,
    inputChange<T>(operation: () => T | Promise<T>): Promise<T> {
      const current = mutationTail.catch(() => undefined).then(operation);
      mutationTail = current; return current;
    },
    applyConfiguration: async () => { throw new Error('No configuration changes in this fixture.'); },
    selectOscSource: () => ({}), refreshOscQuery: async () => ({}), syncOsc: () => {},
    listSerialPorts: () => [], listMidiPorts: () => [], listRecordings: () => [],
    readRecording: async () => { throw new Error('No recordings in this fixture.'); },
    logs: () => [], notify: () => {}, log: () => {},
  });
  t.after(async () => {
    // Also release a failed assertion's held setup before draining queued commands.
    await outputs.emergencyStop(); await mutationTail.catch(() => undefined);
    runtime.dispose(); await runtime.flush(); await outputs.close();
    for (const response of pending) response.destroy();
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
  });
  await outputs.connectEnabled();
  return { app, runtime, outputs, config, began, cancelled, paths,
    cancelledSetups: () => cancelledSetups,
    finishLateSetup: () => { assert.ok(setupResponse); reply(setupResponse, {}); } };
}

for (const action of ['stop', 'emergency'] as const) {
  test(`facade ${action} cancels held script preparation before its mutation queue and cannot resume queued play`, async t => {
    const rig = await fixture(t), path = `/api/control/output/${rig.config.id}/script-`;
    const preparing = rig.app.execute('POST', path + 'prepare', { url: 'https://example.test/script.csv' });
    await deadline(rig.began.promise, 2000, 'Held upstream setup');
    assert.throws(() => rig.runtime.setInputActive(true), /Updating input setup/u);
    let playSettled = false;
    const playing = rig.app.execute('POST', path + 'play', { positionMs: 0 }).finally(() => { playSettled = true; });
    await setImmediate();
    assert.equal(playSettled, false, 'ordinary script mutations must stay queued behind preparation');
    const stopped = await deadline(rig.app.execute('POST', action === 'stop' ? path + 'stop'
      : '/api/control/runtime/emergency-stop', {}), 2000, 'Facade cancellation bypasses preparation queue');
    assert.equal(stopped.statusCode, 200);
    await deadline(rig.cancelled.promise, 2000, 'Upstream setup socket is actually cancelled');
    assert.equal(rig.cancelledSetups(), 1);
    assert.equal((await preparing).statusCode, 400);
    assert.equal((await playing).statusCode, 400, 'queued playback must not arm input after cancellation');
    rig.finishLateSetup(); await setImmediate();
    const snapshot = rig.outputs.snapshot()[0] as { deviceApi: { scriptPrepared: boolean; scriptPlaying: boolean } };
    assert.equal(snapshot.deviceApi.scriptPrepared, false); assert.equal(snapshot.deviceApi.scriptPlaying, false);
    assert.equal(rig.runtime.getSnapshot()['inputActive'], false);
    assert.equal(rig.runtime.getSnapshot()['isEmergency'], action === 'emergency');
    assert.ok(rig.paths.includes('/hssp/stop'));
    assert.equal(rig.paths.some(value => value === '/servertime' || value === '/hssp/play' || value.startsWith('/hdsp/')), false);
    // Releasing the failed preparation removes its activation block; only explicit activation can restart input.
    rig.runtime.clearEmergency(); rig.runtime.setInputActive(true);
    assert.equal(rig.runtime.getSnapshot()['inputActive'], true);
  });
}
