// One message, scanned. The whole deterministic floor in one place.
//
// Everything here is regex and tables. No model is consulted, nothing is
// awaited, and the same message produces the same result every time — which is
// the point: this is the part of the turn that has to be true on a Tuesday
// afternoon with a weak model behind it.
//
// WHAT IT DECIDES
//
//   Which requests the message contains          from ./requests.mjs
//   How urgent each one is                       from ./acuity.mjs
//   Which one the card is about                  the highest-acuity item the
//                                                band has not already answered
//   What has to be said above the card           the band
//   What has to be listed beside it              the unresolved items panel
//
// WHY THE CARD IS NOT SIMPLY THE MOST URGENT ITEM. The band IS the answer to
// the most urgent item — it names what was seen and sends it to the duty doctor
// today, which is the entire correct response to a red flag or an NG12 feature.
// Answering it twice, once as a band and again as a card, would bury the other
// four requests under two copies of the same sentence. So the band takes the
// top of the list and the card takes the most urgent thing left. Neither of
// them is ever the first item, or the longest one, or the one the model found
// most interesting.
//
// WHAT IT REFUSES TO DECIDE. Whether the patient has cancer, whether the pain
// is serious, whether the referral is warranted. It reports that named words
// were written down and who they go to. Everything past that is a clinician's.
import { classifyRequest, moreUrgent, rankOf } from './acuity.mjs';
import { scanConfidentiality } from './confidentiality.mjs';
import { readAge, scanNg12 } from './ng12.mjs';
import { scanRedFlags } from './redflags.mjs';
import { normaliseRequests, wholeMessage } from './requests.mjs';
import { spanWithin } from './spans.mjs';

// A preference is not an unresolved clinical item. "Could it be an evening
// appointment" belongs in the booking, not in a panel of things that still need
// somebody's attention — and a panel with one of those on it is a panel that
// gets ignored on the day one of the other four is a two-week wait.
const PREFERENCE = /\b(?:evening|morning|afternoon|after work|before work|weekend|saturday|sunday|lunchtime|earliest|any ?time|whenever|convenient|suits? me|prefer\w*|if possible)\b/i;

// A real job, as opposed to a preference about when one happens.
const REAL_JOB = /(?:\bfit note\b|\bsick note\b|\bprescription\b|\brepeat\b|\bmedication\b|\bletter\b|\bform\b|\bresults?\b|\breferral\b|\bregister\b|\bregistration\b|\bcancel\b|\bscan\b|\btest\b)/i;

/** Is this item worth a line in the panel at all? */
function isTrivia(item, acuity) {
  if (rankOf(acuity) > rankOf('routine')) return false;
  if (REAL_JOB.test(item.text)) return false;
  return PREFERENCE.test(item.text) && !/\b(?:pain|ache|sore|unwell|worse|symptom)/i.test(item.text);
}

/**
 * Scan one message.
 *
 * `requests` is what the model returned when the message looked multi-intent,
 * and is allowed to be empty or missing — a message that was never decomposed
 * is treated as one request covering all of it, which keeps every caller on one
 * shape and keeps short questions behaving exactly as they did before any of
 * this existed.
 */
