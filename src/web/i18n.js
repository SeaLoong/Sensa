import english from './i18n.en.json' with { type: 'json' };

import diagnostics from './i18n-diagnostics.json' with { type: 'json' };

export const LOCALE_STORAGE_KEY = 'sensa.locale';
export const locales = Object.freeze(['zh-CN', 'en-US']);
export function normalizeLocale(value) {
  if (typeof value !== 'string') return null;
  const language = value.trim().replaceAll('_', '-').toLowerCase();
  if (/^zh(?:-[a-z0-9]{1,8})*$/.test(language)) return 'zh-CN';
  if (/^en(?:-[a-z0-9]{1,8})*$/.test(language)) return 'en-US';
  return null;
}
export function resolveLocale(saved, languages = []) {
  const preferences = Array.isArray(languages) ? languages : [];
  return [saved, ...preferences].map(normalizeLocale).find(Boolean) || 'en-US';
}
export function detectLocale(browser = {}) {
  let saved;
  const languages = [];
  try { saved = browser.sessionStorage?.getItem(LOCALE_STORAGE_KEY); } catch { /* Private/restricted storage. */ }
  try { if (Array.isArray(browser.navigator?.languages)) languages.push(...browser.navigator.languages); } catch { /* Unavailable preferences. */ }
  try { languages.push(browser.navigator?.language); } catch { /* Unavailable fallback preference. */ }
  return resolveLocale(saved, languages);
}
export function clearLocaleQuery(browser = {}) {
  try {
    const url = new URL(browser.location?.href);
    if (url.searchParams.has('lang')) {
      url.searchParams.delete('lang');
      browser.history?.replaceState(browser.history.state, '', url);
    }
  } catch { /* Restricted history does not prevent choosing a language. */ }
}
let locale = detectLocale(typeof window === 'undefined' ? {} : window);
clearLocaleQuery(typeof window === 'undefined' ? {} : window);
const listeners = new Set();
export const getLocale = () => locale;
export function subscribeLocale(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
function applyDocumentLocale() {
  if (typeof document !== 'undefined') document.documentElement.lang = locale;
}
export function setLocale(value) {
  const next = normalizeLocale(value);
  if (!next) return false;
  try { globalThis.sessionStorage?.setItem(LOCALE_STORAGE_KEY, next); } catch { /* In-memory switch still works. */ }
  clearLocaleQuery(typeof window === 'undefined' ? {} : window);
  if (locale === next) return true;
  locale = next;
  applyDocumentLocale();
  for (const listener of listeners) listener();
  return true;
}
applyDocumentLocale();
// Only explicitly marked application strings are translated. Never walk the DOM
// or translate arbitrary names, addresses, parameter paths or configuration data.
export function t(key, values = []) {
  if (typeof key !== 'string') return key;
  const template = locale === 'en-US' && Object.hasOwn(english, key) ? english[key] : key;
  return template.replace(/\{(\d+)\}/g, (match, index) => index < values.length ? String(values[index]) : match);
}
// Only backend-owned diagnostic fields use these templates. Captured names
// and endpoints remain verbatim; unknown third-party messages stay intact.
const diagnosticPatterns = diagnostics.map(([source, target]) => ({
  expression: new RegExp('^' + source.split(/\{\d+\}/).map(part => part.replace(/[.*+?^$\{\}()|[\]\\]/g, '\\$&')).join('([\\s\\S]*?)') + '$'),
  target,
}));
export function diagnostic(message) {
  if (typeof message !== 'string' || locale !== 'en-US') return message;
  if (Object.hasOwn(english, message)) return t(message);
  const marker = /^(Root|Tip|Side): (.*)$/.exec(message);
  if (marker) return marker[1] + ': ' + diagnostic(marker[2]);
  for (const { expression, target } of diagnosticPatterns) {
    const match = expression.exec(message);
    if (match) return target.replace(/\{(\d+)\}/g, (_, i) => match[Number(i) + 1]);
  }
  return message;
}
// Immutable option lists are reused during high-frequency OSC renders, while
// each locale gets its own translated values.
export function localized(factory) {
  const cache = new Map();
  return () => {
    const current = getLocale();
    if (!cache.has(current)) cache.set(current, factory());
    return cache.get(current);
  };
}
export function docUrl(path) {
  if (path === 'docs/parameter-geometry.html') return '/docs/parameter-geometry.html';
  const localizedPath = /(?:^|\/)README\.md$/.test(path)
    ? path.replace(/README\.md$/, locale === 'zh-CN' ? 'README.zh-CN.md' : 'README.md')
    : path.replace(/\.md$/, locale === 'en-US' ? '.en.md' : '.md');
  return 'https://github.com/SeaLoong/Sensa/blob/main/' + localizedPath;
}
