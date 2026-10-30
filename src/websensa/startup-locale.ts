import { resolveWebSensaLocale, saveWebSensaLocale } from './locale.ts';

// Run before loading the shared renderer: it intentionally removes consumed
// language queries once its normal session preference has been initialized.
if (typeof window !== 'undefined') saveWebSensaLocale(resolveWebSensaLocale(window), window);
