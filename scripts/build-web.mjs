import { build } from 'esbuild';
await build({
  entryPoints: ['src/web/app.js'], bundle: true, minify: true,
  outfile: 'src/web/app.bundle.js', loader: { '.js': 'jsx' },
  target: ['chrome110', 'firefox115', 'safari16'],
  define: { 'process.env.NODE_ENV': '"production"' },
  legalComments: 'linked',
});
