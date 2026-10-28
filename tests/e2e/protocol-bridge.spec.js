import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import path from 'node:path';
import { test, expect, text, mode, active, enable } from './fixtures.js';

const httpSourcePort = 19431, tcodeSourcePort = 19433;
const profileId = 'ci-vibration-bridge';
const gattPackets = peer => peer.events.filter(event => event.event === 'gatt-write').map(event => event.packet);
const freshPackets = peer => gattPackets(peer).filter(packet => packet !== '550403000000');
const config = (page, rig) => page.request.get(rig.baseUrl + '/api/config').then(response => response.json());

async function bounded(promise, milliseconds, label) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(label)), milliseconds);
    })]);
  } finally { clearTimeout(timer); }
}

async function startBridge(role, { port = 0 } = {}) {
  if (process.env.GITHUB_ACTIONS !== 'true') throw new Error('Bridge process E2E is CI-only');
  const events = [], diagnostics = [];
  const args = ['-u', path.resolve('tests/e2e/protocol-bridge-device.py'), role,
    '--sensa', `tcp://127.0.0.1:${tcodeSourcePort}`, '--listen-port', String(port)];
  const child = spawn('python3', args, { stdio: ['pipe', 'pipe', 'pipe'] });
  const lines = createInterface({ input: child.stdout });
  let failure, exit, closed = false, sequence = 0;
  const exited = new Promise(resolve => {
    child.once('error', error => { failure = error; exit = { code: -1, signal: null }; resolve(exit); });
    child.once('exit', (code, signal) => { exit = { code, signal }; });
    child.once('close', (code, signal) => { closed = true; exit ??= { code, signal }; resolve(exit); });
  });
  child.stdin.on('error', () => {}); // Exit during an invalid-frame response is expected.
  child.stderr.on('data', bytes => {
    if (diagnostics.length < 100) diagnostics.push(bytes.toString());
  });
  lines.on('line', line => {
    try {
      if (events.length >= 2048) throw new Error('Mock bridge emitted excessive events');
      events.push(JSON.parse(line));
    } catch (error) { failure = error; child.kill('SIGTERM'); }
  });
  const peer = {
    events, diagnostics,
    get exit() { return exit; },
    async frame(packet) {
      if (failure) throw failure;
      if (exit) throw new Error('Bridge already exited');
      const id = ++sequence;
      child.stdin.write(JSON.stringify({ id, action: 'frame', packet }) + '\n');
      let ack;
      await expect.poll(() => {
        if (failure) throw failure;
        ack = events.find(event => event.event === 'ack' && event.id === id);
        if (!ack && closed) throw new Error('Bridge exited without acknowledging the mock frame');
        return Boolean(ack);
      }).toBe(true);
      return ack;
    },
    async expectExit(code = 0) {
      const observed = await bounded(exited, 5000, 'Mock bridge did not stop');
      if (failure) throw failure;
      expect(observed).toEqual({ code, signal: null });
      expect(events.find(event => event.event === 'complete')).toMatchObject({
        success: code === 0, hardwareExecution: false, hardwareModules: [],
      });
    },
    async close() {
      child.stdin.end();
      if (!closed) {
        const ended = await bounded(exited.then(() => true), 500, 'Bridge needs cancellation').catch(() => false);
        if (!ended) {
          child.kill('SIGTERM');
          await bounded(exited, 1000, 'Bridge termination timed out').catch(async () => {
            child.kill('SIGKILL'); await bounded(exited, 1000, 'Bridge kill timed out');
          });
        }
      }
      lines.close();
    },
  };
  try {
    await expect.poll(() => {
      if (failure) throw failure;
      const ready = events.find(event => event.event === 'ready');
      if (!ready && closed) throw new Error('Bridge exited before readiness: ' + diagnostics.join(''));
      return Boolean(ready);
    }, { timeout: 10000 }).toBe(true);
    peer.ready = events.find(event => event.event === 'ready');
    expect(peer.ready).toMatchObject({ role, hardwareExecution: false });
    return peer;
  } catch (error) { await peer.close(); throw error; }
}

