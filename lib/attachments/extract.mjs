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
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

// Resolved through Node rather than guessed from the working directory. See
// pdfWorkerSrc below for what the guessing cost.
const requireFrom = createRequire(import.meta.url);

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

/* ------------------------------------------------------ what it really is */
//
// THE NAME OF A FILE IS A CLAIM, NOT A FACT, and at a GP surgery it is wrong
// often. A letter is saved as .docx out of a system that writes legacy .doc; an
// RTF arrives named .doc because that is what Word called it; somebody renames
// an attachment to get it past an email filter. Every one of those was read
// with the wrong parser, the parser threw, and the reader was told the file
// "may be password-protected or damaged".
//
// It was neither. The file was fine and we had opened it with the wrong tool —
// and then blamed the file, in wording confident enough that somebody would go
// back to the sender and ask for a document that was never broken.
//
// So the BYTES decide. Every format below announces itself in its first few,
// and that signature cannot be renamed.
const SIG = {
  pdf: Buffer.from('%PDF'),
  zip: Buffer.from([0x50, 0x4b, 0x03, 0x04]),
  // OLE2 compound file: legacy Word, Excel and PowerPoint all share it.
  ole: Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
  rtf: Buffer.from('{\\rtf'),
};

// What is actually inside a zip. The entry names sit uncompressed in the local
// headers, so they can be found without unpacking anything.
const ZIP_PART = [
  ['word/document.xml', 'docx'],
  ['xl/workbook.xml', 'xlsx'],
  ['ppt/presentation.xml', 'pptx'],
];

/**
 * The format a file really is, read from its first bytes. Returns '' when the
 * bytes say nothing recognisable, which is the normal case for plain text.
 *
 * 'xlsx' and 'pptx' are returned even though nothing reads them: knowing what a
 * file IS lets the reader be told "that is a spreadsheet" instead of being told
 * their document is damaged.
 */
export function sniffAttachment(buffer) {
  if (!buffer || buffer.length < 4) return '';
  if (buffer.subarray(0, 4).equals(SIG.pdf)) return 'pdf';
  if (buffer.subarray(0, 5).toString('latin1').toLowerCase().startsWith('{\\rt')) return 'rtf';
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(SIG.ole)) return 'doc';
  if (buffer.subarray(0, 4).equals(SIG.zip)) {
    for (const [part, kind] of ZIP_PART) {
      if (buffer.includes(part)) return kind;
    }
    return 'zip';
  }
  const head = buffer.subarray(0, 512).toString('utf8').trim().toLowerCase();
  if (head.startsWith('<!doctype html') || head.startsWith('<html')) return 'html';
  return '';
}

// What to call a format the reader has no parser for, in words somebody at a
// desk can act on. "That is a spreadsheet" tells them what to do next;
// "damaged" sends them back to the sender for nothing.
const CANNOT_READ = {
  xlsx: 'That is a spreadsheet (.xlsx). Copy the rows you need and paste them in as text.',
  pptx: 'That is a PowerPoint file. Copy the text you need and paste it in.',
  zip: 'That is a zip or Office file I cannot open. Try attaching the document inside it.',
};

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
  // Ask Node where the package is rather than assuming it sits under the
  // working directory. On a deployed function it very often does not, and the
  // guess below is only a last resort for a build that has moved the file.
  for (const spec of ['pdfjs-dist/legacy/build/pdf.worker.mjs', 'pdfjs-dist/build/pdf.worker.min.mjs']) {
    try { return pathToFileURL(requireFrom.resolve(spec)).href; } catch (e) { /* try the next */ }
  }
  const root = process.cwd();
  for (const file of [
    path.join(root, 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.worker.mjs'),
    path.join(root, 'node_modules', 'pdfjs-dist', 'build', 'pdf.worker.min.mjs'),
    path.join(root, 'public', 'pdf.worker.min.mjs'),
  ]) {
    if (fs.existsSync(file)) return pathToFileURL(file).href;
  }
  return '';
}

// The metrics for the fonts a PDF names but does not embed — Helvetica, Times,
// Courier. Without them pdfjs warns on every standard-font PDF, which is most
// NHS letters, and text extraction is worse for it.
function standardFontDataUrl() {
  try {
    const pkg = requireFrom.resolve('pdfjs-dist/package.json');
    const dir = path.join(path.dirname(pkg), 'standard_fonts');
    if (fs.existsSync(dir)) return pathToFileURL(dir).href + '/';
  } catch (e) { /* pdfjs will warn and carry on */ }
  return undefined;
}

async function pdfText(buffer) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  if (pdfjs.GlobalWorkerOptions && !pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerSrc();
  }
  const task = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    isEvalSupported: false,
    standardFontDataUrl: standardFontDataUrl(),
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
  if (attachmentKind(label, mime) === 'image') {
    throw new Error('Images are attached directly — they do not need reading.');
  }

  // THE BYTES FIRST, THE NAME SECOND. A file whose extension disagrees with its
  // contents is common and is not the reader's fault; opening it with the
  // parser its name asked for is ours.
  const sniffed = sniffAttachment(buffer);
  if (CANNOT_READ[sniffed]) throw new Error(CANNOT_READ[sniffed]);

  const kind = READERS[sniffed] ? sniffed : attachmentKind(label, mime);
  const reader = READERS[kind];
  if (!reader) throw new Error(`I cannot read ${path.extname(label) || 'that kind of file'} yet.`);

  let raw;
  try {
    raw = await reader(buffer);
  } catch (e) {
    console.warn(`[attach] could not read ${label} as ${kind}:`, String(e).slice(0, 200));
    // ONLY SAY WHAT IS KNOWN. An encrypted PDF announces itself and can be
    // named; everything else is a parser that failed for a reason nobody here
    // has established, and guessing "damaged or password-protected" at it was
    // how a perfectly good letter got sent back to the sender.
    if (e && (e.name === 'PasswordException' || /password/i.test(String(e.message || '')))) {
      throw new Error(`${label} is password-protected. Open it, save a copy without the password, and attach that.`);
    }
    throw new Error(`${label} could not be read. Try saving it as a PDF and attaching that, or paste the text in.`);
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
