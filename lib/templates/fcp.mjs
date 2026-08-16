// First Contact Physiotherapist (FCP) and musculoskeletal triage.
//
// WHY THIS FILE EXISTS
//
// A patient wrote in describing five days of severe lower back pain radiating
// into one leg, with tingling and numbness in the thigh, no relief from
// maximum-dose ibuprofen, unable to sleep or walk normally, asking to be seen
// by a First Contact Physiotherapist. The assistant answered with a Pharmacy
// First card: "Back pain / musculoskeletal pain — minor illness referral, free
// medicines for eligible patients".
//
// It did that because "lower back pain" is on the Pharmacy First minor illness
// list and "back or musculoskeletal pain" is one of the 24 CPSAS conditions, so
// the substring matched and nothing downstream disagreed. The list is right —
// simple backache IS a pharmacy job — but the list is written for simple
// backache, and matching on the body part alone cannot tell simple backache
// from nerve-root pain that has already failed everything a pharmacy sells.
//
// So the region is no longer the decision. The FEATURES are:
//
//   cauda equina      never anywhere but a clinician, today. Checked first.
//   nerve root        pain radiating into a limb, pins and needles, numbness,
//                     weakness. An assessment, not an over-the-counter medicine.
//   self-care failed  already taken the maximum dose and it did not touch it.
//                     A pharmacy has nothing left to offer.
//   severe            not sleeping, not walking, not working.
//   asked for it      the patient or the staff member named physio, FCP or MSK.
//
// Any one of those and it is an FCP appointment, not a pharmacy referral.
// None of them and simple back pain still goes to the pharmacy, with the FCP
// named as the next step if self-care does not settle it.
//
// The booking steps, the under-16 rule and the follow-up route are the
// practice's own, from the Notebook pages named in `source` at the bottom of
// each card. The red-flag checklist is escalation, not a pathway: it says who to
// pass it to, never what is wrong with the patient.
//
// EVERY FEATURE NOW CARRIES THE WORDS THAT PROVED IT. See `spans` below and
// `localFeatures` underneath it. A card wrote "Over-the-counter treatment has
// already been tried and has not worked" about a knee, on the strength of the
// words "hasn't shifted" — which, four paragraphs later in the same message,
// described the patient's VOICE. The pattern was right and the reach was wrong,
// and a boolean cannot tell you where it came from. A span can.
import { answer, bullets, expand, field, fields, note, steps } from './blocks.mjs';
import { matchPresence, matchSpan, spanWithin } from '../safety/spans.mjs';

/* ------------------------------------------------------------- the matching */

// Is this a musculoskeletal problem at all? Body region plus the words people
// use for the service itself, because "can she see the physio" names no region.
//
// "disc" is spelled out rather than matched loosely: a bare \bdisc would also
// catch "discharge", and a sticky eye is not a back problem.
const NAMED_REGION = [
  'back pain', 'backache', 'back ache', 'lower back', 'low back', 'lumbar', 'spine', 'spinal',
  'slipped disc', 'prolapsed disc', 'disc prolapse', 'herniated disc',
  'sciatica', 'sciatic',
  'neck pain', 'whiplash',
  'shoulder', 'elbow', 'wrist', 'hand pain', 'finger pain',
  'hip pain', 'thigh', 'buttock', 'hamstring',
  'knee', 'calf', 'shin', 'ankle', 'achilles', 'heel', 'foot pain', 'toe pain',
  'joint pain', 'joints',
  'muscle (?:pain|strain|ache|injury)', 'strain\\w*', 'sprain\\w*', 'tendon\\w*', 'tendin\\w+',
  'musculoskeletal', 'msk',
  'physio\\w*', 'fcp', 'first contact (?:physio\\w*|practitioner)', 'extended scope',
];

// THE LIST ABOVE IS WRITTEN IN THE WORD "PAIN", AND PATIENTS ARE NOT.
//
// A patient wrote in five days after coming off their bike: "my ribs and hands
// are still hurting", swelling going down, ice and a hand wrap tried, asking
// whether they needed further investigation. Nothing above matched a word of
// it. "ribs" is not on the list at all, and "hands are still hurting" misses
// because the list carries "hand pain" — the part and the word "pain", welded
// together. So a textbook musculoskeletal injury was not musculoskeletal as far
// as this file was concerned, and it fell all the way through to the card that
// says "not on a pharmacy list, ask the duty doctor".
//
// The parts and the symptoms are therefore matched SEPARATELY and read next to
// each other. That is what lets "hurting", "sore", "swollen" and "bruised" mean
// what "pain" means, without writing out the cross product by hand.
const PARTS = [
  'neck', 'shoulders?', 'arms?', 'elbows?', 'wrists?', 'hands?', 'fingers?', 'thumbs?',
  'ribs?', 'rib ?cage', 'chest wall', 'collar ?bones?', 'clavicle',
  'hips?', 'thighs?', 'buttocks?', 'hamstrings?',
  // "leg" was missing, and its absence was doing real damage: a message about a
  // swollen, numb leg was recognised as musculoskeletal only because the
  // patient mentioned rotating their ANKLE as one of the things they had
  // tried. Routing that depends on a word from the self-care paragraph is
  // routing that works by accident.
  'legs?', 'knees?', 'calf', 'calves', 'shins?', 'ankles?', 'achilles', 'heels?', 'foot', 'feet', 'toes?',
  'joints?', 'muscles?', 'tendons?', 'ligaments?', 'bones?', 'limbs?',
];

