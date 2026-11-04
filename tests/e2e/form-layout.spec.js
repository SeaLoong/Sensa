import { test, expect, card, text, workspace } from './fixtures.js';
import { inspectModalFrame } from './ui-quality.js';

async function configuration(page, rig) {
  const response = await page.request.get(rig.baseUrl + '/api/config');
  expect(response.ok()).toBe(true);
  return response.json();
}

async function rectangle(locator) {
  return locator.evaluate(element => {
    const box = element.getBoundingClientRect();
    return { top: box.top, right: box.right, bottom: box.bottom, left: box.left, width: box.width, height: box.height };
  });
}

function contains(outer, inner, message) {
  expect(inner.left, message).toBeGreaterThanOrEqual(outer.left - 1);
  expect(inner.right, message).toBeLessThanOrEqual(outer.right + 1);
  expect(inner.top, message).toBeGreaterThanOrEqual(outer.top - 1);
  expect(inner.bottom, message).toBeLessThanOrEqual(outer.bottom + 1);
}

async function inactive(page, rig) {
  expect((await configuration(page, rig)).outputs.filter(output => output.enabled)).toHaveLength(0);
  expect((await rig.overview()).runtime.inputActive).toBe(false);
  expect(rig.wire.udp.some(line => /[LRVA]\d\d/.test(line))).toBe(false);
  expect(rig.wire.intiface.some(message => message.OutputCmd || message.LinearCmd || message.ScalarCmd || message.RotateCmd)).toBe(false);
}

