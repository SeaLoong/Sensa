import { test, expect, text, oscWorkspace } from './fixtures.js';

// This tests a large client snapshot, not OSC throughput or real device latency.
// 客户端大目录检查，不把模拟状态当作 OSC 吞吐量或真实设备延迟证据。
test('large parameter catalogs keep browsing and path editing bounded without activating input',
  { tag: ['@osc', '@config', '@quality'] }, async ({ page, rig }, info) => {
    let generation = 0, timer, fixedValue = null, sourceKey = 'catalog-fixture';
    const paths = Array.from({ length: 4096 }, (_, index) => `Load/Parameter${String(index).padStart(5, '0')}`);
    await page.routeWebSocket('**/api/ws', route => {
      const server = route.connectToServer();
      const populate = state => {
        const value = fixedValue ?? String(++generation);
        if (fixedValue !== null) generation++;
        state.osc.preview = paths.map(path => ({ path, value, numericValue: Number(value),
          sourceKey, sourceLabel: 'Catalog fixture', timestampMs: Date.now(),
          classification: { relevance: 0 } }));
        state.osc.sources = [{ key: sourceKey, label: 'Catalog fixture' }];
        state.osc.selectedSourceKey = null;
      };
      server.onMessage(raw => {
        const message = JSON.parse(String(raw));
        const state = message.type === 'state' ? message.data
          : message.data?.osc && message.data?.runtime ? message.data : null;
        if (state?.osc) {
          populate(state);
          if (message.type === 'state' && !timer) timer = setInterval(() => {
            populate(state);
            route.send(JSON.stringify(message));
          }, 100);
        }
        route.send(JSON.stringify(message));
      });
    });
    try {
      await page.reload();
      expect((await rig.overview()).input.mode).toBe('manual');
      await oscWorkspace(page, '参数');
      const rows = page.locator('.parameter-table tbody tr');
      await expect(rows).toHaveCount(100);
      await expect(rows.first().locator('.parameter-link')).toHaveText(paths[0]);
      const next = page.getByRole('button', { name: await text(page, '下一页'), exact: true });
      const previous = page.getByRole('button', { name: await text(page, '上一页'), exact: true });
      await next.click();
      await expect(rows.first().locator('.parameter-link')).toHaveText(paths[100]);
      const value = await rows.first().locator('.parameter-value').innerText();
      await expect.poll(() => rows.first().locator('.parameter-value').innerText()).not.toBe(value);
      await expect(rows.first().locator('.parameter-link')).toHaveText(paths[100]);
      await expect(rows).toHaveCount(100);
      const pageNumber = page.getByRole('combobox', { name: await text(page, '页码'), exact: true });
      await pageNumber.selectOption('41');
      await expect(rows).toHaveCount(96);
      await expect(rows.first().locator('.parameter-link')).toHaveText(paths[4000]);
      await expect(next).toBeDisabled();
      const lastPageValue = await rows.first().locator('.parameter-value').innerText();
      await expect.poll(() => rows.first().locator('.parameter-value').innerText()).not.toBe(lastPageValue);
      await expect(pageNumber).toHaveValue('41');
      const search = page.getByRole('searchbox', { name: await text(page, '搜索参数'), exact: true });
      await search.fill('04095');
      await expect(rows).toHaveCount(1);
      await expect(rows.first().locator('.parameter-link')).toHaveText(paths.at(-1));
      await search.clear();
      await expect(previous).toBeDisabled();
      await expect(pageNumber).toHaveValue('1');
      await expect(rows).toHaveCount(100);

      // Follow the opened source only, including when another source uses the same path.
      // 详情只跟随打开时的来源；同名路径不能替代已消失的来源。
      fixedValue = '10000';
      await expect(rows.first().locator('.parameter-value')).toHaveText(fixedValue);
      await rows.first().locator('.parameter-link').click();
      const detail = page.getByRole('dialog', { name: await text(page, '参数含义'), exact: true });
      const detailValue = detail.getByTestId('parameter-detail-value');
      const detailStatus = detail.getByTestId('parameter-detail-status');
      await expect(detailValue).toHaveText('10000');
      await expect(detailStatus).toHaveText(await text(page, '随接收更新'));
      fixedValue = '10001';
      await expect(detailValue).toHaveText('10001');
      sourceKey = 'other-catalog-fixture';
      fixedValue = '10002';
      await expect(detailStatus).toHaveText(await text(page, '参数已离开当前目录，显示打开时的样本。'));
      await expect(detailValue).toHaveText('10000');
      sourceKey = 'catalog-fixture';
      await expect(detailStatus).toHaveText(await text(page, '随接收更新'));
      await expect(detailValue).toHaveText('10002');
      await detail.locator('.modal__actions').getByRole('button', { name: await text(page, '关闭'), exact: true }).click();
      fixedValue = null;
      await page.getByRole('button', { name: await text(page, '冻结预览'), exact: true }).click();
      await expect(page.getByRole('button', { name: await text(page, '继续预览'), exact: true })).toBeVisible();
      const frozenValue = await rows.first().locator('.parameter-value').innerText();
      const frozenGeneration = generation;
      await expect.poll(() => generation).toBeGreaterThan(frozenGeneration + 1);
      await expect(rows.first().locator('.parameter-value')).toHaveText(frozenValue);
      await rows.first().locator('.parameter-link').click();
      await expect(detailStatus).toHaveText(await text(page, '冻结的样本'));
      await expect(detailValue).toHaveText(frozenValue);
      const detailFrozenGeneration = generation;
      await expect.poll(() => generation).toBeGreaterThan(detailFrozenGeneration + 1);
      await expect(detailValue).toHaveText(frozenValue);
      await detail.locator('.modal__actions').getByRole('button', { name: await text(page, '关闭'), exact: true }).click();
      await page.getByRole('button', { name: await text(page, '继续预览'), exact: true }).click();
      await expect.poll(() => rows.first().locator('.parameter-value').innerText()).not.toBe(frozenValue);

      await oscWorkspace(page, '映射');
      const pathField = page.locator('.mapping-row input[list]').first();
      await expect(page.locator('.mapping-row datalist option')).toHaveCount(0);
      await pathField.fill('Load/');
      await expect(page.locator('.mapping-row datalist option')).toHaveCount(50);
      await pathField.fill('04095');
      await expect(page.locator('.mapping-row datalist option')).toHaveCount(1);
      await expect(page.locator('.mapping-row datalist option')).toHaveAttribute('value', paths.at(-1));
      await pathField.fill('Custom/**; Load/Parameter04095');
      await pathField.press('Tab');
      await expect(page.locator('.mapping-row datalist option')).toHaveCount(0);
      await expect(pathField).toHaveValue('Custom/**; Load/Parameter04095');
      const state = await rig.overview();
      expect(state.input.mode).toBe('manual');
      expect(state.runtime.inputActive).toBe(false);
      expect(state.outputs.every(output => !output.enabled)).toBe(true);
      expect(rig.commands.filter(command => command.method !== 'GET')).toEqual([]);
      await info.attach('catalog-limits.json', { body: JSON.stringify({ parameters: paths.length,
        maximumTableRows: 100, maximumSuggestions: 50, directPage: 41,
        sourcePinnedDetails: true, liveAndFrozenDetails: true,
        inputActive: false, frames: generation }), contentType: 'application/json' });
    } finally { clearInterval(timer); }
  });
