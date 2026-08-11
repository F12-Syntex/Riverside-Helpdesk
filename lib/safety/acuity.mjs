// How urgent is one request? Decided in code, from a table.
//
// THE MODEL NEVER RANKS ACUITY. It splits the message up (./requests.mjs) and
// it names conditions; ordering them is a table here, because the ordering is
// the thing that decides which of five requests becomes the card on screen, and
// that must not move because a message was worded differently on Tuesday.
//
// The order is the order, and nothing below can override something above it:
//
//   emergency     the red-flag list, or cauda equina features. 999 / interrupt
//                 the duty doctor. Nothing waits.
//   twoWeekWait   an NG12 suspected-cancer feature. The duty doctor today; the
//                 referral decision is theirs, not this file's.
//   sameDay       the writer said it cannot wait, or describes something
//                 getting rapidly worse.
//   routine       a clinical problem with none of the above. Most things.
//   admin         a prescription, a fit note, a form, a letter, an appointment
//                 to move. Real work, and never the reason a clinical item was
//                 not looked at.
//
// A request that reads as both admin and clinical is ranked clinical: "my
// ramipril has run out and I've been dizzy since" is not a prescription job.
// That falls out of the order below, which is checked top down.
import { scanNg12 } from './ng12.mjs';
import { scanRedFlags } from './redflags.mjs';
import { matchSpan } from './spans.mjs';

// Least urgent first, so an index into this array IS the comparison. Everything
// that orders acuity anywhere in the app orders it with `rankOf`.
export const ACUITY_ORDER = ['admin', 'routine', 'sameDay', 'twoWeekWait', 'emergency'];

export const ACUITY_LABELS = {
  emergency: 'Emergency',
  twoWeekWait: 'Suspected cancer pathway',
  sameDay: 'Needs seeing today',
  routine: 'Routine',
  admin: 'Admin',
};

export function rankOf(acuity) {
  const at = ACUITY_ORDER.indexOf(String(acuity || ''));
  return at === -1 ? ACUITY_ORDER.indexOf('routine') : at;
}

/** True when `a` is more urgent than `b`. */
export const moreUrgent = (a, b) => rankOf(a) > rankOf(b);

// "This cannot wait", said in the ways people say it. Deliberately not matching
// a bare "today" — "I rang today" is a sentence about the telephone.
const SAME_DAY = /(?:\burgent(?:ly)?\b|\bemergency appointment\b|\bsame.?day\b|as soon as possible|\basap\b|(?:seen|see (?:someone|a doctor|somebody)|speak to (?:someone|a doctor))[^.!?]{0,20}today|need[^.!?]{0,25}today|\bcan'?t wait\b|cannot wait|getting (?:rapidly |much |a lot )?worse|deteriorat\w+|acutely unwell|\bgone downhill\b)/i;

// The jobs that are jobs rather than judgements. Being on this list does not
// make a request unimportant — a repeat that never gets issued is how somebody
// runs out of their blood pressure medicine — it makes it the kind of thing a
// receptionist can finish themselves.
const ADMIN = /(?:\bfit note\b|\bsick note\b|\bmed(?:ical)? cert\w*\b|\bstatement of fitness\b|\brepeat (?:prescription|medication|script)\b|\bprescription\b|\bmedication review\b|\brun(?:ning)? out of\b|\bre.?order\b|\bletter\b|\bform\b|\bregistration\b|\bregister\b|\bproof of\b|\binsurance\b|\bdna\b|(?:re)?book(?:ing)? (?:an? )?appointment|\breschedul\w+|\bcancel\b|\bchange (?:my|the|their) appointment\b|\bcopy of\b|\bpaperwork\b)/i;

// Something clinical is being described at all. Used only to keep a bare admin
// job from being called "routine" — the distinction between an admin item and a
// routine clinical one is what stops the panel filling up with wallpaper.
const CLINICAL = /(?:\bpain\w*\b|\bache\w*\b|\bsore\b|\bhurts?\b|\bswell\w+|\brash\b|\blump\b|\bbleed\w*|\bdizz\w+|\bnausea\w*|\bvomit\w*|\bdiarrhoea\b|\bcough\w*|\bfever\b|\btemperature\b|\binfection\b|\bsymptom\w*|\bunwell\b|\bpoorly\b|\bill\b|\btired\w*|\bfatigue\w*|\bnumb\w*|\btingl\w+|\bweak\w*|\bbreath\w*|\banxious\b|\banxiety\b|\bdepress\w+|\blow mood\b|\bstruggl\w+|\bworse\b|\binjur\w+|\bsprain\w*|\bstrain\w*|\bphysio\w*|\bstiff\w*)/i;

/**
 * Rank one request, and say which rules did it.
 *
 * `findings` are the deterministic hits inside this request's own text — they
 * are what the band and the log show, and what a review reconstructs the
 * decision from. An empty list with an acuity of routine or admin is the normal
 * answer and is not a failure.
 */
export function classifyRequest(text) {
  const source = String(text || '');
  const findings = [...scanRedFlags(source), ...scanNg12(source)];

  const emergency = findings.find((f) => f.acuity === 'emergency');
  if (emergency) return { acuity: 'emergency', findings };

  const twoWeek = findings.find((f) => f.acuity === 'twoWeekWait');
  if (twoWeek) return { acuity: 'twoWeekWait', findings };

  const sameDay = matchSpan(source, SAME_DAY);
  if (sameDay) {
    findings.push({
      ruleId: 'acuity.sameDay',
      kind: 'acuity',
      acuity: 'sameDay',
      label: 'The writer says this cannot wait',
      match: sameDay.match,
      span: sameDay.span,
      index: sameDay.index,
    });
    return { acuity: 'sameDay', findings };
  }

  // Admin last of the positive tests, and only when nothing clinical is being
  // described alongside it. A prescription request with symptoms attached is a
  // clinical request that mentions a prescription.
  if (ADMIN.test(source) && !CLINICAL.test(source)) return { acuity: 'admin', findings };

  return { acuity: 'routine', findings };
}
