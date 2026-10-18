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
      enabled: true, receiverHost: '127.0.0.1', receiverPort: ports.osc,
      oscQueryEnabled: scenario === 'query', oscQueryUrl: `http://127.0.0.1:${ports.query}`, oscQueryReceiver: { enabled: false },
      hub: { enabled: scenario === 'query', mode: 'EventDriven', targets: [{ id: 'mock-hub', name: 'Mock Hub', host: '127.0.0.1', port: ports.hub, enabled: true }] },
    },
    signals: scenario === 'sps' ? [{ oscPath: 'OGB/Orf/Test/PenSelfNewRoot', sourceMode: 'SpsSocketDepth', role: 'Depth' }]
      : scenario === 'query' ? [{ oscPath: 'QueryDepth', role: 'Depth' }] : structuredClone(presets.find(p => p.id === 'sensa-quick-start').mappings),
  };
}

export async function startTestRig(peers, scenario, expect) {
  if (process.env.GITHUB_ACTIONS !== 'true') throw new Error('Full-process E2E is CI-only / 完整进程 E2E 仅允许在 CI 执行');
  const directory = await mkdtemp(path.join(tmpdir(), 'sensa-e2e-'));
  const configPath = path.join(directory, 'config.json'), logs = [];
  let app;
  const stop = async () => {
    if (app && app.exitCode === null && app.signalCode === null) {
      const exited = once(app, 'exit');
      app.kill('SIGTERM');
      let timer;
      const closed = await Promise.race([exited.then(() => true), new Promise(resolve => { timer = setTimeout(() => resolve(false), 3000); })]);
      clearTimeout(timer);
      if (!closed) { app.kill('SIGKILL'); await exited; }
    }
    await rm(directory, { recursive: true, force: true });
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
    return { ...peers, baseUrl, overview, configPath, async close(info) {
      await stop();
      await info.attach('service.log', { body: logs.join(''), contentType: 'text/plain' });
      await info.attach('mock-wire.json', { body: JSON.stringify(peers.wire, null, 2), contentType: 'application/json' });
    } };
  } catch (error) { await stop(); throw error; }
}
