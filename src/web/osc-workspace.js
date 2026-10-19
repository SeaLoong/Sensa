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

function formatPreviewTimestamp(timestampMs) {
  if (!timestampMs) return '—';
  const value = new Date(timestampMs);
  if (Number.isNaN(value.getTime())) return '—';
  return value.toLocaleTimeString(getLocale(), { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
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
