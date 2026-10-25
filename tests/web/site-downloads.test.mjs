import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { selectRelease, downloadTarget, siteDownloadSource } from '../../scripts/site-downloads.mjs';

const releaseUrl = 'https://github.com/SeaLoong/Sensa/releases';
function release(version, { preview = '', published = '2026-10-23T12:00:00Z', omit = [] } = {}) {
  const tag = preview ? 'preview-' + preview.replaceAll('.', '-') : 'v' + version;
  const stem = version + (preview ? '-preview.' + preview : '');
  const names = { unity: `top.sealoong.sensa-${stem}.zip`, checksums: 'SHA256SUMS.txt' };
  for (const arch of ['x64', 'arm64']) {
    names[`win-${arch}-setup`] = `Sensa-${stem}-win-${arch}-Setup.exe`;
    names[`win-${arch}-single-file`] = `Sensa-${stem}-win-${arch}-SingleFile.exe`;
    names[`win-${arch}`] = `Sensa-${stem}-win-${arch}.zip`;
    for (const platform of ['linux', 'osx']) names[`${platform}-${arch}`] = `Sensa-${stem}-${platform}-${arch}.tar.gz`;
  }
  return { tag_name: tag, html_url: releaseUrl + '/tag/' + tag, draft: false,
    prerelease: Boolean(preview), published_at: published,
    assets: Object.entries(names).filter(([key]) => !omit.includes(key)).map(([, name]) => ({
      name, state: 'uploaded', size: 123456, browser_download_url: releaseUrl + '/download/' + tag + '/' + name,
    })) };
}

test('all formats prefer the newest stable release and only fall back to previews when none exists', () => {
  const stable = release('0.4.0', { published: '2026-10-21T12:00:00Z' });
  const preview = release('0.5.0', { preview: '123.1.abcdef12', omit: ['win-arm64-setup'] });
  const selected = selectRelease([stable, preview]);
  assert.equal(selected.tag, stable.tag_name);
  assert.equal(downloadTarget(selected).url, stable.html_url);
  assert.equal(Object.keys(selected.assets).length, 12);
  for (const url of Object.values(selected.assets)) assert.ok(url.startsWith(releaseUrl + '/download/' + stable.tag_name + '/'));
  const newestStable = release('0.6.0', { published: '2026-10-22T12:00:00Z' });
  assert.equal(selectRelease([preview, newestStable, stable]).tag, 'v0.6.0');
  const fallback = selectRelease([release('0.4.0', { preview: '122.1.1234abcd', published: '2026-10-20T12:00:00Z' }), preview]);
  assert.equal(fallback.tag, preview.tag_name);
  assert.equal(Object.keys(fallback.assets).length, 11);
  assert.deepEqual(downloadTarget(fallback, 'win-arm64-setup'), { state: 'missing', url: null });
  const incompleteStable = release('0.6.0', { omit: ['win-x64-setup'] });
  assert.equal(downloadTarget(selectRelease([stable, preview, incompleteStable]), 'win-x64-setup').state, 'missing',
    'Never substitute an older stable or preview asset for a missing file in the chosen stable release');
});

test('no release, no assets and invalid selectors are distinct, with no arbitrary redirect', () => {
  for (const input of [null, [], { message: 'API limit' }]) assert.equal(selectRelease(input), null);
  assert.equal(downloadTarget(null).state, 'empty');
  for (const key of ['https://evil.test', '//evil.test', '../foo', 'win-ia32', 'release?url=evil'])
    assert.equal(downloadTarget(selectRelease([release('0.4.0')]), key).state, 'invalid');
  const item = release('0.4.0'); item.assets = [];
  assert.equal(downloadTarget(selectRelease([item])).url, item.html_url);
  assert.equal(downloadTarget(selectRelease([item]), 'unity').state, 'missing');
});

test('release identities and asset names, versions, URLs, sizes and duplicates are validated exactly', () => {
  for (const mutate of [
    x => { x.draft = true; }, x => { x.published_at = 'invalid'; },
    x => { x.prerelease = true; }, x => { x.tag_name = 'latest'; },
    x => { x.html_url = x.html_url.replace('SeaLoong/Sensa', 'Elsewhere/Sensa'); },
  ]) {
    const item = release('0.4.0'); mutate(item); assert.equal(selectRelease([item]), null);
  }
  for (const mutate of [
    x => { x.state = 'new'; }, x => { x.size = 0; }, x => { x.name = x.name.replace('0.4.0', '0.5.0'); },
    x => { x.browser_download_url = 'javascript:alert(1)'; },
    x => { x.browser_download_url = x.browser_download_url.replace('https:', 'http:'); },
    x => { x.browser_download_url = x.browser_download_url.replace('github.com', 'github.com.evil.test'); },
    x => { x.browser_download_url = x.browser_download_url.replace('SeaLoong/Sensa', 'Elsewhere/Sensa'); },
    x => { x.browser_download_url = x.browser_download_url.replace('github.com/', 'github.com@evil.test/'); },
    x => { x.browser_download_url = x.browser_download_url.replace('/download/', '/download%2F'); },
    x => { x.browser_download_url += '?redirect=https://evil.test'; }, x => { x.browser_download_url += '#download'; },
  ]) {
    const item = release('0.4.0'); mutate(item.assets.find(x => x.name.endsWith('-win-x64-Setup.exe')));
    assert.equal(downloadTarget(selectRelease([item]), 'win-x64-setup').state, 'missing');
  }
  const duplicate = release('0.4.0'); duplicate.assets.push({ ...duplicate.assets.find(x => x.name.endsWith('-win-x64-Setup.exe')) });
  assert.equal(downloadTarget(selectRelease([duplicate]), 'win-x64-setup').state, 'missing');
  const wrongPreview = release('0.4.0', { preview: '123.1.abcdef12' });
  wrongPreview.assets.forEach(x => { x.name = x.name.replace('123.1', '124.1'); });
  assert.equal(downloadTarget(selectRelease([wrongPreview]), 'win-x64-setup').state, 'missing');
});

