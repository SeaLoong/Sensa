import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchesOscPathPattern, getLatestOscPreviewEntry, buildOscPathSuggestions, rankPreview, parameterMeaning, readPinnedPaths, posePreviewEntry } from '../../src/web/osc-preview.js';

test('legacy, nested and alias patterns agree with backend', () => {
  for (const path of ['OGB/Orf/Pussy/PenOthers', 'OGB/Orf/Pussy/Main/PenOthers'])
    assert.equal(matchesOscPathPattern('OGB/Orf/**/PenOthers', path), true);
  assert.equal(matchesOscPathPattern('A/*;B/**', 'B/x/y'), true);
  assert.equal(matchesOscPathPattern('A/**', 'A'), true);
});

test('preview never mixes sources', () => {
  const entries = [{path:'A/x',sourceKey:'a',timestampMs:1},{path:'A/x',sourceKey:'b',timestampMs:2}];
  assert.equal(getLatestOscPreviewEntry(entries, 'A/*', 'a').sourceKey, 'a');
  assert.equal(getLatestOscPreviewEntry(entries, 'A/*', 'missing'), null);
});

test('known parameters rank before high frequency FT', () => {
  const result = buildOscPathSuggestions([{path:'v2/JawOpen'}, {path:'OGB/Orf/A/PenOthers'}]);
  assert.equal(result[0], 'OGB/Orf/A/PenOthers');
});

test('FT flood cannot hide relevant parameters; explicit mappings remain visible', () => {
  const entries = Array.from({length: 300}, (_, i) => ({path:`Face/v2/JawOpen${i}`,timestampMs:1000+i,classification:{isFaceTracking:true,relevance:0}}));
  entries.push({path:'OGB/Orf/A/PenOthers',timestampMs:1,classification:{isFaceTracking:false,relevance:100}});
  entries.push({path:'Custom/PenOthres',classification:{isFaceTracking:false,relevance:40}});
  const visible = rankPreview(entries);
  assert.deepEqual(visible.map(e => e.path), ['OGB/Orf/A/PenOthers','Custom/PenOthres']);
  assert.equal(rankPreview(entries, [], {showFaceTracking:true}).length, 302);
  assert.equal(rankPreview(entries, [{oscPath:'Face/v2/JawOpen0'}])[0].path, 'Face/v2/JawOpen0');
  assert.equal(rankPreview(entries, [], {search:'Custom'})[0].path, 'Custom/PenOthres');
});

test('pins, semantic filters and bounded persisted preferences', () => {
  const entries = [{path:'Face/v2/JawOpen',classification:{isFaceTracking:true,relevance:0}}, {path:'Sensa/Pose/v1/Main/Others/Root/A0',classification:{relevance:100}}, {path:'Other'}];
  assert.equal(rankPreview(entries, [], {pinned:['Face/v2/JawOpen']})[0].path, 'Face/v2/JawOpen');
  assert.equal(rankPreview(entries, [], {category:'pose'}).length, 1);
  assert.equal(rankPreview(entries, [{oscPath:'Other'}], {category:'mapped'})[0].path, 'Other');
  assert.match(parameterMeaning('OGB/Orf/Main/PenOthers'), /不是通用的位置坐标/);
  assert.match(parameterMeaning(entries[1].path), /不能直接当作深度/);
  assert.deepEqual(readPinnedPaths({getItem:() => '{broken'}), []);
  assert.equal(readPinnedPaths({getItem:() => JSON.stringify(Array(100).fill('a'))}).length, 64);
});

test('pose mapping preview uses decoded depth and refuses mixed sources', () => {
  const pose = {key:'a',sourceKey:'a',prefix:'Sensa/Pose/v1/Main/Others',valid:true,engaged:true,depth:.55,intersection:{x:.02,y:0},yaw:20,pitch:0,roll:0,sampleCount:24};
  const signal = {oscPath:'Sensa/Pose/v1/*/*/**',poseMetric:'Depth'};
  assert.equal(posePreviewEntry([pose], signal).numericValue, .55);
  assert.equal(posePreviewEntry([pose,{...pose,key:'b',sourceKey:'b'}], signal).numericValue, undefined);
  assert.equal(posePreviewEntry([{...pose,engaged:false,reason:'未进入'}], signal).value, '未进入');
});

test('single-sided root samples are discoverable but explain their missing geometry', () => {
  const path = 'Sensa/SpsRoot/v1/Main/Others/Root/A0';
  assert.equal(rankPreview([{path}], [], {category:'pose'}).length, 1);
  assert.match(parameterMeaning(path), /不能测尖端、朝向或行程/);
  assert.match(parameterMeaning('OGB/Orf/Main/PenOthersNewTip'), /并非真实尖端/);
});
