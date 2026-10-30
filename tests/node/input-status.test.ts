import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { createConnection } from 'node:net';
import { createSocket } from 'node:dgram';
import { Duplex } from 'node:stream';
import { WebSocket, WebSocketServer } from 'ws';
import { defaultProtocolInput } from '../../src/core/protocols/input-types.ts';
import type { ProtocolInputConfig } from '../../src/core/protocols/input-types.ts';
import { ExternalControlStore } from '../../src/core/protocols/external-control.ts';
import { OscParameterStore } from '../../src/core/protocols/osc.ts';
import { createInputCoordinator } from '../../src/node/inputs/coordinator.ts';
import type { InputCoordinator, InputListenerSnapshot } from '../../src/node/inputs/coordinator.ts';
import { RuntimeEngine } from '../../src/core/runtime/runtime.ts';
import { normalizeConfiguration } from '../../src/core/runtime/configuration.ts';
import { buildOverview } from '../../src/core/runtime/presentation.ts';
import { OutputCoordinator } from '../../src/core/outputs/coordinator.ts';

async function until(check: () => boolean): Promise<void> {
  const deadline = Date.now() + 2000;
  while (!check()) { if (Date.now() >= deadline) throw new Error('Isolated input status did not change.'); await new Promise(resolve => setTimeout(resolve, 5)); }
}
function input(type: ProtocolInputConfig['type']): ProtocolInputConfig {
  return { ...defaultProtocolInput(type), type, enabled: true, port: 0, routeToMotion: false, path: '/input/' + type.toLowerCase(), comPort: 'isolated-status-fixture' };
}

