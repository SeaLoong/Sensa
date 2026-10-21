import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mappingPathSuggestions, MAPPING_PATH_SUGGESTION_LIMIT } from '../../src/web/mapping-path-suggestions.js';

test('inactive mapping fields do not inspect a large path catalog / 未编辑的映射不扫描大参数目录', () => {
  const catalog = new Proxy([], { get() { throw new Error('Inactive fields must not read the catalog'); } });
  assert.deepEqual(mappingPathSuggestions(catalog, ''), []);
});

test('active suggestions stay bounded while narrowing can reach any catalog path / 建议数量固定，输入片段可查到目录尾部路径', () => {
  const catalog = Array.from({ length: 8192 }, (_, index) => `Avatar/Parameter/${String(index).padStart(4, '0')}`);
  const initial = mappingPathSuggestions(catalog, '', { focused: true });
  assert.equal(initial.length, MAPPING_PATH_SUGGESTION_LIMIT);
  assert.deepEqual(initial, catalog.slice(0, MAPPING_PATH_SUGGESTION_LIMIT));
  assert.deepEqual(mappingPathSuggestions(catalog, 'Parameter/8191', { focused: true }), [catalog.at(-1)]);
  assert.deepEqual(mappingPathSuggestions(catalog, 'avatar/parameter/818', { focused: true }), catalog.slice(8180, 8190));
  assert.deepEqual(mappingPathSuggestions(catalog, '', { focused: true, limit: 100000 }), initial);
});

test('multi-path suggestions retain prior paths and spacing without mutating input / 多路径建议保留前缀和空白，不修改草稿', () => {
  const paths = ['OGB/Orf/Socket/TouchOthers', 'Sensa/SPS/Root/Sample'];
  const draft = 'Custom/First; Custom/Second;  sample';
  assert.deepEqual(mappingPathSuggestions(paths, draft, { focused: true }),
    ['Custom/First; Custom/Second;  Sensa/SPS/Root/Sample']);
  assert.equal(draft, 'Custom/First; Custom/Second;  sample');
  assert.deepEqual(mappingPathSuggestions(paths, 'Custom/First\n  touch', { focused: true }),
    ['Custom/First\n  OGB/Orf/Socket/TouchOthers']);
});

test('suggestions use only supplied source paths and leave freeform patterns unrestricted / 建议不混入其他来源，手工通配符不被替换', () => {
  const sourcePaths = ['Self/Position', null, 'Self/Position', 'Self/Rotation', ''];
  assert.deepEqual(mappingPathSuggestions(sourcePaths, 'self/', { focused: true }), ['Self/Position', 'Self/Rotation']);
  const wildcard = 'Self/**; Other/*';
  assert.deepEqual(mappingPathSuggestions(sourcePaths, wildcard, { focused: true }), []);
  assert.equal(wildcard, 'Self/**; Other/*');
  assert.deepEqual(mappingPathSuggestions(sourcePaths, '', { focused: true, limit: 0 }), []);
  assert.deepEqual(mappingPathSuggestions(null, '', { focused: true }), []);
});

test('broad suggestion queries stop reading once the visible bound is full / 宽泛查询达到显示上限后不继续扫描', () => {
  let reads = 0;
  const catalog = Array.from({ length: 8192 }, (_, index) => `Path/${index}`);
  const counted = new Proxy(catalog, { get(target, key, receiver) {
    if (/^\d+$/.test(String(key))) reads++;
    return Reflect.get(target, key, receiver);
  } });
  assert.equal(mappingPathSuggestions(counted, '', { focused: true }).length, MAPPING_PATH_SUGGESTION_LIMIT);
  assert.equal(reads, MAPPING_PATH_SUGGESTION_LIMIT);
});
