// Reading a document somebody dropped onto the page.
//
// This is NOT ingestion. A document in rag/sources is practice material: it is
// parsed, chunked, embedded and citable, and an answer may be built on it. A
// document dropped onto the Q&A is the opposite — it belongs to the message it
// arrived with, it is gone when the question is answered, and nothing about it
// is stored. It is the letter someone has just been sent and wants filing, the
// email they want shortened, the form they cannot make sense of.
//
// So the job here is narrow: turn a file into plain text, quickly, without
// writing anything to disk or to the database. No page images, no headings, no
// chunking, no embeddings — the text goes into the prompt with the question and
// that is the end of it.
//
// The parsers themselves are loaded on demand. A practice that only ever drops
// .txt files never loads mammoth or pdfjs, and a missing optional parser fails
// as "I cannot read that kind of file", which is true and actionable, rather
// than as a 500.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// A dropped file is read into memory, so this is a real limit rather than a
// formality. Anything bigger is a document that belongs in the knowledge base,
// not on the end of one question.
export const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;

// How much of one document reaches the model. Long enough for a letter, a
// referral form or a policy extract; short enough that four of them cannot
// quietly turn one question into a very expensive one. The reader is told when
// a document was clipped — silently answering from the first few pages of a
// long document is exactly the kind of wrong that looks right.
export const MAX_ATTACHMENT_CHARS = 20000;

// Per message. Reception attaches a letter, occasionally a letter and a form.
export const MAX_ATTACHMENTS = 4;

const KIND_BY_EXT = new Map([
  ['.txt', 'text'], ['.md', 'text'], ['.markdown', 'text'], ['.csv', 'text'],
  ['.tsv', 'text'], ['.json', 'text'], ['.log', 'text'], ['.htm', 'html'], ['.html', 'html'],
  ['.docx', 'docx'], ['.doc', 'doc'], ['.pdf', 'pdf'], ['.rtf', 'rtf'],
]);

// Pictures are not attachments in this sense: the model looks at them directly,
// so they take the path images already take (see QaApp's pendingImages) and
// never come through here.
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif)$/i;

/**
 * Which reader handles this file, from its name — and its type only as a
 * fallback, because a browser reports .md as text/markdown, as application/
 * octet-stream, or as nothing at all depending on the platform.
 *
 * Returns '' for anything unsupported, including images.
 */
export function attachmentKind(name, mime = '') {
  const ext = path.extname(String(name || '')).toLowerCase();
  if (IMAGE_EXT.test(ext)) return 'image';
  const byExt = KIND_BY_EXT.get(ext);
  if (byExt) return byExt;
  const type = String(mime || '').toLowerCase();
  if (type === 'application/pdf') return 'pdf';
  if (type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'docx';
  if (type === 'application/msword') return 'doc';
  if (type === 'application/rtf' || type === 'text/rtf') return 'rtf';
  if (type === 'text/html') return 'html';
  if (type.startsWith('image/')) return 'image';
  if (type.startsWith('text/')) return 'text';
  return '';
}

/** Whether a dropped file can be read at all. */
export function isSupportedAttachment(name, mime = '') {
  const kind = attachmentKind(name, mime);
  return !!kind && kind !== 'image';
}

// Extracted text as a person would read it: no control characters, no runs of
// blank lines, no trailing spaces. Word and PDF extraction both produce plenty
// of all three, and every one of them is paid for as a token.
export function tidyAttachmentText(raw) {
  return String(raw || '')
    .replace(/\r\n?/g, '\n')
    // Everything unprintable except tab and newline. Word documents carry
    // form feeds and object-replacement characters; PDFs carry stranger things.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\uFFFC\uFEFF]/g, '')
    .replace(/\u00A0/g, ' ')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Cut to length on a line boundary where there is one nearby, and say so. */
export function clipAttachmentText(text, max = MAX_ATTACHMENT_CHARS) {
  const t = String(text || '');
  if (t.length <= max) return { text: t, truncated: false };
  const cut = t.slice(0, max);
  const lastBreak = cut.lastIndexOf('\n');
  return { text: (lastBreak > max * 0.6 ? cut.slice(0, lastBreak) : cut).trimEnd(), truncated: true };
}

// Plain text, HTML and RTF need no library. Word and PDF do, and both are
// imported here rather than at the top of the file so that dropping a .txt
// never loads them.

function htmlText(buffer) {
  return String(buffer.toString('utf8'))
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<\/(p|h[1-6]|li|tr|div|blockquote|section|figcaption)>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '\n- ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

async function docxText(buffer) {
  const mammoth = await import('mammoth');
  const { value } = await (mammoth.default || mammoth).extractRawText({ buffer });
  return value;
}

async function docText(buffer) {
  const mod = await import('word-extractor');
  const WordExtractor = mod.default || mod;
  const doc = await new WordExtractor().extract(buffer);
  return [doc.getBody(), doc.getFootnotes(), doc.getEndnotes()].filter(Boolean).join('\n\n');
}

async function rtfText(buffer) {
  const { rtfToText } = await import('../../rag/lib/rtf.mjs');
  return rtfToText(buffer);
}

// The selectable text of a PDF, page by page. No rendering: a page image is
// something the ingestion pipeline produces for a document that will be cited,
// and this document will not be. A scanned PDF therefore yields nothing here,
// and the caller says so rather than pretending the file was empty — the reader
// can drop a photograph of it instead, which the model can actually see.
// Where pdfjs's worker really is on disk.
//
// pdfjs runs its parser in a worker, and in Node it reaches that worker by
// importing the file. Left to itself inside a bundled server route it imports a
// path the bundler invented — .next/server/vendor-chunks/pdf.worker.mjs — which
// does not exist, and every PDF fails as "damaged". So it is told the real
// path. The copy under public/ is the one the browser already uses (see
// scripts/copy-pdf-worker.mjs) and is the fallback for a deployment where
// node_modules is not on disk beside the function.
function pdfWorkerSrc() {
  const root = process.cwd();
  const candidates = [
    path.join(root, 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.worker.mjs'),
    path.join(root, 'node_modules', 'pdfjs-dist', 'build', 'pdf.worker.min.mjs'),
    path.join(root, 'public', 'pdf.worker.min.mjs'),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return pathToFileURL(file).href;
  }
  return '';
}

async function pdfText(buffer) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  if (pdfjs.GlobalWorkerOptions && !pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerSrc();
  }
  const task = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    isEvalSupported: false,
    // Nothing is being drawn, so no font machinery is needed to read the text.
    disableFontFace: true,
    useSystemFonts: false,
  });
  const doc = await task.promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    // Line endings are kept. A letter or an email read as one unbroken
    // paragraph is much harder to work with — and reformatting one is half of
    // what a dropped document is for.
    let text = '';
    for (const item of content.items) {
      if (!item) continue;
      text += (item.str || '') + (item.hasEOL ? '\n' : ' ');
    }
    if (text.trim()) pages.push(`[Page ${i}]\n${text}`);
    // Stop once there is more than enough: a 200-page policy dropped by
    // accident should cost one question, not one per page.
    if (pages.join('\n').length > MAX_ATTACHMENT_CHARS * 1.5) break;
  }
  // Let go of the worker. Which object owns that has moved between pdfjs
  // versions, so whichever one can be closed, is — a leaked worker per dropped
  // PDF would outlive the request.
  try { await task.destroy(); } catch (e) { /* already gone */ }
  return pages.join('\n\n');
}

