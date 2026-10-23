import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { Linter } from 'eslint';
import { localized, t, getLocale, setLocale, resolveLocale, normalizeLocale, detectLocale, clearLocaleQuery, subscribeLocale, diagnostic, docUrl } from '../../src/web/i18n.js';
import en from '../../src/web/i18n.en.json' with { type: 'json' };
import presets from '../../src/web/data/osc-presets.json' with { type: 'json' };
import { calibratedPointDraft } from '../../src/web/osc-preview.js';

test('locale negotiation uses session choice, browser languages and English fallback / 语言协商使用会话选择、浏览器语言及英语回退', () => {
  for (const value of ['zh', 'ZH_cn', 'zh-TW', 'zh_Hant_HK', 'zh-Hans-CN']) assert.equal(normalizeLocale(value), 'zh-CN');
  for (const value of ['en', 'EN_us', 'en-GB', ' en_US_POSIX ']) assert.equal(normalizeLocale(value), 'en-US');
  for (const value of [null, undefined, '', 'fr-FR', 'zh!!!', 3, ['zh-CN']]) assert.equal(normalizeLocale(value), null);
  for (const [saved, languages, expected] of [
    ['ZH_hk', ['en-US'], 'zh-CN'],
    ['en_us', ['zh-TW'], 'en-US'],
    ['bad', ['fr-FR', 'zh-HK', 'en-US'], 'zh-CN'],
    [null, ['de-DE', 'en-GB', 'zh-CN'], 'en-US'],
    [null, ['fr-FR', 'de-DE'], 'en-US'],
    [null, [], 'en-US'],
  ]) assert.equal(resolveLocale(saved, languages), expected);
});

test('browser detection ignores URL and persistent choices while handling denied session storage / 浏览器检测忽略URL及持久化偏好并支持会话存储拒绝', () => {
  assert.equal(detectLocale(), 'en-US');
  const browser = { location: { search: '?lang=ZH_hant_tw' }, localStorage: { getItem: () => 'zh-CN' },
    sessionStorage: { getItem: () => 'en-US' }, navigator: { languages: ['zh-CN'], language: 'zh-CN' } };
  assert.equal(detectLocale(browser), 'en-US');
  browser.navigator = { languages: [], language: 'zh_TW' }; browser.sessionStorage.getItem = () => null;
  assert.equal(detectLocale(browser), 'zh-CN');
  browser.navigator = { languages: ['fr-FR', 'EN_gb', 'zh-CN'], language: 'zh-CN' };
  assert.equal(detectLocale(browser), 'en-US');
  Object.defineProperty(browser, 'sessionStorage', { get() { throw new Error('denied'); } });
  browser.navigator = { languages: ['fr-FR', 'zh-HK'], language: 'en-US' };
  browser.location.search = '?lang=en_US'; assert.equal(detectLocale(browser), 'zh-CN');
  browser.navigator = { languages: [], language: 'fr-FR' }; assert.equal(detectLocale(browser), 'en-US');
});

test('removing language queries retains other entries, fragment and navigation state / 清理语言查询保留其他参数、片段及导航状态', () => {
  const replacements = [], state = { position: 12 };
  const browser = { location: { href: 'https://sensa.invalid/docs/parameter-geometry.html?lang=zh&scene=shader&tag=one&lang=en&tag=two#encoding' },
    history: { state, replaceState: (...args) => replacements.push(args) } };
  clearLocaleQuery(browser);
  assert.equal(replacements.length, 1); assert.equal(replacements[0][0], state);
  const url = new URL(replacements[0][2]);
  assert.equal(url.searchParams.has('lang'), false); assert.equal(url.searchParams.get('scene'), 'shader');
  assert.deepEqual(url.searchParams.getAll('tag'), ['one', 'two']); assert.equal(url.hash, '#encoding');
  assert.equal(url.pathname, '/docs/parameter-geometry.html');
  browser.location.href = 'https://sensa.invalid/?scene=shader#encoding'; clearLocaleQuery(browser);
  assert.equal(replacements.length, 1);
  browser.location.href = 'file:///guide.html?lang=zh'; browser.history.replaceState = () => { throw new Error('denied'); };
  assert.doesNotThrow(() => clearLocaleQuery(browser)); assert.doesNotThrow(() => clearLocaleQuery());
});

