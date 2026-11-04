import dgram from 'node:dgram';
import { once } from 'node:events';
import contract from '../runtime/fixtures/sps-beta-ogb-contract.json' with { type: 'json' };
import { test, expect, text, enable, mode, active, oscWorkspace, outputValue } from './fixtures.js';
import { oscPacket, ports } from './mocks.js';

// SPS3's public/_nothips compatibility Senders retain the legacy OGB geometry.
// Others uses _public; the Self fixture includes _nothips for its receiver suffix.
// These packets model the pinned producer source, not Unity/GPU or hardware execution.
const socketPrefix = contract.socket.prefix + '/Sps3_Compatibility_Main';
const pathFor = (party, suffix = '', instance = socketPrefix) => instance + '/Pen' + party + suffix;
const motionLines = rig => rig.wire.udp.filter(line => /L0\d/.test(line));
const sourceTrace = party => contract.traces.find(trace => trace.party === party);
function readings(trace, distance, party = trace.party, instance = socketPrefix) {
  const proximity = radius => Math.max(0, Math.min(1,
    1 - Math.max(0, distance - radius) / contract.socket.receiverRadiusMeters));
  return [[pathFor(party, contract.socket.rootSuffix, instance), proximity(contract.socket.rootSenderRadiusMeters)],
    [pathFor(party, contract.socket.tipSuffix, instance), proximity(trace.plugLengthMeters)]];
}

async function savedConfiguration(page, rig) {
  const response = await page.request.get(rig.baseUrl + '/api/config');
  expect(response.ok()).toBe(true);
  return response.json();
}

async function saveMapping(page, rig, path) {
  await oscWorkspace(page, '映射');
  const row = page.locator('.mapping-row');
  await expect(row).toHaveCount(1);
  await row.getByLabel(await text(page, '参数路径'), { exact: true }).fill(path);
  await page.getByRole('button', { name: await text(page, '保存映射'), exact: true }).click();
  await expect.poll(async () => (await savedConfiguration(page, rig)).signals[0]?.oscPath).toBe(path);
  await expect.poll(async () => (await rig.overview()).runtime.inputActive).toBe(false);
  await expect(page.getByRole('switch', { name: await text(page, '输入启用'), exact: true })).not.toBeChecked();
}

async function applyDepthPreset(page, rig) {
  await oscWorkspace(page, '映射');
  await page.getByLabel(await text(page, '预设方案'), { exact: true }).selectOption('ogb-depth');
  await page.getByRole('button', { name: await text(page, '替换草稿'), exact: true }).click();
  const row = page.locator('.mapping-row');
  await expect(row).toHaveCount(1);
  await expect(row.getByLabel(await text(page, '输入类型'), { exact: true })).toHaveValue('OgbDepth');
  await page.getByRole('button', { name: await text(page, '保存映射'), exact: true }).click();
  await expect.poll(async () => (await savedConfiguration(page, rig)).signals[0]?.sourceMode).toBe('OgbDepth');
  const preset = (await savedConfiguration(page, rig)).signals[0];
  expect(preset.oscPath).toBe('OGB/Orf/**/PenOthersNewRoot;OGB/Orf/**/PenOthers;OGB/Pen/**/PenOthers');
  expect(preset.role).toBe('Depth');
  expect((await rig.overview()).runtime.inputActive).toBe(false);
  expect(motionLines(rig)).toHaveLength(0);
  await saveMapping(page, rig, pathFor('Others', contract.socket.rootSuffix));
}

async function preview(pageRig, path, sourcePort = ports.source) {
  return (await pageRig.overview()).osc.preview.find(row => row.path === path && row.sourcePort === sourcePort);
}

async function received(pageRig, path, value, sourcePort = ports.source) {
  await expect.poll(async () => (await preview(pageRig, path, sourcePort))?.numericValue).toBeCloseTo(value, 5);
}

async function additionalOscSource() {
  const socket = dgram.createSocket('udp4');
  socket.bind(0, '127.0.0.1');
  await once(socket, 'listening');
  const port = socket.address().port;
  return { port,
    send: async entries => {
      for (const [path, value] of entries) await new Promise((resolve, reject) => {
        socket.send(oscPacket(path, value), ports.osc, '127.0.0.1', error => error ? reject(error) : resolve());
      });
    },
    close: () => new Promise(resolve => socket.close(resolve)),
  };
}

