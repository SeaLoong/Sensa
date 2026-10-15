import { defineConfig } from '@playwright/test';

if (process.env.GITHUB_ACTIONS !== 'true') throw new Error('Sensa E2E runs only in GitHub Actions. Dispatch e2e.yml; do not run browsers locally.');
export default defineConfig({
  testDir: './tests/e2e', timeout: 90000, fullyParallel: false, workers: 1, retries: 0, maxFailures: 3,
  forbidOnly: true, outputDir: 'artifacts/e2e/results',
  reporter: [['line'], ['html', { outputFolder: 'artifacts/e2e/report', open: 'never' }], ['json', { outputFile: 'artifacts/e2e/results.json' }]],
  snapshotPathTemplate: '{testDir}/__screenshots__/{projectName}/{arg}{ext}',
  updateSnapshots: process.env.E2E_UPDATE_SNAPSHOTS === 'true' ? 'all' : 'none',
  expect: { timeout: 10000, toHaveScreenshot: { animations: 'disabled', caret: 'hide', maxDiffPixelRatio: 0.001 } },
  use: { browserName: 'chromium', locale: 'zh-CN', timezoneId: 'Asia/Shanghai', colorScheme: 'light',
    reducedMotion: 'reduce', trace: 'retain-on-failure', screenshot: 'only-on-failure', video: 'retain-on-failure' },
  projects: [{ name: 'desktop', use: { viewport: { width: 1280, height: 900 } } },
    // A narrow CSS viewport, not device emulation: Chromium can then capture
    // tall elements beyond the viewport without blank mobile compositor tiles.
    { name: 'mobile', use: { viewport: { width: 390, height: 844 } } }],
});
