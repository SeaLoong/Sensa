import { test, expect } from './fixtures.js';
import { addWorkbenchOutput, inputActivation, manualMotion, openWorkbench } from './websensa-workbench.js';

async function installMockBluetooth(page, { sameDevice = false } = {}) {
  await page.addInitScript(({ sameDevice: sharedDevice }) => {
    const state = { events: [], devices: [], sameDevice: sharedDevice, hardwareExecution: false };
    globalThis.websensaGattFixture = state;
    const makeDevice = profile => {
      const listeners = new Map();
      const id = profile + '-' + (state.sameDevice ? 'shared' : state.devices.length);
      const service = profile === 'lovense-single' ? '53300001-0023-4bd4-bbd5-a6920e4c5653' : '0000fff0-0000-1000-8000-00805f9b34fb';
      const characteristic = profile === 'lovense-single' ? '53300002-0023-4bd4-bbd5-a6920e4c5653' : '0000fff6-0000-1000-8000-00805f9b34fb';
      const device = {
        id, name: profile === 'lovense-single' ? 'LVS-S CI' : 'VX001_CI',
        addEventListener: (name, listener) => listeners.set(name, listener),
        removeEventListener: name => listeners.delete(name),
        gatt: {
          connected: false,
          async connect() {
            this.connected = true; state.events.push({ type: 'connect', id, profile });
            return { async getPrimaryServices() { return [{ uuid: service,
              async getCharacteristic(requested) {
                if (requested !== characteristic) throw new Error('Unexpected GATT characteristic');
                return { properties: { writeWithoutResponse: true, write: false },
                  async writeValueWithoutResponse(bytes) {
                    if (!device.gatt.connected) throw new Error('Mock GATT disconnected');
                    state.events.push({ type: 'write', id, profile, characteristic,
                      bytes: [...new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)] });
                  },
                };
              },
            }]; } };
          },
          disconnect() {
            this.connected = false; state.events.push({ type: 'disconnect', id, profile });
            listeners.get('gattserverdisconnected')?.();
          },
        },
      };
      state.devices.push(device);
      return device;
    };
    Object.defineProperty(navigator, 'bluetooth', { configurable: true, value: {
      async requestDevice(options) {
        const profile = options.filters.some(item => item.namePrefix === 'LVS-') ? 'lovense-single' : 'youou-vx001';
        state.events.push({ type: 'choose', profile });
        const prior = state.sameDevice && state.devices.find(item => item.id.startsWith(profile));
        return prior || makeDevice(profile);
      },
    } });
  }, { sameDevice });
}
async function addBluetoothOutput(page, profile, name) {
  return addWorkbenchOutput(page, 'Bluetooth', null, { profile, name });
}
const packets = (page, profile) => page.evaluate(profileId => globalThis.websensaGattFixture.events
  .filter(item => item.type === 'write' && item.profile === profileId).map(item => item.bytes), profile);

function checkYouou(packetList) {
  expect(packetList.length).toBeGreaterThan(0);
  for (let index = 0; index < packetList.length; index++) {
    const packet = packetList[index];
    expect(packet).toHaveLength(17);
    expect(packet.slice(0, 6)).toEqual([0xaa, 0x55, index & 255, 2, 3, 1]);
    expect(packet[8]).toBe(packet.slice(0, 8).reduce((a, b) => a ^ b, 0));
    expect(packet.slice(9)).toEqual([0xff, 0, 0, 0, 0, 0, 0, 0]);
    expect([0, 247]).toContain(packet[6]);
    expect(packet[7]).toBe(packet[6] > 0 ? 1 : 0);
  }
}

