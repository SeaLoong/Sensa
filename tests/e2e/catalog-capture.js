import { createHash } from 'node:crypto';

// The gallery's PNGs are mirrors of these source goldens. A passing browser case
// must attach its own current pixels, including when an existing golden matches.
export function catalogCapturePaths(catalog) {
  if (catalog?.schema !== 1 || !Array.isArray(catalog.scenes) || !Array.isArray(catalog.additionalImages))
    throw new Error('Invalid screenshot catalog');
  const paths = new Set();
  const add = record => {
    if (!record || !/^(desktop|mobile)\/[a-zA-Z0-9-]+\.png$/.test(record.file)
      || !/^[a-f0-9]{64}$/.test(record.sha256) || !['zh-CN', 'en-US'].includes(record.language))
      throw new Error('Invalid catalog source image');
    paths.add(record.file);
  };
  for (const scene of catalog.scenes) {
    for (const viewport of ['desktop', 'mobile']) {
      for (const locale of ['en', 'zh-CN']) add(scene.images?.[viewport]?.[locale]);
    }
  }
  for (const record of catalog.additionalImages) add(record);
  return paths;
}

export function catalogCaptureRecord({ project, name, bytes, testId, sourceCommit, runId, attempt }) {
  if (!['desktop', 'mobile'].includes(project) || !/^[a-zA-Z0-9-]+$/.test(name)
    || !Buffer.isBuffer(bytes) || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    || typeof testId !== 'string' || !testId || !/^[a-f0-9]{40}$/.test(sourceCommit)
    || !/^\d+$/.test(String(runId)) || !/^[1-9]\d*$/.test(String(attempt)))
    throw new Error('Invalid current catalog capture identity');
  return { schema: 1, sourceCommit, runId: String(runId), attempt: String(attempt), testId, project,
    path: `tests/e2e/__screenshots__/${project}/${name}.png`,
    attachment: 'catalog-current-' + name, sha256: createHash('sha256').update(bytes).digest('hex') };
}