for (const locale of ['zh-CN', 'en-US']) {
  test.describe('Shared form layout / 共享表单布局 ' + locale, () => {
    test.use({ locale });

    test('endpoint fields stay aligned and long drafts save or cancel through visible actions / 连接字段对齐且长草稿可保存或取消',
      { tag: ['@config', '@quality'] }, async ({ page, rig }, info) => {
        await workspace(page, '控制');
        const before = (await configuration(page, rig)).outputs.find(output => output.id === 'udp');
        const trigger = card(page, 'Mock UDP').getByRole('button', { name: await text(page, '配置'), exact: true });
        await trigger.click();
        const dialog = page.getByRole('dialog', { name: await text(page, '输出设置'), exact: true });
        const name = dialog.getByRole('textbox', { name: await text(page, '名称'), exact: true });
        const address = dialog.getByRole('textbox', { name: await text(page, '目标地址'), exact: true });
        const port = dialog.getByRole('spinbutton', { name: await text(page, '目标端口'), exact: true });
        const longName = ('Long output name / 长设备名称 — ' + 'Configured device '.repeat(5)).trim();
        await name.fill(longName);
        await address.fill('127.0.0.2');
        await port.fill('24681');
        const frame = await inspectModalFrame(dialog);
        const endpoint = { address: await rectangle(address), port: await rectangle(port) };
        expect(Math.abs(endpoint.address.bottom - endpoint.port.bottom), 'Endpoint input lower edges / 连接字段底沿对齐').toBeLessThanOrEqual(1);
        expect(endpoint.address.right, 'Address and port do not overlap / 地址与端口不重叠').toBeLessThanOrEqual(endpoint.port.left);
        expect(endpoint.address.width, 'Address gets the wider field / 地址获得较宽输入区域').toBeGreaterThanOrEqual(endpoint.port.width);
        expect(endpoint.port.width, 'Port retains readable width / 端口保留可读宽度').toBeGreaterThanOrEqual(80);
        expect(endpoint.port.width, 'Port does not consume half the form / 端口不占用半个表单').toBeLessThanOrEqual(128);
        contains(frame.body, endpoint.address, 'Address is contained / 地址完整容纳');
        contains(frame.body, endpoint.port, 'Port is contained / 端口完整容纳');
        const save = dialog.getByRole('button', { name: await text(page, '保存输出'), exact: true });
        const cancel = dialog.getByRole('button', { name: await text(page, '取消'), exact: true });
        await expect(save).toBeEnabled();
        contains(frame.footer, await rectangle(save), 'Save remains in the action bar / 保存操作在操作栏内');
        contains(frame.footer, await rectangle(cancel), 'Cancel remains in the action bar / 取消操作在操作栏内');
        await info.attach('endpoint-layout-' + locale, { body: await page.screenshot({ fullPage: false }), contentType: 'image/png' });
        await cancel.click();
        await expect(dialog).toBeHidden();
        expect((await configuration(page, rig)).outputs.find(output => output.id === 'udp')).toEqual(before);

        await trigger.click();
        await expect(name).toHaveValue(before.name);
        await expect(address).toHaveValue(before.host);
        await expect(port).toHaveValue(String(before.port));
        await name.fill(longName);
        await address.fill('127.0.0.2');
        await port.fill('24681');
        await save.click();
        await expect(dialog).toBeHidden();
        await expect.poll(async () => (await configuration(page, rig)).outputs.find(output => output.id === 'udp')?.name).toBe(longName);
        const saved = (await configuration(page, rig)).outputs.find(output => output.id === 'udp');
        expect(saved).toMatchObject({ name: longName, host: '127.0.0.2', port: 24681, enabled: false });
        const output = card(page, longName), identity = await rectangle(output.locator('.output-identity'));
        const heading = output.getByRole('heading', { name: longName, exact: true });
        const headingText = await heading.evaluate(element => {
          const range = document.createRange(); range.selectNodeContents(element);
          const box = range.getBoundingClientRect();
          return { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
        });
        contains(identity, headingText, 'Long output name stays in its identity column / 长名称保留在身份列内');
        await inactive(page, rig);
        await info.attach('endpoint-layout.json', { body: JSON.stringify({ locale, frame, endpoint, saved, headingText }), contentType: 'application/json' });
      });

    test('long dialogs scroll content while header, footer and keyboard actions stay accessible / 长弹窗滚动正文且标题操作与键盘可达',
      { tag: ['@config', '@quality'] }, async ({ page, rig }, info) => {
        await workspace(page, '控制');
        const before = (await configuration(page, rig)).outputs.find(output => output.id === 'intiface');
        await card(page, 'Mock Intiface').getByRole('button', { name: await text(page, '配置'), exact: true }).click();
        const dialog = page.getByRole('dialog', { name: await text(page, '输出设置'), exact: true });
        const mappings = dialog.getByTestId('intiface-feature-mappings');
        if (!await mappings.evaluate(element => element.open)) await mappings.locator('summary').click();
        for (let index = 0; index < 3; index++) {
          await mappings.getByRole('button', { name: await text(page, '添加执行器映射'), exact: true }).click();
          const route = mappings.getByTestId('intiface-feature-route').nth(index);
          await route.getByRole('textbox', { name: await text(page, '匹配设备名称'), exact: true }).fill('Layout device ' + index);
          await route.getByRole('spinbutton', { name: await text(page, '特征索引'), exact: true }).fill(String(index));
        }
        const body = dialog.locator('.modal__body');
        await body.evaluate(element => { element.scrollTop = 0; });
        const top = await inspectModalFrame(dialog);
        expect(top.body.scrollHeight, 'Real form content requires scrolling / 实际表单需要滚动').toBeGreaterThan(top.body.clientHeight + 1);
        await body.evaluate(element => { element.scrollTop = element.scrollHeight; });
        await expect.poll(() => body.evaluate(element => Math.abs(element.scrollHeight - element.clientHeight - element.scrollTop))).toBeLessThanOrEqual(1);
        const bottom = await inspectModalFrame(dialog);
        expect(bottom.body.scrollTop).toBeGreaterThan(0);
        for (const region of ['header', 'footer']) {
          expect(Math.abs(bottom[region].top - top[region].top), region + ' stays fixed / 区域位置稳定').toBeLessThanOrEqual(1);
          expect(Math.abs(bottom[region].bottom - top[region].bottom), region + ' stays fixed / 区域位置稳定').toBeLessThanOrEqual(1);
        }
        const lastAxis = mappings.getByTestId('intiface-feature-route').last().getByLabel(await text(page, '来源轴'), { exact: true });
        await lastAxis.focus();
        await expect(lastAxis).toBeFocused();
        const focused = await inspectModalFrame(dialog);
        expect(focused.focused).not.toBeNull();
        contains(focused.body, focused.focused, 'Keyboard focus is not obscured by chrome / 键盘焦点不被标题或操作栏遮挡');
        const save = dialog.getByRole('button', { name: await text(page, '保存输出'), exact: true });
        await expect(save).toBeEnabled();
        await save.focus();
        const first = dialog.locator('button:visible:not([disabled]), input:visible:not([disabled]), select:visible:not([disabled]), summary:visible, [tabindex="0"]:visible').first();
        await save.press('Tab');
        await expect(first).toBeFocused();
        const emergency = dialog.getByRole('button', { name: await text(page, '紧急停止'), exact: true });
        await expect(emergency).toBeEnabled();
        contains(bottom.header, await rectangle(emergency), 'Emergency stop stays in the header / 急停入口始终位于标题栏');
        const cancel = dialog.getByRole('button', { name: await text(page, '取消'), exact: true });
        contains(bottom.footer, await rectangle(cancel), 'Cancel stays in the footer / 取消入口始终位于操作栏');
        await info.attach('long-dialog-layout-' + locale, { body: await page.screenshot({ fullPage: false }), contentType: 'image/png' });
        await cancel.click();
        await expect(dialog).toBeHidden();
        expect((await configuration(page, rig)).outputs.find(output => output.id === 'intiface')).toEqual(before);
        await inactive(page, rig);
        await info.attach('long-dialog-layout.json', { body: JSON.stringify({ locale, top, bottom, focused }), contentType: 'application/json' });
      });
  });
}
