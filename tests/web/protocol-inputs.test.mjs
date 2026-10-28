import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PROTOCOL_INPUT_TYPES, VENDOR_OUTPUT_TYPES, makeProtocolDraft, newProtocolDraft, stripProtocolDraft,
  protocolDraftErrors, protocolEndpoint, saveProtocolDrafts } from '../../src/web/protocol-inputs.js';
import { buildOutputDialogDraft, buildOutputSummary, createOutputConfig, editConfiguration, normalizeAxisProfiles } from '../../src/web/configuration.js';
import { controlReadiness, outputRoutingScope } from '../../src/web/control-workflow.js';
import { sanitizeStudio } from '../../src/web/preferences.js';
import { exportSignalPlan, parseSignalPlan } from '../../src/web/signal-outputs.js';
import { INTIFACE_OUTPUT_TYPES, intifaceBindingAxes, intifaceFeatureErrors, makeIntifaceFeatureRoute, stripIntifaceFeatureRoutes } from '../../src/web/intiface-feature-routing.js';
import { prepareDeviceScript } from '../../src/web/device-script-requests.js';
import { createRealtimeSession } from '../../src/web/realtime-session.js';

test('new protocol drafts keep independent channel arrays and select unoccupied endpoints / 新协议草稿保留独立通道并选择空闲端口', () => {
  const source = [newProtocolDraft()];
  const snapshot = JSON.stringify(source);
  const second = newProtocolDraft(source);
  assert.notEqual(second.id, source[0].id);
  assert.notEqual(second.port, source[0].port);
  second.features[0].channel = 'R0';
  assert.equal(JSON.stringify(source), snapshot);
  assert.equal(second.enabled, false);
  assert.equal(second.routeToMotion, true);
  assert.equal('allowedOrigins' in source[0], false);
  assert.equal('allowedOriginsText' in source[0], false);
});

test('protocol save trims identities without changing the submitted draft / 协议保存整理标识但不修改草稿', () => {
  const draft = newProtocolDraft();
  draft.id = ' source_1 '; draft.name = ' Website ';
  draft.routeToMotion = false;
  draft.features[0].name = ' Position ';
  const before = JSON.stringify(draft), config = { protocolInputs: [], outputs: [], ignored: { keep: true } };
  const saved = saveProtocolDrafts(config, [draft]);
  assert.equal(JSON.stringify(draft), before);
  assert.equal('allowedOrigins' in saved.protocolInputs[0], false);
  assert.equal(saved.protocolInputs[0].id, 'source_1');
  assert.equal(saved.protocolInputs[0].name, 'Website');
  assert.equal(saved.protocolInputs[0].features[0].name, 'Position');
  assert.equal(saved.protocolInputs[0].routeToMotion, false);
  assert.equal('allowedOriginsText' in saved.protocolInputs[0], false);
  assert.deepEqual(config.protocolInputs, []);
  assert.equal(saved.ignored, config.ignored);
});

test('different protocol listeners cannot collide or implicitly claim one axis / 协议监听避免端口和目标轴冲突', () => {
  const a = { ...newProtocolDraft(), enabled: true };
  const b = { ...newProtocolDraft([a], 'JsonWebSocket'), enabled: true, port: a.port };
  assert.ok(protocolDraftErrors([a, b]).length >= 2);
  b.port++;
  assert.ok(protocolDraftErrors([a, b]).length);
  b.routeToMotion = false;
  assert.deepEqual(protocolDraftErrors([a, b]), []);
  b.type = 'TCodeUdp'; b.port = a.port;
  assert.deepEqual(protocolDraftErrors([a, b]), [], 'TCP and UDP have separate listeners.');
  b.type = 'Buttplug';
  assert.ok(protocolDraftErrors([a, b]).length);
  b.enabled = false;
  assert.deepEqual(protocolDraftErrors([a, b]), []);
});

