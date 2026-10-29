import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';
import dgram from 'node:dgram';
import { oscPacket } from './mocks.js';

async function child(directory, arguments_, info) {
  if (process.env.GITHUB_ACTIONS !== 'true') throw new Error('Desktop process acceptance runs only in Actions');
  const log = [], process_ = spawn('dotnet', [path.resolve('artifacts/e2e/app/Sensa.dll'), ...arguments_], {
    cwd: directory, env: { ...process.env, SENSA_RECORDINGS_PATH: path.join(directory, 'recordings') },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let failure;
  process_.on('error', error => { failure = error; });
  process_.stdout.on('data', data => log.push(data.toString()));
  process_.stderr.on('data', data => log.push(data.toString()));
  return {
    process: process_, log,
    async ready() {
      let url;
      await expect.poll(() => {
        if (failure) throw failure;
        if (process_.exitCode !== null) throw new Error(log.join(''));
        url = log.join('').match(/\[WebUI\] Available at (http:\/\/[^\s]+)/)?.[1];
        return Boolean(url);
      }, { timeout: 30000 }).toBe(true);
      const session = await fetch(url + '/api/session');
      expect(session.status).toBe(204);
      const cookie = session.headers.get('set-cookie')?.split(';')[0];
      return { url, async json(route) {
        const response = await fetch(url + route, { headers: { Cookie: cookie } });
        const text = await response.text();
        expect(response.ok, text).toBe(true);
        return JSON.parse(text);
      } };
    },
    async exited() {
      await expect.poll(() => process_.exitCode, { timeout: 15000 }).not.toBe(null);
      expect(process_.exitCode, log.join('')).toBe(0);
    },
    async close(name) {
      if (process_.exitCode === null && process_.signalCode === null) {
        const exited = once(process_, 'exit'); process_.kill('SIGTERM');
        let timer;
        const result = await Promise.race([exited.then(() => true), new Promise(resolve => { timer = setTimeout(() => resolve(false), 5000); })]);
        clearTimeout(timer); if (!result) { process_.kill('SIGKILL'); await exited; }
      }
      await info.attach(name + '.log', { body: log.join(''), contentType: 'text/plain' });
    },
  };
}

test('desktop profiles coordinate real processes, occupied ports and browser sessions / 桌面多实例协调进程端口与网页会话',
  { tag: ['@transport', '@config'] }, async ({ context }, info) => {
    const directory = await mkdtemp(path.join(tmpdir(), 'sensa-instances-e2e-'));
    const processes = [], pages = [];
    const occupiedHttp = net.createServer(), occupiedOsc = dgram.createSocket('udp4');
    const base = path.join(directory, 'config.json');
    try {
      await new Promise(resolve => occupiedHttp.listen(0, '127.0.0.1', resolve));
      await new Promise(resolve => occupiedOsc.bind(0, '127.0.0.1', resolve));
      const httpPort = occupiedHttp.address().port, oscPort = occupiedOsc.address().port;
      for (const name of ['one', 'two']) {
        const profile = path.join(directory, 'instances', name, 'config.json');
        await mkdir(path.dirname(profile), { recursive: true });
        await writeFile(profile, JSON.stringify({ webUi: { host: '127.0.0.1', port: httpPort, autoOpenBrowser: false },
          outputs: [], osc: { enabled: true, receiverHost: '127.0.0.1', receiverPort: oscPort,
            oscQueryReceiver: { enabled: false } } }));
      }
      const owner = await child(directory, ['--config', base, '--instance', 'one', '--open-browser', 'false'], info); processes.push(owner);
      const other = await child(directory, ['--config', base, '--instance', 'two', '--open-browser', 'false'], info); processes.push(other);
      const a = await owner.ready(), b = await other.ready();
      expect(a.url).not.toBe(b.url); expect(new URL(a.url).port).not.toBe(String(httpPort)); expect(new URL(b.url).port).not.toBe(String(httpPort));
      const first = await context.newPage(), second = await context.newPage(); pages.push(first, second);
      await first.goto(a.url); await second.goto(b.url);
      await expect(first.getByRole('button', { name: '帮助', exact: true })).toBeVisible();
      await expect(second.getByRole('button', { name: '帮助', exact: true })).toBeVisible();
      await expect.poll(async () => (await a.json('/api/instance')).openPages).toBe(1);
      await expect.poll(async () => (await b.json('/api/instance')).openPages).toBe(1);
      const cookies = await context.cookies();
      expect(cookies.some(cookie => cookie.name === 'SensaSession_' + new URL(a.url).port)).toBe(true);
      expect(cookies.some(cookie => cookie.name === 'SensaSession_' + new URL(b.url).port)).toBe(true);
      for (const endpoint of [a, b]) {
        const response = await context.request.put(endpoint.url + '/api/input/mode', { data: { mode: 'Osc' } });
        expect(response.ok(), await response.text()).toBe(true);
      }
      const stateA = await a.json('/api/state/overview'), stateB = await b.json('/api/state/overview');
      expect(stateA.osc.listening).toBe(true); expect(stateB.osc.listening).toBe(true);
      const ports = [stateA.osc.receiverPort, stateB.osc.receiverPort];
      expect(new Set(ports).size).toBe(2); expect(ports).not.toContain(oscPort);
      for (const [index, value] of [.23, .77].entries())
        await new Promise((resolve, reject) => occupiedOsc.send(oscPacket('/avatar/parameters/CI/Owner', value), ports[index], '127.0.0.1', error => error ? reject(error) : resolve()));
      for (const [endpoint, expected] of [[a, .23], [b, .77]])
        await expect.poll(async () => (await endpoint.json('/api/state/overview')).osc.preview.find(entry => entry.path === 'CI/Owner')?.numericValue).toBeCloseTo(expected, 5);
      const duplicate = await child(directory, ['--config', base, '--instance=one', '--open-browser', 'false'], info); processes.push(duplicate);
      await duplicate.exited();
      expect(duplicate.log.join('')).toContain('Using the running instance');
      expect((await a.json('/api/instance')).processId).toBe(owner.process.pid);
      expect((await b.json('/api/instance')).processId).toBe(other.process.pid);
      await first.close();
      await expect.poll(async () => (await a.json('/api/instance')).openPages, { timeout: 25000 }).toBe(0);
      expect((await b.json('/api/instance')).openPages).toBe(1);
      const saved = JSON.parse(await readFile(path.join(directory, 'instances', 'one', 'config.json'), 'utf8'));
      expect(saved.WebUi.Port).toBe(Number(new URL(a.url).port));
      await info.attach('desktop-instances.json', { body: JSON.stringify({ profiles: 2, processIds: [owner.process.pid, other.process.pid],
        urls: [a.url, b.url], occupiedHttpPort: httpPort, occupiedOscPort: oscPort, actualOscPorts: ports,
        duplicateExitedWithoutSecondOwner: true, hostCookieJarIsolated: true, distinctUdpValues: [.23, .77],
        pagePresenceReleased: true, hardwareUsed: false }), contentType: 'application/json' });
    } finally {
      await Promise.allSettled(pages.filter(page => !page.isClosed()).map(page => page.close()));
      for (const [index, process_] of processes.entries()) await process_.close('desktop-instance-' + index);
      await new Promise(resolve => occupiedHttp.close(resolve)); occupiedOsc.close();
      await rm(directory, { recursive: true, force: true });
    }
  });


test('fresh desktop instances have separate defaults and never clone an existing profile / 新实例使用独立默认配置',
  { tag: ['@config'] }, async ({}, info) => {
    const directory = await mkdtemp(path.join(tmpdir(), 'sensa-fresh-instances-e2e-'));
    const processes = [], parentPath = path.join(directory, 'config.json');
    const parent = JSON.stringify({ webUi: { title: 'Existing parent', port: 54321 },
      outputs: [{ id: 'parent-only', name: 'Existing connection', type: 'TCodeTcp', host: '127.0.0.1', port: 9, enabled: true }] });
    try {
      await writeFile(parentPath, parent);
      const a = await child(directory, ['--config', parentPath, '--new-instance', '--open-browser', 'false'], info); processes.push(a);
      const b = await child(directory, ['--config', parentPath, '--new-instance', '--open-browser', 'false'], info); processes.push(b);
      const first = await a.ready(), second = await b.ready();
      const one = await first.json('/api/instance'), two = await second.json('/api/instance');
      expect(first.url).not.toBe(second.url); expect(one.configPath).not.toBe(two.configPath);
      for (const [endpoint, instance] of [[first, one], [second, two]]) {
        expect(instance.configPath.startsWith(path.join(directory, 'instances') + path.sep)).toBe(true);
        const config = await endpoint.json('/api/config'), overview = await endpoint.json('/api/state/overview');
        expect(config.outputs.some(output => output.id === 'parent-only')).toBe(false);
        expect(config.outputs.every(output => output.enabled === false)).toBe(true);
        expect(overview.runtime.inputActive).toBe(false);
        expect(overview.osc.listening).toBe(false);
      }
      expect(await readFile(parentPath, 'utf8')).toBe(parent);
      await info.attach('desktop-fresh-instances.json', { body: JSON.stringify({ uniqueConfigurationPaths: [one.configPath, two.configPath],
        urls: [first.url, second.url], parentUnchanged: true, parentOutputsNotCloned: true, inputActive: false }), contentType: 'application/json' });
    } finally {
      for (const [index, process_] of processes.entries()) await process_.close('fresh-desktop-instance-' + index);
      await rm(directory, { recursive: true, force: true });
    }
  });
