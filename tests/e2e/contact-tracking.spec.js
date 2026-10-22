import { test, expect, enable, mode, active, oscWorkspace, expand, allowSpatial, checkpoint, outputValue } from './fixtures.js';
import { contactRootSamples } from './mocks.js';

const prefix = 'Sensa/Contact/CIContactRoot';
const contactObservation = async rig => (await rig.overview()).poseTracking.spsRoots
  .find(root => root.kind === 'ContactRoot' && root.prefix === prefix);
const saved = async (page, rig) => (await page.request.get(rig.baseUrl + '/api/config')).json();

async function contactPanel(page, rig) {
  await oscWorkspace(page, '实验诊断');
  await expand(page, '本地点与根部');
  const panel = page.locator('#sensa-spatial-root');
  await panel.getByLabel('测量对象', { exact: true }).selectOption((await contactObservation(rig)).key);
  await expand(page, '两点量程校准');
  return panel;
}
async function savePointDraft(page, rig, panel, metric, role) {
  await panel.getByRole('button', { name: '替换草稿', exact: true }).click();
  await oscWorkspace(page, '映射');
  await expect(page.locator('.mapping-row')).toHaveCount(1);
  await page.getByRole('button', { name: '保存映射', exact: true }).click();
  await expect.poll(async () => (await saved(page, rig)).signals[0]).toMatchObject({
    sourceMode: 'SensaPoint', oscPath: prefix + '/**', pointMetric: metric, role,
  });
}

test('SDK Contact metre coordinates calibrate, contact loss and frozen activity stop / Contact 米制坐标校准、离开与活动冻结停止',
  { tag: ['@osc', '@input', '@config', '@transport', '@visual'] }, async ({ page, rig }, info) => {
    await enable(page, ['Mock UDP']); await mode(page, 'OSC');
    let z = .05, valid = true, sequence = 0, sample = 0, frozen = false, velocitySequence = 0;
    const samples = () => {
      if (!frozen) sample = (sequence++ % 32 + 1) / 32;
      return contactRootSamples(z, sample, valid, { velocityZ: .2 + (++velocitySequence % 10) * .01 });
    };
    const feed = await rig.startFeed(samples, 80);
    await expect.poll(async () => (await contactObservation(rig))?.valid).toBe(true);
    expect(await contactObservation(rig)).toMatchObject({ coordinateFrame: 'AvatarRootMeters', coordinateUnit: 'm',
      sampleCount: 3, expectedSampleCount: 3, displayHalfRange: 2, supportsVelocity: true });
    const panel = await contactPanel(page, rig);
    await expect(panel.getByTestId('point-position')).toHaveText('0.020 / 1.000 / 0.050 m');
    await expect(panel.getByTestId('point-coverage-radius')).toContainText('2.000');
    await panel.getByRole('button', { name: '采集 0%', exact: true }).click();
    await expect(panel.locator('.calibration-grid output').nth(0)).toHaveText('0.050 m');
    z = .15; await feed.set(samples);
    await expect(panel.getByTestId('point-position')).toHaveText('0.020 / 1.000 / 0.150 m');
    await panel.getByRole('button', { name: '采集 100%', exact: true }).click();
    await expect(panel.locator('.calibration-grid output').nth(1)).toHaveText('0.150 m');
    await checkpoint(page, panel.locator('.point-diagnostic-grid'), 'contact-root-position');
    await savePointDraft(page, rig, panel, 'Z', 'Depth');
    expect((await saved(page, rig)).osc.allowExperimentalSpatialInput).toBe(false);
    await allowSpatial(page);
    z = .1; await feed.set(samples); await active(page);
    await outputValue(rig, 'udp', 500);

    // The SDK clears SenderType on loss even while the Sensa activity counter advances.
    valid = false; await feed.set(samples);
    await expect.poll(async () => (await contactObservation(rig))?.valid).toBe(false);
    await expect.poll(() => rig.wire.udp.at(-1)).toBe('DSTOP');
    await active(page, false);
    valid = true; await feed.set(samples);
    await expect.poll(async () => (await contactObservation(rig))?.valid).toBe(true);
    await active(page); await outputValue(rig, 'udp', 500);

    // Receiving changing velocities and repeated coordinates cannot renew a frozen Sample.
    frozen = true; await feed.set(samples);
    await expect.poll(async () => (await contactObservation(rig))?.valid, { timeout: 5000 }).toBe(false);
    await expect.poll(() => rig.wire.udp.at(-1)).toBe('DSTOP');
    await info.attach('contact-position-simulation.json', { body: JSON.stringify({
      fixtureOnly: true, sdkClientExecution: false, frame: 'AvatarRootMeters', calibratedZ: [.05, .15],
      lossField: 'Proximity_SenderType', changingVelocitiesRenewActivity: false,
    }), contentType: 'application/json' });
  });

test.describe('SDK Contact vibration-only peer / Contact 纯振动模拟端', () => {
  test.use({ scenario: 'vibration-only' });

  test('SDK Contact speed calibrates V0 with stationary positions and zero velocity / Contact 静止位置下速度量程与 V0 联动',
    { tag: ['@osc', '@input', '@config', '@transport', '@visual'] }, async ({ page, rig }, info) => {
      expect(rig.intifaceState.profile).toBe('vibration-only');
      await enable(page, ['Mock Intiface']); await mode(page, 'OSC');
      const vibrationValues = () => rig.wire.intiface
        .filter(message => message.OutputCmd?.Command?.Vibrate)
        .map(message => message.OutputCmd.Command.Vibrate.Value);
      let speed = 0, sequence = 0;
      const samples = () => contactRootSamples(.1, (sequence++ % 32 + 1) / 32, true, { velocityZ: speed });
      const feed = await rig.startFeed(samples, 80);
      await expect.poll(async () => (await contactObservation(rig))?.valid).toBe(true);
      const panel = await contactPanel(page, rig);
      await panel.getByLabel('测量指标', { exact: true }).selectOption('Speed');
      await expect(panel.getByTestId('point-speed')).toContainText('0.000');
      await panel.getByRole('button', { name: '采集 0%', exact: true }).click();
      await expect(panel.locator('.calibration-grid output').nth(0)).toHaveText('0.000 m/s');
      speed = .4; await feed.set(samples);
      await expect(panel.getByTestId('point-speed')).toContainText('0.400');
      await panel.getByRole('button', { name: '采集 100%', exact: true }).click();
      await expect(panel.locator('.calibration-grid output').nth(1)).toHaveText('0.400 m/s');
      await checkpoint(page, panel.locator('.point-diagnostic-grid'), 'contact-root-speed');
      await savePointDraft(page, rig, panel, 'Speed', 'V0');
      await allowSpatial(page);
      speed = .2; await feed.set(samples); await active(page);
      await expect.poll(() => Math.abs((vibrationValues().at(-1) ?? -1000) - 500)).toBeLessThanOrEqual(1);
      expect(rig.wire.intiface.filter(message =>
        message.OutputCmd?.Command?.HwPositionWithDuration || message.OutputCmd?.Command?.Position)).toHaveLength(0);
      expect((await contactObservation(rig)).position.z).toBeCloseTo(.1, 5);
      await info.attach('contact-speed-simulation.json', { body: JSON.stringify({
        fixtureOnly: true, sdkClientExecution: false, constantZ: .1, speedEndpoints: [0, .4], role: 'V0',
      }), contentType: 'application/json' });
    });
});
