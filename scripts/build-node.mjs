/** Build one Node bundle or a native SEA; packaged applications run only in Actions. */
import { createHash } from 'node:crypto';
import { chmod, copyFile, lstat, mkdir, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { build } from 'esbuild';

export const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
export const nativeRoots = ['serialport', '@julusian/midi'];
export const webResources = [
  ['src/web/index.html', 'index.html'], ['src/web/styles.css', 'styles.css'],
  ['src/web/app.bundle.js', 'app.bundle.js'], ['src/web/app.bundle.js.LEGAL.txt', 'app.bundle.js.LEGAL.txt'],
  ['src/web/realtime-worker.bundle.js', 'realtime-worker.bundle.js'],
  ['src/web/data/osc-presets.json', 'data/osc-presets.json'],
  ['src/web/data/first-run-motion.json', 'data/first-run-motion.json'],
  ['docs/parameter-geometry.html', 'docs/parameter-geometry.html'],
  ...['osc-parameter-reference.js', 'parameter-geometry-model.js', 'parameter-geometry-signal.js',
    'parameter-geometry-view.js', 'parameter-geometry-style.css', 'parameter-geometry-3d.js',
    'parameter-geometry-3d.LICENSE.txt'].map(name => ['docs/assets/' + name, 'docs/assets/' + name]),
  ...['index.html', 'app.bundle.js', 'app.bundle.css', 'app.bundle.js.LEGAL.txt']
    .map(name => ['src/websensa/' + name, 'websensa/' + name]),
];
const marker = '.sensa-node-build';
const maximumFileBytes = 64 * 1024 * 1024;
const maximumTotalBytes = 512 * 1024 * 1024;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

export function safeRelative(value) {
  if (typeof value !== 'string' || !value || value.length > 1024 || /[\\<>:"|?*\x00-\x1f\x7f]/.test(value)
    || value.split('/').some(part => !part || part === '.' || part === '..' || /[. ]$/.test(part)
      || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) throw new Error('Unsafe build asset path.');
  return value;
}
export function runtimeFor(platform = process.platform, arch = process.arch) {
  const os = { win32: 'win', linux: 'linux', darwin: 'osx' }[platform];
  if (!os || !['x64', 'arm64'].includes(arch)) throw new Error('Unsupported native build platform.');
  return `${os}-${arch}`;
}

async function ordinaryFile(path) {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.size > maximumFileBytes) throw new Error('Build assets require bounded regular files: ' + path);
  return await readFile(path);
}

export async function prepareDirectory(directory) {
  const destination = resolve(directory), offset = relative(root, destination);
  if (destination === root || offset === '..' || root.startsWith(destination + sep)) throw new Error('Build output must be a dedicated directory.');
  for (let current = dirname(destination); current !== dirname(current); current = dirname(current)) {
    try { const info = await lstat(current); if (info.isSymbolicLink()) throw new Error('Build output parents must not be symlinks.'); }
    catch (error) { if (error?.code !== 'ENOENT') throw error; }
    if (current === root) break;
  }
  try {
    const info = await lstat(destination);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Build output must be an ordinary directory.');
    const names = await readdir(destination);
    if (names.length && !names.includes(marker)) throw new Error('Refusing to clear an unowned build output.');
    if (names.length && (await ordinaryFile(join(destination, marker))).toString() !== 'Sensa generated Node build\n')
      throw new Error('Build output ownership marker is invalid.');
    if (names.some(name => ['config.json', 'recordings', 'instances'].includes(name)))
      throw new Error('Build output contains user profile data; select another output directory.');
    await rm(destination, { recursive: true });
  } catch (error) { if (error?.code !== 'ENOENT') throw error; }
  await mkdir(destination, { recursive: true, mode: 0o700 });
  await writeFile(join(destination, marker), 'Sensa generated Node build\n');
  return destination;
}

/** Resolve dependency package roots without evaluating their install/runtime code. */
async function packageDirectory(name, parent, projectRoot) {
  if (!/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/i.test(name)) throw new Error('Invalid native dependency name.');
  const request = createRequire(join(parent, 'package.json'));
  let location;
  try { location = request.resolve(name + '/package.json'); }
  catch { location = request.resolve(name); }
  let directory = dirname(location);
  for (;;) {
    const offset = relative(join(projectRoot, 'node_modules'), directory);
    if (offset === '..' || offset.startsWith('..' + sep) || offset.startsWith(sep)) throw new Error('Native packages must resolve inside installed node_modules.');
    try {
      const manifest = JSON.parse(await ordinaryFile(join(directory, 'package.json')));
      if (manifest.name === name) {
        if (await realpath(directory) !== directory) throw new Error('Native package roots must not traverse symlinks.');
        return { directory, manifest };
      }
    } catch (error) { if (error?.code !== 'ENOENT') throw error; }
    const next = dirname(directory); if (next === directory) throw new Error('Cannot find native dependency package metadata.'); directory = next;
  }
}

export async function collectNativeFiles(projectRoot = root) {
  const lockBytes = await ordinaryFile(join(projectRoot, 'package-lock.json')), lock = JSON.parse(lockBytes);
  const pending = nativeRoots.map(name => ({ name, parent: projectRoot, optional: false }));
  const packages = new Set(), files = [], absentOptional = [], packageIdentities = [], resolutions = []; let total = 0;
  while (pending.length) {
    const next = pending.shift(); let pkg;
    const from = next.parent === projectRoot ? null : safeRelative(relative(projectRoot, next.parent).split(sep).join('/'));
    try { pkg = await packageDirectory(next.name, next.parent, projectRoot); }
    catch (error) { if (next.optional && error?.code === 'MODULE_NOT_FOUND') { absentOptional.push(next.name); resolutions.push({ from, name: next.name, optional: true, to: null }); continue; } throw error; }
    const packagePath = safeRelative(relative(projectRoot, pkg.directory).split(sep).join('/'));
    resolutions.push({ from, name: next.name, optional: next.optional, to: packagePath });
    if (packages.has(pkg.directory)) continue; packages.add(pkg.directory);
    const locked = lock.packages?.[packagePath];
    if (!locked || locked.version !== pkg.manifest.version || typeof locked.integrity !== 'string' || !locked.integrity)
      throw new Error('Native package identity differs from its pinned lockfile: ' + packagePath);
    packageIdentities.push({ path: packagePath, name: pkg.manifest.name, version: pkg.manifest.version,
      manifestSha256: sha(await ordinaryFile(join(pkg.directory, 'package.json'))),
      source: locked.resolved ?? '', integrity: locked.integrity,
      dependencies: pkg.manifest.dependencies ?? {}, optionalDependencies: pkg.manifest.optionalDependencies ?? {},
      peerDependencies: pkg.manifest.peerDependencies ?? {}, peerDependenciesMeta: pkg.manifest.peerDependenciesMeta ?? {} });
    const walk = async directory => {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.cache') continue;
        const path = join(directory, entry.name), name = safeRelative(relative(projectRoot, path).split(sep).join('/'));
        if (entry.isSymbolicLink() || (!entry.isFile() && !entry.isDirectory())) throw new Error('Native dependency contains a link or special file: ' + name);
        if (entry.isDirectory()) await walk(path);
        else {
          const bytes = await ordinaryFile(path); total += bytes.length;
          if (files.length >= 20000 || total > maximumTotalBytes) throw new Error('Native dependency inventory exceeds its limit.');
          files.push({ path: name, source: path, asset: 'native/' + name, bytes: bytes.length, sha256: sha(bytes) });
        }
      }
    };
    await walk(pkg.directory);
    const required = pkg.manifest.dependencies ?? {}, optional = pkg.manifest.optionalDependencies ?? {}, peers = pkg.manifest.peerDependencies ?? {};
    for (const name of Object.keys({ ...required, ...optional, ...peers })) pending.push({ name, parent: pkg.directory,
      optional: Object.hasOwn(optional, name) || pkg.manifest.peerDependenciesMeta?.[name]?.optional === true });
  }
  files.sort((a, b) => a.path.localeCompare(b.path, 'en'));
  if (new Set(files.map(file => file.path.toLowerCase())).size !== files.length) throw new Error('Native dependency paths collide across platforms.');
  for (const name of nativeRoots) {
    if (!files.some(file => file.path === `node_modules/${name}/package.json`)) throw new Error('Required native package is missing: ' + name);
  }
  if (!files.some(file => file.path.endsWith('.node') && file.path.includes('/@serialport/bindings-cpp/'))
    || !files.some(file => file.path.endsWith('.node') && file.path.includes('/@julusian/midi/')))
    throw new Error('Serial and MIDI packages must include real native addon files.');
  packageIdentities.sort((a, b) => a.path.localeCompare(b.path, 'en'));
  return { files, packageDirectories: [...packages], packageIdentities, resolutions, absentOptional, lockfileSha256: sha(lockBytes) };
}

/** This receipt is uploaded with tests, never added beside a single-file app. */
export function actionSourceProvenance(environment = process.env) {
  if (environment.GITHUB_ACTIONS !== 'true') return {};
  const { GITHUB_RUN_ID: runId, GITHUB_RUN_ATTEMPT: runAttempt, GITHUB_REPOSITORY: repository } = environment;
  if (!/^[1-9][0-9]*$/.test(runId ?? '') || !/^[1-9][0-9]*$/.test(runAttempt ?? '')
    || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository ?? ''))
    throw new Error('Actions SEA evidence requires the current run, attempt and repository.');
  return { runId, runAttempt, repository };
}

