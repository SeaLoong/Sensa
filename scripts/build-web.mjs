import { build } from 'esbuild';
import { buildParameterGeometry } from './build-parameter-geometry.mjs';
import { buildWebSensa } from './build-websensa.mjs';
await buildParameterGeometry();
await buildWebSensa();
await build({
  entryPoints: ['src/web/realtime-worker.js'], bundle: true, minify: true,
  outfile: 'src/web/realtime-worker.bundle.js', format: 'iife',
  target: ['chrome110', 'firefox115', 'safari16'],
  legalComments: 'inline',
});
await build({
  entryPoints: ['src/web/app.js'], bundle: true, minify: true,
  outfile: 'src/web/app.bundle.js', loader: { '.js': 'jsx' },
  jsx: 'automatic',
  target: ['chrome110', 'firefox115', 'safari16'],
  define: { 'process.env.NODE_ENV': '"production"' },
  legalComments: 'linked',
});
