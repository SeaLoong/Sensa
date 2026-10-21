import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Exercise the real JSX without a browser, device, or running application.
// Reuse React's instance so its server renderer owns the component's hooks.
const require = createRequire(import.meta.url);
const reactUrl = pathToFileURL(require.resolve('react')).href;
const compiled = await build({
  absWorkingDir: fileURLToPath(new URL('../../', import.meta.url)),
  entryPoints: ['src/web/OscParameterTable.jsx'],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
  plugins: [{
    name: 'shared-test-react',
    setup(builder) {
      builder.onResolve({ filter: /^react$/ }, () => ({ path: reactUrl, external: true }));
    },
  }],
});
const { default: OscParameterTable } = await import(
  'data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64')
);

function render(entries, pinnedPaths = []) {
  return renderToStaticMarkup(React.createElement(OscParameterTable, {
    entries, pinnedPaths, filterKey: 'all',
    onTogglePinned() {}, onInspect() {}, onMap() {},
  }));
}

for (const count of [0, 100, 101, 4096, 12000]) {
  test(`parameter table mounts at most 100 rows for ${count} entries / 参数表行数上限`, () => {
    const entries = Array.from({ length: count }, (_, index) => ({
      path: `Large/Parameter${index}`, sourceKey: 'source', sourceLabel: 'Test source',
      value: String(index), timestampMs: 0,
    }));
    const html = render(entries);
    const body = html.slice(html.indexOf('<tbody>'), html.indexOf('</tbody>'));
    assert.equal((body.match(/<tr\b/g) || []).length, Math.min(count, 100));
    assert.equal(/<nav\b/.test(html), count > 100);
    assert.match(html, /role="region" aria-label="[^"]+"/);
    if (count > 100) {
      const navigation = html.slice(html.indexOf('<nav'));
      assert.equal((navigation.match(/<button\b/g) || []).length, 2);
      assert.equal((navigation.match(/<button[^>]+disabled=""/g) || []).length, 1);
    }
  });
}

test('table preserves same-path rows from distinct sources and escapes captured text / 同名参数保留独立来源并转义文本', () => {
  const path = 'Custom/<Parameter>';
  const html = render([
    { path, sourceKey: 'a', sourceLabel: 'Source <A>', value: '<old>', _matches: null },
    { path, sourceKey: 'b', sourceLabel: 'Source & B', value: '<new>', _matches: [{}] },
  ], [path]);
  const body = html.slice(html.indexOf('<tbody>'), html.indexOf('</tbody>'));
  assert.equal((body.match(/<tr\b/g) || []).length, 2);
  assert.equal((body.match(/class="is-mapped"/g) || []).length, 1);
  assert.match(body, /Source &lt;A&gt;/);
  assert.match(body, /Source &amp; B/);
  assert.match(body, /&lt;old&gt;/);
  assert.match(body, /&lt;new&gt;/);
  assert.equal((body.match(/>★<\/button>/g) || []).length, 2);
  assert.doesNotMatch(body, /<Parameter>|<old>|<new>/);
});