function vibrationMotion() {
  return { useGlobal: false, ...Object.fromEntries(
    ['l0', 'l1', 'l2', 'r0', 'r1', 'r2', 'v0', 'v1', 'v2', 'a0', 'a1', 'a2'].map(axis =>
      [axis, axis === 'v0' ? { mode: 'Normal', min: 0, max: 999, remapMin: 0, remapMax: 999,
        commandMode: 'None', rampType: 'None' } : { mode: 'Ignored' }])) };
}

async function configure(page, rig, { sourceType, output }) {
  const saved = await config(page, rig);
  const response = await page.request.put(rig.baseUrl + '/api/config', { data: { ...saved,
    protocolInputs: [{ id: 'vibration-source', name: 'CI vibration input', type: sourceType, enabled: true,
      host: '127.0.0.1', port: sourceType === 'TCodeTcp' ? tcodeSourcePort : httpSourcePort,
      timeoutMs: 30000, routeToMotion: true,
      features: [{ channel: 'V0', name: 'Vibration', actuator: 'Scalar', scalarType: 'Vibrate', targetAxis: 'V0' }] }],
    axisProfiles: [...saved.axisProfiles, { id: profileId, name: 'CI V0 only', motion: vibrationMotion() }],
    outputs: [{ ...output, enabled: false, motionProfileId: profileId, slopeMode: 'NoSlope' }],
  } });
  expect(response.ok()).toBe(true);
  await expect.poll(async () => (await rig.overview()).protocolInputs.find(source => source.id === 'vibration-source')?.listening).toBe(true);
  await page.reload();
  await mode(page, '协议');
  expect((await rig.overview()).runtime.inputActive).toBe(false);
}

async function httpValue(page, value) {
  const response = await page.request.post(`http://127.0.0.1:${httpSourcePort}/command`, {
    headers: { 'X-Sensa-Session': 'ci-bridge-controller' }, data: { channel: 'V0', value },
  });
  expect(response.status()).toBe(200);
  expect(await response.json()).toMatchObject({ ok: true });
}

test('Sensa scalar output traverses the real BLE bridge and stops without restart replay / Sensa强度输出经真实桥编码且停止重启不重放',
  { tag: ['@input', '@transport', '@config'] }, async ({ page, rig }, info) => {
    const peers = [];
    try {
      const first = await startBridge('output'); peers.push(first);
      await configure(page, rig, { sourceType: 'JsonHttp', output: { id: 'vibration-output', name: 'Mock Svakom bridge',
        type: 'TCodeTcp', host: '127.0.0.1', port: first.ready.port } });
      await enable(page, ['Mock Svakom bridge']);
      await httpValue(page, .75);
      expect(freshPackets(first)).toEqual([]);
      await active(page);
      await httpValue(page, .5);
      await expect.poll(() => freshPackets(first)).toEqual(['55040300010a']);
      await active(page, false);
      await first.expectExit();
      expect(gattPackets(first)).toEqual(['55040300010a', '550403000000']);
      expect(first.events.findIndex(event => event.event === 'ble-disconnected')).toBeGreaterThan(
        first.events.findIndex(event => event.event === 'gatt-write' && event.packet === '550403000000'));

      await httpValue(page, .9); // Accepted while disarmed, but must never replay.
      const disconnect = await page.request.post(rig.baseUrl + '/api/control/output/vibration-output/disconnect');
      expect(disconnect.ok()).toBe(true);
      const second = await startBridge('output', { port: first.ready.port }); peers.push(second);
      const connect = await page.request.post(rig.baseUrl + '/api/control/output/vibration-output/connect');
      expect(connect.ok()).toBe(true);
      expect(await connect.json()).toMatchObject({ ok: true, connected: true });
      expect(freshPackets(second)).toEqual([]);
      await active(page);
      await httpValue(page, .2);
      await expect.poll(() => freshPackets(second)).toEqual(['550403000104']);
      await active(page, false);
      await second.expectExit();
      expect(gattPackets(second)).toEqual(['550403000104', '550403000000']);
      for (const peer of peers) {
        const wire = peer.events.filter(event => event.event === 'tcode-bytes').map(event => event.text).join('');
        expect(wire).toMatch(/V0\d/);
        expect(wire).not.toMatch(/[LR]\d|V\d\d+I|V\d\d+S/);
      }
      await expect(page.getByRole('switch', { name: await text(page, '输入启用'), exact: true })).not.toBeChecked();
    } finally {
      await Promise.all(peers.map(peer => peer.close()));
      await info.attach('svakom-bridge-output.json', { body: JSON.stringify({ hardwareExecution: false,
        actualPythonBridge: true, profile: 'svakom-v1', peers: peers.map(peer => ({ events: peer.events, exit: peer.exit, diagnostics: peer.diagnostics })) }),
      contentType: 'application/json' });
    }
  });

