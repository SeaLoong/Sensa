import http from 'node:http';
import { once } from 'node:events';
import { test, expect, text, workspace, active, enable } from './fixtures.js';

async function vendorApi(kind, apiVersion) {
  const requests = [];
  const server = http.createServer(async (request, response) => {
    const chunks = []; for await (const chunk of request) chunks.push(chunk);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : null;
    const path = new URL(request.url, 'http://fixture').pathname;
    requests.push({ method: request.method, path, body });
    const prefix = kind === 'Handy' ? '' : '/' + kind.toLowerCase();
    const getPaths = new Set([prefix + '/connected', prefix + '/info', ...(kind === 'Handy' ? ['/servertime'] : [prefix + '/state'])]);
    const putPaths = new Set(kind === 'Handy'
      ? [apiVersion === 3 ? '/mode2' : '/mode', '/hdsp/xpt', '/hdsp/xpvp', '/hssp/setup', '/hssp/play', '/hssp/stop', ...(apiVersion === 2 ? ['/hssp/loop'] : [])]
      : [prefix + '/sync-script/upload-csv-url', prefix + '/sync-script/loop', prefix + '/sync-script/start', prefix + '/sync-script/stop',
        ...(kind === 'Autoblow' ? ['/autoblow/goto', '/autoblow/oscillate'] : ['/vacuglide/target-speed', '/vacuglide/target-speed/stop'])]);
    const loopPath = kind === 'Handy' ? '/hssp/loop' : prefix + '/sync-script/loop';
    const validLoopBody = path !== loopPath || body && Object.keys(body).length === 1
      && typeof body[kind === 'Handy' ? 'activated' : 'loop'] === 'boolean';
    const validPlayBody = path !== '/hssp/play' || apiVersion !== 3 || typeof body?.loop === 'boolean';
    if (!(request.method === 'GET' && getPaths.has(path) || request.method === 'PUT' && putPaths.has(path)) || !validLoopBody || !validPlayBody) {
      response.writeHead(404, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ error: 'Unknown or invalid mock API operation' })); return;
    }
    const result = path.endsWith('/connected') ? { connected: true }
      : path.endsWith('/info') ? { fwVersion: apiVersion === 3 ? '4.0.0' : '3.2.0', deviceType: 'vacuglide' }
        : path.endsWith('/servertime') ? { serverTime: Date.now(), server_time: Date.now() } : { result: {} };
    response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(result));
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  return { requests, endpoint: `http://127.0.0.1:${server.address().port}/`,
    close: async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } };
}

for (const [kind, apiVersion] of [['Handy', 2], ['Handy', 3], ['Autoblow', 2], ['VacuGlide', 2]]) {
  test(`${kind} API${apiVersion} loop setting never arms or starts until explicit play / 循环设置不启用输入或自动播放`,
    { tag: ['@config', '@input', '@transport'] }, async ({ page, rig }, info) => {
      const api = await vendorApi(kind, apiVersion);
      const playing = () => api.requests.filter(request => /\/hssp\/play$|\/sync-script\/start$/.test(request.path));
      const state = async () => (await rig.overview()).outputs.find(output => output.id === 'loop-device')?.deviceApi;
      try {
        const config = await page.request.get(rig.baseUrl + '/api/config').then(response => response.json());
        const saved = await page.request.put(rig.baseUrl + '/api/config', { data: { ...config, outputs: [...config.outputs,
          { id: 'loop-device', name: 'Loop fixture', type: kind, enabled: false,
            device: { endpoint: api.endpoint, connectionKey: 'fixture-device-key', apiKey: 'fixture-app-key', apiVersion,
              axis: kind === 'VacuGlide' ? 'V0' : 'L0', scriptUrl: 'https://example.com/fixture.csv' } },
        ] } });
        expect(saved.ok(), await saved.text()).toBe(true);
        await page.reload(); await workspace(page, '控制'); await enable(page, ['Loop fixture']);
        const controls = page.locator('.output-card[data-output-id="loop-device"]').getByTestId('vendor-script-controls');
        await controls.locator('summary').click();
        const loop = controls.getByRole('checkbox', { name: await text(page, '循环播放同步脚本'), exact: true });
        await expect(loop).toBeDisabled();
        await controls.getByRole('button', { name: await text(page, '准备同步脚本'), exact: true }).click();
        await expect.poll(state).toMatchObject({ scriptPrepared: true, scriptPlaying: false, supportsScriptLoop: true, scriptLoop: false });
        // This checkbox displays confirmed device state, updated after the RPC.
        // Click once and verify both endpoints instead of requiring a local optimistic toggle.
        await expect(loop).toBeEnabled(); await loop.click();
        await expect.poll(state).toMatchObject({ scriptLoop: true, scriptPlaying: false });
        await expect(loop).toBeChecked();
        expect((await rig.overview()).runtime.inputActive).toBe(false);
        expect(playing()).toHaveLength(0);
        await active(page);
        await controls.getByRole('button', { name: await text(page, '播放同步脚本'), exact: true }).click();
        await expect.poll(state).toMatchObject({ scriptLoop: true, scriptPlaying: true });
        await expect(loop).toBeDisabled();
        expect(playing()).toHaveLength(1);
        if (kind === 'Handy' && apiVersion === 3) {
          expect(playing()[0].body.loop).toBe(true);
          expect(api.requests.some(request => request.path.endsWith('/hssp/loop'))).toBe(false);
        } else {
          const nativeLoop = api.requests.filter(request => request.path.endsWith('/loop')).at(-1);
          expect(nativeLoop.path).toBe(kind === 'Handy' ? '/hssp/loop' : `/${kind.toLowerCase()}/sync-script/loop`);
          expect(nativeLoop.body).toEqual(kind === 'Handy' ? { activated: true } : { loop: true });
        }
        await controls.getByRole('button', { name: await text(page, '停止同步脚本'), exact: true }).click();
        await expect.poll(state).toMatchObject({ scriptPlaying: false });
        await expect(loop).toBeEnabled(); await loop.click();
        await expect.poll(state).toMatchObject({ scriptLoop: false, scriptPlaying: false });
        await expect(loop).not.toBeChecked();
        expect(playing()).toHaveLength(1);
        await controls.getByRole('button', { name: await text(page, '播放同步脚本'), exact: true }).click();
        await expect.poll(state).toMatchObject({ scriptLoop: false, scriptPlaying: true });
        expect(playing()).toHaveLength(2);
        if (kind === 'Handy' && apiVersion === 3) expect(playing()[1].body.loop).toBe(false);
        else expect(api.requests.filter(request => request.path.endsWith('/loop')).at(-1).body)
          .toEqual(kind === 'Handy' ? { activated: false } : { loop: false });
        await active(page, false);
        await expect.poll(state).toMatchObject({ scriptPlaying: false });
        await info.attach('vendor-script-loop.json', { body: JSON.stringify({ fixtureOnly: true, hardwareExecution: false,
          kind, apiVersion, requests: api.requests, finalState: await state() }), contentType: 'application/json' });
      } finally { await api.close(); }
    });
}
