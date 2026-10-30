import { test, expect } from '@playwright/test';
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

async function launch(directory, configPath, info, label) {
  if (process.env.GITHUB_ACTIONS !== 'true') throw new Error('Node process acceptance runs only in Actions.');
  const child = spawn(process.execPath, [path.resolve('artifacts/node/sensa.cjs'), '--config', configPath, '--port', '0', '--open-browser', 'false'], {
    cwd: directory, env: { ...process.env, SENSA_RECORDINGS_PATH: path.join(directory, 'recordings') }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  const messages = [], logs = []; let failure;
  child.on('error', error => { failure = error; }); child.on('message', message => messages.push(message));
  child.stdout.on('data', data => logs.push(data.toString())); child.stderr.on('data', data => logs.push(data.toString()));
  return {
    child, messages,
    async ready() {
      await expect.poll(() => {
        if (failure) throw failure;
        if (child.exitCode !== null && !messages.some(message => message?.type === 'sensa:ready')) throw new Error(logs.join(''));
        return messages.find(message => message?.type === 'sensa:ready');
      }, { timeout: 30000 }).toBeTruthy();
      const value = messages.find(message => message?.type === 'sensa:ready');
      expect(Object.keys(value).sort()).toEqual(['configPath', 'port', 'reused', 'type', 'url']);
      const url = new URL(value.url); expect(url.origin).toBe(value.url); expect(url.hostname).toBe('127.0.0.1');
      expect(url.search).toBe(''); expect(url.username).toBe(''); expect(url.password).toBe('');
      expect(value.port).toBe(Number(url.port)); expect(value.configPath).toBe(configPath);
      return value;
    },
    async send(message) { await new Promise((resolve, reject) => child.send(message, error => error ? reject(error) : resolve())); },
    async exited() { await expect.poll(() => child.exitCode, { timeout: 15000 }).not.toBe(null); expect(child.exitCode, logs.join('')).toBe(0); },
    async close() {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGTERM');
        try { await expect.poll(() => child.exitCode ?? child.signalCode, { timeout: 5000 }).not.toBe(null); }
        catch { child.kill('SIGKILL'); await expect.poll(() => child.exitCode ?? child.signalCode, { timeout: 5000 }).not.toBe(null); }
      }
      await info.attach(`${label}.log`, { body: logs.join(''), contentType: 'text/plain' });
    },
  };
}
async function configuration(directory) {
  const configPath = path.join(directory, 'config.json');
  await writeFile(configPath, JSON.stringify({ webUi: { host: '127.0.0.1', port: 5086 }, outputs: [], protocolInputs: [],
    osc: { enabled: false, oscQueryEnabled: false, oscQueryReceiver: { enabled: false } }, signals: [], computedSignals: [] }));
  return configPath;
}

test('Node host serves the complete current-build resource manifest / Node宿主完整构建资源来源',
  { tag: ['@transport', '@config'] }, async ({ request }, info) => {
    if (process.env.GITHUB_ACTIONS !== 'true') throw new Error('Node process acceptance runs only in Actions.');
    const hash = bytes => createHash('sha256').update(bytes).digest('hex');
    const rawMetadata = await readFile(path.resolve('artifacts/node/NODE-BUILD.json'));
    const rawManifest = await readFile(path.resolve('artifacts/node/web-manifest.json'));
    await info.attach('NODE-BUILD.json', { body: rawMetadata, contentType: 'application/json' });
    await info.attach('web-manifest.json', { body: rawManifest, contentType: 'application/json' });
    const metadata = JSON.parse(rawMetadata), manifest = JSON.parse(rawManifest);
    const git = args => execFileSync('git', ['-c', `safe.directory=${process.cwd()}`, ...args], { encoding: 'utf8' }).trim();
    const sourceCommit = git(['rev-parse', 'HEAD']);
    expect(sourceCommit).toMatch(/^[a-f0-9]{40}$/);
    expect(metadata.sourceCommit).toBe(sourceCommit);
    expect(metadata.sourceCommit).toBe(process.env.SENSA_SOURCE_COMMIT);
    expect(metadata.schema).toBe(1); expect(metadata.kind).toBe('node-bundle');
    expect(metadata.nodeVersion).toBe(process.versions.node); expect(metadata.modules).toBe(process.versions.modules);
    expect(process.env.GITHUB_RUN_ID).toMatch(/^[1-9][0-9]*$/);
    expect(process.env.GITHUB_RUN_ATTEMPT).toMatch(/^[1-9][0-9]*$/);
    expect(process.env.GITHUB_REPOSITORY).toMatch(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/);
    expect(manifest.schema).toBe(1); expect(manifest.files).toEqual(metadata.resources);
    expect(hash(rawManifest)).toBe(metadata.resourceManifestSha256);
    expect(Array.isArray(metadata.resources)).toBe(true);
    expect(metadata.resources.length).toBeGreaterThanOrEqual(19);
    expect(new Set(metadata.resources.map(row => row.path)).size).toBe(metadata.resources.length);
    const directory = await mkdtemp(path.join(tmpdir(), 'sensa-node-resources-')), configPath = await configuration(directory);
    let owner;
    const proof = { schema: 1, sourceCommit, runId: process.env.GITHUB_RUN_ID, attempt: process.env.GITHUB_RUN_ATTEMPT,
      repository: process.env.GITHUB_REPOSITORY, testId: info.testId, project: info.project.name,
      kind: metadata.kind, nodeVersion: process.versions.node, modules: process.versions.modules,
      metadataSha256: hash(rawMetadata), resourceManifestSha256: hash(rawManifest),
      sourceTreeDirty: git(['status', '--porcelain']).length !== 0, baseOrigin: null, rows: [] };
    try {
      owner = await launch(directory, configPath, info, 'node-resource-owner');
      const ready = await owner.ready(); expect(ready.reused).toBe(false); proof.baseOrigin = ready.url;
      for (const resource of metadata.resources) {
        expect(resource.path).toMatch(/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/);
        expect(resource.path.split('/').some(part => part === '.' || part === '..')).toBe(false);
        expect(resource.asset).toBe('web/' + resource.path);
        expect(resource.sha256).toMatch(/^[a-f0-9]{64}$/);
        expect(Number.isSafeInteger(resource.bytes) && resource.bytes >= 0).toBe(true);
        const resourcePath = resource.path === 'index.html' ? '/' : resource.path === 'websensa/index.html' ? '/websensa/'
          : '/' + resource.path.split('/').map(encodeURIComponent).join('/');
        const url = new URL(resourcePath, ready.url);
        expect(url.origin).toBe(ready.url); expect(url.search).toBe(''); expect(url.hash).toBe('');
        const response = await request.get(url.href, { maxRedirects: 0 }), body = await response.body();
        proof.rows.push({ ...resource, url: url.href, finalUrl: response.url(), status: response.status(),
          bodySha256: hash(body), bodyBytes: body.length });
        expect(response.status(), resource.path).toBe(200); expect(response.url()).toBe(url.href);
        expect(body.length, resource.path).toBe(resource.bytes); expect(hash(body), resource.path).toBe(resource.sha256);
      }
      expect(proof.rows).toHaveLength(metadata.resources.length);
    } finally {
      await info.attach('node-host-resource-source.json', { body: JSON.stringify(proof, null, 2) + '\n', contentType: 'application/json' });
      try { await owner?.close(); } finally { await rm(directory, { recursive: true, force: true }); }
    }
  });

test('Node host IPC accepts only the narrow shutdown command and acknowledges clean ownership release / Node宿主IPC与关闭',
  { tag: ['@transport', '@config'] }, async ({ request }, info) => {
    const directory = await mkdtemp(path.join(tmpdir(), 'sensa-node-ipc-')), configPath = await configuration(directory);
    const processes = [];
    try {
      const owner = await launch(directory, configPath, info, 'node-ipc-owner'); processes.push(owner);
      const ready = await owner.ready(); expect(ready.reused).toBe(false);
      for (const invalid of [{}, [], { type: 'unknown' }, { type: 'sensa:shutdown', extra: true }]) await owner.send(invalid);
      await new Promise(resolve => setTimeout(resolve, 100));
      expect((await request.get(ready.url + '/api/session')).status()).toBe(204); expect(owner.child.exitCode).toBe(null);
      await owner.send({ type: 'sensa:shutdown' });
      await expect.poll(() => owner.messages.some(message => message?.type === 'sensa:stopped'), { timeout: 15000 }).toBe(true);
      await owner.exited(); expect(owner.messages.filter(message => message?.type === 'sensa:stopped')).toHaveLength(1);
      const saved = JSON.parse(await readFile(configPath, 'utf8')); expect(saved.webUi.port).toBe(ready.port);
      await info.attach('node-host-ipc.json', { body: JSON.stringify({ ready, ownerProcessId: owner.child.pid,
        malformedCommandsIgnored: true, shutdownAcknowledged: true, exitedNormally: true, actualPortPersisted: true, hardwareUsed: false }), contentType: 'application/json' });
    } finally { for (const instance of processes) await instance.close(); await rm(directory, { recursive: true, force: true }); }
  });

test('Node host parent disconnect stops only the owned instance while duplicate launches reuse it / Node宿主复用与父进程断开',
  { tag: ['@transport', '@config'] }, async ({ request }, info) => {
    const directory = await mkdtemp(path.join(tmpdir(), 'sensa-node-owner-')), configPath = await configuration(directory);
    const processes = [];
    try {
      const owner = await launch(directory, configPath, info, 'node-disconnect-owner'); processes.push(owner);
      const ready = await owner.ready(); expect(ready.reused).toBe(false);
      const duplicate = await launch(directory, configPath, info, 'node-disconnect-duplicate'); processes.push(duplicate);
      const reused = await duplicate.ready(); expect(reused.reused).toBe(true); expect(reused.url).toBe(ready.url);
      await duplicate.exited(); expect(owner.child.exitCode).toBe(null); expect((await request.get(ready.url + '/api/session')).status()).toBe(204);
      owner.child.disconnect(); await owner.exited();
      await expect.poll(async () => { try { return (await request.get(ready.url + '/api/session')).status(); } catch { return 0; } }, { timeout: 10000 }).toBe(0);
      await info.attach('node-host-disconnect.json', { body: JSON.stringify({ ownerProcessId: owner.child.pid, duplicateProcessId: duplicate.child.pid,
        ready, duplicateReused: true, duplicateExitKeptOwnerAlive: true, parentDisconnectStoppedOwnedHost: true, hardwareUsed: false }), contentType: 'application/json' });
    } finally { for (const instance of processes) await instance.close(); await rm(directory, { recursive: true, force: true }); }
  });
