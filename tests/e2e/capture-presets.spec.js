import { execFileSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { test, expect, oscWorkspace } from './fixtures.js';

test('capture current preset selection and draft', async ({page}) => {
  const dir = 'artifacts/preset-interaction';
  await mkdir(dir, { recursive: true });
  await oscWorkspace(page, '映射');
  const preset = page.getByLabel('预设方案', { exact: true });
  await preset.selectOption('ogb-depth-touch');
  await page.screenshot({path: dir + '/01-picker.png'});
  await preset.focus();
  await preset.press('Alt+ArrowDown');
  await page.waitForTimeout(500);
  execFileSync('import', ['-window', 'root', dir + '/02-open-menu.png']);
  await page.keyboard.press('Escape');
  await preset.selectOption('native-contact-axial');
  await expect(page.getByText(/自己的接收器已上报高级位置/)).toBeVisible();
  await page.screenshot({path: dir + '/03-choice.png'});
  await page.getByRole('button', {name:'替换草稿', exact:true}).click();
  await expect(page.locator('.mapping-row')).toHaveCount(2);
  await expect(page.locator('.toast')).toHaveCount(0);
  await page.screenshot({path: dir + '/04-draft.png', fullPage: true});
});
