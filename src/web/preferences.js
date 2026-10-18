import { DEFAULT_STUDIO_STATE, INPUT_MODES, normalizeStoredScriptDefaults } from './input-workflows.js';

const STORAGE_KEY = 'sensa.studio.v4';

function loadStudio(storage) {
  try {
    const raw = (storage || globalThis.localStorage).getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function sanitizeStudio(raw, config) {
  return {
    preferredInputTab: INPUT_MODES().some(item => item.value === raw?.preferredInputTab) ? raw.preferredInputTab : DEFAULT_STUDIO_STATE.preferredInputTab,
    scriptDefaults: normalizeStoredScriptDefaults(raw?.scriptDefaults),
  };
}

function saveStudio(studio, storage) {
  try { (storage || globalThis.localStorage).setItem(STORAGE_KEY, JSON.stringify(sanitizeStudio(studio))); return true; }
  catch { return false; }
}

export { loadStudio, saveStudio, sanitizeStudio };
