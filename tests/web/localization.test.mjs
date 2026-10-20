import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { Linter } from 'eslint';
import { localized, t, getLocale, setLocale, resolveLocale, normalizeLocale, detectLocale, subscribeLocale, diagnostic, docUrl } from '../../src/web/i18n.js';
import en from '../../src/web/i18n.en.json' with { type: 'json' };
import presets from '../../src/web/data/osc-presets.json' with { type: 'json' };
import { calibratedPointDraft } from '../../src/web/osc-preview.js';

test('locale negotiation normalizes preferences and orders URL, choice, system and English fallback / 语言协商规范化并遵循URL、选择、系统及英语回退', () => {
  for (const value of ['zh', 'ZH_cn', 'zh-TW', 'zh_Hant_HK', 'zh-Hans-CN']) assert.equal(normalizeLocale(value), 'zh-CN');
  for (const value of ['en', 'EN_us', 'en-GB', ' en_US_POSIX ']) assert.equal(normalizeLocale(value), 'en-US');
  for (const value of [null, undefined, '', 'fr-FR', 'zh!!!', 3, ['zh-CN']]) assert.equal(normalizeLocale(value), null);
  for (const [saved, languages, requested, expected] of [
    ['zh-CN', ['zh-TW'], 'EN_gb', 'en-US'],
    ['en-US', ['en-US'], 'zh_Hant_TW', 'zh-CN'],
    ['ZH_hk', ['en-US'], null, 'zh-CN'],
    ['en_us', ['zh-TW'], '', 'en-US'],
    ['zh-CN', ['en-US'], 'unsupported', 'zh-CN'],
    ['bad', ['fr-FR', 'zh-HK', 'en-US'], null, 'zh-CN'],
    [null, ['de-DE', 'en-GB', 'zh-CN'], null, 'en-US'],
    [null, ['fr-FR', 'de-DE'], null, 'en-US'],
    [null, [], null, 'en-US'],
  ]) assert.equal(resolveLocale(saved, languages, requested), expected);
});

test('browser detection handles language fallback and denied storage without changing preferences / 浏览器检测支持language回退及存储拒绝且不改偏好', () => {
  assert.equal(detectLocale(), 'en-US');
  const browser = { location: { search: '?lang=ZH_hant_tw' }, localStorage: { getItem: () => 'en-US' }, navigator: { languages: ['en-US'], language: 'en-US' } };
  assert.equal(detectLocale(browser), 'zh-CN');
  browser.location.search = ''; browser.navigator = { languages: [], language: 'zh_TW' }; browser.localStorage.getItem = () => null;
  assert.equal(detectLocale(browser), 'zh-CN');
  browser.navigator = { languages: ['fr-FR', 'EN_gb', 'zh-CN'], language: 'zh-CN' };
  assert.equal(detectLocale(browser), 'en-US');
  Object.defineProperty(browser, 'localStorage', { get() { throw new Error('denied'); } });
  browser.navigator = { languages: ['fr-FR', 'zh-HK'], language: 'en-US' };
  assert.equal(detectLocale(browser), 'zh-CN');
  browser.location.search = '?lang=en_US'; assert.equal(detectLocale(browser), 'en-US');
});

test('every source module and built-in preset has matching nonempty translations and placeholders / 每个源码 module 和内置预设均有非空翻译与匹配占位符', () => {
  const files = directory => readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? files(file) : /\.(js|jsx)$/.test(entry.name) && !entry.name.includes('bundle') ? [file] : [];
  });
  const linter = new Linter();
  for (const file of files('src/web')) {
    const keys = [];
    const messages = linter.verify(readFileSync(file, 'utf8'), {
      files: ['**/*.{js,jsx}'],
      languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
      plugins: { catalog: { rules: { keys: { create: () => ({
        CallExpression(node) {
          if (node.callee.type === 'Identifier' && node.callee.name === 't'
            && node.arguments[0]?.type === 'Literal' && typeof node.arguments[0].value === 'string')
            keys.push(node.arguments[0].value);
        },
      }) } } } },
      rules: { 'catalog/keys': 'error' },
    }, { filename: file });
    assert.deepEqual(messages, [], file);
    for (const key of keys) assert.ok(en[key], file + ': ' + key);
  }
  for (const preset of presets) for (const field of ['name', 'description']) assert.ok(en[preset[field]], preset.id);
  const placeholders = text => [...text.matchAll(/\{\d+\}/g)].map(match => match[0]).sort();
  for (const [key, value] of Object.entries(en)) {
    assert.ok(value.trim(), key); assert.doesNotMatch(value, /[\u3400-\u9fff]/u, key);
    assert.deepEqual(placeholders(value), placeholders(key), key);
  }
});

