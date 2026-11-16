import test from 'node:test';
import assert from 'node:assert/strict';
import { tourLayout, tourTarget } from '../../src/web/tour-layout.js';
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
  assert.equal(tourTarget('mapping'), '.preset-strip');
  assert.match(tourTarget('axes'), /axis-profiles/);
  assert.match(tourTarget('device'), /outputs-section/);
  assert.equal(tourTarget('ready'), '.header-actions');
  assert.equal(tourTarget('goal'), null);
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
