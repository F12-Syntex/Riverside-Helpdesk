// What the answer cache will and will not reuse, and how two questions are
// judged to be the same question.
//
// Two staff members ask the same thing in different words all day — "how do I
// report a significant event", "what's the process for reporting a significant
// event", "significant event reporting?" — and each one currently costs a full
// agent turn: several model calls, several searches, twenty seconds of waiting.
// The answer to all three is the same answer, so it is stored once and served
// again.
//
// Matching happens in two steps (see ./store.js). This module holds the first,
// which is free: the question is normalised to a canonical form and hashed, so
// wording that differs only in case, punctuation or politeness lands on exactly
// the same key. Anything more genuinely reworded is left to the embedding
// search, which is why SIMILARITY_THRESHOLD lives here too.
//
// Pure string handling — no database, no network — so it can be tested on its
// own with `npm test`.
import crypto from 'node:crypto';

// How alike two questions' embeddings must be before one answer is served for
// the other. Deliberately high: a receptionist acting on an answer to a
// question they did not ask is far worse than waiting twenty seconds for a
// fresh one. At 0.92, rewordings of one question match and two different
// questions about the same topic ("report a data breach" vs "report a
// significant event") do not.
export const SIMILARITY_THRESHOLD = 0.92;

// Nothing is served from a cache entry older than this, even when the Notebook
// has not changed — a backstop against anything the fingerprint cannot see
// (a document re-ingest, a supplementary URL, a changed prompt).
export const MAX_AGE_DAYS = 30;

// Long messages are not questions: they are pasted letters and reports to file,
// or a patient's message to route. Those are one-offs — caching them would fill
// the table with text that is never asked for twice.
export const MAX_QUESTION_CHARS = 400;

// Below this, a normalised question is too thin to identify safely ("bp", "ok?").
const MIN_NORMALISED_CHARS = 8;

// Openers and sign-offs that carry no meaning for retrieval. Stripped so
// "Hi, how do I report a significant event please?" and "How do I report a
// significant event" are one key rather than two.
const GREETING = /^(?:hi|hiya|hello|hey|morning|afternoon|good morning|good afternoon)\b[\s,.!-]*/i;
const OPENER = /^(?:please|pls|can you (?:please )?(?:tell me|remind me|explain)|could you (?:please )?(?:tell me|remind me|explain)|i need to know|i want to know|quick question)\b[\s,:-]*/i;
const SIGN_OFF = /[\s,]*\b(?:please|pls|thanks|thank you|ta|cheers)\b[\s.!?]*$/i;

/**
 * The canonical form of a question: lower case, no smart quotes, no
 * punctuation, no greeting or politeness, single spaces. Two questions with the
 * same canonical form are treated as the same question with no model call at
 * all — the fastest path there is.
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

/** The cache key: a hash of the canonical form, so it is a fixed-width id. */
export function questionKey(text) {
  return crypto.createHash('sha256').update(normaliseQuestion(text)).digest('hex');
}

/**
 * Whether this request may be answered from, or written to, the cache.
 *
 * A follow-up ("and if they refuse?") means nothing without the conversation
 * it belongs to, and an attached image is unique to the message it came with —
 * neither can be keyed by the question text, so both are always answered fresh.
 */
export function isCacheableRequest({ question, history = '', images = [] } = {}) {
  if (Array.isArray(images) && images.length) return false;
  if (String(history || '').trim()) return false;
  const q = String(question || '').trim();
  if (!q || q.length > MAX_QUESTION_CHARS) return false;
  return normaliseQuestion(q).length >= MIN_NORMALISED_CHARS;
}

/**
 * Whether an answer is worth keeping. Only a real, answerable staff answer is:
 * a triage of one patient's request and a filing title for one pasted document
 * are about that message and nothing else, and "I could not find anything" is
 * exactly the answer that should be retried once the Notebook grows.
 */
export function isCacheableAnswer(payload) {
  if (!payload || payload.kind !== 'answer' || payload.answerable === false) return false;
  const hasSection = Array.isArray(payload.sections)
    && payload.sections.some((sec) => String(sec && sec.markdown || '').trim());
  return hasSection || !!String(payload.message || '').trim();
}
