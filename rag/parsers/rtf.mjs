// Rich Text Format documents. RTF carries no embedded structure we can map to
// headings reliably, so we extract the visible text (see lib/rtf.mjs) and serve
// a simple HTML rendition the in-app viewer can open.
import fs from 'node:fs';
import { rtfToText } from '../lib/rtf.mjs';
import { renderDocHtml } from '../lib/html.mjs';

export const exts = ['.rtf'];

// Source documents are staff-curated, but guard against a pathological file
// blocking the whole ingest run by allocating a huge buffer up front.
const MAX_BYTES = 50 * 1024 * 1024;

export async function parse(filePath, ctx) {
  if (fs.statSync(filePath).size > MAX_BYTES) {
    throw new Error(`RTF exceeds ${MAX_BYTES / (1024 * 1024)}MB limit`);
  }
  const text = rtfToText(fs.readFileSync(filePath));
  if (!text.trim()) return [];

  let view;
  if (ctx && ctx.publicWrite) {
    view = { kind: 'html', url: ctx.publicWrite('document.html', Buffer.from(renderDocHtml(text), 'utf8')) };
  }

  return [{ text, headingPath: [], section: '', images: [], view }];
}
