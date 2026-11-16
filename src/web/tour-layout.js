// Viewport geometry is independent of DOM measurement so narrow screens and
// partially clipped targets use exactly the same placement rules.
export function tourLayout(rect, viewport, card = { width: 360, height: 320 }) {
  const gap = 12, width = Math.min(card.width, Math.max(0, viewport.width - gap * 2));
  const height = Math.min(card.height, Math.max(0, viewport.height - gap * 2));
  if (!rect) return { target: null, card: { left: (viewport.width - width) / 2, top: Math.max(gap, (viewport.height - height) / 2), width, maxHeight: viewport.height - gap * 2 } };
  const left = Math.max(4, Math.min(viewport.width - 4, rect.left - 6));
  const top = Math.max(4, Math.min(viewport.height - 4, rect.top - 6));
  const right = Math.max(left, Math.min(viewport.width - 4, rect.right + 6));
  const bottom = Math.max(top, Math.min(viewport.height - 4, rect.bottom + 6));
  const target = { left, top, width: right - left, height: bottom - top };
  const below = viewport.height - bottom - gap * 2;
  const above = top - gap * 2;
  let x = Math.max(gap, Math.min(left, viewport.width - width - gap));
  let y, maxHeight = viewport.height - gap * 2;
  if (viewport.width - right >= width + gap * 2) { x = right + gap; y = Math.max(gap, Math.min(top, viewport.height - height - gap)); }
  else if (left >= width + gap * 2) { x = left - width - gap; y = Math.max(gap, Math.min(top, viewport.height - height - gap)); }
  else if (below >= height || below >= above) { y = bottom + gap; maxHeight = Math.max(0, below); }
  else { maxHeight = Math.max(0, above); y = Math.max(gap, top - Math.min(height, maxHeight) - gap); }
  if (maxHeight < 160) { maxHeight = Math.min(300, viewport.height * 0.42); y = viewport.height - maxHeight - gap; }
  return { target, card: { left: x, top: y, width, maxHeight } };
}

export function tourTarget(step, goal) {
  if (step === 'input') return { manual: '.manual-primary', script: '.script-player__header', osc: '.osc-receiver-settings', protocol: '[data-testid="protocol-inputs-panel"]' }[goal] || '.input-toolbar';
  return { input: '.input-toolbar', mapping: '.preset-strip', axes: '.axis-profiles-section > .section__header',
    device: '.outputs-section > .section__header', ready: '.header-actions' }[step] || null;
}
