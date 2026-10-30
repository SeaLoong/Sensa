import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request as httpRequest } from 'node:http';
import { WebSocket } from 'ws';
import { startSensa } from '../../src/node/host/start.ts';
import { record } from '../../src/core/runtime/application.ts';
import { normalizeConfiguration } from '../../src/core/runtime/configuration.ts';
import { defaultProtocolInput } from '../../src/core/protocols/input-types.ts';
import { parseScriptMultipart } from '../../src/node/host/server.ts';
import { RecordingStore } from '../../src/node/host/storage.ts';

/** In-process host unit: isolated config, no CLI/native child/browser/device. */
async function fixture(t: TestContext, extra: { coordinateInstances?: boolean; now?: () => number; launchBrowser?: (url: string) => void; port?: number } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'sensa-http-unit-')), configPath = join(directory, 'config.json');
  await writeFile(configPath, JSON.stringify({ webUi: { host: '127.0.0.1', port: 5086 }, osc: { enabled: false, oscQueryEnabled: false }, protocolInputs: [], outputs: [], signals: [], computedSignals: [] }));
  const host = await startSensa({ configPath, port: extra.port ?? 0, openBrowser: extra.launchBrowser !== undefined,
    coordinateInstances: extra.coordinateInstances ?? false, privateDirectory: join(directory, 'ipc'), recordingDirectory: join(directory, 'recordings'),
    outputDependencies: { serialFactory: { list: async () => [], open: async () => { throw new Error('No hardware in host unit tests.'); } },
      midiFactory: { list: async () => [], open: async () => { throw new Error('No hardware in host unit tests.'); } },
      bridgeDiagnostics: async () => ({ hardwareProbed: false, dependencies: { bleak: false } }) },
    resourceReader: name => ['index.html', 'websensa/index.html'].includes(name) ? new TextEncoder().encode(`<html>${name}</html>`) : undefined,
    ...(extra.now ? { now: extra.now } : {}), ...(extra.launchBrowser ? { launchBrowser: extra.launchBrowser } : {}) });
  t.after(async () => { await host.close(); await rm(directory, { recursive: true, force: true }); });
  const bootstrap = await fetch(host.url + '/api/session'), cookie = bootstrap.headers.get('set-cookie')!.split(';')[0]!; assert.equal(bootstrap.status, 204);
  const call = async (path: string, method = 'GET', body?: unknown) => await fetch(host.url + path, { method, headers: { Cookie: cookie, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { host, directory, configPath, cookie, call };
}
test('management serves shared resources, keeps redirects local and authenticates API reads', async t => {
  const { host, call, configPath } = await fixture(t);
  assert.equal((await fetch(host.url + '/')).status, 200);
  assert.equal((await fetch(host.url + '/api/config')).status, 401);
  for (const method of ['GET', 'HEAD']) for (const query of ['next=https%3A%2F%2Fexample.invalid', 'next=%2F%2Fevil.invalid', 'next=%5C%5Cevil.invalid']) {
    const redirect = await fetch(host.url + '/websensa?' + query, { method, redirect: 'manual' });
    assert.equal(redirect.status, 301); assert.equal(redirect.headers.get('location'), '/websensa/?' + query);
    assert.equal(new URL(redirect.headers.get('location')!, host.url).origin, host.url);
  }
  assert.equal(await (await fetch(host.url + '/websensa/')).text(), '<html>websensa/index.html</html>');
  assert.equal((await call('/api/config')).status, 200); assert.equal((await call('/api/unknown')).status, 404);
  const head = await fetch(host.url + '/', { method: 'HEAD' }); assert.equal(head.status, 200); assert.equal(await head.text(), '');
  assert.equal(normalizeConfiguration(await (await call('/api/config')).json()).webUi.port, host.port);
  assert.equal(JSON.parse(await readFile(configPath, 'utf8')).webUi.port, host.port);
  const capabilities = record(await (await call('/api/meta/capabilities')).json());
  assert.equal(capabilities['hardwareProbed'], false); assert.ok(Array.isArray(capabilities['outputs']));
  assert.ok(capabilities['outputs'].some((row: unknown) => record(row)['type'] === 'TCodeUdp' && record(row)['available'] === true));
});
test('an occupied management port falls back atomically and persists the actual second address', async t => {
  const first = await fixture(t), second = await fixture(t, { port: first.host.port });
  assert.notEqual(first.host.port, second.host.port); assert.notEqual(first.host.url, second.host.url);
  assert.equal(JSON.parse(await readFile(second.configPath, 'utf8')).webUi.port, second.host.port);
  assert.equal((await first.call('/api/instance')).status, 200); assert.equal((await second.call('/api/instance')).status, 200);
});
test('HTTP commands preserve activation, manual normalization and emergency-stop semantics', async t => {
  const { call } = await fixture(t);
  assert.equal((await call('/api/input/active', 'PUT', {})).status, 400);
  assert.equal((await call('/api/input/manual', 'PUT', { Enabled: true, L0: 9999, R0: -10 })).status, 200);
  await call('/api/input/active', 'PUT', { active: true });
  let state = record(record(await (await call('/api/state/overview')).json())['runtime']); assert.equal(state['inputActive'], true); assert.equal(record(state['manualCommand'])['l0'], .999); assert.equal(record(state['manualCommand'])['r0'], 0);
  assert.equal((await call('/api/input/manual', 'PUT', { enabled: true, L0: 200, l0: 800 })).status, 400);
  state = record(record(await (await call('/api/state/overview')).json())['runtime']); assert.equal(record(state['manualCommand'])['l0'], .999);
  assert.equal((await call('/api/input/manual', 'PUT', { enabled: true, R0: 400, axes: ['R0'], motionMode: 'interval', motionValue: 25 })).status, 200);
  state = record(record(await (await call('/api/state/overview')).json())['runtime']); assert.deepEqual(record(state['manualFrame'])['activeAxes'], ['R0']);
  await call('/api/control/runtime/emergency-stop', 'POST'); await call('/api/input/active', 'PUT', { active: true });
  state = record(record(await (await call('/api/state/overview')).json())['runtime']); assert.equal(state['isEmergency'], true); assert.equal(state['inputActive'], false);
  await call('/api/control/loop/clear-emergency', 'POST'); state = record(record(await (await call('/api/state/overview')).json())['runtime']); assert.equal(state['isEmergency'], false); assert.equal(state['inputActive'], false);
});
test('multipart script loading shares the same script/configuration commands and rejects incomplete framing', async t => {
  const { host, cookie, call } = await fixture(t);
  const content = JSON.stringify({ actions: [{ at: 0, pos: 0 }, { at: 1000, pos: 100 }] });
  const form = new FormData(); form.append('file', new Blob([content], { type: 'application/json' }), 'sample.funscript'); form.append('loop', 'true'); form.append('speed', '2'); form.append('axis', 'R2');
  const response = await fetch(host.url + '/api/input/script/load', { method: 'POST', headers: { Cookie: cookie }, body: form });
  assert.equal(response.status, 200); const loaded = record(record(await response.json())['script']); assert.equal(loaded['loaded'], true); assert.equal(loaded['fileName'], 'sample.funscript'); assert.equal(loaded['loop'], true); assert.equal(loaded['speed'], 2);
  assert.equal(loaded['axis'], 'R2');
  await call('/api/input/script/seek', 'PUT', { positionMs: 500 }); const overview = record(record(record(await (await call('/api/state/overview')).json())['input'])['script']); assert.equal(overview['positionMs'], 500);
  assert.throws(() => parseScriptMultipart(Buffer.from('--a\r\nContent-Disposition: form-data; name="file"; filename="a.funscript"\r\n\r\n{}\r\n--a'), 'multipart/form-data; boundary=a'), /Incomplete/);
});
test('configuration application persists successful changes, disarms input and rolls back a failed listener transaction', async t => {
  const { host, configPath, call } = await fixture(t);
  const original = normalizeConfiguration(await (await call('/api/config')).json()); original.webUi.title = 'Saved title';
  await call('/api/input/active', 'PUT', { active: true });
  const saved = await call('/api/config', 'PUT', original); assert.equal(saved.status, 200);
  assert.equal(JSON.parse(await readFile(configPath, 'utf8')).webUi.title, 'Saved title');
  assert.equal(record(record(await (await call('/api/state/overview')).json())['runtime'])['inputActive'], false);
  const before = await readFile(configPath, 'utf8'), bad = structuredClone(original);
  bad.webUi.title = 'Must not persist'; bad.protocolInputs = [{ ...defaultProtocolInput('conflict'), type: 'JsonHttp', enabled: true, port: host.port, path: '/' }];
  const rejected = await call('/api/config', 'PUT', bad); assert.equal(rejected.status, 400);
  assert.equal(normalizeConfiguration(await (await call('/api/config')).json()).webUi.title, 'Saved title'); assert.equal(await readFile(configPath, 'utf8'), before);
});
test('body limits and strict JSON reject malformed requests without damaging the running service', async t => {
  const { host, cookie, call } = await fixture(t);
  const duplicate = await fetch(host.url + '/api/input/active', { method: 'PUT', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: '{"active":true,"active":false}' }); assert.equal(duplicate.status, 400);
  const status = await new Promise<number>((resolve, reject) => {
    const request = httpRequest(host.url + '/api/config', { method: 'PUT', headers: { Cookie: cookie, 'Content-Length': 4 * 1024 * 1024 + 1 } }, response => { response.resume(); resolve(response.statusCode!); }); request.on('error', reject); request.end();
  });
  assert.equal(status, 413); assert.equal((await call('/api/state/overview')).status, 200);
});
test('WebSocket command correlations use the same application and state envelope', async t => {
  const { host, cookie } = await fixture(t), socket = new WebSocket(host.url.replace('http:', 'ws:') + '/api/ws', { headers: { Cookie: cookie, Origin: host.url } });
  t.after(() => socket.terminate());
  const messages: Record<string, unknown>[] = [];
  socket.on('message', data => messages.push(JSON.parse(data.toString()) as Record<string, unknown>));
  await new Promise<void>((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  socket.send(JSON.stringify({ id: 'config-1', method: 'GET', path: '/api/config' }));
  socket.send(JSON.stringify({ id: 'mode-2', method: 'PUT', path: '/api/input/mode', body: { mode: 'Script' } }));
  await new Promise<void>((resolve, reject) => {
    const deadline = setTimeout(() => { clearInterval(poll); reject(new Error('Expected correlated replies.')); }, 2000);
    const poll = setInterval(() => { if (messages.some(row => row['id'] === 'config-1') && messages.some(row => row['id'] === 'mode-2')) { clearTimeout(deadline); clearInterval(poll); resolve(); } }, 5);
  });
  assert.equal(messages.find(row => row['id'] === 'config-1')!['ok'], true); assert.equal(messages.find(row => row['id'] === 'mode-2')!['ok'], true);
  assert.ok(messages.some(row => row['type'] === 'state' && row['data'] && Array.isArray(row['logs'])));
});
test('recording downloads implement HEAD and byte ranges without exposing other paths', async t => {
  const { host, directory, cookie } = await fixture(t), store = new RecordingStore(join(directory, 'recordings'));
  const content = '{"actions":[]}'; await store.write('sample.funscript', content);
  const address = host.url + '/api/output/recordings/sample.funscript/download';
  const head = await fetch(address, { method: 'HEAD', headers: { Cookie: cookie } }); assert.equal(head.status, 200); assert.equal(head.headers.get('content-length'), String(content.length)); assert.equal(await head.text(), '');
  const first = await fetch(address, { headers: { Cookie: cookie, Range: 'bytes=0-3' } }); assert.equal(first.status, 206); assert.equal(first.headers.get('content-range'), `bytes 0-3/${content.length}`); assert.equal(await first.text(), content.slice(0, 4));
  const suffix = await fetch(address, { headers: { Cookie: cookie, Range: 'bytes=-2' } }); assert.equal(suffix.status, 206); assert.equal(await suffix.text(), content.slice(-2));
  assert.equal((await fetch(address, { headers: { Cookie: cookie, Range: 'bytes=999-' } })).status, 416);
  assert.equal((await fetch(host.url + '/api/output/recordings/..%2Fconfig.json/download', { headers: { Cookie: cookie } })).ok, false);
});
test('duplicate profile launches reuse the owner and closing the reused handle does not stop it', async t => {
  const { host, configPath, directory, call } = await fixture(t, { coordinateInstances: true });
  const duplicate = await startSensa({ configPath, openBrowser: false, privateDirectory: join(directory, 'ipc') });
  assert.equal(duplicate.reused, true); assert.equal(duplicate.url, host.url); await duplicate.close();
  assert.equal((await call('/api/instance')).status, 200);
});