// Execute only the offline guide's locale boundary; its geometry renderer needs a browser.
const guideSource = readFileSync('docs/assets/parameter-geometry-view.js', 'utf8');
const guideLocaleSource = guideSource.slice(guideSource.indexOf("  const LOCALE_STORAGE_KEY ="), guideSource.indexOf('  let locale = initialLocale();'));
function guideLocale(browser) {
  const context = vm.createContext({ window: browser, navigator: browser.navigator, location: browser.location, URL });
  vm.runInContext(guideLocaleSource + '\nglobalThis.localeBoundary = { initialLocale, rememberLocale };', context, { timeout: 1000 });
  return context.localeBoundary;
}
test('offline guide shares session choices with the app and clears old language links / 离线图解与应用共享会话选择并清理旧语言链接', () => {
  const values = new Map([['sensa.locale', 'zh-CN']]), replacements = [];
  const browser = { location: { href: 'https://sensa.invalid/docs/parameter-geometry.html?lang=en&scene=shader#encoding' },
    navigator: { languages: ['en-US'], language: 'en-US' },
    localStorage: { getItem: () => { throw new Error('persistent storage must not be read'); } },
    sessionStorage: { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) },
    history: { state: { preserved: true }, replaceState: (state, title, url) => { replacements.push([state, title, String(url)]); browser.location.href = String(url); } } };
  const guide = guideLocale(browser);
  assert.equal(guide.initialLocale(), 'zh-CN'); assert.equal(guide.initialLocale(), detectLocale(browser));
  assert.equal(replacements.length, 1); assert.equal(new URL(browser.location.href).searchParams.has('lang'), false);
  assert.equal(new URL(browser.location.href).searchParams.get('scene'), 'shader'); assert.equal(new URL(browser.location.href).hash, '#encoding');
  guide.rememberLocale('en-US'); assert.equal(values.get('sensa.locale'), 'en-US'); assert.equal(detectLocale(browser), 'en-US');
  browser.navigator = { languages: ['fr-FR', 'zh-HK'], language: 'en-US' }; values.clear();
  assert.equal(guideLocale(browser).initialLocale(), 'zh-CN');
  Object.defineProperty(browser, 'sessionStorage', { get() { throw new Error('denied'); } });
  const denied = guideLocale(browser); assert.equal(denied.initialLocale(), 'zh-CN');
  assert.doesNotThrow(() => denied.rememberLocale('en-US'));
});

