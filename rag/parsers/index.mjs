// Parser registry. Each parser turns one file type into an array of raw
// sections ({ text, headingPath?, section?, page?, images? }); the ingest
// pipeline then chunks and embeds them. Adding a new file type = add one module
// here and register its extensions — nothing else in the system changes.
import * as text from './text.mjs';
import * as image from './image.mjs';
import * as pdf from './pdf.mjs';
import * as docx from './docx.mjs';
import * as doc from './doc.mjs';
import * as rtf from './rtf.mjs';
import * as pptx from './pptx.mjs';

const PARSERS = [text, image, pdf, docx, doc, rtf, pptx];

const byExt = new Map();
for (const mod of PARSERS) {
  for (const ext of mod.exts) byExt.set(ext, mod);
}

export const SUPPORTED_EXTS = [...byExt.keys()];

export function getParser(ext) {
  return byExt.get(String(ext).toLowerCase()) || null;
}
