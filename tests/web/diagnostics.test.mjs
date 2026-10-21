import { test } from 'node:test';
import assert from 'node:assert/strict';
import { outputPreview } from '../../src/web/output-preview.js';
import { createLogNormalizer, normalizeLogs, getTCodeDeviceInfoView } from '../../src/web/diagnostics.js';
import { setLocale } from '../../src/web/i18n.js';

// These diagnostic expectations explicitly use Chinese. / 这些诊断预期明确使用中文目录。
setLocale('zh-CN');

test('output telemetry follows connection and stop lifecycle, never inventing targets / 输出遥测遵循连接与停止生命周期，不生成虚构目标', () => {
  const telemetry = { state: 'sent', lastSentAtUtc: '2026-10-18T00:00:00Z', targets: [
    { key: 'R0', value: 250, maximum: 999 }, { key: 'L0', value: 600, maximum: 999 }, { key: 'V0', value: NaN, maximum: 999 }, { key: 'V1', value: 1, maximum: 0 },
  ] };
  const connected = { enabled: true, connected: true, telemetry };
  assert.equal(outputPreview(connected).phase, 'sent');
  assert.deepEqual(outputPreview(connected).targets.map(target => target.key), ['L0', 'R0']);
  assert.ok(Math.abs(outputPreview(connected).targets[0].percent - 60.06) < .01);
  assert.equal(outputPreview({ ...connected, connected: false }).label, '未连接');
  assert.equal(outputPreview({ ...connected, enabled: false }).label, '已禁用');
  assert.equal(outputPreview({ ...connected, telemetry: { state: 'stopped', targets: [] } }).label, '已请求停止');
  assert.deepEqual(outputPreview({ enabled: true, connected: true }).targets, []);
  assert.equal(outputPreview(undefined).phase, 'disabled');
});

test('diagnostic logs normalize wire formats and decode axis trace alongside ordinary logs / 诊断日志统一传输格式，并同时解读轴跟踪和普通日志', () => {
  const logs = normalizeLogs(['plain', null, {}, { Message: 'AXIS L0 stage=emit input=0.5 output=600 invert=true cmd=I durationMs=100', Level: 'WARNING', Category: ' Axis ' }]);
  assert.equal(logs.length, 2); assert.equal(logs[0].axisTrace, undefined);
  assert.equal(logs[1].level, 'warning'); assert.equal(logs[1].category, 'Axis');
  assert.equal(logs[1].axisTrace.axis, 'L0'); assert.equal(logs[1].axisTrace.out, 600);
  assert.equal(logs[1].axisTrace.invert, true); assert.equal(logs[1].axisTrace.durationMs, 100);
  assert.equal(logs[1].axisTrace.prevOut, null);
  assert.deepEqual(normalizeLogs(null), []);
});

test('firmware diagnostics preserve a failed query without claiming a disconnected device is current / 固件诊断保留查询失败信息，断线时不宣称设备信息为当前状态', () => {
  const info = { firmwareVersion: 'CI firmware', tcodeVersion: '0.4', axisDescriptors: [' L0 ', ''], status: 'query-failed: timeout' };
  const failed = getTCodeDeviceInfoView(info, true);
  assert.equal(failed.statusTone, 'error'); assert.equal(failed.errorMessage, 'timeout');
  assert.equal(failed.firmwareVersionText, 'CI firmware'); assert.deepEqual(failed.axisDescriptors, ['L0']);
  const disconnected = getTCodeDeviceInfoView(info, false);
  assert.equal(disconnected.statusText, '未连接'); assert.equal(disconnected.firmwareVersionText, '—');
  assert.equal(getTCodeDeviceInfoView(null, true).statusTone, 'warning');
});

test('repeated wire snapshots reuse log parsing without hiding new or changed entries', () => {
  const normalize = createLogNormalizer();
  const wire = Array.from({ length: 300 }, (_, index) => ({
    Message: `AXIS L0 stage=emit input=${index / 300} output=${index} cmd=I`,
    Timestamp: `sample-${index}`, Level: 'DEBUG', Category: ' Axis ',
  }));
  const first = normalize(wire);
  assert.deepEqual(first, normalizeLogs(wire));
  assert.strictEqual(normalize(structuredClone(wire)), first);
  const appended = normalize([...structuredClone(wire).slice(1), { message: 'new', level: 'error' }]);
  assert.equal(appended.length, 300);
  assert.strictEqual(appended[0], first[1]);
  assert.equal(appended.at(-1).message, 'new');
  const changed = [...wire];
  changed[1] = { ...wire[1], Level: 'ERROR', Timestamp: 'changed', Category: 'Other' };
  const result = normalize(changed);
  assert.deepEqual(result, normalizeLogs(changed));
  assert.notStrictEqual(result[1], first[1]);
  assert.strictEqual(result[2], first[2]);
  assert.deepEqual(normalize(null), []);
  assert.notStrictEqual(normalize(wire)[0], first[0], 'Clearing releases previous snapshot rows');
});

test('log reuse keeps duplicate messages with distinct metadata and order', () => {
  const normalize = createLogNormalizer();
  const wire = ['repeat', { message: 'repeat', level: 'info', timestamp: 'a' },
    { message: 'repeat', level: 'error', timestamp: 'b' }, '', null, {}];
  const first = normalize(wire);
  assert.deepEqual(first, normalizeLogs(wire));
  assert.strictEqual(normalize(structuredClone(wire)), first);
  const reversed = normalize([...wire].reverse());
  assert.deepEqual(reversed, normalizeLogs([...wire].reverse()));
  assert.strictEqual(reversed[1], first[2]);
});
