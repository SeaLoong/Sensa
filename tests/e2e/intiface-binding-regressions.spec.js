import { test, expect, text, workspace, active, enable, expand } from './fixtures.js';

test.describe('computed advanced Intiface routes', () => {
  test.use({ scenario: 'rotation-only' });
  test('computed bindings can target mapped strength and direction axes / 计算连接可驱动映射的强度与方向轴',
    { tag: ['@config', '@input', '@transport'] }, async ({ page, rig }, info) => {
      const config = await page.request.get(rig.baseUrl + '/api/config').then(response => response.json());
      const signal = (id, value) => ({ id, name: id, operation: 'Average', inputs: [{ sourceMode: 'Constant', value }] });
      const binding = (id, address, oscPath) => ({ id, address, source: { sourceMode: 'Computed', oscPath },
        inputMin: 0, inputMax: 1, outputMin: 0, outputMax: 1, stopValue: 0, rateHz: 20, sendMode: 'OnChange' });
      const response = await page.request.put(rig.baseUrl + '/api/config', { data: { ...config,
        computedSignals: [signal('RotationStrength', .4), signal('RotationDirection', .75)],
        outputs: config.outputs.map(output => output.id !== 'intiface' ? output : { ...output,
          intifaceFeatures: [{ deviceName: 'CI rotation only', featureIndex: 2, outputType: 'Rotate', sourceAxis: 'R0', directionAxis: 'A0' }],
          signal: { bindings: [binding('Strength', 'R0', 'RotationStrength'), binding('Direction', 'A0', 'RotationDirection')] },
        }),
      } });
      expect(response.ok(), await response.text()).toBe(true);
      await page.reload();
      await workspace(page, '控制');
      const output = page.locator('.output-card[data-output-id="intiface"]');
      await output.getByRole('button', { name: await text(page, '配置'), exact: true }).click();
      const dialog = page.getByRole('dialog', { name: await text(page, '输出设置'), exact: true });
      await expand(page, await text(page, '独立信号连接'));
      const choices = await dialog.getByTestId('output-binding').first().getByRole('combobox', { name: await text(page, '目标轴'), exact: true }).locator('option').allTextContents();
      expect(choices).toEqual(expect.arrayContaining(['R0', 'A0']));
      await dialog.getByRole('button', { name: await text(page, '取消'), exact: true }).click();
      await enable(page, ['Mock Intiface']);
      expect((await rig.overview()).runtime.inputActive).toBe(false);
      expect(rig.wire.intiface.some(frame => frame.OutputCmd)).toBe(false);
      await active(page);
      await expect.poll(() => rig.wire.intiface.filter(frame => frame.OutputCmd?.Command?.Rotate)
        .map(frame => frame.OutputCmd.Command.Rotate.Value).at(-1)).toBe(400);
      const before = rig.wire.intiface.length;
      await active(page, false);
      await expect.poll(() => rig.wire.intiface.slice(before).some(frame => frame.StopCmd)).toBe(true);
      await info.attach('computed-intiface-axes.json', { body: JSON.stringify({ fixtureOnly: true, hardwareExecution: false,
        choices, wire: rig.wire.intiface }), contentType: 'application/json' });
    });
});
