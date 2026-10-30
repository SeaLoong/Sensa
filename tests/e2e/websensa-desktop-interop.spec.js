import { test, expect } from './fixtures.js';

import { openWorkbench, addWorkbenchOutput, manualMotion, inputActivation } from './websensa-workbench.js';

const port = 19461;
for (const [wireType, outputType, inputType, scheme, suffix] of [
  ['http', 'SensaHttp', 'JsonHttp', 'http', '/command'],
  ['json-ws', 'SensaWebSocket', 'JsonWebSocket', 'ws', ''],
  ['tcode-ws', 'TCodeWebSocket', 'TCodeWebSocket', 'ws', ''],
]) {
  test(`WebSensa ${wireType} interoperates with the actual desktop input and isolated UDP output / 网页与桌面协议实际互通`,
    { tag: ['@input', '@transport'] }, async ({ page, rig }, info) => {
      const before = await page.request.get(rig.baseUrl + '/api/config').then(response => response.json());
      const configuration = await page.request.put(rig.baseUrl + '/api/config', { data: { ...before,
        outputs: before.outputs.map(output => ({ ...output, enabled: output.id === 'udp' })),
        protocolInputs: [{ id: 'websensa-peer', name: 'WebSensa peer', type: inputType,
          enabled: true, host: '127.0.0.1', port, path: '/browser', timeoutMs: 10000, routeToMotion: true,
          features: [{ channel: 'L0', actuator: 'Position', targetAxis: 'L0' }] }],
      } });
      expect(configuration.ok(), await configuration.text()).toBe(true);
      await expect.poll(async () => (await rig.overview()).protocolInputs[0]?.listening).toBe(true);
      await expect.poll(async () => (await rig.overview()).outputs.find(output => output.id === 'udp')?.connected).toBe(true);
      await openWorkbench(page, rig.baseUrl + '/websensa/?lang=en');
      await addWorkbenchOutput(page, outputType, `${scheme}://127.0.0.1:${port}/browser${suffix}`);
      await manualMotion(page, 'L0', 800);
      await inputActivation(page).check();
      await expect.poll(async () => (await rig.overview()).protocolInputs[0]?.receivedCommands).toBeGreaterThan(0);
      expect((await rig.overview()).runtime.inputActive).toBe(false);
      expect(rig.wire.udp.some(line => /(?:^|\s)L0\d/.test(line))).toBe(false);
      const mode = await page.request.put(rig.baseUrl + '/api/input/mode', { data: { mode: 'Protocol' } });
      expect(mode.ok(), await mode.text()).toBe(true);
      const activation = await page.request.put(rig.baseUrl + '/api/input/active', { data: { active: true } });
      expect(activation.ok(), await activation.text()).toBe(true);
      // Activation clears commands that arrived while the desktop was inactive.
      // A fresh browser target must cross the real protocol lease after arming.
      const receivedBefore = (await rig.overview()).protocolInputs[0].receivedCommands;
      await manualMotion(page, 'L0', 810);
      await expect.poll(async () => (await rig.overview()).protocolInputs[0]?.receivedCommands).toBeGreaterThan(receivedBefore);
      await manualMotion(page, 'L0', 800);
      await expect.poll(() => rig.wire.udp.some(line => /(?:^|\s)L0560(?:[IS]\d+)?(?:\s|$)/.test(line))).toBe(true);
      await expect(page.getByRole('alert')).toHaveCount(0);
      await page.getByRole('button', { name: 'Emergency stop', exact: true }).click();
      await expect(inputActivation(page)).not.toBeChecked();
      await expect.poll(() => rig.wire.udp.at(-1)).toBe('DSTOP');
      const stoppedCount = (await rig.overview()).protocolInputs[0].receivedCommands;
      await page.getByRole('button', { name: 'Release emergency stop', exact: true }).click();
      // Repeat the last target while both sides are stopped; clearing the latch
      // must not re-enable the browser's timer or replay a pending frame.
      await manualMotion(page, 'L0', 800);
      await page.waitForTimeout(260); // More than two manual refresh periods must remain silent.
      expect((await rig.overview()).protocolInputs[0].receivedCommands).toBe(stoppedCount);
      expect(rig.wire.udp.at(-1)).toBe('DSTOP');
      await info.attach(`websensa-desktop-${wireType}.json`, { body: JSON.stringify({
        inputType, outputType: wireType, sharedOutputType: outputType, actualDesktopProtocol: true, isolatedMockUdp: true,
        browserAndDesktopActivationSeparate: true, receivedCommands: stoppedCount,
        wire: rig.wire.udp, physicalHardware: false,
      }), contentType: 'application/json' });
    });
}
