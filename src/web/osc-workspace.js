import { formatCompactNumber } from './numeric.js';
import { t, getLocale } from './i18n.js';

function formatOscSourceLabel(source) {
  if (!source) return t("未知来源");
  return source.label || (source.address && source.port ? `${source.address}:${source.port}` : source.key || t("未知来源"));
}

function buildOscSourceSelectionOptions(sources) {
  const normalizedSources = Array.isArray(sources) ? sources : [];
  return [{ value: '', label: t("自动选择") }, ...normalizedSources.map(source => ({ value: source.key, label: formatOscSourceLabel(source) }))];
}

const timeFormatters = new Map();

function formatPreviewTimestamp(timestampMs) {
  if (!timestampMs) return '—';
  const value = new Date(timestampMs);
  if (Number.isNaN(value.getTime())) return '—';
  const locale = getLocale();
  if (!timeFormatters.has(locale)) timeFormatters.set(locale, new Intl.DateTimeFormat(locale,
    { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }));
  return timeFormatters.get(locale).format(value);
}

// A large catalog stays searchable in full while at most one page is mounted.
// Clamp a page after removals without dropping the remaining reachable rows.
export function paginateOscPreview(entries, requestedPage = 0, pageSize = 100) {
  const size = Number.isInteger(pageSize) && pageSize > 0 ? Math.min(pageSize, 100) : 100;
  const count = entries.length, pages = Math.max(1, Math.ceil(count / size));
  const page = Math.min(pages - 1, Math.max(0, Number.isFinite(requestedPage) ? Math.floor(requestedPage) : 0));
  const offset = page * size;
  return { entries: entries.slice(offset, offset + size), page, pages, total: count,
    first: count ? offset + 1 : 0, last: Math.min(count, offset + size) };
}

// Browsing OSC does not apply the OSC input mode. Catalog work follows the
// visible workspace/editor, including a preset dialog opened elsewhere.
export function oscCatalogVisibility(workspace, tab, presetDialogOpen = false) {
  return { mappingEditorVisible: Boolean(presetDialogOpen) || workspace === 'osc' && tab === 'setup',
    parameterBrowserVisible: workspace === 'osc' && tab === 'parameters' };
}

// A detail dialog follows the selected transport identity, never another source
// that happens to publish the same path. Frozen rows retain their chosen sample.
export function resolveOscParameterDetail(selected, entries, { frozen = false, connected = true } = {}) {
  if (!selected) return null;
  const current = (Array.isArray(entries) ? entries : []).find(entry => entry.path === selected.path
    && (entry.sourceKey || '') === (selected.sourceKey || ''));
  return { entry: current || selected,
    mode: frozen ? 'frozen' : !current ? 'missing' : !connected ? 'offline' : 'live' };
}

export function formatOscParameterDetailStatus(mode) {
  switch (mode) {
    case 'frozen': return t('冻结的样本');
    case 'missing': return t('参数已离开当前目录，显示打开时的样本。');
    case 'offline': return t('实时连接尚未就绪，显示最近收到的样本。');
    default: return t('随接收更新');
  }
}

function applySignalCurve(value, curve) {
  switch (curve) {
    case 'EaseIn':
      return value * value;
    case 'EaseOut':
      return 1 - (1 - value) * (1 - value);
    case 'SCurve':
      return value < 0.5 ? 2 * value * value : 1 - 2 * (1 - value) * (1 - value);
    default:
      return value;
  }
}

function computeSignalPreviewOutput(signal, rawValue) {
  const numericValue = Number(rawValue);
  if (!signal || !Number.isFinite(numericValue)) return null;

  const inputMin = Number(signal.invertDirection ? signal.vrchatMax : signal.vrchatMin);
  const inputMax = Number(signal.invertDirection ? signal.vrchatMin : signal.vrchatMax);
  const range = inputMax - inputMin;
  const normalized = Math.abs(range) < 0.0001 ? 0 : Math.max(0, Math.min(1, (numericValue - inputMin) / range));
  const curved = applySignalCurve(normalized, signal.curve);
  const mappedStart = Math.max(0, Math.min(999, Number(signal.mappedMin ?? 0)));
  const mappedEnd = Math.max(0, Math.min(999, Number(signal.mappedMax ?? 999)));
  const mappedPosition = mappedStart + curved * (mappedEnd - mappedStart);

  return {
    mappedPosition,
    mappedPositionText: `${Math.max(0, Math.min(999, Math.round(mappedPosition)))}`,
    normalized,
    normalizedText: formatCompactNumber(normalized, 2),
    curved,
    curvedText: formatCompactNumber(curved, 2),
  };
}

export { buildOscSourceSelectionOptions, computeSignalPreviewOutput, formatOscSourceLabel, formatPreviewTimestamp };
