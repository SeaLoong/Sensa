import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';
import { once } from 'node:events';
import { setImmediate } from 'node:timers/promises';
import { VendorAdapter } from '../../src/node/outputs/vendor.ts';
import { OutputCoordinator } from '../../src/node/outputs/index.ts';
import { deadline } from '../../src/core/outputs/lifecycle.ts';
import { output, frame, deferred, configuration } from './output-support.ts';

interface Call { path: string; method: string; body: Record<string, unknown> | null; headers: Headers; redirect: 'error' | 'follow' | 'manual' | undefined }
function vendor(type: 'Handy' | 'Autoblow' | 'VacuGlide' | 'Lovense', version = 2) {
  const config = output(type); config.device.endpoint = 'http://127.0.0.1:40000/'; config.device.connectionKey = 'unit-test'; config.device.apiKey = 'unit-test'; config.device.deviceId = 'toy'; config.device.apiVersion = version; config.device.minIntervalMs = 25;
  const calls: Call[] = [];
  let response: (call: Call) => unknown | Response | Promise<unknown | Response> = call => call.path.endsWith('connected') ? { connected: true } : call.path.endsWith('info') ? { fwVersion: version === 2 ? '3.2.1' : '4.0.0', deviceType: 'vacuglide' } : call.path === 'servertime' ? { [version === 3 ? 'server_time' : 'serverTime']: 2000 } : call.body?.['command'] === 'GetToys' ? { code: 200, data: { toys: { toy: { status: '1' } } } } : type === 'Lovense' ? { code: 200 } : {};
  const fetcher: typeof fetch = async (request, options) => {
    const call: Call = { path: new URL(String(request)).pathname.slice(1), method: options?.method ?? 'GET', body: options?.body ? JSON.parse(String(options.body)) as Record<string, unknown> : null, headers: new Headers(options?.headers), redirect: options?.redirect };
    calls.push(call); const value = await response(call); return value instanceof Response ? value : new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
  };
  const adapter = new VendorAdapter(config, { fetch: fetcher, now: () => 1000, canSend: () => true });
  return { config, adapter, calls, fetcher, setResponse(value: typeof response) { response = value; } };
}