// What a part is DOING when the problem is musculoskeletal. Deliberately wider
// than "pain", and deliberately not a diagnosis: every one of these is a word
// the patient themselves would write.
const HURTING = [
  'pain\\w*', 'hurt\\w*', 'ach(?:e|es|ing|y)', 'sore\\w*', 'stiff\\w*',
  'swell\\w+', 'swollen', 'bruis\\w+', 'tender\\w*', 'throbb?\\w*',
  'injur\\w+', 'strain\\w*', 'sprain\\w*', 'twisted', 'jarred',
  'broken', 'broke', 'fractur\\w+', 'dislocat\\w+',
  'stuck', 'seized', 'locked',
];

// A part and a symptom, in either order, WITHIN ONE SENTENCE. The [^.!?] is
// what stops "sore throat. Please ring my mobile back" reading as a bad back —
// the same sentence bound the cauda equina patterns already rely on.
//
// Bare "back" is deliberately NOT a part. It is a direction, a telephone
// instruction and half of "back passage" before it is a body part, and every
// real use of it is already spelled out in NAMED_REGION above.
const near = (a, b) => `(?:${a})[^.!?]{0,30}(?:${b})`;
const PART = PARTS.join('|');
const SYMPTOM = HURTING.join('|');

export const MSK_REGION = new RegExp('\\b(?:' + [
  ...NAMED_REGION,
  near(PART, SYMPTOM),
  near(SYMPTOM, PART),
].join('|') + ')', 'i');

// HOW IT HAPPENED. A mechanism of injury — a fall, a twist, a tackle — is not
// on its own a reason to send anybody anywhere, and it does NOT make a message
// musculoskeletal: "fell off my bike and my head hurts" names no part on the
// list above and must not become a physio appointment. It is read so the card
// can say why it is being sent, and so a recent injury gets the one caution
// that a long-standing ache does not need.
export const MSK_INJURY = new RegExp([
  'fell (?:off|from|down|over|awkwardly)',
  'fall (?:off|from|down)',
  'had a fall', 'have fallen', 'has fallen',
  'came off (?:my|his|her|their|the) (?:bike|bicycle|horse|scooter|motorbike|ladder)',
  'knocked off (?:my|his|her|their|the) (?:bike|bicycle)',
  'thrown (?:off|from)',
  'tripped', 'slipped (?:and|over|on)',
  'landed (?:on|awkwardly|badly)',
  'twisted (?:my|his|her|their|the)',
  'car (?:accident|crash)', 'road traffic (?:accident|collision)', '\\brta\\b',
  'playing (?:football|rugby|netball|tennis|squash|badminton|hockey|cricket|basketball)',
  'tackled?', 'sports injury', 'at the gym',
  'lifting (?:something|a|the|heavy)', 'heavy lifting',
].join('|'), 'i');

// Nerve-root involvement. Pain that has left the back and gone into a limb, or
// any change in sensation or power, is an assessment question rather than an
// analgesia question, and a pharmacist cannot answer it.
export const NERVE_ROOT = new RegExp('\\b(?:' + [
  'sciatica', 'sciatic',
  'radiat\\w+',
  'travel(?:s|ling|led)? (?:down|into|through)',
  'shoot\\w+ (?:down|into|through)',
  'run(?:s|ning)? down (?:my|their|the|his|her)',
  'down (?:my|their|the|his|her|one) (?:left |right |)(?:leg|arm|buttock|thigh|calf)',
  'pins and needles',
  'tingl\\w+', 'numb\\w*', 'loss of sensation', 'altered sensation',
  'weakness', 'weak (?:leg|arm|grip)', 'foot drop', 'giving way', 'dragging (?:my|their|the) (?:leg|foot)',
  'trapped nerve', 'pinched nerve', 'irritated nerve',
  'nerve (?:pain|root|irritat\\w+|compress\\w+|damage)',
  'nerve',
].join('|') + ')', 'i');

