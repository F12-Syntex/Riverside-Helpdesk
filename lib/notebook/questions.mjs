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
