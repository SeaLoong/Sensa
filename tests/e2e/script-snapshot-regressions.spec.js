import { test, expect, text, mode, active, enable, expand } from './fixtures.js';

for (const locale of ['zh-CN', 'en-US']) {
  test.describe(`nonzero script start ${locale}`, () => {
    test.use({ locale });
    test('load and seek zero retain a nonzero first target across repeated snapshots and reactivation / 载入定位开头与重新启用保留非零首目标',
      { tag: ['@input', '@transport', '@i18n'] }, async ({ page, rig }, info) => {
        await enable(page, ['Mock UDP']);
        await mode(page, '脚本');
        await page.locator('input[type=file]').setInputFiles({ name: 'nonzero-start.funscript', mimeType: 'application/json',
          buffer: Buffer.from(JSON.stringify({ actions: [{ at: 0, pos: 80 }, { at: 1000, pos: 20 }] })) });
        await expect.poll(async () => (await rig.overview()).input.script).toMatchObject({ loaded: true, playing: false, currentL0: .8 });
        expect((await rig.overview()).runtime.inputActive).toBe(false);
        expect(rig.wire.udp.some(line => /L0\d/.test(line))).toBe(false);
        await expand(page, await text(page, '定位与 A-B'));
        await page.getByRole('textbox', { name: await text(page, '跳转时间'), exact: true }).fill('0.5');
        await page.getByRole('button', { name: await text(page, '跳转'), exact: true }).click();
        await expect.poll(async () => (await rig.overview()).input.script).toMatchObject({ playing: false, positionMs: 500, currentL0: .5 });
        await page.getByRole('textbox', { name: await text(page, '跳转时间'), exact: true }).fill('0');
        await page.getByRole('button', { name: await text(page, '跳转'), exact: true }).click();
        await expect.poll(async () => (await rig.overview()).input.script).toMatchObject({ playing: false, positionMs: 0, currentL0: .8 });
        for (let read = 0; read < 3; read++) expect((await rig.overview()).input.script).toMatchObject({ playing: false, positionMs: 0, currentL0: .8 });
        for (let cycle = 0; cycle < 2; cycle++) {
          const previous = rig.wire.udp.length;
          await active(page);
          await expect.poll(() => rig.wire.udp.slice(previous).some(line => /L0560(?:I|S|\s|$)/.test(line))).toBe(true);
          expect((await rig.overview()).input.script.currentL0).toBeCloseTo(.8, 6);
          await active(page, false);
          await expect.poll(() => rig.wire.udp.at(-1)).toBe('DSTOP');
        }
        await info.attach('nonzero-first-target.json', { body: JSON.stringify({ fixtureOnly: true, hardwareExecution: false,
          snapshot: (await rig.overview()).input.script, wire: rig.wire.udp, reactivationCycles: 2 }), contentType: 'application/json' });
      });
  });
}