// CAUDA EQUINA. This is the one that must never be triaged by a list.
//
// Deliberately matched on the SYMPTOMS rather than the name, because a patient
// writing in has no reason to know the name, and a card that only recognises
// "cauda equina" would recognise it only from someone who had already been told.
export const CAUDA_EQUINA = new RegExp([
  'cauda equina',
  'saddle (?:an(?:a)?esthesia|an(?:a)?esthetic|numbness|area|region)',
  'numb\\w*[^.!?]{0,40}(?:groin|genital\\w*|buttock\\w*|perineum|inner thigh|back passage|anus|saddle|bottom)',
  '(?:groin|genital\\w*|perineum|back passage|anus|saddle)[^.!?]{0,40}numb\\w*',
  'bladder[^.!?]{0,30}(?:control|retention|incontinen\\w+|not empty\\w*|cannot|can\'?t|problem)',
  'bowel[^.!?]{0,30}(?:control|incontinen\\w+|accident\\w*|problem)',
  '(?:cannot|can\'?t|could ?n[o\']t|unable to|struggling to|difficulty)[^.!?]{0,25}(?:pass\\w*|empty\\w*|hold\\w*|feel\\w*)[^.!?]{0,20}(?:urine|water|wee|bladder|bowel|poo)',
  'incontinen\\w+',
  'wetting (?:myself|themselves|himself|herself|the bed)',
  'soiling (?:myself|themselves|himself|herself)',
  'both legs?[^.!?]{0,30}(?:numb\\w*|weak\\w*|giving way|tingl\\w*|pins and needles)',
  '(?:numb\\w*|weak\\w*|tingl\\w*|pins and needles)[^.!?]{0,30}both legs?',
  'bilateral (?:leg|sciatica|symptoms)',
  'loss of (?:bladder|bowel|sexual) (?:control|function|sensation)',
].join('|'), 'i');

// Over-the-counter treatment has already been tried and has already failed.
// This is the feature that most often decides it: everything a Pharmacy First
// referral can offer is a medicine the patient has been taking since the day
// after it started.
// EVERY ALTERNATIVE IS WORD-BOUNDED, and that is not tidiness.
//
// It was not, and "I don't know if that changes anything" matched: the bare
// "no" found the one inside "k-no-w", and "change" sat 25 characters later. A
// patient wondering aloud whether something mattered was read as self-care that
// had failed — which, with "pharmacy" matched out of "antibiotics from the
// pharmacy", put "over-the-counter treatment has already been tried and has not
// worked" on a card about an infection nobody had treated yet.
export const SELFCARE_FAILED = new RegExp([
  '\\bmax(?:imum)?\\b[^.!?]{0,25}\\bdose\\b',
  '\\b(?:no|without|little|not much|barely any|hardly any)\\b[^.!?]{0,25}\\b(?:relief|improvement|better|help\\w*|effect|difference|change)\\b',
  '\\b(?:neither|nothing|none of (?:it|them|these|those))\\b[^.!?]{0,30}\\b(?:help\\w*|work\\w*|touch\\w*|relief|difference)\\b',
  '\\b(?:did|has|have|does|do)\\s?n[o\']?t\\b[^.!?]{0,25}\\b(?:help\\w*|work\\w*|touch\\w*|shift\\w*)\\b',
  '\\bnot (?:helping|working|touching|shifting)\\b',
  '\\balready (?:tried|taken|taking|been taking|on)\\b',
  '\\btried\\b[^.!?]{0,80}\\b(?:ibuprofen|paracetamol|naproxen|codeine|co-?codamol|nurofen|voltarol|diclofenac|deep heat|heat patch\\w*|ice|stretch\\w*)\\b',
  '\\bstill (?:in|got|have|having|getting)\\b[^.!?]{0,20}\\bpain\\b',
  '\\bgetting worse\\b', '\\bgot worse\\b', '\\bworsen\\w*', '\\bno better\\b', '\\bnot improv\\w+',
].join('|'), 'i');

// TREATMENT THAT WORKED IS NOT TREATMENT THAT FAILED.
//
// The same patient wrote that a pharmacist had treated this in March and "it
// sorted it in two days, so I'd just like the same again". That is a service
// working, and a reason to use it again — the exact opposite of the claim that
// "self-care has failed" is used to make. A previous episode that resolved says
// nothing about this one, and reading it as failure closes the door on every
// patient whose treatment succeeded last time.
//
// So a clause that says it worked cancels the failure claim sitting in it. Kept
// narrow on purpose, and clause-bounded, so "it worked for a bit but it is back"
// keeps its failure.
export const TREATMENT_WORKED = new RegExp([
  '\\b(?:sorted|cleared|settled|fixed|resolved|cured)\\b',
  '\\b(?:it|that|they|antibiotics?|drops|cream|tablets?)\\s+(?:really\\s+)?(?:worked|helped|did the trick)\\b',
  '\\bworked (?:well|a treat|straight away|last time|fine|in \\w+ days?)\\b',
].join('|'), 'i');

