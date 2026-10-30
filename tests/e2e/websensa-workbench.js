import { expect } from '@playwright/test';

/** The browser and executable use this same workbench; exercise its visible controls. */
export async function openWorkbench(page, url) {
  await page.goto(url);
  await expect(page.getByRole('heading', { name: 'WebSensa', exact: true })).toBeVisible();
  await expect(page.getByRole('switch', { name: 'Input enabled', exact: true })).toBeEnabled();
}
export async function controlWorkspace(page) {
  await page.locator('#workspace-tabs-control').click();
}
export async function addWorkbenchOutput(page, type, endpoint, { name, deviceName, profile } = {}) {
  await controlWorkspace(page);
  await page.getByTestId('output-type').selectOption(type);
  await page.getByTestId('add-output').click();
  const dialog = page.getByRole('dialog', { name: 'Output settings', exact: true });
  await expect(dialog).toBeVisible();
  const outputName = name || type + ' ' + (await page.locator('.output-card').count());
  await dialog.getByLabel('Name', { exact: true }).fill(outputName);
  if (endpoint) await dialog.getByLabel(type === 'Intiface' ? 'WebSocket URL' : 'Endpoint URL', { exact: true }).fill(endpoint);
  if (deviceName) await dialog.getByLabel('Matching device name', { exact: true }).fill(deviceName);
  if (profile) await dialog.getByLabel('Bluetooth protocol', { exact: true }).selectOption(profile);
  // Use an explicit no-slope profile for deterministic wire assertions. The same
  // shared encoder's interval/speed cases have dedicated domain regression tests.
  if (type === 'TCodeWebSocket') await dialog.getByLabel('Output motion mode', { exact: true }).selectOption('NoSlope');
  await dialog.getByRole('button', { name: 'Save output', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const card = page.locator('.output-card').filter({ has: page.getByRole('heading', { name: outputName, exact: true }) });
  await card.getByRole('button', { name: 'Enable', exact: true }).click();
  await expect(card.locator('.output-identity').getByText('Connected', { exact: true })).toBeVisible();
  return card;
}
export async function changeWorkbenchInput(page, mode) {
  await controlWorkspace(page);
  await page.locator('#input-tabs-' + mode.toLowerCase()).click();
  const apply = page.getByRole('button', { name: 'Apply input mode', exact: true });
  if (await apply.isVisible()) await apply.click();
  await expect(apply).not.toBeVisible();
}
export async function manualMotion(page, axis, value) {
  const moreAxes = page.locator('.manual-workspace details').filter({ has: page.locator('input[type="range"][aria-label^="' + axis + ' "]') });
  if (await moreAxes.count()) await moreAxes.evaluate(element => { element.open = true; });
  const slider = page.locator('.manual-workspace').getByRole('slider', { name: new RegExp('^' + axis + ' ') });
  await slider.evaluate((element, next) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(element, String(next));
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
  await expect(slider).toHaveValue(String(value));
}
export async function uploadWorkbenchScript(page, name, actions) {
  await changeWorkbenchInput(page, 'Script');
  await page.locator('.script-player input[type="file"]').setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ actions })) });
  await expect(page.locator('.script-player h3')).toHaveText(name);
}
export const inputActivation = page => page.getByRole('switch', { name: 'Input enabled', exact: true });
