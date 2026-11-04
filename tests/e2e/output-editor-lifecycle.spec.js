import { test, expect, text, enable, workspace } from './fixtures.js';

// Hold acknowledgements from the real host, without replacing its configuration or device adapters.
// 延迟真实服务的应答，不替换配置保存或设备适配器。
async function holdCommandResponses(page) {
  await page.addInitScript(() => Object.defineProperty(globalThis, 'SharedWorker', { configurable: true, value: undefined }));
  const pending = new Map(), gates = new Set();
  let next = null;
  await page.routeWebSocket('**/api/ws', route => {
    const server = route.connectToServer();
    route.onMessage(raw => {
      const frame = JSON.parse(String(raw));
      if (next && frame.method === next.method && frame.path === next.path) {
        pending.set(frame.id, next);
        next = null;
      }
      server.send(raw);
    });
    server.onMessage(raw => {
      const frame = JSON.parse(String(raw)), gate = pending.get(frame.id);
      if (!gate) { route.send(raw); return; }
      pending.delete(frame.id);
      gate.response = frame;
      if (gate.released) route.send(raw);
      else gate.forward = () => route.send(raw);
    });
  });
  await page.reload();
  await expect(page.getByRole('button', { name: await text(page, '帮助'), exact: true })).toBeVisible();
  return {
    next(method, path) {
      if (next) throw new Error('A command response is already armed.');
      const gate = { method, path, response: null, released: false, forward: null,
        release() {
          gate.released = true;
          const forward = gate.forward;
          gate.forward = null;
          forward?.();
        },
      };
      gates.add(gate);
      next = gate;
      return gate;
    },
    releaseAll() { for (const gate of gates) gate.release(); },
  };
}

async function savedConfiguration(page, rig) {
  const response = await page.request.get(rig.baseUrl + '/api/config');
  expect(response.ok()).toBe(true);
  return response.json();
}

test('delayed output saves preserve edits, reopened drafts and another output editor / 延迟保存保留编辑、重开草稿和其他输出编辑器',
  { tag: ['@config', '@quality'] }, async ({ page, rig }, info) => {
    const responses = await holdCommandResponses(page), evidence = [];
    try {
      await workspace(page, '控制');
      for (const action of ['edit-current', 'reopen-same', 'open-other']) {
        const submittedName = `Saved UDP ${action}`, draftName = `Unsaved draft ${action}`;
        await page.locator('[data-output-id="udp"]').getByRole('button', { name: await text(page, '配置'), exact: true }).click();
        const dialog = page.getByRole('dialog', { name: await text(page, '输出设置'), exact: true });
        const name = dialog.getByRole('textbox', { name: await text(page, '名称'), exact: true });
        await name.fill(submittedName);
        const gate = responses.next('PUT', '/api/config');
        await dialog.getByRole('button', { name: await text(page, '保存输出'), exact: true }).click();
        await expect.poll(() => gate.response?.ok).toBe(true);
        await expect(dialog.getByRole('button', { name: await text(page, '保存输出'), exact: true })).toBeDisabled();
        const cancel = dialog.getByRole('button', { name: await text(page, '取消'), exact: true });
        await expect(cancel).toBeEnabled();
        if (action !== 'edit-current') {
          await cancel.click();
          await expect(dialog).toBeHidden();
          const reopenedId = action === 'open-other' ? 'tcp' : 'udp';
          await page.locator(`[data-output-id="${reopenedId}"]`).getByRole('button', { name: await text(page, '配置'), exact: true }).click();
        }
        await name.fill(draftName);
        gate.release();
        // Waiting for Save to become enabled also waits for refreshOverview and the old handler to finish.
        // 保存恢复可用时，旧请求及其后续状态刷新已结束。
        await expect(dialog.getByRole('button', { name: await text(page, '保存输出'), exact: true })).toBeEnabled();
        await expect(dialog).toBeVisible();
        await expect(name).toHaveValue(draftName);
        const saved = await savedConfiguration(page, rig);
        expect(saved.outputs.find(output => output.id === 'udp').name).toBe(submittedName);
        expect(saved.outputs.find(output => output.id === 'tcp').name).toBe('Mock TCP');
        expect(saved.outputs.every(output => !output.enabled)).toBe(true);
        expect((await rig.overview()).runtime.inputActive).toBe(false);
        evidence.push({ action, submittedName, retainedDraftName: await name.inputValue() });
        await dialog.getByRole('button', { name: await text(page, '取消'), exact: true }).click();
        await expect(dialog).toBeHidden();
      }
      await info.attach('output-editor-lifecycle.json', { body: JSON.stringify(evidence), contentType: 'application/json' });
    } finally { responses.releaseAll(); }
  });

