import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { documentDiagram, documentDiagramAssets } from '../../scripts/site-diagrams.mjs';

const wrapper = await fs.readFile(new URL('../../.github/pages/diagrams.js', import.meta.url), 'utf8');
const validSource = 'flowchart LR\n  Website --> Sensa --> OSR\n';
function figure(source, index = 1) {
  const canvas = { hidden: true, children: [], replaceChildren(...children) { this.children = children; } };
  const details = { open: true }, status = { hidden: false, textContent: 'Source remains available' };
  return { dataset: { diagramId: 'sensa-diagram-' + index, diagramLabel: 'Flowchart: guide', diagramError: '图形暂时无法显示' },
    canvas, details, status,
    querySelector(selector) { return { '.language-mermaid': { textContent: source }, '.doc-diagram-canvas': canvas,
      '.doc-diagram-source': details, '.doc-diagram-status': status }[selector]; } };
}
function graphic({ attributes = [{ name: 'xmlns', value: 'http://www.w3.org/2000/svg' }], forbidden = false, style = '' } = {}) {
  return { localName: 'svg', namespaceURI: 'http://www.w3.org/2000/svg', attributes, assigned: {},
    querySelector: () => forbidden ? {} : null,
    querySelectorAll: selector => selector === 'style' && style ? [{ textContent: style }] : [],
    setAttribute(name, value) { this.assigned[name] = value; } };
}
async function execute(figures, { renderer, svg = graphic(), xml = {}, fonts = Promise.resolve() } = {}) {
  let config, calls = 0;
  const parseCalls = [], imports = [];
  const mermaid = renderer === null ? undefined : { initialize(value) { config = value; },
    async render(...args) { calls++; return renderer ? renderer(...args) : { svg: '<svg />', bindFunctions() { throw new Error('Must not bind callbacks'); } }; } };
  vm.runInNewContext(wrapper, { document: { fonts: { ready: fonts }, querySelectorAll: () => figures,
    importNode(node, deep) { assert.equal(node, svg); assert.equal(deep, true); imports.push(node); return node; },
  }, DOMParser: class {
    parseFromString(value, type) {
      parseCalls.push({ value, type });
      assert.equal(type, 'image/svg+xml');
      return { documentElement: svg, doctype: xml.doctype || null,
        children: xml.multiple ? [svg, graphic()] : svg ? [svg] : [],
        querySelector: selector => { assert.equal(selector, 'parsererror'); return xml.parserError ? {} : null; },
      };
    }
  }, mermaid });
  // The wrapper deliberately runs without a public API or exposing Mermaid to documents.
  // Wait for its bounded per-figure promise work, without a browser or a DOM emulator.
  for (let index = 0; index < figures.length * 3 + 4; index++) await Promise.resolve();
  return { config, calls, parseCalls, imports };
}

test('Mermaid fences retain exact escaped source and an accessible no-JavaScript fallback', () => {
  const examples = [
    { source: 'flowchart LR\n A[</code><script>alert("x")</script>] --> B[& source]\n',
      escaped: 'flowchart LR\n A[&lt;/code&gt;&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;] --&gt; B[&amp; source]\n' },
    { source: 'flowchart LR\n A[<ScRiPt data-value="x">alert(1)</ScRiPt><IMG SRC=//example.test/a ONERROR=alert(1)>] --> B\n',
      escaped: 'flowchart LR\n A[&lt;ScRiPt data-value=&quot;x&quot;&gt;alert(1)&lt;/ScRiPt&gt;&lt;IMG SRC=//example.test/a ONERROR=alert(1)&gt;] --&gt; B\n' },
  ];
  for (const locale of ['en', 'zh-CN']) for (const { source, escaped } of examples) {
    const html = documentDiagram(source, { locale, index: 1, title: 'Guide "<&>' });
    assert.match(html, /data-document-diagram/);
    assert.match(html, /class="doc-diagram-canvas doc-scroll" role="region" tabindex="0"[^>]+ hidden/);
    assert.match(html, /<details class="doc-diagram-source" open>/);
    assert.ok(html.includes('<pre><code class="language-mermaid">' + escaped + '</code></pre>'));
    assert.ok(html.includes('data-diagram-label="' + (locale === 'en' ? 'Flowchart' : '流程图') + ': Guide &quot;&lt;&amp;&gt;"'));
    assert.equal(html.includes(source), false);
    assert.ok(html.includes(locale === 'en' ? 'requires JavaScript' : '需要 JavaScript'));
  }
  assert.throws(() => documentDiagram(examples[0].source, { locale: 'en', index: -1, title: 'Bad identity' }));
});

test('offline browser asset preserves the pinned distribution, MIT license and bundled notices', async () => {
  const assets = await documentDiagramAssets();
  const runtime = await fs.readFile(new URL('../../node_modules/@mermaid-js/tiny/dist/mermaid.tiny.js', import.meta.url));
  assert.equal(assets.version, '12.2.0');
  assert.ok(assets.content.subarray(0, runtime.length).equals(runtime), 'Retain every upstream runtime byte and legal comment');
  assert.ok(assets.content.subarray(runtime.length).toString().endsWith(wrapper));
  for (const notice of ['The MIT License', 'DOMPurify 3.4.12', 'Lodash', 'OpenJS Foundation'])
    assert.ok(assets.license.includes(notice), notice);
  new vm.Script(assets.content.toString()); // Syntax check only; no browser/renderer process.
});

