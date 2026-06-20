// Legacy Word (.doc) documents — the old OLE compound binary format, extracted
// with word-extractor. Collections of .doc files exported from the web are
// frequently mislabelled, so we sniff the real format first: RTF and zip-based
// DOCX saved with a .doc extension are routed to the right reader rather than
// failing. Text only — the binary format has no clean image extraction path.
import fs from 'node:fs';
import { rtfToText, looksLikeRtf } from '../lib/rtf.mjs';
import { renderDocHtml } from '../lib/html.mjs';

export const exts = ['.doc'];

const MAX_BYTES = 50 * 1024 * 1024;

function isZip(buffer) {
  // DOCX (and other OOXML) are zip archives: "PK\x03\x04".
  return buffer.length > 3 && buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04;
}

async function fromDocx(buffer) {
  let mammoth;
  try {
    mammoth = await import('mammoth');
  } catch (e) {
    throw new Error('A .doc file is actually DOCX and needs mammoth. Install it with:  npm i mammoth', { cause: e });
  }
  return (await mammoth.extractRawText({ buffer })).value || '';
}

async function fromOleDoc(filePath) {
  let WordExtractor;
  try {
    WordExtractor = (await import('word-extractor')).default;
  } catch (e) {
    throw new Error('Legacy .doc support needs word-extractor. Install it with:  npm i word-extractor', { cause: e });
  }
  const doc = await new WordExtractor().extract(filePath);
  // Body plus any text boxes; headers/footers are boilerplate we skip.
  return [doc.getBody(), doc.getTextboxes && doc.getTextboxes({ includeHeadersAndFooters: false })]
    .filter(Boolean)
    .join('\n')
    .trim();
}

export async function parse(filePath, ctx) {
  if (fs.statSync(filePath).size > MAX_BYTES) {
    throw new Error(`DOC exceeds ${MAX_BYTES / (1024 * 1024)}MB limit`);
  }
  const buffer = fs.readFileSync(filePath);

  let text;
  if (looksLikeRtf(buffer)) text = rtfToText(buffer);
  else if (isZip(buffer)) text = await fromDocx(buffer);
  else text = await fromOleDoc(filePath);

  if (!text || !text.trim()) return [];

  let view;
  if (ctx && ctx.publicWrite) {
    view = { kind: 'html', url: ctx.publicWrite('document.html', Buffer.from(renderDocHtml(text), 'utf8')) };
  }

  return [{ text, headingPath: [], section: '', images: [], view }];
}
