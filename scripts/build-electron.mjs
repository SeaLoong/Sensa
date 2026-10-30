/** Package the isolated Electron shell around the exact, already-built Node SEA. */
import { createHash } from 'node:crypto';
import { cp, lstat, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { execFileSync, spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { build } from 'esbuild';
import { packager } from '@electron/packager';
import { flipFuses, getCurrentFuseWire, FuseVersion, FuseV1Options, FuseState } from '@electron/fuses';
import { runtimeFor } from './build-node.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const generatedMarker = '.sensa-electron-build';
export function desktopEntry(runtime) {
  if (!/^(win|linux|osx)-(x64|arm64)$/.test(runtime)) throw new Error('Unsupported desktop runtime.');
  return runtime.startsWith('osx-') ? 'Sensa.app/Contents/MacOS/Sensa' : runtime.startsWith('win-') ? 'Sensa.exe' : 'Sensa';
}
export function desktopCliPath(runtime) {
  return runtime.startsWith('osx-') ? 'Sensa.app/Contents/Resources/cli/Sensa'
    : 'resources/cli/' + (runtime.startsWith('win-') ? 'Sensa.exe' : 'Sensa');
}
export function fusePolicy(platform) {
  return { version: FuseVersion.V1, resetAdHocDarwinSignature: true, strictlyRequireAllFuses: true,
    [FuseV1Options.RunAsNode]: false, [FuseV1Options.EnableCookieEncryption]: true,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false, [FuseV1Options.EnableNodeCliInspectArguments]: false,
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: platform !== 'linux',
    [FuseV1Options.OnlyLoadAppFromAsar]: true, [FuseV1Options.LoadBrowserProcessSpecificV8Snapshot]: true,
    [FuseV1Options.GrantFileProtocolExtraPrivileges]: false, [FuseV1Options.WasmTrapHandlers]: true };
}
async function generatedDirectory(path) {
  try {
    const info = await lstat(path);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Desktop build output must be an ordinary directory.');
    const children = await readdir(path);
    if (children.length && !children.includes(generatedMarker)) throw new Error('Refusing to clear an unowned desktop build output.');
    await rm(path, { recursive: true });
  } catch (error) { if (error?.code !== 'ENOENT') throw error; }
  await mkdir(path, { recursive: true }); await writeFile(join(path, generatedMarker), 'Sensa generated desktop build\n');
}
function run(executable, args) {
  const result = spawnSync(executable, args, { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error('Desktop build step failed: ' + executable);
}
export async function prepareDesktopShell(version) {
  const stage = join(root, 'artifacts/electron-app'); await generatedDirectory(stage);
  await writeFile(join(stage, 'package.json'), JSON.stringify({ name: 'sensa-desktop', productName: 'Sensa',
    version, private: true, main: 'main.cjs', description: 'Sensa desktop workbench', author: 'SeaLoong', license: 'MIT' }, null, 2) + '\n');
  await cp(join(root, 'LICENSE'), join(stage, 'LICENSE'));
  for (const entry of ['main', 'preload']) await build({ entryPoints: [join(root, 'src/electron', entry + '.ts')],
    outfile: join(stage, entry + '.cjs'), bundle: true, platform: 'node', format: 'cjs', target: 'node24',
    external: ['electron'], sourcemap: false, legalComments: 'linked' });
  return stage;
}
export async function main(argv = process.argv.slice(2)) {
  const { values } = parseArgs({ args: argv, options: { runtime: { type: 'string' }, version: { type: 'string' },
    label: { type: 'string', default: '' }, output: { type: 'string' }, smoke: { type: 'boolean', default: false },
    'prepare-only': { type: 'boolean', default: false } }, strict: true });
  if (values.smoke && process.env.GITHUB_ACTIONS !== 'true') throw new Error('Desktop process smoke runs only in GitHub Actions.');
  const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  const version = values.version ?? manifest.version;
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Choose a numeric release version.');
  const stage = await prepareDesktopShell(version);
  if (values['prepare-only']) return { stage };
  const runtime = values.runtime ?? runtimeFor();
  if (runtime !== runtimeFor()) throw new Error('Desktop packages require their native platform and architecture.');
  const platform = runtime.startsWith('win-') ? 'win32' : runtime.startsWith('osx-') ? 'darwin' : 'linux';
  const arch = runtime.endsWith('-arm64') ? 'arm64' : 'x64';
  const portable = join(root, 'artifacts/publish', runtime), cli = join(portable, platform === 'win32' ? 'Sensa.exe' : 'Sensa');
  const cliStat = await lstat(cli); if (!cliStat.isFile() || cliStat.isSymbolicLink()) throw new Error('The exact native CLI must be built first.');
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const cliSha256 = createHash('sha256').update(await readFile(cli)).digest('hex');
  const resources = join(root, 'artifacts/electron-resources', runtime); await generatedDirectory(resources);
  await cp(portable, join(resources, 'cli'), { recursive: true, dereference: false });
  const out = join(root, 'artifacts/electron', runtime); await generatedDirectory(out);
  const destinations = await packager({ dir: stage, out, name: 'Sensa', executableName: 'Sensa', appBundleId: 'top.sealoong.sensa',
    appVersion: version, buildVersion: version, electronVersion: manifest.devDependencies.electron, platform, arch,
    asar: true, asarIntegrityDigest: true, overwrite: true, prune: false, extraResource: [join(resources, 'cli')],
    ignore: path => path.endsWith(generatedMarker), win32metadata: { CompanyName: 'SeaLoong', FileDescription: 'Sensa desktop workbench',
      ProductName: 'Sensa', InternalName: 'Sensa' } });
  if (destinations.length !== 1) throw new Error('Expected exactly one native desktop package.');
  const directory = destinations[0], entry = desktopEntry(runtime);
  const fuseTarget = platform === 'darwin' ? join(directory, 'Sensa.app') : join(directory, entry);
  const policy = fusePolicy(platform); await flipFuses(fuseTarget, policy);
  const actualFuses = await getCurrentFuseWire(fuseTarget);
  for (const [key, value] of Object.entries(policy)) if (/^\d+$/.test(key) && actualFuses[key] !== (value ? FuseState.ENABLE : FuseState.DISABLE)) throw new Error('Desktop fuse verification failed.');
  if (platform === 'darwin') run('codesign', ['--force', '--deep', '--sign', '-', join(directory, 'Sensa.app')]);
  const info = { schema: 1, version, label: values.label, commit, runtime, electronVersion: manifest.devDependencies.electron,
    cliSha256, entry, cliPath: desktopCliPath(runtime), fuses: actualFuses,
    embeddedAsarIntegrity: platform !== 'linux', serviceOwnership: 'one-exact-native-node-cli-child' };
  await writeFile(join(directory, 'SENSA-DESKTOP-INFO.json'), JSON.stringify(info, null, 2) + '\n');
  if (values.smoke) {
    const smokeArgs = ['scripts/smoke-electron.mjs', '--executable', join(directory, entry),
      '--runtime', runtime, '--report-directory', join(root, 'artifacts/test-results', runtime, 'desktop')];
    if (platform === 'linux') run('xvfb-run', ['-a', process.execPath, ...smokeArgs]);
    else run(process.execPath, smokeArgs);
  }
  run(process.env.PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3'), ['scripts/release.py', 'desktop',
    '--tag', 'v' + version, '--runtime', runtime, '--label', values.label, '--source', directory,
    '--output', values.output ? resolve(values.output) : join(root, 'artifacts/platform', runtime)]);
  return info;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
