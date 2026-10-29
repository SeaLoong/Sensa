export type WebSensaLocale = 'zh' | 'en';
interface LocaleStorage {
  getItem?(key: string): string | null;
  setItem?(key: string, value: string): void;
}
export interface LocaleBrowser {
  readonly location?: { readonly href: string };
  readonly sessionStorage?: LocaleStorage;
  readonly localStorage?: LocaleStorage;
  readonly navigator?: { readonly languages?: readonly string[]; readonly language?: string };
}
function normalize(value: unknown): WebSensaLocale | null {
  if (typeof value !== 'string') return null;
  const language = value.trim().replaceAll('_', '-').toLowerCase();
  if (/^zh(?:-[a-z0-9]{1,8})*$/.test(language)) return 'zh';
  if (/^en(?:-[a-z0-9]{1,8})*$/.test(language)) return 'en';
  return null;
}
export function resolveWebSensaLocale(browser: LocaleBrowser = {}): WebSensaLocale {
  const candidates: unknown[] = [];
  try { candidates.push(new URL(browser.location?.href || '').searchParams.get('lang')); } catch { /* A static preview can omit a URL. */ }
  try { candidates.push(browser.sessionStorage?.getItem?.('sensa.locale')); } catch { /* Session preference is optional. */ }
  try { candidates.push(browser.localStorage?.getItem?.('websensa.locale')); } catch { /* Persistent preference is optional. */ }
  try { if (Array.isArray(browser.navigator?.languages)) candidates.push(...browser.navigator.languages); } catch { /* Browser may withhold preferences. */ }
  try { candidates.push(browser.navigator?.language); } catch { /* Default language remains available. */ }
  return candidates.map(normalize).find((locale): locale is WebSensaLocale => locale !== null) || 'en';
}
export function saveWebSensaLocale(language: unknown, browser: LocaleBrowser = {}): boolean {
  const locale = normalize(language);
  if (!locale) return false;
  try { browser.sessionStorage?.setItem?.('sensa.locale', locale === 'zh' ? 'zh-CN' : 'en-US'); } catch { /* The current page still switches. */ }
  try { browser.localStorage?.setItem?.('websensa.locale', locale); } catch { /* The current page still switches. */ }
  return true;
}
