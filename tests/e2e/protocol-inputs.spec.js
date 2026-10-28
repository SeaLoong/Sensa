import WebSocket from 'ws';
import net from 'node:net';
import http from 'node:http';
import { once } from 'node:events';
import { test, expect, text, workspace, mode, active, enable, expand } from './fixtures.js';
import { createUiQualityReport, inspectReflow } from './ui-quality.js';

const origin = 'https://source.example';
const savedConfig = (page, rig) => page.request.get(rig.baseUrl + '/api/config').then(response => response.json());
const motionLines = rig => rig.wire.udp.filter(line => /L0\d/.test(line));

async function handyApiFixture() {
  const requests = [], setups = new Set();
  let setupCount = 0, canceledSetups = 0, lastSetupAt = 0;
  const reply = (response, body) => {
    if (response.destroyed || response.writableEnded) return;
    response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(body));
  };
  const server = http.createServer((request, response) => {
    const path = new URL(request.url, 'http://fixture').pathname;
    requests.push({ path, method: request.method }); request.resume();
    if (path === '/connected') reply(response, { connected: true });
    else if (path === '/info') reply(response, { fwVersion: '3.0.0' });
    else if (path === '/servertime') reply(response, { serverTime: Date.now() });
    else if (path === '/hssp/setup') {
      setups.add(response); setupCount++; lastSetupAt = Date.now();
      response.on('close', () => { if (!response.writableFinished) canceledSetups++; setups.delete(response); });
    } else reply(response, { result: {} });
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  return { requests, endpoint: `http://127.0.0.1:${server.address().port}/`,
    get setupCount() { return setupCount; }, get canceledSetups() { return canceledSetups; }, get lastSetupAt() { return lastSetupAt; },
    finishSetups() { for (const response of setups) reply(response, { result: {} }); setups.clear(); },
    async close() { this.finishSetups(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); },
  };
}

async function addSource(page, rig, { type = 'Buttplug', port = 19400, name = 'Browser bridge' } = {}) {
  await workspace(page, '设置');
  const panel = page.getByTestId('protocol-inputs-panel');
  await panel.getByRole('button', { name: await text(page, '添加协议来源'), exact: true }).click();
  const card = panel.getByTestId('protocol-input-card').last();
  await card.getByRole('textbox', { name: await text(page, '来源名称'), exact: true }).fill(name);
  await card.getByRole('combobox', { name: await text(page, '输入协议'), exact: true }).selectOption(type);
  await card.getByRole('spinbutton', { name: await text(page, '监听端口'), exact: true }).fill(String(port));
  await card.getByRole('checkbox', { name: await text(page, '启用监听'), exact: true }).check();
  await panel.getByRole('button', { name: await text(page, '保存协议输入'), exact: true }).click();
  await expect.poll(async () => (await savedConfig(page, rig)).protocolInputs?.find(input => input.name === name)?.port).toBe(port);
  await expect.poll(async () => (await rig.overview()).protocolInputs?.find(input => input.name === name)?.listening).toBe(true);
  return (await savedConfig(page, rig)).protocolInputs.find(input => input.name === name);
}

async function peer(port, website = origin) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}`, { origin: website });
  const pending = new Map();
  let sequence = 0, ping;
  socket.on('message', bytes => {
    const messages = JSON.parse(bytes.toString());
    for (const frame of messages) {
      const body = Object.values(frame)[0], item = pending.get(body?.Id);
      if (item) { clearTimeout(item.timer); pending.delete(body.Id); item.resolve(frame); }
    }
  });
  const rejectPending = () => {
    clearInterval(ping);
    for (const item of pending.values()) { clearTimeout(item.timer); item.reject(new Error('Protocol peer disconnected.')); }
    pending.clear();
  };
  socket.on('close', rejectPending);
  socket.on('error', () => {});
  await once(socket, 'open');
  ping = setInterval(() => {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify([{ Ping: { Id: 4294967000 } }]));
  }, 1000);
  return {
    request(name, body = {}) {
      const Id = ++sequence;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pending.delete(Id); reject(new Error(`Protocol response timeout: ${name}`)); }, 5000);
        pending.set(Id, { resolve, reject, timer });
        socket.send(JSON.stringify([{ [name]: { Id, ...body } }]));
      });
    },
    async close() { clearInterval(ping); if (socket.readyState === WebSocket.CLOSED) return; socket.close(); await once(socket, 'close'); },
  };
}

for (const locale of ['zh-CN', 'en-US']) {
  test.describe(`protocol input configuration ${locale}`, () => {
    test.use({ locale });
    test('source configuration exposes its client address, preserves drafts and disarms saving / 来源配置显示地址并保留草稿，保存关闭输入',
      { tag: ['@input', '@config', '@i18n', '@quality'] }, async ({ page, rig }, info) => {
        const source = await addSource(page, rig);
        expect(source).not.toHaveProperty('allowedOrigins');
        expect(source.features).toMatchObject([{ channel: 'L0', actuator: 'Position', targetAxis: 'L0' }]);
        expect(source.routeToMotion).toBe(true);
        expect((await rig.overview()).runtime.inputActive).toBe(false);
        await mode(page, '协议');
        const panel = page.getByTestId('protocol-inputs-panel');
        await expect(panel.getByTestId('protocol-endpoint')).toContainText(':19400');
        await expect(panel.getByRole('textbox', { name: await text(page, '来源标识'), exact: true })).toBeDisabled();
        await expect(panel.getByRole('textbox', { name: '允许的网站来源', exact: true })).toHaveCount(0);
        await panel.getByRole('spinbutton', { name: await text(page, '监听端口'), exact: true }).fill('0');
        await expect(panel.getByRole('button', { name: await text(page, '保存协议输入'), exact: true })).toBeDisabled();
        await panel.getByRole('button', { name: await text(page, '恢复协议输入'), exact: true }).click();
        await expect(panel.getByRole('spinbutton', { name: await text(page, '监听端口'), exact: true })).toHaveValue('19400');
        await expect(page.getByRole('switch', { name: await text(page, '输入启用'), exact: true })).not.toBeChecked();
        const report = createUiQualityReport(page, info, { kind: 'protocol-input-editor',
          plannedStates: ['protocol-source-saved'], plannedChecks: ['protocol-input-reflow-320'] });
        const viewport = page.viewportSize();
        try {
          await report.audit('protocol-source-saved');
          await page.setViewportSize({ ...viewport, width: 320 });
          await report.check('protocol-input-reflow-320', () => inspectReflow(page));
        } catch (error) { report.fail(error); throw error; }
        finally { await page.setViewportSize(viewport); await report.write(); }
        await info.attach('protocol-source.json', { body: JSON.stringify({ fixtureOnly: true, hardwareExecution: false,
          source, savesEnableInput: false }), contentType: 'application/json' });
      });

    test('vendor API configuration retains private options and keeps output disabled / 厂商API配置保留私有选项且输出保持关闭',
      { tag: ['@config', '@i18n'] }, async ({ page, rig }) => {
        await workspace(page, '控制');
        await page.getByRole('combobox', { name: await text(page, '输出类型'), exact: true }).selectOption('Handy');
        await page.getByRole('button', { name: await text(page, '添加输出'), exact: true }).click();
        const card = page.locator('.output-card').filter({ has: page.getByRole('heading', { name: 'The Handy 1', exact: true }) });
        const dialog = page.getByRole('dialog', { name: await text(page, '输出设置'), exact: true });
        await expect(dialog).toBeVisible();
        await dialog.getByLabel(await text(page, '设备连接密钥'), { exact: true }).fill('test-only-handshake-key');
        await dialog.getByLabel(await text(page, '设备 API 地址'), { exact: true }).fill('http://127.0.0.1:19419/');
        await dialog.getByLabel(await text(page, '同步脚本地址'), { exact: true }).fill('https://example.com/fixture.csv');
        await dialog.getByRole('button', { name: await text(page, '保存输出'), exact: true }).click();
        await expect(dialog).toBeHidden();
        const output = (await savedConfig(page, rig)).outputs.find(candidate => candidate.type === 'Handy');
        expect(output.enabled).toBe(false);
        expect(output.device.connectionKey).toBe('test-only-handshake-key');
        expect(output.device.scriptUrl).toBe('https://example.com/fixture.csv');
        await expect(card).not.toContainText('test-only-handshake-key');
        await card.locator('summary').filter({ hasText: await text(page, '同步脚本播放') }).click();
        await expect(card.getByRole('button', { name: await text(page, '播放同步脚本'), exact: true })).toBeDisabled();
      });
  });
}

for (const version of [2, 3, 4]) {
  test(`Buttplug v${version} sends position and travel time through Sensa to isolated TCode / 协议位置与时长转发到隔离TCode`,
    { tag: ['@input', '@transport', '@config'] }, async ({ page, rig }, info) => {
      await enable(page, ['Mock UDP']);
      await addSource(page, rig);
      await mode(page, '协议');
      const client = await peer(19400);
      try {
        const hello = await client.request('RequestServerInfo', version < 4 ? { ClientName: 'CI website', MessageVersion: version }
          : { ClientName: 'CI website', ProtocolVersionMajor: 4, ProtocolVersionMinor: 0 });
        expect(hello.ServerInfo).toBeTruthy();
        const list = await client.request('RequestDeviceList');
        expect(list.DeviceList).toBeTruthy();
        const send = (position, duration) => version < 4
          ? client.request('LinearCmd', { DeviceIndex: 0, Vectors: [{ Index: 0, Position: position, Duration: duration }] })
          : client.request('OutputCmd', { DeviceIndex: 0, FeatureIndex: 0,
            Command: { HwPositionWithDuration: { Value: Math.round(position * 1000), Duration: duration } } });
        const baseline = motionLines(rig).length;
        expect((await send(.2, 200)).Ok).toBeTruthy();
        expect(motionLines(rig)).toHaveLength(baseline);
        await active(page);
        expect((await send(.65, 275)).Ok).toBeTruthy();
        await expect.poll(() => rig.wire.udp.some(line => /L0530I275(?:\s|$)/.test(line))).toBe(true);
        const stop = await client.request(version < 4 ? 'StopAllDevices' : 'StopCmd');
        expect(stop.Ok).toBeTruthy();
        await expect.poll(() => rig.wire.udp.at(-1)).toBe('DSTOP');
        await page.getByRole('button', { name: await text(page, '紧急停止'), exact: true }).click();
        await expect.poll(async () => (await rig.overview()).runtime.isEmergency).toBe(true);
        const halted = motionLines(rig).length;
        await send(.9, 500);
        expect(motionLines(rig)).toHaveLength(halted);
        await page.getByRole('button', { name: await text(page, '解除急停'), exact: true }).click();
        await expect(page.getByRole('switch', { name: await text(page, '输入启用'), exact: true })).not.toBeChecked();
        await info.attach(`buttplug-v${version}-wire.json`, { body: JSON.stringify({ fixtureOnly: true, hardwareExecution: false,
          version, wire: rig.wire.udp, travelTimePreserved: true }), contentType: 'application/json' });
      } finally { await client.close(); }
    });
}

test('websites connect without an allowlist while independent controllers cannot take over / 网站无需白名单即可连接，独立会话不能抢占控制',
  { tag: ['@input', '@transport'] }, async ({ page, rig }) => {
    await addSource(page, rig);
    const first = await peer(19400, 'https://any-player.example'), second = await peer(19400, 'https://another-player.example');
    try {
      expect((await first.request('RequestServerInfo', { ClientName: 'First', MessageVersion: 3 })).ServerInfo).toBeTruthy();
      expect((await second.request('RequestServerInfo', { ClientName: 'Second', MessageVersion: 3 })).Error).toBeTruthy();
      expect((await rig.overview()).runtime.inputActive).toBe(false);
      expect(motionLines(rig)).toHaveLength(0);
    } finally { await Promise.all([first.close(), second.close()]); }
  });

test('TCode TCP input forwards timed axes and stops on an invalid batch and disconnect / TCode TCP转发时长并在无效批次和断线时停止',
  { tag: ['@input', '@transport'] }, async ({ page, rig }, info) => {
    await enable(page, ['Mock UDP']);
    await addSource(page, rig, { type: 'TCodeTcp', port: 19401 });
    await mode(page, '协议'); await active(page);
    const socket = net.createConnection({ host: '127.0.0.1', port: 19401 });
    const replies = [];
    const closed = new Promise(resolve => socket.once('close', resolve));
    socket.on('data', bytes => replies.push(bytes.toString()));
    socket.on('error', () => {});
    let fresh;
    try {
      await once(socket, 'connect');
      socket.write('L0650I300\n');
      await expect.poll(() => rig.wire.udp.some(line => /L0530I300(?:\s|$)/.test(line))).toBe(true);
      const previous = motionLines(rig).length;
      socket.write('L0900I400 INVALID\n');
      await expect.poll(() => rig.wire.udp.at(-1)).toBe('DSTOP');
      expect(motionLines(rig)).toHaveLength(previous);
      await expect.poll(() => replies.join('')).toMatch(/^ERR /);
      await expect.poll(() => socket.destroyed).toBe(true);
      await closed;
      await expect.poll(async () => (await rig.overview()).protocolInputs.find(input => input.type === 'TCodeTcp')?.connected).toBe(false);
      fresh = net.createConnection({ host: '127.0.0.1', port: 19401 });
      const freshClosed = new Promise(resolve => fresh.once('close', resolve));
      fresh.on('data', () => {}); fresh.on('error', () => {});
      await once(fresh, 'connect');
      expect(motionLines(rig)).toHaveLength(previous);
      fresh.write('L0250I150\n');
      await expect.poll(() => rig.wire.udp.some(line => /L0450I150(?:\s|$)/.test(line))).toBe(true);
      fresh.end(); await freshClosed;
      await expect.poll(() => rig.wire.udp.at(-1)).toBe('DSTOP');
      await info.attach('tcode-input-wire.json', { body: JSON.stringify({ fixtureOnly: true, hardwareExecution: false,
        invalidSessionClosed: true, replies, newSessionConnectedWithoutReplay: true, wire: rig.wire.udp }), contentType: 'application/json' });
    } finally { socket.destroy(); fresh?.destroy(); }
  });

test('browser HTTP JSON input needs no website configuration and preserves timed output / 浏览器HTTP JSON输入无需网站配置且保留时长',
  { tag: ['@input', '@transport', '@config'] }, async ({ page, rig }) => {
    await enable(page, ['Mock UDP']);
    await addSource(page, rig, { type: 'JsonHttp', port: 19403 });
    await mode(page, '协议'); await active(page);
    const post = (path, body) => page.evaluate(async ({ path, body }) => {
      const response = await fetch(`http://127.0.0.1:19403${path}`, { method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Sensa-Session': 'browser-fixture' }, body: JSON.stringify(body) });
      return { status: response.status, data: await response.json() };
    }, { path, body });
    expect(await post('/command', { channel: 'L0', value: .75, durationMs: 225 })).toMatchObject({ status: 200, data: { ok: true } });
    await expect.poll(() => rig.wire.udp.some(line => /L0550I225(?:\s|$)/.test(line))).toBe(true);
    const previous = motionLines(rig).length;
    expect((await post('/command', { channel: 'L0', value: 1.5, durationMs: 225 })).status).toBe(400);
    expect(motionLines(rig)).toHaveLength(previous);
    expect((await post('/stop', {})).status).toBe(200);
    await expect.poll(() => rig.wire.udp.at(-1)).toBe('DSTOP');
  });

