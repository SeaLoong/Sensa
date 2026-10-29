import { test, expect } from './fixtures.js';

const port = 19461;
async function slider(page, value) {
  await page.getByLabel('L0 Stroke', { exact: true }).evaluate((element, next) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(element, String(next));
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

for (const [outputType, inputType, scheme, suffix] of [
  ['http', 'JsonHttp', 'http', '/command'],
  ['json-ws', 'JsonWebSocket', 'ws', ''],
  ['tcode-ws', 'TCodeWebSocket', 'ws', ''],
]) {
  test(`WebSensa ${outputType} interoperates with the actual desktop input and isolated UDP output / 网页与桌面协议实际互通`,
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
      await page.goto(rig.baseUrl + '/websensa/?lang=en');
      await expect(page.getByRole('heading', { name: 'Put signals to work', exact: true })).toBeVisible();
      await page.getByRole('tab', { name: /^Outputs/ }).click();
      await page.getByLabel('Output type', { exact: true }).selectOption(outputType);
      await page.getByLabel('Endpoint URL', { exact: true }).fill(`${scheme}://127.0.0.1:${port}/browser${suffix}`);
      await page.getByRole('button', { name: 'Connect output', exact: true }).click();
      await expect(page.getByText('1 connected', { exact: true })).toBeVisible();
      await page.getByRole('tab', { name: /^Control/ }).click();
      await slider(page, 80);
      await page.getByLabel('Input enabled', { exact: true }).check();
      await expect.poll(async () => (await rig.overview()).protocolInputs[0]?.receivedCommands).toBeGreaterThan(0);
      expect((await rig.overview()).runtime.inputActive).toBe(false);
      expect(rig.wire.udp.some(line => /(?:^|\s)L0\d/.test(line))).toBe(false);
      const mode = await page.request.put(rig.baseUrl + '/api/input/mode', { data: { mode: 'Protocol' } });
      expect(mode.ok(), await mode.text()).toBe(true);
      const activation = await page.request.put(rig.baseUrl + '/api/input/active', { data: { active: true } });
      expect(activation.ok(), await activation.text()).toBe(true);
      await expect.poll(() => rig.wire.udp.some(line => /(?:^|\s)L0560(?:\s|$)/.test(line))).toBe(true);
      await expect(page.getByRole('alert')).toHaveCount(0);
      await page.getByRole('button', { name: 'Emergency stop', exact: true }).click();
      await expect(page.getByLabel('Input enabled', { exact: true })).not.toBeChecked();
      await expect.poll(() => rig.wire.udp.at(-1)).toBe('DSTOP');
      const stoppedCount = (await rig.overview()).protocolInputs[0].receivedCommands;
      await page.getByRole('button', { name: 'Clear stop', exact: true }).click();
      // Repeat the last target while both sides are stopped; clearing the latch
      // must not re-enable the browser's timer or replay a pending frame.
      await slider(page, 80);
      await page.waitForTimeout(260); // More than two manual refresh periods must remain silent.
      expect((await rig.overview()).protocolInputs[0].receivedCommands).toBe(stoppedCount);
      expect(rig.wire.udp.at(-1)).toBe('DSTOP');
      await info.attach(`websensa-desktop-${outputType}.json`, { body: JSON.stringify({
        inputType, outputType, actualDesktopProtocol: true, isolatedMockUdp: true,
        browserAndDesktopActivationSeparate: true, receivedCommands: stoppedCount,
        wire: rig.wire.udp, physicalHardware: false,
      }), contentType: 'application/json' });
    });
}
