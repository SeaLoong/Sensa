import { test, expect, active, observePageCommands } from './fixtures.js';

async function instrumentSharing(context, kind) {
  await context.addInitScript(mode => {
    globalThis.__sharedSessionFixture = { workerReady: false, leader: false };
    if (mode === 'shared-worker') {
      if (typeof globalThis.SharedWorker !== 'function') throw new Error('SharedWorker must be available in this Chromium test');
      const NativeWorker = globalThis.SharedWorker;
      globalThis.SharedWorker = class extends NativeWorker {
        constructor(...args) {
          super(...args);
          this.port.addEventListener('message', event => {
            if (event.data?.type === 'status' && event.data.value === 'connected') globalThis.__sharedSessionFixture.workerReady = true;
          });
        }
      };
    } else {
      Object.defineProperty(globalThis, 'SharedWorker', { configurable: true, value: undefined });
      if (!navigator.locks || !globalThis.BroadcastChannel) throw new Error('Web Locks and BroadcastChannel must be available');
      const request = navigator.locks.request.bind(navigator.locks);
      navigator.locks.request = (name, options, callback) => request(name, options, async lock => {
        globalThis.__sharedSessionFixture.leader = true;
        try { return await callback(lock); } finally { globalThis.__sharedSessionFixture.leader = false; }
      });
    }
  }, kind);
}

for (const kind of ['shared-worker', 'web-locks']) {
  test('twenty pages share commands, release clients and reconnect without replay / 二十页共享连接并独立释放 ' + kind,
    { tag: ['@transport', '@input', '@config'] }, async ({ context, rig }, info) => {
      await instrumentSharing(context, kind);
      const pages = [], commands = [], errors = [];
      async function open() {
        const page = await context.newPage(); pages.push(page);
        page.on('pageerror', error => errors.push(error.message));
        await observePageCommands(page, command => commands.push(command));
        await page.goto(rig.baseUrl);
        await expect(page.getByRole('heading', { name: 'Mock UDP', exact: true })).toBeVisible();
        await expect(page.getByRole('switch', { name: '输入启用', exact: true })).toBeEnabled();
        if (kind === 'shared-worker') await expect.poll(() => page.evaluate(() => globalThis.__sharedSessionFixture.workerReady)).toBe(true);
        return page;
      }
      try {
        // More pages than the host's sixteen physical WebSocket slots.
        // 超过主机十六条物理 WebSocket 的上限，验证页面不会耗尽连接槽。
        for (let batch = 0; batch < 4; batch++) await Promise.all(Array.from({ length: 5 }, open));
        await expect.poll(async () => (await rig.overview()).webUiConnections).toBe(1);
        expect(pages).toHaveLength(20);
        expect(commands.filter(command => command.method !== 'GET')).toEqual([]);

        // The controlled switch reflects server acknowledgement. Click once, then await
        // the confirmed state through the same helper used by the other input cases.
        // 受控开关在服务端确认后更新；单次点击后等待确认状态。
        await active(pages[1], true);
        await expect.poll(async () => (await rig.overview()).runtime.inputActive).toBe(true);
        for (const page of pages) await expect(page.getByRole('switch', { name: '输入启用', exact: true })).toBeChecked();
        await pages[0].getByRole('spinbutton', { name: 'L0 主轴数值', exact: true }).fill('314');
        await pages[0].getByRole('button', { name: '发送一次', exact: true }).click();
        await expect.poll(async () => (await rig.overview()).runtime.manualCommand.l0).toBeCloseTo(.314, 5);
        await active(pages[2], false);
        await expect.poll(async () => (await rig.overview()).runtime.inputActive).toBe(false);
        for (const page of pages) await expect(page.getByRole('switch', { name: '输入启用', exact: true })).not.toBeChecked();

        const leaders = kind === 'web-locks' ? await Promise.all(pages.map(page => page.evaluate(() => globalThis.__sharedSessionFixture.leader))) : [];
        if (kind === 'web-locks') expect(leaders.filter(Boolean)).toHaveLength(1);
        const leader = leaders.indexOf(true), closing = new Set([leader >= 0 ? leader : 0]);
        for (let index = 0; closing.size < 3; index++) closing.add(index);
        await Promise.all([...closing].map(index => pages[index].close()));
        const remaining = pages.filter(page => !page.isClosed());
        expect(remaining).toHaveLength(17);
        await expect.poll(async () => (await rig.overview()).webUiConnections).toBe(1);
        await active(remaining[0], true);
        await expect.poll(async () => (await rig.overview()).runtime.inputActive).toBe(true);
        await active(remaining[0], false);
        await expect.poll(async () => (await rig.overview()).runtime.inputActive).toBe(false);

        await Promise.all(remaining.map(page => page.close()));
        await expect.poll(async () => (await rig.overview()).webUiConnections).toBe(0);
        const replacement = await context.request.put(rig.baseUrl + '/api/input/manual', { data: {
          enabled: true, l0: 777, r0: 500, r1: 500, r2: 500, l1: 500, l2: 500,
          v0: 0, v1: 0, v2: 0, a0: 500, a1: 500, a2: 500,
        } });
        expect(replacement.ok(), await replacement.text()).toBe(true);
        await expect.poll(async () => (await rig.overview()).runtime.manualCommand.l0).toBeCloseTo(.777, 5);
        const beforeReconnect = commands.filter(command => command.method !== 'GET').length;
        const fresh = await open();
        await expect.poll(async () => (await rig.overview()).webUiConnections).toBe(1);
        const restored = (await rig.overview()).runtime;
        expect(restored.inputActive).toBe(false); expect(restored.manualCommand.l0).toBeCloseTo(.777, 5);
        expect(commands.filter(command => command.method !== 'GET')).toHaveLength(beforeReconnect);
        await expect(fresh.getByRole('switch', { name: '输入启用', exact: true })).not.toBeChecked();
        await active(fresh, true);
        await expect.poll(async () => (await rig.overview()).runtime.inputActive).toBe(true);
        expect((await rig.overview()).runtime.manualCommand.l0).toBeCloseTo(.777, 5);
        expect(rig.wire.udp).toEqual([]);
        await active(fresh, false);
        await expect.poll(async () => (await rig.overview()).runtime.inputActive).toBe(false);
        await info.attach('shared-session.json', { body: JSON.stringify({ kind, simultaneousPages: 20,
          serverConnections: 1, remainingAfterClose: 17, allClientsReleased: true,
          reconnectedWithoutMutationReplay: true, replacementManualValue: .777,
          mockOutputsOnly: true, commands: commands.map(({ body: _body, ...command }) => command),
        }), contentType: 'application/json' });
      } finally {
        await Promise.allSettled(pages.filter(page => !page.isClosed()).map(page => page.close()));
        expect(errors, 'Browser JavaScript errors / 浏览器 JavaScript 错误').toEqual([]);
      }
    });
}
