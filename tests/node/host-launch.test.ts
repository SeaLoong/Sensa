import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { parseLaunchOptions, instanceKey, buildWebUiUrls } from '../../src/node/host/launch.ts';
const config = join(tmpdir(), 'sensa-launch-fixture', 'config.json');
test('named and generated instances keep isolated paths without copying the parent profile', () => {
  assert.equal(parseLaunchOptions(['--instance', 'stage_A'], config).configPath, join(dirname(config), 'instances', 'stage_A', 'config.json'));
  const created = parseLaunchOptions(['--new-instance', '--open-browser=false', '--port=0'], config, () => 'session-fixture');
  assert.equal(created.configPath, join(dirname(config), 'instances', 'session-fixture', 'config.json')); assert.equal(created.openBrowser, false); assert.equal(created.port, 0);
  assert.notEqual(instanceKey(created.configPath), instanceKey(config));
});
test('launch parsing rejects ambiguous profile selections and malformed values', () => {
  for (const args of [['--instance', '../escape'], ['--instance', 'a', '--new-instance'], ['--config', 'one', '--config=two'], ['--port', '65536'], ['--port', 'NaN'], ['--open-browser', 'perhaps'], ['--unknown']]) assert.throws(() => parseLaunchOptions(args, config));
});
test('browser addresses distinguish wildcard bind addresses and canonical IPv6', () => {
  assert.deepEqual(buildWebUiUrls('localhost', 7780), { listenHost: '127.0.0.1', browserUrl: 'http://127.0.0.1:7780' });
  assert.deepEqual(buildWebUiUrls('0.0.0.0', 7780), { listenHost: '0.0.0.0', browserUrl: 'http://127.0.0.1:7780' });
  assert.deepEqual(buildWebUiUrls('::', 7780), { listenHost: '::', browserUrl: 'http://[::1]:7780' });
  assert.throws(() => buildWebUiUrls('http://localhost', 7780)); assert.throws(() => buildWebUiUrls('localhost/path', 7780));
});