test('protocol inputs require no website allowlist and omit obsolete source fields / 协议输入无需网站白名单且不再保存旧字段', () => {
  const input = { ...newProtocolDraft(), allowedOrigins: ['https://old.example'], allowedOriginsText: '*' };
  const draft = makeProtocolDraft(input);
  assert.equal('allowedOrigins' in draft, false);
  assert.equal('allowedOriginsText' in draft, false);
  assert.deepEqual(protocolDraftErrors([input]), []);
  const saved = saveProtocolDrafts({}, [input]).protocolInputs[0];
  assert.equal('allowedOrigins' in saved, false);
  assert.equal('allowedOriginsText' in saved, false);
});

test('all configurable transport kinds survive a complete save and reopen / 所有传输类型均可完整保存和恢复', () => {
  for (const { value: type } of PROTOCOL_INPUT_TYPES()) {
    const draft = { ...newProtocolDraft([], type), comPort: '/dev/pts/42', routeToMotion: false };
    const saved = saveProtocolDrafts({}, [draft]);
    assert.equal(saved.protocolInputs[0].type, type);
    assert.deepEqual(stripProtocolDraft(makeProtocolDraft(saved.protocolInputs[0])), saved.protocolInputs[0]);
    assert.equal(saved.protocolInputs[0].enabled, false);
    assert.ok(protocolEndpoint(draft));
  }
  assert.equal(protocolEndpoint({ type: 'Buttplug', host: '::1', port: 12400 }), 'ws://[::1]:12400');
  assert.equal(protocolEndpoint({ type: 'TCodeSerial', comPort: 'COM8' }), 'COM8');
});

test('malformed values cannot silently become active listener or motion settings / 无效值不能悄悄成为监听与动作配置', () => {
  for (const patch of [{ id: '' }, { id: 'has/path' }, { id: 'has.dot' }, { port: 0 }, { port: 65536 }, { port: 12.5 },
    { timeoutMs: '' }, { timeoutMs: 999 }, { timeoutMs: Infinity }, { type: 'Unknown' }, { host: '' }, { host: 'localhost' }, { host: '999.0.0.1' },
    { maxSpeedPerSecond: 0 }, { maxSpeedPerSecond: Infinity },
    { features: [] }, { features: [{ channel: '', actuator: 'Position', targetAxis: 'L0' }] },
    { features: [{ channel: 'L0', actuator: 'Rotation', targetAxis: 'R0' }] },
    { features: [{ channel: 'L0', actuator: 'Scalar', targetAxis: 'L0' }] },
    { features: [{ channel: 'L0', actuator: 'Position', targetAxis: 'X0' }] }]) {
    assert.ok(protocolDraftErrors([{ ...newProtocolDraft(), ...patch }]).length, JSON.stringify(patch));
  }
  const serial = newProtocolDraft([], 'TCodeSerial');
  assert.ok(protocolDraftErrors([serial]).length);
  serial.comPort = 'COM8'; assert.deepEqual(protocolDraftErrors([serial]), []);
  const device = newProtocolDraft([], 'IntifaceDevice');
  device.address = 'http://127.0.0.1:54817'; assert.ok(protocolDraftErrors([device]).length);
  device.address = 'ws://127.0.0.1:54817'; assert.deepEqual(protocolDraftErrors([device]), []);
});

test('rotation is explicit signal data while intensity directly targets vibration axes / 旋转作为显式信号，强度直映振动轴', () => {
  const draft = newProtocolDraft();
  draft.features = [{ channel: 'Rotate', actuator: 'Rotation', targetAxis: '' }, { channel: 'V0', actuator: 'Scalar', targetAxis: 'V0' }];
  assert.deepEqual(protocolDraftErrors([draft]), []);
  draft.features.push({ ...draft.features[0] });
  assert.ok(protocolDraftErrors([draft]).length);
  draft.features.pop(); draft.type = 'TCodeTcp';
  assert.ok(protocolDraftErrors([draft]).length, 'TCode channels use actual wire axis identifiers.');
});

