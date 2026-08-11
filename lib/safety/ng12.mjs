// NICE NG12 — suspected cancer, recognition and referral.
//
// WHAT THIS IS FOR. A patient wrote in about five things. One of them was a
// hoarse voice that had lasted more than three weeks alongside a stone of
// weight loss nobody had tried to lose. That is the pairing NG12 puts on a
// two-week-wait pathway, and it left the building as nothing at all — the
// message had been routed to a knee card and the other four requests were never
// mentioned again.
//
// WHAT THIS IS NOT. It does not diagnose, decide or refer. It says a named
// feature was written down, and it sends that to the duty doctor today. The
// referral decision is a clinician's, always; the only thing being automated is
// noticing.
//
// IT RUNS ON EVERY TURN, OVER THE WHOLE MESSAGE. Not inside triage, where the
// existing red-flag net lives — the failure above never reached triage. A
// question about a fit note with a line about coughing up blood in the middle
// of it gets scanned exactly like a triage does, because the words were written
// either way.
//
// THE KNOWN LIMIT, STATED PLAINLY. These are patterns, and patterns miss
// paraphrase. "My voice sounds rough" does not match "hoarse" and this file
// will not catch it. That is why the unresolved items panel exists and why it
// was built first: it makes a miss VISIBLE — every decomposed request is listed
// whether or not a rule fired on it — rather than silent. Before anybody trusts
// these numbers, build an eval set from the real question_log rows at /stats and
// measure recall on it.
import { matchSpan } from './spans.mjs';

// Up to this much wording is allowed between the two halves of a rule, without
// crossing a sentence boundary. Same device the cauda equina patterns use in
// lib/templates/fcp.mjs: it keeps "hoarse for six weeks" together and keeps
// "hoarse voice. Separately, six weeks ago…" apart.
const NEAR = '[^.!?]{0,120}';

// Three weeks or more, however it is written. NG12's hoarseness threshold is
// three weeks, so anything at or above it counts and anything vaguer than a
// number ("a while", "ages") deliberately does not — a rule that fires on
// "ages" fires on everything.
const THREE_WEEKS = '(?:' + [
  '(?:3|4|5|6|7|8|9|[1-9][0-9])\\s*(?:\\+|plus)?\\s*weeks?',
  '(?:three|four|five|six|seven|eight|nine|ten|eleven|twelve|several|many)\\s*weeks?',
  '(?:over|more than|longer than|at least|around|about|nearly)\\s*(?:a\\s*)?(?:month|3|three|4|four)\\s*(?:weeks?|months?)?',
  '(?:[1-9][0-9]?|a|one|two|three|four|five|six|several|many)\\s*months?',
  'since (?:january|february|march|april|may|june|july|august|september|october|november|december)',
].join('|') + ')';

/**
 * The rules. Each is one NG12 feature, an id that never changes (it is written
 * into the question log as provenance), and the plain sentence the band shows.
 *
 * `label` names what was SEEN, never what it might be. "A hoarse voice lasting
 * three weeks or more" is a fact about the message. Anything beyond that is a
 * clinician's to say.
 */
