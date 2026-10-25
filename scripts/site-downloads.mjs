/** Prefer the newest stable release; use the newest preview only when no stable release exists. */
export function selectRelease(releases) {
  if (!Array.isArray(releases)) return null;
  const base = 'https://github.com/SeaLoong/Sensa/releases';
  const candidates = [];
  for (const release of releases) {
    if (!release || release.draft !== false || typeof release.prerelease !== 'boolean'
      || typeof release.tag_name !== 'string' || !Array.isArray(release.assets)
      || typeof release.published_at !== 'string' || !Number.isFinite(Date.parse(release.published_at))) continue;
    const stable = /^v(\d+\.\d+\.\d+)$/.exec(release.tag_name);
    const preview = /^preview-([1-9]\d*)-([1-9]\d*)-([0-9a-f]{8})$/.exec(release.tag_name);
    if (release.prerelease ? !preview : !stable) continue;
    const url = base + '/tag/' + release.tag_name;
    if (release.html_url !== url) continue;
    candidates.push({ release, stable, preview, url });
  }
  candidates.sort((a, b) => Number(a.release.prerelease) - Number(b.release.prerelease)
    || Date.parse(b.release.published_at) - Date.parse(a.release.published_at)
    || a.release.tag_name.localeCompare(b.release.tag_name));
  if (!candidates.length) return null;
  const { release, stable, preview, url } = candidates[0];
  const label = preview ? '-preview.' + preview.slice(1).join('.') : '';
  const versions = new Set(release.assets.flatMap(asset => {
    const match = typeof asset?.name === 'string' && /^(?:Sensa-|top\.sealoong\.sensa-)(\d+\.\d+\.\d+)/.exec(asset.name);
    return match && (!stable || match[1] === stable[1]) ? [match[1]] : [];
  }));
  const version = stable?.[1] || (versions.size === 1 ? [...versions][0] : null);
  const names = { checksums: 'SHA256SUMS.txt' };
  if (version) {
    const stem = 'Sensa-' + version + label;
    for (const architecture of ['x64', 'arm64']) {
      names['win-' + architecture + '-setup'] = stem + '-win-' + architecture + '-Setup.exe';
      names['win-' + architecture + '-single-file'] = stem + '-win-' + architecture + '-SingleFile.exe';
      names['win-' + architecture] = stem + '-win-' + architecture + '.zip';
      for (const platform of ['linux', 'osx']) names[platform + '-' + architecture] = stem + '-' + platform + '-' + architecture + '.tar.gz';
    }
    names.unity = 'top.sealoong.sensa-' + version + label + '.zip';
  }
  const assets = {};
  for (const [key, name] of Object.entries(names)) {
    const found = release.assets.filter(asset => asset && asset.name === name);
    if (found.length !== 1) continue;
    const asset = found[0], expected = base + '/download/' + release.tag_name + '/' + name;
    if (asset.state !== 'uploaded' || !Number.isSafeInteger(asset.size) || asset.size <= 0
      || asset.browser_download_url !== expected) continue;
    assets[key] = expected;
  }
  // Keep a bounded, validated snapshot for a later failed network request.
  const cached = { tag_name: release.tag_name, draft: false, prerelease: release.prerelease,
    published_at: release.published_at, html_url: url,
    assets: release.assets.filter(asset => Object.values(assets).includes(asset?.browser_download_url)) };
  return { tag: release.tag_name, url, prerelease: release.prerelease, publishedAt: release.published_at, assets, cached };
}

export function downloadTarget(selected, asset = 'release') {
  const valid = /^(?:release|win-(?:x64|arm64)(?:-setup|-single-file)?|(?:linux|osx)-(?:x64|arm64)|unity|checksums)$/.test(asset);
  if (!valid) return { state: 'invalid', url: null };
  if (!selected) return { state: 'empty', url: null };
  const url = asset === 'release' ? selected.url : selected.assets[asset];
  return { state: url ? 'available' : 'missing', url: url || null };
}

/** Same pure resolver for built pages, router and tests. */
export function siteDownloadSource() {
  return 'const SensaDownloads=Object.freeze({selectRelease:' + selectRelease.toString()
    + ',downloadTarget:' + downloadTarget.toString() + '});\n';
}
