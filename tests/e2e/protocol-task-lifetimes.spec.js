import { test, expect, mode, active, enable } from './fixtures.js';

// These commands target an isolated loopback listener and the fixture UDP output.
// They never contact Lovense Remote, a vendor cloud or a physical device.
async function configureLovense(page, rig) {
  const previous = await page.request.get(rig.baseUrl + '/api/config').then(response => response.json());
  const response = await page.request.put(rig.baseUrl + '/api/config', { data: {
    ...previous,
    protocolInputs: [{ id: 'finite-lovense', name: 'Finite Lovense fixture', type: 'LovenseHttp', enabled: true,
      host: '127.0.0.1', port: 19405, timeoutMs: 1000, routeToMotion: true,
      features: [{ channel: 'V0', name: 'Vibration', actuator: 'Scalar', scalarType: 'Vibrate', targetAxis: 'V0' }] }],
    axisProfiles: previous.axisProfiles.map(profile => ({ ...profile, motion: { ...profile.motion,
      v0: { ...profile.motion.v0, mode: 'Normal', commandMode: 'None', min: 0, max: 999, remapMin: 0, remapMax: 999 },
    } })),
  } });
  expect(response.ok()).toBe(true);
  await page.reload();
  await enable(page, ['Mock UDP']); await mode(page, '协议'); await active(page);
}

async function command(page, action, timeSec, loop = false) {
  return page.evaluate(async ({ action, timeSec, loop }) => {
    const response = await fetch('http://127.0.0.1:19405/command', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Sensa-Session': 'finite-task-fixture' },
      body: JSON.stringify({ command: 'Function', action, timeSec, apiVer: 1,
        ...(loop ? { loopRunningSec: 2, loopPauseSec: 2 } : {}) }),
    });
    return { status: response.status, body: await response.json() };
  }, { action, timeSec, loop });
}

const vibration = rig => rig.wire.udp.filter(line => /V0\d/.test(line));

test('finite Lovense control survives its stream timeout and stops at the accepted deadline / 有限Lovense任务跨越空闲超时且按截止时间停止',
  { tag: ['@input', '@transport', '@safety'] }, async ({ page, rig }, info) => {
    await configureLovense(page, rig);
    const started = Date.now();
    expect(await command(page, 'Vibrate:12', 2.5)).toMatchObject({ status: 200, body: { code: 200 } });
    await expect.poll(() => vibration(rig).some(line => /V0599(?:\s|$)/.test(line))).toBe(true);
    const afterInitialCommand = rig.wire.udp.length;
    await expect.poll(() => Date.now() - started).toBeGreaterThan(1300);
    expect((await rig.overview()).protocolInputs.find(input => input.id === 'finite-lovense')).toMatchObject({ connected: true, channels: ['V0'] });
    expect(rig.wire.udp.slice(afterInitialCommand)).not.toContain('DSTOP');
    await expect.poll(() => rig.wire.udp.slice(afterInitialCommand).includes('DSTOP')).toBe(true);
    expect(Date.now() - started).toBeGreaterThanOrEqual(2500);
    await expect.poll(async () => (await rig.overview()).protocolInputs.find(input => input.id === 'finite-lovense')?.channels).toEqual([]);
    await info.attach('finite-lovense-task.json', { body: JSON.stringify({ fixtureOnly: true, hardwareExecution: false,
      timeoutMs: 1000, requestedTimeSec: 2.5, observedPastStreamTimeout: true, taskStopped: true, wire: rig.wire.udp }), contentType: 'application/json' });
  });

test('disarming cancels a finite Lovense loop and later activation never replays it / 关闭输入取消有限Lovense循环，重新启用不重放',
  { tag: ['@input', '@transport', '@safety'] }, async ({ page, rig }, info) => {
    await configureLovense(page, rig);
    expect(await command(page, 'Vibrate:12', 20, true)).toMatchObject({ status: 200, body: { code: 200 } });
    await expect.poll(() => vibration(rig).some(line => /V0599(?:\s|$)/.test(line))).toBe(true);
    await active(page, false);
    await expect.poll(() => rig.wire.udp.at(-1)).toBe('DSTOP');
    const count = vibration(rig).length, canceled = Date.now();
    await active(page);
    await expect.poll(() => Date.now() - canceled).toBeGreaterThan(4200);
    expect(vibration(rig)).toHaveLength(count);
    expect((await rig.overview()).runtime.inputActive).toBe(true);
    expect((await rig.overview()).protocolInputs.find(input => input.id === 'finite-lovense')).toMatchObject({ connected: false, channels: [] });
    expect(await command(page, 'Vibrate:8', 0)).toMatchObject({ status: 200, body: { code: 200 } });
    await expect.poll(() => vibration(rig).some(line => /V0400(?:\s|$)/.test(line))).toBe(true);
    await active(page, false);
    await info.attach('canceled-lovense-task.json', { body: JSON.stringify({ fixtureOnly: true, hardwareExecution: false,
      canceledTaskTimeSec: 20, observedAcrossNextLoopBoundaryMs: Date.now() - canceled, lateReplay: false,
      freshCommandAccepted: true, wire: rig.wire.udp }), contentType: 'application/json' });
  });
