import { test as baseTest, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const test = baseTest.extend({
  launchOptions: [{ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }, { scope: 'worker', option: true }],
});
const guideFile = new URL('../../docs/parameter-geometry.html', import.meta.url);
const rootControl = page => page.locator('#control-socketRootRadius');
const snapshot = page => page.evaluate(() => window.SensaGeometryView.snapshot());

async function chooseScene(page, scene) {
  await page.locator('#scene').selectOption(scene);
  await page.locator('#reset').click();
  await page.locator('#projection').selectOption('xz');
  await expect(page.locator('#scene')).toHaveValue(scene);
}

async function setRange(page, name, value) {
  const input = page.locator('#control-' + name);
  await expect(input).toBeVisible();
  await input.evaluate((element, next) => {
    element.value = String(next);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
  await expect(input).toHaveValue(String(value));
}

async function valueNear(page, name, expected) {
  const cell = page.locator('#values tr[data-name="' + name + '"] [data-column="raw"]');
  await expect(cell).toBeVisible();
  const raw = await cell.getAttribute('data-value');
  expect(raw).not.toBeNull();
  expect(raw).not.toBe('');
  expect(Number(raw)).toBeCloseTo(expected, 8);
  expect(Number((await cell.textContent()).trim())).toBeCloseTo(expected, 3);
}

async function assertRadius(page, expected) {
  await expect(rootControl(page)).toHaveValue(String(expected));
  const current = await snapshot(page);
  expect(current.state.socketRootRadius).toBe(expected);
  expect(current.result.parameters.socketRootRadius).toBe(expected);
  const sender = current.result.shapes.find(shape => shape.id === 'sender-socket-root');
  expect(sender).toMatchObject({ id: 'sender-socket-root', type: 'sphere', radius: expected });
  await expect(page.locator('#diagram [data-shape-id="sender-socket-root"]')).toHaveAttribute('data-radius', String(expected));
  // The mathematical point still needs a visible location marker in the drawing.
  await expect(page.locator('#diagram [data-shape-id="sender-socket-root"] circle.shape')).toBeVisible();
  return current;
}

async function noHorizontalOverflow(page) {
  const layout = await page.evaluate(() => {
    const control = document.querySelector('#control-socketRootRadius'), box = control.getBoundingClientRect();
    return { viewport: document.documentElement.clientWidth, document: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      left: box.left, right: box.right };
  });
  expect(layout.document).toBeLessThanOrEqual(layout.viewport + 1);
  expect(layout.left).toBeGreaterThanOrEqual(-1);
  expect(layout.right).toBeLessThanOrEqual(layout.viewport + 1);
  return layout;
}

async function exportRecording(page) {
  const pending = page.waitForEvent('download');
  await page.locator('#signal-export').click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe('sensa-plug-depth-PenOthers.funscript');
  return JSON.parse(await readFile(await download.path(), 'utf8'));
}

for (const locale of ['zh-CN', 'en-US']) {
  test.describe('SPS3 Socket root geometry / SPS3 Socket 根标记几何 ' + locale, () => {
    test.use({ locale });

    test('zero-radius selection changes Plug and Frot geometry and survives standard script export / 零半径选择改变 Plug 与 Frot 几何并保留标准脚本导出',
      { tag: ['@config', '@i18n'] }, async ({ page }, info) => {
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(guideFile.href);
        await expect(page.locator('#scene')).toBeVisible();
        await page.locator('#locale').selectOption(locale);
        await expect(page.locator('html')).toHaveAttribute('lang', locale);
        await expect(rootControl(page)).toBeHidden();

        await chooseScene(page, 'plug-depth');
        await setRange(page, 'L', .2);
        await setRange(page, 'x', 0);
        await setRange(page, 'y', 0);
        await setRange(page, 'z', .1);
        await assertRadius(page, .001);
        await valueNear(page, 'PenOthers', .505);
        await rootControl(page).selectOption('0');
        const plugPoint = await assertRadius(page, 0);
        await valueNear(page, 'PenOthers', .5);
        const plugLayout = await noHorizontalOverflow(page);

        // A zero choice must survive re-rendering rather than fall back to the old 1 mm marker.
        await page.locator('#locale').selectOption(locale === 'en-US' ? 'zh-CN' : 'en-US');
        await assertRadius(page, 0);
        await valueNear(page, 'PenOthers', .5);
        await page.locator('#locale').selectOption(locale);
        await assertRadius(page, 0);
        await setRange(page, 'z', .2);
        await valueNear(page, 'PenOthers', 0);
        await rootControl(page).selectOption('0.001');
        await valueNear(page, 'PenOthers', .005);
        await page.locator('#reset').click();
        await assertRadius(page, .001);

        await rootControl(page).selectOption('0');
        await setRange(page, 'z', .1);
        await page.locator('#signal-workbench > summary').click();
        await page.locator('#signal-parameter').selectOption('PenOthers');
        await page.locator('#signal-min').fill('0');
        await page.locator('#signal-max').fill('1');
        await page.locator('#signal-invert').uncheck();
        await expect(page.locator('#signal-reading')).toHaveText('50%');
        await page.locator('#signal-record').click();
        await expect.poll(async () => (await snapshot(page)).signal.recording.sampleCount).toBeGreaterThanOrEqual(2);
        await setRange(page, 'z', .05);
        await expect(page.locator('#signal-reading')).toHaveText('75%');
        await expect.poll(async () => (await snapshot(page)).signal.recording.durationMs).toBeGreaterThanOrEqual(150);
        await page.locator('#signal-stop').click();
        const script = await exportRecording(page);
        expect(script.actions[0]).toEqual({ at: 0, pos: 50 });
        expect(script.actions.at(-1).pos).toBe(75);
        expect(script.actions.every((action, index) => Number.isInteger(action.at) && action.at >= 0
          && Number.isInteger(action.pos) && action.pos >= 0 && action.pos <= 100
          && (!index || action.at > script.actions[index - 1].at))).toBe(true);
        expect(script.metadata.source).toBe('Sensa parameter explorer');
        expect(script.metadata.mapping).toMatchObject({ scenario: 'plug-depth', parameter: 'PenOthers',
          axis: 'L0', min: 0, max: 1, invert: false, socketRootRadius: 0 });
        await rootControl(page).selectOption('0.001');
        const reexported = await exportRecording(page);
        expect(reexported.actions).toEqual(script.actions);
        expect(reexported.metadata.mapping).toEqual(script.metadata.mapping);

        await chooseScene(page, 'socket-frot');
        await setRange(page, 'x', 0);
        await setRange(page, 'y', 0);
        await setRange(page, 'z', .1);
        await assertRadius(page, .001);
        await valueNear(page, 'FrotOthers', .51);
        await rootControl(page).selectOption('0');
        const frotPoint = await assertRadius(page, 0);
        await valueNear(page, 'FrotOthers', .5);
        const frotLayout = await noHorizontalOverflow(page);
        await setRange(page, 'z', .15);
        await valueNear(page, 'FrotOthers', 0);
        await rootControl(page).selectOption('0.001');
        await valueNear(page, 'FrotOthers', .01);
        await page.locator('#reset').click();
        await assertRadius(page, .001);
        await chooseScene(page, 'socket-modern');
        await expect(rootControl(page)).toBeHidden();
        expect(errors).toEqual([]);
        await info.attach('sps3-socket-root-geometry.json', {
          body: JSON.stringify({ producerCommit: '59fa4fa0277c0f3eb7c73811d9b24bf73e2133f4',
            locale, simulatedGeometry: true, unityClientExecution: false, hardwareExecution: false,
            plugPoint, frotPoint, plugLayout, frotLayout, script }), contentType: 'application/json',
        });
      });
  });
}