export function safetyScan({ message = '', requests = [] } = {}) {
  const text = String(message || '');
  const { items: given, dropped } = normaliseRequests(requests, text);
  const decomposed = given.length > 1;
  const subjects = given.length ? given : wholeMessage(text);

  // MESSAGE-WIDE, ALWAYS, WHATEVER WAS ROUTED. These run over everything the
  // patient wrote, including the paragraphs no card will mention.
  const wide = [...scanRedFlags(text), ...scanNg12(text)];
  const thirdParty = scanConfidentiality(text);
  const age = readAge(text);

  // Each item, ranked, with the rules that fired inside its own span.
  const scored = subjects.map((item) => {
    const { acuity, findings } = classifyRequest(item.text);
    return {
      ...item,
      acuity,
      findings,
      thirdParty: thirdParty.some((f) => spanWithin(f.match, item.text)),
      trivia: isTrivia(item, acuity),
    };
  });

  // A message-wide finding belongs to whichever request contains the words that
  // matched. One that belongs to none of them — because the decomposition
  // missed that sentence — keeps an empty itemId and is still shown. That is
  // the failure mode this whole design exists for, so it must not be the one
  // that goes quiet.
  const findings = wide.concat(thirdParty).map((f) => ({
    ...f,
    itemId: (scored.find((item) => !item.whole && spanWithin(f.match, item.text)) || {}).id || '',
  }));

  return rescore({
    decomposed,
    age,
    items: scored,
    findings,
    thirdParty: findings.filter((f) => f.kind === 'confidentiality'),
    dropped,
    trivia: scored.filter((item) => item.trivia).length,
    rules: findings.map((f) => ({ id: f.ruleId, kind: f.kind, span: f.span, itemId: f.itemId })),
  });
}

/**
 * Work out what happened to each item, and which one the card is about.
 *
 * Split out from the scan itself because it runs TWICE on a /triage: once on
 * the deterministic floor, and again after the second pass has had a chance to
 * raise something (see ./triage-pass.mjs). It reads only `acuity` and
 * `thirdParty`, so it does not care which of the two set them — which is what
 * makes the veto in that file the only place acuity can move.
 */
export function rescore(scan) {
  const s = scan || {};
  const items = s.items || [];
  const listed = items.filter((item) => !item.trivia);
  const escalated = listed.filter((item) => rankOf(item.acuity) >= rankOf('twoWeekWait'));
  const remaining = listed.filter((item) => rankOf(item.acuity) < rankOf('twoWeekWait'));

  // The card's subject. Highest acuity first, and among equals the one written
  // first — the reader's own order is the only tie-break that is not arbitrary.
  // The band answers the escalated items, so the card takes the most urgent
  // thing the band has not already dealt with; when everything is escalated it
  // takes the top of the list rather than showing no card at all.
  const pool = remaining.length ? remaining : listed;
  const routed = pool.reduce(
    (best, item) => (best && !moreUrgent(item.acuity, best.acuity) ? best : item),
    null,
  ) || null;

  for (const item of items) {
    item.status = item.thirdParty ? 'refused'
      : rankOf(item.acuity) >= rankOf('twoWeekWait') ? 'flagged'
        : (routed && item.id === routed.id) ? 'routed'
          : 'unhandled';
  }

  return {
    ...s,
    items,
    listed,
    escalated,
    routed,
    // The span the card's assertions have to come from. Empty unless the
    // message genuinely split into more than one request: with one complaint
    // there is nothing to narrow to, and narrowing to the whole message is a
    // no-op that would only risk behaving differently.
    complaint: s.decomposed && routed && routed.verbatim && !routed.whole ? routed.text : '',
  };
}

/**
 * The findings that have to be said ABOVE the card, because the card does not
 * say them.
 *
 * `cardScans` is true when the card that will render runs the deterministic
 * triage net over its own text — the triage, FCP, Pharmacy First and minor eye
 * cards all do. When it does, a finding inside the routed complaint is already
 * that card's business and repeating it is noise. When it does not — a Notebook
 * page, a referral card, a filing title — nothing else in the turn will mention
 * it, so everything goes on the band.
 *
 * Confidentiality findings are never suppressed. No card refuses a request
 * about somebody else's record, so there is nothing for the band to duplicate.
 */
export function bandFindings(scan, { cardScans = false } = {}) {
  const s = scan || {};
  const routedText = cardScans && s.routed ? s.routed.text : '';
  const acuity = (s.findings || [])
    .filter((f) => f.kind === 'redFlag' || f.kind === 'ng12')
    .filter((f) => !(routedText && spanWithin(f.match, routedText)));
  return {
    acuity,
    confidentiality: (s.findings || []).filter((f) => f.kind === 'confidentiality'),
  };
}
