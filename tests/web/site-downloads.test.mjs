import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { selectInstallers, siteDownloadSource } from '../../scripts/site-downloads.mjs';

const releaseUrl = 'https://github.com/SeaLoong/Sensa/releases';
function release(version, { preview = '', published = '2026-10-23T12:00:00Z', architectures = ['x64', 'arm64'] } = {}) {
  const tag = preview ? 'preview-' + preview.replaceAll('.', '-') : 'v' + version;
  return { tag_name: tag, draft: false, prerelease: Boolean(preview), published_at: published,
    assets: architectures.map(architecture => {
      const name = 'Sensa-' + version + (preview ? '-preview.' + preview : '') + '-win-' + architecture + '-Setup.exe';
      return { name, state: 'uploaded', size: 123456,
        browser_download_url: releaseUrl + '/download/' + tag + '/' + name };
    }) };
}

test('installer links select published stable assets before newer previews, independently by architecture', () => {
  const old = release('0.3.0', { published: '2026-10-20T12:00:00Z' });
  const stable = release('0.4.0', { published: '2026-10-21T12:00:00Z', architectures: ['x64'] });
  const preview = release('0.5.0', { preview: '123.1.abcdef12' });
  assert.deepEqual(selectInstallers([preview, old, stable]), {
    x64: { url: stable.assets[0].browser_download_url, tag: 'v0.4.0', prerelease: false },
    arm64: { url: old.assets[1].browser_download_url, tag: 'v0.3.0', prerelease: false },
  });
});

test('installer links use the latest eligible preview when no stable installer exists', () => {
  const stable = release('0.3.0', { architectures: [] });
  const old = release('0.4.0', { preview: '123.1.abcdef12', published: '2026-10-20T12:00:00Z' });
  const current = release('0.4.0', { preview: '124.2.1234abcd' });
  assert.equal(selectInstallers([old, stable, current]).arm64.url, current.assets[1].browser_download_url);
  assert.equal(selectInstallers([old, current]).x64.prerelease, true);
  assert.deepEqual(selectInstallers(null), {});
  assert.deepEqual(selectInstallers({ message: 'API rate limit exceeded' }), {});
  assert.deepEqual(selectInstallers([]), {});
});

test('installer selection rejects altered URLs, names, release identities and incomplete assets', () => {
  const mutations = [
    entry => { entry.draft = true; },
    entry => { entry.published_at = null; },
    entry => { entry.published_at = 'not a date'; },
    entry => { entry.prerelease = true; },
    entry => { entry.tag_name = 'v0.5.0'; },
    entry => { entry.assets[0].state = 'new'; },
    entry => { entry.assets[0].size = 0; },
    entry => { entry.assets.push({ ...entry.assets[0] }); },
    entry => { entry.assets[0].name = entry.assets[0].name.replace('Setup', 'SingleFile'); },
    entry => { entry.assets[0].name = entry.assets[0].name.replace('win-x64', 'win-arm64'); },
    entry => { entry.assets[0].browser_download_url = 'javascript:alert(1)'; },
    entry => { entry.assets[0].browser_download_url = entry.assets[0].browser_download_url.replace('https:', 'http:'); },
    entry => { entry.assets[0].browser_download_url = entry.assets[0].browser_download_url.replace('github.com', 'github.com.evil.test'); },
    entry => { entry.assets[0].browser_download_url = entry.assets[0].browser_download_url.replace('SeaLoong/Sensa', 'Elsewhere/Sensa'); },
    entry => { entry.assets[0].browser_download_url = entry.assets[0].browser_download_url.replace('github.com/', 'github.com@evil.test/'); },
    entry => { entry.assets[0].browser_download_url = entry.assets[0].browser_download_url.replace('/download/', '/download%2F'); },
    entry => { entry.assets[0].browser_download_url += '?redirect=https://evil.test'; },
    entry => { entry.assets[0].browser_download_url += '#download'; },
  ];
  for (const mutate of mutations) {
    const entry = release('0.4.0', { architectures: ['x64'] });
    mutate(entry);
    assert.deepEqual(selectInstallers([entry]), {}, String(mutate));
  }
  const preview = release('0.4.0', { preview: '123.1.abcdef12' });
  preview.tag_name = 'preview-124-1-abcdef12';
  assert.deepEqual(selectInstallers([preview]), {});
});

test('the bundled browser selector has the same validated results', () => {
  const input = [release('0.4.0')];
  const actual = vm.runInNewContext(siteDownloadSource() + 'JSON.stringify(SensaDownloads.selectInstallers(input))', { input });
  assert.deepEqual(JSON.parse(actual), selectInstallers(input));
});

async function runHome(fetch) {
  const links = ['x64', 'arm64'].map(architecture => ({ dataset: { installer: architecture }, href: releaseUrl }));
  const elements = { language: { addEventListener() {} }, vcc: {}, 'copy-vpm': { addEventListener() {} } };
  const timers = [], cleared = [];
  const document = { documentElement: {}, body: { hasAttribute: () => true, dataset: {} },
    getElementById: name => elements[name],
    querySelectorAll: selector => selector === '[data-installer]' ? links : [] };
  const source = await fs.readFile(new URL('../../.github/pages/site.js', import.meta.url), 'utf8');
  vm.runInNewContext(siteDownloadSource() + source, { document, URL, location: new URL('https://example.test/Sensa/'),
    navigator: { languages: ['en-US'] }, sessionStorage: { getItem: () => null }, fetch, AbortController,
    setTimeout: (callback, delay) => { timers.push({ callback, delay }); return timers.length; },
    clearTimeout: id => cleared.push(id) });
  await new Promise(setImmediate);
  return { links, timers, cleared, document };
}

test('homepage makes one anonymous bounded request and changes only installer hrefs', async () => {
  const item = release('0.4.0'), calls = [];
  const state = await runHome(async (url, options) => {
    calls.push({ url, options }); return { ok: true, json: async () => [item] };
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.github.com/repos/SeaLoong/Sensa/releases?per_page=100');
  const { signal, ...options } = calls[0].options;
  assert.deepEqual(JSON.parse(JSON.stringify(options)), { method: 'GET', credentials: 'omit', redirect: 'error',
    referrerPolicy: 'no-referrer', headers: { Accept: 'application/vnd.github+json' } });
  assert.equal(signal.aborted, false);
  assert.equal(state.timers[0].delay, 3000);
  assert.deepEqual(state.cleared, [1]);
  assert.deepEqual(state.links.map(link => link.href), item.assets.map(asset => asset.browser_download_url));
  assert.equal(state.document.documentElement.lang, 'en-US');
});

test('failed or rate-limited queries retain usable Releases links', async () => {
  for (const fetch of [async () => { throw new Error('offline'); }, async () => ({ ok: false })]) {
    const state = await runHome(fetch);
    assert.deepEqual(state.links.map(link => link.href), [releaseUrl, releaseUrl]);
    assert.deepEqual(state.cleared, [1]);
    assert.equal(state.document.documentElement.lang, 'en-US');
  }
});

test('timeout aborts the request and late replies cannot replace the fallback links', async () => {
  let resolve, signal;
  const state = await runHome((_, options) => { signal = options.signal; return new Promise(done => { resolve = done; }); });
  state.timers[0].callback();
  assert.equal(signal.aborted, true);
  resolve({ ok: true, json: async () => [release('0.4.0')] });
  await new Promise(setImmediate);
  assert.deepEqual(state.links.map(link => link.href), [releaseUrl, releaseUrl]);
  assert.deepEqual(state.cleared, [1]);
});
