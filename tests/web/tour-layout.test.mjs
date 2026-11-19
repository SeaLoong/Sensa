import test from 'node:test';
import assert from 'node:assert/strict';
import { tourLayout, tourTarget, tourShades } from '../../src/web/tour-layout.js';
import { createTransformPreset, transformPresets } from '../../src/web/transform-presets.js';
import { computedDraftIncomplete, stripComputedDraft } from '../../src/web/computed-signals.js';
import { normalizeConfiguration, createDefaultConfiguration } from '../../src/core/runtime/configuration.ts';

test('tour cards stay reachable at desktop, narrow and short viewports with clipped or missing targets', () => {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 480 }, { width: 844, height: 390 }]) {
    for (const rect of [null, { left: 10, top: 25, right: viewport.width - 10, bottom: 100 }, { left: -10, top: -50, right: viewport.width + 10, bottom: viewport.height + 200 }]) {
      const { card, target } = tourLayout(rect, viewport, { width: 380, height: 520 });
      assert.ok(card.left >= 0 && card.top >= 0);
      assert.ok(card.left + card.width <= viewport.width);
      assert.ok(card.maxHeight > 0 && card.top + Math.min(520, card.maxHeight) <= viewport.height);
      if (target) assert.ok(target.width <= viewport.width && target.height <= viewport.height);
    }
  }
});

test('guide highlights the selected source controls and each separate configuration stage', () => {
  assert.equal(tourTarget('input', 'manual'), '.manual-primary');
  assert.equal(tourTarget('input', 'script'), '.script-player__header');
  assert.equal(tourTarget('mapping', 'osc'), '#append-mapping-preset');
  for (const goal of ['manual', 'script', 'protocol']) assert.equal(tourTarget('mapping', goal), '#add-axis-mapping');
  assert.match(tourTarget('axes'), /axis-profiles/);
  assert.match(tourTarget('device'), /outputs-section/);
  assert.equal(tourTarget('ready'), '.header-actions');
  assert.equal(tourTarget('goal'), null);
});

test('a tall target cannot squeeze the guide into a header and footer without readable instructions', () => {
  const { card } = tourLayout({ left: 32, top: 240, right: 342, bottom: 620 },
    { width: 390, height: 844 }, { width: 380, height: 420 });
  assert.ok(card.maxHeight >= 320);
  assert.ok(card.top + card.maxHeight <= 844);
});

test('every transform preset creates an independent valid draft and preserves existing configuration', () => {
  const config = createDefaultConfiguration(), before = JSON.stringify(config), drafts = [];
  for (const preset of transformPresets()) {
    const draft = createTransformPreset(preset.id, drafts);
    assert.equal(computedDraftIncomplete(draft), false, preset.id);
    assert.ok(!drafts.some(existing => existing.id === draft.id));
    drafts.push(draft);
  }
  const saved = normalizeConfiguration({ ...config, computedSignals: drafts.map(stripComputedDraft) });
  assert.equal(saved.computedSignals.length, 4);
  assert.equal(JSON.stringify(config), before);
  const another = createTransformPreset('smooth-manual', drafts);
  another.inputs[0].oscPath = 'V0';
  assert.equal(drafts[0].inputs[0].oscPath, 'L0');
  assert.equal(createTransformPreset('unknown'), null);
  assert.equal(createTransformPreset('smooth-manual', Array.from({ length: 64 })), null);
});

test('two spotlight holes stay clear including overlaps, with complete shade coverage elsewhere', () => {
  const viewport = { width: 390, height: 844 };
  const targets = [{ left: 8, top: 140, width: 70, height: 40 }, { left: 60, top: 160, width: 300, height: 140 }];
  const shades = tourShades(targets, viewport);
  const contains = (r, x, y) => x > r.left && x < r.left + r.width && y > r.top && y < r.top + r.height;
  for (let x = 0.5; x < viewport.width; x += 5) for (let y = 0.5; y < viewport.height; y += 5) {
    assert.equal(shades.filter(r => contains(r, x, y)).length, targets.some(r => contains(r, x, y)) ? 0 : 1);
  }
});

test('guide cards leave the selected navigation tab uncovered on narrow screens', () => {
  for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 480 }, { width: 844, height: 390 }]) {
    const nav = { left: 10, top: 100, right: 75, bottom: 148 };
    const layout = tourLayout(null, viewport, { width: 560, height: 650 }, nav);
    const { card: panel, navigation: highlight } = layout;
    assert.ok(panel.left >= highlight.left + highlight.width || panel.left + panel.width <= highlight.left
      || panel.top >= highlight.top + highlight.height || panel.top + Math.min(650, panel.maxHeight) <= highlight.top);
    assert.ok(layout.card.maxHeight > 0);
    assert.ok(layout.card.top + layout.card.maxHeight <= viewport.height);
    assert.ok(layout.shades.length);
  }
});

test('long guide instructions scroll below the target instead of covering it when navigation blocks the space above', () => {
  const layout = tourLayout({ left: 32, top: 420, right: 366, bottom: 526 },
    { width: 390, height: 844 }, { width: 380, height: 520 },
    { left: 82, top: 168, right: 155, bottom: 224 });
  assert.ok(layout.card.top >= layout.target.top + layout.target.height);
  assert.ok(layout.card.maxHeight >= 280);
  assert.ok(layout.card.top + layout.card.maxHeight <= 844);
});

test('a viewport-filling output card cannot reduce the guide to an unreadable strip', () => {
  const layout = tourLayout({ left: 24, top: 260, right: 366, bottom: 800 },
    { width: 390, height: 844 }, { width: 380, height: 520 },
    { left: 230, top: 168, right: 303, bottom: 224 });
  assert.ok(layout.card.maxHeight >= 320);
  assert.ok(layout.card.top >= layout.navigation.top + layout.navigation.height);
  assert.ok(layout.card.top + layout.card.maxHeight <= 844);
});
