// Viewport geometry is independent of DOM measurement so narrow screens and
// partially clipped targets use exactly the same placement rules.
export function tourLayout(rect, viewport, card = { width: 360, height: 320 }, navigation = null) {
  if (navigation) {
    const layout = tourLayout(rect, viewport, card);
    const nav = tourLayout(navigation, viewport).target;
    const panel = layout.card, holes = [layout.target, nav].filter(Boolean), gap = 12;
    const overlaps = (a, b) => a.left < b.left + b.width && a.left + a.width > b.left
      && a.top < b.top + b.height && a.top + a.height > b.top;
    if (holes.some(hole => overlaps({ ...panel, height: Math.min(card.height, panel.maxHeight) }, hole))) {
      // A narrow-screen card may otherwise move away from the navigation and
      // land on its target. Choose free space around both, scrolling only text.
      const positions = [...new Set([panel.left, gap, viewport.width - panel.width - gap,
        ...holes.flatMap(hole => [hole.left - panel.width - gap, hole.left + hole.width + gap])])]
        .filter(left => left >= gap && left + panel.width <= viewport.width - gap);
      const slots = positions.flatMap(left => {
        const blocked = holes.filter(hole => left < hole.left + hole.width && left + panel.width > hole.left)
          .sort((a, b) => a.top - b.top);
        let top = gap;
        const spaces = [];
        for (const hole of blocked) {
          if (hole.top - gap > top) spaces.push({ left, top, maxHeight: hole.top - gap - top });
          top = Math.max(top, hole.top + hole.height + gap);
        }
        if (viewport.height - gap > top) spaces.push({ left, top, maxHeight: viewport.height - gap - top });
        return spaces;
      });
      slots.sort((a, b) => Math.min(card.height, b.maxHeight) - Math.min(card.height, a.maxHeight)
        || Math.abs(a.left - panel.left) + Math.abs(a.top - panel.top) - Math.abs(b.left - panel.left) - Math.abs(b.top - panel.top));
      if (slots.length) Object.assign(panel, slots[0]);
    }
    return { ...layout, navigation: nav, shades: tourShades([layout.target, nav], viewport) };
  }
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
  const readableHeight = Math.min(height, 320, viewport.height - gap * 2);
  if (maxHeight < readableHeight) { maxHeight = readableHeight; y = viewport.height - maxHeight - gap; }
  return { target, card: { left: x, top: y, width, maxHeight } };
}

// Subtract both highlights from the shade. Overlapping holes stay clear and
// never darken each other; every remaining rectangle still intercepts clicks.
export function tourShades(targets, viewport) {
  const holes = targets.filter(Boolean);
  const xs = [...new Set([0, viewport.width, ...holes.flatMap(r => [r.left, r.left + r.width])])].sort((a, b) => a - b);
  const ys = [...new Set([0, viewport.height, ...holes.flatMap(r => [r.top, r.top + r.height])])].sort((a, b) => a - b);
  const shades = [];
  for (let x = 1; x < xs.length; x++) for (let y = 1; y < ys.length; y++) {
    const left = xs[x - 1], top = ys[y - 1], width = xs[x] - left, height = ys[y] - top;
    if (width && height && !holes.some(r => left >= r.left && xs[x] <= r.left + r.width && top >= r.top && ys[y] <= r.top + r.height)) {
      shades.push({ left, top, width, height });
    }
  }
  return shades;
}

export function tourTarget(step, goal) {
  if (step === 'input') return { manual: '.manual-primary', script: '.script-player__header', osc: '.osc-receiver-settings', protocol: '[data-testid="protocol-inputs-panel"]' }[goal] || '.input-toolbar';
  // Focus one actionable example: the full expanded grid is taller than the
  // space shared by the target and its instructions on a narrow screen.
  if (step === 'mapping') return goal === 'osc' ? '.preset-strip' : '.transform-presets .preset-card:first-child';
  return { input: '.input-toolbar', axes: '.axis-profiles-section > .section__header',
    device: '.outputs-section > .section__header', diagnostics: '.log-section > .section__header', ready: '.header-actions' }[step] || null;
}