test('Intiface scanning follows connection and pending command state / Intiface 扫描遵循连接及命令执行状态',
  { tag: ['@config', '@transport', '@quality'] }, async ({ page, rig }, info) => {
    const responses = await holdCommandResponses(page);
    try {
      await workspace(page, '控制');
      const output = page.locator('[data-output-id="intiface"]');
      await output.locator('summary').filter({ hasText: await text(page, '设备扫描') }).click();
      const start = output.getByRole('button', { name: await text(page, '开始扫描'), exact: true });
      const stop = output.getByRole('button', { name: await text(page, '停止扫描'), exact: true });
      await expect(start).toBeDisabled();
      await expect(stop).toBeDisabled();
      expect(rig.wire.intiface.some(message => message.StartScanning || message.StopScanning)).toBe(false);

      await enable(page, ['Mock Intiface']);
      await expect(start).toBeEnabled();
      await expect(stop).toBeEnabled();
      for (const scan of [
        { button: start, pending: '正在开始扫描…', path: 'scan-start', wire: 'StartScanning' },
        { button: stop, pending: '正在停止扫描…', path: 'scan-stop', wire: 'StopScanning' },
      ]) {
        const before = rig.wire.intiface.filter(message => message[scan.wire]).length;
        const gate = responses.next('POST', `/api/control/output/intiface/${scan.path}`);
        await scan.button.click();
        await expect.poll(() => gate.response?.ok).toBe(true);
        await expect(output.getByRole('button', { name: await text(page, scan.pending), exact: true })).toBeDisabled();
        const other = scan.path === 'scan-start' ? stop : start;
        await expect(other).toBeDisabled();
        expect(rig.wire.intiface.filter(message => message[scan.wire])).toHaveLength(before + 1);
        if (scan.path === 'scan-start') {
          // Emergency operations may replace the global busy action, but cannot finish this scan request.
          // 急停操作会改变全局忙碌状态，但扫描的在途应答仍独立等待。
          const emergency = page.getByRole('button', { name: await text(page, '紧急停止'), exact: true });
          await expect(emergency).toBeEnabled();
          await emergency.click();
          const clear = page.getByRole('button', { name: await text(page, '解除急停'), exact: true });
          await expect(clear).toBeEnabled();
          expect((await rig.overview()).runtime.isEmergency).toBe(true);
          await expect(output.getByRole('button', { name: await text(page, scan.pending), exact: true })).toBeDisabled();
          await expect(stop).toBeDisabled();
          await clear.click();
          await expect(emergency).toBeEnabled();
          expect((await rig.overview()).runtime.isEmergency).toBe(false);
          await expect(output.getByRole('button', { name: await text(page, scan.pending), exact: true })).toBeDisabled();
          await expect(stop).toBeDisabled();
          expect(rig.wire.intiface.filter(message => message.StartScanning)).toHaveLength(before + 1);
        }
        gate.release();
        await expect(start).toBeEnabled();
        await expect(stop).toBeEnabled();
      }
      await output.getByRole('button', { name: await text(page, '禁用'), exact: true }).click();
      await expect(start).toBeDisabled();
      await expect(stop).toBeDisabled();
      expect((await rig.overview()).runtime.inputActive).toBe(false);
      expect(rig.wire.intiface.some(message => message.OutputCmd)).toBe(false);
      await info.attach('intiface-scan-state.json', { body: JSON.stringify({ fixtureOnly: true,
        wire: rig.wire.intiface.filter(message => message.StartScanning || message.StopScanning) }), contentType: 'application/json' });
    } finally { responses.releaseAll(); }
  });
