/** Standalone documentation build. / 独立文档站构建。 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import MarkdownIt from 'markdown-it';
const root = fileURLToPath(new URL('../', import.meta.url));
const locales = ['en', 'zh-CN'];
const folders = ['', 'docs', 'unity/top.sealoong.sensa', 'tools/unity-avatar-lab', 'tools/unity-world-lab'];
const diagramAssets = ['parameter-geometry-model.js', 'parameter-geometry-view.js', 'parameter-geometry-style.css', 'parameter-geometry-3d.js', 'parameter-geometry-3d.LICENSE.txt', 'osc-parameter-reference.js'];
const words = {
  en: { docs: 'Documentation', diagram: 'Parameter explorer', source: 'View source', download: 'Downloads', navigation: 'Navigation', top: 'On this page', table: 'Table; scroll horizontally when needed', code: 'Code example; scroll horizontally when needed' },
  'zh-CN': { docs: '文档', diagram: '参数图解', source: '查看源码', download: '下载', navigation: '导航', top: '本页目录', table: '表格；内容超宽时可横向滚动', code: '代码示例；内容超宽时可横向滚动' },
};
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const relative = (from, to) => path.posix.relative(path.posix.dirname(from), to) || path.posix.basename(to);
const localeOf = file => file.endsWith('.en.md') || /(^|\/)README\.md$/.test(file) ? 'en' : 'zh-CN';
const slugOf = file => file.replace(/(?:\.en|\.zh-CN)?\.md$/, '');
const isAlias = file => /(^|\/)README\.en\.md$/.test(file);

export function mapDocumentHeadings(outline, translated) {
  if (outline.length !== translated.length || !outline.every((heading, index) => heading.tag === translated[index].tag)) return {};
  return Object.fromEntries(outline.map((heading, index) => [heading.id, translated[index].id]));
}

export async function buildPages({ source = root, output = path.join(root, 'artifacts/pages'), commit = process.env.GITHUB_SHA || '' } = {}) {
  const documents = new Map(), routes = new Map(), emitted = new Set(), links = [], headings = new Map(), outlines = new Map(), rendered = [];
  for (const folder of folders) {
    for (const name of await fs.readdir(path.join(source, folder))) {
      if (!name.endsWith('.md') || (folder === '' && !name.startsWith('README'))) continue;
      const file = path.posix.join(folder, name);
      if (isAlias(file)) continue;
      const text = await fs.readFile(path.join(source, file), 'utf8');
      const locale = localeOf(file), slug = slugOf(file);
      documents.set(file, { file, text, locale, slug, route: locale + '/' + slug + '.html' });
    }
  }
  for (const file of ['GLOSSARY.md', ...(await fs.readdir(path.join(source, 'docs/adr'))).filter(x => x.endsWith('.md')).map(x => 'docs/adr/' + x)]) {
    const text = await fs.readFile(path.join(source, file), 'utf8');
    for (const locale of locales) documents.set(locale + ':' + file, { file, text, locale, slug: slugOf(file), route: locale + '/' + slugOf(file) + '.html' });
  }
  for (const document of documents.values()) routes.set(document.locale + ':' + document.slug, document.route);
  const documentRoute = (file, locale) => {
    const preferred = file === 'GLOSSARY.md' || file.startsWith('docs/adr/') ? locale : isAlias(file) ? 'en' : localeOf(file);
    return routes.get(preferred + ':' + slugOf(file));
  };
  const write = async (name, data) => {
    await fs.mkdir(path.dirname(path.join(output, name)), { recursive: true });
    await fs.writeFile(path.join(output, name), data);
    emitted.add(name);
  };
  const titleOf = document => document.text.match(/^#\s+(.+)$/m)?.[1].replace(/[*_\x60]/g, '') || document.slug;
  const shell = (document, body, toc) => {
    const { locale, route } = document, t = words[locale], other = locale === 'en' ? 'zh-CN' : 'en';
    const buddy = routes.get(other + ':' + document.slug) || other + '/README.html';
    const outline = outlines.get(route) || [], buddyOutline = outlines.get(buddy) || [];
    const headingMap = routes.has(other + ':' + document.slug) ? mapDocumentHeadings(outline, buddyOutline) : {};
    const href = target => escape(relative(route, target));
    const nav = ['README', 'docs/quick-start', 'docs/signal-pipeline', 'docs/guide', 'docs/features', 'docs/computed-signals', 'docs/usage-scenarios', 'docs/osc-parameters', 'docs/positioning', 'docs/languages', 'unity/top.sealoong.sensa/README', 'tools/unity-world-lab/README', 'tools/unity-avatar-lab/README', 'docs/development'];
    const navigation = nav.map(key => {
      const target = routes.get(locale + ':' + key), item = [...documents.values()].find(x => x.route === target);
      return item ? '<a' + (route === target ? ' aria-current="page"' : '') + ' href="' + href(target) + '">' + escape(titleOf(item)) + '</a>' : '';
    }).join('');
    return '<!doctype html><html lang="' + (locale === 'en' ? 'en-US' : locale) + '"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="description" content="' + escape(titleOf(document) + ' — Sensa documentation') + '"><title>' + escape(titleOf(document)) + ' · Sensa</title><link rel="stylesheet" href="' + href('site.css') + '"><script defer src="' + href('site.js') + '"></script></head><body><a class="skip" href="#content">Skip to content / 跳到正文</a>'
      + '<header><a class="brand" href="' + href('index.html') + '">Sensa<span>' + t.docs + '</span></a><nav aria-label="' + t.navigation + '"><a href="' + href('parameter-geometry.html') + '?lang=' + (locale === 'en' ? 'en-US' : locale) + '">' + t.diagram + '</a><a href="https://github.com/SeaLoong/Sensa/releases">' + t.download + '</a><a data-locale="' + other + '" data-heading-map="' + escape(JSON.stringify(headingMap)) + '" href="' + href(buddy) + '">' + (other === 'en' ? 'English' : '简体中文') + '</a></nav></header>'
      + '<div class="layout"><details class="navigation" open><summary>' + t.navigation + '</summary><nav>' + navigation + '</nav></details><main id="content" tabindex="-1"><article>' + body + '</article><footer><a href="https://github.com/SeaLoong/Sensa/blob/main/' + escape(document.file) + '">' + t.source + '</a><span>MIT · SeaLoong</span></footer></main><aside aria-label="' + t.top + '"><p>' + t.top + '</p>' + toc.map(x => '<a href="#' + escape(x.id) + '">' + escape(x.title) + '</a>').join('') + '</aside></div></body></html>\n';
  };
  for (const document of documents.values()) {
    const toc = [], seen = new Map(), ids = new Set(), outline = [];
    const md = new MarkdownIt({ html: false, linkify: false, typographer: false });
    const scrollRegion = label => '<div class="doc-scroll" role="region" tabindex="0" aria-label="' + escape(label) + '">';
    md.renderer.rules.table_open = (tokens, index, options, env, render) => scrollRegion(words[document.locale].table) + render.renderToken(tokens, index, options);
    md.renderer.rules.table_close = (tokens, index, options, env, render) => render.renderToken(tokens, index, options) + '</div>\n';
    const fence = md.renderer.rules.fence, codeBlock = md.renderer.rules.code_block;
    md.renderer.rules.fence = (...args) => scrollRegion(words[document.locale].code) + fence(...args) + '</div>\n';
    md.renderer.rules.code_block = (...args) => scrollRegion(words[document.locale].code) + codeBlock(...args) + '</div>\n';
    md.renderer.rules.heading_open = (tokens, index, options, env, render) => {
      const title = tokens[index + 1].content;
      const base = title.toLowerCase().replace(/<[^>]*>/g, '').replace(/[^\p{L}\p{N}_\s-]/gu, '').trim().replace(/\s/g, '-');
      const count = seen.get(base) || 0, id = base + (count ? '-' + count : '');
      seen.set(base, count + 1); ids.add(id); tokens[index].attrSet('id', id);
      tokens[index].attrSet('tabindex', '-1');
      outline.push({ id, tag: tokens[index].tag });
      if (tokens[index].tag === 'h2') toc.push({ id, title });
      return render.renderToken(tokens, index, options);
    };
    const rewrite = async (url, image = false) => {
      // Only current, public Markdown is local. Pinned research/source references stay external.
      // 仅当前公开Markdown转站内；固定修订的研究与源码链接保留外链。
      const github = /^https:\/\/github\.com\/SeaLoong\/Sensa\/blob\/main\/([^?#]+\.md)(\?[^#]*)?(#.*)?$/.exec(url);
      if (github) {
        const target = documentRoute(decodeURIComponent(github[1]), document.locale);
        if (target) {
          links.push({ from: document.route, to: target, fragment: (github[3] || '').slice(1) });
          return relative(document.route, target) + (github[2] || '') + (github[3] || '');
        }
      }
      if (/^(?:https?:|mailto:|vcc:|data:)/i.test(url)) return url;
      if (url.startsWith('#')) { links.push({ from: document.route, to: document.route, fragment: url.slice(1) }); return url; }
      const match = /^([^?#]*)(\?[^#]*)?(#.*)?$/.exec(url);
      if (!match) return url;
      const file = path.posix.normalize(path.posix.join(path.posix.dirname(document.file), decodeURIComponent(match[1])));
      if (file.startsWith('../') || path.posix.isAbsolute(file)) throw new Error('Link escapes repository: ' + document.file + ': ' + url);
      let target;
      if (/\.md$/.test(file)) target = documentRoute(file, document.locale);
      else if (file === 'docs/parameter-geometry.html') target = 'parameter-geometry.html';
      else if (image && /\.(?:png|jpe?g|webp|gif|svg)$/i.test(file)) {
        target = 'media/' + file; await write(target, await fs.readFile(path.join(source, file)));
      }
      if (!target) return 'https://github.com/SeaLoong/Sensa/blob/main/' + file + (match[3] || '');
      if (target !== 'parameter-geometry.html') links.push({ from: document.route, to: target, fragment: (match[3] || '').slice(1) });
      return relative(document.route, target) + (match[2] || '') + (match[3] || '');
    };
    const tokens = md.parse(document.text, {});
    const walk = async entries => {
      for (const token of entries) {
        for (const attribute of token.attrs || []) if (attribute[0] === 'href' || attribute[0] === 'src') attribute[1] = await rewrite(attribute[1], attribute[0] === 'src');
        if (token.children) await walk(token.children);
      }
    };
    await walk(tokens);
    const body = md.renderer.render(tokens, md.options, {});
    headings.set(document.route, ids);
    outlines.set(document.route, outline);
    rendered.push({ document, body, toc });
  }
  const failures = links.filter(x => x.fragment && headings.has(x.to) && !headings.get(x.to).has(decodeURIComponent(x.fragment)));
  if (failures.length) throw new Error('Broken documentation anchors:\n' + failures.map(x => x.from + ' -> ' + x.to + '#' + x.fragment).join('\n'));
  for (const { document, body, toc } of rendered) await write(document.route, shell(document, body, toc));
  let versions = [], vpmUrl = '';
  try {
    const index = JSON.parse(await fs.readFile(path.join(output, 'vpm.json'), 'utf8'));
    versions = Object.keys(index.packages['top.sealoong.sensa'].versions);
    if (versions.length) {
      const url = new URL(index.url);
      if (url.protocol !== 'https:') throw new Error('Published VPM index URL must use HTTPS');
      vpmUrl = url.href;
    }
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const available = versions.length > 0;
  const homepage = (await fs.readFile(path.join(source, '.github/pages/index.html'), 'utf8'))
    .replaceAll('__VPM_AVAILABLE__', String(available))
    .replaceAll('__VPM_STATUS_EN__', available ? 'Stable packages are available through VCC; versions may lag development previews.' : 'No stable VPM package is currently available.')
    .replaceAll('__VPM_STATUS_ZH__', available ? '可通过 VCC 安装正式版组件包，版本可能落后开发预览。' : '当前没有可用的 VPM 正式版组件包。')
    .replaceAll('__VPM_INSTALL_HIDDEN__', available ? '' : 'hidden')
    .replaceAll('__VPM_INSTALL_URL__', available ? escape('vcc://vpm/addRepo?url=' + encodeURIComponent(vpmUrl)) : '#');
  await write('index.html', homepage);
  for (const name of ['site.css', 'site.js']) await write(name, await fs.readFile(path.join(source, '.github/pages', name)));
  await write('parameter-geometry.html', (await fs.readFile(path.join(source, 'docs/parameter-geometry.html'), 'utf8')).replace('<head>', '<head>\n<meta name="sensa-site-root" content="./">'));
  for (const name of diagramAssets) await write('assets/' + name, await fs.readFile(path.join(source, 'docs/assets', name)));
  await write('.nojekyll', '');
  // Deployment control files are not public HTTP resources. / 部署控制文件不列入公开 HTTP 资源。
  emitted.delete('.nojekyll');
  const assets = {};
  for (const name of [...emitted].sort()) assets[name] = createHash('sha256').update(await fs.readFile(path.join(output, name))).digest('hex');
  const manifest = { commit, locales, routes: [...routes.values()].sort(), assets, vpmVersions: versions.sort() };
  await write('site-manifest.json', JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const index = process.argv.indexOf('--output');
  const manifest = await buildPages(index >= 0 ? { output: path.resolve(process.argv[index + 1]) } : {});
  console.log('Built documentation routes / 已构建文档路由: ' + manifest.routes.length);
}