test('Handy v2 streaming keeps native position/duration and zero-speed stop payloads', async () => {
  const device = vendor('Handy'); await device.adapter.connect(); await device.adapter.sendMotion(frame({ L0: .33 }, { deltaMs: 215 })); await device.adapter.stop();
  assert.deepEqual(device.calls.map(call => call.path), ['connected', 'info', 'mode', 'hdsp/xpt', 'hdsp/xpvp']);
  assert.deepEqual(device.calls[3]?.body, { position: 33, duration: 215, stopOnTarget: true, immediateResponse: true });
  assert.deepEqual(device.calls[4]?.body, { position: 33, velocity: 0, stopOnTarget: true, immediateResponse: true });
  assert.ok(device.calls.every(call => call.headers.get('X-Connection-Key') === 'unit-test' && call.redirect === 'error'));
  await device.adapter.close();
});
test('Handy v3 uses mode2 and v3 timing keys without reusing v2 wire names', async () => {
  const device = vendor('Handy', 3); await device.adapter.connect(); await device.adapter.sendMotion(frame({ L0: .4 }, { requestedCommandMode: 'None' }));
  assert.equal(device.calls[2]?.path, 'mode2'); assert.deepEqual(device.calls[3]?.body, { xp: 40, t: 0, stop_on_target: true, immediate_rsp: true }); assert.equal(device.calls[3]?.headers.get('X-Api-Key'), 'unit-test'); await device.adapter.close();
});
test('Handy v3 scripted looping travels on play and lowest-RTT server time is applied', async () => {
  const device = vendor('Handy', 3); device.config.device.scriptUrl = 'https://example.test/script.csv'; device.config.device.offsetMs = 20;
  await device.adapter.connect(); await device.adapter.vendorScript('prepare'); await device.adapter.vendorScript('loop', { loop: true }); await device.adapter.vendorScript('play', { positionMs: 250 });
  assert.equal(device.calls.filter(call => call.path === 'servertime').length, 3); assert.equal(device.calls.some(call => call.path === 'hssp/loop'), false);
  assert.deepEqual(device.calls.find(call => call.path === 'hssp/play')?.body, { start_time: 250, server_time: 2000, loop: true });
  assert.equal(device.adapter.scriptState().playing, true); await device.adapter.stop(); assert.equal(device.adapter.scriptState().playing, false); await device.adapter.close();
});
test('prepared script playback owns a vendor output until explicitly stopped', async () => {
  const device = vendor('Handy'); device.config.device.scriptUrl = 'https://example.test/script.csv'; await device.adapter.connect(); await device.adapter.vendorScript('prepare'); await device.adapter.vendorScript('play');
  const before = device.calls.length; await device.adapter.sendMotion(frame({ L0: .9 })); assert.equal(device.calls.length, before); await device.adapter.stop(); await device.adapter.close();
});
test('older Handy v2 firmware does not claim or call the loop endpoint', async () => {
  const device = vendor('Handy'); device.config.device.scriptUrl = 'https://example.test/script.csv'; device.setResponse(call => call.path === 'connected' ? { connected: true } : call.path === 'info' ? { fwVersion: '3.1.0' } : call.path === 'servertime' ? { serverTime: 2000 } : {});
  await device.adapter.connect(); await device.adapter.vendorScript('prepare'); assert.equal(device.adapter.scriptState().loopSupported, false); await assert.rejects(device.adapter.vendorScript('loop', { loop: true })); await device.adapter.vendorScript('play'); assert.equal(device.calls.some(call => call.path === 'hssp/loop'), false); await device.adapter.close();
});
test('Handy firmware/API mismatch is rejected before output is connected', async () => {
  const device = vendor('Handy'); device.setResponse(call => call.path === 'connected' ? { connected: true } : { fwVersion: '4.0.0' }); await assert.rejects(device.adapter.connect(), /requires API v3/u); assert.equal(device.adapter.connected, false);
});
test('cloud cluster selection cannot silently move device credentials to another origin', async () => {
  const device = vendor('Autoblow'); device.setResponse(() => ({ connected: true, cluster: 'https://different.example/' })); await assert.rejects(device.adapter.connect(), /trusted hostname/u); assert.equal(device.calls.length, 1);
});
test('Autoblow live control exposes speed distinctly from duration', async () => {
  const device = vendor('Autoblow'); device.config.device.speed = 42; await device.adapter.connect(); await device.adapter.sendMotion(frame({ L0: .7 }, { deltaMs: 111 })); await device.adapter.stop();
  assert.deepEqual(device.calls.find(call => call.path === 'autoblow/goto')?.body, { position: 70, speed: 42 }); assert.deepEqual(device.calls.find(call => call.path === 'autoblow/oscillate')?.body, { speed: 0, minY: 0, maxY: 100 }); await device.adapter.close();
});
test('VacuGlide uses target speed and its unconditional motor stop endpoint', async () => {
  const device = vendor('VacuGlide'); await device.adapter.connect(); await device.adapter.sendMotion(frame({ L0: .6 })); await device.adapter.stop(); assert.deepEqual(device.calls.find(call => call.path === 'vacuglide/target-speed')?.body, { targetSpeed: 60 }); assert.equal(device.calls.at(-1)?.path, 'vacuglide/target-speed/stop'); await device.adapter.close();
});
test('Lovense targets one selected toy, sends exact zero and uses Pump 0–3', async () => {
  const device = vendor('Lovense'); device.config.device.axis = 'V0'; device.config.device.function = 'Pump'; await device.adapter.connect(); await device.adapter.sendMotion(frame({ V0: .5 })); await device.adapter.sendMotion(frame({ V0: 0 }));
  assert.equal(device.calls[1]?.body?.['action'], 'Pump:2'); assert.equal(device.calls[2]?.body?.['action'], 'Pump:0'); assert.equal(device.calls[2]?.body?.['toy'], 'toy'); await device.adapter.stop(); assert.equal(device.calls.at(-1)?.body?.['action'], 'Stop'); await device.adapter.close();
});
test('a slow acknowledged vendor write finishes before stop and pending motion is discarded', async () => {
  const device = vendor('Handy'), release = deferred<void>(), started = deferred<void>();
  device.setResponse(async call => { if (call.path === 'connected') return { connected: true }; if (call.path === 'info') return { fwVersion: '3.2.0' }; if (call.path === 'hdsp/xpt') { started.resolve(); await release.promise; } return {}; });
  await device.adapter.connect(); const first = device.adapter.sendMotion(frame({ L0: .1 })); await started.promise; const stale = device.adapter.sendMotion(frame({ L0: .9 })); const stopping = device.adapter.stop(); release.resolve(); await Promise.all([first, stale, stopping]);
  assert.equal(device.calls.filter(call => call.path === 'hdsp/xpt').length, 1); assert.equal(device.calls.at(-1)?.path, 'hdsp/xpvp'); await device.adapter.close();
});
test('stop during a mode change prevents the later motion subrequest', async () => {
  const device = vendor('Handy'), release = deferred<void>(), started = deferred<void>();
  device.setResponse(async call => { if (call.path === 'connected') return { connected: true }; if (call.path === 'info') return { fwVersion: '3.2.0' }; if (call.path === 'mode') { started.resolve(); await release.promise; } return {}; });
  await device.adapter.connect(); const motion = device.adapter.sendMotion(frame({ L0: .5 })); await started.promise; const stopping = device.adapter.stop(); release.resolve(); await assert.rejects(motion, /cancelled by a stop/u); await stopping;
  assert.equal(device.calls.some(call => call.path === 'hdsp/xpt'), false); assert.equal(device.calls.at(-1)?.path, 'hdsp/xpvp'); await device.adapter.close();
});
test('vendor API status/JSON/response failures use bounded generic errors', async () => {
  for (const response of [new Response('rejected', { status: 403 }), new Response('not-json'), new Response('{}', { headers: { 'content-length': '1048577' } })]) {
    const device = vendor('Handy'); device.setResponse(() => response); await assert.rejects(device.adapter.connect()); assert.equal(device.adapter.connected, false);
  }
});
test('script format and cloud transport restrictions survive migration', async () => {
  const handy = vendor('Handy'); await handy.adapter.connect(); await assert.rejects(handy.adapter.vendorScript('prepare', { url: 'https://example.test/script.funscript' }), /CSV/u); await handy.adapter.close();
  const autoblow = vendor('Autoblow'); await autoblow.adapter.connect(); await assert.rejects(autoblow.adapter.vendorScript('prepare', { url: 'http://example.test/script.csv' }), /HTTPS/u); await autoblow.adapter.close();
});
for (const action of ['emergency', 'stop'] as const) test(`blocked native script preparation is promptly cancelled by ${action}, without accepting a late setup`, async () => {
  const began = deferred<void>(), cancelled = deferred<void>(), paths: string[] = [], pending = new Set<http.ServerResponse>(); let cancelledSetups = 0;
  const reply = (response: http.ServerResponse, value: object): void => { if (!response.destroyed && !response.writableEnded) { response.writeHead(200, { 'content-type': 'application/json' }); response.end(JSON.stringify(value)); } };
  const server = http.createServer((request, response) => { const path = new URL(request.url ?? '/', 'http://fixture').pathname; paths.push(path); request.resume();
    if (path === '/hssp/setup') { pending.add(response); response.on('close', () => { pending.delete(response); if (!response.writableFinished) { cancelledSetups++; cancelled.resolve(); } }); began.resolve(); }
    else reply(response, path === '/connected' ? { connected: true } : path === '/info' ? { fwVersion: '3.0.0' } : path === '/servertime' ? { serverTime: Date.now() } : {});
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); const address = server.address(); assert.ok(address && typeof address !== 'string');
  const config = output('Handy'); config.device.endpoint = `http://127.0.0.1:${address.port}/`; config.device.connectionKey = 'isolated-test'; config.device.scriptTimeoutMs = 60000;
  const coordinator = new OutputCoordinator(configuration([config]));
  try { await coordinator.connectEnabled(); const preparing = coordinator.vendorScript(config.id, 'prepare', { url: 'https://example.test/script.csv' }); const rejected = assert.rejects(preparing, /request failed|cancelled|invalid/u); await began.promise;
    if (action === 'emergency') await deadline(coordinator.emergencyStop(), 2000, 'Emergency cancellation'); else await deadline(coordinator.vendorScript(config.id, 'stop'), 2000, 'Explicit script cancellation');
    await deadline(cancelled.promise, 2000, 'HTTP setup connection cancellation'); await rejected; assert.equal(cancelledSetups, 1);
    for (const response of pending) reply(response, {}); await setImmediate(); const snapshot = coordinator.snapshot()[0] as { deviceApi: { scriptPrepared: boolean; scriptPlaying: boolean } }; assert.equal(snapshot.deviceApi.scriptPrepared, false); assert.equal(snapshot.deviceApi.scriptPlaying, false);
    assert.ok(paths.includes('/hssp/stop')); assert.equal(paths.some(path => path === '/hssp/play' || path.startsWith('/hdsp/') || path === '/servertime'), false);
  } finally { for (const response of pending) response.destroy(); await coordinator.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
test('a setup transport ignoring AbortSignal cannot delay stop or publish its late response', async () => {
  const setup = deferred<Response>(), began = deferred<void>(), paths: string[] = []; let setupSignal: AbortSignal | null | undefined, lateCancelled = 0;
  const config = output('Handy'); config.device.endpoint = 'http://127.0.0.1:40000/'; config.device.connectionKey = 'isolated-test';
  const adapter = new VendorAdapter(config, { fetch: async (request, options) => { const path = new URL(String(request)).pathname; paths.push(path); if (path === '/hssp/setup') { setupSignal = options?.signal; began.resolve(); return setup.promise; } return new Response(JSON.stringify(path === '/connected' ? { connected: true } : path === '/info' ? { fwVersion: '3.0.0' } : {})); } });
  await adapter.connect(); const preparation = adapter.vendorScript('prepare', { url: 'https://example.test/script.csv' }); const rejected = assert.rejects(preparation, /request failed|cancelled/u); await began.promise;
  await deadline(adapter.stop(), 1000, 'Ignoring-transport cancellation'); await rejected; assert.equal(setupSignal?.aborted, true); assert.equal(adapter.scriptState().prepared, false);
  setup.resolve(new Response(new ReadableStream<Uint8Array>({ cancel() { lateCancelled++; } }))); await setImmediate(); assert.equal(lateCancelled, 1); assert.equal(adapter.scriptState().prepared, false); assert.equal(adapter.scriptState().playing, false); assert.equal(paths.some(path => path === '/servertime' || path === '/hssp/play' || path.startsWith('/hdsp/')), false); await adapter.close();
});