test('protocol scripts retain their task deadline and scalar capability declarations / 协议脚本保留任务上限与标量能力声明', () => {
  const draft = newProtocolDraft([], 'HandyHttp');
  draft.maxScriptDurationMs = 120000;
  draft.features = [{ channel: 'Heat', actuator: 'Scalar', scalarType: 'Temperature', targetAxis: '' }];
  const saved = saveProtocolDrafts({}, [draft]);
  assert.equal(saved.protocolInputs[0].maxScriptDurationMs, 120000);
  assert.equal(saved.protocolInputs[0].features[0].scalarType, 'Temperature');
  assert.deepEqual(stripProtocolDraft(makeProtocolDraft(saved.protocolInputs[0])), saved.protocolInputs[0]);
  for (const invalid of [0, '', 999, 3600001, Infinity])
    assert.ok(protocolDraftErrors([{ ...draft, maxScriptDurationMs: invalid }]).length);
  assert.ok(protocolDraftErrors([{ ...draft, features: [{ ...draft.features[0], scalarType: 'Inflate' }] }]).length);
});

test('TCode inputs accept wire channels zero to nine while keeping absolute rotation semantics / TCode输入允许0到9通道但旋转轴仍为绝对位置', () => {
  const draft = newProtocolDraft([], 'TCodeTcp');
  draft.features = [{ channel: 'V3', actuator: 'Scalar', scalarType: 'Vibrate', targetAxis: 'V0' },
    { channel: 'R9', actuator: 'Position', targetAxis: 'R0' }];
  assert.deepEqual(protocolDraftErrors([draft]), []);
  draft.features[1].actuator = 'Rotation'; draft.features[1].targetAxis = '';
  assert.ok(protocolDraftErrors([draft]).length);
});

test('Intiface explicit mappings round-trip actual output types and distinguish direction from inversion / Intiface显式映射保存真实能力并区分方向与数值反向', () => {
  const config = { outputs: [], axisProfiles: normalizeAxisProfiles({}) }, output = createOutputConfig('Intiface', config);
  config.outputs = [output];
  assert.deepEqual(output.intifaceFeatures, []);
  for (const outputType of INTIFACE_OUTPUT_TYPES) {
    const route = makeIntifaceFeatureRoute({ deviceName: ' Test device ', featureIndex: 2, outputType, sourceAxis: 'V1',
      ...(outputType === 'Rotate' ? { directionAxis: 'A0', clockwise: false } : {}), invert: true });
    const next = editConfiguration(config, { kind: 'output-save', id: output.id, draft: { ...output, intifaceFeatures: [route] } });
    const reopened = buildOutputDialogDraft(output.id, next, []);
    assert.equal(reopened.intifaceFeatures[0].deviceName, 'Test device');
    assert.equal(reopened.intifaceFeatures[0].outputType, outputType);
    assert.equal(reopened.intifaceFeatures[0].invert, true);
    assert.equal(reopened.intifaceFeatures[0].clockwise, outputType !== 'Rotate');
    assert.deepEqual(output.intifaceFeatures, []);
  }
  assert.equal(stripIntifaceFeatureRoutes([makeIntifaceFeatureRoute({ featureIndex: '' })])[0].featureIndex, null);
});

