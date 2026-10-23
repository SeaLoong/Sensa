import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createOutputConfig, buildOutputDialogDraft, editConfiguration, buildOutputSummary } from '../../src/web/configuration.js';
import { buildSignalOutputDraft, makeOutputBinding, stripSignalOutputDraft, applyVrChatOutput, exportSignalPlan, parseSignalPlan, dglabBasicFrames, recordingDownloadUrl, recordingFiles } from '../../src/web/signal-outputs.js';
import { buildComputedDrafts, changeComputedOperation, computedDraftIncomplete, stripComputedDraft, computeComputedHash } from '../../src/web/computed-signals.js';
import { sanitizeStudio } from '../../src/web/preferences.js';
import { controlReadiness } from '../../src/web/control-workflow.js';
import { qrCodeImage } from '../../src/web/qr-code.js';

test('new output drafts carry independent signal bindings and survive the existing save transaction', () => {
  for (const type of ['OscParameter', 'Dglab', 'Recording', 'HttpJson', 'WebSocketJson', 'Mqtt', 'Midi']) {
    const output = createOutputConfig(type, { outputs: [] });
    assert.equal(output.enabled, false);
    assert.equal(output.signal.bindings[0].source.sourceMode, 'Manual');
    assert.equal(output.signal.bindings[0].source.oscPath, 'L0');
    const config = { outputs: [output] }, before = JSON.stringify(config);
    const draft = buildOutputDialogDraft(output.id, config, []);
    draft.signal.bindings[0].source = { sourceMode: 'Computed', oscPath: 'Mix', value: 0 };
    draft.signal.bindings[0].curve = 'SCurve';
    draft.signal.bindings[0].outputMax = type === 'Midi' ? 127 : .8;
    const saved = editConfiguration(config, { kind: 'output-save', id: output.id, draft });
    assert.equal(JSON.stringify(config), before);
    assert.equal(saved.outputs[0].signal.bindings[0].source.oscPath, 'Mix');
    assert.equal(saved.outputs[0].signal.bindings[0].curve, 'SCurve');
    draft.signal.bindings[0].source.oscPath = 'Changed';
    assert.equal(saved.outputs[0].signal.bindings[0].source.oscPath, 'Mix');
    assert.ok(buildOutputSummary(saved.outputs[0]));
    if (['HttpJson', 'WebSocketJson'].includes(type)) {
      assert.match(output.websocketAddress, type === 'HttpJson' ? /^http:\/\/127\.0\.0\.1:8080\/sensa$/ : /^ws:\/\/127\.0\.0\.1:8080\/sensa$/);
      draft.websocketAddress = '';
      const emptySaved = editConfiguration(config, { kind: 'output-save', id: output.id, draft });
      assert.equal(buildOutputDialogDraft(output.id, emptySaved, []).websocketAddress, '');
    }
  }
});

test('VRChat selection sets the explicit receiving endpoint without altering source or parameter types', () => {
  const output = createOutputConfig('OscParameter', { outputs: [] });
  output.host = '192.0.2.4'; output.port = 9020;
  output.signal.bindings[0].valueType = 'Bool';
  const changed = applyVrChatOutput(output, true);
  assert.equal(changed.host, '127.0.0.1'); assert.equal(changed.port, 9000);
  assert.equal(changed.signal.vrChat, true);
  assert.equal(changed.signal.bindings[0].valueType, 'Bool');
  assert.equal(output.host, '192.0.2.4');
  assert.equal(applyVrChatOutput(changed, false).signal.vrChat, false);
  const second = createOutputConfig('OscParameter', { outputs: [output] });
  assert.notEqual(second.signal.bindings[0].address, output.signal.bindings[0].address);
});

test('recording starts with a playable Funscript track while preserving saved signal-data formats', () => {
  const output = createOutputConfig('Recording', { outputs: [] });
  assert.equal(output.signal.recordingFormat, 'Funscript');
  assert.equal(output.signal.bindings[0].address, 'L0');
  assert.equal(output.signal.bindings[0].outputMax, 1);
  const next = makeOutputBinding(output.signal.bindings, 'Recording');
  assert.equal(next.address, 'Track1');
  assert.equal(makeOutputBinding([...output.signal.bindings, next], 'Recording').address, 'Track2');
  for (const format of ['Funscript', 'JsonLines', 'Csv']) {
    output.signal.recordingFormat = format;
    const config = { outputs: [output] }, draft = buildOutputDialogDraft(output.id, config, []);
    const saved = editConfiguration(config, { kind: 'output-save', id: output.id, draft });
    assert.equal(saved.outputs[0].signal.recordingFormat, format);
    assert.equal(saved.outputs[0].signal.bindings[0].address, 'L0');
  }
});