test('computed diagnostics translate owned phrases while preserving captured identifiers and paths / 计算诊断翻译固定说明并保留标识符和路径原文', () => {
  const previous = getLocale();
  setLocale('en-US');
  try {
    for (const reason of [
      '请先启用空间输入 / Enable spatial input to use tracking measurements',
      '部分计算输入已超时 / A calculation input has expired',
      '请为比值选择非零分母 / Choose a non-zero denominator for the ratio',
      '请选择同一 OSC 来源的输入 / Choose inputs from the same OSC source',
      '请选择同一坐标系的空间输入 / Choose spatial inputs in the same coordinate frame',
      '等待计算输入 / Waiting for calculation inputs',
      '等待已保存的计算定义 / Waiting for saved calculation definitions',
      '夹角需要两个非零向量 / Angle calculations require two non-zero vectors',
      '平面需要两条非零且不近似共线的轴 / A plane requires two non-zero axes that are not nearly collinear',
      '两条平面轴接近共线，无法确定可靠法向 / The plane axes are nearly collinear and cannot determine a reliable normal',
      '请为平面选择非零法向 / Choose a non-zero plane normal',
      '空间计算需要同一坐标系、同量纲的 XYZ 分组；位置与方向请分别选择 / Spatial calculations require compatible coordinate frames and consistent XYZ groups; choose positions and directions separately',
    ]) assert.doesNotMatch(diagnostic(reason), /[\u3400-\u9fff]/u, reason);
    const target = 'Sensa/SPS/Root / segment/**';
    assert.equal(diagnostic(`等待参数：${target} / Waiting for parameter: ${target}`), `Waiting for parameter: ${target}`);
    assert.equal(diagnostic('计算信号 Blend 引用的 Missing 尚未定义，请先创建该计算信号 / Computed signal Blend: unknown calculation Missing.'), 'Computed signal Blend: unknown calculation Missing.');
    assert.equal(diagnostic('请按输入到结果的方向连接计算信号 Blend，并移除循环引用 / Computed signal Blend: calculations must form a chain without cycles.'), 'Computed signal Blend: calculations must form a chain without cycles.');
    assert.equal(diagnostic('计算信号 Blend 可使用 1～16 个输入，差值和比值各需两个输入 / Computed signal Blend: use 1–16 inputs; difference and ratio require two.'), 'Computed signal Blend: use 1–16 inputs; difference and ratio require two.');
    assert.equal(diagnostic('计算信号 Plane 的空间计算输入不完整：点距离与夹角使用两组三维量（6 个输入），平面计算使用位置、原点、法向（9 个输入），双轴平面使用位置、原点和两条轴（12 个输入） / Computed signal Plane: distance and angle calculations require 6 inputs, normal-defined planes require 9, and axis-defined planes require 12.'), 'Computed signal Plane: distance and angle calculations require 6 inputs, normal-defined planes require 9, and axis-defined planes require 12.');
    const custom = 'OGB/Orf/左侧 / 私有/PenOthers';
    assert.equal(diagnostic(`等待参数：${custom} / Waiting for parameter: ${custom}`), `Waiting for parameter: ${custom}`);
    assert.equal(diagnostic('User / arbitrary message'), 'User / arbitrary message');
  } finally { setLocale(previous); }
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
    assert.equal(docUrl('docs/parameter-geometry.html'), '/docs/parameter-geometry.html');
    assert.equal(calibratedPointDraft(null, 'Z', null, null).error, 'Select a mappable point and axis');
    assert.equal(setLocale('invalid'), false); assert.equal(getLocale(), 'en-US');
    setLocale('en-US'); setLocale('zh-CN');
    assert.equal(options(), zh); assert.equal(factories, 2); assert.equal(calls.length, 2);
    assert.match(docUrl('docs/guide.md'), /guide\.md$/);
    assert.match(docUrl('unity/top.sealoong.sensa/README.md'), /\/README\.zh-CN\.md$/);
    assert.match(docUrl('docs/README.md'), /\/README\.zh-CN\.md$/);
    assert.equal(docUrl('docs/parameter-geometry.html'), '/docs/parameter-geometry.html');
  } finally { stop(); setLocale(original); }
});

test('an explicit switch saves the session choice and removes an existing language query / 显式切换保存会话选择并移除已有语言查询', () => {
  const original = getLocale(), descriptors = Object.fromEntries(['window', 'sessionStorage'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const writes = [], replacements = [], historyState = { existing: true };
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: { setItem: (key, value) => writes.push([key, value]) } });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    location: { href: 'https://sensa.invalid/?lang=zh_TW&keep=1#section' },
    history: { state: historyState, replaceState: (state, title, url) => replacements.push([state, title, String(url)]) },
  } });
  try {
    assert.equal(setLocale('EN_gb'), true); assert.equal(getLocale(), 'en-US');
    assert.deepEqual(writes, [['sensa.locale', 'en-US']]); assert.equal(replacements.length, 1);
    const url = new URL(replacements[0][2]); assert.equal(url.searchParams.has('lang'), false);
    assert.equal(url.searchParams.get('keep'), '1'); assert.equal(url.hash, '#section'); assert.equal(replacements[0][0], historyState);
    assert.equal(setLocale('unsupported'), false); assert.equal(writes.length, 1);
  } finally {
    for (const [key, descriptor] of Object.entries(descriptors)) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    setLocale(original);
  }
});
test('denied browser storage does not break in-memory language switching / 浏览器存储拒绝不影响内存语言切换', () => {
  const original = getLocale(), descriptor = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, get() { throw new Error('denied'); } });
  try { assert.equal(setLocale('en-US'), true); assert.equal(getLocale(), 'en-US'); }
  finally { if (descriptor) Object.defineProperty(globalThis, 'sessionStorage', descriptor); else delete globalThis.sessionStorage; setLocale(original); }
});
