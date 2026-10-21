import { test, expect, text, card, enable, mode, active, oscWorkspace, expand, allowSpatial, outputValue } from './fixtures.js';
import { poseSamples } from './mocks.js';

const scriptFile = name => ({name,mimeType:'application/json',buffer:Buffer.from(JSON.stringify({actions:[{at:0,pos:0},{at:60000,pos:100}]}))});

test('mode changes and script replacement require explicit input enable / 切换方式及替换脚本须重新启用', {tag:['@input','@transport']}, async ({page,rig}) => {
  await enable(page,['Mock UDP']); await active(page);
  await page.getByRole('slider',{name:'L0 主轴',exact:true}).press('End');
  await page.getByRole('button',{name:'发送一次',exact:true}).click(); await outputValue(rig,'udp',600);
  await mode(page,'OSC');
  await expect.poll(async () => (await rig.overview()).runtime.inputActive).toBe(false);
  await expect.poll(() => rig.wire.udp.at(-1)).toBe('DSTOP');
  await page.getByRole('tablist',{name:'输入方式',exact:true}).getByRole('tab',{name:'脚本',exact:true}).click();
  await page.locator('input[type=file]').setInputFiles(scriptFile('first.funscript'));
  await expect.poll(async () => (await rig.overview()).input.script.loaded).toBe(true);
  await expect.poll(async () => (await rig.overview()).runtime.inputActive).toBe(false);
  await active(page); await page.getByRole('button',{name:'播放',exact:true}).click();
  await expect.poll(async () => (await rig.overview()).input.script.playing).toBe(true);
  await page.locator('input[type=file]').setInputFiles(scriptFile('replacement.funscript'));
  await expect.poll(async () => (await rig.overview()).input.script.fileName).toBe('replacement.funscript');
  await expect.poll(async () => (await rig.overview()).runtime.inputActive).toBe(false);
  await expect.poll(() => rig.wire.udp.at(-1)).toBe('DSTOP');
  await expect(page.getByRole('switch',{name:'输入启用',exact:true})).not.toBeChecked();
  await expect(card(page,'Mock UDP').getByText('已请求停止',{exact:true})).toBeVisible();
});

test('paused scripts stop transport while explicit stepping can inspect a target / 暂停停止传输，显式步进可检查目标', {tag:['@input','@transport']}, async ({page,rig}) => {
  await enable(page,['Mock UDP']); await mode(page,'脚本');
  await page.locator('input[type=file]').setInputFiles(scriptFile('inspect.funscript'));
  await expect.poll(async () => (await rig.overview()).input.script.loaded).toBe(true);
  await active(page); await page.getByRole('button',{name:'播放',exact:true}).click();
  await expect.poll(async () => (await rig.overview()).input.script.playing).toBe(true);
  await page.getByRole('button',{name:'暂停',exact:true}).click();
  await expect.poll(() => rig.wire.udp.at(-1)).toBe('DSTOP');
  await expect.poll(async () => (await rig.overview()).runtime.inputActive).toBe(true);
  await page.getByRole('button',{name:'下一动作',exact:true}).click(); await outputValue(rig,'udp',600);
  await page.getByRole('button',{name:'卸载',exact:true}).click();
  await expect.poll(() => rig.wire.udp.at(-1)).toBe('DSTOP');
});

