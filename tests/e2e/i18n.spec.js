import { test, expect, card, text, enable, mode, active, workspace, oscWorkspace, expand, allowSpatial, checkpoint, outputValue } from './fixtures.js';
import { pointSamples } from './mocks.js';
import { assertCalibrationAlignment } from './ui-quality.js';

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
  await checkpoint(page,page.locator('.manual-workspace'),'english-manual');
  await page.getByLabel('Language / 语言').selectOption('zh-CN'); await page.reload();
  await expect(page.getByRole('button',{name:'帮助',exact:true})).toBeVisible(); await expect(page.locator('html')).toHaveAttribute('lang','zh-CN');
});


test('URL, explicit preference and ordered environment languages choose the UI without activating input / URL、显式偏好与有序环境语言选择界面但不启用输入',
  { tag: ['@i18n', '@config'] }, async ({ page, rig }) => {
    const cases = [
      { name: 'URL Chinese variant', requested: 'ZH_hant_tw', saved: 'en-US', languages: ['en-US'], expected: 'zh-CN' },
      { name: 'URL English variant', requested: 'EN_gb', saved: 'zh-CN', languages: ['zh-CN'], expected: 'en-US', switchAndReload: true },
      { name: 'canonical saved choice', saved: 'zh_HK', languages: ['en-US'], expected: 'zh-CN' },
      { name: 'invalid URL preserves supported choice', requested: 'de-DE', saved: 'zh-CN', languages: ['en-US'], expected: 'zh-CN' },
      { name: 'ordered later Chinese', saved: 'bad', languages: ['fr-FR', 'zh_Hant_TW', 'en-US'], expected: 'zh-CN' },
      { name: 'ordered English first', languages: ['fr-FR', 'EN_gb', 'zh-CN'], expected: 'en-US' },
      { name: 'empty languages uses language', languages: [], language: 'zh_TW', expected: 'zh-CN' },
      { name: 'unsupported environment', languages: ['fr-FR', 'de-DE'], language: 'fr-FR', expected: 'en-US' },
      { name: 'denied storage', denied: true, languages: ['fr-FR', 'zh-HK'], expected: 'zh-CN' },
    ];
    for (const scenario of cases) await test.step(scenario.name, async () => {
      const child = await page.context().newPage(), errors = [], commands = [];
      child.on('pageerror', error => errors.push(error.message));
      child.on('websocket', socket => socket.on('framesent', ({ payload }) => {
        try { const command = JSON.parse(payload.toString()); if (command.method && command.path) commands.push(command); }
        catch { /* Ignore non-command frames / 忽略非命令帧。 */ }
      }));
      await child.addInitScript(({ languages, language, saved, denied }) => {
        Object.defineProperty(navigator, 'languages', { configurable: true, value: languages });
        Object.defineProperty(navigator, 'language', { configurable: true, value: language || 'en-US' });
        if (denied) Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('Storage blocked', 'SecurityError'); } });
        else if (window.name !== 'locale-fixture-ready') {
          if (saved === undefined) localStorage.removeItem('sensa.locale'); else localStorage.setItem('sensa.locale', saved);
          window.name = 'locale-fixture-ready';
        }
      }, scenario);
      try {
        const url = new URL(rig.baseUrl); if (scenario.requested) url.searchParams.set('lang', scenario.requested);
        await child.goto(url.href);
        await expect(child.locator('html')).toHaveAttribute('lang', scenario.expected);
        await expect(child.getByRole('button', { name: scenario.expected === 'en-US' ? 'Help' : '帮助', exact: true })).toBeVisible();
        await expect(child.getByLabel('Language / 语言', { exact: true })).toHaveValue(scenario.expected);
        if (scenario.switchAndReload) {
          const slider = child.getByRole('slider', { name: await text(child, 'L0 主轴'), exact: true });
          await slider.press('End'); const draft = await slider.inputValue();
          await child.getByLabel('Language / 语言', { exact: true }).selectOption('zh-CN');
          await expect(child.getByRole('slider', { name: 'L0 主轴', exact: true })).toHaveValue(draft);
          expect(new URL(child.url()).searchParams.get('lang')).toBe('zh-CN');
          expect(await child.evaluate(() => localStorage.getItem('sensa.locale'))).toBe('zh-CN');
          await child.reload(); await expect(child.locator('html')).toHaveAttribute('lang', 'zh-CN');
          const withoutOverride = new URL(rig.baseUrl); await child.goto(withoutOverride.href);
          await expect(child.locator('html')).toHaveAttribute('lang', 'zh-CN');
        }
        if (scenario.denied) {
          await child.getByLabel('Language / 语言', { exact: true }).selectOption('en-US');
          await expect(child.getByRole('button', { name: 'Help', exact: true })).toBeVisible();
        }
        expect(commands.filter(command => command.method !== 'GET')).toEqual([]);
        expect((await rig.overview()).runtime.inputActive).toBe(false); expect(rig.wire.udp).toEqual([]);
        expect(errors).toEqual([]);
      } finally { await child.close(); }
    });
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
  await expect(page.getByRole('button',{name:await text(page,'替换草稿'),exact:true})).toBeEnabled();
  await assertCalibrationAlignment(page, test.info());
  await checkpoint(page,page.locator('.calibration-grid'),'english-calibration');
  await page.getByRole('button',{name:await text(page,'替换草稿'),exact:true}).click();
  await oscWorkspace(page,'映射'); await page.getByRole('button',{name:await text(page,'保存映射'),exact:true}).click();
  await expect.poll(async () => (await rig.overview()).signals.length).toBe(1);
  await workspace(page,'控制'); await active(page); await feed.set(pointSamples(.1)); await outputValue(rig,'udp',500);
  await checkpoint(page,card(page,'Mock UDP').locator('.output-position-panel'),'english-output');
  await feed.set(pointSamples(.1,false)); await expect.poll(() => rig.wire.udp.at(-1)).toBe('DSTOP');
});

