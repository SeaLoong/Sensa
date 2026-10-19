import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pointCalibrationProgress, capturePointEndpoint, calibratedPointDraft, pointPreviewEntry, matchesOscPathPattern, getLatestOscPreviewEntry, buildOscPathSuggestions, rankPreview, parameterMeaning, readPinnedPaths, posePreviewEntry, probePresentation } from '../../src/web/osc-preview.js';
import { oscWorkflowHints } from '../../src/web/osc-workflow.js';
import { editConfiguration, buildSignalDrafts } from '../../src/web/configuration.js';
import { computeSignalPreviewOutput, formatPreviewTimestamp } from '../../src/web/osc-workspace.js';
import { getLocale, setLocale } from '../../src/web/i18n.js';

test('OSC times keep a complete fixed-width 24-hour shape across locales / OSC 时间在双语中保持完整定长24小时格式', () => {
  const previous = getLocale();
  try {
    for (const locale of ['zh-CN', 'en-US']) {
      setLocale(locale);
      for (const [hour, minute, second, expected] of [[0, 0, 0, '00:00:00'], [8, 11, 11, '08:11:11'], [18, 22, 22, '18:22:22'], [23, 59, 59, '23:59:59']]) {
        assert.equal(formatPreviewTimestamp(new Date(2026, 9, 19, hour, minute, second).getTime()), expected);
      }
      assert.equal(formatPreviewTimestamp(0), '—');
      assert.equal(formatPreviewTimestamp(NaN), '—');
    }
  } finally { setLocale(previous); }
});

const point = (z, options = {}) => ({ key: 'point', prefix: 'Sensa/Handle/v1/LabHandle/Self', sourceKey: 'local', kind: 'Handle', valid: true, position: { x: .02, y: 0, z }, sampleCount: 4, ...options });
const quick = [{ oscPath: 'CI/Depth', role: 'Depth' }, { oscPath: 'CI/Active', role: 'GateEnable' }];

test('PB calibration replaces the previous gate, persists a reverse range and previews motion / PB 校准替换旧门控、保存反向量程并预览运动', () => {
  const zero = capturePointEndpoint(point(.15), 'Z'), full = capturePointEndpoint(point(.05), 'Z');
  const { draft } = calibratedPointDraft(point(.1), 'Z', zero, full);
  assert.equal(draft.invertDirection, true);
  const drafts = buildSignalDrafts([draft]), before = oscWorkflowHints({ mappings: quick, drafts: [...quick, draft], dirty: true, mode: 'osc', listening: true });
  assert.ok(before.some(h => h.key === 'draft'));
  const config = editConfiguration({ signals: quick }, { kind: 'mappings', drafts });
  const hints = oscWorkflowHints({ mappings: config.signals, runtime: { inputActive: false }, mode: 'osc', listening: true });
  assert.ok(hints.some(h => h.key === 'inactive')); assert.ok(!hints.some(h => ['mixed-tests', 'draft', 'geometry', 'gate'].includes(h.key)));
  const preview = pointPreviewEntry([point(.1)], config.signals[0], 'local');
  assert.equal(preview.numericValue, .1);
  assert.ok(Math.abs(computeSignalPreviewOutput(config.signals[0], preview.numericValue).normalized - .5) < 1e-9);
  assert.ok(Math.abs(pointCalibrationProgress(point(.1), 'Z', zero, full).percent - 50) < 1e-8);
  assert.deepEqual(pointCalibrationProgress(point(0), 'Z', zero, full), { percent: 100, outside: true });
});