const READERS = {
  text: async (buffer) => buffer.toString('utf8'),
  html: async (buffer) => htmlText(buffer),
  docx: docxText,
  doc: docText,
  rtf: rtfText,
  pdf: pdfText,
};

/**
 * Read one dropped file. Throws with a message meant for the person who dropped
 * it — this is the only feedback they get, so "I cannot read .xlsx files yet" is
 * worth more than a stack trace.
 */
export async function extractAttachment({ buffer, name, mime = '' }) {
  const label = String(name || 'document').slice(0, 200);
  if (!buffer || !buffer.length) throw new Error(`${label} is empty.`);
  if (buffer.length > MAX_ATTACHMENT_BYTES) {
    throw new Error(`${label} is larger than ${Math.round(MAX_ATTACHMENT_BYTES / (1024 * 1024))}MB.`);
  }
  const kind = attachmentKind(label, mime);
  if (kind === 'image') throw new Error('Images are attached directly — they do not need reading.');
  const reader = READERS[kind];
  if (!reader) throw new Error(`I cannot read ${path.extname(label) || 'that kind of file'} yet.`);

  let raw;
  try {
    raw = await reader(buffer);
  } catch (e) {
    console.warn(`[attach] could not read ${label}:`, String(e).slice(0, 200));
    throw new Error(`${label} could not be read. It may be password-protected or damaged.`);
  }
  const tidied = tidyAttachmentText(raw);
  if (!tidied) {
    throw new Error(kind === 'pdf'
      ? `${label} has no text in it — it is probably a scan. Drop a photograph or screenshot of it instead, which I can look at.`
      : `${label} has no readable text in it.`);
  }
  const { text, truncated } = clipAttachmentText(tidied);
  return { name: label, kind, text, chars: tidied.length, truncated };
}

/**
 * What the browser sent back with the question, made safe to put in a prompt:
 * capped in number and in length, with names trimmed and anything empty
 * dropped. The text has already been through this module once on the way out,
 * but it has been to the browser and back since, so it is checked again here.
 */
export function sanitiseAttachments(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const name = String(item.name || 'Attached document').replace(/\s+/g, ' ').trim().slice(0, 200);
    const { text, truncated } = clipAttachmentText(tidyAttachmentText(item.text));
    if (!text) continue;
    out.push({ name, text, truncated: truncated || item.truncated === true });
    if (out.length >= MAX_ATTACHMENTS) break;
  }
  return out;
}

/**
 * The attached documents as a block of prompt text. Labelled for what it is:
 * the reader's own material, handed over to be worked on or asked about — never
 * a practice source, and never something an answer may cite as policy.
 */
export function attachmentsBlock(attachments) {
  const list = Array.isArray(attachments) ? attachments : [];
  if (!list.length) return '';
  const parts = [
    'ATTACHED BY THE READER (their own file, dropped onto the question — NOT practice material, NOT policy, and never citable as a source):',
  ];
  for (const doc of list) {
    parts.push(`--- ${doc.name}${doc.truncated ? ' (long — only the first part is shown)' : ''} ---\n${doc.text}`);
  }
  return parts.join('\n\n');
}