test('independent protocol sources combine through computed bindings and stop when one disconnects / 独立协议来源经计算组合且断线停止依赖输出',
  { tag: ['@input', '@transport', '@config'] }, async ({ page, rig }, info) => {
    const config = await savedConfig(page, rig);
    const input = (id, port) => ({ id, name: id, type: 'Buttplug', enabled: true, host: '127.0.0.1', port,
      timeoutMs: 10000, baudRate: 115200, routeToMotion: false,
      features: [{ channel: 'L0', name: 'Stroke', actuator: 'Position', targetAxis: '' }] });
    const response = await page.request.put(rig.baseUrl + '/api/config', { data: { ...config,
      protocolInputs: [input('source-a', 19400), input('source-b', 19402)],
      computedSignals: [{ id: 'ProtocolBlend', name: 'Protocol blend', operation: 'Average',
        inputs: ['source-a/L0', 'source-b/L0'].map(oscPath => ({ sourceMode: 'Protocol', oscPath })) }],
      outputs: config.outputs.map(output => output.id !== 'udp' ? output : { ...output,
        signal: { bindings: [{ id: 'BlendBinding', address: 'L0', source: { sourceMode: 'Computed', oscPath: 'ProtocolBlend' },
          inputMin: 0, inputMax: 1, outputMin: 0, outputMax: 1, stopValue: .25, valueType: 'Float', rateHz: 20, sendMode: 'OnChange' }] } }),
    } });
    expect(response.ok()).toBe(true);
    await page.reload(); await enable(page, ['Mock UDP']); await mode(page, '组合'); await active(page);
    const a = await peer(19400), b = await peer(19402);
    try {
      for (const client of [a, b]) expect((await client.request('RequestServerInfo', { ClientName: 'Isolated source', MessageVersion: 3 })).ServerInfo).toBeTruthy();
      const send = (client, Position) => client.request('LinearCmd', { DeviceIndex: 0, Vectors: [{ Index: 0, Position, Duration: 0 }] });
      await send(a, .2); await send(b, .8);
      await expect.poll(async () => (await rig.overview()).computedSignals.find(signal => signal.id === 'ProtocolBlend')?.value).toBeCloseTo(.5, 5);
      await expect.poll(() => rig.wire.udp.some(line => /L0500(?:I|S|\s|$)/.test(line))).toBe(true);
      const validTargets = rig.wire.udp.length;
      await b.close();
      await expect.poll(async () => (await rig.overview()).computedSignals.find(signal => signal.id === 'ProtocolBlend')?.valid).toBe(false);
      await expect.poll(async () => (await rig.overview()).outputs.find(output => output.id === 'udp')?.signalStatus?.routes
        .find(route => route.id === 'BlendBinding')?.valid).toBe(false);
      await expect.poll(() => rig.wire.udp.at(-1)).toBe('L0450I50');
      expect(rig.wire.udp.slice(validTargets).some(line => /L0500(?:I|S|\s|$)/.test(line))).toBe(false);
      await active(page, false);
      await expect.poll(() => rig.wire.udp.at(-1)).toBe('DSTOP');
      await info.attach('independent-protocol-sources.json', { body: JSON.stringify({ fixtureOnly: true, hardwareExecution: false,
        explicitCombination: true, stopValue: .25, sourceInvalidationUsesStopValue: true, inputDisableSendsDeviceStop: true,
        sources: ['source-a', 'source-b'], wire: rig.wire.udp }), contentType: 'application/json' });
    } finally { await Promise.all([a.close(), b.close()]); }
  });

