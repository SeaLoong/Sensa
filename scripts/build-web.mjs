import { build } from 'esbuild';
import { buildParameterGeometry } from './build-parameter-geometry.mjs';
await buildParameterGeometry();
await build({
  entryPoints: ['src/web/app.js'], bundle: true, minify: true,
  outfile: 'src/web/app.bundle.js', loader: { '.js': 'jsx' },
  target: ['chrome110', 'firefox115', 'safari16'],
  define: { 'process.env.NODE_ENV': '"production"' },
  legalComments: 'linked',
});