test('changing the actual OSC source stops output until explicitly enabled again / 切换实际 OSC 来源后须重新启用输入',
  {tag:['@input','@osc','@transport']}, async ({page,rig}, info) => {
    await enable(page,['Mock UDP']); await mode(page,'OSC');
    let depth = .25, receivedBatches = 0;
    const feed = await rig.startFeed(() => {
      receivedBatches++;
      return [['CI/Depth',depth],['CI/Active',1]];
    });
    const motionLines = () => rig.wire.udp.filter(line => /L0\d/.test(line));
    const stops = () => rig.wire.udp.filter(line => line === 'DSTOP').length;
    const receivedDepth = async () => (await rig.overview()).signals
      .find(row => row.signal.oscPath === 'CI/Depth')?.latest?.value;
    try {
      await expect.poll(async () => (await rig.overview()).osc.sources.length).toBe(1);
      const sourceKey = (await rig.overview()).osc.sources[0].key;
      await active(page); await outputValue(rig,'udp',450);
      await oscWorkspace(page,'参数');
      const source = page.getByRole('combobox',{name:await text(page,'使用来源'),exact:true});
      await expect(source).toHaveValue('');
      const previousStops = stops();
      await source.selectOption(sourceKey);
      await expect.poll(async () => (await rig.overview()).osc.selectedSourceKey).toBe(sourceKey);
      await expect.poll(async () => (await rig.overview()).runtime.inputActive).toBe(false);
      await expect(page.getByRole('switch',{name:await text(page,'输入启用'),exact:true})).not.toBeChecked();
      await expect.poll(stops).toBeGreaterThan(previousStops);
      await expect.poll(() => rig.wire.udp.at(-1)).toBe('DSTOP');
      const stoppedMotionCount = motionLines().length, batchesAtStop = receivedBatches;
      depth = .75;
      await expect.poll(receivedDepth).toBe(depth);
      await expect.poll(() => receivedBatches).toBeGreaterThan(batchesAtStop + 2);
      expect(motionLines()).toHaveLength(stoppedMotionCount);

      await active(page); await outputValue(rig,'udp',550);
      const stopsBeforeSameSelection = stops();
      const response = await page.request.put(rig.baseUrl + '/api/input/osc/source',{data:{sourceKey}});
      expect(response.ok()).toBe(true);
      expect((await rig.overview()).runtime.inputActive).toBe(true);
      depth = .5;
      await outputValue(rig,'udp',500);
      expect(stops()).toBe(stopsBeforeSameSelection);

      await source.selectOption('');
      await expect.poll(async () => (await rig.overview()).runtime.inputActive).toBe(false);
      await expect.poll(() => rig.wire.udp.at(-1)).toBe('DSTOP');
      const automaticMotionCount = motionLines().length, automaticBatches = receivedBatches;
      depth = .9;
      await expect.poll(receivedDepth).toBeCloseTo(depth,5);
      await expect.poll(() => receivedBatches).toBeGreaterThan(automaticBatches + 2);
      expect(motionLines()).toHaveLength(automaticMotionCount);
      await active(page); await outputValue(rig,'udp',580);
      await info.attach('osc-source-transition.json',{body:JSON.stringify({sourceKey,
        stoppedOnExplicitSelection:true,stoppedOnAutomaticSelection:true,
        sameSourcePreservesActivation:true,receivedBatches}),contentType:'application/json'});
    } finally { await feed.stop(); }
  });

test('one live Contact channel cannot revive the other expired ranges / 单路更新不能复活其余过期距离', {tag:['@input','@osc','@transport']}, async ({page,rig}) => {
  await enable(page,['Mock UDP']); await mode(page,'OSC');
  const feed = await rig.startFeed(poseSamples());
  await allowSpatial(page); await expand(page,'配对三点姿态');
  await expect(page.getByRole('button',{name:'生成深度草稿',exact:true})).toBeEnabled();
  await page.getByRole('button',{name:'生成深度草稿',exact:true}).click();
  await oscWorkspace(page,'映射'); await page.getByRole('button',{name:'保存映射',exact:true}).click();
  await expect.poll(async () => (await rig.overview()).signals.length).toBe(1);
  await active(page); await outputValue(rig,'udp',500);
  await feed.stop();
  const oneRange = poseSamples().filter(([path]) => path.endsWith('/Root/A0'));
  await rig.startFeed(oneRange);
  await expect.poll(async () => (await rig.overview()).runtime.isEmergency, {timeout:10000}).toBe(true);
  await expect.poll(() => rig.wire.udp.at(-1)).toBe('DSTOP');
  await expect(page.getByRole('switch',{name:'输入启用',exact:true})).not.toBeChecked();
  const count = rig.wire.udp.filter(line => /L0\d/.test(line)).length;
  await page.getByRole('button',{name:'解除急停',exact:true}).click();
  await expect.poll(async () => (await rig.overview()).runtime.isEmergency).toBe(false);
  expect((await rig.overview()).runtime.inputActive).toBe(false);
  expect(rig.wire.udp.filter(line => /L0\d/.test(line)).length).toBe(count);
});

