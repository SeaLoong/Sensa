import { defineConfig } from '@playwright/test';

if (process.env.GITHUB_ACTIONS !== 'true')
  throw new Error('WebSensa browser compatibility runs only in GitHub Actions. / WebSensa 浏览器兼容验证仅在 Actions 执行。');

export default defineConfig({
  testDir: './tests/e2e', testMatch: 'websensa-compatibility.spec.js',
  timeout: 60000, fullyParallel: false, workers: 1, retries: 0, maxFailures: 0,
  forbidOnly: true, updateSnapshots: 'none', outputDir: 'artifacts/e2e/results',
  reporter: [['line'], ['html', { outputFolder: 'artifacts/e2e/report', open: 'never' }],
    ['json', { outputFile: 'artifacts/e2e/results.json' }], ['./scripts/e2e-summary-reporter.mjs']],
  expect: { timeout: 10000 },
  use: { locale: 'en-US', timezoneId: 'Asia/Shanghai', colorScheme: 'light', reducedMotion: 'reduce',
    trace: 'retain-on-failure', screenshot: 'only-on-failure', video: 'retain-on-failure' },
  projects: [
    { name: 'firefox-desktop', use: { browserName: 'firefox', viewport: { width: 1280, height: 900 } } },
    { name: 'firefox-mobile', use: { browserName: 'firefox', viewport: { width: 390, height: 844 } } },
    { name: 'webkit-desktop', use: { browserName: 'webkit', viewport: { width: 1280, height: 900 } } },
    { name: 'webkit-mobile', use: { browserName: 'webkit', viewport: { width: 390, height: 844 } } },
  ],
});
