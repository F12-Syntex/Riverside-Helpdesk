// THE QUESTIONS NOBODY HAS AN ANSWER FOR YET.
//
// Two things end up in the same list, because they are the same thing:
//
//   1. A question a member of staff asks on purpose, because the assistant
//      does not know it and nothing in the practice's material covers it.
//   2. A question the assistant was actually asked and could not answer.
//
// The second is the half that never used to be collected. A receptionist whose
// question came back as "the practice has not written this down" pressed on
// with their day, the turn went into the question log with two hundred others,
// and nobody who could have written the missing page ever saw it. The log knows
// which turns those were — so the list writes itself, and the asking box is for
// the ones that were never put to the assistant at all.
//
// This module is the part with no database in it: what counts as unanswered,
// and when two questions are the same question. Both are tested directly.

/** Where a row came from. `asked` is somebody typing it; `assistant` is a turn that could not answer. */
export const ORIGINS = ['asked', 'assistant'];

/** Where a row has got to. Nothing is deleted — an answered question is the record of the answer. */
export const STATUSES = ['open', 'answered'];

/**
 * Why the assistant could not answer, in the words the list shows.
 *
 * Three, because three are what somebody filling the gaps has to tell apart: a
 * pathway the practice has not recorded, a question its notes do not cover at
 * all, and a turn that fell over — which is not a gap in the notes and must
 * not be presented as one.
 */
export const GAP_REASONS = [
  {
    id: 'not-recorded',
    label: 'Not recorded',
    note: 'The card came back flagged: this is a pathway the practice has not written down.',
  },
  {
    id: 'no-page',
    label: 'No page covers it',
    note: 'Answered from general knowledge, with nothing in the practice’s own notes behind it.',
  },
  {
    id: 'failed',
    label: 'The turn failed',
    note: 'The answer never arrived — a failed model call rather than a gap in the notes.',
  },
];

const REASON_BY_ID = new Map(GAP_REASONS.map((r) => [r.id, r]));

export const gapReason = (id) => REASON_BY_ID.get(String(id || '')) || null;
export const gapLabel = (id) => (REASON_BY_ID.get(String(id || '')) || {}).label || '';

// A question longer than this is not a question: it is a pasted letter, a
// consultation or a whole document, sent to a mode that exists to read one.
// Collecting those would fill the list with text nobody can write a page for.
const MAX_CAPTURE = 400;

// The line the prose answer is told to end with when the Notebook covered the
// question ("Source: Registering a new patient"). Its absence is the honest
// signal that the answer stood on general knowledge and nothing else.
const SOURCE_LINE = /^\s*(?:\*\*)?\s*sources?\s*(?:\*\*)?\s*[:：]/im;

/**
 * Is this the wording of a question, or a document somebody pasted?
 *
 * A command — "/coding", "/accurx" — is a tool being used rather than a
 * question being asked, and the text under it is patient material by design.
 * Neither belongs in a list of things to write down.
 */
export function isCollectableQuestion(question) {
  const text = String(question || '').trim();
  if (!text) return false;
  if (text.startsWith('/')) return false;
  return text.length <= MAX_CAPTURE;
}

/**
 * Why this finished turn counts as unanswered — '' when it was answered.
 *
 * Read off the row the question log already writes, so every path that answers
 * a question is covered by construction and nothing has to remember to call
 * this. See lib/questions/log.js, which is the one caller.
 *
 * @param {object} turn                the row as recordQuestion has it
 * @param {string} turn.outcome        'template' | 'prose' | 'failed'
 * @param {string} [turn.template]     the template that answered, with its flag
 * @param {string} [turn.answer]       the answer as text
 */
export function unansweredReason(turn = {}) {
  const outcome = String(turn.outcome || '');
  const template = String(turn.template || '');

  // The turn fell over. Worth collecting — somebody asked and got nothing —
  // but labelled as its own thing, because writing a Notebook page would not
  // have helped.
  if (outcome === 'failed') return 'failed';

  // A card that rendered under its own flag: "referral:not-recorded" is the
  // referral template saying the practice has no record of that pathway.
  if (/:not-recorded$/.test(template)) return 'not-recorded';

  // The prose path ran, which means the picker found no template and no
  // Notebook page fitting the question. It is told to name the page it
  // answered from, so an answer with no source line is an answer the
  // practice's own material did not stand behind.
  if (outcome === 'prose' && !SOURCE_LINE.test(String(turn.answer || ''))) return 'no-page';

  return '';
}

/**
 * The same question, however it was typed.
 *
 * Case, spacing, the trailing question mark and the polite opening all vary
 * between two people asking the identical thing, and a list that showed both
 * is a list that undercounts the gap it exists to measure. Deliberately
 * shallow: it collapses the wording, not the meaning. "How do I refer to
 * dermatology" and "derm referral" stay two rows, because pretending to know
 * they are one would be a guess dressed up as a count.
 */
export function normaliseQuestion(raw) {
  return String(raw || '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/^(?:hi|hello|hey|please|pls)\s+/, '')
    .replace(/^(?:can|could)\s+(?:you|someone|somebody|anyone)\s+(?:please\s+)?(?:tell\s+me\s+)?/, '')
    .replace(/^(?:does\s+anyone\s+know|do\s+we\s+know)\s+/, '')
    .trim();
}