test('real protocol listeners expose established API fields, actual endpoints and disabled lifecycle for all twelve types', async t => {
  const upstream = createServer(); upstream.listen(0, '127.0.0.1'); await once(upstream, 'listening');
  const bound = upstream.address(); assert.ok(bound && typeof bound !== 'string'); const wss = new WebSocketServer({ server: upstream });
  const peers = new Set<WebSocket>(); wss.on('connection', peer => { peers.add(peer); peer.on('close', () => peers.delete(peer)); });
  t.after(async () => { for (const peer of peers) peer.terminate(); wss.close(() => {}); upstream.closeAllConnections(); if (upstream.listening) await new Promise<void>(resolve => upstream.close(() => resolve())); });
  const types: ProtocolInputConfig['type'][] = ['Buttplug', 'TCodeTcp', 'TCodeUdp', 'TCodeSerial', 'TCodeWebSocket', 'IntifaceDevice', 'JsonHttp', 'JsonWebSocket', 'LovenseHttp', 'HandyHttp', 'AutoblowHttp', 'VacuGlideHttp'];
  const configs = types.map(type => ({ ...input(type), ...(type === 'IntifaceDevice' ? { address: `ws://127.0.0.1:${bound.port}/device` } : {}) }));
  const controls = new ExternalControlStore(configs), serials: Duplex[] = [];
  const coordinator = await createInputCoordinator(configs, { external: controls, osc: new OscParameterStore(), serialFactory: async () => {
    const stream = new Duplex({ read() {}, write(_chunk, _encoding, callback) { callback(); } }); serials.push(stream); return stream;
  } });
  const row = (id: string): Record<string, unknown> => { const state = coordinator.snapshot().find(value => value.id === id); assert.ok(state); return state as unknown as Record<string, unknown>; };
  try {
    assert.equal(coordinator.snapshot().length, 12);
    for (const config of configs) {
      const state = row(config.id); assert.equal(state['listening'], true, config.type); assert.equal(state['running'], true);
      assert.equal(state['lastError'], null); assert.equal(state['error'], ''); assert.equal(state['enabled'], true);
      assert.equal(typeof state['connected'], 'boolean'); assert.equal(typeof state['receivedCommands'], 'number'); assert.ok(Array.isArray(state['channels']));
      assert.equal(state['address'], config.type === 'TCodeSerial' ? config.comPort : config.type === 'IntifaceDevice' ? config.address
        : `${['Buttplug', 'TCodeWebSocket', 'JsonWebSocket'].includes(config.type) ? 'ws' : config.type === 'TCodeTcp' ? 'tcp' : config.type === 'TCodeUdp' ? 'udp' : 'http'}://127.0.0.1:${state['port']}${['TCodeTcp', 'TCodeUdp'].includes(config.type) ? '' : config.path}`);
    }
    assert.equal(row('JsonHttp')['connected'], false);
    const http = await fetch(String(row('JsonHttp')['address']) + '/command', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Sensa-Session': 'status-http' }, body: '{"channel":"L0","value":0.6}' });
    assert.equal(http.status, 200); assert.equal(row('JsonHttp')['connected'], true); assert.equal(row('JsonHttp')['receivedCommands'], 1);
    const tcp = createConnection({ host: '127.0.0.1', port: Number(row('TCodeTcp')['port']) }); await once(tcp, 'connect'); tcp.write('L0400\n');
    await until(() => controls.getStatus('TCodeTcp')?.receivedCommands === 1); assert.equal(row('TCodeTcp')['connected'], true);
    tcp.destroy(); await until(() => row('TCodeTcp')['connected'] === false); assert.equal(row('TCodeTcp')['listening'], true);
    const udp = createSocket('udp4'); udp.send('L0700\n', Number(row('TCodeUdp')['port']), '127.0.0.1');
    await until(() => controls.getStatus('TCodeUdp')?.receivedCommands === 1); udp.close(); assert.equal(row('TCodeUdp')['connected'], true);
    serials[0]?.destroy(); await until(() => row('TCodeSerial')['listening'] === false); assert.equal(row('TCodeSerial')['running'], false);
    for (const peer of peers) peer.close(); await until(() => row('IntifaceDevice')['listening'] === false); assert.equal(row('IntifaceDevice')['connected'], false);
    const disabled = configs.map(config => ({ ...config, enabled: false })); controls.configure(disabled); await coordinator.reload(disabled);
    assert.equal(coordinator.snapshot().length, 12);
    for (const config of configs) { const state = row(config.id); assert.equal(state['enabled'], false); assert.equal(state['listening'], false); assert.equal(state['running'], false); assert.equal(state['connected'], false); }
    controls.configure(configs); await coordinator.reload(configs); assert.equal(coordinator.snapshot().filter(state => (state as unknown as Record<string, unknown>)['listening']).length, 12);
    await coordinator.dispose(); assert.deepEqual(coordinator.snapshot(), []);
  } finally { await coordinator.dispose(); }
});

test('shared HTTP and WebSocket mounts retain listener and session fields through the merged workbench overview', { timeout: 10000 }, async t => {
  let coordinator: InputCoordinator | null = null;
  const server = createServer((req, res) => { void (async () => { if (coordinator && await coordinator.handleHttp(req, res)) return; res.writeHead(404); res.end(); })(); });
  server.on('upgrade', (req, socket, head) => { if (!coordinator?.handleUpgrade(req, socket, head)) socket.destroy(); });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); const bound = server.address(); assert.ok(bound && typeof bound !== 'string');
  const configs = [input('Buttplug'), input('JsonHttp'), input('TCodeWebSocket')].map(config => ({ ...config, port: bound.port }));
  const runtime = new RuntimeEngine(normalizeConfiguration({ protocolInputs: configs, outputs: [] }));
  const outputs = new OutputCoordinator(runtime.getConfig(), { createAdapter: () => { throw new Error('This input-only component has no outputs.'); } });
  const sockets: WebSocket[] = [];
  t.after(async () => { for (const socket of sockets) socket.terminate(); await coordinator?.dispose(); runtime.dispose(); await outputs.close(); server.closeAllConnections(); if (server.listening) await new Promise<void>(resolve => server.close(() => resolve())); });
  coordinator = await createInputCoordinator(configs, { external: runtime.externalControls, osc: runtime.oscStore, sharedServer: { server, host: '127.0.0.1', port: bound.port } });
  const overview = (): InputListenerSnapshot[] => {
    const controls = new Map(runtime.externalControls.snapshot().map(state => [state['id'], state]));
    return buildOverview(runtime, { outputs, protocolSnapshot: () => coordinator!.snapshot().map(state => ({ ...state, ...(controls.get(state.id) ?? {}) })) })['protocolInputs'] as InputListenerSnapshot[];
  };
  assert.equal(overview().filter(state => state.listening).length, 3);
  assert.deepEqual(overview().map(state => state.address).sort(), [`ws://127.0.0.1:${bound.port}${configs[0]!.path}`, `http://127.0.0.1:${bound.port}${configs[1]!.path}`, `ws://127.0.0.1:${bound.port}${configs[2]!.path}`].sort());
  const buttplug = new WebSocket(overview().find(state => state.type === 'Buttplug')!.address), tcode = new WebSocket(overview().find(state => state.type === 'TCodeWebSocket')!.address); sockets.push(buttplug, tcode);
  await Promise.all([once(buttplug, 'open'), once(tcode, 'open')]);
  const hello = once(buttplug, 'message'); buttplug.send('[{"RequestServerInfo":{"Id":1,"ClientName":"status fixture","MessageVersion":3}}]'); assert.match(String((await hello)[0]), /ServerInfo/);
  const position = once(buttplug, 'message'); buttplug.send('[{"LinearCmd":{"Id":2,"DeviceIndex":0,"Vectors":[{"Index":0,"Position":0.8,"Duration":200}]}}]'); assert.match(String((await position)[0]), /Ok/);
  const json = overview().find(state => state.type === 'JsonHttp')!;
  const response = await fetch(json.address + '/command', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Sensa-Session': 'shared-status' }, body: '{"channel":"L0","value":0.6}' });
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), { ok: true, accepted: 1 });
  const reply = once(tcode, 'message'); tcode.send('L0400\nD1\n'); assert.match(String((await reply)[0]), /TCode v0.3/);
  for (const state of overview()) { assert.equal(state.listening, true); assert.equal(state.connected, true); assert.equal(state.receivedCommands, 1); assert.equal(state.lastError, null); assert.ok(state.session); }
  const edited = configs.map(config => config.type === 'JsonHttp' ? { ...config, path: '/edited-json' } : config);
  runtime.applyConfiguration({ ...runtime.getConfig(), protocolInputs: edited }); await coordinator.reload(edited);
  const afterEdit = overview().find(state => state.type === 'JsonHttp')!; assert.equal(afterEdit.address, `http://127.0.0.1:${bound.port}/edited-json`); assert.equal(afterEdit.listening, true);
  assert.equal((await fetch(json.address + '/status')).status, 404); assert.equal((await fetch(afterEdit.address + '/status')).status, 200);
  for (const socket of sockets) socket.terminate(); await new Promise(resolve => setImmediate(resolve)); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
  assert.equal(coordinator.snapshot().some(state => state.listening || state.running), false);
});

