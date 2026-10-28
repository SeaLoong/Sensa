/** Standalone documentation build. / 独立文档站构建。 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import MarkdownIt from 'markdown-it';
import { screenshotGallery } from './site-screenshots.mjs';
import { documentDiagram, documentDiagramAssets } from './site-diagrams.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const locales = ['en', 'zh-CN'];
const folders = ['', 'docs', 'unity/top.sealoong.sensa', 'tools/unity-avatar-lab', 'tools/unity-world-lab', 'tools/protocol-bridge'];
const diagramAssets = ['parameter-geometry-model.js', 'parameter-geometry-view.js', 'parameter-geometry-style.css', 'parameter-geometry-3d.js', 'parameter-geometry-3d.LICENSE.txt', 'osc-parameter-reference.js'];
const words = {
  en: { docs: 'Help', diagram: 'Parameter explorer', source: 'View source', download: 'Download', navigation: 'Browse guides', top: 'On this page', skip: 'Skip to content', home: 'Home', filter: 'Find a guide', empty: 'No matching guide. Try a shorter name.', table: 'Table; scroll horizontally when needed', code: 'Code example; scroll horizontally when needed' },
  'zh-CN': { docs: '使用帮助', diagram: '参数图解', source: '查看源码', download: '下载', navigation: '浏览帮助目录', top: '本页目录', skip: '跳到正文', home: '首页', filter: '查找文档', empty: '没有找到匹配的文档，可以缩短关键词再试。', table: '表格；内容超宽时可横向滚动', code: '代码示例；内容超宽时可横向滚动' },
};
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const relative = (from, to) => path.posix.relative(path.posix.dirname(from), to) || path.posix.basename(to);
const localeOf = file => file.endsWith('.en.md') || /(^|\/)README\.md$/.test(file) ? 'en' : 'zh-CN';
const slugOf = file => file.replace(/(?:\.en|\.zh-CN)?\.md$/, '');
const isAlias = file => /(^|\/)README\.en\.md$/.test(file);
const stylesheetFallback = target => 'this.onerror=null;this.href=' + JSON.stringify(target);
const scriptFallback = target => "this.onerror=null;const load=()=>{const script=document.createElement('script');script.src="
  + JSON.stringify(target) + ";document.head.append(script)};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',load,{once:true});else load()";

export function mapDocumentHeadings(outline, translated) {
  if (outline.length !== translated.length || !outline.every((heading, index) => heading.tag === translated[index].tag)) return {};
  return Object.fromEntries(outline.map((heading, index) => [heading.id, translated[index].id]));
}

export async function buildPages({ source = root, output = path.join(root, 'artifacts/pages'), commit = process.env.GITHUB_SHA || '' } = {}) {
  const documents = new Map(), routes = new Map(), emitted = new Set(), links = [], headings = new Map(), outlines = new Map(), rendered = [];
  const siteAssets = {};
  for (const extension of ['css', 'js']) {
    const file = await fs.readFile(path.join(source, '.github/pages', 'site.' + extension));
    const content = file;
    const digest = createHash('sha256').update(content).digest('hex').slice(0, 16);
    siteAssets[extension] = { name: 'site.' + digest + '.' + extension, content };
  }
  const diagrams = await documentDiagramAssets(source);
  siteAssets.diagrams = { name: 'document-diagrams.' + createHash('sha256').update(diagrams.content).digest('hex').slice(0, 16) + '.js',
    content: diagrams.content };
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
  let screenshotCatalog;
  const gallery = await screenshotGallery(source, async (name, data) => {
    if (name === 'screenshots-manifest.json') screenshotCatalog = JSON.parse(data);
    await write(name, data);
  });
  // Pair only captures already validated and published by the screenshot catalog.
  // 仅为清单中已核验并导出的原图建立桌面／窄屏对应关系。
  const screenshotFiles = new Set((screenshotCatalog.additionalImages || []).map(record => record.file));
  const screenshotPairs = new Map();
  for (const scene of screenshotCatalog.scenes) {
    for (const locale of locales) {
      const desktop = scene.images.desktop[locale].file, mobile = scene.images.mobile[locale].file;
      screenshotFiles.add(desktop); screenshotFiles.add(mobile);
      if (screenshotPairs.has(desktop) && screenshotPairs.get(desktop) !== mobile)
        throw new Error('Ambiguous narrow screenshot for: ' + desktop);
      screenshotPairs.set(desktop, mobile);
    }
  }
  for (const desktop of screenshotFiles) {
    const mobile = desktop.replace(/^desktop\//, 'mobile/');
    if (desktop.startsWith('desktop/') && screenshotFiles.has(mobile) && !screenshotPairs.has(desktop))
      screenshotPairs.set(desktop, mobile);
  }
  const responsiveScreenshots = new Map([...screenshotPairs].map(([desktop, mobile]) =>
    ['media/docs/screenshots/' + desktop, 'media/docs/screenshots/' + mobile]));
  const titleOf = document => document.text.match(/^#\s+(.+)$/m)?.[1].replace(/[*_\x60]/g, '') || document.slug;
  const shell = (document, body, toc) => {
    const { locale, route } = document, t = words[locale], other = locale === 'en' ? 'zh-CN' : 'en';
    const buddy = routes.get(other + ':' + document.slug) || other + '/README.html';
    const outline = outlines.get(route) || [], buddyOutline = outlines.get(buddy) || [];
    const headingMap = routes.has(other + ':' + document.slug) ? mapDocumentHeadings(outline, buddyOutline) : {};
    const href = target => escape(relative(route, target));
    const groups = [
      { en: 'Start here', zh: '开始使用', links: [
        ['README', 'About Sensa', '认识 Sensa'], ['docs/quick-start', 'First run', '首次使用'],
        ['docs/guide', 'Workbench guide', '工作台指南'], ['docs/usage-scenarios', 'Examples', '使用场景'],
        ['docs/features', 'All features', '完整功能'],
      ] },
      { en: 'Inputs and outputs', zh: '输入与联动', links: [
        ['docs/signal-pipeline', 'Build a flow', '建立信号流程'], ['docs/computed-signals', 'Calculations', '计算与映射'],
        ['docs/protocol-inputs', 'Protocol inputs', '协议输入'], ['tools/protocol-bridge/README', 'Serial and Bluetooth bridges', '串口与蓝牙桥'],
        ['docs/osc-parameters', 'OSC parameters', 'OSC 参数字典'], ['docs/positioning', 'Position and tracking', '位置与定位'],
        ['docs/languages', 'Language settings', '语言设置'],
      ] },
      { en: 'Unity and development', zh: 'Unity 与开发', links: [
        ['unity/top.sealoong.sensa/README', 'Unity setup', 'Unity 配置指南'],
        ['docs/unity-build', 'Avatar build process', 'Avatar 构建流程'],
        ['docs/shader-capture-research', 'Shader capture design', 'Shader 编码与捕获'],
        ['tools/unity-world-lab/README', 'World lab', 'World 实验场景'],
        ['tools/unity-avatar-lab/README', 'Avatar lab', 'Avatar 实验场景'],
        ['docs/development', 'Development and releases', '开发与发布'],
      ] },
    ];
    const navigation = groups.map(group => '<div class="nav-group"><p class="nav-group-title">'
      + escape(locale === 'en' ? group.en : group.zh) + '</p>' + group.links.map(([key, en, zh]) => {
        const target = routes.get(locale + ':' + key);
        return target ? '<a data-guide-link' + (route === target ? ' aria-current="page"' : '') + ' href="' + href(target) + '">' + escape(locale === 'en' ? en : zh) + '</a>' : '';
      }).join('') + '</div>').join('');
    const diagramScript = document.diagrams ? '<script defer src="' + href(siteAssets.diagrams.name)
      + '" onerror="' + escape(scriptFallback(relative(route, 'document-diagrams.js'))) + '"></script>' : '';
    return '<!doctype html><html lang="' + (locale === 'en' ? 'en-US' : locale) + '"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="description" content="' + escape(titleOf(document) + ' — Sensa ' + t.docs) + '"><title>' + escape(titleOf(document)) + ' · Sensa</title><link rel="stylesheet" href="' + href(siteAssets.css.name) + '" onerror="' + escape(stylesheetFallback(relative(route, 'site.css'))) + '"><script defer src="' + href(siteAssets.js.name) + '" onerror="' + escape(scriptFallback(relative(route, 'site.js'))) + '"></script>' + diagramScript + '</head><body><a class="skip" href="#content">' + t.skip + '</a>'
      + '<header><a class="brand" href="' + href('index.html') + '"><span class="brand-mark" aria-hidden="true">S</span>Sensa<span class="brand-context">' + t.docs + '</span></a><nav aria-label="' + t.navigation + '"><a href="' + href('parameter-geometry.html') + '">' + t.diagram + '</a><a data-download="release" href="https://github.com/SeaLoong/Sensa/releases/latest">' + t.download + '</a><a data-locale="' + other + '" data-heading-map="' + escape(JSON.stringify(headingMap)) + '" href="' + href(buddy) + '">' + (other === 'en' ? 'English' : '简体中文') + '</a></nav></header>'
      + '<div class="layout"><details class="navigation" open><summary>' + t.navigation + '</summary><label class="guide-filter"><span>' + t.filter + '</span><input type="search" data-guide-filter autocomplete="off"></label><nav aria-label="' + t.docs + '">' + navigation + '</nav><p class="guide-empty" role="status" hidden>' + t.empty + '</p></details><main id="content" tabindex="-1"><nav class="doc-breadcrumb" aria-label="' + t.docs + '"><a href="' + href('index.html') + '">' + t.home + '</a><span aria-hidden="true">/</span><span>' + t.docs + '</span></nav><article>' + body + '</article><footer><a href="https://github.com/SeaLoong/Sensa/blob/main/' + escape(document.file) + '">' + t.source + '</a><span>MIT · SeaLoong</span></footer></main><aside aria-label="' + t.top + '"><p>' + t.top + '</p>' + toc.map(x => '<a href="#' + escape(x.id) + '">' + escape(x.title) + '</a>').join('') + '</aside></div></body></html>\n';
  };
  for (const document of documents.values()) {
    const toc = [], seen = new Map(), ids = new Set(), outline = [];
    const md = new MarkdownIt({ html: false, linkify: false, typographer: false });
    const renderImage = md.renderer.rules.image;
    md.renderer.rules.image = (tokens, index, options, env, render) => {
      const image = tokens[index], src = image.attrGet('src');
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(document.route), src));
      const mobile = responsiveScreenshots.get(target);
      const html = renderImage(tokens, index, options, env, render);
      return mobile ? '<picture class="doc-screenshot"><source media="(max-width:760px)" srcset="'
        + escape(relative(document.route, mobile)) + '">' + html + '</picture>' : html;
    };
    const scrollRegion = label => '<div class="doc-scroll" role="region" tabindex="0" aria-label="' + escape(label) + '">';
    md.renderer.rules.table_open = (tokens, index, options, env, render) => scrollRegion(words[document.locale].table) + render.renderToken(tokens, index, options);
    md.renderer.rules.table_close = (tokens, index, options, env, render) => render.renderToken(tokens, index, options) + '</div>\n';
    const fence = md.renderer.rules.fence, codeBlock = md.renderer.rules.code_block;
    md.renderer.rules.fence = (...args) => {
      const [tokens, index] = args;
      if (tokens[index].info.trim().split(/\s+/)[0].toLowerCase() === 'mermaid') {
        document.diagrams = (document.diagrams || 0) + 1;
        return documentDiagram(tokens[index].content, { locale: document.locale, index: document.diagrams, title: titleOf(document) });
      }
      return scrollRegion(words[document.locale].code) + fence(...args) + '</div>\n';
    };
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
        target = 'media/' + file;
        const reviewed = file.startsWith('docs/screenshots/') && screenshotFiles.has(file.slice('docs/screenshots/'.length));
        if (!reviewed)
          await write(target, await fs.readFile(path.join(source, file)));
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
    .replaceAll('__SITE_STYLESHEET__', siteAssets.css.name)
    .replaceAll('__SITE_SCRIPT__', siteAssets.js.name)
    .replaceAll('__SITE_STYLESHEET_FALLBACK__', escape(stylesheetFallback('site.css')))
    .replaceAll('__SITE_SCRIPT_FALLBACK__', escape(scriptFallback('site.js')))
    .replace('__SCREENSHOT_GALLERY__', gallery)
    .replaceAll('__VPM_AVAILABLE__', String(available))
    .replaceAll('__VPM_STATUS_EN__', available ? 'Stable packages are available through VCC.' : 'No stable VPM package is currently available. Download the Unity ZIP from Releases.')
    .replaceAll('__VPM_STATUS_ZH__', available ? '可通过 VCC 安装正式版 Unity 组件包。' : '当前可从 Releases 下载 Unity ZIP；VPM 正式版尚待发布。')
    .replaceAll('__VPM_INSTALL_HIDDEN__', available ? '' : 'hidden')
    .replaceAll('__VPM_INSTALL_URL__', available ? escape('vcc://vpm/addRepo?url=' + encodeURIComponent(vpmUrl)) : '#');
  for (const link of homepage.matchAll(/<a\b([^>]*\bdata-doc="[^"]+"[^>]*)>/g)) {
    const attributes = Object.fromEntries([...link[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(match => [match[1], match[2]]));
    for (const locale of locales) {
      const route = routes.get(locale + ':' + attributes['data-doc']);
      const fragment = attributes[locale === 'en' ? 'data-fragment-en' : 'data-fragment-zh'];
      if (!route || (fragment && !headings.get(route)?.has(fragment)))
        throw new Error('Broken homepage guide link: ' + locale + '/' + attributes['data-doc'] + (fragment ? '#' + fragment : ''));
    }
  }
  await write('index.html', homepage);
  for (const [extension, asset] of Object.entries(siteAssets).filter(([extension]) => extension !== 'diagrams')) {
    await write(asset.name, asset.content);
    // Previously cached pages still reference these names. New pages use the content hash.
    // 已缓存的旧页面仍引用固定文件名，新页面均使用内容哈希。
    await write('site.' + extension, asset.content);
  }
  await write(siteAssets.diagrams.name, siteAssets.diagrams.content);
  await write('document-diagrams.js', siteAssets.diagrams.content);
  await write('document-diagrams.LICENSE.txt', diagrams.license);
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