test('Intiface mapping validation rejects unsupported, ambiguous and overlapping targets / Intiface映射校验拒绝未支持、歧义和重叠目标', () => {
  for (const patch of [{ outputType: 'Inflate' }, { featureIndex: -1 }, { featureIndex: 1.5 }, { featureIndex: 4294967296 },
    { sourceAxis: 'X0' }, { outputType: 'Vibrate', directionAxis: 'A0' }, { deviceName: 'has\nnewline' }])
    assert.ok(intifaceFeatureErrors([makeIntifaceFeatureRoute(patch)]).length, JSON.stringify(patch));
  const generic = makeIntifaceFeatureRoute({ outputType: 'Vibrate' });
  assert.ok(intifaceFeatureErrors([generic, { ...generic, deviceName: 'Toy', featureIndex: 1 }]).length);
  assert.deepEqual(intifaceFeatureErrors([{ ...generic, deviceName: 'A' }, { ...generic, deviceName: 'B' }]), []);
  assert.deepEqual(intifaceFeatureErrors([{ ...generic, featureIndex: 1 }, { ...generic, featureIndex: 2 }]), []);
  assert.ok(intifaceFeatureErrors([makeIntifaceFeatureRoute({ outputType: 'Position' }), makeIntifaceFeatureRoute({ outputType: 'HwPositionWithDuration' })]).length);
});

test('long script setup owns a bounded HTTP request while emergency still uses the ready command socket / 长脚本准备独立使用HTTP且急停继续通过命令连接', async () => {
  const jobs = new Map(), calls = [], sockets = [];
  let timerId = 0, finish;
  const timers = { setTimeout(fn, delay) { const id = ++timerId; jobs.set(id, { fn, delay }); return id; }, clearTimeout(id) { jobs.delete(id); } };
  const fetchRequest = (path, options) => {
    calls.push({ path, options });
    return new Promise(resolve => { finish = () => resolve({ ok: true, json: async () => ({ prepared: true }) }); });
  };
  const preparation = prepareDeviceScript('test-output', 'https://example.com/script.csv', { scriptTimeoutMs: 90000 }, { fetchRequest, timers });
  assert.equal([...jobs.values()][0].delay, 95000);
  assert.equal(calls[0].options.credentials, 'same-origin');
  assert.equal(calls[0].options.redirect, 'error');
  assert.equal(calls[0].path, '/api/control/output/test-output/script-prepare');
  const session = createRealtimeSession({ url: 'ws://memory/api/ws', timers, authenticate: async () => {}, createSocket: () => {
    const socket = { readyState: 0, sent: [], send(value) { this.sent.push(JSON.parse(value)); }, close() { this.readyState = 3; this.onclose?.(); } };
    sockets.push(socket); return socket;
  } });
  session.start(); await new Promise(resolve => setImmediate(resolve));
  const socket = sockets[0]; socket.readyState = 1; socket.onopen();
  const emergency = session.request('/api/control/runtime/emergency-stop', { method: 'POST' });
  await new Promise(resolve => setImmediate(resolve));
  assert.ok([...jobs.values()].some(job => job.delay === 15000));
  assert.ok([...jobs.values()].some(job => job.delay === 95000));
  socket.onmessage({ data: JSON.stringify({ id: socket.sent[0].id, ok: true, data: { stopped: true } }) });
  assert.deepEqual(await emergency, { stopped: true });
  finish(); assert.deepEqual(await preparation, { prepared: true });
  session.stop(); assert.equal(jobs.size, 0);
});

test('script setup timeout and explicit cancellation release their own timer without retry / 脚本准备超时与取消释放独立计时且不重放', async () => {
  const jobs = new Map(); let sequence = 0, sent = 0;
  const timers = { setTimeout(fn, delay) { const id = ++sequence; jobs.set(id, { fn, delay }); return id; }, clearTimeout(id) { jobs.delete(id); } };
  const fetchRequest = (_path, options) => { sent++; return new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })); };
  const timeout = prepareDeviceScript('one', 'https://example.com/test.csv', { scriptTimeoutMs: 1000 }, { fetchRequest, timers });
  const rejected = assert.rejects(timeout, /超时|timed out/);
  const task = [...jobs.values()][0]; assert.equal(task.delay, 6000); task.fn(); await rejected;
  assert.equal(jobs.size, 0);
  const controller = new AbortController();
  const canceled = prepareDeviceScript('two', 'https://example.com/test.csv', {}, { fetchRequest, timers, signal: controller.signal });
  const canceledResult = assert.rejects(canceled, /aborted/); controller.abort(); await canceledResult;
  assert.equal(jobs.size, 0); assert.equal(sent, 2);
});

