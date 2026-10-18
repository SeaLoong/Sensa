import { test, expect, card, checkpoint, outputValue } from './fixtures.js';
import { pointSamples } from './mocks.js';

test.use({ locale: 'en-US' });

test('language follows browser, persists and preserves drafts without sending control requests', { tag: ['@i18n', '@visual'] }, async ({ page, rig }) => {
  await expect(page.locator('html')).toHaveAttribute('lang','en-US');
  await page.getByRole('slider').first().press('End');
  const slider=page.getByRole('slider').first();
  const draft=await slider.getAttribute('aria-valuenow');
  const commandsBefore = rig.commands.filter(command => command.method !== 'GET').length;
  await page.getByLabel('Language / 语言').selectOption('zh-CN');
  await expect(page.getByRole('button',{name:'使用帮助',exact:true})).toBeVisible();
  await expect(slider).toHaveAttribute('aria-valuenow',draft);
  await page.getByLabel('Language / 语言').selectOption('en-US');
  await expect(page.getByRole('button',{name:'Help',exact:true})).toBeVisible();
  await expect(slider).toHaveAttribute('aria-valuenow',draft);
  expect(rig.commands.filter(command => command.method !== 'GET')).toHaveLength(commandsBefore);
  expect((await rig.overview()).runtime.inputActive).toBe(false);
  expect(rig.wire.udp).toEqual([]);
  await checkpoint(page,page.locator('.studio-toolbar'),'english-toolbar');
  await checkpoint(page,page.locator('.section-card').first(),'english-manual');
  await page.getByLabel('Language / 语言').selectOption('zh-CN');
  await page.reload();
  await expect(page.getByRole('button',{name:'使用帮助',exact:true})).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang','zh-CN');
});

test('English OSC calibration and diagnostics drive mock output and stop on release', { tag: ['@i18n', '@visual'] }, async ({page,rig})=>{
  await card(page,'Mock UDP').getByRole('button',{name:'Enable',exact:true}).click();
  await expect(card(page,'Mock UDP').getByText('Connected',{exact:true})).toBeVisible();
  await page.getByRole('tab',{name:'OSC',exact:true}).click();
  await page.getByRole('button',{name:'Apply input mode',exact:true}).click();
  await rig.send(pointSamples(.05));
  await page.getByRole('tab',{name:'Range calibration',exact:true}).click();
  await expect(page.getByText('Current Z: 5.0 cm',{exact:true})).toBeVisible();
  await expect(page.getByText('Local point position valid',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Capture 0%',exact:true}).click();
  await rig.send(pointSamples(.15));
  await expect(page.getByText('Current Z: 15.0 cm',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Capture 100%',exact:true}).click();
  await checkpoint(page,page.locator('.point-calibration'),'english-calibration');
  await page.getByRole('button',{name:'Replace with calibration',exact:true}).click();
  await page.getByRole('button',{name:/Save and apply mappings/}).click();
  const input=page.getByRole('checkbox',{name:'Input enabled (off stops devices)',exact:true});
  await expect(input).not.toBeChecked();await input.click();
  await rig.send(pointSamples(.1));await outputValue(rig,'udp',500);
  await checkpoint(page,card(page,'Mock UDP').locator('.output-position-panel'),'english-output');
  await rig.send(pointSamples(.1,false));
  await expect.poll(()=>rig.wire.udp.at(-1)).toBe('DSTOP');
});

test('English presets, script and help use localized text and documentation', { tag: ['@i18n', '@visual'] }, async({page})=>{
  await page.getByRole('tab',{name:'Script',exact:true}).click();
  await checkpoint(page,page.locator('.script-player-console'),'english-script');
  await page.getByRole('button',{name:'Help',exact:true}).click();
  await page.getByRole('tab',{name:'Choosing presets',exact:true}).click();
  await page.getByRole('textbox',{name:'Search presets',exact:true}).fill('Shader');
  await expect(page.getByText('Experiment · Shader image bridge Z (calibrate)',{exact:true})).toBeVisible();
  await expect(page.getByRole('link',{name:'Full user guide',exact:true})).toHaveAttribute('href',/guide\.en\.md$/);
  await checkpoint(page,page.getByRole('dialog'),'english-help');
});
