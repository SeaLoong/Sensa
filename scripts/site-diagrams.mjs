/** Locally shipped Mermaid browser distribution; no CDN or browser build step. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const escape = value => String(value).replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);
const words = {
  en: { label: 'Flowchart', source: 'Diagram source', sourceScroll: 'Diagram source; scroll horizontally when needed', scroll: 'Flowchart; scroll horizontally when needed',
    fallback: 'The visual diagram requires JavaScript. Its complete source is available below.',
    error: 'The visual diagram could not be displayed. Its complete source is available below.' },
  'zh-CN': { label: '流程图', source: '图表源码', sourceScroll: '图表源码；内容超宽时可横向滚动', scroll: '流程图；内容超宽时可横向滚动',
    fallback: '图形显示需要 JavaScript；下方保留完整图表源码。',
    error: '图形暂时无法显示；下方保留完整图表源码。' },
};

export function documentDiagram(source, { locale, index, title }) {
  const text = words[locale];
  if (!text || !Number.isSafeInteger(index) || index < 0) throw new Error('Invalid documentation diagram identity');
  return '<figure class="doc-diagram" data-document-diagram data-diagram-id="sensa-diagram-' + index
    + '" data-diagram-label="' + escape(text.label + ': ' + title) + '" data-diagram-error="' + escape(text.error) + '">'
    + '<div class="doc-diagram-canvas doc-scroll" role="region" tabindex="0" aria-label="' + escape(text.scroll) + '" hidden></div>'
    + '<p class="doc-diagram-status" role="status">' + escape(text.fallback) + '</p>'
    + '<details class="doc-diagram-source" open><summary>' + escape(text.source) + '</summary>'
    + '<div class="doc-scroll" role="region" tabindex="0" aria-label="' + escape(text.sourceScroll) + '">'
    + '<pre><code class="language-mermaid">' + escape(source) + '</code></pre></div></details></figure>\n';
}

export async function documentDiagramAssets(source = root) {
  const metadata = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  const directory = path.join(root, 'node_modules/@mermaid-js/tiny');
  const installed = JSON.parse(await fs.readFile(path.join(directory, 'package.json'), 'utf8'));
  if (installed.version !== metadata.devDependencies['@mermaid-js/tiny'])
    throw new Error('Mermaid browser distribution differs from the pinned dependency; run npm ci.');
  const runtime = await fs.readFile(path.join(directory, 'dist/mermaid.tiny.js'));
  const enhancement = await fs.readFile(path.join(source, '.github/pages/diagrams.js'));
  const license = await fs.readFile(path.join(directory, 'LICENSE'), 'utf8');
  // Preserve the upstream browser distribution byte-for-byte, including its
  // DOMPurify/Lodash notices. The local wrapper follows it in one classic script,
  // so cached-page fallback cannot race a separately loaded runtime.
  const text = runtime.toString('utf8'), start = text.indexOf('/*! Bundled license information:');
  if (start < 0 || !text.includes('globalThis["mermaid"]')) throw new Error('Unexpected Mermaid browser distribution');
  const notices = text.slice(start, text.indexOf('\nglobalThis["mermaid"]', start));
  return {
    content: Buffer.concat([runtime, Buffer.from('\n;\n'), enhancement]),
    license: Buffer.from('Mermaid browser distribution ' + installed.version + '\n'
      + 'https://github.com/mermaid-js/mermaid\n\n' + license + '\n\n' + notices + '\n'),
    version: installed.version,
  };
}
