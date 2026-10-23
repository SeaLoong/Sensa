import dgram from 'node:dgram';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test, expect, text, active, workspace, checkpoint } from './fixtures.js';

const config = async (page, rig) => page.request.get(rig.baseUrl + '/api/config').then(response => response.json());
const outputState = async (rig, id) => (await rig.overview()).outputs.find(output => output.id === id)?.signalStatus;
const calculated = async (rig, id) => (await rig.overview()).computedSignals.find(signal => signal.id === id);
const outputCard = (page, id) => page.locator(`.output-card[data-output-id="${id}"]`);
const button = async (page, scope, label) => scope.getByRole('button', { name: await text(page, label), exact: true });
const numeric = async (page, scope, label, value) => scope.getByRole('spinbutton', { name: await text(page, label), exact: true }).fill(String(value));

// Decode the actual OSC datagram, including type tags and big-endian payloads.
function decodeOsc(bytes) {
  let offset = 0;
  const string = () => {
    const end = bytes.indexOf(0, offset);
    if (end < offset) throw new Error('OSC string has no terminator');
    const value = bytes.toString('utf8', offset, end);
    offset = Math.ceil((end + 1) / 4) * 4;
    return value;
  };
  const address = string(), tag = string();
  if (tag === ',f') return { address, type: 'Float', value: bytes.readFloatBE(offset) };
  if (tag === ',i') return { address, type: 'Int', value: bytes.readInt32BE(offset) };
  if (tag === ',T' || tag === ',F') return { address, type: 'Bool', value: tag === ',T' };
  throw new Error('Unexpected OSC type: ' + tag);
}

async function oscReceiver() {
  const socket = dgram.createSocket('udp4'), messages = [], errors = [];
  socket.on('message', bytes => { try { messages.push(decodeOsc(bytes)); } catch (error) { errors.push(error.message); } });
  socket.bind(0, '127.0.0.1');
  await once(socket, 'listening');
  socket.on('error', error => errors.push(error.message));
  return { port: socket.address().port, messages, errors,
    last(address) { return messages.filter(message => message.address === address).at(-1); },
    close: () => new Promise(resolve => socket.close(resolve)) };
}

async function source(page, scope, mode, oscPath) {
  await scope.getByTestId('signal-source-mode').selectOption(mode);
  if (mode === 'Manual') await scope.getByRole('combobox', { name: await text(page, '手动信号'), exact: true }).selectOption(oscPath);
  else if (mode === 'Computed') await scope.getByRole('combobox', { name: await text(page, '计算信号'), exact: true }).selectOption(oscPath);
  else await scope.getByLabel(await text(page, mode === 'RecordingReplay' ? '录制信号路径' : '参数路径'), { exact: true }).fill(oscPath);
}

async function addCalculation(page, name, operation) {
  await (await button(page, page, '新增计算信号')).click();
  const card = page.getByTestId('computed-signal-card').last();
  await card.getByRole('textbox', { name: await text(page, '信号名称'), exact: true }).fill(name);
  await card.getByTestId('computed-operation').selectOption(operation);
  return card;
}

