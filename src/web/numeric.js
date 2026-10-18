function precisionFromStep(step) {
  if (!Number.isFinite(step) || step >= 1) return 0;
  const raw = `${step}`;
  if (raw.includes('e-')) return Number(raw.split('e-')[1] || 0);
  return raw.includes('.') ? raw.split('.')[1].length : 0;
}

function roundToStep(value, step) {
  const decimals = precisionFromStep(step);
  return Number(Number(value).toFixed(decimals));
}

function clampNumber(value, min = null, max = null, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;

  let next = numeric;
  if (Number.isFinite(min)) next = Math.max(min, next);
  if (Number.isFinite(max)) next = Math.min(max, next);
  return next;
}

function normalizeRangePair(start, end, options = {}) {
  const { min = null, max = null, step = 1, fallbackStart = 0, fallbackEnd = 0 } = options;
  let nextStart = clampNumber(start, min, max, fallbackStart);
  let nextEnd = clampNumber(end, min, max, fallbackEnd);
  nextStart = roundToStep(nextStart, step);
  nextEnd = roundToStep(nextEnd, step);
  return nextStart <= nextEnd ? [nextStart, nextEnd] : [nextEnd, nextStart];
}

function getDynamicFloatSliderBounds(values, defaults = { min: 0, max: 1 }) {
  const finiteValues = values.map(Number).filter(Number.isFinite);
  const lower = Math.min(defaults.min, ...(finiteValues.length ? finiteValues : [defaults.min]));
  const upper = Math.max(defaults.max, ...(finiteValues.length ? finiteValues : [defaults.max]));
  const min = Number((Math.floor(lower * 100) / 100).toFixed(2));
  const max = Number((Math.ceil(upper * 100) / 100).toFixed(2));
  return [min, max > min ? max : min + 1];
}

function formatCompactNumber(value, decimals = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '—';
  return decimals > 0 ? numeric.toFixed(decimals) : `${Math.round(numeric)}`;
}

export { formatCompactNumber, getDynamicFloatSliderBounds, normalizeRangePair, precisionFromStep, roundToStep };
