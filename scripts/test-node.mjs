/** Run the complete isolated Node/domain unit inventory with official Node reporters. */
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { execFileSync, spawnSync } from 'node:child_process';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const tests = [];
async function collect(directory) {
  for (const row of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, row.name);
    if (row.isDirectory()) await collect(path);
    else if (row.isFile() && /\.test\.(?:ts|mjs|cjs|js)$/.test(row.name)) tests.push(relative(root, path).replaceAll('\\', '/'));
  }
}
await collect(join(root, 'tests/node'));
await collect(join(root, 'tests/runtime'));
tests.sort();
if (!tests.length) throw new Error('No Node/domain unit tests were selected.');
const output = join(root, 'artifacts/test-results/backend');
await mkdir(output, { recursive: true });
const args = ['--test', '--test-reporter=spec', '--test-reporter-destination=stdout', '--test-reporter=junit',
  '--test-reporter-destination=' + join(output, 'node.xml'), ...tests];
const source = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const sourceTreeDirty = !!execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim();
const inventory = await Promise.all(tests.map(async path => ({ path,
  sha256: createHash('sha256').update(await readFile(join(root, path))).digest('hex') })));
await writeFile(join(output, 'node-source.json'), JSON.stringify({ schema: 1, sourceCommit: source, sourceTreeDirty,
  runId: process.env.GITHUB_RUN_ID ?? null, attempt: process.env.GITHUB_RUN_ATTEMPT ?? null,
  repository: process.env.GITHUB_REPOSITORY ?? null, nodeVersion: process.version, arguments: args,
  completeSourceInventory: inventory }, null, 2) + '\n');
const result = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
