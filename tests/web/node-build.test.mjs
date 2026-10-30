import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { actionSourceProvenance, collectNativeFiles, nodeLicense, prepareDirectory, runtimeFor, safeRelative, sourceIdentity, thirdPartyNotices, webResources, writeSeaEvidence } from '../../scripts/build-node.mjs';

async function packageFixture(root, name, options = {}) {
  const directory = join(root, 'node_modules', name); await mkdir(directory, { recursive: true });
  await writeFile(join(directory, 'package.json'), JSON.stringify({ name, version: '1.0.0', main: 'index.js', ...options }));
  await writeFile(join(directory, 'index.js'), 'throw new Error("Package collection must not execute module code");');
  return directory;
}
async function fixture(t) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'sensa-node-build-unit-'))); t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, 'package.json'), '{}');
  await packageFixture(root, 'serialport', { dependencies: { '@serialport/bindings-cpp': '1.0.0', dep: '1.0.0' } });
  const binding = await packageFixture(root, '@serialport/bindings-cpp');
  await writeFile(join(binding, 'addon.node'), 'fixture native bytes, never executed');
  const midi = await packageFixture(root, '@julusian/midi', { dependencies: { dep: '2.0.0' } });
  await writeFile(join(midi, 'addon.node'), 'fixture midi bytes, never executed');
  await packageFixture(root, 'dep'); await packageFixture(midi, 'dep', { version: '2.0.0' });
  const packages = { '': {} };
  for (const name of ['serialport', '@serialport/bindings-cpp', '@julusian/midi', 'dep', '@julusian/midi/node_modules/dep']) {
    packages['node_modules/' + name] = { version: name.includes('/node_modules/') ? '2.0.0' : '1.0.0',
      resolved: 'https://registry.npmjs.org/fixture/-/fixture.tgz', integrity: 'sha512-isolated-fixture' };
  }
  await writeFile(join(root, 'package-lock.json'), JSON.stringify({ packages })); return root;
}

test('source identity handles a differently owned checkout without global trust or weakening the exact commit pin', async t => {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'sensa-source-identity-unit-'))); t.after(() => rm(directory, { recursive: true, force: true }));
  const git = args => {
    const result = spawnSync('git', args, { cwd: directory, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr); return result.stdout.trim();
  };
  git(['init', '--quiet']); await writeFile(join(directory, 'fixture.txt'), 'isolated source');
  git(['add', 'fixture.txt']); git(['-c', 'user.name=Source Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '-m', 'fixture']);
  const commit = git(['rev-parse', 'HEAD']), environment = { ...process.env, GIT_TEST_ASSUME_DIFFERENT_OWNER: '1' };
  const denied = () => spawnSync('git', ['rev-parse', 'HEAD'], { cwd: directory, encoding: 'utf8', env: environment });
  assert.notEqual(denied().status, 0);
  assert.equal(sourceIdentity(directory, commit, environment), commit);
  assert.throws(() => sourceIdentity(directory, '0'.repeat(40), environment), /identity differs/);
  assert.notEqual(denied().status, 0, 'The successful check must not persist a global safe.directory entry.');
});

test('Node build resolves all production native dependency versions without running them', async t => {
  const root = await fixture(t), result = await collectNativeFiles(root);
  assert.equal(result.packageDirectories.length, 5);
  assert.equal(result.files.length, 12);
  assert.ok(result.files.some(row => row.path === 'node_modules/@julusian/midi/node_modules/dep/index.js'));
  assert.ok(result.files.every(row => /^[a-f\d]{64}$/.test(row.sha256) && row.asset === 'native/' + row.path));
  assert.equal(result.packageIdentities.find(row => row.path === 'node_modules/@julusian/midi/node_modules/dep').version, '2.0.0');
  assert.equal(result.packageIdentities.find(row => row.path === 'node_modules/dep').version, '1.0.0');
  assert.ok(result.resolutions.some(row => row.from === 'node_modules/@julusian/midi' && row.name === 'dep'
    && row.to === 'node_modules/@julusian/midi/node_modules/dep'));
});

test('native package evidence rejects a resolved version that differs from its exact nested lock path', async t => {
  const root = await fixture(t), path = join(root, 'package-lock.json'), lock = JSON.parse(await readFile(path, 'utf8'));
  lock.packages['node_modules/@julusian/midi/node_modules/dep'].version = '1.0.0'; await writeFile(path, JSON.stringify(lock));
  await assert.rejects(collectNativeFiles(root), /identity differs from its pinned lockfile/);
});

test('SEA evidence binds only metadata manifests and build identity to the same source and digests', async t => {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'sensa-sea-evidence-unit-'))); t.after(() => rm(directory, { recursive: true, force: true }));
  const metadata = { sourceCommit: 'a'.repeat(40), runtime: 'linux-x64', nodeVersion: '24.22.2', modules: '137' };
  const manifests = Object.fromEntries(['web-manifest.json', 'native-manifest.json', 'package-identities.json'].map(name => [name, Buffer.from(JSON.stringify({ schema: 1, file: name }))]));
  const built = await writeSeaEvidence(directory, metadata, manifests), proof = JSON.parse(await readFile(join(directory, 'source-proof.json'), 'utf8'));
  assert.equal(proof.sourceCommit, metadata.sourceCommit); assert.equal(proof.runtime, metadata.runtime);
  assert.equal(proof.files.length, 4); assert.deepEqual(JSON.parse(built).evidence.files, proof.files.slice(0, 3));
  for (const row of proof.files) {
    const bytes = await readFile(join(directory, row.path));
    assert.equal(bytes.length, row.bytes); assert.equal(createHash('sha256').update(bytes).digest('hex'), row.sha256);
  }
  assert.deepEqual(actionSourceProvenance({}), {});
  assert.deepEqual(actionSourceProvenance({ GITHUB_ACTIONS: 'true', GITHUB_RUN_ID: '42', GITHUB_RUN_ATTEMPT: '2', GITHUB_REPOSITORY: 'Owner/Repo' }),
    { runId: '42', runAttempt: '2', repository: 'Owner/Repo' });
  assert.throws(() => actionSourceProvenance({ GITHUB_ACTIONS: 'true', GITHUB_RUN_ID: '42' }), /requires the current run/);
});
test('missing required native packages fail rather than silently losing a capability', async t => {
  const root = await fixture(t); await rm(join(root, 'node_modules/@julusian/midi'), { recursive: true });
  await assert.rejects(collectNativeFiles(root), /Cannot find module/);
});
test('native package source links are rejected before creating an embedded inventory', async t => {
  const root = await fixture(t), directory = join(root, 'node_modules/serialport');
  await symlink(join(root, 'node_modules/dep'), join(directory, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(collectNativeFiles(root), /link or special/);
});
test('a rebuild cannot clear another directory or a previous manual profile', async t => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'sensa-build-output-unit-'))); t.after(() => rm(root, { recursive: true, force: true }));
  const output = join(root, 'out'); await mkdir(output); await writeFile(join(output, 'keep.txt'), 'keep');
  await assert.rejects(prepareDirectory(output), /unowned/); assert.equal(await readFile(join(output, 'keep.txt'), 'utf8'), 'keep');
  await writeFile(join(output, '.sensa-node-build'), 'Sensa generated Node build\n');
  await writeFile(join(output, 'config.json'), '{"ownedByUser":true}');
  await assert.rejects(prepareDirectory(output), /user profile/);
  assert.equal(await readFile(join(output, 'config.json'), 'utf8'), '{"ownedByUser":true}');
});
test('native output identity and static resource paths cover supported targets without aliases', () => {
  assert.equal(runtimeFor('darwin', 'arm64'), 'osx-arm64'); assert.equal(runtimeFor('win32', 'x64'), 'win-x64');
  assert.throws(() => runtimeFor('linux', 'ia32'), /Unsupported/);
  for (const path of ['../outside', '/absolute', 'x\\y', 'x:stream', 'a//b', 'NUL.txt']) assert.throws(() => safeRelative(path), /Unsafe/);
  assert.equal(new Set(webResources.map(row => row[1])).size, webResources.length);
  assert.ok(webResources.some(row => row[1] === 'websensa/index.html'));
  assert.ok(webResources.some(row => row[1] === 'docs/assets/parameter-geometry-signal.js'));
});

