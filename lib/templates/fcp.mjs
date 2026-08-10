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
import { answer, bullets, expand, field, fields, note, steps } from './blocks.mjs';

/* ------------------------------------------------------------- the matching */

// Is this a musculoskeletal problem at all? Body region plus the words people
// use for the service itself, because "can she see the physio" names no region.
//
// "disc" is spelled out rather than matched loosely: a bare \bdisc would also
// catch "discharge", and a sticky eye is not a back problem.
export const MSK_REGION = new RegExp('\\b(?:' + [
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
].join('|') + ')', 'i');

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
export const SELFCARE_FAILED = new RegExp([
  'max(?:imum)?[^.!?]{0,25}dose',
  '(?:no|without|little|not much|barely any|hardly any)[^.!?]{0,25}(?:relief|improvement|better|help\\w*|effect|difference|change)',
  '(?:neither|nothing|none of (?:it|them|these|those))[^.!?]{0,30}(?:help\\w*|work\\w*|touch\\w*|relief|difference)',
  '(?:did|has|have|does|do)\\s?n[o\']?t[^.!?]{0,25}(?:help\\w*|work\\w*|touch\\w*|shift\\w*)',
  'not (?:helping|working|touching|shifting)',
  'already (?:tried|taken|taking|been taking|on)',
  'tried[^.!?]{0,80}(?:ibuprofen|paracetamol|naproxen|codeine|co-?codamol|nurofen|voltarol|diclofenac|deep heat|heat patch\\w*|ice|stretch\\w*)',
  'still (?:in|got|have|having|getting)[^.!?]{0,20}pain',
  'getting worse', 'got worse', 'worsen\\w*', 'no better', 'not improv\\w+',
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

/**
 * Read one description for everything that decides where it goes.
 *
 * Every check runs over the WHOLE text, never over a shortened label. The
 * router is allowed to reduce "severe lower back pain radiating into my left
 * leg with numbness, maximum dose ibuprofen not touching it" to "back pain",
 * and every feature above lives in the words it dropped.
 */
export function mskFeatures(text = '') {
  const t = String(text || '');
  const msk = MSK_REGION.test(t);
  return {
    msk,
    caudaEquina: CAUDA_EQUINA.test(t),
    nerveRoot: NERVE_ROOT.test(t),
    selfcareFailed: SELFCARE_FAILED.test(t),
    severe: SEVERE_IMPACT.test(t),
    asked: ASKS_FOR_PHYSIO.test(t),
  };
}

/**
 * Does this musculoskeletal problem need the FCP rather than a pharmacy?
 *
 * True on any single escalating feature. Simple, new, untreated backache has
 * none of them and is still a Pharmacy First job.
 */
export function needsFcp(features) {
  const f = features || {};
  return !!(f.msk && (f.caudaEquina || f.nerveRoot || f.selfcareFailed || f.severe || f.asked));
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
 */
export function fcpAnswer({ condition = '', text = '' } = {}) {
  const said = String(condition || '').trim();
  const full = [said, String(text || '')].filter(Boolean).join('\n');
  const f = mskFeatures(full);

  if (f.caudaEquina) return caudaEquinaAnswer({ condition: said });

  const why = f.nerveRoot
    ? 'Pain travelling into a limb, with tingling, numbness or weakness, needs assessing rather than medicating. That is what the FCP is for.'
    : f.selfcareFailed
      ? 'Over-the-counter treatment has already been tried and has not worked, so a Pharmacy First referral has nothing left to offer.'
      : f.severe
        ? 'Pain this disabling is not a self-care problem, so it does not go to a pharmacy.'
        : 'A musculoskeletal problem in an adult goes to the FCP rather than to a GP appointment.';

  return answer({
    title: said ? heading(said) : 'Musculoskeletal problem',
    subtitle: 'First Contact Physiotherapist (FCP)',
    blocks: [
      fields([
        field('Send it to', 'First Contact Physiotherapist (FCP)'),
        field('Route', 'FCP new patient slot, Hackney Downs PCN'),
        field('Age', '16 and over only'),
      ], 'Where this goes'),

      note(why, 'info'),

      // Before the booking steps, never after them. A checklist underneath the
      // thing it is meant to stop is a checklist nobody reads.
      note('<mark>Ask these before you book.</mark> Any one of them and this is not an FCP appointment — it is an emergency.', 'critical'),
      bullets(CAUDA_EQUINA_CHECKS),

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
