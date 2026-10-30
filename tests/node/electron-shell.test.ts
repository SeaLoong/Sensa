import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import test from 'node:test';
import { childEnvironment, desktopArguments, httpUrl, sameServiceOrigin, serviceReady } from '../../src/electron/policy.ts';
import { startDesktopService } from '../../src/electron/service-process.ts';

test('desktop navigation keeps credentials and privileged URL schemes out of the shell', () => {
  const base = 'http://127.0.0.1:28800/?key=test-only';
  assert.ok(sameServiceOrigin('http://127.0.0.1:28800/docs/parameter-geometry.html', base));
  for (const value of ['file:///etc/passwd', 'javascript:alert(1)', 'data:text/html,hi', 'http://user:secret@127.0.0.1:28800/',
    'http://127.0.0.1.evil:28800/', 'http://127.0.0.1:28801/', 'https://127.0.0.1:28800/', 'http://127.0.0.1:28800/\n'])
    assert.equal(sameServiceOrigin(value, base), false, value);
  assert.equal(httpUrl('https://github.com/SeaLoong/Sensa')?.protocol, 'https:');
  assert.equal(httpUrl({ toString: () => base }), undefined);
});

test('service readiness is a typed HTTP origin, not a generic process command', () => {
  const good = { type: 'sensa:ready', url: 'http://[::1]:1234/', port: 1234, configPath: '/tmp/isolated.json', reused: false };
  assert.equal(serviceReady(good)?.port, 1234);
  for (const value of [null, [], { ...good, type: 'execute' }, { ...good, url: 'file:///x' }, { ...good, url: 'http://[::1]:1234/evil' },
    { ...good, url: 'http://user:secret@[::1]:1234/' }, { ...good, url: 'http://[::1]:1234/?key=test-only' },
    { ...good, port: 1 }, { ...good, reused: 'false' }, { ...good, configPath: '' }])
    assert.equal(serviceReady(value), undefined);
});

test('Electron transport switches never leak into service configuration and external Node injection is removed', () => {
  assert.deepEqual(desktopArguments(['--remote-debugging-port=1234', '--remote-debugging-address=127.0.0.1', '--inspect=0', '--config', '/tmp/a.json', '--new-instance']), ['--config', '/tmp/a.json', '--new-instance']);
  assert.throws(() => desktopArguments(['--remote-debugging-address=0.0.0.0']));
  assert.throws(() => desktopArguments(['--inspect-publish-uid=http']));
  const original = { NODE_OPTIONS: '--require malicious.js', NODE_PATH: '/tmp/injection', ELECTRON_RUN_AS_NODE: '1',
    SENSA_CONFIG_PATH: '/tmp/config.json', HTTPS_PROXY: 'http://proxy.invalid' };
  const env = childEnvironment(original);
  assert.equal(env.NODE_OPTIONS, undefined); assert.equal(env.NODE_PATH, undefined); assert.equal(env.ELECTRON_RUN_AS_NODE, undefined);
  assert.equal(env.SENSA_CONFIG_PATH, original.SENSA_CONFIG_PATH); assert.equal(env.HTTPS_PROXY, original.HTTPS_PROXY);
  assert.equal(original.ELECTRON_RUN_AS_NODE, '1');
});

// These are isolated mock IPC children, not Sensa/Electron product launches.
const fixture = fileURLToPath(new URL('./fixtures/desktop-service-child.mjs', import.meta.url));
const mock = (mode: string) => ({ executable: process.execPath, args: [fixture, mode], cwd: fileURLToPath(new URL('.', import.meta.url)) });
test('owned service closes through the narrow IPC contract and repeated close is idempotent', async () => {
  const service = await startDesktopService(mock('owned'), process.env, 3000, 500);
  assert.equal(service.ready.reused, false);
  await Promise.all([service.close(), service.close()]);
  assert.equal(service.child.exitCode, 0);
});
test('attaching to an existing owner does not send it shutdown or kill it', async () => {
  const service = await startDesktopService(mock('reused'), process.env, 3000, 500);
  const exit = once(service.child, 'exit');
  await service.close(); assert.equal(service.child.killed, false);
  await exit; assert.equal(service.child.exitCode, 0);
});
test('service startup errors omit the child message and readiness is bounded', async () => {
  await assert.rejects(startDesktopService(mock('error'), process.env, 3000, 100), error =>
    error instanceof Error && error.message === 'The local service could not start.' && !error.message.includes('private-pairing'));
  await assert.rejects(startDesktopService(mock('timeout'), process.env, 50, 100), /did not become ready in time/);
});
test('a nonresponsive owned mock child has a bounded forced shutdown', async () => {
  const service = await startDesktopService(mock('ignore-shutdown'), process.env, 3000, 50);
  await service.close(); assert.equal(service.child.killed, true);
});
test('late ChildProcess errors are observed and close the owned mock service', async () => {
  const service = await startDesktopService(mock('owned'), process.env, 3000, 100);
  service.child.emit('error', new Error('isolated late IPC failure'));
  await service.unexpectedExit; await service.close();
  assert.equal(service.child.killed, true);
});