// Severity and loss of function. A pharmacy referral is for something a
// medicine from a shelf can settle, and none of these describe that.
export const SEVERE_IMPACT = new RegExp([
  '\\b(?:severe|unbearable|excruciating|agonis\\w+|agony|debilitat\\w+|crippl\\w+)\\b',
  '(?:cannot|can\'?t|could ?n[o\']?t|unable to|struggling to|difficulty)[^.!?]{0,20}(?:walk\\w*|mov\\w+|sleep\\w*|stand\\w*|sit\\w*|bend\\w*|work\\w*|drive\\w*)',
  'prevent\\w*[^.!?]{0,25}sleep\\w*',
  '(?:not|barely|hardly)[^.!?]{0,15}sleep\\w*',
  'stop\\w*[^.!?]{0,20}(?:sleep\\w*|walk\\w*|work\\w*)',
  'affect\\w*[^.!?]{0,30}(?:walk\\w*|mov\\w+|sleep\\w*|work\\w*)',
  'keeping (?:me|them|him|her)[^.!?]{0,15}(?:up|awake)',
  '\\b(?:off work|signed off|housebound|bed ?bound)\\b',
].join('|'), 'i');

// The service asked for by name.
export const ASKS_FOR_PHYSIO = /\b(?:fcp|first contact (?:physio\w*|practitioner)|physio\w*|extended scope|musculoskeletal (?:assessment|service|team)|msk (?:assessment|service|team|referral))\b/i;

/* ------------------------------------------- what is NOT a physio problem */

// A SWOLLEN, NUMB LIMB IS NOT A JOINT PROBLEM.
//
// A patient wrote in about a leg injured over a year ago that still swells,
// feels numb and is sore, and said they were worried about a DVT. It was
// answered with an FCP appointment.
//
// It got there honestly, which is the alarming part. `msk` matched the word
// "ankle" — out of "I often do exercise like rotating my ankle", their own
// self-care, not their complaint — and NERVE_ROOT matched "numb". needsFcp is
// msk AND nerve root, so it went to the physio.
//
// NERVE_ROOT is right about what it was written for. Numbness down a leg with
// back pain is lumbar nerve root irritation, and an assessment rather than a
// medicine, which is exactly what an FCP is for. But numbness read on its own
// is not evidence of a nerve root: unilateral swelling with loss of sensation,
// a year after an injury, is vascular or neurological territory. It needs
// medical assessment and possibly investigation — bloods, a doppler, a referral
// — before anybody prescribes exercises. An FCP covers joints, muscles and
// tendons, and none of those is what this is.
//
// So swelling is read, and where it sits next to altered sensation, the FCP is
// ruled OUT rather than in. Sciatica keeps its route: back pain radiating into
// a leg with tingling carries no swelling, so nothing below touches it.
export const LIMB_SWELLING = new RegExp([
  'swollen', 'swell\\w+', 'oedema', 'edema', 'puffy', 'puffiness', 'fluid retention',
].join('|'), 'i');

// Altered sensation on its own, kept apart from NERVE_ROOT — which also carries
// radiation and weakness, and those really are the FCP's business.
export const SENSORY_LOSS = new RegExp([
  'numb\\w*',
  '(?:loss|lack|no) of (?:sensation|feeling)',
  'lost (?:all )?(?:sensation|feeling)',
  'altered sensation', 'reduced sensation',
  'pins and needles', 'tingl\\w+',
].join('|'), 'i');

// A clot, a vein or a lymphatic named by anybody — the patient guessing, or a
// letter that already said it. None of it is a physiotherapy problem, and the
// practice does not need the guess to be right for the routing to be.
export const VASCULAR_CONCERN = new RegExp('\\b(?:' + [
  'dvt', 'deep vein thrombosis', 'blood clot', 'clot', 'thrombosis', 'thrombotic', 'thrombus',
  'embolism', 'phlebitis', 'cellulitis',
  'varicose', 'venous', 'vascular', 'circulation',
  'lymphoedema', 'lymphedema', 'lymphatic',
].join('|') + ')', 'i');

