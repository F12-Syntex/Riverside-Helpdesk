import { firstUnnegated } from './negation.mjs';

// Where a sentence is allowed to have come from.
//
// TWO RULES GOVERN EVERYTHING IN THIS FOLDER, AND THEY POINT IN OPPOSITE
// DIRECTIONS ON PURPOSE.
//
//   SAFETY CHECKS ARE MESSAGE-WIDE AND FAIL TOWARD CAUTION. A red flag is a red
//   flag wherever in the message it was written, including in a paragraph
//   nothing routed and nothing answered.
//
//   ASSERTIONS ARE SPAN-LOCAL AND FAIL TOWARD SILENCE. A card may only claim
//   something about the complaint it is about, and only from a span inside that
//   complaint's own text. No span, no sentence — the neutral wording is used
//   instead.
//
// WHY. A patient wrote in with five separate requests: a chronic knee, a hoarse
// voice with weight loss, a repeat prescription, a fit note, and a question
// about their wife's blood results. The answer was one knee card, and that card
// said "Over-the-counter treatment has already been tried and has not worked".
// Nobody had written that about the knee. The SELFCARE_FAILED regex in
// lib/templates/fcp.mjs had matched the literal words "hasn't shifted", which
// in that message described the VOICE — not the knee, and not any medicine.
//
// Every feature regex scanned the whole message with no notion of locality, so
// text from one complaint wrote the wording for another. That is not a tuning
// problem and no amount of better patterns fixes it: the patterns were right,
// the reach was wrong. This file is the reach.

// Everything that is presentation rather than wording, plus the punctuation a
// model tends to include or drop at the edges of a quoted span.
const EDGES = /^[\s"'“”‘’(\[{.,;:!?—–-]+|[\s"'“”‘’)\]}.,;:!?—–-]+$/g;

const BREAK = /[.!?\n]/;

/** One span, tidied: whitespace collapsed and the edges cleaned. */
export function trimSpan(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').replace(EDGES, '').trim();
}

// Comparison form. Case, punctuation and spacing all differ between what a
// model quotes back and what the patient typed — "ramipril, and I've run out"
// against "ramipril and I have run out" is the same span by any reading that
// matters, and a containment test that says otherwise silently drops evidence.
export function normaliseForMatch(value) {
  return trimSpan(value)
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Does `span` lie inside `text`?
 *
 * The whole locality rule reduces to this. An empty span is never inside
 * anything — that is the "fail toward silence" half: a claim with no evidence
 * behind it is not rendered.
 */
export function spanWithin(span, text) {
  const needle = normaliseForMatch(span);
  if (!needle) return false;
  return normaliseForMatch(text).includes(needle);
}

/**
 * The sentence a match sits in, so a rule can show its working in words a
 * person can read rather than as an offset.
 *
 * A long sentence is cut around the words that fired rather than from its
 * start: the point of showing the span is showing what matched.
 */
export function sentenceAround(text, index, length, max = 200) {
  const s = String(text || '');
  if (!s) return '';
  let start = Math.max(0, index);
  while (start > 0 && !BREAK.test(s[start - 1])) start -= 1;
  let end = Math.min(s.length, index + length);
  while (end < s.length && !BREAK.test(s[end])) end += 1;
  if (end < s.length) end += 1;

  if (end - start <= max) return trimSpan(s.slice(start, end));

  // Too long to show whole. Keep the match centred, and mark both cuts so
  // nobody reads a fragment as the whole sentence.
  const room = Math.max(0, max - length);
  const from = Math.max(start, index - Math.floor(room / 2));
  const to = Math.min(end, from + max);
  return (from > start ? '…' : '') + trimSpan(s.slice(from, to)) + (to < end ? '…' : '');
}

/**
 * Run one pattern over a text and report what it matched AND where.
 *
 * Returns null when nothing matched, so a caller can treat "no evidence" and
 * "no finding" as the same thing. `match` is the literal text the pattern hit
 * and is what locality is tested on; `span` is the sentence around it and is
 * what a person reads.
 */
export function matchSpan(text, pattern, max = 200) {
  const source = String(text || '');
  if (!source) return null;
  // Rebuilt without /g so a shared pattern cannot carry lastIndex between
  // calls — the classic way a scanner starts missing every other message.
  const re = new RegExp(pattern.source, pattern.flags.replace(/g/g, ''));
  const m = re.exec(source);
  if (!m) return null;
  return hit(source, m.index, m[0].length, max);
}

/**
 * The same, for a pattern that asserts the patient HAS something.
 *
 * Identical to matchSpan except that an occurrence the patient ruled out does
 * not count: "no back pain" is not back pain, and a message saying so is not a
 * musculoskeletal message. See lib/safety/negation.mjs, which owns how far a
 * "no" reaches and what stops it.
 *
 * ONLY FOR PRESENCE PATTERNS. A pattern written in the negative already — "no
 * relief", "not helping", "nothing has worked" — must keep using matchSpan, or
 * the filter reads the "no" that PROVES the feature as the "no" that cancels it.
 */
export function matchPresence(text, pattern, max = 200) {
  return firstUnnegated(text, pattern, (source, index, length) => hit(source, index, length, max));
}

// What both of them return: the literal text that matched, the sentence around
// it for a person to read, and where it was.
function hit(source, index, length, max) {
  return {
    match: trimSpan(source.slice(index, index + length)),
    span: sentenceAround(source, index, length, max),
    index,
  };
}
