import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchesOscPathPattern, getLatestOscPreviewEntry, buildOscPathSuggestions, rankPreview } from '../../src/web/osc-preview.js';

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
