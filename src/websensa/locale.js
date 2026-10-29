function normalize(value) {
  if (typeof value !== 'string') return null;
  const language = value.trim().replaceAll('_', '-').toLowerCase();
  if (/^zh(?:-[a-z0-9]{1,8})*$/.test(language)) return 'zh';
  if (/^en(?:-[a-z0-9]{1,8})*$/.test(language)) return 'en';
  return null;
}
export function resolveWebSensaLocale(browser = {}) {
  const candidates = [];
  try { candidates.push(new URL(browser.location.href).searchParams.get('lang')); } catch { /* A static preview can omit a URL. */ }
  try { candidates.push(browser.sessionStorage?.getItem('sensa.locale')); } catch { /* Session preference is optional. */ }
  try { candidates.push(browser.localStorage?.getItem('websensa.locale')); } catch { /* Persistent preference is optional. */ }
  try { if (Array.isArray(browser.navigator?.languages)) candidates.push(...browser.navigator.languages); } catch { /* Browser may withhold preferences. */ }
  try { candidates.push(browser.navigator?.language); } catch { /* Default language remains available. */ }
  return candidates.map(normalize).find(Boolean) || 'en';
}
export function saveWebSensaLocale(language, browser = {}) {
  const locale = normalize(language);
  if (!locale) return false;
  try { browser.sessionStorage?.setItem('sensa.locale', locale === 'zh' ? 'zh-CN' : 'en-US'); } catch { /* The current page still switches. */ }
  try { browser.localStorage?.setItem('websensa.locale', locale); } catch { /* The current page still switches. */ }
  return true;
}