test('vendor output edits preserve private fields without including them in summaries / 厂商输出编辑保留私有配置但摘要不含凭据', () => {
  for (const type of VENDOR_OUTPUT_TYPES) {
    const config = { outputs: [], axisProfiles: normalizeAxisProfiles({}) };
    const output = createOutputConfig(type, config);
    config.outputs = [output];
    const draft = buildOutputDialogDraft(output.id, config, []);
    draft.device = { ...draft.device, endpoint: ' http://127.0.0.1:18000/api ', connectionKey: ' test-only-key ',
      apiKey: 'test-only-api', authToken: 'test-only-token', deviceId: 'toy-1', apiVersion: 3, scriptUrl: 'https://example.com/test.csv' };
    const saved = editConfiguration(config, { kind: 'output-save', id: output.id, draft });
    const reopened = buildOutputDialogDraft(output.id, saved, []);
    assert.equal(reopened.device.connectionKey, 'test-only-key');
    assert.equal(reopened.device.authToken, 'test-only-token');
    assert.equal(reopened.device.scriptUrl, 'https://example.com/test.csv');
    assert.equal(reopened.device.apiVersion, 3);
    assert.equal(reopened.enabled, false);
    assert.doesNotMatch(buildOutputSummary(saved.outputs[0]), /test-only/);
    assert.equal(outputRoutingScope([{ ...saved.outputs[0], enabled: true }]).legacyMotion, true);
  }
});

test('protocol mode preferences persist without enabling input / 协议方式偏好保存不启用输入', () => {
  const saved = sanitizeStudio({ preferredInputTab: 'protocol', inputActive: true });
  assert.equal(saved.preferredInputTab, 'protocol');
  assert.equal('inputActive' in saved, false);
});

test('protocol readiness distinguishes listening, client connection and explicit input permission / 协议状态分别解释监听、客户端和输入许可', () => {
  const options = { online: true, mode: 'protocol', runtime: { inputActive: true },
    outputs: [{ id: 'udp', type: 'TCodeUdp', enabled: true }], outputStates: [{ id: 'udp', enabled: true, connected: true }] };
  assert.equal(controlReadiness(options).key, 'protocol-listener');
  const protocolInputs = [{ enabled: true, listening: true, connected: false }];
  assert.equal(controlReadiness({ ...options, protocolInputs }).key, 'protocol-client');
  protocolInputs[0].connected = true;
  assert.equal(controlReadiness({ ...options, protocolInputs, runtime: { inputActive: false } }).key, 'inactive');
  assert.equal(controlReadiness({ ...options, protocolInputs }).key, 'enabled');
  assert.equal(controlReadiness({ ...options, protocolInputs, runtime: { isEmergency: true } }).key, 'emergency');
});