test('calibration rejects lost samples and changed identity, source, axis or insufficient travel / 校准拒绝丢失采样及对象、来源、测量轴变化或不足行程', () => {
  const zero = capturePointEndpoint(point(.05), 'Z'), full = capturePointEndpoint(point(.15), 'Z');
  for (const changed of [point(.1, { key: 'other' }), point(.1, { sourceKey: 'other' }), point(.1, { prefix: 'other' })]) {
    assert.equal(calibratedPointDraft(changed, 'Z', zero, full).draft, undefined);
    assert.equal(pointCalibrationProgress(changed, 'Z', zero, full), null);
  }
  assert.equal(calibratedPointDraft(point(.1), 'X', zero, full).draft, undefined);
  assert.equal(calibratedPointDraft(point(.1), 'Z', zero, zero).draft, undefined);
  assert.equal(calibratedPointDraft(point(.1), 'Z', null, full).draft, undefined);
  for (const invalid of [point(.1, { valid: false }), point(.1, { kind: 'SharedRoot' }), point(NaN)]) {
    assert.equal(capturePointEndpoint(invalid, 'Z'), null); assert.equal(pointCalibrationProgress(invalid, 'Z', zero, full), null);
  }
  // Previously collected endpoints remain a valid draft after the current sample expires.
  // 当前采样过期不会破坏已采集且身份一致的校准草稿。
  assert.ok(calibratedPointDraft(point(.1, { valid: false }), 'Z', zero, full).draft);
});

test('pose and local-point previews use solved metrics and reject ambiguous sources / 位姿与本地点预览使用解算指标并拒绝来源歧义', () => {
  const pose = { key: 'a', sourceKey: 'a', prefix: 'Sensa/Pose/v1/Main/Others', valid: true, engaged: true, depth: .55, intersection: { x: .02, y: 0 }, yaw: 20, pitch: 0, roll: 0, sampleCount: 24 };
  const signal = { oscPath: 'Sensa/Pose/v1/*/*/**', poseMetric: 'Depth' };
  assert.equal(posePreviewEntry([pose], signal).numericValue, .55);
  assert.equal(posePreviewEntry([pose, { ...pose, key: 'b', sourceKey: 'b' }], signal).numericValue, undefined);
  assert.equal(posePreviewEntry([{ ...pose, engaged: false, reason: 'lost' }], signal).value, 'lost');
  const local = point(.1), mapped = { oscPath: local.prefix + '/**', pointMetric: 'X' };
  assert.equal(pointPreviewEntry([local], mapped).numericValue, .02);
  assert.equal(pointPreviewEntry([local, { ...local, sourceKey: 'remote' }], mapped).numericValue, undefined);
  assert.equal(pointPreviewEntry([local, { ...local, sourceKey: 'remote' }], mapped, 'local').numericValue, .02);
  assert.equal(pointPreviewEntry([local], { oscPath: local.prefix + '/Root/A7' }).numericValue, undefined);
  assert.equal(pointPreviewEntry([{ ...local, valid: false, reason: 'lost' }], mapped).value, 'lost');
});

test('parameter discovery keeps mapped and pinned FT visible without hiding spatial inputs / 参数发现保留已映射和固定的 FT，并显示空间输入', () => {
  const entries = Array.from({ length: 300 }, (_, i) => ({ path: 'FT/v2/JawOpen' + i, classification: { relevance: 0 } }));
  entries.push({ path: 'OGB/Orf/Main/PenOthers', classification: { relevance: 100 } }, { path: 'Sensa/Point/v1/Bone/Self/Root/A0', classification: { relevance: 80 } }, { path: 'Custom' });
  const signals = [{ oscPath: 'FT/v2/JawOpen0' }];
  assert.equal(rankPreview(entries).length, 3);
  assert.equal(rankPreview(entries, [], { showFaceTracking: true }).length, 303);
  assert.equal(rankPreview(entries, signals)[0].path, 'FT/v2/JawOpen0');
  assert.equal(rankPreview(entries, [], { pinned: ['FT/v2/JawOpen1'] })[0].path, 'FT/v2/JawOpen1');
  assert.equal(rankPreview(entries, [], { category: 'pose' }).length, 1);
  const shaderEntries = [{ path: 'Sensa/Shader/42/Z' }, { path: 'Sensa/Shader/42/Frame' }, { path: 'Custom' }];
  assert.deepEqual(rankPreview(shaderEntries, [], { category: 'pose' }).map(entry => entry.path), ['Sensa/Shader/42/Frame', 'Sensa/Shader/42/Z']);
  assert.equal(rankPreview(entries, signals, { category: 'mapped' }).length, 1);
  assert.equal(rankPreview(entries, [], { search: 'custom' })[0].path, 'Custom');
  assert.equal(buildOscPathSuggestions([{ path: 'v2/JawOpen' }, { path: 'OGB/Orf/Main/PenOthers' }])[0], 'OGB/Orf/Main/PenOthers');
  assert.deepEqual(readPinnedPaths({ getItem: () => '{' }), []);
  assert.equal(readPinnedPaths({ getItem: () => JSON.stringify(Array(100).fill('a')) }).length, 64);
});

