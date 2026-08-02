// Builds the entry the design-sync converter bundles.
//
// This repo is a Next.js application, not a published component library, so
// there is no dist/ for the converter to point at. This script compiles the
// app's own UI primitives (app/_components/ui.js) into an ESM entry with React
// left external — the same shape a library's dist entry would have. It is a
// precompile of real repo code; nothing here is rewritten or reimplemented.
//
// esbuild is resolved from .ds-sync/ (the converter's own staged deps) so this
// script adds no dependency to the app's package.json.

import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const OUT = resolve(HERE, 'dist/index.mjs');

const require = createRequire(import.meta.url);
const esbuild = require(require.resolve('esbuild', { paths: [resolve(ROOT, '.ds-sync')] }));

mkdirSync(dirname(OUT), { recursive: true });

await esbuild.build({
  entryPoints: [resolve(ROOT, 'app/_components/ui.js')],
  outfile: OUT,
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2020',
  // ui.js is JSX inside a .js file (Next compiles it); esbuild needs telling.
  loader: { '.js': 'jsx' },
  // React comes from the design system's own vendored copy at render time.
  external: ['react', 'react-dom'],
  logLevel: 'info',
});

console.error(`[build-entry] wrote ${OUT}`);
