// The answer as it is being written: what of it may be shown yet.
//
// The Q&A streams its answer (app/api/agent/route.js) so the reader is reading
// a second after the model starts rather than when it stops. Two of the things
// done to the finished answer are done to the text so far as well, and both
// need a WHOLE token to decide on:
//
//   - a number the practice did not write is taken out (redactUnverifiedNumbers,
//     lib/contacts.js) — but "020 7" is not yet a number, and shown now it would
//     be the first half of one nobody checked;
//   - `[[Notebook: Section / Page]]` becomes a link (resolveReferences) — but
//     "[[Notebook: Refe" is neither a link nor words anyone should read.
//
// So the tail that could still become either is held back until the next
// words settle it. Pure, so it is tested as it is.

// A run that could still grow into a phone number: a digit, then anything a
// number is written with, to the end of the text. Wider than the redactor's own
// pattern on purpose — holding back "2" of "2WW" for one chunk costs nothing.
const OPEN_NUMBER = /\+?\d[-\d.()\/ \t ]*$/;

/** The prefix of `text` that is settled enough to show. */
export function settledDraft(text) {
  let shown = String(text || '');
  const open = shown.lastIndexOf('[[');
  if (open >= 0 && shown.indexOf(']]', open) < 0) shown = shown.slice(0, open);
  const number = shown.match(OPEN_NUMBER);
  if (number) shown = shown.slice(0, number.index);
  return shown;
}

/**
 * A throttle for draft events: true when `now` is at least `everyMs` after the
 * last time it said true. The stream comes in tens of small chunks a second;
 * the reader cannot read faster than a few redraws a second, and each event
 * carries the whole draft.
 */
export function draftThrottle(everyMs = 120) {
  let last = -Infinity;
  return (now = Date.now()) => {
    if (now - last < everyMs) return false;
    last = now;
    return true;
  };
}
