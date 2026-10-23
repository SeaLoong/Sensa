/** Select only published Sensa Windows installers from the public release listing. */
export function selectInstallers(releases) {
  const result = {};
  if (!Array.isArray(releases)) return result;
  const candidates = [];
  for (const release of releases) {
    if (!release || release.draft !== false || typeof release.prerelease !== 'boolean'
      || typeof release.tag_name !== 'string' || !Array.isArray(release.assets)
      || typeof release.published_at !== 'string' || !Number.isFinite(Date.parse(release.published_at))) continue;
    const stable = /^v(\d+\.\d+\.\d+)$/.exec(release.tag_name);
    const preview = /^preview-([1-9]\d*)-([1-9]\d*)-([0-9a-f]{8})$/.exec(release.tag_name);
    if (release.prerelease ? !preview : !stable) continue;
    const found = {};
    for (const architecture of ['x64', 'arm64']) {
      const suffix = '-win-' + architecture + '-Setup.exe';
      const matches = release.assets.filter(asset => {
        if (!asset || typeof asset.name !== 'string' || asset.state !== 'uploaded'
          || !Number.isSafeInteger(asset.size) || asset.size <= 0) return false;
        if (stable) return asset.name === 'Sensa-' + stable[1] + suffix;
        const version = /^Sensa-(\d+\.\d+\.\d+)-preview\./.exec(asset.name);
        return version && asset.name === 'Sensa-' + version[1] + '-preview.'
          + preview[1] + '.' + preview[2] + '.' + preview[3] + suffix;
      });
      if (matches.length !== 1) continue;
      const asset = matches[0];
      const expected = 'https://github.com/SeaLoong/Sensa/releases/download/' + release.tag_name + '/' + asset.name;
      // Exact comparison rejects other hosts/repositories, credentials, queries,
      // encoded path separators and names that do not belong to this release.
      if (asset.browser_download_url !== expected) continue;
      found[architecture] = { url: expected, tag: release.tag_name, prerelease: release.prerelease };
    }
    candidates.push({ published: Date.parse(release.published_at), prerelease: release.prerelease,
      tag: release.tag_name, found });
  }
  candidates.sort((left, right) => Number(left.prerelease) - Number(right.prerelease)
    || right.published - left.published || left.tag.localeCompare(right.tag));
  for (const release of candidates)
    for (const architecture of ['x64', 'arm64'])
      if (!result[architecture] && release.found[architecture]) result[architecture] = release.found[architecture];
  return result;
}

/** Include the same pure selector in the existing hashed site script. */
export function siteDownloadSource() {
  return 'const SensaDownloads=Object.freeze({selectInstallers:' + selectInstallers.toString() + '});\n';
}