test('recording file metadata retains track, clip state and offsets without inventing completed files', () => {
  const files = [{ fileName: 'take.twist.funscript', signalId: 'R0', segment: 2, timeOffsetMs: 1200, completed: false, axis: 'R0' },
    { fileName: 'take.funscript', signalId: 'L0', segment: 1, timeOffsetMs: 0, completed: true, axis: 'L0' }];
  assert.deepEqual(recordingFiles({ recordingFiles: files }), files);
  assert.deepEqual(recordingFiles({ recordingFile: 'pending.funscript', recordingFiles: [] }), []);
  assert.deepEqual(recordingFiles({ recordingFile: 'data.jsonl' }), [{ fileName: 'data.jsonl' }]);
  assert.deepEqual(recordingFiles({ recordingFiles: [null, {}, { fileName: '' }] }), []);
  assert.equal(recordingFiles({ recordingFiles: files })[0].completed, false);
  assert.equal(recordingDownloadUrl('clip #1.funscript'), '/api/output/recordings/clip%20%231.funscript/download');
});

test('binding drafts retain zero values, independent waveform arrays and event modes, rejecting blank numeric settings', () => {
  const first = makeOutputBinding([], 'Dglab', { source: { sourceMode: 'Constant', value: 0 }, channel: 1, sendMode: 'OnEvent' });
  const second = makeOutputBinding([first], 'Dglab');
  assert.notEqual(first.id, second.id);
  const source = { maxIntensity: 0, waveformFrames: ['2828282823232323'], bindings: [first] };
  const draft = buildSignalOutputDraft('Dglab', source);
  draft.waveformFrames[0] = '2828282800000000';
  assert.equal(source.waveformFrames[0], '2828282823232323');
  const saved = stripSignalOutputDraft('Dglab', draft);
  assert.equal(saved.maxIntensity, 0);
  assert.equal(saved.bindings[0].source.value, 0);
  assert.equal(saved.bindings[0].channel, 1);
  assert.equal(saved.bindings[0].sendMode, 'OnEvent');
  draft.bindings[0].rateHz = '';
  assert.throws(() => stripSignalOutputDraft('Dglab', draft));
});

test('portable plans preserve the graph while importing targets disabled and never mutate the current configuration', () => {
  const output = createOutputConfig('Recording', { outputs: [] }); output.enabled = true;
  const config = { outputs: [output], signals: [{ sourceMode: 'Computed', oscPath: 'Mix' }],
    computedSignals: [{ id: 'Mix', operation: 'Sine', inputs: [], frequencyHz: 2 }], axisProfiles: [{ id: 'Custom', motion: { axisLimits: {} } }] };
  const before = JSON.stringify(config);
  const exported = exportSignalPlan(config), imported = parseSignalPlan(JSON.stringify(exported));
  assert.equal(imported.outputs[0].enabled, false);
  assert.equal(imported.computedSignals[0].frequencyHz, 2);
  assert.equal(imported.signals[0].oscPath, 'Mix');
  assert.equal(imported.axisProfiles[0].id, 'Custom');
  imported.axisProfiles[0].motion.axisLimits.L0 = { min: 2 };
  imported.outputs[0].name = 'Local';
  assert.equal(JSON.stringify(config), before);
  assert.throws(() => parseSignalPlan('{}'));
  assert.throws(() => parseSignalPlan('{'));
  assert.throws(() => parseSignalPlan(' '.repeat(2 * 1024 * 1024 + 1)));
  assert.throws(() => parseSignalPlan(JSON.stringify({ ...exported, axisProfiles: {} })));
  assert.equal(parseSignalPlan(JSON.stringify({ ...exported, axisProfiles: undefined })).axisProfiles, undefined);
});

test('plan imports reject malformed preview metadata and rows before rendering', () => {
  const plan = { kind: 'SensaSignalPlan', computedSignals: [], signals: [], outputs: [], axisProfiles: [] };
  for (const name of [{ text: 'Unexpected object' }, ['Unexpected array'], 42, true])
    assert.throws(() => parseSignalPlan(JSON.stringify({ ...plan, name })));
  for (const key of ['computedSignals', 'signals', 'outputs', 'axisProfiles']) {
    for (const row of [null, [], 'Unexpected row', { name: {} }, { id: [] }, { type: {} }])
      assert.throws(() => parseSignalPlan(JSON.stringify({ ...plan, [key]: [row] })), `${key}: ${JSON.stringify(row)}`);
  }
  assert.equal(parseSignalPlan(JSON.stringify({ ...plan, name: null, outputs: [{ id: 'osc', name: 'OSC', type: 'OscParameter' }] })).outputs[0].enabled, false);
});