test('Intiface advanced actuator mappings persist without arming the output / Intiface高级执行器映射保存不启用输出',
  { tag: ['@config', '@input'] }, async ({ page, rig }) => {
    const card = page.locator('.output-card').filter({ has: page.getByRole('heading', { name: 'Mock Intiface', exact: true }) });
    await card.getByRole('button', { name: await text(page, '配置'), exact: true }).click();
    const dialog = page.getByRole('dialog', { name: await text(page, '输出设置'), exact: true });
    const mappings = dialog.getByTestId('intiface-feature-mappings');
    await mappings.locator('summary').click();
    await mappings.getByRole('button', { name: await text(page, '添加执行器映射'), exact: true }).click();
    const route = mappings.getByTestId('intiface-feature-route');
    await route.getByLabel(await text(page, '匹配设备名称'), { exact: true }).fill('Simulated rotation device');
    await route.getByRole('spinbutton', { name: await text(page, '特征索引'), exact: true }).fill('2');
    await route.getByRole('combobox', { name: await text(page, '执行器类型'), exact: true }).selectOption('Rotate');
    await route.getByRole('combobox', { name: await text(page, '来源轴'), exact: true }).selectOption('V1');
    await route.getByRole('combobox', { name: await text(page, '旋转方向轴'), exact: true }).selectOption('A0');
    await route.getByRole('checkbox', { name: await text(page, '反向数值（1−x）'), exact: true }).check();
    await dialog.getByRole('button', { name: await text(page, '保存输出'), exact: true }).click();
    await expect(dialog).toBeHidden();
    const saved = (await savedConfig(page, rig)).outputs.find(output => output.id === 'intiface');
    expect(saved.intifaceFeatures).toEqual([{ deviceName: 'Simulated rotation device', featureIndex: 2, outputType: 'Rotate', sourceAxis: 'V1', directionAxis: 'A0', clockwise: true, invert: true }]);
    expect(saved.enabled).toBe(false);
    expect((await rig.overview()).runtime.inputActive).toBe(false);
  });