export async function writeSeaEvidence(directory, metadata, manifests) {
  await mkdir(directory, { recursive: true });
  const files = [];
  for (const [name, bytes] of Object.entries(manifests)) {
    if (!['web-manifest.json', 'native-manifest.json', 'package-identities.json'].includes(name))
      throw new Error('Unexpected SEA evidence filename.');
    await writeFile(join(directory, name), bytes);
    files.push({ path: name, bytes: bytes.length, sha256: sha(bytes) });
  }
  metadata.evidence = { schema: 1, files };
  const built = Buffer.from(JSON.stringify(metadata, null, 2) + '\n');
  await writeFile(join(directory, 'NODE-BUILD.json'), built);
  const proof = { schema: 1, sourceCommit: metadata.sourceCommit, runtime: metadata.runtime,
    nodeVersion: metadata.nodeVersion, modules: metadata.modules,
    ...actionSourceProvenance(),
    files: [...files, { path: 'NODE-BUILD.json', bytes: built.length, sha256: sha(built) }] };
  await writeFile(join(directory, 'source-proof.json'), JSON.stringify(proof, null, 2) + '\n');
  return built;
}

/** Verified upstream license for the Node binary actually redistributed by SEA. */
export async function nodeLicense(version, licenseDirectory = join(root, 'scripts/licenses')) {
  const manifest = JSON.parse(await ordinaryFile(join(licenseDirectory, 'node.json')));
  if (manifest.schema !== 1 || manifest.nodeVersion !== version
    || manifest.source !== `https://raw.githubusercontent.com/nodejs/node/v${version}/LICENSE`
    || manifest.file !== `node-v${version}-LICENSE.txt` || !/^[a-f0-9]{64}$/.test(manifest.sha256))
    throw new Error('The SEA Node version must match the pinned upstream license.');
  const bytes = await ordinaryFile(join(licenseDirectory, manifest.file));
  if (bytes.length !== manifest.bytes || sha(bytes) !== manifest.sha256)
    throw new Error('The pinned upstream Node license failed its SHA-256 check.');
  return { ...manifest, text: bytes.toString('utf8') };
}

