import { expect, type Locator } from '@playwright/test';
import { parameterDetailScreenshotOptions } from '../e2e/parameter-detail-screenshot.ts';

// Check the actual options against Playwright's Node-facing declarations without
// adding Node globals to the browser core.
declare const dialog: Locator;
void expect(dialog).toHaveScreenshot('parameter.png', parameterDetailScreenshotOptions);

// @ts-expect-error The assertion matcher does not support inline screenshot styles.
void expect(dialog).toHaveScreenshot('parameter.png', { style: '[data-testid="parameter-detail-time"] { visibility: hidden; }' });
