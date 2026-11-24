import { execFileSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { test, expect, oscWorkspace, mode, selectMappingPreset } from './fixtures.js';

test.use({launchOptions:{args:['--disable-features=Translate']}});

test('choose who to track and apply an OSR depth source', async ({page}) => {
  const dir = 'artifacts/preset-interaction';
  await mkdir(dir, { recursive: true });
  await mode(page, 'OSC');
  await oscWorkspace(page, '映射');
  await selectMappingPreset(page, 'ogb-depth');
  const source = page.getByLabel('如何测量前后动作？', { exact: true });
  await expect(source.locator('option')).toHaveCount(5);
  await expect(source.locator('optgroup')).toHaveCount(2);
  await source.focus();
  await source.press('Alt+ArrowDown');
  await page.waitForTimeout(350);
  execFileSync('import', ['-window', 'root', '-crop', '1030x670+226+225', '+repage', dir + '/source-menu.png']);
  await page.keyboard.press('Escape');
  await source.selectOption('native-contact-axial');
  await page.getByRole('button', {name:'替换草稿', exact:true}).click();
  await expect(page.locator('.mapping-row__target select').first()).toHaveValue('Depth');
  await expect(page.locator('.mapping-row__target select').nth(1)).toHaveValue('GateEnable');
  await expect(page.locator('.toast')).toHaveCount(0);
  await page.screenshot({path: dir + '/contact-draft.png'});
  await page.getByRole('button',{name:'其他预设',exact:true}).click();
  const extra = page.getByLabel('预设方案',{exact:true});
  await expect(extra.locator('optgroup[label="振动（需设备支持）"] option')).toHaveCount(6);
  await page.getByRole('button',{name:'返回主轴跟随',exact:true}).click();
  await expect(source).toHaveValue('ogb-depth');
});
