// The canonical form of a staff question, and its hash.
//
// Two staff members ask the same thing in different words all day — "how do I
// report a significant event", "what's the process for reporting a significant
// event", "significant event reporting?". The first rung of the router
// (./router.mjs) is free: the question is normalised to a canonical form and
// hashed, so wording that differs only in case, punctuation or politeness
// lands on exactly the same key and needs no model call at all. Anything more
// genuinely reworded is left to the lexical and vector rungs.
//
// Pure string handling — no database, no network — so it can be tested on its
// own with `npm test` (test/routing-normalise.test.mjs).
import crypto from 'node:crypto';

// Openers and sign-offs that carry no meaning for retrieval. Stripped so
// "Hi, how do I report a significant event please?" and "How do I report a
// significant event" are one key rather than two.
const GREETING = /^(?:hi|hiya|hello|hey|morning|afternoon|good morning|good afternoon)\b[\s,.!-]*/i;
const OPENER = /^(?:please|pls|can you (?:please )?(?:tell me|remind me|explain)|could you (?:please )?(?:tell me|remind me|explain)|i need to know|i want to know|quick question)\b[\s,:-]*/i;
const SIGN_OFF = /[\s,]*\b(?:please|pls|thanks|thank you|ta|cheers)\b[\s.!?]*$/i;

/**
 * The canonical form of a question: lower case, no smart quotes, no
 * punctuation, no greeting or politeness, single spaces. Two questions with the
 * same canonical form are treated as the same question.
 */
export function normaliseQuestion(text) {
  let t = String(text || '')
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .toLowerCase()
    .trim();
  // Openers can stack ("hi, please can you tell me…"), so strip until nothing
  // more comes off rather than once.
  for (let i = 0; i < 4; i++) {
    const before = t;
    t = t.replace(GREETING, '').replace(OPENER, '').replace(SIGN_OFF, '');
    if (t === before) break;
  }
  return t
    // Keep apostrophes and hyphens inside words ("patient's", "2-week"); every
    // other mark is a separator.
    .replace(/[^a-z0-9'\-\s]+/g, ' ')
    .replace(/(^|\s)['-]+|['-]+(\s|$)/g, '$1$2')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The exact-match key: a hash of the canonical form, so it is a fixed-width id. */
export function questionKey(text) {
  return crypto.createHash('sha256').update(normaliseQuestion(text)).digest('hex');
}