for (const action of ['emergency', 'stop']) {
  test(`blocked script preparation can be canceled by ${action} without a late resume / 阻塞脚本准备可取消且迟到结果不续动`,
    { tag: ['@config', '@input', '@transport'] }, async ({ page, rig }, info) => {
      const fixture = await handyApiFixture();
      try {
        await page.getByRole('combobox', { name: await text(page, '输出类型'), exact: true }).selectOption('Handy');
        await page.getByRole('button', { name: await text(page, '添加输出'), exact: true }).click();
        const card = page.locator('.output-card').filter({ has: page.getByRole('heading', { name: 'The Handy 1', exact: true }) });
        const dialog = page.getByRole('dialog', { name: await text(page, '输出设置'), exact: true });
        await expect(dialog).toBeVisible();
        await dialog.getByLabel(await text(page, '设备连接密钥'), { exact: true }).fill('test-only-cancel-key');
        await dialog.getByLabel(await text(page, '设备 API 地址'), { exact: true }).fill(fixture.endpoint);
        await dialog.getByLabel(await text(page, '同步脚本地址'), { exact: true }).fill('https://example.com/test.csv');
        await dialog.getByRole('button', { name: await text(page, '保存输出'), exact: true }).click();
        await expect(dialog).toBeHidden();
        await card.getByRole('button', { name: await text(page, '启用'), exact: true }).click();
        const outputId = (await savedConfig(page, rig)).outputs.find(output => output.type === 'Handy').id;
        await expect.poll(async () => (await rig.overview()).outputs.find(output => output.id === outputId)?.connected).toBe(true);
        const controls = card.getByTestId('vendor-script-controls');
        await controls.locator('summary').click();
        const request = page.waitForRequest(request => request.method() === 'POST' && request.url().endsWith(`/api/control/output/${outputId}/script-prepare`));
        await controls.getByRole('button', { name: await text(page, '准备同步脚本'), exact: true }).click();
        await request;
        await expect.poll(() => fixture.setupCount).toBe(1);
        // Preparation stays pending; the cancellation must work before its HTTP response.
        await expect.poll(() => fixture.lastSetupAt > 0 && Date.now() - fixture.lastSetupAt > 1500).toBe(true);
        const started = Date.now();
        if (action === 'emergency') await page.getByRole('button', { name: await text(page, '紧急停止'), exact: true }).click();
        else await controls.getByRole('button', { name: await text(page, '停止同步脚本'), exact: true }).click();
        await expect.poll(() => fixture.canceledSetups, { timeout: 5000 }).toBe(1);
        fixture.finishSetups();
        await expect.poll(async () => (await rig.overview()).outputs.find(output => output.id === outputId)?.deviceApi?.scriptPrepared).toBe(false);
        const state = await rig.overview();
        expect(state.runtime.inputActive).toBe(false);
        if (action === 'emergency') expect(state.runtime.isEmergency).toBe(true);
        expect(fixture.requests.some(request => request.path === '/hssp/play' || request.path.startsWith('/hdsp/'))).toBe(false);
        await info.attach(`script-prepare-${action}.json`, { body: JSON.stringify({ fixtureOnly: true, hardwareExecution: false,
          independentPrepareHttpRequest: true, cancellationMs: Date.now() - started, canceledSetups: fixture.canceledSetups,
          requests: fixture.requests }), contentType: 'application/json' });
      } finally { await fixture.close(); }
    });
}