test('FT prefixes hide unknown parameters without depending on shape names or server hints / FT 前缀隐藏未知参数，无需形状名或服务端提示', () => {
  const hidden = ['FT/TrackingEnabled', 'FT/v9/UnknownControl', '/avatar/parameters/FT/CustomControl', 'avatar/parameters/FT/CustomControl', 'v2/UnknownControl'];
  const visible = ['FTools/Depth', 'Custom/FT/Depth', 'JawOpen', 'Face/v2/EyeLeftX', 'OGB/Orf/Main/PenOthersNewRoot'];
  const entries = [...hidden, ...visible].map(path => ({ path, classification: { isFaceTracking: visible.includes(path) } }));
  assert.deepEqual(rankPreview(entries).map(entry => entry.path).sort(), [...visible].sort());
  assert.equal(rankPreview(entries, [], { showFaceTracking: true }).length, entries.length);
  assert.ok(rankPreview(entries, [{ oscPath: 'FT/TrackingEnabled' }]).some(entry => entry.path === hidden[0]));
  assert.ok(rankPreview(entries, [], { pinned: [hidden[1]] }).some(entry => entry.path === hidden[1]));
});

test('wildcard aliases and selected-source preview match only the intended samples / 通配别名与指定来源预览仅匹配预期采样', () => {
  for (const path of ['OGB/Orf/Pussy/PenOthers', 'OGB/Orf/Pussy/Main/PenOthers']) assert.equal(matchesOscPathPattern('OGB/Orf/**/PenOthers', path), true);
  assert.equal(matchesOscPathPattern('A/*;B/**', 'B/x/y'), true);
  assert.equal(matchesOscPathPattern('A/**', 'A'), true);
  assert.equal(matchesOscPathPattern('A/*', 'A/x/y'), false);
  assert.equal(matchesOscPathPattern(Array(66).fill('**').join('/'), 'A'), false);
  const entries = [{ path: 'A/x', sourceKey: 'a', timestampMs: 1 }, { path: 'A/x', sourceKey: 'b', timestampMs: 2 }];
  assert.equal(getLatestOscPreviewEntry(entries, 'A/*', 'a').sourceKey, 'a');
  assert.equal(getLatestOscPreviewEntry(entries, 'A/*', 'missing'), null);
  assert.equal(getLatestOscPreviewEntry(entries, 'A/*').sourceKey, 'b');
});

test('workflow hints distinguish page selection, saved gates, emergency and invalid geometry / 流程提示区分页签选择、已保存门控、急停和无效几何', () => {
  const base = { mappings: quick, runtime: { inputActive: true }, mode: 'osc', listening: true };
  assert.deepEqual(oscWorkflowHints(base), []);
  const hints = oscWorkflowHints({ ...base, mode: 'manual', runtime: { inputActive: true, gateClosed: true } });
  assert.ok(hints.some(h => h.key === 'mode'));
  assert.ok(hints.some(h => h.key === 'gate' && h.text.includes('CI/Active')));
  const blocked = oscWorkflowHints({ ...base, runtime: { isEmergency: true, inputActive: true, poseBlocked: true } });
  assert.ok(blocked.some(h => h.key === 'emergency')); assert.ok(blocked.some(h => h.key === 'geometry'));
  assert.ok(oscWorkflowHints({ listening: false }).some(h => h.key === 'receiver'));
});