for (const locale of ['zh-CN', 'en-US']) {
  test.describe('SPS3 public OGB compatibility / SPS3 公开 OGB 互通 ' + locale, () => {
    test.use({ locale, scenario: 'sps' });

    test('preset saves real SPS3-compatible OGB inputs without mixing source, instance or party / 预设保存 SPS3 兼容 OGB 且不混合来源实例或自身他人',
      { tag: ['@osc', '@input', '@config', '@transport', '@i18n'] }, async ({ page, rig }, info) => {
        await enable(page, ['Mock UDP']);
        await mode(page, 'OSC');
        await applyDepthPreset(page, rig);
        const otherSource = await additionalOscSource();
        const others = sourceTrace('Others'), self = sourceTrace('Self');
        const unrelatedInstance = socketPrefix + '_Other';
        let batches = 0;
        const wrongPair = (root, tip) => [
          [pathFor('Others', contract.socket.rootSuffix), root],
          [pathFor('Self', contract.socket.tipSuffix), tip],
          [pathFor('Others', contract.socket.tipSuffix, unrelatedInstance), tip],
          [pathFor('Others'), .97], [pathFor('Others', 'Close'), 1],
        ];
        let feed;
        try {
          feed = await rig.startFeed(() => { batches++; return wrongPair(.77, .96); });
          await otherSource.send([[pathFor('Others', contract.socket.tipSuffix), .96]]);
          await received(rig, pathFor('Others', contract.socket.rootSuffix), .77);
          await received(rig, pathFor('Others', contract.socket.tipSuffix), .96, otherSource.port);
          await expect.poll(async () => (await rig.overview()).osc.sources.length).toBe(2);
          expect(motionLines(rig)).toHaveLength(0);
          await active(page);
          await outputValue(rig, 'udp', 400);

          // A tip from another source, object or party cannot complete this pair.
          // 错误配对先出现未饱和值，再进入饱和范围；不能偷学别路长度并产生正深度。
          const wrongStart = motionLines(rig).length;
          const wrongBatches = batches;
          await feed.set(() => { batches++; return wrongPair(.89, 1); });
          await otherSource.send([[pathFor('Others', contract.socket.tipSuffix), 1]]);
          await received(rig, pathFor('Others', contract.socket.rootSuffix), .89);
          await expect.poll(() => batches).toBeGreaterThan(wrongBatches + 2);
          await outputValue(rig, 'udp', 400);
          expect((await rig.overview()).runtime.currentFrame.values.L0).toBe(0);
          for (const line of motionLines(rig).slice(wrongStart))
            expect(Math.abs(Number(line.match(/L0(\d+)/)[1]) - 400)).toBeLessThanOrEqual(1);

          await feed.set(readings(others, others.learningDistanceMeters));
          await received(rig, pathFor('Others', contract.socket.tipSuffix), .96);
          await outputValue(rig, 'udp', 400);
          await feed.set(readings(others, others.insideDistanceMeters));
          await outputValue(rig, 'udp', 400 + 200 * others.expectedFraction);

          // Saving a different party disarms delivery; a fresh Self pair learns its own length.
          await saveMapping(page, rig, pathFor('Self', contract.socket.rootSuffix));
          await expect.poll(() => rig.wire.udp.at(-1)).toBe('DSTOP');
          const disarmedCount = motionLines(rig).length;
          await feed.set(readings(self, self.learningDistanceMeters));
          await received(rig, pathFor('Self', contract.socket.tipSuffix), .9);
          expect(motionLines(rig)).toHaveLength(disarmedCount);
          await active(page);
          await outputValue(rig, 'udp', 400);
          await feed.set(readings(self, self.insideDistanceMeters));
          await outputValue(rig, 'udp', 400 + 200 * self.expectedFraction);
          await info.attach('sps3-public-ogb-interoperability.json', {
            body: JSON.stringify({ producer: contract.producer, scope: contract.scope, locale,
              simulatedProducerGeometry: true, unityClientExecution: false, hardwareExecution: false,
              incompatibleTipLocations: ['different UDP source', 'different instance', 'Self versus Others'],
              sourcePorts: [ports.source, otherSource.port], producerTraces: [others, self], othersFraction: others.expectedFraction,
              selfFraction: self.expectedFraction, mapping: (await savedConfiguration(page, rig)).signals[0],
              wire: rig.wire.udp }), contentType: 'application/json',
          });
          await active(page, false);
        } finally { try { if (feed) await feed.stop(); } finally { await otherSource.close(); } }
      });

    test('fresh legacy values cannot keep an expired SPS3 modern pair active / 刷新旧式参数不能让过期的 SPS3 现代配对继续输出',
      { tag: ['@osc', '@input', '@config', '@transport', '@i18n'] }, async ({ page, rig }, info) => {
        await enable(page, ['Mock UDP']);
        await mode(page, 'OSC');
        await applyDepthPreset(page, rig);
        const timeoutMs = 1200, config = await savedConfiguration(page, rig);
        const saved = await page.request.put(rig.baseUrl + '/api/config', { data: { ...config,
          osc: { ...config.osc, inputTimeoutMs: timeoutMs } } });
        expect(saved.ok()).toBe(true);
        await page.reload();
        await expect(page.getByRole('button', { name: await text(page, '帮助'), exact: true })).toBeVisible();
        await mode(page, 'OSC');
        expect((await savedConfiguration(page, rig)).osc.inputTimeoutMs).toBe(timeoutMs);
        const trace = sourceTrace('Others');
        const root = pathFor('Others', contract.socket.rootSuffix), tip = pathFor('Others', contract.socket.tipSuffix);
        const legacy = pathFor('Others');
        let legacyBatches = 0;
        const feed = await rig.startFeed(readings(trace, trace.learningDistanceMeters));
        try {
          await received(rig, tip, .96);
          expect(motionLines(rig)).toHaveLength(0);
          await active(page);
          await outputValue(rig, 'udp', 400);
          await feed.set(readings(trace, trace.insideDistanceMeters));
          await outputValue(rig, 'udp', 400 + 200 * trace.expectedFraction);
          const modernTimestamp = (await preview(rig, root)).timestampMs;
          await feed.set(() => { legacyBatches++; return [[legacy, .98], [legacy + 'Close', 1]]; });
          await expect.poll(async () => (await preview(rig, legacy))?.timestampMs - modernTimestamp,
            { message: 'Legacy packets continue after the modern pair expires / 现代配对过期后旧式数据仍在到达' })
            .toBeGreaterThan(timeoutMs);
          await expect.poll(async () => (await rig.overview()).runtime.isEmergency).toBe(true);
          await expect(page.getByRole('switch', { name: await text(page, '输入启用'), exact: true })).not.toBeChecked();
          await expect.poll(() => rig.wire.udp.at(-1)).toBe('DSTOP');
          expect(legacyBatches).toBeGreaterThan(2);
          const stoppedCount = motionLines(rig).length, batchesAtStop = legacyBatches;
          await expect.poll(() => legacyBatches).toBeGreaterThan(batchesAtStop + 2);
          expect(motionLines(rig)).toHaveLength(stoppedCount);

          await feed.set(readings(trace, trace.insideDistanceMeters));
          await received(rig, root, .89);
          await expect.poll(async () => (await preview(rig, root))?.timestampMs).toBeGreaterThan(modernTimestamp + timeoutMs);
          expect((await rig.overview()).runtime).toMatchObject({ isEmergency: true, inputActive: false });
          expect(motionLines(rig)).toHaveLength(stoppedCount);
          await page.getByRole('button', { name: await text(page, '解除急停'), exact: true }).click();
          await expect.poll(async () => (await rig.overview()).runtime.isEmergency).toBe(false);
          expect((await rig.overview()).runtime.inputActive).toBe(false);
          expect(motionLines(rig)).toHaveLength(stoppedCount);

          await feed.set(readings(trace, trace.learningDistanceMeters));
          await received(rig, tip, .96);
          await active(page);
          await outputValue(rig, 'udp', 400);
          await feed.set(readings(trace, trace.insideDistanceMeters));
          await outputValue(rig, 'udp', 400 + 200 * trace.expectedFraction);
          await info.attach('sps3-modern-pair-timeout.json', {
            body: JSON.stringify({ producer: contract.producer, locale, timeoutMs, modernTimestamp,
              legacyPacketsAfterModernExpiry: legacyBatches, stops: rig.wire.udp.filter(line => line === 'DSTOP').length,
              explicitReactivation: true, learnedAgainBeforeMotion: true, simulatedProducerGeometry: true,
              unityClientExecution: false, hardwareExecution: false, wire: rig.wire.udp }), contentType: 'application/json',
          });
          await active(page, false);
        } finally { await feed.stop(); }
      });
  });
}
