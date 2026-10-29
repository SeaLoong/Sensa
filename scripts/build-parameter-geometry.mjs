import { build } from 'esbuild';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const bundlePath = resolve(root, 'docs/assets/parameter-geometry-3d.js');
const licensePath = resolve(root, 'docs/assets/parameter-geometry-3d.LICENSE.txt');

// Commit the generated classic script so file-based documentation needs no install.
// 提交生成的经典脚本，确保文件方式打开文档时无需安装依赖。
export async function buildParameterGeometry({ check = false } = {}) {
  const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
  const installed = JSON.parse(readFileSync(resolve(root, 'node_modules/three/package.json'), 'utf8'));
  const version = packageJson.dependencies.three;
  if (installed.version !== version) throw new Error('Three.js installation differs from the pinned dependency; run npm ci. / Three.js 与锁定依赖不一致，请运行 npm ci。');
  const result = await build({
    absWorkingDir: root,
    entryPoints: ['docs/assets/parameter-geometry-3d-source.js'],
    bundle: true, minify: true, format: 'iife', write: false,
    // The classic offline document has its own compiler contract. App-specific
    // TypeScript settings must not change its pinned, reproducible output.
    tsconfigRaw: {},
    outfile: bundlePath, target: ['chrome110', 'firefox115', 'safari16'],
    legalComments: 'none',
    banner: { js: '/*! Sensa offline 3D; includes Three.js ' + version + ' and OrbitControls (MIT). See parameter-geometry-3d.LICENSE.txt. */' },
  });
  const notice = 'Three.js ' + version + ' (including OrbitControls)\nhttps://www.npmjs.com/package/three/v/' + version + '\n\n'
    + readFileSync(resolve(root, 'node_modules/three/LICENSE'), 'utf8').replace(/\r\n/g, '\n');
  const files = new Map([[bundlePath, result.outputFiles[0].contents], [licensePath, Buffer.from(notice)]]);
  for (const [path, bytes] of files) {
    if (check) {
      if (!existsSync(path) || !readFileSync(path).equals(Buffer.from(bytes)))
        throw new Error('Offline 3D assets are stale; run npm run build:web and commit both generated files. / 离线 3D 资源过期，请运行 npm run build:web 并提交两个生成文件。');
    } else {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, bytes);
    }
  }
  return Object.freeze({ version, bytes: result.outputFiles[0].contents.length });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await buildParameterGeometry({ check: process.argv.includes('--check') });
  console.log('Offline 3D assets / 离线 3D 资源: ' + result.version + ', ' + result.bytes + ' bytes');
}
