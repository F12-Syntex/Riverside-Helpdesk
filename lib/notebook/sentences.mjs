// A Notebook page cut into sentences, each with a stable id.
//
// Everything the defragmenter does stands on this: the rules point at
// sentences, the proposal maps output sentences back to source ids, and the
// validator counts which ids survived. So the cut has to be the same every
// time for the same text, and it has to respect what markdown already
// separates: a heading, a table row, an image line and a "Label: value" line
// are each ONE sentence however many full stops they contain, because a table
// row split on "." is nonsense and a label split from its value is a lost fact.
// Only prose and list-item text are split on sentence punctuation.
//
// Pure. Works on LF text; CRLF is normalised on the way in.
import { createHash } from 'node:crypto';
import { normForMatch } from '../ai/quote-match.js';

const HEADING = /^\s{0,3}#{1,6}\s+\S/;
const TABLE = /^\s*\|/;
const LIST = /^\s*(?:[-*+•]|\d+[.)])\s+/;
const IMAGE = /^\s*!\[[^\]]*\]\([^)]*\)\s*$/;
const RULE = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;
// "Speciality: Cardiology", "- **Clinic type:** Hernias", "Send to: x@y". The
// label is short, made of words, and followed by a colon and a value.
const LABEL = /^\s*(?:[-*+•]\s+)?(?:\*\*|__)?[A-Za-z][A-Za-z /-]{1,30}(?:\*\*|__)?\s*:\s*\S/;

// A full stop that does not end a sentence.
const ABBREV = /\b(?:e\.g|i\.e|Dr|Mr|Mrs|Ms|St|no|approx|etc|vs|Prof|Rev)\.$/i;
const BOUNDARY = /(?<=[.!?])\s+(?=[A-Z0-9"“(])/;

/**
 * @typedef {{ id: string, kind: 'heading'|'prose'|'list'|'table'|'label'|'image',
 *             text: string, line: number, start: number, end: number, norm: string }} Sentence
 */

// Prose split into sentences, with the abbreviation guard. Returns each piece
// with its index into the text it came from.
function splitProse(text) {
  const pieces = [];
  let cursor = 0;
  const parts = text.split(BOUNDARY);
  for (const part of parts) {
    const index = text.indexOf(part, cursor);
    cursor = index + part.length;
    const last = pieces[pieces.length - 1];
    if (last && ABBREV.test(last.text)) {
      // "e.g. the form" — glue back onto the previous piece.
      last.text = text.slice(last.index, cursor);
      continue;
    }
    pieces.push({ text: part, index });
  }
  return pieces
    .map((p) => {
      const lead = p.text.length - p.text.trimStart().length;
      return { text: p.text.trim(), index: p.index + lead };
    })
    .filter((p) => p.text);
}

/** Cut a page into sentences. Ids are s1, s2, … in document order. */
export function splitSentences(markdown) {
  const text = String(markdown || '').replace(/\r\n/g, '\n');
  const lines = text.split('\n');
  const out = [];
  let n = 0;
  const push = (kind, s, start, line) => {
    const norm = normForMatch(s);
    if (!norm && kind !== 'image') return;
    out.push({ id: 's' + (++n), kind, text: s, line, start, end: start + s.length, norm });
  };

  // Soft-wrapped prose is one paragraph: buffered until a blank line or a
  // line of another kind, then split. Newlines become spaces at the same
  // offsets, so a sentence's start still points into the original text.
  let buf = null; // { text, start, line }
  const flush = () => {
    if (!buf) return;
    for (const p of splitProse(buf.text)) push('prose', p.text, buf.start + p.index, buf.line);
    buf = null;
  };

  let offset = 0;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const start = offset;
    offset += raw.length + 1;
    const trimmed = raw.trim();
    const at = start + (raw.length - raw.trimStart().length);
    if (!trimmed || RULE.test(raw)) { flush(); continue; }
    if (HEADING.test(raw)) { flush(); push('heading', trimmed, at, i + 1); continue; }
    if (TABLE.test(raw)) { flush(); push('table', trimmed, at, i + 1); continue; }
    if (IMAGE.test(raw)) { flush(); push('image', trimmed, at, i + 1); continue; }
    if (LABEL.test(raw)) { flush(); push('label', trimmed, at, i + 1); continue; }
    if (LIST.test(raw)) {
      flush();
      const marker = raw.match(LIST)[0];
      const body = raw.slice(marker.length);
      for (const p of splitProse(body)) push('list', p.text, start + marker.length + p.index, i + 1);
      continue;
    }
    if (buf) buf.text += ' ' + raw;
    else buf = { text: raw, start, line: i + 1 };
  }
  flush();
  return out;
}

export function sentenceIndex(sentences) {
  return new Map((sentences || []).map((s) => [s.id, s]));
}

/**
 * The page with "[s12] " in front of every sentence, for the proposal prompt.
 * Built on the LF-normalised text the sentences were cut from.
 */
export function annotate(markdown, sentences) {
  let text = String(markdown || '').replace(/\r\n/g, '\n');
  const sorted = (sentences || []).slice().sort((a, b) => b.start - a.start);
  for (const s of sorted) text = text.slice(0, s.start) + '[' + s.id + '] ' + text.slice(s.start);
  return text;
}

export function stripAnnotations(text) {
  return String(text || '').replace(/\[s\d+\]\s?/g, '');
}

/** Content hash of a body, line endings normalised, so a proposal can say which text it was built from. */
export function hashBody(markdown) {
  return createHash('sha256').update(String(markdown || '').replace(/\r\n/g, '\n')).digest('hex');
}

/** Sentences that carry content — the ones a rewrite must keep. */
export const isContent = (s) => s && ['prose', 'list', 'table', 'label'].includes(s.kind);