test.describe('rotation-only Intiface device / 纯旋转Intiface设备', () => {
  test.use({ scenario: 'rotation-only' });
  test('an exact advanced route makes a rotation-only device usable and emits signed rotation / 精确高级映射使纯旋转设备可用并发送有符号旋转',
    { tag: ['@input', '@transport', '@config'] }, async ({ page, rig }, info) => {
      expect(rig.intifaceState.profile).toBe('rotation-only');
      await enable(page, ['Mock Intiface']);
      const state = (await rig.overview()).outputs.find(output => output.id === 'intiface');
      expect(state.devices[0]).toMatchObject({ name: 'CI rotation only', positionFeatures: 0, vibrateFeatures: 0,
        features: [{ index: 2, outputTypes: ['Rotate'] }] });
      await expect(page.locator('.control-readiness')).toHaveAttribute('data-state', 'inactive');
      await expect(page.locator('.control-readiness summary')).toContainText('1/4');
      await active(page);
      await expand(page, await text(page, '旋转、震动与辅助轴'));
      await page.getByRole('spinbutton', { name: 'V0 震动数值', exact: true }).fill('400');
      await page.getByRole('button', { name: await text(page, '发送一次'), exact: true }).click();
      await expect.poll(() => rig.wire.intiface.filter(message => message.OutputCmd?.Command?.Rotate)
        .map(message => message.OutputCmd.Command.Rotate.Value).at(-1)).toBe(-200);
      expect(rig.wire.intiface.some(message => message.OutputCmd?.Command?.Vibrate || message.OutputCmd?.Command?.Position)).toBe(false);
      await info.attach('rotation-only-routing.json', { body: JSON.stringify({ fixtureOnly: true, hardwareExecution: false,
        capabilities: state.devices[0].features, wire: rig.wire.intiface }), contentType: 'application/json' });
    });
});