test('malformed preview versions cannot mix desktop and Unity packages', () => {
  const item = release('0.4.0', { preview: '123.1.abcdef12' });
  const unity = item.assets.find(x => x.name.startsWith('top.sealoong'));
  unity.name = unity.name.replace('0.4.0', '0.5.0');
  unity.browser_download_url = unity.browser_download_url.replace('0.4.0', '0.5.0');
  const selected = selectRelease([item]);
  assert.equal(selected.url, item.html_url);
  assert.deepEqual(Object.keys(selected.assets), ['checksums']);
});

test('bundled resolver and revalidated cached snapshot preserve the selected release', () => {
  const input = [release('0.4.0', { preview: '123.1.abcdef12' })];
  const actual = vm.runInNewContext(siteDownloadSource() + 'JSON.stringify(SensaDownloads.selectRelease(input))', { input });
  assert.deepEqual(JSON.parse(actual), selectRelease(input));
  const selected = selectRelease(input);
  assert.deepEqual(selectRelease([selected.cached]), selected);
});

async function runPage(fetch, { router = false, guide = false, asset = '', cache = [], language = 'en-US', storageDenied = false } = {}) {
  const element = extra => ({ hidden: false, dataset: {}, addEventListener(name, callback) { this[name] = callback; },
    setAttribute(name, value) { this[name] = value; }, removeAttribute(name) { delete this[name]; }, ...extra });
  const links = ['release', 'win-x64-setup', 'win-arm64-setup', 'linux-x64', 'unity'].map(key => element({ dataset: { download: key }, href: 'download.html' }));
  const elements = { language: element(), vcc: element(), 'copy-vpm': element(),
    'download-status': element(), 'download-retry': element(), 'download-release': element(), 'download-cached': element() };
  if (guide) delete elements['download-status'];
  const timers = [], cleared = [], redirects = [];
  const document = { documentElement: {}, body: { hasAttribute: name => !guide && name === (router ? 'data-download-page' : 'data-home'), dataset: {} },
    getElementById: name => elements[name], querySelectorAll: selector => selector === '[data-download]' ? links : [] };
  const source = await fs.readFile(new URL('../../.github/pages/site.js', import.meta.url), 'utf8');
  const location = new URL('https://example.test/Sensa/' + (router ? 'download.html' : '') + (asset ? '?asset=' + encodeURIComponent(asset) : ''));
  location.replace = url => redirects.push(url);
  const storage = new Map([['sensa.download.release.v1', JSON.stringify(cache)]]);
  vm.runInNewContext(siteDownloadSource() + source, { document, URL, location,
    navigator: { languages: [language] }, sessionStorage: {
      getItem: key => { if (storageDenied) throw new Error('Storage denied'); return storage.get(key); },
      setItem: (key, value) => { if (storageDenied) throw new Error('Storage denied'); storage.set(key, value); },
    }, fetch, AbortController, window: { addEventListener() {} }, matchMedia: () => ({ matches: false, addEventListener() {} }),
    setTimeout: (callback, delay) => { timers.push({ callback, delay }); return timers.length; }, clearTimeout: id => cleared.push(id) });
  await new Promise(setImmediate);
  return { links, timers, cleared, document, elements, redirects, storage };
}

test('site resolves all link kinds using one anonymous bounded request', async () => {
  const item = release('0.4.0', { preview: '123.1.abcdef12' }), calls = [];
  const state = await runPage(async (url, options) => { calls.push({ url, options }); return { ok: true, json: async () => [item] }; });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.github.com/repos/SeaLoong/Sensa/releases?per_page=100');
  const { signal, ...options } = calls[0].options;
  assert.deepEqual(JSON.parse(JSON.stringify(options)), { method: 'GET', credentials: 'omit', redirect: 'error',
    referrerPolicy: 'no-referrer', headers: { Accept: 'application/vnd.github+json' } });
  assert.equal(signal.aborted, false); assert.equal(state.timers[0].delay, 5000);
  assert.deepEqual(state.cleared, [1]);
  for (const link of state.links) assert.equal(link.href, downloadTarget(selectRelease([item]), link.dataset.download).url);
});

