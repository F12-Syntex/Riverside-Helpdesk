// QUESTIONS ON A NOTEBOOK PAGE.
//
// Somebody reading a page highlights a sentence and asks about it: "which
// number is this?", "is this still true?". The question itself lives in the
// open-questions table (lib/questions/open.js), alongside every other
// question nobody has answered yet. The page only carries a marker around
// the words it was asked about:
//
//   <span data-q="k3v9x2m7qa">phone the duty doctor</span>
//
// so the question moves with its words as the page is edited, and is gone
// when they are. This module is the part with no database or editor in it:
// what a marker looks like, which ones a page holds, and the page with the
// markers taken out.
//
// THE ASSISTANT NEVER SEES A MARKER. A question is a doubt about the page,
// not a fact in it: what the assistant reads is the page's text, and an
// answer reaches it only once somebody writes it into that text (by hand, or
// through Format with AI). So every path from a page to a model or to the
// search index goes through stripQuestionMarks.

/** The attribute a marker carries. */
export const QUESTION_ATTR = 'data-q';

// An anchor is ours: lowercase letters and digits, minted by newQuestionAnchor.
// Anything else in a data-q attribute was typed or pasted by hand and is
// treated as no anchor at all - the id ends up inside a CSS selector and a
// URL, so the shape is enforced rather than escaped.
const ANCHOR_RE = /^[a-z0-9]{6,24}$/;

/** Is this a well-formed anchor id? */
export function isQuestionAnchor(value) {
  return ANCHOR_RE.test(String(value || ''));
}