// SOMETHING FAILED IS NOT THE SAME CLAIM AS A MEDICINE FAILED.
//
// SELFCARE_FAILED above is deliberately broad, and it should stay broad: it
// decides ROUTING, and routing a problem to the FCP because something did not
// work is the safe direction. But the card writes a SENTENCE off the back of
// it — "Over-the-counter treatment has already been tried and has not worked"
// — and that is a specific claim about a specific thing. "I had physio last
// year and it didn't help" makes the routing right and that sentence wrong.
//
// So the sentence needs its own evidence: a medicine, a shop, a dose. Without
// one the card falls back to its neutral wording, which is the whole point of
// failing toward silence — the reader is told less, never told something the
// patient did not say.
export const OTC_TREATMENT = /\b(?:ibuprofen|paracetamol|naproxen|aspirin|codeine|co.?codamol|nurofen|anadin|panadol|solpadeine|voltarol|diclofenac|deep heat|heat patch\w*|ibuleve|gel|cream|ointment|tablet\w*|painkiller\w*|pain relief|analgesi\w+|over.the.counter|\botc\b|pharmacy|chemist|maximum (?:recommended )?(?:daily )?dose|max(?:imum)? dose)\b/i;

// The features in one place, so reading them and narrowing them cannot drift
// apart. Order is the order they are reported in; it carries no meaning.
// `presence` says which kind of pattern this is, and it decides whether a "no"
// in front of a match cancels it.
//
//   true   the pattern asserts the patient HAS something — a region, swelling,
//          numbness, an injury. "No back pain" is not back pain, so these are
//          matched with matchPresence and a ruled-out mention does not count.
//
//   false  the pattern is written in the negative already. "No relief", "not
//          helping", "nothing worked" is how failed self-care is said, and a
//          negation filter over those would read the "no" that proves the
//          feature as the "no" that cancels it. These keep matchSpan.
//
// caudaEquina is deliberately false. Some of its phrases are negative by
// construction ("cannot pass urine", "not feeling it when they do"), and it is
// the one check in this file that must fail toward firing.
const FEATURES = [
  ['msk', MSK_REGION, { presence: true }],
  ['caudaEquina', CAUDA_EQUINA, { presence: false }],
  ['nerveRoot', NERVE_ROOT, { presence: true }],
  ['selfcareFailed', SELFCARE_FAILED, { presence: false }],
  ['severe', SEVERE_IMPACT, { presence: false }],
  ['asked', ASKS_FOR_PHYSIO, { presence: true }],
  ['otcTreatment', OTC_TREATMENT, { presence: true }],
  ['injury', MSK_INJURY, { presence: true }],
  ['swelling', LIMB_SWELLING, { presence: true }],
  ['sensoryLoss', SENSORY_LOSS, { presence: true }],
  ['vascular', VASCULAR_CONCERN, { presence: true }],
];

// The features that WRITE A SENTENCE ON THE CARD rather than decide where the
// patient goes. Each one is a claim about the complaint the card is about —
// "this has already failed self-care", "this is disabling" — so each has to be
// evidenced from inside that complaint's own text. See `localFeatures`.
//
// `msk` and `caudaEquina` are deliberately NOT here. They are safety checks,
// they run over everything, and they fail toward caution: a spinal emergency
// written in a paragraph about something else is still a spinal emergency.
//
// `swelling`, `sensoryLoss` and `vascular` are not here for the same reason,
// and it is worth being explicit about it because they read like description
// rather than safety. They RULE THE PHYSIO OUT (see needsGpFirst). Narrowing
// them to one complaint could drop the evidence that a limb is swollen and send
// the patient to rehabilitation instead of a doctor, which is the one direction
// this file must never fail in.
export const ASSERTED_FEATURES = ['nerveRoot', 'selfcareFailed', 'severe', 'asked', 'otcTreatment', 'injury'];

/**
 * Read one description for everything that decides where it goes.
 *
 * Every check runs over the WHOLE text, never over a shortened label. The
 * router is allowed to reduce "severe lower back pain radiating into my left
 * leg with numbness, maximum dose ibuprofen not touching it" to "back pain",
 * and every feature above lives in the words it dropped.
 *
 * Alongside each boolean, `spans` holds the words that made it true: the
 * literal match, and the sentence it sits in. Nothing is asserted on a card
 * without one.
 */
export function mskFeatures(text = '') {
  const t = String(text || '');
  const out = { spans: {} };
  for (const [name, pattern, kind] of FEATURES) {
    const hit = (kind && kind.presence) ? matchPresence(t, pattern) : matchSpan(t, pattern);
    out[name] = !!hit;
    out.spans[name] = hit;
  }

  // A CLAIM THAT SELF-CARE FAILED IS DROPPED WHEN THE SAME CLAUSE SAYS IT
  // WORKED. See TREATMENT_WORKED: a course that sorted it in two days is a
  // service working, and the patient asking for it again is asking for the
  // service that helped — not telling us it has nothing left to offer.
  if (out.selfcareFailed && out.spans.selfcareFailed && TREATMENT_WORKED.test(out.spans.selfcareFailed.span)) {
    out.selfcareFailed = false;
    out.spans.selfcareFailed = null;
  }

  return derived(out);
}

