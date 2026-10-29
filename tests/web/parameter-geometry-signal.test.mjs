import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const sandbox = vm.createContext({});
vm.runInContext(readFileSync(new URL('../../docs/assets/parameter-geometry-signal.js', import.meta.url), 'utf8'), sandbox);
const signals = sandbox.SensaParameterSignals;
const plain = value => JSON.parse(JSON.stringify(value));

test('signal calibration preserves the range, clipping and inversion / 信号校准保留量程、截断与反转', () => {
  assert.ok(Math.abs(signals.mapValue(.3, { min: .2, max: .4 }) - .5) < 1e-12);
  assert.equal(signals.mapValue(-7, { min: -.5, max: .5 }), 0);
  assert.equal(signals.mapValue(7, { min: -.5, max: .5 }), 1);
  assert.equal(signals.mapValue(.25, { min: 0, max: 1, invert: true }), .75);
  for (const value of [null, undefined, NaN, Infinity, -Infinity, '0.3']) assert.equal(signals.mapValue(value), null);
  for (const bounds of [{ min: 1, max: 1 }, { min: 2, max: 1 }, { min: NaN, max: 1 }]) assert.equal(signals.mapValue(.5, bounds), null);
});

test('parameter search spans names and groups, ranks an exact name and treats tokens literally / 参数跨名称与组搜索并优先精确匹配', () => {
  const entries = [
    { name: 'Proximity_SenderVelocityX', path: 'Sensa/Contact/Example', title: '相对速度' },
    { name: 'X', path: 'Sensa/Shader/42/X', title: '位置', scenarioTitle: 'Shader' },
    { name: 'Sample', path: 'Sensa/SPS/Example/Sample', title: '活动' },
  ];
  assert.equal(signals.searchParameters(entries, ' X ')[0].name, 'X');
  assert.equal(signals.searchParameters(entries, 'contact 速度')[0].name, 'Proximity_SenderVelocityX');
  assert.equal(signals.searchParameters(entries, 'Ｓｈａｄｅｒ')[0].name, 'X');
  assert.deepEqual(plain(signals.searchParameters(entries, '.*')), []);
  assert.deepEqual(plain(signals.searchParameters(entries, '')), []);
  assert.equal(signals.searchParameters(entries, 'sensa', 2).length, 2);
});

test('recording starts at the actual nonzero target, quantizes milliseconds and exports a copy / 录制从实际非零目标开始并保留毫秒时序', () => {
  const recorder = signals.createRecording();
  assert.equal(recorder.start(1500.5, .8), true);
  assert.equal(recorder.sample(1550.1, .25), true);
  assert.equal(recorder.sample(1550.2, .3), true);
  recorder.stop(2000.5, .4);
  assert.deepEqual(plain(recorder.export().actions), [{ at: 0, pos: 80 }, { at: 50, pos: 30 }, { at: 500, pos: 40 }]);
  const mutable = recorder.export(); mutable.actions[0].pos = 1;
  assert.equal(recorder.export().actions[0].pos, 80);
  assert.equal(recorder.snapshot().active, false);
  assert.equal(recorder.sample(2100, .9), false);
});

test('recording stops on invalid or backwards time without fabricating a zero / 无效样本或倒退时间结束录制且不伪造零值', () => {
  for (const [now, value] of [[99, .4], [150, null], [150, NaN], [150, 2]]) {
    const recorder = signals.createRecording(); recorder.start(100, .6);
    assert.equal(recorder.sample(now, value), false);
    assert.equal(recorder.snapshot().active, false);
    assert.deepEqual(plain(recorder.export().actions), [{ at: 0, pos: 60 }]);
  }
  const recorder = signals.createRecording(); recorder.start(100, .6); recorder.sample(150, .7);
  assert.equal(recorder.sample(140, .8), false);
  assert.equal(recorder.snapshot().reason, 'clock-order');
});

test('recording bounds end a long capture at its last representable point / 长录制在表示范围边界结束', () => {
  const recorder = signals.createRecording({ maxDurationMs: 100, maxSamples: 3 });
  assert.equal(recorder.start(0, 0), true); recorder.sample(50, .5); recorder.sample(180, 1);
  assert.deepEqual(plain(recorder.export().actions), [{ at: 0, pos: 0 }, { at: 50, pos: 50 }, { at: 100, pos: 100 }]);
  assert.equal(recorder.snapshot().reason, 'duration-limit');
  recorder.clear(); assert.equal(recorder.snapshot().sampleCount, 0);
  recorder.start(500, .1); recorder.sample(510, .2); recorder.sample(520, .3);
  assert.equal(recorder.sample(530, .4), false);
  assert.equal(recorder.snapshot().reason, 'sample-limit');
  assert.deepEqual(plain(recorder.export().actions), [{ at: 0, pos: 10 }, { at: 10, pos: 20 }, { at: 20, pos: 30 }]);
  assert.equal(recorder.start(NaN, 0), false);
});

test('history retains invalid gaps and only the most recent bounded interval / 轨迹保留中断并只保留最近区间', () => {
  let history = [];
  for (const point of [{ at: 0, value: .1 }, { at: 50, value: null }, { at: 100, value: .9 }]) history = signals.appendHistory(history, point, 100, 10);
  assert.deepEqual(plain(history), [{ at: 0, value: .1 }, { at: 50, value: null }, { at: 100, value: .9 }]);
  history = signals.appendHistory(history, { at: 100, value: .7 }, 100, 10);
  assert.equal(history.length, 3); assert.equal(history[2].value, .7);
  history = signals.appendHistory(history, { at: 200, value: 1 }, 100, 2);
  assert.deepEqual(plain(history), [{ at: 100, value: .7 }, { at: 200, value: 1 }]);
  assert.throws(() => signals.appendHistory(history, { at: 190, value: .4 }), /backwards/);
});

test('live signal messages contain one explicit normalized axis and a monotonic sequence / 实时消息包含明确归一化轴与序号', () => {
  const session = 'abcdef0123456789abcdef0123456789';
  assert.deepEqual(plain(signals.makeSignal(session, 1, 'V0', .4, 12345)), {
    type: 'sensa.signal.v1', session, sequence: 1, axes: { V0: .4 }, timestamp: 12345,
  });
  for (const [token, sequence, axis, value] of [['short', 1, 'V0', .5], [session, 0, 'V0', .5], [session, 1, 'invalid', .5], [session, 1, 'L0', NaN], [session, 1, 'L0', 1.01]])
    assert.throws(() => signals.makeSignal(token, sequence, axis, value, 1), /Invalid signal/);
});


test('movement examples preserve dimensions and independent sampling state / 移动示例保留尺寸和独立采样状态', () => {
  const original = { scenario: 'shader', x: -.1, y: 1, z: -.2, L: .4, valid: false, frame: 99, ageMs: 1200 };
  const near = signals.movementPreset(original, 'centered');
  assert.deepEqual(plain(near), { ...original, x: 0, z: .02, yaw: 0 });
  assert.equal(original.x, -.1);
  assert.equal(signals.movementPreset(original, 'far').z, 2.2);
  assert.equal(signals.movementPreset({ ...original, scenario: 'zone' }, 'far').z, 1.1);
  assert.equal(signals.movementPreset({ ...original, scenario: 'socket-frot' }, 'centered').z, .05);
  assert.throws(() => signals.movementPreset(original, 'unknown'), /Unknown movement/);
});