/** A fresh anchor id: ten random lowercase letters and digits. */
export function newQuestionAnchor() {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = new Uint8Array(10);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

// Every <span ...> and </span> in the text, in order. Nothing else is parsed:
// the body is markdown with a small HTML subset, and spans are the only tag in
// that subset that a marker can be nested with (a colour inside a question, or
// a question inside a colour).
const SPAN_TAG = /<span\b([^>]*)>|<\/span\s*>/gi;
const MARKER_ATTR = /\bdata-q\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i;

function markerId(attrs) {
  const m = String(attrs || '').match(MARKER_ATTR);
  if (!m) return null;
  return m[1] ?? m[2] ?? m[3] ?? '';
}

/**
 * The anchors a page carries, in the order they first appear.
 *
 * A question asked across two paragraphs is two markers with the same id:
 * it is still one anchor.
 */
export function questionAnchorsIn(body) {
  const seen = new Set();
  const text = String(body || '');
  SPAN_TAG.lastIndex = 0;
  for (let m = SPAN_TAG.exec(text); m; m = SPAN_TAG.exec(text)) {
    if (m[1] === undefined) continue;
    const id = markerId(m[1]);
    if (id !== null && isQuestionAnchor(id)) seen.add(id);
  }
  return [...seen];
}

/** Does the page still carry this anchor? */
export function hasQuestionAnchor(body, anchor) {
  return isQuestionAnchor(anchor) && questionAnchorsIn(body).includes(anchor);
}

/**
 * The page with every question marker taken out and the words inside left
 * exactly where they were - or, given `only`, just those anchors' markers.
 *
 * Only the marker's own tags go: a colour span inside or around it is kept,
 * which is why this walks the tags as a stack rather than matching
 * `<span data-q>...</span>` with one pattern - that would close the marker on
 * the colour's `</span>`. A stray closing tag with no opener is left alone.
 */
export function stripQuestionMarks(body, only = null) {
  const text = String(body || '');
  if (!/data-q/i.test(text)) return text;
  const wanted = only == null ? null : new Set(only);
  const stack = [];
  let out = '';
  let last = 0;
  SPAN_TAG.lastIndex = 0;
  for (let m = SPAN_TAG.exec(text); m; m = SPAN_TAG.exec(text)) {
    const opening = m[1] !== undefined;
    const id = opening ? markerId(m[1]) : null;
    const isMarker = opening
      ? id !== null && (!wanted || wanted.has(id))
      : stack.length > 0 && stack[stack.length - 1];
    if (opening) stack.push(isMarker);
    else if (stack.length) stack.pop();
    if (isMarker) {
      out += text.slice(last, m.index);
      last = m.index + m[0].length;
    }
  }
  return out + text.slice(last);
}

/**
 * The words a marker is wrapped around, as plain text - what the question was
 * asked about. Segments of one anchor are joined with a space.
 */
export function questionQuote(body, anchor) {
  if (!isQuestionAnchor(anchor)) return '';
  const text = String(body || '');
  const parts = [];
  const stack = [];
  let start = -1;
  SPAN_TAG.lastIndex = 0;
  for (let m = SPAN_TAG.exec(text); m; m = SPAN_TAG.exec(text)) {
    if (m[1] !== undefined) {
      const mine = markerId(m[1]) === anchor;
      stack.push(mine);
      if (mine && start < 0) start = m.index + m[0].length;
    } else if (stack.length) {
      const mine = stack.pop();
      if (mine && start >= 0 && !stack.includes(true)) {
        parts.push(text.slice(start, m.index));
        start = -1;
      }
    }
  }
  return parts
    .map((p) => p.replace(/<[^>]+>/g, '').replace(/[*_`~]+/g, ''))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Markdown and the HTML subset, down to the words a reader sees.
function plainWords(text) {
  return String(text || '')
    .replace(/<[^>]+>/g, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}(?:#{1,6}\s+|>\s?|[-*+]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+)/gm, '')
    .replace(/\|/g, ' ')
    .replace(/^\s*:?-{3,}:?\s*$/gm, '')
    .replace(/[*_`~]+/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * The words round a question, so somebody answering it can see what it was
 * asked about without opening the page: the heading it sits under, and the
 * paragraph (or list item, or table row) it is in, split into the text
 * before the highlighted words, the words, and the text after. Long sides
 * are cut to `room` characters at the end nearest the words.
 *
 * @returns {{section:string, before:string, quote:string, after:string}|null}
 */
export function questionContext(body, anchor, room = 260) {
  if (!isQuestionAnchor(anchor)) return null;
  const text = String(body || '');
  const blocks = text.split(/\n\s*\n/);
  const at = blocks.findIndex((b) => new RegExp('data-q\\s*=\\s*["\']?' + anchor).test(b));
  if (at < 0) return null;

  let section = '';
  for (let i = at; i >= 0 && !section; i -= 1) {
    const lines = blocks[i].split('\n');
    for (let k = lines.length - 1; k >= 0; k -= 1) {
      const h = lines[k].match(/^\s{0,3}#{1,6}\s+(.*)$/);
      if (h) { section = plainWords(h[1]).trim(); break; }
    }
  }

  // The block with this anchor's tags turned into two markers and every
  // other span tag dropped.
  const block = blocks[at];
  const stack = [];
  let marked = '';
  let last = 0;
  SPAN_TAG.lastIndex = 0;
  for (let m = SPAN_TAG.exec(block); m; m = SPAN_TAG.exec(block)) {
    const opening = m[1] !== undefined;
    const mine = opening ? markerId(m[1]) === anchor : stack.length > 0 && stack[stack.length - 1];
    if (opening) stack.push(mine); else if (stack.length) stack.pop();
    marked += block.slice(last, m.index) + (mine ? (opening ? '\u0001' : '\u0002') : '');
    last = m.index + m[0].length;
  }
  marked += block.slice(last);

  const words = plainWords(marked);
  const i = words.indexOf('\u0001');
  const j = words.lastIndexOf('\u0002');
  if (i < 0 || j < i) return null;
  const clean = (s) => s.replace(/[\u0001\u0002]/g, '');
  let before = clean(words.slice(0, i)).trimStart();
  let after = clean(words.slice(j + 1)).trimEnd();
  const quote = clean(words.slice(i + 1, j)).trim();
  if (before.length > room) before = '…' + before.slice(before.length - room).replace(/^\S*\s/, '');
  if (after.length > room) after = after.slice(0, room).replace(/\s\S*$/, '') + '…';
  // The heading is the block itself when the question is on a heading.
  if (section && plainWords(block).trim() === section) section = '';
  return { section, before, quote, after };
}