test('English presets, script and compact help use localized documentation', {tag:['@i18n','@visual']}, async ({page,rig}) => {
  await mode(page,'脚本');
  await expect(page.getByRole('slider',{name:await text(page,'时间轴'),exact:true})).toHaveCount(0);
  await checkpoint(page,page.locator('.script-player__controls'),'english-script');
  await page.locator('input[type=file]').setInputFiles({
    name:'english-preview.funscript',mimeType:'application/json',
    buffer:Buffer.from(JSON.stringify({actions:[{at:0,pos:0},{at:5000,pos:100},{at:10000,pos:0}]})),
  });
  await expect.poll(async () => (await rig.overview()).input.script.loaded).toBe(true);
  await expect(page.getByRole('button',{name:await text(page,'播放'),exact:true})).toBeEnabled();
  await expect(page.getByRole('slider',{name:await text(page,'时间轴'),exact:true})).toBeVisible();
  expect((await rig.overview()).runtime.inputActive).toBe(false);
  await checkpoint(page,page.locator('.script-player__controls'),'english-script-loaded');
  await checkpoint(page,page.locator('.script-player__options'),'english-script-options');
  await oscWorkspace(page,'映射');
  await expect(page.getByLabel(await text(page,'预设方案'),{exact:true}).locator('option')).toHaveCount(3);
  await page.getByLabel(await text(page,'预设方案'),{exact:true}).selectOption('ogb-depth');
  await expect(page.getByRole('button',{name:await text(page,'替换草稿'),exact:true})).toBeEnabled();
  await page.getByRole('button',{name:'Help',exact:true}).click();
  await expect(page.getByRole('link',{name:await text(page,'使用指南'),exact:true})).toHaveAttribute('href',/guide\.en\.md$/);
  await expect(page.getByRole('link',{name:await text(page,'Unity 指南'),exact:true})).toHaveAttribute('href',/\/README\.md$/);
  await expect(page.getByRole('link',{name:await text(page,'使用方案与限制'),exact:true})).toHaveAttribute('href',/usage-scenarios\.en\.md$/);
  await checkpoint(page,page.getByRole('dialog'),'english-help');
  const beforeBrowse = rig.commands.filter(command => command.method !== 'GET').length;
  await expand(page, await text(page, '手动与脚本'));
  await page.getByRole('button',{name:await text(page,'打开手动'),exact:true}).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.locator('#input-tabs-manual')).toBeFocused();
  expect(rig.commands.filter(command => command.method !== 'GET')).toHaveLength(beforeBrowse);
  expect((await rig.overview()).runtime.inputActive).toBe(false);
});
