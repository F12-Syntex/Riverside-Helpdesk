// Vendor the pdf.js worker into public/ so the in-browser source viewer
// (app/_components/PdfSourceView.jsx) can load it from a stable, same-origin
// URL (/pdf.worker.min.mjs) with no CDN dependency. The worker version MUST
// match the pdfjs-dist version the app imports, so this runs before every
// build (see package.json "build"). Safe to run any time.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'node_modules', 'pdfjs-dist', 'build', 'pdf.worker.min.mjs');
const dest = path.join(root, 'public', 'pdf.worker.min.mjs');

if (!fs.existsSync(src)) {
  console.error('[copy-pdf-worker] pdfjs-dist worker not found at ' + src + ' — is pdfjs-dist installed?');
  process.exit(1);
}
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.copyFileSync(src, dest);
console.log('[copy-pdf-worker] copied pdf.worker.min.mjs -> public/');
