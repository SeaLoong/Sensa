// Keep a large parameter catalog out of every inactive mapping field's DOM.
// 大参数目录只给正在编辑的字段提供少量建议，不限制手工输入的路径。
export const MAPPING_PATH_SUGGESTION_LIMIT = 50;

export function mappingPathSuggestions(paths, value, { focused = false, limit = MAPPING_PATH_SUGGESTION_LIMIT } = {}) {
  if (!focused || !Array.isArray(paths)) return [];
  const count = Number.isFinite(limit) ? Math.max(0, Math.min(MAPPING_PATH_SUGGESTION_LIMIT, Math.floor(limit)))
    : MAPPING_PATH_SUGGESTION_LIMIT;
  if (!count) return [];
  const text = String(value ?? '');
  const separator = Math.max(text.lastIndexOf(';'), text.lastIndexOf('\n'));
  const fragment = text.slice(separator + 1);
  const prefix = text.slice(0, separator + 1) + fragment.match(/^\s*/u)[0];
  const query = fragment.trim().toLowerCase();
  const matches = [], seen = new Set();
  for (const path of paths) {
    if (typeof path !== 'string' || !path || seen.has(path) || !path.toLowerCase().includes(query)) continue;
    seen.add(path);
    matches.push(prefix + path);
    if (matches.length === count) break;
  }
  return matches;
}