// The one feature made of two others: over-the-counter treatment was tried AND
// it failed. Recomputed after any narrowing, because dropping either half has
// to drop the sentence they hold up between them.
function derived(features) {
  return { ...features, otcTried: !!(features.selfcareFailed && features.otcTreatment) };
}

/**
 * The same features, with every ASSERTION whose evidence lies outside this
 * complaint dropped.
 *
 * `complaint` is the verbatim span of the one request the card is about. An
 * empty complaint means there is nothing to narrow to — a message that was
 * never decomposed is one complaint, and the features stand as they are.
 *
 * FAILS TOWARD SILENCE. A feature whose span is not inside the complaint is not
 * "probably fine", it is unevidenced, and the card falls back to its neutral
 * wording rather than saying something nobody wrote.
 */
export function localFeatures(features, complaint = '') {
  const f = features || {};
  const within = String(complaint || '').trim();
  if (!within) return f;
  const out = { ...f, spans: { ...(f.spans || {}) } };
  for (const name of ASSERTED_FEATURES) {
    const hit = out.spans[name];
    if (out[name] && !(hit && spanWithin(hit.match, within))) {
      out[name] = false;
      out.spans[name] = null;
    }
  }
  return derived(out);
}

/**
 * Does this musculoskeletal problem need the FCP rather than a pharmacy?
 *
 * True on any single escalating feature. Simple, new, untreated backache has
 * none of them and is still a Pharmacy First job.
 *
 * `injury` is NOT one of them, on purpose. "Soft tissue injury" is one of the 24
 * CPSAS conditions and "scratches and grazes" is a listed minor illness, so a
 * mechanism of injury cannot be allowed to jump the pharmacy check — a grazed
 * knee off a bike is a pharmacy job and should stay one. An injury that the
 * pharmacy lists do not cover still reaches the FCP, one step further down in
 * triage.mjs, which is exactly where it should land.
 */
export function needsFcp(features) {
  const f = features || {};
  if (needsGpFirst(f)) return false;
  return !!(f.msk && (f.caudaEquina || f.nerveRoot || f.selfcareFailed || f.severe || f.asked));
}

/**
 * Does this need a doctor BEFORE anybody considers rehabilitation?
 *
 * Two shapes, and both are exclusions from the FCP rather than routes to it:
 *
 *   swelling + altered sensation   a swollen, numb limb is not a joint, a
 *                                  muscle or a tendon. It wants assessing, and
 *                                  probably investigating, first.
 *   a clot or a vein named         by the patient or by a letter. Whether the
 *                                  guess is right is a clinician's question;
 *                                  that it is not a physiotherapy question is
 *                                  not.
 *
 * Checked INSIDE needsFcp as well as ahead of it, so a caller that only knows
 * about needsFcp — lib/templates/pharmacy.mjs is one — cannot route around it.
 */
export function needsGpFirst(features) {
  const f = features || {};
  if (!f.msk || f.caudaEquina) return false;
  return !!((f.swelling && f.sensoryLoss) || f.vascular);
}

/**
 * Cauda equina features, but only in a back or limb context.
 *
 * The bladder and bowel patterns are matched loosely on purpose, because a
 * frightened patient does not use the clinical words. That looseness is safe
 * only next to a musculoskeletal problem: on its own, "urinary incontinence" is
 * a continence referral, not a spinal emergency, and answering it with one
 * would be its own kind of wrong.
 */
export function isSpinalEmergency(features) {
  const f = features || {};
  return !!(f.msk && f.caudaEquina);
}

/* ------------------------------------------------------------- the content */

// From "Physiotherapy (FCP) and Extended Scope Physiotherapy" — the four
// selections, in the order they are made on EMIS.
const BOOK_STEPS = [
  'On EMIS, **Find slot**.',
  '**Find across organisation slot**.',
  'Choose **Hackney Downs PCN**.',
  'Choose **FCP new patient**.',
  'Book the patient in and tell them it is with a **First Contact Physiotherapist**, not a doctor.',
];