test('serial transport failures preserve the legacy lastError field without claiming an open listener', async () => {
  const config = input('TCodeSerial'), controls = new ExternalControlStore([config]);
  const stream = new Duplex({ read() {}, write(_chunk, _encoding, callback) { callback(); } });
  const coordinator = await createInputCoordinator([config], { external: controls, osc: new OscParameterStore(), serialFactory: async () => stream });
  try {
    stream.destroy(new Error('Isolated serial transport closed'));
    await until(() => coordinator.snapshot()[0]?.lastError === 'Isolated serial transport closed');
    const state = coordinator.snapshot()[0]!; assert.equal(state.error, state.lastError); assert.equal(state.running, false); assert.equal(state.listening, false); assert.equal(state.connected, false);
  } finally { await coordinator.dispose(); }
});

test('disabled IPv6 inputs retain canonical endpoint addresses while remaining unbound', async () => {
  const config = { ...input('JsonHttp'), enabled: false, host: '::1', port: 12400, path: '/v6' };
  const coordinator = await createInputCoordinator([config], { external: new ExternalControlStore([config]), osc: new OscParameterStore() });
  try { const state = coordinator.snapshot()[0]!; assert.equal(state.address, 'http://[::1]:12400/v6'); assert.equal(state.listening, false); assert.equal(state.connected, false); }
  finally { await coordinator.dispose(); }
});
