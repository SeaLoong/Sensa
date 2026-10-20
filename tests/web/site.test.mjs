import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildPages } from '../../scripts/build-pages.mjs';

test('public guides build into bilingual routes with resolvable local links and offline diagram assets', async () => {
  const output = await fs.mkdtemp(path.join(os.tmpdir(), 'sensa-site-'));
  try {
    const manifest = await buildPages({ output, commit: 'site-unit-fixture' });
    assert.equal(manifest.commit, 'site-unit-fixture');
    for (const route of ['en/README.html', 'zh-CN/README.html', 'en/docs/osc-parameters.html', 'zh-CN/docs/osc-parameters.html',
      'en/unity/top.sealoong.sensa/README.html', 'zh-CN/unity/top.sealoong.sensa/README.html']) assert.ok(manifest.routes.includes(route), route);
    for (const route of ['index.html', ...manifest.routes]) {
      const html = await fs.readFile(path.join(output, route), 'utf8');
      assert.match(html, /<main/);
      assert.doesNotMatch(html, /(?:file:\/\/|[A-Z]:[\\/](?:Users|Code)|__VPM_[A-Z_]+__)/);
      for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
        const url = new URL(match[1].replaceAll('&amp;', '&'), 'https://example.test/Sensa/' + route);
        if (url.origin !== 'https://example.test') continue;
        const target = decodeURIComponent(url.pathname.replace(/^\/Sensa\//, ''));
        const info = await fs.stat(path.join(output, target));
        assert.ok(info.isFile() || info.isDirectory(), route + ' -> ' + target);
      }
    }
    const packageGuide = await fs.readFile(path.join(output, 'en/unity/top.sealoong.sensa/README.html'), 'utf8');
    assert.match(packageGuide, /href="\.\.\/\.\.\/docs\/ogb-compatibility\.html"/);
    assert.doesNotMatch(packageGuide, /href="https:\/\/github\.com\/SeaLoong\/Sensa\/blob\/main\/docs\/ogb-compatibility\.en\.md"/);
    const review = await fs.readFile(path.join(output, 'en/docs/ui-visual-review.html'), 'utf8');
    const reviewSource = await fs.readFile(new URL('../../docs/ui-visual-review.en.md', import.meta.url), 'utf8');
    const pinned = reviewSource.match(/https:\/\/github\.com\/SeaLoong\/Sensa\/blob\/[0-9a-f]{7,40}\/[^)\s]+\.md/)?.[0];
    assert.ok(pinned, 'The research record retains a pinned Markdown reference');
    assert.ok(review.includes('href="' + pinned + '"'), 'Pinned research references stay external');
    assert.match(await fs.readFile(path.join(output, 'parameter-geometry.html'), 'utf8'), /name="sensa-site-root" content="\.\/"/);
    const files = Object.keys(manifest.assets).filter(x => x.startsWith('assets/'));
    assert.equal(files.length, 5);
    assert.deepEqual(manifest.vpmVersions, []);
    assert.match(await fs.readFile(path.join(output, 'index.html'), 'utf8'), /data-vpm="false"/);
    for (const asset of files) assert.match(manifest.assets[asset], /^[a-f0-9]{64}$/);
    // Render the already-verified historical index correctly even without executing JavaScript.
    // 已验证历史索引在不执行JS时也必须显示真实可用状态。
    const historical = { name: 'Sensa', url: 'https://sealoong.github.io/Sensa/vpm.json',
      packages: { 'top.sealoong.sensa': { versions: { '0.1.0': { name: 'top.sealoong.sensa', version: '0.1.0',
        url: 'https://sealoong.github.io/Sensa/packages/top.sealoong.sensa/0.1.0/top.sealoong.sensa.zip', sha256: '0'.repeat(64) } } } } };
    const indexText = JSON.stringify(historical);
    await fs.writeFile(path.join(output, 'vpm.json'), indexText);
    const available = await buildPages({ output, commit: 'historical-vpm-fixture' });
    assert.deepEqual(available.vpmVersions, ['0.1.0']);
    assert.equal(await fs.readFile(path.join(output, 'vpm.json'), 'utf8'), indexText);
    const homepage = await fs.readFile(path.join(output, 'index.html'), 'utf8');
    assert.match(homepage, /data-vpm="true"/);
    assert.match(homepage, /Stable packages are available/);
    assert.doesNotMatch(homepage, /No stable VPM package|__VPM_[A-Z_]+__/);
    const installLink = homepage.match(/<a\b[^>]*\bid="vcc"[^>]*>/)?.[0];
    assert.ok(installLink);
    assert.doesNotMatch(installLink, /\bhidden\b/);
    assert.ok(installLink.includes('href="vcc://vpm/addRepo?url=' + encodeURIComponent(historical.url) + '"'));
  } finally { await fs.rm(output, { recursive: true, force: true }); }
});
