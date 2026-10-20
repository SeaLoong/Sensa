import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildParameterGeometry } from '../../scripts/build-parameter-geometry.mjs';

test('offline 3D script and MIT notice reproduce from pinned sources / 离线3D脚本与MIT声明可由锁定源码重建', async () => {
  const result = await buildParameterGeometry({ check: true });
  const metadata = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
  assert.equal(result.version, metadata.dependencies.three);
  const license = readFileSync(new URL('../../docs/assets/parameter-geometry-3d.LICENSE.txt', import.meta.url), 'utf8');
  assert.match(license, /Permission is hereby granted/);
  assert.match(license, /THE SOFTWARE IS PROVIDED "AS IS"/);
});
