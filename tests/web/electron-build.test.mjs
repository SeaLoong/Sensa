import assert from 'node:assert/strict';
import { chmod, lstat, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { flipFuses, getCurrentFuseWire, FuseState, FuseV1Options } from '@electron/fuses';
import { copyCliResources, fusePolicy, secureLinuxPackage, withDesktopOutput, withLinuxSandbox } from '../../scripts/build-electron.mjs';

test('Electron embeds the same visible CLI files as the portable archive, including nested resources', async t => {
  const temporary = await mkdtemp(join(tmpdir(), '.sensa-cli-copy-'));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const source = join(temporary, '.source'), destination = join(temporary, 'desktop-cli');
  const shipped = ['Sensa', 'BUILD-INFO.json', 'NODE-BUILD.json', 'THIRD-PARTY-NOTICES.txt',
    'web/app.bundle.js', 'web/docs/assets/parameter-geometry-3d.js', 'tools/protocol-bridge/bridge.py'];
  for (const name of [...shipped, '.sensa-node-build', '.hidden/private.json', 'web/.cache/private.js',
    'tools/protocol-bridge/.venv/private.py']) {
    const filename = join(source, name); await mkdir(join(filename, '..'), { recursive: true });
    await writeFile(filename, 'isolated fixture: ' + name);
  }
  await copyCliResources(source, destination);
  const files = (await readdir(destination, { recursive: true, withFileTypes: true })).filter(entry => entry.isFile())
    .map(entry => relative(destination, join(entry.parentPath, entry.name)).replaceAll('\\', '/')).sort();
  assert.deepEqual(files, [...shipped].sort());
  for (const name of shipped) assert.equal(await readFile(join(destination, name), 'utf8'), 'isolated fixture: ' + name);
});

for (const platform of ['linux', 'darwin', 'win32']) {
  test(`stock Electron ${platform} fuse bytes retain the shipped V8 snapshot and explicit security policy`, async t => {
    const temporary = await mkdtemp(join(tmpdir(), 'sensa-fuse-wire-'));
    t.after(() => rm(temporary, { recursive: true, force: true }));
    // Synthetic fuse-wire bytes only: this file is never an executable or launched.
    const fixture = join(temporary, 'electron-fuse-wire.fixture');
    await writeFile(fixture, Buffer.concat([Buffer.from('isolated fixture\0dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX'),
      Buffer.from([1, 9]), Buffer.from('000000000')]));
    const policy = fusePolicy(platform);
    assert.equal(policy.strictlyRequireAllFuses, true);
    assert.equal(policy.resetAdHocDarwinSignature, true);
    assert.equal(await flipFuses(fixture, policy), 1);
    const actual = await getCurrentFuseWire(fixture);
    assert.equal(actual[FuseV1Options.LoadBrowserProcessSpecificV8Snapshot], FuseState.DISABLE,
      'standard Electron artifacts use the shipped snapshot, without a custom browser_v8_context_snapshot.bin');
    assert.deepEqual(actual, { version: '1',
      [FuseV1Options.RunAsNode]: FuseState.DISABLE,
      [FuseV1Options.EnableCookieEncryption]: FuseState.ENABLE,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: FuseState.DISABLE,
      [FuseV1Options.EnableNodeCliInspectArguments]: FuseState.DISABLE,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: platform === 'linux' ? FuseState.DISABLE : FuseState.ENABLE,
      [FuseV1Options.OnlyLoadAppFromAsar]: FuseState.ENABLE,
      [FuseV1Options.LoadBrowserProcessSpecificV8Snapshot]: FuseState.DISABLE,
      [FuseV1Options.GrantFileProtocolExtraPrivileges]: FuseState.DISABLE,
      [FuseV1Options.WasmTrapHandlers]: FuseState.ENABLE });
  });
}

async function mappedRootTemporaryBase(path) {
  assert.equal(path, '/tmp');
  const attributes = await lstat(path);
  // The managed local test container maps the system root owner to uid 65534.
  // Model that one system-directory owner, retaining its real mode/type data.
  const result = Object.create(attributes); Object.defineProperty(result, 'uid', { value: 0 });
  return result;
}
function staticLinuxPlan(executable) {
  const python = process.env.PYTHON ?? 'python3';
  const helper = fileURLToPath(new URL('../../scripts/sensa-linux-sandbox.py', import.meta.url));
  const code = `import importlib.util,json,sys
from pathlib import Path
from types import SimpleNamespace
spec=importlib.util.spec_from_file_location('sandbox',sys.argv[1]); module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
original=Path.lstat; mapped_root_uid=Path('/').stat().st_uid
def metadata(path,*args,**kwargs):
 info=original(path,*args,**kwargs)
 if mapped_root_uid!=0 and path in (Path('/'),Path('/tmp')) and info.st_uid==mapped_root_uid:
  values={key:getattr(info,key) for key in dir(info) if key.startswith('st_')};values['st_uid']=0;return SimpleNamespace(**values)
 return info
Path.lstat=metadata
try:
 result=module.plan(sys.argv[2]);print(json.dumps({'accepted':True,'executable':result['executable']}))
except ValueError as error:print(json.dumps({'accepted':False,'error':str(error)}))
`;
  return JSON.parse(execFileSync(python, ['-c', code, helper, executable], { encoding: 'utf8' }));
}

test('Linux checks and hands off one private output tree outside a group-writable workspace', { skip: process.platform !== 'linux' }, async t => {
  const workspace = await mkdtemp('/tmp/sensa-group-writable-checkout-');
  t.after(() => rm(workspace, { recursive: true, force: true }));
  await chmod(workspace, 0o775);
  const unsafe = join(workspace, 'Sensa'); await writeFile(unsafe, Buffer.from('\x7fELF\x02isolated static fixture'));
  assert.equal(staticLinuxPlan(unsafe).accepted, false);
  const previousTemp = process.env.TMPDIR; process.env.TMPDIR = workspace;
  let privateRoot, executable, checkedBytes;
  try {
    const archived = await withDesktopOutput({ runtime: 'linux-x64', platform: 'linux' }, async out => {
      privateRoot = dirname(dirname(dirname(out)));
      assert.equal(privateRoot.startsWith('/tmp/sensa-electron-'), true);
      assert.equal(out.startsWith(workspace + '/'), false);
      for (const [path, mode] of [[privateRoot, 0o700], [dirname(dirname(out)), 0o755], [dirname(out), 0o755], [out, 0o755]]) {
        assert.equal((await lstat(path)).mode & 0o777, mode, path);
      }
      const directory = join(out, 'Sensa-linux-x64'); await mkdir(directory); await chmod(directory, 0o775);
      executable = join(directory, 'Sensa'); await writeFile(executable, Buffer.from('\x7fELF\x02isolated static fixture'));
      await chmod(executable, 0o775); await secureLinuxPackage(directory, out);
      assert.equal((await lstat(directory)).mode & 0o777, 0o755);
      assert.equal((await lstat(executable)).mode & 0o777, 0o755);
      assert.deepEqual(staticLinuxPlan(executable), { accepted: true, executable });
      checkedBytes = await readFile(executable);
      // The archive phase receives the same file, before this scope is cleaned.
      return { source: executable, bytes: await readFile(executable) };
    }, mappedRootTemporaryBase);
    assert.equal(archived.source, executable); assert.deepEqual(archived.bytes, checkedBytes);
    await assert.rejects(lstat(privateRoot), { code: 'ENOENT' });
    assert.equal((await lstat(workspace)).mode & 0o777, 0o775);
  } finally {
    if (previousTemp === undefined) delete process.env.TMPDIR; else process.env.TMPDIR = previousTemp;
  }
});

test('Linux private output is removed when packaging or smoke throws', { skip: process.platform !== 'linux' }, async () => {
  let privateRoot;
  await assert.rejects(withDesktopOutput({ runtime: 'linux-arm64', platform: 'linux' }, async out => {
    privateRoot = dirname(dirname(dirname(out)));
    await writeFile(join(out, 'partial-package'), 'isolated failed packaging fixture');
    throw new Error('isolated packaging failure');
  }, mappedRootTemporaryBase), /isolated packaging failure/);
  await assert.rejects(lstat(privateRoot), { code: 'ENOENT' });
});

test('Linux refuses an untrusted temporary base before creating an output', async () => {
  let called = false;
  for (const invalid of ['owner', 'sticky', 'symlink']) {
    await assert.rejects(withDesktopOutput({ runtime: 'linux-x64', platform: 'linux' }, () => { called = true; }, async () => ({
      isDirectory: () => true, isSymbolicLink: () => invalid === 'symlink', uid: invalid === 'owner' ? 1234 : 0,
      mode: invalid === 'sticky' ? 0o40777 : 0o41777,
    })), /root-owned sticky/);
  }
  assert.equal(called, false);
});

test('Linux permission setup refuses a package outside its own output', { skip: process.platform !== 'linux' }, async t => {
  const temporary = await mkdtemp('/tmp/sensa-owned-output-check-');
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const other = join(temporary, 'other'); await mkdir(other); await chmod(other, 0o775);
  await writeFile(join(other, 'Sensa'), 'isolated static fixture');
  await assert.rejects(secureLinuxPackage(other, join(temporary, 'out')), /escaped its private output/);
  assert.equal((await lstat(other)).mode & 0o777, 0o775);
});

for (const outcome of ['success', 'smoke-failure', 'cleanup-failure', 'existing-registration']) {
  test(`Linux profile lifecycle preserves sandbox and ownership on ${outcome}`, async t => {
    const temporary = await mkdtemp(join(tmpdir(), 'sensa-linux-sandbox-'));
    t.after(() => rm(temporary, { recursive: true, force: true }));
    await writeFile(join(temporary, 'sensa-linux-sandbox.py'), 'isolated helper fixture; never executed');
    const executable = join(temporary, 'Sensa'), events = [];
    const install = { schema: 1, operation: 'install', created: outcome !== 'existing-registration',
      profileName: 'sensa-desktop-' + 'a'.repeat(64), fileIdentity: '1:2:3' };
    const invoke = (helper, args) => {
      assert.equal(helper, join(temporary, 'sensa-linux-sandbox.py'));
      events.push(args[0]);
      if (args[0] === 'install') {
        assert.deepEqual(args, ['install', '--executable', executable]);
        return install;
      }
      assert.deepEqual(args, ['remove', '--executable', executable, '--expected-file', '1:2:3']);
      if (outcome === 'cleanup-failure') throw new Error('isolated cleanup failure');
      return { removed: true, fileIdentity: '1:2:3' };
    };
    const smoke = profile => {
      assert.equal(profile, install.profileName); events.push('ordinary-user-smoke');
      if (outcome === 'smoke-failure') throw new Error('isolated smoke failure');
    };
    const result = withLinuxSandbox({ executable, runtime: 'linux-x64', reportDirectory: temporary, commit: 'isolated-fixture' }, smoke, invoke);
    if (outcome.endsWith('-failure')) await assert.rejects(result, /isolated .* failure/);
    else if (outcome === 'existing-registration') await assert.rejects(result, /already has a sandbox registration/);
    else await result;
    const report = JSON.parse(await readFile(join(temporary, 'linux-sandbox.json'), 'utf8'));
    assert.equal(report.acceptance, outcome === 'success');
    assert.equal(report.smoke?.succeeded, outcome === 'existing-registration' ? undefined : outcome !== 'smoke-failure');
    assert.deepEqual(report.events[0].receipt, install);
    assert.deepEqual(events, outcome === 'existing-registration'
      ? ['install'] : ['install', 'ordinary-user-smoke', 'remove']);
    if (outcome === 'existing-registration') assert.equal(report.cleanup, 'retained-pre-existing-registration');
    if (outcome === 'cleanup-failure') assert.equal(report.cleanupError, 'isolated cleanup failure');
  });
}

for (const outcome of ['install-failure', 'remove-failure', 'pre-existing', 'smoke-failure-cleaned']) {
  test(`Linux private output remains protected until policy teardown is confirmed: ${outcome}`, { skip: process.platform !== 'linux' }, async t => {
    let privateRoot, executable, observed;
    const events = [];
    const invoke = (_helper, args) => {
      events.push(args[0]);
      if (args[0] === 'install') {
        if (outcome === 'install-failure') throw new Error('isolated unknown install outcome');
        return { schema: 1, operation: 'install', created: outcome !== 'pre-existing',
          profileName: 'sensa-desktop-' + 'b'.repeat(64), fileIdentity: '4:5:6' };
      }
      if (outcome === 'remove-failure') throw new Error('isolated failed policy unload');
      return { removed: true, fileIdentity: '4:5:6' };
    };
    try {
      await withDesktopOutput({ runtime: 'linux-x64', platform: 'linux' }, async out => {
        privateRoot = dirname(dirname(dirname(out)));
        t.after(() => rm(privateRoot, { recursive: true, force: true })); // Static fixture only: no policy was loaded.
        const directory = join(out, 'Sensa-linux-x64'); await mkdir(directory);
        executable = join(directory, 'Sensa'); await writeFile(executable, Buffer.from('\x7fELF\x02isolated static fixture'));
        await writeFile(join(directory, 'sensa-linux-sandbox.py'), 'isolated helper fixture; never executed');
        await secureLinuxPackage(directory, out);
        await withLinuxSandbox({ executable, runtime: 'linux-x64', reportDirectory: directory, commit: 'isolated-fixture' }, () => {
          events.push('ordinary-user-smoke');
          if (outcome === 'smoke-failure-cleaned') throw new Error('isolated smoke failure after install');
        }, invoke);
      }, mappedRootTemporaryBase);
    } catch (error) { observed = error; }
    assert.ok(observed instanceof Error);
    if (outcome === 'smoke-failure-cleaned') {
      assert.equal(observed.retainPrivateOutput, undefined);
      await assert.rejects(lstat(privateRoot), { code: 'ENOENT' });
      assert.deepEqual(events, ['install', 'ordinary-user-smoke', 'remove']);
    } else {
      assert.equal(observed.retainPrivateOutput, true); assert.equal(observed.privateOutput, privateRoot);
      const rootInfo = await lstat(privateRoot);
      assert.equal(rootInfo.mode & 0o777, 0o700); assert.equal(rootInfo.uid, process.getuid());
      assert.equal(staticLinuxPlan(executable).accepted, true);
      const report = JSON.parse(await readFile(join(dirname(executable), 'linux-sandbox.json'), 'utf8'));
      assert.equal(report.acceptance, false); assert.equal(report.retainPrivateOutput, true);
      assert.deepEqual(events, outcome === 'remove-failure' ? ['install', 'ordinary-user-smoke', 'remove'] : ['install']);
    }
  });
}

for (const outcome of ['unknown-install', 'confirmed-removal']) {
  test(`Linux report write failure retains the correct policy lifetime: ${outcome}`, { skip: process.platform !== 'linux' }, async t => {
    let privateRoot, executable, observed;
    const events = [];
    const invoke = (_helper, args) => {
      events.push(args[0]);
      if (args[0] === 'install') {
        if (outcome === 'unknown-install') throw new Error('isolated unknown install before journal failure');
        return { schema: 1, operation: 'install', created: true,
          profileName: 'sensa-desktop-' + 'c'.repeat(64), fileIdentity: '7:8:9' };
      }
      return { removed: true, fileIdentity: '7:8:9' };
    };
    try {
      await withDesktopOutput({ runtime: 'linux-x64', platform: 'linux' }, async out => {
        privateRoot = dirname(dirname(dirname(out)));
        t.after(() => rm(privateRoot, { recursive: true, force: true })); // Static fixture; no root commands or policy load.
        const directory = join(out, 'Sensa-linux-x64'); await mkdir(directory);
        executable = join(directory, 'Sensa'); await writeFile(executable, Buffer.from('\x7fELF\x02isolated static fixture'));
        await writeFile(join(directory, 'sensa-linux-sandbox.py'), 'isolated helper fixture; never executed');
        await secureLinuxPackage(directory, out);
        // A real filesystem error, rather than a mocked write failure.
        await mkdir(join(directory, 'linux-sandbox.json'));
        await withLinuxSandbox({ executable, runtime: 'linux-x64', reportDirectory: directory, commit: 'isolated-fixture' }, () => {
          events.push('ordinary-user-smoke');
        }, invoke);
      }, mappedRootTemporaryBase);
    } catch (error) { observed = error; }
    assert.ok(observed instanceof Error);
    if (outcome === 'unknown-install') {
      assert.match(observed.message, /unknown install/); assert.equal(observed.reportError.code, 'EISDIR');
      assert.equal(observed.retainPrivateOutput, true); assert.equal(observed.privateOutput, privateRoot);
      const info = await lstat(privateRoot); assert.equal(info.mode & 0o777, 0o700); assert.equal(info.uid, process.getuid());
      assert.equal(staticLinuxPlan(executable).accepted, true); assert.deepEqual(events, ['install']);
    } else {
      assert.equal(observed.code, 'EISDIR'); assert.equal(observed.retainPrivateOutput, undefined);
      await assert.rejects(lstat(privateRoot), { code: 'ENOENT' });
      assert.deepEqual(events, ['install', 'ordinary-user-smoke', 'remove']);
    }
  });
}
