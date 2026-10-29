import WebSocket from 'ws';
import { once } from 'node:events';
import { test, expect, workspace, text, mode, active, enable } from './fixtures.js';

const port = 19451;
const config = (page, rig) => page.request.get(rig.baseUrl + '/api/config').then(response => response.json());
async function configure(page, rig) {
  const previous = await config(page, rig);
  const source = (id, type, path, channel, actuator = 'Position') => ({ id, name: id, type, path,
    host: '127.0.0.1', port, enabled: true, timeoutMs: 10000, routeToMotion: true,
    features: [{ channel, actuator, targetAxis: channel, scalarType: 'Vibrate' }] });
  const response = await page.request.put(rig.baseUrl + '/api/config', { data: { ...previous,
    protocolInputs: [source('shared-buttplug', 'Buttplug', '/buttplug', 'L0'), source('shared-json', 'JsonHttp', '/json', 'R0'), source('shared-tcode', 'TCodeWebSocket', '/tcode', 'V0', 'Scalar')],
    axisProfiles: previous.axisProfiles.map(profile => ({ ...profile, motion: { ...profile.motion,
      r0: { ...profile.motion.r0, mode: 'Normal', commandMode: 'None', min: 0, max: 999, remapMin: 0, remapMax: 999 },
      v0: { ...profile.motion.v0, mode: 'Normal', commandMode: 'None', min: 0, max: 999, remapMin: 0, remapMax: 999 },
    } })),
  } });
  expect(response.ok()).toBe(true);
  await page.reload();
  await expect.poll(async () => (await rig.overview()).protocolInputs.filter(input => input.listening).length).toBe(3);
}
async function peer(path) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}${path}`);
  await once(socket, 'open');
  return { socket,
    async exchange(message) {
      const pending = once(socket, 'message'); socket.send(message);
      const [bytes] = await pending;
      return bytes.toString();
    },
    async close() {
      if (socket.readyState === WebSocket.CLOSED) return;
      const closed = once(socket, 'close'); socket.close(); await closed;
    },
  };
}

// Real protocol listeners and runtime route to CI UDP mocks, never physical devices.
test('three protocol paths share one port and drive separate configured axes / 三种协议复用端口并驱动独立轴',
  { tag: ['@input', '@transport', '@config'] }, async ({ page, rig }, info) => {
    await configure(page, rig);
    await enable(page, ['Mock UDP']); await mode(page, '协议');
    const bp = await peer('/buttplug'), tcode = await peer('/tcode');
    try {
      const hello = JSON.parse(await bp.exchange(JSON.stringify([{ RequestServerInfo: { Id: 1, ClientName: 'CI shared-port player', MessageVersion: 3 } }])));
      expect(hello[0].ServerInfo).toBeTruthy();
      expect((await rig.overview()).runtime.inputActive).toBe(false);
      await active(page);
      const position = JSON.parse(await bp.exchange(JSON.stringify([{ LinearCmd: { Id: 2, DeviceIndex: 0, Vectors: [{ Index: 0, Position: .8, Duration: 200 }] } }])));
      expect(position[0].Ok).toBeTruthy();
      const json = await page.evaluate(async port => {
        const response = await fetch(`http://127.0.0.1:${port}/json/command`, { method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Sensa-Session': 'CI shared JSON' },
          body: JSON.stringify({ channel: 'R0', value: .6 }) });
        return { status: response.status, body: await response.json() };
      }, port);
      expect(json).toMatchObject({ status: 200, body: { ok: true, accepted: 1 } });
      expect(await tcode.exchange('V0800\nD1\n')).toContain('TCode v0.3');
      await expect.poll(() => rig.wire.udp.some(line => /L0560(?:I200)?(?:\s|$)/.test(line))).toBe(true);
      await expect.poll(() => rig.wire.udp.some(line => /R0599(?:\s|$)/.test(line))).toBe(true);
      await expect.poll(() => rig.wire.udp.some(line => /V0799(?:\s|$)/.test(line))).toBe(true);
      const state = (await rig.overview()).protocolInputs;
      expect(state.map(input => input.address).sort()).toEqual([
        `http://127.0.0.1:${port}/json`, `ws://127.0.0.1:${port}/buttplug`, `ws://127.0.0.1:${port}/tcode`,
      ].sort());
      for (const input of state) expect(input.connected).toBe(true);
      const counts = Object.fromEntries(state.map(input => [input.id, input.receivedCommands]));
      const malformed = await page.request.post(`http://127.0.0.1:${port}/json-neighbor/command`, { data: { channel: 'R0', value: .9 } });
      expect(malformed.status()).toBe(404);
      expect(Object.fromEntries((await rig.overview()).protocolInputs.map(input => [input.id, input.receivedCommands]))).toEqual(counts);
      await active(page, false);
      await expect.poll(() => rig.wire.udp.at(-1)).toBe('DSTOP');
      await info.attach('shared-port-routing.json', { body: JSON.stringify({ sourcePaths: state.map(input => ({ id: input.id, address: input.address })), counts,
        ordinaryActivation: true, isolatedMockTransports: true, hardwareExecution: false, wire: rig.wire.udp }), contentType: 'application/json' });
    } finally { await Promise.all([bp.close(), tcode.close()]); }
  });

for (const locale of ['zh-CN', 'en-US']) {
  test.describe(`shared protocol path editor ${locale}`, () => {
    test.use({ locale });
    test('mounted endpoints survive edits while duplicate paths are explained before saving / 路径可保存恢复且重复路径阻止保存',
      { tag: ['@config', '@i18n'] }, async ({ page, rig }) => {
        await configure(page, rig); await workspace(page, '设置');
        const panel = page.getByTestId('protocol-inputs-panel');
        // Stable DOM order matches the saved configuration; the ID field remains immutable.
        const card = panel.getByTestId('protocol-input-card').nth(1);
        await expect(card.getByRole('textbox', { name: await text(page, '监听路径'), exact: true })).toHaveValue('/json');
        await expect(card.getByTestId('protocol-endpoint')).toHaveText(`http://127.0.0.1:${port}/json`);
        await card.getByRole('textbox', { name: await text(page, '监听路径'), exact: true }).fill('/buttplug');
        await expect(panel.getByRole('button', { name: await text(page, '保存协议输入'), exact: true })).toBeDisabled();
        await expect(panel).toContainText(await text(page, '共享端口的协议来源须使用不同路径。'));
        await card.getByRole('textbox', { name: await text(page, '监听路径'), exact: true }).fill('/json-new');
        await panel.getByRole('button', { name: await text(page, '保存协议输入'), exact: true }).click();
        await expect.poll(async () => (await config(page, rig)).protocolInputs.find(input => input.id === 'shared-json').path).toBe('/json-new');
        await expect.poll(async () => (await rig.overview()).protocolInputs.find(input => input.id === 'shared-json')?.address).toBe(`http://127.0.0.1:${port}/json-new`);
        expect((await rig.overview()).runtime.inputActive).toBe(false);
        await page.reload(); await workspace(page, '设置');
        await expect(page.getByTestId('protocol-input-card').nth(1).getByRole('textbox', { name: await text(page, '监听路径'), exact: true })).toHaveValue('/json-new');
      });
  });
}