async function addOutput(page, rig, type, name) {
  await workspace(page, '控制');
  const previous = new Set((await config(page, rig)).outputs.map(output => output.id));
  await page.getByTestId('output-type').selectOption(type);
  await page.getByTestId('add-output').click();
  const dialog = page.getByRole('dialog', { name: await text(page, '输出设置'), exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('textbox', { name: await text(page, '名称'), exact: true }).fill(name);
  const added = (await config(page, rig)).outputs.find(output => !previous.has(output.id));
  expect(added?.type).toBe(type);
  return { id: added.id, dialog };
}

async function binding(page, dialog, index, options) {
  const bindings = dialog.getByTestId('output-binding');
  while (await bindings.count() <= index) await (await button(page, dialog, '新增连接')).click();
  const row = bindings.nth(index);
  if (!(await row.evaluate(element => element.open))) await row.locator('summary').click();
  await row.getByRole('textbox', { name: await text(page, '连接名称'), exact: true }).fill(options.name);
  await source(page, row, options.sourceMode, options.path);
  await row.getByRole('textbox', { name: await text(page, options.recording ? '记录字段' : '目标参数'), exact: true }).fill(options.address);
  await row.getByRole('combobox', { name: await text(page, '数值类型'), exact: true }).selectOption(options.type || 'Float');
  await numeric(page, row, '输出终点', options.max ?? 1);
  await numeric(page, row, '停止时发送值', options.stop ?? 0);
  if (options.fixedRate) {
    await row.locator('summary').filter({ hasText: await text(page, '发送频率与变化阈值') }).click();
    await row.getByRole('combobox', { name: await text(page, '发送方式'), exact: true }).selectOption('FixedRate');
    await numeric(page, row, '最大发送频率（Hz）', 10);
  }
  return row;
}

async function saveOutput(page, rig, id) {
  const dialog = page.getByRole('dialog', { name: await text(page, '输出设置'), exact: true });
  await (await button(page, dialog, '保存输出')).click();
  await expect(dialog).not.toBeVisible();
  expect((await config(page, rig)).outputs.find(output => output.id === id)).toBeTruthy();
  expect((await rig.overview()).runtime.inputActive).toBe(false);
}

async function enableOutput(page, rig, id) {
  await workspace(page, '控制');
  await (await button(page, outputCard(page, id), '启用')).click();
  await expect.poll(async () => (await outputState(rig, id))?.connected).toBe(true);
}

async function combinedManual(page, rig, raw = 400) {
  await workspace(page, '控制');
  await page.getByRole('tablist', { name: await text(page, '输入方式'), exact: true })
    .getByRole('tab', { name: await text(page, '组合'), exact: true }).click();
  if ((await rig.overview()).input.mode !== 'combined') await (await button(page, page, '应用输入方式')).click();
  await expect.poll(async () => (await rig.overview()).input.mode).toBe('combined');
  const combined = page.getByTestId('combined-inputs');
  const manual = combined.locator('details').filter({ has: page.locator('summary', { hasText: await text(page, '手动来源') }) });
  if (!(await manual.evaluate(element => element.open))) await manual.locator('summary').click();
  const axis = manual.locator('.value-field').filter({ has: page.getByRole('slider', { name: await text(page, 'L0 主轴'), exact: true }) });
  await axis.getByRole('spinbutton').fill(String(raw));
  await (await button(page, manual, '更新手动来源')).click();
  await expect.poll(async () => (await rig.overview()).runtime.manualCommand.l0).toBeCloseTo(raw / 1000, 5);
}

function csvFields(line) {
  const fields = []; let field = '', quoted = false;
  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    if (char === '"' && line[index + 1] === '"' && quoted) { field += '"'; index++; }
    else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { fields.push(field); field = ''; }
    else field += char;
  }
  fields.push(field); return fields;
}

function recordingRows(contents, format) {
  const lines = contents.trim().split(/\r?\n/);
  if (format === 'JsonLines') {
    expect(JSON.parse(lines.shift())).toEqual({ type: 'sensa-session', format: 1 });
    return lines.map(line => JSON.parse(line));
  }
  expect(lines.shift()).toBe('timeMs,signalId,rawValue,value,valid,reason,sourceKey,coordinateFrame');
  return lines.map(line => {
    const [timeMs, signalId, rawValue, value, valid, reason, sourceKey, coordinateFrame] = csvFields(line);
    return { timeMs: Number(timeMs), signalId, rawValue: rawValue === '' ? null : Number(rawValue),
      value: value === '' ? null : Number(value), valid: valid === 'true', reason, sourceKey, coordinateFrame };
  });
}

for (const locale of ['zh-CN', 'en-US']) {
  test.describe('Signal pipeline / 信号流程 ' + locale, () => {
    test.use({ locale });

    test('combined calculations drive typed OSC and configured stop values / 组合计算驱动 OSC 并发送停止值',
      { tag: ['@osc', '@input', '@config', '@transport', '@i18n', '@visual'] }, async ({ page, rig }, info) => {
        const receiver = await oscReceiver();
        try {
          const feed = await rig.startFeed([['CI/Source', 1]]);
          await workspace(page, '流程');
          const blend = await addCalculation(page, 'Weighted source', 'WeightedAverage');
          const rows = blend.getByTestId('computed-input-row');
          await source(page, rows.nth(0), 'Manual', 'L0');
          await source(page, rows.nth(1), 'Direct', 'CI/Source');
          await numeric(page, rows.nth(0), '权重', 1);
          await numeric(page, rows.nth(1), '权重', 3);
          const latch = await addCalculation(page, 'Contact latch', 'Hysteresis');
          await source(page, latch.getByTestId('computed-input-row').first(), 'Computed', 'Signal1');
          await numeric(page, latch, '开启阈值', .8);
          await numeric(page, latch, '关闭阈值', .5);
          await (await button(page, page, '保存计算与映射')).click();
          await expect.poll(async () => (await config(page, rig)).computedSignals).toMatchObject([
            { id: 'Signal1', operation: 'WeightedAverage', inputs: [
              { sourceMode: 'Manual', oscPath: 'L0', weight: 1 }, { sourceMode: 'Direct', oscPath: 'CI/Source', weight: 3 }] },
            { id: 'Signal2', operation: 'Hysteresis', threshold: .8, releaseThreshold: .5,
              inputs: [{ sourceMode: 'Computed', oscPath: 'Signal1' }] },
          ]);
          await checkpoint(page, latch.locator('.computed-signal__settings'), 'pipeline-hysteresis-settings-' + locale);

          const osc = await addOutput(page, rig, 'OscParameter', 'Typed OSC');
          const vrchat = osc.dialog.getByRole('checkbox', { name: await text(page, '回写到 VRChat OSC'), exact: true });
          await vrchat.check();
          await expect(osc.dialog.getByRole('textbox', { name: await text(page, '目标地址'), exact: true })).toHaveValue('127.0.0.1');
          await expect(osc.dialog.getByRole('spinbutton', { name: await text(page, '目标端口'), exact: true })).toHaveValue('9000');
          await vrchat.uncheck();
          await numeric(page, osc.dialog, '目标端口', receiver.port);
          await binding(page, osc.dialog, 0, { name: 'Manual float', sourceMode: 'Manual', path: 'L0', address: '/ci/manual', stop: .125 });
          await binding(page, osc.dialog, 1, { name: 'Blended integer', sourceMode: 'Computed', path: 'Signal1', address: '/ci/blend', type: 'Int', max: 100, stop: 7 });
          await binding(page, osc.dialog, 2, { name: 'Latched boolean', sourceMode: 'Computed', path: 'Signal2', address: '/ci/contact', type: 'Bool' });
          await saveOutput(page, rig, osc.id);
          expect((await config(page, rig)).outputs.find(output => output.id === osc.id)).toMatchObject({
            host: '127.0.0.1', port: receiver.port, signal: { vrChat: false, bindings: [
              { valueType: 'Float', stopValue: .125 }, { valueType: 'Int', outputMax: 100, stopValue: 7 }, { valueType: 'Bool', stopValue: 0 }] },
          });
          await enableOutput(page, rig, osc.id);
          await combinedManual(page, rig);
          await active(page);
          await expect.poll(() => receiver.last('/ci/manual')?.value).toBeCloseTo(.4, 5);
          expect(receiver.last('/ci/manual')?.type).toBe('Float');
          await expect.poll(() => receiver.last('/ci/blend')).toEqual({ address: '/ci/blend', type: 'Int', value: 85 });
          await expect.poll(() => receiver.last('/ci/contact')).toEqual({ address: '/ci/contact', type: 'Bool', value: true });
          await expect.poll(async () => (await calculated(rig, 'Signal1'))?.value).toBeCloseTo(.85, 5);

          await feed.set([['CI/Source', .7]]);
          await expect.poll(async () => (await calculated(rig, 'Signal1'))?.value).toBeCloseTo(.625, 5);
          expect((await calculated(rig, 'Signal2')).value).toBe(1);
          expect(receiver.last('/ci/contact')?.value).toBe(true);
          await feed.set([['CI/Source', .3]]);
          await expect.poll(() => receiver.last('/ci/contact')?.value).toBe(false);
          await expect.poll(async () => (await calculated(rig, 'Signal2'))?.value).toBe(0);
          await feed.set([['CI/Source', 1]]);
          await expect.poll(() => receiver.last('/ci/contact')?.value).toBe(true);
          const sentBeforeDisable = receiver.messages.length;
          await (await button(page, outputCard(page, osc.id), '禁用')).click();
          await expect.poll(() => receiver.messages.length).toBeGreaterThanOrEqual(sentBeforeDisable + 3);
          await expect.poll(() => receiver.last('/ci/manual')?.value).toBeCloseTo(.125, 5);
          await expect.poll(() => receiver.last('/ci/blend')?.value).toBe(7);
          await expect.poll(() => receiver.last('/ci/contact')?.value).toBe(false);
          await expect.poll(async () => (await rig.overview()).runtime.inputActive).toBe(false);
          expect(receiver.errors).toEqual([]);
          await info.attach('typed-osc-wire.json', { body: JSON.stringify(receiver.messages, null, 2), contentType: 'application/json' });
        } finally { await receiver.close(); }
      });

    test('session recording replays into OSC and complete plans import disabled / 会话回放到 OSC 且整套方案停用载入',
      { tag: ['@osc', '@input', '@config', '@transport', '@i18n', '@visual'] }, async ({ page, rig }, info) => {
        const receiver = await oscReceiver(), format = locale === 'zh-CN' ? 'JsonLines' : 'Csv';
        try {
          await workspace(page, '流程');
          const smooth = await addCalculation(page, 'Smoothed manual', 'Smooth');
          await source(page, smooth.getByTestId('computed-input-row').first(), 'Manual', 'L0');
          await numeric(page, smooth, '平滑时间（ms）', 100);
          await (await button(page, page, '保存计算与映射')).click();
          const recording = await addOutput(page, rig, 'Recording', 'Session capture');
          await recording.dialog.getByRole('combobox', { name: await text(page, '录制格式'), exact: true }).selectOption(format);
          await recording.dialog.getByRole('textbox', { name: await text(page, '录制名称'), exact: true }).fill('pipeline');
          await binding(page, recording.dialog, 0, { name: 'Manual sample', sourceMode: 'Manual', path: 'L0', address: 'manual', recording: true, max: 100, fixedRate: true });
          await binding(page, recording.dialog, 1, { name: 'Computed sample', sourceMode: 'Computed', path: 'Signal1', address: 'smooth', recording: true, fixedRate: true });
          await binding(page, recording.dialog, 2, { name: 'Missing sample', sourceMode: 'Direct', path: 'CI/Missing', address: 'missing', recording: true });
          await saveOutput(page, rig, recording.id);
          const osc = await addOutput(page, rig, 'OscParameter', 'Replay OSC');
          await numeric(page, osc.dialog, '目标端口', receiver.port);
          await binding(page, osc.dialog, 0, { name: 'Replay sample', sourceMode: 'RecordingReplay', path: recording.id + '/manual', address: '/ci/replay', stop: .125 });
          await saveOutput(page, rig, osc.id);
          await enableOutput(page, rig, recording.id);
          await enableOutput(page, rig, osc.id);
          await combinedManual(page, rig);
          await active(page);
          await expect.poll(async () => (await outputState(rig, recording.id))?.routes.find(route => route.id === 'Binding1')?.valid).toBe(true);
          await expect.poll(async () => (await outputState(rig, recording.id))?.routes.find(route => route.id === 'Binding3')?.valid).toBe(false);
          await expect.poll(async () => (await outputState(rig, recording.id))?.routes.find(route => route.id === 'Binding1')?.lastSentMs).toBeGreaterThan(0);
          const firstSent = (await outputState(rig, recording.id)).routes.find(route => route.id === 'Binding1').lastSentMs;
          // Advance through real periodic deliveries rather than a fixed browser sleep.
          await expect.poll(async () => (await outputState(rig, recording.id))?.routes.find(route => route.id === 'Binding1')?.lastSentMs - firstSent).toBeGreaterThanOrEqual(2500);
          await active(page, false);
          const fileName = (await outputState(rig, recording.id)).recordingFile;
          expect(fileName.endsWith(format === 'Csv' ? '.csv' : '.jsonl')).toBe(true);
          const filePath = path.join(path.dirname(rig.configPath), 'recordings', fileName);
          let rows;
          await expect.poll(async () => {
            rows = recordingRows(await readFile(filePath, 'utf8'), format);
            const start = rows.find(row => row.signalId === 'manual' && row.valid)?.timeMs;
            return start !== undefined && ['manual', 'smooth', 'missing'].every(id => rows.some(row => row.signalId === id
              && !row.valid && row.reason.includes('Input stopped') && row.timeMs >= start + 2500));
          }).toBe(true);
          expect(rows.some(row => row.signalId === 'manual' && row.valid && Math.abs(row.rawValue - .4) < .00001 && Math.abs(row.value - 40) < .001)).toBe(true);
          expect(rows.some(row => row.signalId === 'smooth' && row.valid)).toBe(true);
          expect(rows.some(row => row.signalId === 'missing' && !row.valid && row.value === null && row.reason)).toBe(true);
          const firstValidTime = rows.find(row => row.signalId === 'manual' && row.valid).timeMs;
          const listing = await page.request.get(rig.baseUrl + '/api/output/recordings').then(response => response.json());
          expect(listing.some(file => file.fileName === fileName && file.size > 0)).toBe(true);
          const recordingDownload = page.waitForEvent('download');
          await outputCard(page, recording.id).getByTestId('recording-download').click();
          const downloadedRecording = await recordingDownload;
          expect(downloadedRecording.suggestedFilename()).toBe(fileName);
          const downloadedRows = recordingRows(await readFile(await downloadedRecording.path(), 'utf8'), format);
          expect(downloadedRows).toEqual(rows);

          const replay = outputCard(page, recording.id).getByTestId('recording-replay');
          await replay.locator('summary').click();
          await replay.getByRole('textbox', { name: await text(page, '回放文件名'), exact: true }).fill(fileName);
          await replay.getByTestId('replay-load').click();
          await expect.poll(async () => (await outputState(rig, recording.id))?.replay).toMatchObject({ loaded: true, playing: false, fileName,
            signals: expect.arrayContaining(['manual', 'smooth', 'missing']) });
          await numeric(page, replay, '回放位置（ms）', firstValidTime + 50);
          await replay.getByTestId('replay-seek').click();
          await expect.poll(async () => (await outputState(rig, recording.id))?.replay.timeMs).toBe(firstValidTime + 50);
          await active(page);
          await replay.getByTestId('replay-play').click();
          await expect.poll(() => receiver.last('/ci/replay')?.value).toBeCloseTo(.4, 5);
          await expect.poll(async () => (await outputState(rig, osc.id))?.routes[0]).toMatchObject({ valid: true, rawValue: expect.closeTo(.4, 5), value: expect.closeTo(.4, 5) });
          await replay.getByTestId('replay-pause').click();
          await expect.poll(async () => (await outputState(rig, recording.id))?.replay.playing).toBe(false);
          await expect.poll(() => receiver.last('/ci/replay')?.value).toBeCloseTo(.125, 5);
          await numeric(page, replay, '回放位置（ms）', firstValidTime + 500);
          await replay.getByTestId('replay-seek').click();
          await expect.poll(async () => (await outputState(rig, recording.id))?.replay.timeMs).toBe(firstValidTime + 500);
          await replay.getByTestId('replay-play').click();
          await expect.poll(() => receiver.last('/ci/replay')?.value).toBeCloseTo(.4, 5);
          await active(page, false);

          await workspace(page, '流程');
          const planPanel = page.getByTestId('signal-plan-panel');
          await planPanel.locator('summary').click();
          const downloadPromise = page.waitForEvent('download');
          await planPanel.getByTestId('signal-plan-export').click();
          const download = await downloadPromise;
          const plan = JSON.parse(await readFile(await download.path(), 'utf8'));
          expect(plan.kind).toBe('SensaSignalPlan');
          expect(plan.computedSignals).toMatchObject([{ id: 'Signal1', operation: 'Smooth', timeMs: 100 }]);
          expect(plan.outputs.every(output => output.enabled === false)).toBe(true);
          expect(plan.outputs.find(output => output.id === osc.id).signal.bindings[0].source).toMatchObject({ sourceMode: 'RecordingReplay', oscPath: recording.id + '/manual' });
          const beforeImport = await config(page, rig);
          await active(page);
          await planPanel.getByTestId('signal-plan-import').setInputFiles({ name: 'pipeline-plan.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(plan)) });
          const preview = page.getByRole('dialog', { name: await text(page, '检查交互方案'), exact: true });
          await expect(preview).toBeVisible();
          expect((await rig.overview()).runtime.inputActive).toBe(true);
          await checkpoint(page, preview, 'pipeline-plan-preview-' + locale);
          await preview.getByTestId('signal-plan-apply').click();
          await expect(preview).not.toBeVisible();
          await expect.poll(async () => (await rig.overview()).runtime.inputActive).toBe(false);
          const imported = await config(page, rig);
          expect(imported.outputs.every(output => !output.enabled)).toBe(true);
          expect(imported.computedSignals).toEqual(beforeImport.computedSignals);
          expect(imported.signals).toEqual(beforeImport.signals);
          expect(imported.outputs.map(output => output.signal?.bindings)).toEqual(beforeImport.outputs.map(output => output.signal?.bindings));
          expect(imported.axisProfiles).toEqual(beforeImport.axisProfiles);
          expect(receiver.errors).toEqual([]);
          await info.attach('recording-pipeline-evidence.json', { body: JSON.stringify({ format, fileName,
            rows: rows.length, validSignals: [...new Set(rows.filter(row => row.valid).map(row => row.signalId))],
            invalidReasons: [...new Set(rows.filter(row => !row.valid).map(row => row.reason))], osc: receiver.messages,
            planImportedDisabled: true }, null, 2), contentType: 'application/json' });
        } finally { await receiver.close(); }
      });
  });
}
