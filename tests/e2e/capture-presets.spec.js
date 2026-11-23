import { execFileSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { test, expect, oscWorkspace, mode } from './fixtures.js';

test.use({launchOptions:{args:['--disable-features=Translate']}});

test('capture both choices and the resulting draft', async ({page}) => {
  const dir = 'artifacts/preset-interaction';
  await mkdir(dir, { recursive: true });
  await mode(page, 'OSC');
  await oscWorkspace(page, '映射');
  const experience = page.getByLabel('动作效果', { exact: true });
  const setup = page.getByLabel('Avatar 配置', { exact: true });
  await experience.selectOption('follow');
  await setup.selectOption('ogb-depth');
  await page.screenshot({path: dir + '/01-sps.png'});
  async function menu(control, filename) {
    await control.focus();
    await control.press('Alt+ArrowDown');
    await page.waitForTimeout(300);
    execFileSync('import', ['-window', 'root', '-crop', '1040x550+220+255', '+repage', dir + '/' + filename]);
    await page.keyboard.press('Escape');
  }
  await menu(experience, '02-experiences.png');
  await menu(setup, '03-setups.png');
  await page.getByRole('button', { name: '替换草稿', exact: true }).click();
  await expect(page.locator('.mapping-row')).toHaveCount(1);
  await expect(page.locator('.mapping-row__target select')).toHaveValue('Depth');
  await setup.selectOption('native-contact-axial');
  await experience.selectOption('gentle');
  await expect(setup).toHaveValue('native-contact-axial-soft-entry');
  await page.screenshot({path: dir + '/04-gentle-contact.png'});
  await page.getByRole('button', {name:'替换草稿', exact:true}).click();
  await expect(page.locator('.mapping-row')).toHaveCount(2);
  await expect(page.locator('.toast')).toHaveCount(0);
  await page.screenshot({path: dir + '/05-draft.png'});
  await experience.selectOption('other');
  const optional = page.getByLabel('预设方案', { exact: true });
  await expect(optional.locator('optgroup[label="振动（需设备支持）"] option')).toHaveCount(6);
});
