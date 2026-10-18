import { test } from 'node:test';
import assert from 'node:assert/strict';
import { manualCommandPayload, normalizeManualCommand, normalizeScriptSettingsState, normalizeScriptLoopRange, parseScriptTimecodeInput, clampScriptPositionMs, normalizeStoredScriptDefaults, shouldIgnoreScriptShortcutTarget } from '../../src/web/input-workflows.js';
import { loadStudio, saveStudio, sanitizeStudio } from '../../src/web/preferences.js';

test('manual input shares one finite command format for one-shot and continuous updates / 单次与连续手动输入使用统一有限数值命令', () => {
  const command = manualCommandPayload({ L0: 1200, L1: -1, V0: NaN, R0: 123.7 }, 'Interval', 5000);
  assert.equal(command.L0, 999); assert.equal(command.L1, 0); assert.equal(command.V0, 0); assert.equal(command.R0, 124);
  assert.equal(command.motionMode, 'Interval'); assert.equal(command.motionValue, 1000);
  assert.equal(Object.keys(command).length, 15);
  assert.equal(manualCommandPayload({}, 'Speed', -1).motionValue, 1);
  assert.equal(manualCommandPayload({}, 'unknown').motionMode, null);
  const snapshot = normalizeManualCommand({ l0: .6, V0: .5, L1: 234, A0: Infinity });
  assert.equal(snapshot.L0, 600); assert.equal(snapshot.V0, 500); assert.equal(snapshot.L1, 234); assert.equal(snapshot.A0, 0);
});

test('script snapshots preserve A-B markers and explicit clearing survives fallback preferences / 脚本快照保留 A-B 标记，显式清除不会被旧偏好恢复', () => {
  const snapshot = { durationMs: 10000, loop: true, speed: 2, loopStartMs: 2000, loopEndMs: 8000 };
  assert.deepEqual(normalizeScriptSettingsState(snapshot), { loop: true, speed: 2, loopStartMs: 2000, loopEndMs: 8000 });
  assert.deepEqual(normalizeScriptSettingsState({ ...snapshot, loopStartMs: null, loopEndMs: null }, snapshot), { loop: true, speed: 2, loopStartMs: null, loopEndMs: null });
  const patch = normalizeScriptSettingsState({ speed: 99 }, snapshot, 5000);
  assert.equal(patch.speed, 4); assert.equal(patch.loopEndMs, 5000); assert.equal(patch.loopStartMs, 2000);
  assert.deepEqual(normalizeScriptLoopRange(8000, -1, 5000), { startMs: 0, endMs: 5000, active: true });
  assert.equal(normalizeScriptLoopRange(1, 1, 100).active, false);
  assert.deepEqual(normalizeStoredScriptDefaults(snapshot), { loop: true, speed: 2 });
});

test('timecodes, seeking and shortcut focus follow the user editing workflow / 时间码、定位与快捷键焦点遵循编辑流程', () => {
  for (const [text, expected] of [['90', 90000], ['1:30', 90000], ['01:23.45', 83450], ['1:02:03.125', 3723125], ['50ms', 50], ['1.25s', 1250]]) {
    const position = parseScriptTimecodeInput(text);
    assert.equal(position, expected); assert.equal(clampScriptPositionMs(position, 10000), Math.min(expected, 10000));
  }
  for (const text of ['', '-1', 'invalid', '1:2:3:4']) assert.equal(parseScriptTimecodeInput(text), null);
  assert.equal(clampScriptPositionMs(NaN, 1000), 0);
  assert.equal(shouldIgnoreScriptShortcutTarget({ isContentEditable: true, closest: () => null }), true);
  assert.equal(shouldIgnoreScriptShortcutTarget({ closest: () => ({}) }), true);
  assert.equal(shouldIgnoreScriptShortcutTarget({ closest: () => null }), false);
});

test('browser preferences preserve validated defaults when storage is denied or corrupt / 浏览器存储拒绝或损坏时仍保留有效默认偏好', () => {
  const values = new Map(), storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  const input = { preferredInputTab: 'script', scriptDefaults: { loop: true, speed: 2, loopStartMs: 400 }, ignored: true };
  assert.equal(saveStudio(input, storage), true);
  assert.deepEqual(loadStudio(storage), { preferredInputTab: 'script', scriptDefaults: { loop: true, speed: 2 } });
  assert.deepEqual(sanitizeStudio({ preferredInputTab: 'unknown', scriptDefaults: { speed: 'bad' } }), { preferredInputTab: 'manual', scriptDefaults: { loop: false, speed: 1 } });
  const denied = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  assert.equal(loadStudio(denied), null); assert.equal(saveStudio(input, denied), false);
  assert.equal(loadStudio({ getItem: () => '{' }), null);
});
