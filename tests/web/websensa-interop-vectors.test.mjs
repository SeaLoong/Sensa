import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { parseFunscript, scriptValue } from '../../src/core/index.ts';

const vectors = JSON.parse(await fs.readFile(new URL('../fixtures/funscript-interop.json', import.meta.url), 'utf8'));
for (const vector of vectors.cases) {
  test('browser and desktop share funscript contract: ' + vector.name, () => {
    const script = parseFunscript(vector.script);
    assert.equal(script.durationMs, vector.durationMs);
    for (const sample of vector.samples)
      assert.ok(Math.abs(scriptValue(script, sample.at) - sample.value) < 0.000001, vector.name + ' at ' + sample.at);
  });
}
