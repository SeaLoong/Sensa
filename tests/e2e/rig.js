import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ports } from './mocks.js';
import presets from '../../src/web/data/osc-presets.json' with { type: 'json' };
import motion from '../../src/web/data/first-run-motion.json' with { type: 'json' };

// Pure fixture construction can be checked without starting Sensa or a device.
// 纯配置构建可在不启动 Sensa 或设备的情况下检查。
export function createRigConfiguration(scenario, serialPort) {
  if (!serialPort?.startsWith('/dev/pts/')) throw new Error('CI pseudo terminal required / 必须使用 CI 伪终端');
  if (!['quickstart', 'sps', 'query'].includes(scenario)) throw new Error('Unknown CI scenario / 未知 CI 场景');
  return {
    webUi: { host: '127.0.0.1', port: ports.web, autoOpenBrowser: false },
    outputs: [
      { id: 'udp', name: 'Mock UDP', type: 'TCodeUdp', host: '127.0.0.1', port: ports.udp },
      { id: 'tcp', name: 'Mock TCP', type: 'TCodeTcp', host: '127.0.0.1', port: ports.tcp },
      { id: 'serial', name: 'Mock Serial', type: 'TCodeSerial', comPort: serialPort },
      { id: 'intiface', name: 'Mock Intiface', type: 'Intiface', manageEngineProcess: false, websocketAddress: `ws://127.0.0.1:${ports.intiface}` },
    ].map(output => ({ ...output, enabled: false, motionProfileId: 'test-profile' })),
    axisProfiles: [{ id: 'test-profile', name: 'CI L0 400-600', isDefault: true, motion: structuredClone(motion) }],
    osc: {
      enabled: true, receiverHost: '127.0.0.1', receiverPort: ports.osc, allowExperimentalSpatialInput: false,
      oscQueryEnabled: scenario === 'query', oscQueryUrl: `http://127.0.0.1:${ports.query}`, oscQueryReceiver: { enabled: false },
      hub: { enabled: scenario === 'query', mode: 'EventDriven', targets: [{ id: 'mock-hub', name: 'Mock Hub', host: '127.0.0.1', port: ports.hub, enabled: true }] },
    },
    signals: scenario === 'sps' ? [{ oscPath: 'OGB/Orf/Test/PenOthersNewRoot', sourceMode: 'SpsSocketDepth', role: 'Depth' }]
      : scenario === 'query' ? [{ oscPath: 'QueryDepth', role: 'Depth' }] : structuredClone(presets.find(p => p.id === 'sensa-quick-start').mappings),
  };
}

export async function startTestRig(peers, scenario, expect) {
  if (process.env.GITHUB_ACTIONS !== 'true') throw new Error('Full-process E2E is CI-only / 完整进程 E2E 仅允许在 CI 执行');
  const directory = await mkdtemp(path.join(tmpdir(), 'sensa-e2e-'));
  const configPath = path.join(directory, 'config.json'), logs = [];
  let app;
  const feeds = new Set();
  const stop = async () => {
    const feedResults = await Promise.allSettled([...feeds].map(feed => feed.stop()));
    if (app && app.exitCode === null && app.signalCode === null) {
      const exited = once(app, 'exit');
      app.kill('SIGTERM');
      let timer;
      const closed = await Promise.race([exited.then(() => true), new Promise(resolve => { timer = setTimeout(() => resolve(false), 3000); })]);
      clearTimeout(timer);
      if (!closed) { app.kill('SIGKILL'); await exited; }
    }
    await rm(directory, { recursive: true, force: true });
    const failed = feedResults.find(result => result.status === 'rejected');
    if (failed) throw failed.reason;
  };
  try {
    peers.reset();
    await writeFile(configPath, JSON.stringify(createRigConfiguration(scenario, peers.serialPort)));
    app = spawn('dotnet', [path.resolve('artifacts/e2e/app/Sensa.dll')], { cwd: directory, env: { ...process.env, SENSA_CONFIG_PATH: configPath }, stdio: ['ignore', 'pipe', 'pipe'] });
    let spawnError;
    app.on('error', error => { spawnError = error; });
    app.stdout.on('data', bytes => logs.push(bytes.toString()));
    app.stderr.on('data', bytes => logs.push(bytes.toString()));
    const baseUrl = `http://127.0.0.1:${ports.web}`;
    let cookie;
    await expect.poll(async () => {
      if (spawnError) throw spawnError;
      if (app.exitCode !== null) throw new Error(logs.join(''));
      try {
        const response = await fetch(baseUrl + '/api/session');
        cookie = response.headers.get('set-cookie')?.split(';')[0];
        return response.status;
      } catch { return 0; }
    }, { timeout: 30000 }).toBe(204);
    expect(cookie, 'Session cookie / 会话认证 Cookie').toBeTruthy();
    peers.reset();
    const overview = async () => {
      const response = await fetch(baseUrl + '/api/state/overview', { headers: { Cookie: cookie } });
      if (!response.ok) throw new Error(`Overview rejected / 状态读取失败: ${response.status}`);
      return response.json();
    };
    // A feed sends whole range sets and owns at most one pending UDP batch.
    // 持续输入发送完整通道组，停止会等待在途批次；不会跨场景遗留定时器。
    const startFeed = async (initial, intervalMs = 80) => {
      let entries = initial, stopped = false, pending = Promise.resolve(), timer, failure;
      const emit = async () => {
        if (stopped) return;
        pending = peers.send(entries).catch(error => { failure = error; });
        await pending;
        if (!stopped && !failure) timer = setTimeout(emit, intervalMs);
      };
      const feed = {
        async set(next) {
          await pending; clearTimeout(timer);
          if (stopped) throw new Error('Feed already stopped / 输入已停止');
          if (failure) throw failure;
          entries = next; await emit(); if (failure) throw failure;
        },
        async stop() { stopped = true; clearTimeout(timer); await pending; feeds.delete(feed); if (failure) throw failure; },
      };
      feeds.add(feed);
      await emit();
      if (failure) await feed.stop();
      return feed;
    };
    return { ...peers, baseUrl, overview, configPath, startFeed, async close(info) {
      try { await stop(); } finally {
        await info.attach('service.log', { body: logs.join(''), contentType: 'text/plain' });
        await info.attach('mock-wire.json', { body: JSON.stringify(peers.wire, null, 2), contentType: 'application/json' });
      }
    } };
  } catch (error) { await stop(); throw error; }
}