/** Preserve real package license texts, nested native notices and source identity. */
export async function thirdPartyNotices(projectRoot, linkedLegalComments, runtimeLicense = null) {
  const lock = JSON.parse(await ordinaryFile(join(projectRoot, 'package-lock.json'))), records = [];
  const sections = ['Sensa third-party notices\n\nThese texts accompany the checked distribution.'];
  if (runtimeLicense) sections.push(`Node.js ${runtimeLicense.nodeVersion}\nSource: ${runtimeLicense.source}\nSHA-256: ${runtimeLicense.sha256}\n\n${runtimeLicense.text}`);
  else sections.push('This source bundle does not redistribute a Node.js executable. The operator supplies the Node.js runtime.');
  for (const [location, locked] of Object.entries(lock.packages ?? {}).sort(([a], [b]) => a.localeCompare(b, 'en'))) {
    if (!location || locked.dev === true) continue;
    safeRelative(location);
    const directory = join(projectRoot, location);
    try { if (!(await lstat(directory)).isDirectory()) throw new Error('Runtime package is not a directory.'); }
    catch (error) { if (error.code === 'ENOENT' && locked.optional === true) continue; throw error; }
    if (await realpath(directory) !== directory) throw new Error('Runtime license paths must not traverse symlinks.');
    const metadata = JSON.parse(await ordinaryFile(join(directory, 'package.json')));
    if (!metadata.name || metadata.version !== locked.version || !locked.integrity)
      throw new Error('Runtime package identity differs from its pinned lockfile: ' + location);
    const files = [];
    const walk = async current => {
      for (const entry of await readdir(current, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
        const filename = join(current, entry.name);
        if (entry.isSymbolicLink() || !entry.isFile() && !entry.isDirectory()) throw new Error('Runtime notice tree contains a link or special file.');
        if (entry.isDirectory()) await walk(filename);
        else if (/^(?:licen[sc]e|copying|notice)(?:$|[._-])/i.test(entry.name)) {
          const bytes = await ordinaryFile(filename), name = safeRelative(relative(directory, filename).split(sep).join('/'));
          files.push({ path: name, sha256: sha(bytes), text: bytes.toString('utf8') });
        }
      }
    };
    await walk(directory);
    // These upstream packages carry additional author notices in source headers.
    if (metadata.name === '@julusian/midi') {
      const bytes = await ordinaryFile(join(directory, 'vendor/rtmidi/RtMidi.h'));
      const text = bytes.toString('utf8').split('#ifndef RTMIDI_H')[0];
      if (!text.includes('Copyright') || !text.includes('Permission is hereby granted')) throw new Error('RtMidi copyright/permission header is missing.');
      files.push({ path: 'vendor/rtmidi/RtMidi.h (copyright/permission header)', sha256: sha(bytes), text });
    }
    if (metadata.name === 'qrcode-generator') {
      const bytes = await ordinaryFile(join(directory, 'dist/qrcode.js')), text = bytes.toString('utf8').split('var qrcode =')[0];
      if (text.length > 65536 || !text.includes('Copyright') || !text.includes('MIT license')) throw new Error('QR generator author/license header is missing.');
      const permission = (await ordinaryFile(join(projectRoot, 'LICENSE'))).toString('utf8').split('Permission is hereby granted')[1];
      if (!permission?.includes('THE SOFTWARE IS PROVIDED')) throw new Error('The MIT permission text is unavailable.');
      files.push({ path: 'dist/qrcode.js (author notice and MIT permission text)', sha256: sha(bytes), text: text + '\nPermission is hereby granted' + permission });
    }
    if (!files.length) throw new Error('A runtime package has no distributable license text: ' + metadata.name);
    files.sort((a, b) => a.path.localeCompare(b.path, 'en'));
    const repository = typeof metadata.repository === 'string' ? metadata.repository : metadata.repository?.url ?? '';
    const record = { path: location, name: metadata.name, version: metadata.version, license: metadata.license ?? '',
      source: locked.resolved ?? '', integrity: locked.integrity, repository,
      notices: files.map(({ text: _text, ...file }) => file) };
    records.push(record);
    sections.push(`${metadata.name}@${metadata.version}\nPath: ${location}\nLicense: ${record.license}\nSource: ${record.source}\nRepository: ${repository}\nIntegrity: ${record.integrity}\n\n`
      + files.map(file => `--- ${file.path} (SHA-256 ${file.sha256}) ---\n${file.text}`).join('\n\n'));
  }
  sections.push('Additional linked JavaScript bundle notices\n\n' + linkedLegalComments);
  return { bytes: Buffer.from(sections.join('\n\n' + '='.repeat(72) + '\n\n') + '\n'), packages: records };
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Build command failed (${result.status}): ${command}`);
}

export async function buildNode(options) {
  const runtime = options.runtime ?? runtimeFor(), bundleOnly = options.bundleOnly === true;
  if (!/^(?:win|linux|osx)-(?:x64|arm64)$/.test(runtime)) throw new Error('Unsupported target runtime.');
  if (!bundleOnly && runtime !== runtimeFor()) throw new Error('SEA executables must be built on the matching native runner.');
  const runtimeLicense = bundleOnly ? null : await nodeLicense(process.versions.node);
  const identity = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' });
  const sourceCommit = identity.stdout?.trim();
  if (identity.status !== 0 || !/^[0-9a-f]{40}$/.test(sourceCommit)
    || process.env.SENSA_SOURCE_COMMIT && process.env.SENSA_SOURCE_COMMIT !== sourceCommit)
    throw new Error('Node build source identity differs from the checked-out commit.');
  const output = await prepareDirectory(options.output ?? join(root, 'artifacts/node'));
  const stage = bundleOnly ? output : await prepareDirectory(join(root, 'artifacts/node-sea', runtime));
  run(process.execPath, ['scripts/build-web.mjs']);
  const bundle = join(stage, 'sensa.cjs');
  const bundled = await build({ entryPoints: [join(root, 'src/node/main.ts')], outfile: bundle,
    absWorkingDir: root, bundle: true, platform: 'node', format: 'cjs', target: 'node24', legalComments: 'linked', metafile: true,
    external: ['electron', 'serialport', '@julusian/midi', 'bufferutil', 'utf-8-validate'],
    define: { 'process.env.NODE_ENV': '"production"' } });
  const assets = {}, resourceRows = [];
  for (const [sourceName, name] of webResources) {
    const bytes = await ordinaryFile(join(root, sourceName)), target = join(output, 'web', name);
    await mkdir(dirname(target), { recursive: true }); await writeFile(target, bytes);
    resourceRows.push({ path: name, asset: 'web/' + name, bytes: bytes.length, sha256: sha(bytes) }); assets['web/' + name] = target;
  }
  const licenses = await readFile(bundle + '.LEGAL.txt').catch(error => { if (error.code === 'ENOENT') return Buffer.from('Sensa Node bundle: MIT.\n'); throw error; });
  const licensePath = join(output, 'web/node-runtime.LICENSE.txt'); await writeFile(licensePath, licenses);
  resourceRows.push({ path: 'node-runtime.LICENSE.txt', asset: 'web/node-runtime.LICENSE.txt', bytes: licenses.length, sha256: sha(licenses) });
  assets['web/node-runtime.LICENSE.txt'] = licensePath;
  const notices = await thirdPartyNotices(root, licenses.toString('utf8'), runtimeLicense);
  const noticesPath = join(output, 'web/THIRD-PARTY-NOTICES.txt');
  await writeFile(noticesPath, notices.bytes);
  await writeFile(join(output, 'THIRD-PARTY-NOTICES.txt'), notices.bytes);
  resourceRows.push({ path: 'THIRD-PARTY-NOTICES.txt', asset: 'web/THIRD-PARTY-NOTICES.txt', bytes: notices.bytes.length, sha256: sha(notices.bytes) });
  assets['web/THIRD-PARTY-NOTICES.txt'] = noticesPath;
  const resourceManifest = Buffer.from(JSON.stringify({ schema: 1, files: resourceRows }, null, 2) + '\n');
  const webManifestPath = join(stage, 'web-manifest.json'); await writeFile(webManifestPath, resourceManifest); assets['web-manifest.json'] = webManifestPath;
  const packageInfo = JSON.parse(await readFile(join(root, 'package.json')));
  const metadata = { schema: 1, kind: bundleOnly ? 'node-bundle' : 'node-sea', runtime,
    nodeVersion: process.versions.node, modules: process.versions.modules, sourceCommit,
    version: packageInfo.version, resourceManifestSha256: sha(resourceManifest), resources: resourceRows,
    thirdPartyNotices: { sha256: sha(notices.bytes), packages: notices.packages,
      node: runtimeLicense ? { version: runtimeLicense.nodeVersion, source: runtimeLicense.source, sha256: runtimeLicense.sha256 } : null },
    sources: Object.keys(bundled.metafile.inputs).sort().map(path => ({ path, bundled: true })) };
  if (bundleOnly) {
    await writeFile(join(output, 'NODE-BUILD.json'), JSON.stringify(metadata, null, 2) + '\n');
    return metadata;
  }
  const native = await collectNativeFiles();
  const nativeManifest = { schema: 1, platform: process.platform, arch: process.arch,
    modules: process.versions.modules, nodeVersion: process.versions.node, packages: nativeRoots,
    files: native.files.map(({ source: _source, ...file }) => file) };
  const nativeManifestBytes = Buffer.from(JSON.stringify(nativeManifest, null, 2) + '\n');
  const nativeManifestPath = join(stage, 'native-manifest.json'); await writeFile(nativeManifestPath, nativeManifestBytes);
  assets['native-manifest.json'] = nativeManifestPath;
  for (const file of native.files) assets[file.asset] = file.source;
  const blob = join(stage, 'sea-preparation.blob'), configPath = join(stage, 'sea-config.json');
  await writeFile(configPath, JSON.stringify({ main: bundle, output: blob, disableExperimentalSEAWarning: true,
    useSnapshot: false, useCodeCache: false, assets }, null, 2) + '\n');
  run(process.execPath, ['--experimental-sea-config', configPath]);
  const executable = join(output, process.platform === 'win32' ? 'Sensa.exe' : 'Sensa');
  await copyFile(process.execPath, executable); await chmod(executable, 0o755);
  if (process.platform === 'darwin') run('codesign', ['--remove-signature', executable]);
  // Node 24's documented SEA workflow uses postject. The upstream utility's
  // pinned alpha is build-only; it is never a runtime dependency or app asset.
  const postject = createRequire(join(root, 'package.json')).resolve('postject/dist/cli.js');
  run(process.execPath, [postject, executable, 'NODE_SEA_BLOB', blob, '--sentinel-fuse',
    'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2', ...(process.platform === 'darwin' ? ['--macho-segment-name', 'NODE_SEA'] : [])]);
  if (process.platform === 'darwin') run('codesign', ['--sign', '-', executable]);
  metadata.nativePackages = { roots: nativeRoots, packageCount: native.packageDirectories.length, files: native.files.length,
    manifestSha256: sha(nativeManifestBytes), absentOptionalPeers: native.absentOptional,
    addonFiles: native.files.filter(file => file.path.endsWith('.node')).map(({ source: _source, ...file }) => file) };
  metadata.executableSha256 = sha(await readFile(executable));
  const identities = Buffer.from(JSON.stringify({ schema: 1, sourceCommit, runtime,
    nodeVersion: process.versions.node, modules: process.versions.modules,
    ...actionSourceProvenance(),
    roots: nativeRoots, lockfileSha256: native.lockfileSha256, packages: native.packageIdentities,
    resolutions: native.resolutions, absentOptionalPeers: native.absentOptional }, null, 2) + '\n');
  const built = await writeSeaEvidence(join(root, 'artifacts/test-results', runtime, 'sea-manifests'), metadata, {
    'web-manifest.json': resourceManifest, 'native-manifest.json': nativeManifestBytes, 'package-identities.json': identities,
  });
  await writeFile(join(output, 'NODE-BUILD.json'), built);
  return metadata;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs({ options: { 'bundle-only': { type: 'boolean', default: false }, sea: { type: 'boolean', default: false },
    output: { type: 'string' }, runtime: { type: 'string' } } }).values;
  if (args.sea && args['bundle-only']) throw new Error('--sea and --bundle-only are mutually exclusive.');
  const metadata = await buildNode({ bundleOnly: !args.sea, ...(args.output ? { output: args.output } : {}), ...(args.runtime ? { runtime: args.runtime } : {}) });
  console.log(JSON.stringify({ kind: metadata.kind, runtime: metadata.runtime, resources: metadata.resources.length, nativePackages: metadata.nativePackages ?? null }));
}