test('portable plans include protocol sources and import listeners disabled without mutating their mappings / 整套方案包含协议来源且导入关闭监听', () => {
  const source = stripProtocolDraft({ ...newProtocolDraft(), enabled: true });
  const config = { protocolInputs: [source], computedSignals: [{ id: 'Copy', inputs: [{ sourceMode: 'Protocol', oscPath: `${source.id}/L0` }] }], outputs: [] };
  const before = JSON.stringify(config), exported = exportSignalPlan(config);
  assert.equal(exported.protocolInputs[0].enabled, false);
  exported.protocolInputs[0].enabled = true;
  const imported = parseSignalPlan(JSON.stringify(exported));
  assert.equal(imported.protocolInputs[0].enabled, false);
  assert.equal(imported.computedSignals[0].inputs[0].oscPath, `${source.id}/L0`);
  imported.protocolInputs[0].features[0].channel = 'R0';
  assert.equal(JSON.stringify(config), before);
  for (const invalid of [{}, [null], [{ id: {} }], new Array(17).fill({ id: 'source' })])
    assert.throws(() => parseSignalPlan(JSON.stringify({ ...exported, protocolInputs: invalid })));
});

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('../../', import.meta.url));
const compiled = await build({ absWorkingDir: root,
  stdin: { contents: "export {default as ProtocolPanel} from './src/web/ProtocolInputsPanel.jsx'; export {default as VendorFields,VendorScriptControls} from './src/web/VendorDeviceFields.jsx'; export {default as IntifaceFields} from './src/web/IntifaceFeatureFields.jsx'; export {default as Readiness} from './src/web/ControlFlowStatus.jsx'; export {setLocale} from './src/web/i18n.js';", resolveDir: root },
  bundle: true, write: false, platform: 'node', format: 'esm', jsx: 'automatic', plugins: [{ name: 'shared-test-react', setup(builder) {
    builder.onResolve({ filter: /^react(?:\/.*)?$/ }, args => ({ path: pathToFileURL(require.resolve(args.path)).href, external: true }));
  } }],
});
const { ProtocolPanel, VendorFields, VendorScriptControls, IntifaceFields, Readiness, setLocale } = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const render = (Component, props) => renderToStaticMarkup(React.createElement(Component, props));

test('protocol source editor exposes identities, capabilities and independent activation in both languages / 双语协议编辑器展示来源与能力且保留独立启用', () => {
  for (const locale of ['zh-CN', 'en-US']) {
    setLocale(locale);
    const input = stripProtocolDraft(newProtocolDraft());
    input.enabled = true;
    const html = render(ProtocolPanel, { config: { protocolInputs: [input] }, runtime: [{ id: input.id, listening: true, receivedCommands: 12 }], onSave() {} });
    assert.match(html, /data-testid="protocol-input-card"/);
    assert.match(html, /data-testid="protocol-feature"/);
    assert.doesNotMatch(html, /allowedOrigins|允许的网站来源|Allowed website origins/);
    assert.match(html, /ws:\/\/127\.0\.0\.1:12400/);
    assert.match(html, /protocol-1\/L0/);
    assert.match(html, /<input[^>]*disabled=""[^>]*value="protocol-1"/);
    assert.doesNotMatch(html, /role="switch"/);
    if (locale === 'en-US') assert.doesNotMatch(html, /[\u3400-\u9fff]/u);
  }
});

test('vendor forms use password fields and synchronized playback waits for explicit activation / 厂商凭据为密码框，同步播放等待明确启用', () => {
  setLocale('en-US');
  const html = render(VendorFields, { type: 'Handy', value: { apiVersion: 3 }, onChange() {} });
  assert.equal((html.match(/type="password"/g) || []).length, 3);
  assert.match(html, /API access token/);
  assert.doesNotMatch(html, /[\u3400-\u9fff]/u);
  const output = { device: { scriptUrl: 'https://example.com/test.csv' } };
  const stopped = render(VendorScriptControls, { output, disabled: false, inputActive: false, onAction() {} });
  assert.match(stopped, /<button[^>]*disabled=""[^>]*>Play synchronized script<\/button>/);
  assert.match(stopped, /<button[^>]*disabled=""[^>]*>Seek synchronized script<\/button>/);
  assert.doesNotMatch(stopped, /<button[^>]*disabled=""[^>]*>Prepare synchronized script<\/button>/);
  const active = render(VendorScriptControls, { output, disabled: false, inputActive: true, status: { scriptPrepared: true }, onAction() {} });
  assert.doesNotMatch(active, /<button[^>]*disabled=""[^>]*>Play synchronized script<\/button>/);
  const preparing = render(VendorScriptControls, { output, disabled: true, stopDisabled: false, inputActive: false, onAction() {} });
  assert.doesNotMatch(preparing, /<button[^>]*disabled=""[^>]*>Stop synchronized script<\/button>/);
});

