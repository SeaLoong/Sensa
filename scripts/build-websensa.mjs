import { build } from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));

// Build the same standalone application for Pages and the desktop distribution.
export async function webSensaAssets({ source = root } = {}) {
  const result = await build({
    absWorkingDir: source,
    entryPoints: ['src/websensa/app.tsx'],
    outfile: path.join(source, 'src/websensa/app.bundle.js'),
    bundle: true, minify: true, write: false, jsx: 'automatic',
    target: ['chrome110', 'firefox115', 'safari16'],
    define: { 'process.env.NODE_ENV': '"production"' },
    legalComments: 'linked',
  });
  const assets = new Map(result.outputFiles.map(file => [path.basename(file.path), Buffer.from(file.contents)]));
  assets.set('index.html', await fs.readFile(path.join(source, 'src/websensa/index.html')));
  for (const name of ['index.html', 'app.bundle.js', 'app.bundle.css', 'app.bundle.js.LEGAL.txt'])
    if (!assets.has(name)) throw new Error('Missing WebSensa build asset: ' + name);
  return assets;
}

export async function buildWebSensa({ source = root, output = path.join(source, 'src/websensa') } = {}) {
  const assets = await webSensaAssets({ source });
  await fs.mkdir(output, { recursive: true });
  for (const [name, bytes] of assets) {
    // The source HTML is already canonical; leave its timestamp alone.
    if (name === 'index.html' && path.resolve(output) === path.join(source, 'src/websensa')) continue;
    await fs.writeFile(path.join(output, name), bytes);
  }
  return assets;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await buildWebSensa();