test('probe labels and signal explanations distinguish diagnostic geometry from output axes / 探针标签与信号说明区分诊断几何和输出轴', () => {
  assert.equal(probePresentation('Sensa/Handle/v1/LabHandle/Self/Root/A0').label, '定位探针 P1');
  assert.equal(probePresentation('Sensa/Pose/v1/Socket/Others/Tip/A7').label, '定位探针 C8');
  assert.equal(probePresentation('/avatar/parameters/Sensa/Point/v1/Point/Self/Root/A3').label, '定位探针 P4');
  assert.equal(probePresentation('Sensa/Point/v1/Point/Self/Root/A4'), null);
  for (const path of ['A0', 'TCode/A0', 'OGB/Orf/Test/A0', 'Custom/Root/A0']) assert.equal(probePresentation(path), null);
  for (let index = 0; index < 4; index++) assert.equal(probePresentation(`Sensa/SPS/Main/P${index}`).label, `固定锚点 P${index}`);
  assert.equal(probePresentation('Sensa/SPS/Main/P4'), null);
  assert.equal(probePresentation('Sensa/SpsRoot/v1/Main/Self/Root/A0'), null);
  const explanations = [['Sensa/Handle/v1/LabHandle/Self/Root/A0', /不是 TCode/], ['Sensa/Pose/v1/Main/Others/Root/A0', /不能直接当作深度/], ['Sensa/SPS/Main/P0', /不能测尖端或朝向/], ['OGB/Orf/Main/PenOthersNewTip', /并非真实尖端/], ['OGB/Orf/Main/PenOthers', /不是通用的位置坐标/]];
  for (const [path, expected] of explanations) assert.match(parameterMeaning(path), expected);
});

test('fixed and shader roots share calibration only for a valid self producer / 固定根与Shader根只为有效自身生产端提供校准', () => {
  for (const kind of ['SpsRoot', 'ShaderRoot']) {
    const root = z => point(z, { key: kind, prefix: kind === 'SpsRoot' ? 'Sensa/SPS/Socket' : 'Sensa/Shader/42',
      kind, party: 'Self', isMappablePoint: true, expectedSampleCount: kind === 'ShaderRoot' ? 3 : 4,
      coordinateFrame: 'AvatarRootLocal' });
    const zero = capturePointEndpoint(root(.05), 'Z'), full = capturePointEndpoint(root(.15), 'Z');
    const { draft } = calibratedPointDraft(root(.1), 'Z', zero, full);
    assert.equal(draft.sourceMode, 'SensaPoint');
    assert.equal(draft.oscPath, root(.1).prefix + '/**');
    assert.equal(pointPreviewEntry([root(.1)], draft).numericValue, .1);
    assert.equal(Math.round(pointCalibrationProgress(root(.1), 'Z', zero, full).percent), 50);
    assert.equal(capturePointEndpoint({ ...root(.1), party: 'Others', isMappablePoint: false }, 'Z'), null);
    assert.equal(capturePointEndpoint({ ...root(.1), valid: false }, 'Z'), null);
  }
});

test('parameter dictionary separates proximity, liveness, native coordinates and capabilities / 参数字典区分近接、活性、原生坐标与能力标记', () => {
  for (const [path, expected] of [
    ['Sensa/SPS/Main/Sample', /Sample=0.*1\/32/],
    ['Sensa/SPS/Main/P1', /d=R×\(1−p\)\+r/],
    ['Sensa/Shader/42/Frame', /16 位循环序号/],
    ['Sensa/Shader/42/Valid', /单独置 1 不能恢复/],
    ['Sensa/Shader/42/X', /Avatar 根局部坐标/],
    ['Sensa/Diagnostics/Shader/0/X', /不产生可映射坐标/],
    ['VFH/Zone/Touch/Body/Chest/Others', /不需要 Close/],
    ['VFH/Version/10', /不是距离/],
    ['OGB/Orf/Main/AngleXRaw', /自定义参数/],
    ['Custom/PenOthersNewTip', /自定义参数/],
  ]) assert.match(parameterMeaning(path), expected);
});
