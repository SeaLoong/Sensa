import english from './i18n.en.json' with { type: 'json' };

import diagnostics from './i18n-diagnostics.json' with { type: 'json' };

export const LOCALE_STORAGE_KEY = 'sensa.locale';
export const locales = ['zh-CN', 'en-US'];
export function resolveLocale(saved, languages = []) {
  if (locales.includes(saved)) return saved;
  for (const language of languages) {
    if (/^zh(?:-|$)/i.test(language)) return 'zh-CN';
    if (/^en(?:-|$)/i.test(language)) return 'en-US';
  }
  return 'en-US';
}
function initialLocale() {
  // Pure helpers remain deterministic in Node/unit tests.
  if (typeof window === 'undefined') return 'zh-CN';
  let saved;
  try { saved = window.localStorage.getItem(LOCALE_STORAGE_KEY); } catch { /* Private/restricted storage. */ }
  return resolveLocale(saved, window.navigator.languages || [window.navigator.language]);
}
let locale = initialLocale();
const listeners = new Set();
export const getLocale = () => locale;
export function subscribeLocale(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
function applyDocumentLocale() {
  if (typeof document !== 'undefined') document.documentElement.lang = locale;
}
export function setLocale(next) {
  if (!locales.includes(next)) return false;
  try { globalThis.localStorage?.setItem(LOCALE_STORAGE_KEY, next); } catch { /* In-memory switch still works. */ }
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
  return 'https://github.com/SeaLoong/Sensa/blob/main/' + path.replace(/\.md$/, locale === 'en-US' ? '.en.md' : '.md');
}
