export function globMatch(pattern, path) {
  const patterns = pattern.split('/'), segments = path.split('/');
  if (patterns.length > 64 || segments.length > 64) return false;
  let row = new Array(segments.length + 1).fill(false); row[0] = true;
  for (const segment of patterns) {
    const next = new Array(segments.length + 1).fill(false);
    if (segment === '**') next[0] = row[0];
    for (let j = 1; j <= segments.length; j++)
      next[j] = segment === '**' ? row[j] || next[j - 1] : row[j - 1] && (segment === '*' || segment === segments[j - 1]);
    row = next;
  }
  return row[segments.length];
}

export function rankPreview(entries, signals = [], { showFaceTracking = false, search = '' } = {}) {
  const term = search.trim().toLowerCase();
  return entries.map(entry => {
    const matches = signals.filter(s => matchesOscPathPattern(s.oscPath, entry.path));
    return { ...entry, _matches: matches.length ? matches : null };
  }).filter(entry => (showFaceTracking || !entry.classification?.isFaceTracking || entry._matches)
    && (!term || entry.path.toLowerCase().includes(term)))
    .sort((a, b) => Number(Boolean(b._matches)) - Number(Boolean(a._matches))
      || (b.classification?.relevance || 0) - (a.classification?.relevance || 0)
      || a.path.localeCompare(b.path, 'en', { numeric: true, sensitivity: 'base' })
      || (a.sourceKey || '').localeCompare(b.sourceKey || ''));
}

export function matchesOscPathPattern(pattern, actualPath) {
  const p = (pattern || '').trim();
  const a = (actualPath || '').trim();
  if (!p || !a) return false;
  if (/[;\n]/.test(p)) return p.split(/[;\n]/).filter(Boolean).slice(0, 32).some(item => matchesOscPathPattern(item.trim(), a));
  if (!p.includes('*')) return p === a; // exact match fast path
  return globMatch(p, a);
}

export function getLatestOscPreviewEntry(previewEntries, pattern, preferredSourceKey = '') {
  const matches = Array.isArray(previewEntries) ? previewEntries.filter(entry => matchesOscPathPattern(pattern, entry?.path || '')) : [];
  const candidates = preferredSourceKey ? matches.filter(entry => entry?.sourceKey === preferredSourceKey) : matches;
  if (candidates.length === 0) return null;

  const latest = candidates.reduce((current, entry) => {
    if (!current) return entry;
    return Number(entry?.timestampMs || 0) > Number(current?.timestampMs || 0) ? entry : current;
  }, null);

  return latest ? { ...latest, matchCount: candidates.length } : null;
}

export function isOgbOscPath(path) {
  return (path || '').trim().toUpperCase().startsWith('OGB/');
}

export function compareOscPathSuggestions(left, right) {
  const leftPath = (left || '').trim();
  const rightPath = (right || '').trim();
  const leftPriority = isOgbOscPath(leftPath) ? 0 : 1;
  const rightPriority = isOgbOscPath(rightPath) ? 0 : 1;

  if (leftPriority !== rightPriority) return leftPriority - rightPriority;
  return leftPath.localeCompare(rightPath, 'en', { numeric: true, sensitivity: 'base' });
}

export function buildOscPathSuggestions(previewEntries, queryNodes = []) {
  const previewPaths = (Array.isArray(previewEntries) ? previewEntries : []).map(entry => (entry?.path || '').trim());
  const queryPaths = (Array.isArray(queryNodes) ? queryNodes : []).map(node => (node?.path || '').trim());
  const hints = new Map(previewEntries.map(e => [e.path, e.classification]));
  return Array.from(new Set([...previewPaths, ...queryPaths].filter(Boolean))).sort((a, b) =>
    (hints.get(b)?.relevance || 0) - (hints.get(a)?.relevance || 0) || compareOscPathSuggestions(a, b));
}

export function filterOscPreviewEntriesBySource(previewEntries, sourceKey = '') {
  if (!sourceKey) return Array.isArray(previewEntries) ? previewEntries : [];
  return (Array.isArray(previewEntries) ? previewEntries : []).filter(entry => entry?.sourceKey === sourceKey);
}