export const NG12_RULES = [
  {
    id: 'ng12.hoarseness',
    label: 'A hoarse voice lasting three weeks or more',
    pattern: new RegExp(
      '(?:(?:hoarse\\w*|croaky|raspy|husky)' + NEAR + THREE_WEEKS
      + '|' + THREE_WEEKS + NEAR + '(?:hoarse\\w*|croaky|raspy|husky)'
      + '|lost (?:my|their|his|her) voice' + NEAR + THREE_WEEKS + ')', 'i'),
  },
  {
    id: 'ng12.weightLoss',
    label: 'Weight loss that was not intended',
    pattern: new RegExp('(?:'
      + '(?:unintentional\\w*|unintended|unexplained|unplanned|without (?:even )?trying|not (?:been )?trying to)'
        + NEAR + '(?:weight loss|lost weight|losing weight)'
      + '|(?:weight loss|lost weight|losing weight)' + NEAR
        + '(?:unintentional\\w*|unintended|unexplained|unplanned|without (?:even )?trying|not (?:been )?trying|no (?:idea|reason)|for no reason)'
      + '|lost' + NEAR + '(?:[1-9][0-9]?|half a|a|one|two|three)\\s*(?:stone|kgs?|kilos?|kilograms?|pounds?|lbs?)'
      + ')', 'i'),
  },
  {
    id: 'ng12.dysphagia',
    label: 'Difficulty swallowing',
    pattern: new RegExp('(?:'
      + 'dysphagia'
      + '|(?:difficult\\w*|trouble|struggl\\w+|painful|pain)' + NEAR + 'swallow\\w*'
      + '|(?:cannot|can\'?t|could ?n[o\']?t|unable to)' + NEAR + 'swallow\\w*'
      + '|food' + NEAR + '(?:gets? stuck|sticking|sticks)'
      + ')', 'i'),
  },
  {
    id: 'ng12.neckLump',
    label: 'A lump or swelling in the neck',
    pattern: new RegExp('(?:'
      + '(?:neck|throat|thyroid)\\s*(?:lump|swelling|mass)'
      + '|(?:lump|swelling|mass)' + NEAR + '(?:in|on|at)' + NEAR + '(?:my |their |his |her |the )?(?:neck|throat|thyroid)'
      + ')', 'i'),
  },
  {
    id: 'ng12.haemoptysis',
    label: 'Coughing up blood',
    pattern: /(?:haemoptysis|hemoptysis|(?:cough\w*|spitting|bringing)[^.!?]{0,20}up[^.!?]{0,10}blood|blood[^.!?]{0,20}(?:in|on)[^.!?]{0,15}(?:sputum|phlegm|spit|tissue when (?:i|they) cough))/i,
  },
  {
    id: 'ng12.rectalBleeding',
    label: 'Bleeding from the back passage',
    pattern: /(?:rectal bleed\w*|\bpr bleed\w*|bleed\w*[^.!?]{0,25}(?:back passage|rectum|anus|bottom)|blood[^.!?]{0,20}(?:in|on|when)[^.!?]{0,20}(?:stool\w*|poo|faeces|feces|bowel motion|opening (?:my|their) bowels|toilet (?:paper|tissue)))/i,
  },
  {
    id: 'ng12.postMenopausalBleeding',
    label: 'Bleeding after the menopause',
    pattern: new RegExp('(?:post.?menopausal bleed\\w*|bleed\\w*' + NEAR + '(?:after|since|following)' + NEAR + 'menopause)', 'i'),
  },
  {
    id: 'ng12.breastLump',
    label: 'A breast lump or a change to a nipple',
    pattern: new RegExp('(?:'
      + 'breast\\s*(?:lump|mass)'
      + '|(?:lump|mass)' + NEAR + '(?:in|on|under)' + NEAR + '(?:my |their |his |her |the )?(?:breast|armpit)'
      + '|nipple' + NEAR + '(?:discharge|bleeding|inverted|pulled in|changed)'
      + ')', 'i'),
  },
  {
    id: 'ng12.haematuria',
    label: 'Blood in the urine',
    pattern: /(?:visible haematuria|haematuria|hematuria|blood[^.!?]{0,20}(?:in|when)[^.!?]{0,20}(?:urine|wee|pee|water)|(?:urine|wee|pee)[^.!?]{0,20}(?:is |looks |went |gone )(?:red|pink|brown|like blood))/i,
  },
];

// An age stated in the message. NG12's thresholds are age-dependent, so a
// reviewer wants it recorded — but nothing here GATES on it. An age the patient
// did not happen to type must never be the reason a feature went unmentioned,
// and reception knows the patient's date of birth anyway.
const AGE = /\b(?:aged\s+(\d{1,3})\b|(\d{1,3})\s*(?:[- ]?years?[- ]?old|y\.?o\.?\b|yrs?\s*old))/i;

export function readAge(text) {
  const m = AGE.exec(String(text || ''));
  if (!m) return null;
  const age = parseInt(m[1] || m[2], 10);
  return Number.isFinite(age) && age > 0 && age < 130 ? age : null;
}

/**
 * Every NG12 feature written anywhere in the text.
 *
 * Each finding carries the literal words that matched and the sentence they sit
 * in. The first is what locality is tested on; the second is what a person
 * reads on the band and in the log.
 */
export function scanNg12(text) {
  const source = String(text || '');
  if (!source.trim()) return [];
  const found = [];
  for (const rule of NG12_RULES) {
    const hit = matchSpan(source, rule.pattern);
    if (!hit) continue;
    found.push({
      ruleId: rule.id,
      kind: 'ng12',
      acuity: 'twoWeekWait',
      label: rule.label,
      match: hit.match,
      span: hit.span,
      index: hit.index,
    });
  }
  return found.sort((a, b) => a.index - b.index);
}
