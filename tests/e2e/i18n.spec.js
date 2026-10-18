import { test, expect, card, text, enable, mode, active, workspace, oscWorkspace, expand, allowSpatial, checkpoint, outputValue } from './fixtures.js';
import { pointSamples } from './mocks.js';

test.use({locale:'en-US'});

test('browser language persists and preserves drafts without control requests', {tag:['@i18n','@visual']}, async ({page,rig}) => {
  await expect(page.locator('html')).toHaveAttribute('lang','en-US');
  const slider = page.getByRole('slider',{name:await text(page,'L0 主轴'),exact:true});
  await slider.press('End'); const draft = await slider.inputValue();
  const before = rig.commands.filter(command => command.method !== 'GET').length;
  await page.getByLabel('Language / 语言').selectOption('zh-CN');
  await expect(page.getByRole('button',{name:'帮助',exact:true})).toBeVisible();
  await expect(page.getByRole('slider',{name:'L0 主轴',exact:true})).toHaveValue(draft);
  await page.getByLabel('Language / 语言').selectOption('en-US');
  await expect(page.getByRole('button',{name:'Help',exact:true})).toBeVisible();
  await expect(page.getByRole('slider',{name:await text(page,'L0 主轴'),exact:true})).toHaveValue(draft);
  expect(rig.commands.filter(command => command.method !== 'GET')).toHaveLength(before);
  expect((await rig.overview()).runtime.inputActive).toBe(false); expect(rig.wire.udp).toEqual([]);
  await checkpoint(page,page.locator('.app-header'),'english-toolbar');
  await checkpoint(page,page.locator('main .section').first(),'english-manual');
  await page.getByLabel('Language / 语言').selectOption('zh-CN'); await page.reload();
  await expect(page.getByRole('button',{name:'帮助',exact:true})).toBeVisible(); await expect(page.locator('html')).toHaveAttribute('lang','zh-CN');
});

test('English experimental calibration drives only after opt-in and stops on release', {tag:['@i18n','@visual']}, async ({page,rig}) => {
  await enable(page,['Mock UDP']); await mode(page,'OSC');
  const feed = await rig.startFeed(pointSamples(.05)); await allowSpatial(page);
  await expand(page,await text(page,'本地点与根部')); await expand(page,await text(page,'两点量程校准'));
  await expect.poll(async () => (await rig.overview()).poseTracking.spsRoots.some(point => point.valid && Math.abs(point.position.z-.05)<.001)).toBe(true);
  await expect(page.locator('.point-diagnostic-grid .metrics dd').first()).toHaveText(/^2\.0 \/ -?0\.0 \/ 5\.0 cm$/);
  await page.getByRole('button',{name:await text(page,'采集 0%'),exact:true}).click();
  await expect(page.locator('.calibration-grid output').nth(0)).toHaveText('5.0 cm');
  await feed.set(pointSamples(.15));
  await expect.poll(async () => (await rig.overview()).poseTracking.spsRoots.some(point => point.valid && Math.abs(point.position.z-.15)<.001)).toBe(true);
  await expect(page.locator('.point-diagnostic-grid .metrics dd').first()).toHaveText(/^2\.0 \/ -?0\.0 \/ 15\.0 cm$/);
  await page.getByRole('button',{name:await text(page,'采集 100%'),exact:true}).click();
  await expect(page.locator('.calibration-grid output').nth(1)).toHaveText('15.0 cm');
  await expect(page.getByRole('button',{name:await text(page,'替换为校准映射'),exact:true})).toBeEnabled();
  await checkpoint(page,page.locator('.calibration-grid'),'english-calibration');
  await page.getByRole('button',{name:await text(page,'替换为校准映射'),exact:true}).click();
  await oscWorkspace(page,'映射'); await page.getByRole('button',{name:await text(page,'保存映射'),exact:true}).click();
  await expect.poll(async () => (await rig.overview()).signals.length).toBe(1);
  await workspace(page,'控制'); await active(page); await feed.set(pointSamples(.1)); await outputValue(rig,'udp',500);
  await checkpoint(page,card(page,'Mock UDP').locator('.output-position-panel'),'english-output');
  await feed.set(pointSamples(.1,false)); await expect.poll(() => rig.wire.udp.at(-1)).toBe('DSTOP');
});

test('English presets, script and compact help use localized documentation', {tag:['@i18n','@visual']}, async ({page}) => {
  await mode(page,'脚本'); await checkpoint(page,page.locator('.script-player'),'english-script');
  await oscWorkspace(page,'映射');
  await expect(page.getByLabel(await text(page,'预设方案'),{exact:true}).locator('option')).toHaveCount(5);
  await page.getByLabel(await text(page,'预设方案'),{exact:true}).selectOption('sps-socket-depth-others');
  await expect(page.getByRole('button',{name:await text(page,'替换草稿'),exact:true})).toBeEnabled();
  await page.getByRole('button',{name:'Help',exact:true}).click();
  await expect(page.getByRole('link',{name:await text(page,'使用指南'),exact:true})).toHaveAttribute('href',/guide\.en\.md$/);
  await expect(page.getByRole('link',{name:await text(page,'Unity 指南'),exact:true})).toHaveAttribute('href',/README\.en\.md$/);
  await checkpoint(page,page.getByRole('dialog'),'english-help');
});
