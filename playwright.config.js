import { defineConfig } from '@playwright/test';

if (process.env.GITHUB_ACTIONS !== 'true') throw new Error('Sensa E2E runs only in GitHub Actions; dispatch e2e.yml. / Sensa E2E 仅允许在 GitHub Actions 执行，请触发 e2e.yml。');
const suite = process.env.E2E_SUITE || 'all';
if (!['all', 'visual', 'transport', 'input', 'osc', 'config', 'i18n', 'quality', 'site'].includes(suite))
  throw new Error('Unknown E2E suite / 未知 E2E 套件: ' + suite);
export default defineConfig({
  testDir: './tests/e2e', timeout: 90000, fullyParallel: false, workers: 1, retries: 0, maxFailures: 0,
  forbidOnly: true, outputDir: 'artifacts/e2e/results',
  grep: suite === 'all' ? undefined : new RegExp('@' + suite + '\\b'),
  reporter: [['line'], ['html', { outputFolder: 'artifacts/e2e/report', open: 'never' }], ['json', { outputFile: 'artifacts/e2e/results.json' }], ['./scripts/e2e-summary-reporter.mjs']],
  snapshotPathTemplate: '{testDir}/__screenshots__/{projectName}/{arg}{ext}',
  updateSnapshots: process.env.E2E_UPDATE_SNAPSHOTS === 'true' ? 'all' : 'none',
  expect: { timeout: 10000, toHaveScreenshot: { animations: 'disabled', caret: 'hide', maxDiffPixelRatio: 0.001 } },
  use: { browserName: 'chromium', locale: 'zh-CN', timezoneId: 'Asia/Shanghai', colorScheme: 'light',
    reducedMotion: 'reduce', trace: 'retain-on-failure', screenshot: 'only-on-failure', video: 'retain-on-failure' },
  projects: [{ name: 'desktop', use: { viewport: { width: 1280, height: 900 } } },
    // Narrow CSS layout coverage; this is not a physical phone/browser test.
    { name: 'mobile', use: { viewport: { width: 390, height: 844 } } }],
});