test('WebSensa drives two BLE device families with independent wire sequences and final zero / 网页工作台双蓝牙设备强度与独立停止',
  { tag: ['@input', '@transport', '@config'] }, async ({ page, rig }, info) => {
    await installMockBluetooth(page);
    await openWorkbench(page, rig.baseUrl + '/websensa/?lang=en');
    await addBluetoothOutput(page, 'lovense-single', 'Lovense CI');
    await expect(page.getByText('Lovense CI', { exact: true })).toBeVisible();
    await addBluetoothOutput(page, 'youou-vx001', 'Youou CI');
    await expect(page.locator('.output-card')).toHaveCount(2);
    // Saving another output may stop an already connected device. Preparing
    // connections must never produce a nonzero target before input is enabled.
    expect((await packets(page, 'lovense-single')).every(packet =>
      new TextDecoder().decode(Uint8Array.from(packet)) === 'Vibrate:0;')).toBe(true);
    expect((await packets(page, 'youou-vx001')).every(packet => packet[6] === 0 && packet[7] === 0)).toBe(true);
    const vibrationAxis = page.getByRole('checkbox', { name: 'V0', exact: true });
    await vibrationAxis.click(); await expect(vibrationAxis).toBeChecked();
    const strokeAxis = page.getByRole('checkbox', { name: 'L0', exact: true });
    await strokeAxis.click(); await expect(strokeAxis).not.toBeChecked();
    await manualMotion(page, 'V0', 999);
    const activation = inputActivation(page);
    await activation.click();
    await expect(activation).toBeChecked();
    await expect.poll(async () => (await packets(page, 'lovense-single')).some(packet =>
      new TextDecoder().decode(Uint8Array.from(packet)) === 'Vibrate:20;')).toBe(true);
    await expect.poll(async () => (await packets(page, 'youou-vx001')).some(packet => packet[6] === 247)).toBe(true);
    await activation.click();
    await expect(activation).not.toBeChecked();
    await expect.poll(async () => new TextDecoder().decode(Uint8Array.from((await packets(page, 'lovense-single')).at(-1) || []))).toBe('Vibrate:0;');
    await expect.poll(async () => (await packets(page, 'youou-vx001')).at(-1)?.[6]).toBe(0);
    const first = await packets(page, 'lovense-single');
    const second = await packets(page, 'youou-vx001');
    expect(first.every(packet => ['Vibrate:20;', 'Vibrate:0;'].includes(new TextDecoder().decode(Uint8Array.from(packet))))).toBe(true);
    checkYouou(second);
    for (const name of ['Lovense CI', 'Youou CI']) {
      await page.locator('.output-card').filter({ has: page.getByText(name, { exact: true }) })
        .getByRole('button', { name: 'Remove', exact: true }).click();
    }
    await expect(page.locator('.output-card')).toHaveCount(0);
    const events = await page.evaluate(() => globalThis.websensaGattFixture.events);
    expect(events.filter(event => event.type === 'connect')).toHaveLength(2);
    expect(events.filter(event => event.type === 'disconnect')).toHaveLength(2);
    await info.attach('websensa-bluetooth-two-devices.json', {
      body: JSON.stringify({ hardwareExecution: false, mockGatt: true, events }), contentType: 'application/json',
    });
  });

test('WebSensa prevents competing outputs for one selected Bluetooth device / 同一蓝牙设备不重复创建竞争输出',
  { tag: ['@transport', '@config'] }, async ({ page, rig }) => {
    await installMockBluetooth(page, { sameDevice: true });
    await openWorkbench(page, rig.baseUrl + '/websensa/?lang=en');
    const first = await addBluetoothOutput(page, 'youou-vx001', 'First device');
    await expect(page.locator('.output-card')).toHaveCount(1);
    // The second configuration may be saved, but it cannot acquire an owned GATT
    // device. Verify the real connection and owner rather than deleting the draft.
    await page.getByTestId('output-type').selectOption('Bluetooth');
    await page.getByTestId('add-output').click();
    const dialog = page.getByRole('dialog', { name: 'Output settings', exact: true });
    await dialog.getByLabel('Name', { exact: true }).fill('Duplicate device');
    await dialog.getByLabel('Bluetooth protocol', { exact: true }).selectOption('youou-vx001');
    await dialog.getByRole('button', { name: 'Save output', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    const duplicate = page.locator('.output-card').filter({ has: page.getByRole('heading', { name: 'Duplicate device', exact: true }) });
    await duplicate.getByRole('button', { name: 'Enable', exact: true }).click();
    await expect(duplicate.getByRole('alert')).toContainText('already connected');
    await expect(first.locator('.output-identity').getByText('Connected', { exact: true })).toBeVisible();
    expect((await page.evaluate(() => globalThis.websensaGattFixture.events)).filter(event => event.type === 'connect')).toHaveLength(1);
    await duplicate.getByRole('button', { name: 'Remove', exact: true }).click();
    await first.getByRole('button', { name: 'Remove', exact: true }).click();
    await expect(page.locator('.output-card')).toHaveCount(0);
    const replacement = await addBluetoothOutput(page, 'youou-vx001', 'Replacement device');
    expect((await page.evaluate(() => globalThis.websensaGattFixture.events)).filter(event => event.type === 'connect')).toHaveLength(2);
    await replacement.getByRole('button', { name: 'Remove', exact: true }).click();
    await expect(page.locator('.output-card')).toHaveCount(0);
  });
