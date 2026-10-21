/** Isolated catalog ranking benchmark; no browser, server, sockets or devices. */
import { performance } from 'node:perf_hooks';
import { cpus } from 'node:os';
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import * as current from '../src/web/osc-preview.js';

const { values } = parseArgs({ options: {
  base: { type: 'string' }, samples: { type: 'string', default: '7' }, output: { type: 'string' },
} });
const samples = Number(values.samples);
if (!Number.isInteger(samples) || samples < 1 || samples > 100) throw new Error('--samples must be an integer from 1 to 100');
const root = new URL('../', import.meta.url);
const versions = [{ name: 'current', module: current }];
if (values.base) {
  const commit = execFileSync('git', ['rev-parse', '--verify', `${values.base}^{commit}`], { cwd: root, encoding: 'utf8' }).trim();
  const source = execFileSync('git', ['show', `${commit}:src/web/osc-preview.js`], { cwd: root, encoding: 'utf8' })
    .replace("from './i18n.js'", `from '${new URL('../src/web/i18n.js', import.meta.url).href}'`);
  versions.unshift({ name: commit, module: await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64')) });
}
function workload(count) {
  const entries = Array.from({ length: count }, (_, index) => ({
    path: `Custom/Avatar${index % 16}/Parameter${index}`, sourceKey: index % 2 ? 'left' : 'right',
    classification: { relevance: index % 100 }, value: String(index), timestampMs: index,
  }));
  const signals = Array.from({ length: 120 }, (_, index) => ({
    oscPath: index % 6 ? `Custom/Avatar${index % 16}/Parameter${index}` : `Custom/*/Group${index}/**`,
  }));
  return { entries, signals, options: { pinned: [entries[count - 1].path], showFaceTracking: true } };
}
function median(times) {
  const sorted = [...times].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
function benchmark(version, count) {
  const { entries, signals, options } = workload(count), cold = [], updated = [];
  const rank = version.module.createOscPreviewRanker?.() || version.module.rankPreview;
  // Warm the module and establish the structural cache before timing updates.
  const initial = rank(entries, signals, options);
  const expected = initial.map(entry => `${entry.path}:${entry.sourceKey}`);
  if (initial.length !== count || !initial.some(entry => entry._matches?.length)) throw new Error('Workload must include mapped entries');
  for (let iteration = 0; iteration < samples; iteration++) {
    const nextRank = version.module.createOscPreviewRanker?.() || version.module.rankPreview;
    let start = performance.now();
    const first = nextRank(entries, signals, options);
    cold.push(performance.now() - start);
    const snapshot = entries.map(entry => ({ ...entry, value: `updated-${iteration}`, timestampMs: iteration + 50000 }));
    start = performance.now();
    const fresh = rank(snapshot, signals, options);
    updated.push(performance.now() - start);
    if (fresh.length !== first.length || fresh.some((entry, index) => `${entry.path}:${entry.sourceKey}` !== expected[index]
        || entry.value !== `updated-${iteration}` || entry.timestampMs !== iteration + 50000))
      throw new Error('Ranking changed or stale values were returned');
  }
  return { version: version.name, rows: count, mappings: signals.length, samples,
    coldMedianMs: Number(median(cold).toFixed(3)), valueOnlyMedianMs: Number(median(updated).toFixed(3)) };
}
const report = { node: process.version, cpu: cpus()[0]?.model, logicalCpus: cpus().length,
  scope: 'Isolated Node catalog ranking; excludes JSON parsing, React, browser layout and device processing. Timings are observations, not pass/fail thresholds.',
  results: versions.flatMap(version => [4096, 10000].map(count => benchmark(version, count))) };
const json = JSON.stringify(report, null, 2) + '\n';
if (values.output) { await mkdir(dirname(values.output), { recursive: true }); await writeFile(values.output, json); }
process.stdout.write(json);