test('a rendered diagram has an accessible SVG while its complete source remains expandable', async () => {
  const one = figure(validSource), svg = graphic({ attributes: [
    { name: 'xmlns', value: 'http://www.w3.org/2000/svg' },
    { name: 'marker-end', value: 'url("#sensa-arrow")' },
  ] });
  const { config, calls, parseCalls, imports } = await execute([one], { svg });
  assert.equal(calls, 1);
  assert.equal(config.securityLevel, 'strict');
  assert.equal(config.htmlLabels, false);
  assert.equal(config.flowchart.htmlLabels, false);
  assert.equal(config.startOnLoad, false);
  assert.ok(config.secure.includes('securityLevel') && config.secure.includes('flowchart'));
  assert.equal(one.dataset.diagramState, 'rendered');
  assert.equal(one.canvas.hidden, false);
  assert.equal(one.canvas.children[0], svg);
  assert.deepEqual(svg.assigned, { role: 'img', 'aria-label': 'Flowchart: guide' });
  assert.equal(one.details.open, false);
  assert.equal(one.status.hidden, true);
  assert.deepEqual(parseCalls, [{ value: '<svg />', type: 'image/svg+xml' }]);
  assert.deepEqual(imports, [svg]);
});

test('SVG XML declarations are rejected before parsing or importing any content', async () => {
  for (const declaration of ['<!DOCTYPE svg>', '<!doctype svg SYSTEM "//example.test/external.dtd">', '<!ENTITY payload "value">']) {
    const one = figure(validSource);
    const result = await execute([one], { renderer: async () => ({ svg: declaration + '<svg />' }) });
    assert.equal(result.parseCalls.length, 0);
    assert.equal(result.imports.length, 0);
    assert.equal(one.dataset.diagramState, 'error');
    assert.equal(one.details.open, true);
  }
});

test('malformed, multi-root, non-SVG or doctype XML is never imported into the visible document', async () => {
  const wrongNamespace = graphic(); wrongNamespace.namespaceURI = 'http://www.w3.org/1999/xhtml';
  const wrongRoot = graphic(); wrongRoot.localName = 'html';
  for (const options of [{ xml: { parserError: true } }, { xml: { multiple: true } },
    { xml: { doctype: {} } }, { svg: wrongNamespace }, { svg: wrongRoot }, { svg: null }]) {
    const one = figure(validSource);
    const result = await execute([one], options);
    assert.equal(result.parseCalls.length, 1);
    assert.equal(result.imports.length, 0);
    assert.equal(one.dataset.diagramState, 'error');
    assert.equal(one.details.open, true);
    assert.equal(one.canvas.children.length, 0);
  }
});

test('one invalid flowchart retains its readable source without stopping the next diagram', async () => {
  const first = figure('flowchart LR\n broken['), second = figure(validSource, 2);
  const { calls } = await execute([first, second], { renderer: async id => {
    if (id === first.dataset.diagramId) throw new Error('Invalid syntax');
    return { svg: '<svg />' };
  } });
  assert.equal(calls, 2);
  assert.equal(first.dataset.diagramState, 'error');
  assert.equal(first.details.open, true);
  assert.equal(first.status.textContent, first.dataset.diagramError);
  assert.equal(first.status.hidden, false);
  assert.equal(first.canvas.hidden, true);
  assert.deepEqual(first.canvas.children, []);
  assert.equal(second.dataset.diagramState, 'rendered');
});

test('active directives, HTML, image definitions and URL payloads never reach Mermaid measurement', async () => {
  for (const payload of [
    '%%{init:{"securityLevel":"loose"}}%%\nflowchart LR\nA-->B',
    '---\nconfig:\n  securityLevel: loose\n---\nflowchart LR\nA-->B',
    'flowchart LR\nA[<img src=x onerror=alert(1)>]-->B',
    'flowchart LR\nA@{ img: "https://example.test/image.svg" }',
    'flowchart LR\nclick A call callback()',
    'flowchart LR\nclassDef active fill:url(//example.test/image)',
  ]) {
    const one = figure(payload);
    assert.equal((await execute([one])).calls, 0, payload);
    assert.equal(one.dataset.diagramState, 'error');
    assert.equal(one.details.open, true);
  }
});

test('unexpected executable SVG content is rejected rather than inserted into the page', async () => {
  for (const options of [
    { forbidden: true }, { attributes: [{ name: 'onload', value: 'alert(1)' }] },
    { attributes: [{ name: 'href', value: 'https://example.test/' }] },
    { attributes: [{ name: 'style', value: 'fill:url(//example.test/image)' }] },
    { style: '@import "//example.test/style.css"' },
  ]) {
    const one = figure(validSource);
    const result = await execute([one], { svg: graphic(options) });
    assert.equal(one.dataset.diagramState, 'error');
    assert.equal(one.canvas.children.length, 0);
    assert.equal(one.details.open, true);
    assert.equal(result.imports.length, 0);
  }
});

test('missing runtime preserves source and unavailable web fonts do not prevent rendering', async () => {
  const missing = figure(validSource);
  await execute([missing], { renderer: null });
  assert.equal(missing.details.open, true);
  assert.equal(missing.canvas.hidden, true);
  const fonts = Promise.reject(new Error('Unavailable fonts'));
  const one = figure(validSource);
  await execute([one], { fonts });
  assert.equal(one.dataset.diagramState, 'rendered');
});