test('vendor script controls render absent snapshots as unprepared without disabling stop / 厂商脚本状态缺失时仍可渲染且不阻塞停止', () => {
  for (const locale of ['zh-CN', 'en-US']) {
    setLocale(locale);
    const labels = locale === 'en-US'
      ? { play: 'Play synchronized script', seek: 'Seek synchronized script', prepare: 'Prepare synchronized script', stop: 'Stop synchronized script', unprepared: 'Script not prepared', playing: 'Playing' }
      : { play: '播放同步脚本', seek: '定位同步脚本', prepare: '准备同步脚本', stop: '停止同步脚本', unprepared: '脚本尚未准备', playing: '播放中' };
    const disabledButton = label => new RegExp('<button[^>]*disabled=""[^>]*>' + label + '<\\/button>');
    for (const type of ['Handy', 'Autoblow', 'VacuGlide']) {
      const props = { output: { type, device: { scriptUrl: 'https://example.com/test.csv' } },
        disabled: false, stopDisabled: false, inputActive: true, onAction() {} };
      // A new disabled output has deviceApi:null; undefined also occurs before its first overview.
      for (const snapshot of [{}, { status: undefined }, { status: null }, { status: {} }]) {
        for (const disabled of [false, true]) {
          const html = render(VendorScriptControls, { ...props, ...snapshot, disabled });
          assert.match(html, /data-testid="vendor-script-controls"/);
          assert.ok(html.includes(labels.unprepared));
          assert.match(html, disabledButton(labels.play));
          assert.match(html, disabledButton(labels.seek));
          assert.equal(disabledButton(labels.prepare).test(html), disabled);
          assert.doesNotMatch(html, disabledButton(labels.stop));
          assert.ok(!html.includes('>' + labels.playing + '<'));
        }
      }
    }
  }
});

test('losing a prepared vendor snapshot clears playback readiness immediately / 厂商已准备状态丢失后立即清除播放就绪', () => {
  setLocale('en-US');
  const props = { output: { type: 'Handy', device: { scriptUrl: 'https://example.com/test.csv' } },
    disabled: false, stopDisabled: false, inputActive: true, onAction() {} };
  for (const status of [{ scriptPrepared: true, scriptPlaying: true }, null, { scriptPrepared: false, scriptPlaying: false }, { scriptPrepared: true, scriptPlaying: true }]) {
    const html = render(VendorScriptControls, { ...props, status });
    const prepared = status?.scriptPrepared === true;
    assert.equal(html.includes('>Script prepared<'), prepared);
    assert.equal(html.includes('>Playing<'), prepared);
    for (const action of ['Play', 'Seek'])
      assert.equal(new RegExp('<button[^>]*disabled=""[^>]*>' + action + ' synchronized script<\\/button>').test(html), !prepared);
    assert.doesNotMatch(html, /<button[^>]*disabled=""[^>]*>Stop synchronized script<\/button>/);
  }
});

test('Intiface editor exposes genuine capabilities and documents direction separately from source inversion / Intiface编辑器展示真实能力并区分方向与数值反向', () => {
  for (const locale of ['zh-CN', 'en-US']) {
    setLocale(locale);
    const html = render(IntifaceFields, { routes: [makeIntifaceFeatureRoute({ deviceName: 'Fixture device', featureIndex: 2,
      outputType: 'Rotate', directionAxis: 'A0', sourceAxis: 'V1', invert: true })],
    devices: [{ index: 0, name: 'Fixture device', features: [{ index: 2, description: 'Fixture rotation', outputTypes: ['Rotate', 'Vibrate'] }] }], onChange() {} });
    assert.match(html, /data-testid="intiface-advertised-features"/);
    assert.match(html, /Fixture rotation/);
    assert.match(html, /Rotate \/ Vibrate/);
    assert.match(html, /<option value="A0" selected="">A0<\/option>/);
    assert.match(html, /<option value="V1" selected="">V1<\/option>/);
    for (const type of INTIFACE_OUTPUT_TYPES) assert.match(html, new RegExp('<option value="' + type + '"'));
    assert.doesNotMatch(html, /value="Inflate"/);
    if (locale === 'en-US') assert.doesNotMatch(html, /[\u3400-\u9fff]/u);
  }
});

