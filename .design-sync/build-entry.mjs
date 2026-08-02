// Builds the two artefacts the design-sync converter consumes.
//
// This repo is a Next.js application, not a published component library, so
// there is no dist/ for the converter to point at.
//
//   dist/index.mjs         the app's own UI primitives (app/_components/ui.js)
//                          compiled to ESM with React left external — the same
//                          shape a library's dist entry would have.
//   dist/design-system.css the stylesheet cfg.cssEntry points at: the brand
//                          font import, then the token files, then the app's
//                          real globals.css. Concatenated rather than authored
//                          so globals.css stays the single source of truth
//                          (cfg.tokensGlob only resolves inside a node_modules
//                          package, so repo-local tokens have to ship here).
//
// Both are a precompile of real repo code; nothing here is rewritten.
//
// esbuild is resolved from .ds-sync/ (the converter's own staged deps) so this
// script adds no dependency to the app's package.json.

import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const OUT = resolve(HERE, 'dist/index.mjs');
const CSS_OUT = resolve(HERE, 'dist/design-system.css');

// Order matters: the @font-face import in fonts.css has to lead, because CSS
// drops an @import that follows a rule.
const CSS_PARTS = [
  'tokens/fonts.css',
  'tokens/colors.css',
  'tokens/typography.css',
  'tokens/spacing.css',
  '../app/globals.css',
].map((p) => resolve(HERE, p));

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

const css = CSS_PARTS.map(
  (p) => `/* ── ${relative(ROOT, p).replace(/\\/g, '/')} ─────────────────── */\n${readFileSync(p, 'utf8')}`,
).join('\n');
writeFileSync(CSS_OUT, css);

console.error(`[build-entry] wrote ${OUT}`);
console.error(`[build-entry] wrote ${CSS_OUT} (${CSS_PARTS.length} parts, ${Math.round(css.length / 1024)} KB)`);