// The questions that decide whether this is an FCP appointment or an emergency.
// They are asked, not answered: reception establishes whether the patient has
// them and passes it on, and nothing here interprets the reply.
const CAUDA_EQUINA_CHECKS = [
  'Numbness or pins and needles around the **groin, genitals, buttocks or back passage** (the area that would touch a saddle).',
  '**Loss of bladder control**, or not being able to pass urine, or not feeling it when they do.',
  '**Loss of bowel control**, or not feeling it when they open their bowels.',
  'Numbness, tingling or weakness in **both legs**, or legs giving way.',
  'Numbness or loss of feeling during **sex**.',
];

const FCP_COVERS = [
  'New and ongoing joint, muscle, tendon and back problems in adults',
  'Assessment, diagnosis and a treatment plan without seeing a GP first',
  'Onward referral where imaging, orthopaedics or pain management is needed',
];

const NOT_FCP = [
  '**Anyone under 16** — FCPs are trained and equipped for adult patients only, so book them with a doctor.',
  'Anything with the emergency features listed above.',
  'A problem that is not musculoskeletal, even when it hurts.',
];

const heading = (said) => (said.length > 64 ? said.slice(0, 61).replace(/[\s,;.]+$/, '') + '…' : said);

const FCP_SOURCES = [
  'Physiotherapy (FCP) and Extended Scope Physiotherapy',
  'FCP booking rules',
  'FCP follow-up appointments',
];

/* --------------------------------------------------------------- the cards */

/**
 * A limb that needs a doctor before it needs a physiotherapist.
 *
 * Deliberately says what this is NOT — an FCP appointment — because the whole
 * reason the card exists is that the FCP is where it was going. It names no
 * cause: what a swollen, numb leg turns out to be is a clinical question, and
 * this card's only job is to make sure a clinician is the one asking it.
 */
export function gpAssessmentAnswer({ condition = '', text = '', complaint = '' } = {}) {
  const said = String(condition || '').trim() || 'Limb swelling with altered sensation';
  const full = [said, String(text || '')].filter(Boolean).join('\n');
  const f = localFeatures(mskFeatures(full), complaint);

  return answer({
    title: heading(said),
    subtitle: 'A doctor first — not the physio',
    destination: 'gp',
    blocks: [
      fields([field('Send it to', 'A GP appointment here', { copy: true })], 'Where this goes'),

      note('An FCP covers joints, muscles and tendons. <mark>Swelling together with numbness or loss of sensation is none of those</mark>, so this is not an FCP appointment — it needs assessing, and possibly investigating, before anybody starts rehabilitation.', 'info'),

      // Reception is booking this, so the only question that changes what they
      // do is how new the swelling is. Asked, never interpreted.
      note('If <mark>one limb has become swollen recently</mark>, or is swollen and painful now, do not book it routinely — pass it to the **duty doctor** today.', 'warn'),

      f.vascular
        ? note('A clot or a circulation problem has been named in this message. Repeat that wording when you pass it on — you are not confirming it, and it is not yours to rule out.', 'warn')
        : null,

      bullets([
        'Book a **GP appointment**, not an FCP new-patient slot.',
        'Put what the patient wrote about the swelling and the numbness in the booking note, in their words.',
        'If a physiotherapist is needed, the GP arranges it after the assessment.',
      ]),
    ],
    source: ['Triage guidelines', ...FCP_SOURCES],
  });
}

/**
 * Back or limb pain with possible cauda equina features.
 *
 * This card refuses to give a destination inside the practice at all beyond
 * "a clinician, now". It is deliberately the shortest card in the system: the
 * only thing anybody needs off it is that this one does not wait.
 */
export function caudaEquinaAnswer({ condition = '' } = {}) {
  const said = String(condition || '').trim() || 'Back pain with bladder, bowel or saddle symptoms';
  return answer({
    title: heading(said),
    subtitle: 'Emergency — not the pharmacy, not the physio',
    destination: 'emergency',
    blocks: [
      fields([field('Send it to', 'The duty doctor, now')], 'Where this goes'),
      note('Back pain with <mark>bladder or bowel changes, numbness around the groin or back passage, or symptoms in both legs</mark> is an emergency. Do not book it with the FCP and do not refer it to a pharmacy.', 'critical'),
      bullets([
        'Interrupt the **duty doctor** now. Do not put this in a task queue and do not wait for a callback slot.',
        'If you cannot reach a duty clinician immediately, send the patient to **A&E**.',
        'If the patient is acutely unwell or collapsing, call **999** and stay with them.',
      ]),
      note('Say what the patient reported, in their words. Do not reassure them and do not tell them it is probably nothing.', 'warn'),
    ],
    source: ['Triage guidelines — pharmacy requests and blood forms', ...FCP_SOURCES],
  });
}

