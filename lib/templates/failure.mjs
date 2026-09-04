// WHY A CARD CAME BACK WITHOUT AN ANSWER.
//
// Every command promises a card. When the model call behind it does not come
// back, the card is still rendered — from nothing — so the reader gets the
// practice's own material rather than an error page or, worse, an answer to a
// different question. That is right, and it had one thing wrong with it: the
// material and the failure look identical. A receptionist who pasted a written-up
// phone call and got back "how to write up a contact with a patient" has been
// told, in effect, that the mode does not work, and nobody learns that the AI
// provider refused the call until somebody reads a server log.
//
// So a failed call says so on the card, in the words the person reading it can
// act on. The provider's own message is not those words: "This request requires
// more credits, or fewer max_tokens. You requested up to 2000 tokens, but can
// only afford 626" is a sentence for whoever holds the OpenRouter account, and
// the practice manager is who needs it — but reception has to be told what it
// means for the thing they just typed.
//
// The mapping is deliberately small. Each entry is a failure that has actually
// happened here and has a different thing to do about it; anything unmatched
// keeps the provider's own words rather than being smoothed into "something
// went wrong", which tells nobody anything.

import { note } from './blocks.mjs';

/** Plain words for a failed model call, and what to do about it. */
export function failureReason(failed = '') {
  const t = String(failed || '').trim();
  if (!t) return '';
  // The one that stops everything at once: no credit, so no call is made at
  // all — every mode falls back on the same turn, which is what it looks like
  // from the front desk when "the whole thing is broken".
  if (/credit|can only afford|\b402\b|insufficient.funds/i.test(t)) {
    return 'The practice’s OpenRouter account is out of credit, so the provider refused the call before any model saw it. Every mode that reads or writes is affected until it is topped up at openrouter.ai/settings/credits.';
  }
  if (/rate.?limit|\b429\b|too many requests/i.test(t)) {
    return 'The model provider is rate-limiting the practice’s key. Wait a moment and send it again.';
  }
  if (/api key|unauthoris|unauthoriz|\b401\b|\b403\b/i.test(t)) {
    return 'The AI provider would not accept the practice’s key. OPENROUTER_API_KEY needs checking before this mode can answer.';
  }
  if (/no object generated|could not parse|invalid json|schema/i.test(t)) {
    return 'The model answered with something this card could not be built from. Send it again; if it keeps happening, a different model at /settings will read it.';
  }
  if (/timed out|timeout|etimedout|fetch failed|econnreset|socket/i.test(t)) {
    return 'The model did not answer in time. Send it again.';
  }
  return 'The model call did not come back: ' + t;
}

/**
 * The block a rules card carries when it is standing in for an answer that
 * failed, rather than answering a question about how something is written.
 *
 *   failureNote('...can only afford 626', 'No entry was written')
 *
 * Returns null when nothing failed, so a card that was asked for on purpose is
 * byte-identical to what it was before this existed.
 */
export function failureNote(failed = '', wrote = 'Nothing was written') {
  const reason = failureReason(failed);
  return reason ? note('**' + wrote + ' — this is how it is done, not what you asked for.** ' + reason, 'warn') : null;
}
