import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { Linter } from 'eslint';
import { localized, t, getLocale, setLocale, resolveLocale, subscribeLocale, diagnostic, docUrl } from '../../src/web/i18n.js';
import en from '../../src/web/i18n.en.json' with { type: 'json' };
import presets from '../../src/web/data/osc-presets.json' with { type: 'json' };
import { calibratedPointDraft } from '../../src/web/osc-preview.js';

test('locale resolution respects saved choice and browser preferences / 语言解析遵循保存选择及浏览器偏好', () => {
  for (const [saved, languages, expected] of [['zh-CN', ['en-US'], 'zh-CN'], ['en-US', ['zh-TW'], 'en-US'], ['bad', ['zh-HK'], 'zh-CN'], [null, ['de-DE', 'en-GB'], 'en-US'], [null, [], 'en-US']])
    assert.equal(resolveLocale(saved, languages), expected);
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
  const original = getLocale(), calls = [];
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
    assert.equal(calibratedPointDraft(null, 'Z', null, null).error, 'Select a mappable point and axis');
    assert.equal(setLocale('invalid'), false); assert.equal(getLocale(), 'en-US');
    setLocale('en-US'); setLocale('zh-CN');
    assert.equal(options(), zh); assert.equal(factories, 2); assert.equal(calls.length, 2);
    assert.match(docUrl('docs/guide.md'), /guide\.md$/);
  } finally { stop(); setLocale(original); }
});

test('denied browser storage does not break in-memory language switching / 浏览器存储拒绝不影响内存语言切换', () => {
  const original = getLocale(), descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('denied'); } });
  try { assert.equal(setLocale('en-US'), true); assert.equal(getLocale(), 'en-US'); }
  finally { if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor); else delete globalThis.localStorage; setLocale(original); }
});
