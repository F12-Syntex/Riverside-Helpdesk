// "No back pain" is not back pain.
//
// A patient wrote in about burning when passing urine, going constantly, unable
// to empty properly — and, ruling things out as patients do, "no temperature, no
// back pain, no discharge". The triage read "back pain", decided the message was
// musculoskeletal, and offered a physiotherapist for a urinary tract infection.
//
// The pattern was right and the reading of it was wrong. A regex finds words; it
// has no idea that the two in front of the ones it matched cancel them. And a
// patient describing symptoms spends half the message saying what they have NOT
// got — it is the most ordinary thing in an online consultation, which makes it
// the most expensive place to be naive.
//
// WHAT THIS IS FOR, AND WHAT IT MUST NEVER BE PUT IN FRONT OF.
//
// It is for PRESENCE checks: patterns asserting the patient HAS a thing — a body
// region, swelling, numbness, an injury. Those are the ones a "no" reverses.
//
// It must never wrap a pattern that is written in the negative already. "No
// relief", "not helping", "nothing has worked", "no better" are how failed
// self-care is written down, and a negation filter over those would read the
// "no" as cancelling the phrase it is part of and throw the feature away. See
// lib/templates/fcp.mjs, where the two kinds are kept in separate lists for
// exactly this reason.
//
// It is deliberately shallow: a look backwards over the same clause for a
// negating word, and nothing cleverer. Parsing English properly is not on the
// table, and a shallow rule that is right about "no back pain" and "denies chest
// pain" earns its place without pretending to be more.

// The words that cancel what follows them, kept to the ones that mean it
// plainly. Every one is word-bounded: the "no" inside "know" is what put a
// urinary message on a physiotherapist's list once already.
const NEGATORS = /\b(?:no|not|never|none|nor|without|denies|denied|deny|negative for|free of|ruled out|absent|nil|neither)\b|n[’']t\b/i;

// How far back a negator reaches. A clause, not a sentence: in "no discharge and
// severe back pain" the "no" must not reach across to the back pain.
const WINDOW = 30;

// What ends a negator's reach. Sentence enders, and the joining words that start
// a new claim — "but", "although", "however" flip the polarity back, which is
// how "no discharge but severe pain" reads correctly.
const BOUNDARY = /[.!?;:]|\b(?:but|although|though|however|except|apart from|other than|whereas)\b/i;

/**
 * Is the match at `index` inside the scope of a negation?
 *
 * Looks back over the clause the match sits in — up to WINDOW characters, or
 * until something ends the clause — and answers whether a negating word governs
 * it.
 *
 * @param {string} source  the whole text
 * @param {number} index   where the match starts
 */
export function isNegated(source, index) {
  const text = String(source || '');
  if (!text || index <= 0) return false;

  const from = Math.max(0, index - WINDOW);
  let before = text.slice(from, index);

  // Cut at the last clause boundary, so a negator in the previous clause cannot
  // reach into this one.
  const boundary = lastBoundary(before);
  if (boundary >= 0) before = before.slice(boundary + 1);

  return NEGATORS.test(before);
}

// The last position in `before` at which a clause ends. A scan rather than a
// lastIndexOf, so the word-shaped boundaries ("but", "although") count too.
function lastBoundary(before) {
  let at = -1;
  const re = new RegExp(BOUNDARY.source, 'gi');
  let m;
  while ((m = re.exec(before)) !== null) at = m.index + m[0].length - 1;
  return at;
}

/**
 * The first match of `pattern` that is NOT negated.
 *
 * Returns whatever `spanOf` builds — the caller owns the shape, so this file
 * does not have to know how sentences are found (see lib/safety/spans.mjs).
 * Null when every occurrence in the text is negated, which is the point: a
 * message that mentions a thing only to rule it out has not got that thing.
 *
 * It keeps looking rather than stopping at the first hit: "no back pain" early
 * in a message does not stop "back pain is severe" later in it from counting.
 */
export function firstUnnegated(text, pattern, spanOf) {
  const source = String(text || '');
  if (!source) return null;

  const re = new RegExp(pattern.source, pattern.flags.replace(/g/g, '') + 'g');
  let m;
  while ((m = re.exec(source)) !== null) {
    if (!m[0]) { re.lastIndex += 1; continue; }
    if (!isNegated(source, m.index)) return spanOf(source, m.index, m[0].length);
  }
  return null;
}