test('redistributed Node license binds the exact version and original upstream bytes', async t => {
  const license = await nodeLicense('24.22.2');
  assert.equal(createHash('sha256').update(license.text).digest('hex'), license.sha256);
  assert.match(license.text, /Node\.js/);
  await assert.rejects(nodeLicense('26.0.0'), /must match the pinned/);
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'sensa-license-unit-'))); t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, 'node.json'), JSON.stringify(license));
  await writeFile(join(directory, license.file), license.text + 'changed');
  await assert.rejects(nodeLicense('24.22.2', directory), /SHA-256/);
});

test('distribution notices preserve package license and nested notices with pinned package identity', async t => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'sensa-notices-unit-'))); t.after(() => rm(root, { recursive: true, force: true }));
  const directory = await packageFixture(root, 'dependency', { license: 'MIT', repository: { url: 'https://example.invalid/source' } });
  await writeFile(join(directory, 'LICENSE'), 'Original package permission fixture');
  await mkdir(join(directory, 'vendor')); await writeFile(join(directory, 'vendor/NOTICE.txt'), 'Original nested author notice');
  const packages = { '': {}, 'node_modules/dependency': { version: '1.0.0', resolved: 'https://registry.npmjs.org/dependency/-/dependency-1.0.0.tgz', integrity: 'sha512-fixture' },
    'node_modules/absent-optional': { version: '1.0.0', optional: true }, 'node_modules/absent-dev': { version: '1.0.0', dev: true } };
  await writeFile(join(root, 'package-lock.json'), JSON.stringify({ packages }));
  const result = await thirdPartyNotices(root, 'Linked JS license fixture');
  assert.equal(result.packages.length, 1); assert.equal(result.packages[0].version, '1.0.0');
  assert.equal(result.packages[0].integrity, 'sha512-fixture');
  assert.deepEqual(result.packages[0].notices.map(row => row.path), ['LICENSE', 'vendor/NOTICE.txt']);
  const text = result.bytes.toString('utf8');
  assert.match(text, /Original package permission fixture/); assert.match(text, /Original nested author notice/);
  assert.match(text, /operator supplies the Node\.js runtime/); assert.match(text, /Linked JS license fixture/);
  await writeFile(join(directory, 'package.json'), JSON.stringify({ name: 'dependency', version: '2.0.0' }));
  await assert.rejects(thirdPartyNotices(root, ''), /identity differs/);
});
