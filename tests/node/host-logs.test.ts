import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LogRedactor, RuntimeLogBuffer } from '../../src/node/host/logs.ts';
test('logs remove URL userinfo, sensitive paths, fragments and every query value', () => {
  const redactor = new LogRedactor();
  const value = redactor.redact('Target https://fixture-user:fixture-pass@example.invalid/device/fixture-key?q=fixture-query#fixture-fragment failed');
  for (const secret of ['fixture-user', 'fixture-pass', 'fixture-key', 'fixture-query', 'fixture-fragment']) assert.equal(value.includes(secret), false);
  assert.match(value, /https:\/\/example.invalid\/\[redacted\]/);
  assert.equal(redactor.redact('[WebUI] Available at http://127.0.0.1:7777'), '[WebUI] Available at http://127.0.0.1:7777');
});
test('upstream header echoes, JSON credential keys and registered opaque strings are redacted', () => {
  const redactor = new LogRedactor(); redactor.registerConfiguration({ device: { connectionKey: 'fixture-opaque-key' } });
  const value = redactor.redact('Upstream Cookie: sid=fixture-cookie; other=fixture-other\nAuthorization: Bearer fixture-bearer\n{"apiKey":"fixture-json"}\nError: fixture-opaque-key');
  for (const secret of ['fixture-cookie', 'fixture-other', 'fixture-bearer', 'fixture-json', 'fixture-opaque-key']) assert.equal(value.includes(secret), false);
});
test('runtime logs retain a bounded independently copied inventory and sanitize before persistence', () => {
  const buffer = new RuntimeLogBuffer(() => 100); buffer.redactor.registerSecret('fixture-known-secret');
  for (let index = 0; index < 2001; index++) buffer.add(`[Output] message ${index} fixture-known-secret`, 'Warning');
  const rows = buffer.snapshot(2000); assert.equal(rows.length, 2000); assert.match(rows[0]!.message, /message 1 /); assert.equal(rows[0]!.category, 'Output'); assert.equal(rows[0]!.level, 'Warning');
  assert.equal(rows.some(row => row.message.includes('fixture-known-secret')), false); rows.pop(); assert.equal(buffer.snapshot(2000).length, 2000);
});
