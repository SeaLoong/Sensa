/** Package the isolated Electron shell around the exact, already-built Node SEA. */
import { createHash } from 'node:crypto';
import { chmod, cp, lstat, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { execFileSync, spawnSync } from 'node:child_process';
import { dirname, join, relative, resolve, sep } from 'node:path';
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
    [FuseV1Options.OnlyLoadAppFromAsar]: true,
    // Use Electron's stock snapshot; Sensa does not build the custom
    // browser_v8_context_snapshot.bin required by the browser-specific fuse.
    [FuseV1Options.LoadBrowserProcessSpecificV8Snapshot]: false,
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
export async function withDesktopOutput({ runtime, platform }, action, inspectBase = lstat) {
  desktopEntry(runtime);
  if (platform !== 'linux') {
    const out = join(root, 'artifacts/electron', runtime); await generatedDirectory(out);
    return action(out);
  }
  // Ignore TMPDIR/RUNNER_TEMP: shared checkout/temp ancestors may be writable
  // by other users, which cannot host an exact-path AppArmor registration.
  const base = '/tmp', attributes = await inspectBase(base);
  if (!attributes.isDirectory() || attributes.isSymbolicLink() || attributes.uid !== 0 || !(attributes.mode & 0o1000)) {
    throw new Error('Linux desktop output requires the root-owned sticky /tmp directory.');
  }
  const temporary = await mkdtemp(join(base, 'sensa-electron-'));
  let retain = false;
  try {
    await chmod(temporary, 0o700);
    let directory = temporary;
    for (const part of ['artifacts', 'electron']) {
      directory = join(directory, part); await mkdir(directory, { mode: 0o755 }); await chmod(directory, 0o755);
    }
    const out = join(directory, runtime);
    await generatedDirectory(out);
    await chmod(out, 0o755); // generatedDirectory recreates this leaf using the caller's umask.
    return await action(out);
  } catch (error) {
    retain = error?.retainPrivateOutput === true;
    if (retain) {
      error.privateOutput = temporary;
      error.message += ' Protected desktop output retained: ' + temporary;
    }
    throw error;
  } finally { if (!retain) await rm(temporary, { recursive: true, force: true }); }
}
export async function secureLinuxPackage(directory, out) {
  if (resolve(dirname(directory)) !== resolve(out)) throw new Error('Linux desktop package escaped its private output.');
  const entry = join(directory, 'Sensa'), directoryInfo = await lstat(directory), entryInfo = await lstat(entry);
  if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink() || directoryInfo.uid !== process.getuid()
      || !entryInfo.isFile() || entryInfo.isSymbolicLink() || entryInfo.uid !== process.getuid()) {
    throw new Error('Linux desktop permissions can only be set on this build\'s own package and executable.');
  }
  await chmod(directory, 0o755); await chmod(entry, 0o755);
}
function run(executable, args) {
  const result = spawnSync(executable, args, { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error('Desktop build step failed: ' + executable);
}
export async function withLinuxSandbox({ executable, runtime, reportDirectory, commit }, smoke, invoke = (helper, args) => {
  const result = spawnSync(process.env.PYTHON ?? 'python3', [helper, ...args], { cwd: root, encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error('Linux sandbox setup failed: ' + result.stderr.trim());
  return JSON.parse(result.stdout);
}) {
  const helper = join(dirname(executable), 'sensa-linux-sandbox.py');
  const report = { schema: 1, sourceCommit: commit, runId: process.env.GITHUB_RUN_ID, attempt: process.env.GITHUB_RUN_ATTEMPT,
    runtime, executable, helperSha256: createHash('sha256').update(await readFile(helper)).digest('hex'),
    acceptance: false, events: [] };
  await mkdir(reportDirectory, { recursive: true });
  let installation, failure, registrationMayRemain = false;
  try {
    const startedAt = new Date().toISOString();
    registrationMayRemain = true; // A failed installer may have partially loaded a kernel policy.
    installation = invoke(helper, ['install', '--executable', executable]);
    report.events.push({ operation: 'install', startedAt, completedAt: new Date().toISOString(), exitCode: 0, receipt: installation });
    if (installation.schema !== 1 || installation.operation !== 'install' || typeof installation.created !== 'boolean'
        || !/^sensa-desktop-[a-f0-9]{64}$/.test(installation.profileName) || !/^\d+:\d+:\d+$/.test(installation.fileIdentity)) {
      throw new Error('Invalid Linux sandbox installation receipt.');
    }
    if (!installation.created) throw new Error('The private build path already has a sandbox registration owned by another installation.');
    report.smoke = { startedAt: new Date().toISOString(), succeeded: false };
    await smoke(installation.profileName);
    report.smoke.completedAt = new Date().toISOString(); report.smoke.succeeded = true;
  } catch (error) { failure = error; }
  finally {
    if (installation?.created === true) {
      try {
        const startedAt = new Date().toISOString();
        const removal = invoke(helper, ['remove', '--executable', executable, '--expected-file', installation.fileIdentity]);
        report.events.push({ operation: 'remove', startedAt, completedAt: new Date().toISOString(), exitCode: 0, receipt: removal });
        if (removal.removed !== true || removal.fileIdentity !== installation.fileIdentity) throw new Error('Linux sandbox cleanup did not remove its own registration.');
        registrationMayRemain = false;
      } catch (error) { failure ??= error; report.cleanupError = error.message; }
    } else if (installation?.created === false) report.cleanup = 'retained-pre-existing-registration';
    if (registrationMayRemain) {
      failure ??= new Error('Linux sandbox registration cleanup is not confirmed.');
      failure.retainPrivateOutput = true;
      report.retainPrivateOutput = true;
    }
    report.acceptance = !failure;
    if (failure) report.error = failure.message;
    try { await writeFile(join(reportDirectory, 'linux-sandbox.json'), JSON.stringify(report, null, 2) + '\n'); }
    catch (error) {
      const reportedFailure = failure ?? error;
      if (registrationMayRemain) reportedFailure.retainPrivateOutput = true;
      if (failure) failure.reportError = { code: error.code, message: error.message };
      throw reportedFailure;
    }
  }
  if (failure) throw failure;
  return report;
}
/** Match release.py's CLI archive inventory before handing resources to Electron. */
export async function copyCliResources(source, destination) {
  await cp(source, destination, { recursive: true, dereference: false,
    filter: filename => !relative(source, filename).split(sep).some(component => component.startsWith('.')) });
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
  await copyCliResources(portable, join(resources, 'cli'));
  return withDesktopOutput({ runtime, platform }, async out => {
    const destinations = await packager({ dir: stage, out, name: 'Sensa', executableName: 'Sensa', appBundleId: 'top.sealoong.sensa',
      appVersion: version, buildVersion: version, electronVersion: manifest.devDependencies.electron, platform, arch,
      asar: true, asarIntegrityDigest: true, overwrite: true, prune: false, extraResource: [join(resources, 'cli')],
      ignore: path => path.endsWith(generatedMarker), win32metadata: { CompanyName: 'SeaLoong', FileDescription: 'Sensa desktop workbench',
        ProductName: 'Sensa', InternalName: 'Sensa' } });
    if (destinations.length !== 1) throw new Error('Expected exactly one native desktop package.');
    const directory = destinations[0], entry = desktopEntry(runtime);
    if (platform === 'linux') await secureLinuxPackage(directory, out);
    const fuseTarget = platform === 'darwin' ? join(directory, 'Sensa.app') : join(directory, entry);
    const policy = fusePolicy(platform); await flipFuses(fuseTarget, policy);
    const actualFuses = await getCurrentFuseWire(fuseTarget);
    for (const [key, value] of Object.entries(policy)) if (/^\d+$/.test(key) && actualFuses[key] !== (value ? FuseState.ENABLE : FuseState.DISABLE)) throw new Error('Desktop fuse verification failed.');
    if (platform === 'darwin') run('codesign', ['--force', '--deep', '--sign', '-', join(directory, 'Sensa.app')]);
    if (platform === 'linux') {
      await cp(join(root, 'scripts/sensa-linux-sandbox.py'), join(directory, 'sensa-linux-sandbox.py'));
      await cp(join(root, 'scripts/linux-desktop-sandbox.txt'), join(directory, 'LINUX-SANDBOX.txt'));
    }
    const info = { schema: 1, version, label: values.label, commit, runtime, electronVersion: manifest.devDependencies.electron,
      cliSha256, entry, cliPath: desktopCliPath(runtime), fuses: actualFuses,
      embeddedAsarIntegrity: platform !== 'linux', serviceOwnership: 'one-exact-native-node-cli-child' };
    await writeFile(join(directory, 'SENSA-DESKTOP-INFO.json'), JSON.stringify(info, null, 2) + '\n');
    if (values.smoke) {
      const smokeArgs = ['scripts/smoke-electron.mjs', '--executable', join(directory, entry),
        '--runtime', runtime, '--report-directory', join(root, 'artifacts/test-results', runtime, 'desktop')];
      if (platform === 'linux') await withLinuxSandbox({ executable: join(directory, entry), runtime,
        reportDirectory: join(root, 'artifacts/test-results', runtime, 'desktop'), commit },
      profile => run('xvfb-run', ['-a', process.execPath, ...smokeArgs, '--linux-sandbox-profile', profile]));
      else run(process.execPath, smokeArgs);
    }
    run(process.env.PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3'), ['scripts/release.py', 'desktop',
      '--tag', 'v' + version, '--runtime', runtime, '--label', values.label, '--source', directory,
      '--output', values.output ? resolve(values.output) : join(root, 'artifacts/platform', runtime)]);
    return info;
  });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
