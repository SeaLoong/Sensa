import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOutputChoices } from '../../src/web/output-options.ts';
import { OUTPUT_TYPES } from '../../src/web/configuration.js';
import { getLocale, setLocale } from '../../src/web/i18n.js';
import { BrowserDevices } from '../../src/websensa/browser-outputs.ts';

test('output choices group unavailable transports after available ones and preserve catalog order', () => {
  const catalog = OUTPUT_TYPES();
  const menu = buildOutputChoices(catalog, ['SensaHttp', 'Recording', 'Intiface'], null, 'SensaHttp');
  assert.deepEqual(menu.options.filter(item => !item.disabled).map(item => item.value), ['Intiface', 'Recording', 'SensaHttp']);
  assert.deepEqual(menu.options.filter(item => item.disabled).map(item => item.value), catalog.filter(item => !['SensaHttp', 'Recording', 'Intiface'].includes(item.value)).map(item => item.value));
  assert.equal(menu.value, 'SensaHttp');
  assert.equal(menu.canAdd, true);
  assert.equal(new Set(menu.options.filter(item => !item.disabled).map(item => item.group)).size, 1);
  assert.notEqual(menu.options[0].group, menu.options.at(-1).group);
  assert.equal(menu.states.get('TCodeSerial').available, false);
  assert.ok(menu.states.get('TCodeSerial').reason);
});

test('an unavailable selection resolves before rendering and an empty inventory has no addable fallback', () => {
  const catalog = OUTPUT_TYPES();
  assert.equal(buildOutputChoices(catalog, ['SensaHttp', 'Recording'], null, 'TCodeSerial').value, 'Recording');
  for (const [allowed, capabilities] of [[[], null], [null, { outputs: [] }]]) {
    const menu = buildOutputChoices(catalog, allowed, capabilities, 'TCodeSerial');
    assert.equal(menu.value, ''); assert.equal(menu.canAdd, false);
    assert.deepEqual(menu.options.map(item => item.value), ['', ...catalog.map(item => item.value)]);
    assert.ok(menu.options.every(item => item.disabled));
  }
});

test('unknown legacy hosts retain their choices while explicit unavailable capabilities override stale lists', () => {
  const catalog = OUTPUT_TYPES();
  for (const capabilities of [null, {}, { outputs: [{ type: 'Recording', available: 'yes' }] }]) {
    const menu = buildOutputChoices(catalog, null, capabilities, 'TCodeSerial');
    assert.equal(menu.value, 'TCodeSerial');
    assert.ok(menu.options.every(item => !item.disabled && !item.group));
  }
  const menu = buildOutputChoices(catalog, ['TCodeSerial', 'SensaHttp'], { outputs: [
    { type: 'TCodeSerial', available: false, source: 'native' },
    { type: 'SensaHttp', available: true },
  ] }, 'TCodeSerial');
  assert.equal(menu.value, 'SensaHttp');
  assert.equal(menu.states.get('TCodeSerial').available, false);
});

test('browser inventory describes every catalog transport without prompting for permission', () => {
  let prompts = 0;
  const request = () => { prompts++; throw new Error('Permission detection must not request access'); };
  const navigator = { serial: { requestPort: request }, bluetooth: { requestDevice: request }, requestMIDIAccess: request };
  const devices = new BrowserDevices({ navigator });
  const environment = { isSecureContext: true, navigator, WebSocket() {}, fetch() {} };
  const outputs = devices.outputCapabilities(environment);
  assert.deepEqual(outputs.map(item => item.type).sort(), OUTPUT_TYPES().map(item => item.value).sort());
  assert.deepEqual(devices.outputTypes(environment), outputs.filter(item => item.available).map(item => item.type));
  assert.equal(outputs.filter(item => item.available).length, 10);
  assert.equal(outputs.find(item => item.type === 'TCodeUdp').reasonCode, 'desktop-only');
  assert.equal(prompts, 0);
});

test('browser capability reasons distinguish missing APIs, insecure contexts and desktop adapters in both languages', () => {
  const previous = getLocale();
  try {
    const devices = new BrowserDevices();
    const outputs = devices.outputCapabilities({ isSecureContext: true });
    for (const [locale, group, serial, desktop, empty] of [
      ['en-US', 'Currently unavailable', 'Web Serial unavailable', 'Use the desktop app', 'No available output types'],
      ['zh-CN', '当前不可用', '浏览器不支持串口', '请使用桌面版', '暂无可用输出类型'],
    ]) {
      setLocale(locale);
      const menu = buildOutputChoices(OUTPUT_TYPES(), null, { outputs }, 'Recording');
      assert.equal(menu.states.get('TCodeSerial').reason, serial);
      assert.equal(menu.states.get('TCodeUdp').reason, desktop);
      assert.equal(menu.options.find(item => item.value === 'TCodeSerial').group, group);
      assert.equal(buildOutputChoices(OUTPUT_TYPES(), [], null, '').options[0].label, empty);
    }
    setLocale('en-US');
    const insecure = buildOutputChoices(OUTPUT_TYPES(), null, { outputs: devices.outputCapabilities({ isSecureContext: false }) }, '');
    assert.equal(insecure.states.get('TCodeSerial').reason, 'Requires HTTPS or localhost');
  } finally { setLocale(previous); }
});

test('host-specific diagnostics use the current language without changing the saved type or interpreting markup', () => {
  const previous = getLocale();
  try {
    const capabilities = { outputs: [{ type: 'TCodeSerial', available: false, reason: '<script>device</script>', reasonZh: '组件未安装' }] };
    setLocale('en-US');
    const menu = buildOutputChoices(OUTPUT_TYPES(), null, capabilities, 'TCodeSerial');
    assert.equal(menu.states.get('TCodeSerial').reason, '<script>device</script>');
    assert.equal(menu.options.find(item => item.value === 'TCodeSerial').value, 'TCodeSerial');
    setLocale('zh-CN');
    assert.equal(buildOutputChoices(OUTPUT_TYPES(), null, capabilities, '').states.get('TCodeSerial').reason, '组件未安装');
  } finally { setLocale(previous); }
});