test('router opens latest release or exact requested asset without a chooser, with bilingual failures', async () => {
  const item = release('0.4.0');
  for (const asset of ['', 'linux-arm64', 'win-x64-single-file', 'unity', 'checksums']) {
    const state = await runPage(async () => ({ ok: true, json: async () => [item] }), { router: true, asset });
    assert.deepEqual(state.redirects, [downloadTarget(selectRelease([item]), asset || 'release').url]);
  }
  const state = await runPage(async () => ({ ok: true, json: async () => [] }), { router: true, language: 'zh-CN' });
  assert.deepEqual(state.redirects, []); assert.match(state.elements['download-status'].textContent, /暂时没有/);
  assert.equal(state.elements['download-retry'].hidden, false);
});

test('missing assets never fall back to another release or a misleading general-page link', async () => {
  const older = release('0.3.0', { published: '2026-10-20T12:00:00Z' });
  const item = release('0.4.0', { omit: ['win-arm64-setup'] });
  const state = await runPage(async () => ({ ok: true, json: async () => [older, item] }), { router: true, asset: 'win-arm64-setup' });
  assert.deepEqual(state.redirects, []); assert.match(state.elements['download-status'].textContent, /not available in the latest release/);
  assert.equal(state.links[2].href, undefined); assert.equal(state.links[2]['aria-disabled'], 'true');
  assert.equal(state.elements['download-release'].href, item.html_url);
});

test('network failures show retry or reuse a validated cached release; empty API results clear cache', async () => {
  const item = release('0.4.0');
  for (const fetch of [async () => { throw new Error('offline'); }, async () => ({ ok: false }), async () => ({ ok: true, json: async () => ({ message: 'rate limited' }) })]) {
    const state = await runPage(fetch, { router: true, asset: 'win-x64-setup' });
    assert.deepEqual(state.redirects, []); assert.match(state.elements['download-status'].textContent, /could not be checked/);
    const cached = await runPage(fetch, { router: true, cache: [item] });
    assert.deepEqual(cached.redirects, []); assert.match(cached.elements['download-status'].textContent, /last available version is v0.4.0/);
    assert.equal(cached.elements['download-cached'].href, item.html_url);
    assert.equal(cached.elements['download-retry'].hidden, false);
  }
  const empty = await runPage(async () => ({ ok: true, json: async () => [] }), { router: true, cache: [item] });
  assert.deepEqual(empty.redirects, []); assert.equal(empty.storage.get('sensa.download.release.v1'), '[]');
});

test('invalid router selectors never fetch or navigate; aborted replies cannot select stale responses', async () => {
  const invalid = await runPage(() => { throw new Error('must not fetch'); }, { router: true, asset: 'https://evil.test' });
  assert.deepEqual(invalid.redirects, []); assert.match(invalid.elements['download-status'].textContent, /not valid/);
  let resolve, signal;
  const state = await runPage((_, options) => { signal = options.signal; return new Promise(done => { resolve = done; }); }, { router: true });
  state.timers[0].callback(); assert.equal(signal.aborted, true);
  resolve({ ok: true, json: async () => [release('0.4.0')] }); await new Promise(setImmediate);
  assert.deepEqual(state.redirects, []); assert.match(state.elements['download-status'].textContent, /could not be checked/);
});


test('guides preserve their router links on network failure instead of hiding retry or silently serving cached assets', async () => {
  for (const cache of [[], [release('0.4.0')]]) {
    const state = await runPage(async () => { throw new Error('offline'); }, { guide: true, cache });
    for (const link of state.links) {
      assert.equal(link.href, 'download.html');
      assert.equal(link['aria-disabled'], undefined);
    }
  }
  const home = await runPage(async () => { throw new Error('offline'); });
  assert.equal(home.links[0].href, 'download.html', 'Generic entry still leads to the retry page');
  assert.equal(home.links[0]['aria-disabled'], undefined);
  assert.equal(home.links[1].href, undefined, 'Unavailable file is not mislabeled as a release page');
  const empty = await runPage(async () => ({ ok: true, json: async () => [] }));
  assert.equal(empty.links[0].href, 'download.html', 'Empty listing retains a generic recovery entry too');
});

test('router language switching remains in-page when preference storage is denied', async () => {
  let calls = 0;
  const state = await runPage(async () => { calls++; throw new Error('offline'); }, { router: true, storageDenied: true });
  assert.match(state.elements['download-status'].textContent, /could not be checked/);
  state.elements.language.click();
  assert.equal(state.document.documentElement.lang, 'zh-CN');
  assert.match(state.elements['download-status'].textContent, /暂时无法查询下载/);
  assert.equal(state.elements.language.textContent, 'English');
  state.elements.language.click();
  assert.equal(state.document.documentElement.lang, 'en-US');
  assert.match(state.elements['download-status'].textContent, /could not be checked/);
  assert.equal(calls, 1, 'Changing language does not reload or restart download discovery');
});