test('local cloud-compatible tokens persist in password fields without appearing in endpoints / 本地兼容令牌保存在密码框且不进入地址', () => {
  setLocale('en-US');
  for (const type of ['AutoblowHttp', 'VacuGlideHttp']) {
    const input = stripProtocolDraft({ ...newProtocolDraft([], type), identifier: ' test-only-local-token ' });
    assert.equal(input.identifier, 'test-only-local-token');
    const html = render(ProtocolPanel, { config: { protocolInputs: [input] }, onSave() {} });
    assert.match(html, /type="password"[^>]*value="test-only-local-token"/);
    assert.doesNotMatch(html, /data-testid="protocol-endpoint">[^<]*test-only/);
    assert.match(html, /x-device-token/);
    assert.equal(stripProtocolDraft(makeProtocolDraft(input)).identifier, input.identifier);
  }
});

test('protocol readiness links have an accessible action label / 协议就绪提示具有可读操作名称', () => {
  setLocale('en-US');
  const html = render(Readiness, { online: true, mode: 'protocol', outputs: [{ id: 'udp', type: 'TCodeUdp' }], onNavigate() {} });
  assert.match(html, /id="control-next-step"[^>]*>Configure protocol inputs<\/button>/);
  assert.doesNotMatch(html, /<button[^>]*><\/button>/);
});


test('Intiface binding targets include actual mapped speed and direction axes without broadening defaults / Intiface连接目标包含已映射速度和方向轴', () => {
  assert.deepEqual(intifaceBindingAxes({ vibrationAxis: 'V1', intifaceFeatures: [
    { outputType: 'Rotate', sourceAxis: 'R0', directionAxis: 'A0' },
    { outputType: 'Temperature', sourceAxis: 'A2' },
    { outputType: 'Rotate', sourceAxis: 'R0', directionAxis: 'A0' },
  ] }), ['L0', 'V1', 'R0', 'A0', 'A2']);
  assert.deepEqual(intifaceBindingAxes(), ['L0', 'V0']);
  assert.deepEqual(intifaceBindingAxes({ vibrationAxis: 'L0' }), ['L0']);
  assert.deepEqual(intifaceBindingAxes({ intifaceFeatures: [{ outputType: 'Vibrate', sourceAxis: 'V2', directionAxis: 'A1' }] }), ['L0', 'V0', 'V2']);
});


test('vendor loop setting is available while prepared and paused without activating input / 已准备且暂停时可设置循环且不启用输入', () => {
  for (const locale of ['zh-CN', 'en-US']) {
    setLocale(locale);
    const output = { type: 'VacuGlide', device: { scriptUrl: 'https://example.com/script.csv' } };
    for (const status of [null, { supportsScriptLoop: false },
      { supportsScriptLoop: true, scriptPrepared: false },
      { supportsScriptLoop: true, scriptPrepared: true, scriptLoop: true, scriptPlaying: false },
      { supportsScriptLoop: true, scriptPrepared: true, scriptLoop: true, scriptPlaying: true }]) {
      const html = render(VendorScriptControls, { output, disabled: false, inputActive: false, status, onAction() {} });
      const toggle = html.match(/<input[^>]*type="checkbox"[^>]*>/)?.[0];
      if (!status?.supportsScriptLoop) assert.equal(toggle, undefined);
      else {
        assert.ok(toggle);
        assert.equal(toggle.includes('disabled=""'), !status.scriptPrepared || status.scriptPlaying === true);
        assert.equal(toggle.includes('checked=""'), status.scriptLoop === true);
      }
    }
  }
  setLocale('zh-CN');
});