test('keyboard browsing, script A-B boundaries and Escape preserve control intent / 键盘浏览、脚本 A-B 与 Escape 保持控制意图', {tag:['@input','@config']}, async ({page,rig}) => {
  const navigation = page.getByRole('tablist',{name:'主导航',exact:true});
  const before = (await rig.overview()).input.mode;
  const mutations = rig.commands.filter(command => command.method !== 'GET').length;
  await navigation.getByRole('tab',{name:'控制',exact:true}).press('ArrowRight');
  await expect(navigation.getByRole('tab',{name:'OSC',exact:true})).toHaveAttribute('aria-selected','true');
  await expect(page.getByRole('tablist',{name:'OSC 工作区',exact:true})).toBeVisible();
  await navigation.getByRole('tab',{name:'OSC',exact:true}).press('ArrowRight');
  await expect(navigation.getByRole('tab',{name:'设置',exact:true})).toHaveAttribute('aria-selected','true');
  await navigation.getByRole('tab',{name:'设置',exact:true}).press('Home');
  await expect(navigation.getByRole('tab',{name:'控制',exact:true})).toHaveAttribute('aria-selected','true');
  expect((await rig.overview()).input.mode).toBe(before);
  expect((await rig.overview()).runtime.inputActive).toBe(false);
  expect(rig.commands.filter(command => command.method !== 'GET')).toHaveLength(mutations);

  await mode(page,'脚本');
  await page.locator('input[type=file]').setInputFiles(scriptFile('boundaries.funscript'));
  await expect.poll(async () => (await rig.overview()).input.script.loaded).toBe(true);
  await expand(page,'定位与 A-B');
  const jump = page.getByRole('textbox',{name:'跳转时间',exact:true});
  await jump.fill('00:10'); await jump.press('Enter');
  await expect.poll(async () => (await rig.overview()).input.script.positionMs).toBe(10000);
  await page.getByRole('button',{name:'设 A',exact:true}).click();
  await expect.poll(async () => (await rig.overview()).input.script.loopStartMs).toBe(10000);
  await jump.fill('00:30'); await page.getByRole('button',{name:'跳转',exact:true}).click();
  await expect.poll(async () => (await rig.overview()).input.script.positionMs).toBe(30000);
  await page.getByRole('button',{name:'设 B',exact:true}).click();
  await expect.poll(async () => (await rig.overview()).input.script.loopEndMs).toBe(30000);
  await page.getByRole('button',{name:'跳至 A',exact:true}).click();
  await expect.poll(async () => (await rig.overview()).input.script.positionMs).toBe(10000);
  await page.getByRole('button',{name:'清除 A-B',exact:true}).click();
  await expect.poll(async () => {
    const state = (await rig.overview()).input.script;
    return [state.loopStartMs,state.loopEndMs];
  }).toEqual([null,null]);
  expect((await rig.overview()).runtime.inputActive).toBe(false);
  expect(rig.wire.udp.filter(line => /L0\d/.test(line))).toHaveLength(0);

  const saves = rig.commands.filter(command => command.path === '/api/config' && command.method === 'PUT').length;
  await card(page,'Mock UDP').getByRole('button',{name:'配置',exact:true}).click();
  const dialog = page.getByRole('dialog',{name:'输出设置',exact:true});
  const name = dialog.getByRole('textbox',{name:'名称',exact:true});
  await name.fill('Cancelled draft'); await name.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(card(page,'Mock UDP')).toBeVisible();
  await expect(card(page,'Cancelled draft')).toHaveCount(0);
  expect(rig.commands.filter(command => command.path === '/api/config' && command.method === 'PUT')).toHaveLength(saves);
  const config = await page.request.get(rig.baseUrl + '/api/config').then(response => response.json());
  expect(config.outputs.find(output => output.id === 'udp').name).toBe('Mock UDP');
});