/**
 * The FCP card.
 *
 * `condition` is what the problem is called; `text` is everything the patient or
 * the staff member actually wrote. Matching runs over both, so a feature the
 * router summarised away still decides the answer.
 *
 * `complaint` is the verbatim span of the single request this card is about,
 * when the message carried more than one. Given it, every sentence the card
 * would otherwise write about self-care, severity or nerve-root symptoms has to
 * be evidenced from inside that span — the cauda equina check is deliberately
 * left alone and still runs over everything.
 */
export function fcpAnswer({ condition = '', text = '', complaint = '' } = {}) {
  const said = String(condition || '').trim();
  const full = [said, String(text || '')].filter(Boolean).join('\n');
  const f = localFeatures(mskFeatures(full), complaint);

  if (f.caudaEquina) return caudaEquinaAnswer({ condition: said });

  // The router can choose "fcp" straight off the message, so the exclusion
  // cannot live only in triage.mjs — the same argument the pharmacy card makes
  // for guarding itself against sciatica.
  if (needsGpFirst(f)) return gpAssessmentAnswer({ condition: said, text, complaint });

  const why = f.nerveRoot
    ? 'Pain travelling into a limb, with tingling, numbness or weakness, needs assessing rather than medicating. That is what the FCP is for.'
    : f.otcTried
      ? 'Over-the-counter treatment has already been tried and has not worked, so a Pharmacy First referral has nothing left to offer.'
      : f.severe
        ? 'Pain this disabling is not a self-care problem, so it does not go to a pharmacy.'
        : f.injury
          ? 'An injury that is still painful days later is an assessment question rather than a medicine question, and the FCP can arrange imaging if it needs it.'
          : 'A musculoskeletal problem in an adult goes to the FCP rather than to a GP appointment.';

  return answer({
    title: said ? heading(said) : 'Musculoskeletal problem',
    subtitle: 'First Contact Physiotherapist (FCP)',
    destination: 'fcp',
    blocks: [
      fields([
        field('Send it to', 'First Contact Physiotherapist (FCP)', { copy: true }),
        field('Route', 'FCP new patient slot, Hackney Downs PCN'),
        field('Age', '16 and over only'),
      ], 'Where this goes'),

      note(why, 'info'),

      // Before the booking steps, never after them. A checklist underneath the
      // thing it is meant to stop is a checklist nobody reads.
      note('<mark>Ask these before you book.</mark> Any one of them and this is not an FCP appointment — it is an emergency.', 'critical'),
      bullets(CAUDA_EQUINA_CHECKS),

      // A recent injury is the one FCP presentation with a same-day question
      // sitting under it. Like the checklist above, this says who to pass it to
      // and never what is wrong with the patient.
      f.injury
        ? note('This is a **recent injury**. If the patient cannot use the limb or put weight on it, if it looks out of shape, or if the pain is getting worse rather than better, do not book an FCP appointment — pass it to the **duty doctor** the same day.', 'warn')
        : null,

      steps(BOOK_STEPS),

      note('**Nobody under 16 goes to an FCP.** FCPs are trained and equipped for adult patients only.', 'critical'),

      // Reception is being asked about painkillers. This is the one thing on the
      // card that must not be answered here, so it says who answers it.
      f.selfcareFailed || f.severe
        ? note('If the patient is asking what else they can take for the pain, that is a **clinical decision, not a booking one**. Pass the analgesia question to the **duty doctor** or the **practice pharmacist** the same day. Do not advise on pain relief yourself, and do not tell them to keep taking what has already failed.', 'warn')
        : null,

      f.nerveRoot
        ? note('Tell the FCP, in the booking note, that the pain travels into the limb and there is altered sensation. It changes how soon they want to see them.', 'info')
        : null,

      expand('Follow-up appointments', [
        bullets([
          'A patient who has already seen an FCP and wants to be seen again does **not** get booked into a new-patient slot.',
          'Send a **task to the FCP group** on EMIS saying the patient needs a follow-up. The FCP team manage their own follow-ups.',
        ]),
      ]),

      expand('What the FCP is for', [
        bullets(FCP_COVERS),
        bullets(NOT_FCP, 'What does not go to an FCP'),
      ]),
    ],
    source: FCP_SOURCES,
  });
}

/**
 * The one-line signpost that goes on a Pharmacy First card for simple back or
 * joint pain: the pharmacy is right for this today, and the FCP is where it
 * goes if it does not settle. Kept here so the wording lives with the rest of
 * the FCP content rather than being duplicated in the pharmacy template.
 */
export function fcpNextStepNote() {
  return note('If self-care does not settle it, or the pain starts travelling into a limb with tingling, numbness or weakness, it stops being a pharmacy problem: book an **FCP new patient** appointment instead.', 'info');
}