test('plan imports enforce the same UTF-8 byte limit as uploaded files', () => {
  const plan = { kind: 'SensaSignalPlan', name: '中'.repeat(700000), computedSignals: [], signals: [], outputs: [] };
  const text = JSON.stringify(plan);
  assert.ok(text.length < 2 * 1024 * 1024);
  assert.throws(() => parseSignalPlan(text));
});

test('time-operation changes prepare valid input counts and preserve source and timing fields through serialization', () => {
  const draft = buildComputedDrafts([{ id: 'Mix', operation: 'Sum', inputs: [{ sourceMode: 'Script', oscPath: 'L0' }, { sourceMode: 'Manual', oscPath: 'V0' }] }])[0];
  const unary = { ...draft, ...changeComputedOperation(draft, 'Smooth'), timeMs: 600 };
  assert.equal(unary.inputs.length, 1);
  assert.equal(unary.inputs[0].sourceMode, 'Script');
  assert.notEqual(computeComputedHash([draft]), computeComputedHash([unary]));
  assert.equal(stripComputedDraft(unary).timeMs, 600);
  assert.equal(draft.inputs.length, 2);
  const sine = { ...draft, ...changeComputedOperation(draft, 'Sine') };
  assert.equal(sine.inputs.length, 0); assert.equal(computedDraftIncomplete(sine), false);
  sine.frequencyHz = ''; assert.equal(computedDraftIncomplete(sine), true);
  const ratio = changeComputedOperation({ inputs: [] }, 'Ratio'); assert.equal(ratio.inputs.length, 2);
  assert.equal(sanitizeStudio({ preferredInputTab: 'combined' }).preferredInputTab, 'combined');
});

test('independently generated COYOTE 3 effects satisfy public byte ranges and have bounded frame counts', () => {
  for (const preset of ['steady', 'fade', 'alternating']) {
    const frames = dglabBasicFrames(preset);
    assert.ok(frames.length > 0 && frames.length <= 100);
    for (const frame of frames) {
      assert.match(frame, /^[0-9A-F]{16}$/);
      const bytes = frame.match(/../g).map(value => Number.parseInt(value, 16));
      assert.ok(bytes.slice(0, 4).every(value => value >= 10 && value <= 240));
      assert.ok(bytes.slice(4).every(value => value >= 0 && value <= 100));
    }
  }
  assert.deepEqual(dglabBasicFrames('unknown'), []);
  const first = dglabBasicFrames('steady'); first[0] = 'mutated';
  assert.notEqual(dglabBasicFrames('steady')[0], 'mutated');
});

test('OSC output bindings satisfy readiness independently of legacy axis mappings', () => {
  const output = createOutputConfig('OscParameter', { outputs: [] }); output.enabled = true;
  const state = { online: true, runtime: { inputActive: true }, mode: 'osc', listening: true,
    mappings: [], outputs: [output], outputStates: [{ ...output, connected: true }] };
  assert.equal(controlReadiness(state).key, 'enabled');
  assert.equal(controlReadiness({ ...state, mode: 'combined' }).key, 'enabled');
});

test('local pairing QR graphics retain a quiet zone, scale to the URL and reject unsupported payload sizes', () => {
  for (const payload of ['https://www.dungeon-lab.cn/app-download.php#DGLAB-SG4/sensa', 'https://中继.example/配对?client=123']) {
    const image = qrCodeImage(payload);
    assert.ok(image.size >= 29);
    assert.match(image.path, /^(?:M\d+ \d+h1v1h-1z)+$/);
    const modules = [...image.path.matchAll(/M(\d+) (\d+)/g)].map(match => [Number(match[1]), Number(match[2])]);
    assert.ok(modules.every(([x, y]) => x >= 4 && y >= 4 && x < image.size - 4 && y < image.size - 4));
    assert.ok(modules.some(([x, y]) => x === 4 && y === 4));
  }
  assert.equal(qrCodeImage(''), null);
  assert.equal(qrCodeImage(null), null);
  assert.equal(qrCodeImage('x'.repeat(4097)), null);
});
