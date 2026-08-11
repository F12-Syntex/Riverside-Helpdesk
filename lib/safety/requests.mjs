// Splitting a message into the separate things it asks for.
//
// SINGLE INTENT WAS STRUCTURAL, NOT A QUALITY PROBLEM. The selection schema
// returns exactly one template. No amount of model quality produces five
// answers from that contract, so a message carrying five requests came back as
// one card and the other four vanished with nothing on screen to say they had.
//
// So the model is asked for one extra thing: the message, cut into the distinct
// asks it contains, each as the VERBATIM span it occupies. That is extraction,
// which even a deliberately cheap model does reliably. It is not asked to rank
// them, judge them or decide which matters — those are code's job (see
// ./acuity.mjs), because they are the parts that have to behave the same way
// every time.
//
// LATENCY IS THE REASON FOR THE GATE BELOW. "How do I refer for an ECG" is one
// ask, and paying 200 extra output tokens to be told so on every short question
// is a cost with no answer attached to it. So the extra field is only requested
// when the message actually looks like it carries more than one thing.
import { normaliseForMatch, spanWithin, trimSpan } from './spans.mjs';

// Long enough that somebody has written paragraphs rather than a question.
// An eConsult with five requests in it does not fit in 300 characters; almost
// nothing typed at the desk with a patient waiting exceeds it.
export const MULTI_INTENT_MIN_CHARS = 300;

// The words people use when they are about to add a second thing. Deliberately
// literal — this decides whether to spend tokens, not whether somebody is safe,
// so a miss costs a panel and never costs an escalation (the scanners in
// ./ng12.mjs and ./acuity.mjs run message-wide on every turn regardless).
export const MULTI_INTENT_CUES = new RegExp('(?:' + [
  '\\balso\\b',
  '\\banother (?:thing|question|matter|issue)\\b',
  'while i(?:\'| a)?m (?:here|on|writing)',
  '\\bone more\\b',
  'and can you',
  '\\b(?:second|third|fourth|fifth)ly\\b',
  '\\blastly\\b', '\\bfinally\\b',
  '\\bas well as\\b',
  '\\bat the same time\\b',
  '\\bseparately\\b',
  '\\bin addition\\b',
].join('|') + ')', 'i');

// More than this and the panel becomes a scrolling list nobody reads. Extras
// are counted and said out loud rather than dropped quietly — see `dropped`.
export const MAX_REQUESTS = 8;

/**
 * Is this message worth decomposing?
 *
 * Length OR a joining phrase. Either alone is enough: a long message with no
 * cue words is exactly the pasted eConsult this was built for, and a short
 * message saying "also can you" is two asks in one line.
 */
export function looksMultiIntent(text) {
  const t = String(text || '');
  return t.length > MULTI_INTENT_MIN_CHARS || MULTI_INTENT_CUES.test(t);
}

/**
 * Tidy what the model returned into the list the rest of the system uses.
 *
 * Each item keeps whether its span is VERBATIM — actually present in the
 * message. That flag is not bookkeeping: locality is tested by containment, so
 * a span the model paraphrased cannot ground an assertion about the complaint
 * it names, and everything downstream treats it as evidence-free rather than
 * quietly trusting it.
 *
 * @returns {{items: Array, dropped: number}}
 */
export function normaliseRequests(raw, message = '') {
  const list = Array.isArray(raw) ? raw : [];
  const seen = new Set();
  const items = [];
  let dropped = 0;

  for (const entry of list) {
    const text = trimSpan(entry && entry.text);
    const gist = trimSpan(entry && entry.gist);
    if (!text) { dropped += 1; continue; }
    const key = normaliseForMatch(text);
    if (!key || seen.has(key)) { dropped += 1; continue; }
    if (items.length >= MAX_REQUESTS) { dropped += 1; continue; }
    seen.add(key);
    items.push({
      id: 'r' + (items.length + 1),
      text,
      gist: gist || '',
      verbatim: spanWithin(text, message),
    });
  }

  return { items, dropped };
}

/**
 * The whole message as a single request, for every turn that was not
 * decomposed.
 *
 * Everything downstream is written against a list of requests, and a
 * one-element list is a far safer shape than a null the callers have to
 * remember to check.
 */
export function wholeMessage(message = '') {
  const text = trimSpan(message);
  return text ? [{ id: 'r1', text, gist: '', verbatim: true, whole: true }] : [];
}