test('switching updates module catalogs and subscribers while user data and diagnostic names stay literal / 切换更新 module 目录与订阅者，用户数据及诊断名称保持原文', () => {
  const original = getLocale(); setLocale('zh-CN'); const calls = [];
  const stop = subscribeLocale(() => calls.push(getLocale()));
  let factories = 0;
  const options = localized(() => { factories++; return [{ label: t('手动') }]; });
  try {
    setLocale('zh-CN'); const zh = options(); assert.equal(zh[0].label, '手动');
    setLocale('en-US'); const english = options(); assert.equal(english[0].label, 'Manual');
    assert.equal(options(), english);
    assert.equal(t('{0} 已保存', ['自定义 {1} <b>']), '自定义 {1} <b> saved');
    assert.equal(t('我的设备'), '我的设备');
    assert.equal(diagnostic('[Output] 已断开 我的设备'), '[Output] Disconnected 我的设备');
    assert.equal(diagnostic('Root: 采样不完整'), 'Root: Incomplete samples');
    assert.equal(diagnostic('unknown firmware response'), 'unknown firmware response');
    assert.match(docUrl('docs/guide.md'), /guide\.en\.md$/);
    assert.match(docUrl('unity/top.sealoong.sensa/README.md'), /\/README\.md$/);
    assert.match(docUrl('README.md'), /\/README\.md$/);
    assert.equal(docUrl('docs/parameter-geometry.html'), '/docs/parameter-geometry.html?lang=en-US');
    assert.equal(calibratedPointDraft(null, 'Z', null, null).error, 'Select a mappable point and axis');
    assert.equal(setLocale('invalid'), false); assert.equal(getLocale(), 'en-US');
    setLocale('en-US'); setLocale('zh-CN');
    assert.equal(options(), zh); assert.equal(factories, 2); assert.equal(calls.length, 2);
    assert.match(docUrl('docs/guide.md'), /guide\.md$/);
    assert.match(docUrl('unity/top.sealoong.sensa/README.md'), /\/README\.zh-CN\.md$/);
    assert.match(docUrl('docs/README.md'), /\/README\.zh-CN\.md$/);
    assert.equal(docUrl('docs/parameter-geometry.html'), '/docs/parameter-geometry.html?lang=zh-CN');
  } finally { stop(); setLocale(original); }
});

test('an explicit switch persists its canonical value and updates an existing URL override / 显式切换保存规范值并更新已有URL覆盖', () => {
  const original = getLocale(), descriptors = Object.fromEntries(['window', 'localStorage'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const writes = [], replacements = [], historyState = { existing: true };
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { setItem: (key, value) => writes.push([key, value]) } });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    location: { href: 'https://sensa.invalid/?lang=zh_TW&keep=1#section' },
    history: { state: historyState, replaceState: (state, title, url) => replacements.push([state, title, String(url)]) },
  } });
  try {
    assert.equal(setLocale('EN_gb'), true); assert.equal(getLocale(), 'en-US');
    assert.deepEqual(writes, [['sensa.locale', 'en-US']]); assert.equal(replacements.length, 1);
    const url = new URL(replacements[0][2]); assert.equal(url.searchParams.get('lang'), 'en-US');
    assert.equal(url.searchParams.get('keep'), '1'); assert.equal(url.hash, '#section'); assert.equal(replacements[0][0], historyState);
    assert.equal(setLocale('unsupported'), false); assert.equal(writes.length, 1);
  } finally {
    for (const [key, descriptor] of Object.entries(descriptors)) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    setLocale(original);
  }
});
test('denied browser storage does not break in-memory language switching / 浏览器存储拒绝不影响内存语言切换', () => {
  const original = getLocale(), descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('denied'); } });
  try { assert.equal(setLocale('en-US'), true); assert.equal(getLocale(), 'en-US'); }
  finally { if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor); else delete globalThis.localStorage; setLocale(original); }
});
