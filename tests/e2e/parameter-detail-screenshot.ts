import type { PageAssertionsToHaveScreenshotOptions } from '@playwright/test';

// The assertion matcher loads CSS through stylePath; inline `style` is a page
// screenshot option and is ignored by toHaveScreenshot.
export const parameterDetailScreenshotOptions = {
  stylePath: ['tests/e2e/screenshot.css', 'tests/e2e/parameter-detail-screenshot.css'],
} satisfies PageAssertionsToHaveScreenshotOptions;