test('BLE peripheral frames traverse the real input bridge with activation and invalid-frame stop / BLE外围帧经真实输入桥并保留许可与非法帧停止',
  { tag: ['@input', '@transport'] }, async ({ page, rig }, info) => {
    let peer;
    try {
      const saved = await config(page, rig);
      await configure(page, rig, { sourceType: 'TCodeTcp', output: saved.outputs.find(output => output.id === 'udp') });
      await enable(page, ['Mock UDP']);
      peer = await startBridge('input');
      expect(await peer.frame('550403000113')).toMatchObject({ accepted: true });
      await expect.poll(async () => (await rig.overview()).protocolInputs.find(source => source.id === 'vibration-source')?.receivedCommands).toBe(1);
      expect(rig.wire.udp.filter(line => /V0\d/.test(line))).toEqual([]);
      await active(page);
      expect(await peer.frame('55040300010a')).toMatchObject({ accepted: true });
      // 10/19 becomes V0526 at ingress, then the explicit 0..999 profile emits V0525.
      await expect.poll(() => rig.wire.udp.some(line => line === 'V0525')).toBe(true);
      await active(page, false);
      await expect.poll(() => rig.wire.udp.at(-1)).toBe('DSTOP');
      const firstEpoch = rig.wire.udp.filter(line => /V0\d/.test(line));
      expect(firstEpoch.length).toBeGreaterThan(0);
      expect(firstEpoch.every(line => line === 'V0525')).toBe(true);
      const disabledBoundary = rig.wire.udp.length;
      expect(await peer.frame('550403000113')).toMatchObject({ accepted: true });
      await expect.poll(async () => (await rig.overview()).protocolInputs.find(source => source.id === 'vibration-source')?.receivedCommands).toBe(3);
      expect(rig.wire.udp.slice(disabledBoundary).filter(line => /V0\d/.test(line))).toEqual([]);
      const rearmedBoundary = rig.wire.udp.length;
      await active(page);
      expect(await peer.frame('550403000101')).toMatchObject({ accepted: true });
      await expect.poll(() => rig.wire.udp.some(line => line === 'V0053')).toBe(true);
      expect(await peer.frame('550403000114')).toMatchObject({ accepted: false, errorType: 'ValueError' });
      await peer.expectExit(2);
      await expect.poll(async () => (await rig.overview()).protocolInputs.find(source => source.id === 'vibration-source')?.connected).toBe(false);
      await expect.poll(() => rig.wire.udp.at(-1)).toBe('DSTOP');
      const secondEpoch = rig.wire.udp.slice(rearmedBoundary).filter(line => /V0\d/.test(line));
      expect(secondEpoch.length).toBeGreaterThan(0);
      expect(secondEpoch.every(line => line === 'V0053')).toBe(true);
    } finally {
      await peer?.close();
      await info.attach('svakom-bridge-input.json', { body: JSON.stringify({ hardwareExecution: false,
        actualPythonBridge: true, profile: 'svakom-v1', events: peer?.events, exit: peer?.exit, diagnostics: peer?.diagnostics, wire: rig.wire.udp }),
      contentType: 'application/json' });
    }
  });
