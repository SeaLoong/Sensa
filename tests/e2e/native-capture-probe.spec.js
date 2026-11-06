// Diagnostic branch only: copy to tests/e2e/native-capture-probe.spec.js.
// Uses the real Actions rig/page fixture; never run this locally.
import { test, expect } from './fixtures.js';
import { captureInitialWorkbench } from '../../scripts/smoke-electron.mjs';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

async function configuration(page, rig) {
  const response = await page.request.get(rig.baseUrl + '/api/config');
  expect(response.ok()).toBe(true);
  return response.json();
}

for (const locale of ['zh-CN', 'en-US']) {
  test.describe('Native capture helper / 原生捕获助手 ' + locale, () => {
    test.use({ locale, scenario: 'first-run' });
    test('initial native capture preserves collapsed axes and disarmed state / 原生初始捕获保留折叠动作轴与停用状态',
      { tag: ['@native-capture-probe'] }, async ({ page, rig }, info) => {
        // The shared page fixture has already entered the real workbench and
        // observes UI transport commands. No helper methods are mocked here.
        await expect(page.locator('html')).toHaveAttribute('lang', locale);
        const beforeConfig = await configuration(page, rig);
        expect(beforeConfig.outputs).toEqual([]);
        const beforeMutations = rig.commands.filter(command => command.method !== 'GET');
        expect(beforeMutations).toEqual([]);
        const beforeWire = structuredClone(rig.wire);
        expect(Object.values(beforeWire).every(lane => lane.length === 0)).toBe(true);
        const imagePath = info.outputPath('native-capture-probe.png');
        const captured = await captureInitialWorkbench(page, imagePath);
        expect(captured).toEqual({ inputActive: false, isEmergency: false, inputMode: 'manual',
          manualAxes: { L0: 500, L1: 500, L2: 500 }, visibleManualAxes: ['L0'],
          extraAxesCollapsed: true, extraAxisCount: 11 });
        expect(await configuration(page, rig)).toEqual(beforeConfig);
        expect(rig.commands.filter(command => command.method !== 'GET')).toEqual(beforeMutations);
        expect(rig.wire).toEqual(beforeWire);
        const after = await rig.overview();
        expect(after.runtime.inputActive).toBe(false);
        expect(after.runtime.isEmergency).toBe(false);
        expect(after.input.mode).toBe('manual');
        const sourceCommit = process.env.SENSA_SOURCE_COMMIT || process.env.GITHUB_SHA;
        expect(sourceCommit).toMatch(/^[a-f0-9]{40}$/);
        const bytes = await readFile(imagePath);
        const proof = { schema: 1, sourceCommit, runId: process.env.GITHUB_RUN_ID,
          attempt: process.env.GITHUB_RUN_ATTEMPT, testId: info.testId, project: info.project.name,
          locale, helper: 'scripts/smoke-electron.mjs#captureInitialWorkbench',
          helperSha256: createHash('sha256').update(await readFile(new URL('../../scripts/smoke-electron.mjs', import.meta.url))).digest('hex'),
          workbenchCapture: captured, configurationUnchanged: true, mutatingRequests: 0,
          mockWireUnchanged: true, attachment: 'native-capture-probe',
          sha256: createHash('sha256').update(bytes).digest('hex') };
        const proofPath = info.outputPath('native-capture-probe-source.json');
        await writeFile(proofPath, JSON.stringify(proof, null, 2));
        await info.attach(proof.attachment, { path: imagePath, contentType: 'image/png' });
        await info.attach(proof.attachment + '-source', { path: proofPath, contentType: 'application/json' });
      });
  });
}
