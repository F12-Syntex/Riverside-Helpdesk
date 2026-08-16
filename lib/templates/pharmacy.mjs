// Pharmacy First and the NEL Community Pharmacy Selfcare Advice Service.
//
// This is a triage answer, not a referral one: the question behind it is "does
// this have to be an appointment at all?", and for a long list of presentations
// the answer is no. Getting it right takes an appointment out of the day;
// getting it wrong sends somebody to a pharmacy that cannot help them.
//
// Three different things are easy to run together and are kept apart here,
// because they have different rules:
//
//   Clinical pathway  one of seven conditions with a national Patient Group
//                     Direction and a strict age range. The pharmacist can
//                     TREAT, not just advise.
//   Minor illness     anything a pharmacist would reasonably see. Advice and
//                     over-the-counter treatment, no age rule.
//   CPSAS             the NEL-funded part: free-of-charge medicines, but only
//                     for 24 named conditions AND only for eligible patients.
//
// Transcribed from "Community Pharmacy Selfcare Advice Service (CPSAS) and
// Pharmacy First — NEL overview" (NHS North East London ICB), which sits in
// rag/sources. The pipeline does not read PDFs, so a document dropped in that
// folder changes no answer on its own; this is what makes it reach anybody.
import { answer, bullets, expand, field, fields, message, note, steps } from './blocks.mjs';
import { fcpAnswer, fcpNextStepNote, mskFeatures, needsFcp } from './fcp.mjs';
import { matchPresence } from '../safety/spans.mjs';
import { mightBePregnant, sendTo } from '../triage/destinations.mjs';

// The seven with a Patient Group Direction. The age range IS the gateway: a
// 65-year-old woman with a UTI is not on this pathway, and sending her is how
// somebody gets turned away at the counter.
export const CLINICAL_PATHWAYS = [
  { name: 'Uncomplicated UTI', age: 'Women 16 to 64 years', aliases: ['uti', 'urine infection', 'urinary tract infection', 'cystitis'] },
  { name: 'Shingles', age: '18 years and over', aliases: ['shingles', 'herpes zoster'] },
  { name: 'Impetigo', age: '1 year and over', aliases: ['impetigo'] },
  { name: 'Infected insect bites', age: '1 year and over', aliases: ['insect bite', 'infected bite', 'sting'] },
  { name: 'Sinusitis', age: '12 years and over', aliases: ['sinusitis', 'sinus'] },
  { name: 'Sore throat', age: '5 years and over', aliases: ['sore throat', 'tonsillitis', 'throat'] },
  { name: 'Acute otitis media', age: '1 to 17 years', aliases: ['otitis media', 'ear infection', 'earache'] },
];

// The 24 that carry free-of-charge medicines under CPSAS.
export const CPSAS_CONDITIONS = [
  "Athlete's foot", 'Insect bites and stings', 'Back pain / musculoskeletal pain', 'Nappy rash',
  'Conjunctivitis', 'Paediatric fever / teething / pain', 'Constipation', 'Primary dysmenorrhoea (period pain)',
  'Contact dermatitis', 'Ringworm', 'Diarrhoea', 'Scabies', 'Fever (pyrexia)', 'Soft tissue injury',
  'Haemorrhoids', 'Oral thrush', 'Hay fever', 'Threadworm', 'Headache', 'Toothache', 'Head lice',
  'Vaginal thrush', 'Indigestion / heartburn', 'Warts and verrucae',
];

// Examples of what can go as a plain minor illness referral. Explicitly not
// exhaustive in the source, and not treated as exhaustive here.
export const MINOR_ILLNESS = [
  'Acne, spots and pimples', 'Allergic reaction', 'Ankle or foot pain or swelling', "Athlete's foot",
  'Bites or stings', 'Blisters', 'Constipation', 'Cough', 'Cold and flu', 'Diarrhoea',
  'Ear discharge or ear wax', 'Earache', 'Red eye', 'Sticky or watery eye', 'Eyelid problems', 'Hair loss',
  'Headache', 'Hearing problems or blocked ear', 'Hip, thigh or buttock pain or swelling',
  'Knee or lower leg pain', 'Lower back pain', 'Lower limb pain, swelling or itch', 'Mouth ulcers',
  'Nasal congestion', 'Pain or frequency passing urine', 'Rectal pain', 'Scabies', 'Scratches and grazes',
  'Shoulder pain', 'Skin blisters or rash', 'Sleep difficulties', 'Sore throat', 'Teething', 'Tiredness',
  'Toe pain or swelling', 'Vaginal discharge', 'Vaginal itch or soreness', 'Vomiting',
  'Wound problems and dressings', 'Wrist, hand or finger pain or swelling',
];

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Does this text mention that condition — and mean it?
 *
 * IT USED TO BE A SUBSTRING TEST, and "no back pain" contains "back pain". A
 * patient listing what she had NOT got put herself on the CPSAS musculoskeletal
 * line, and the card came back "Back pain / musculoskeletal pain — Pharmacy
 * First" about a urinary infection. The lists here are matched loosely on
 * purpose — that is what makes them useful — and loose matching over a message
 * half made of exclusions has to know what an exclusion is.
 *
 * So the phrase is matched as words, in order, with anything between them, and
 * an occurrence the patient ruled out does not count. See
 * lib/safety/negation.mjs.
 */
export function mentionsCondition(haystack, needle) {
  const words = norm(needle).split(' ').filter(Boolean);
  if (!words.length) return false;
  const escaped = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  // Word-bounded at both ends: "sting" must not match "stinging" the way a
  // substring test did, and the separators between words are whatever
  // punctuation the patient typed.
  const pattern = new RegExp('\\b' + escaped.join('[^a-z0-9]{1,3}') + '\\b', 'i');
  return !!matchPresence(String(haystack || ''), pattern);
}

const mentions = mentionsCondition;

/** The clinical pathway a question is about, if it is one of the seven. */
export function findClinicalPathway(query) {
  const text = String(query || '');
  if (!text.trim()) return null;
  let best = null;
  for (const p of CLINICAL_PATHWAYS) {
    for (const name of [p.name, ...p.aliases]) {
      const n = norm(name);
      // Negation-aware, like every other list match here: a pathway the patient
      // ruled out is not the pathway they are on.
      if (mentionsCondition(text, name) && (!best || n.length > best.len)) best = { p, len: n.length };
    }
  }
  return best ? best.p : null;
}

// Longest match wins, not first. "Hay fever" contains "fever", so a first-match
// search over the CPSAS list answered a hay fever question with the pyrexia
// entry — right list, wrong condition, and the reader would never know.
function longestMatch(query, list, key = (c) => c) {
  let best = null;
  for (const item of list) {
    const needle = key(item);
    if (!needle || !mentions(query, needle)) continue;
    if (!best || norm(needle).length > norm(key(best)).length) best = item;
  }
  return best;
}

const cpsasFor = (query) => longestMatch(query, CPSAS_CONDITIONS, (c) => c.split(' / ')[0].replace(/\s*\(.*\)/, ''));
const minorFor = (query) => longestMatch(query, MINOR_ILLNESS, (c) => c.split(/[,(]/)[0]);

// Presentations that must never be answered with "send them to the pharmacy",
// however the question was worded. The router can misread a message and the
// condition lists are matched loosely, so the guard lives here, at the point
// the answer is built, rather than being trusted to either of them.
const RED_FLAGS = /\b(chest pain|short(?:ness)? of breath|breathless|difficulty breathing|stroke|fast test|severe bleed\w*|haemorrhage|collaps\w+|unconscious|anaphyla\w+|sepsis|septic|seizure|fit(?:ting)?|suicid\w+|overdose|head injury|severe abdominal pain|meningitis|non.?blanching)\b/i;

const REFER_STEPS = [
  'On EMIS, refer through **Local Services** (or **PharmRefer**).',
  'Send it to the patient’s local community pharmacy.',
  'Tell the patient which pharmacy it went to, and that the pharmacy will contact them.',
];

const ELIGIBILITY = [
  'Under 16, with at least one parent who would be eligible',
  '16, 17 or 18 and in full-time education, with at least one parent who would be eligible',
  'Any young person under the care of the Local Authority',
  'Care leavers aged 16 to 25',
  'On Universal Credit at a level giving free prescriptions, or any other low-income benefit that does',
  'Homeless, asylum seekers and refugees',
  'Full help under the NHS Low Income Scheme (HC2) — which also covers their partner and young dependants',
];

/**
 * The answer for "can this go to the pharmacy?".
 *
 * `condition` is whatever the reader named; `text` is everything they actually
 * wrote, which the router is allowed to summarise away. Everything is decided
 * from the three tables above before a block is built: which route it takes,
 * whether there is an age gate, and whether the medicines are free.
 *
 * The lists are matched by substring, so they are broad by construction. Two
 * guards run before any of them: the red flags below, and — because "lower back
 * pain" and "back or musculoskeletal pain" are both on the lists while nerve
 * root pain is on neither — the musculoskeletal check in fcp.mjs.
 *
 * `complaint` is the verbatim span of the one request this card is about, when
 * the message carried several. It is handed on to the FCP card so a sentence
 * about self-care cannot be written from a paragraph about something else.
 */
export function pharmacyFirstAnswer({ condition = '', text = '', complaint = '' } = {}) {
  // The router falls back to the whole question when it leaves the condition
  // empty, so the heading is cut while the matching below still runs over all
  // of it. When it DOES name a condition the message itself is still matched,
  // because the words it dropped are where the red flags live.
  const named0 = String(condition || '').trim();
  const full = [named0, String(text || '')].filter(Boolean).join('\n');
  const named = named0.length > 64 ? named0.slice(0, 61).replace(/[\s,;.]+$/, '') + '…' : named0;

  // Checked before anything else. A pharmacy answer for one of these is worse
  // than no answer, and it would look exactly as confident as a correct one.
  // Tested against the FULL text, never the trimmed heading: a red flag past
  // the 64th character is still a red flag.
  if (RED_FLAGS.test(full)) {
    return answer({
      title: `${named} — not for pharmacy`,
      subtitle: 'This needs a clinician',
      blocks: [
        note('This is not a minor illness. Do not refer it to a pharmacy.', 'critical'),
        bullets([
          'Pass it to the **duty doctor** now.',
          'If the patient is acutely unwell, call **999** and stay with them.',
        ]),
      ],
      source: ['Pharmacy First and CPSAS'],
    });
  }

  // MUSCULOSKELETAL, CHECKED BEFORE THE LISTS.
  //
  // "Back pain / musculoskeletal pain" is one of the 24 CPSAS conditions and
  // "lower back pain" is on the minor illness list, so any back problem at all
  // matched here and came back as a minor illness referral with free medicines
  // — including one with pain radiating down a leg, numbness in the thigh, and
  // maximum-dose ibuprofen that had not touched it in five days. The lists are
  // written for simple backache and cannot tell it apart from that, so the
  // features decide instead; see fcp.mjs.
  const msk = mskFeatures(full);
  if (needsFcp(msk)) return fcpAnswer({ condition: named0, text, complaint });

  const pathway = findClinicalPathway(full);

  // A UTI IN SOMEBODY WHO MIGHT BE PREGNANT IS NOT A PHARMACY REFERRAL.
  //
  // The practice's own Pharmacy First page refuses it, and the reason is not
  // administrative: a urinary infection in early pregnancy is managed
  // differently, and the possibility of a pregnancy is itself the thing that
  // needs asking about.
  //
  // MIGHT is the whole point. The patient who prompted this had been told
  // nothing by anybody — she wrote that she and her husband were trying for a
  // baby and her period was five days late — and every routing decision on her
  // card was made as though she had not written it. See mightBePregnant, which
  // reads the possibility rather than a diagnosis, and note what this card does
  // NOT do: it says nothing about whether she is pregnant, because that is not
  // reception's question and not this file's.
  if (pathway && /uti|urin|cystitis/i.test([pathway.name, ...(pathway.aliases || [])].join(' ')) && mightBePregnant(full)) {
    return answer({
      title: `${named || 'Urinary symptoms'} — not for pharmacy`,
      subtitle: 'Possible pregnancy — a clinician decides this one',
      blocks: [
        fields([field('Send it to', sendTo('dutyDoctor'), { copy: true })], 'Where this goes'),
        note('The Pharmacy First UTI pathway <mark>excludes anybody who may be pregnant</mark>, and this message says the patient might be. That is the practice’s own rule, not a judgement about the patient.', 'critical'),
        bullets([
          'Pass it to the **duty doctor** today rather than referring to a pharmacy.',
          'Repeat what the patient wrote, in their words. You are not confirming a pregnancy and it is not yours to rule out.',
          'If they are asking for the same treatment that worked before, put that in the note — it is useful, and it is still the clinician’s decision.',
        ]),
      ],
      source: ['Pharmacy First and CPSAS', 'Triage guidelines'],
    });
  }
  const cpsas = cpsasFor(full);
  const minor = minorFor(full);

  // Nothing named, or nothing matched: the overview, so somebody asking "what
  // can go to pharmacy" gets the lists rather than a shrug.
  if (!named || (!pathway && !cpsas && !minor)) {
    return answer({
      title: named ? `${named} — Pharmacy First` : 'Sending a patient to Pharmacy First',
      subtitle: named ? 'Not on any pharmacy list' : 'What community pharmacy can take',
      blocks: [
        named
          // NOT referred. The minor illness list is not exhaustive, so this may
          // well be a pharmacy job — but "may well be" is a judgement, and
          // printing the referral steps underneath turns a judgement into an
          // instruction. The steps are deliberately absent here.
          ? note(`**${named}** is not one of the seven clinical pathways, the 24 free-medicine conditions, or the listed minor illnesses. That list is not exhaustive, so a pharmacy may still be able to take it — but settle that with the duty doctor rather than referring on the strength of this card.`, 'warn')
          : note('Community pharmacy takes three different kinds of referral, and which one it is decides what the pharmacist can do.', 'info'),
        named ? null : steps(REFER_STEPS),
        expand('The seven clinical pathways, with their age limits', [
          bullets(CLINICAL_PATHWAYS.map((p) => `**${p.name}** — ${p.age}`)),
          note('The age range is the gateway. Outside it the pharmacist cannot treat under the pathway.', 'warn'),
        ]),
        expand('The 24 conditions that come with free medicines (CPSAS)', [bullets(CPSAS_CONDITIONS)]),
        expand('Common minor illness referrals', [
          bullets(MINOR_ILLNESS),
          note('Not exhaustive — a pharmacy can take anything reasonably considered a minor illness.', 'info'),
        ]),
      ],
      source: ['Pharmacy First and CPSAS'],
    });
  }

  const label = pathway ? pathway.name : (cpsas || minor);
  return answer({
    title: `${label} — Pharmacy First`,
    subtitle: pathway ? 'Clinical pathway — the pharmacist can treat' : 'Minor illness referral',
    blocks: [
      fields([
        field('Route', pathway ? 'Pharmacy First clinical pathway' : 'Minor illness referral'),
        pathway ? field('Age range', pathway.age) : null,
        field('Free medicines', cpsas ? 'Yes, for eligible patients (CPSAS)' : 'Not on the CPSAS list'),
      ], 'Send to pharmacy'),

      pathway
        ? note(`The age range is the gateway: **${pathway.age}**. Outside it the pharmacist cannot treat under this pathway, so it stays with us.`, 'critical')
        : null,

      steps(REFER_STEPS),

      // Simple backache is genuinely a pharmacy job, so it still goes there —
      // but the card says where it goes next, so nobody has to come back and
      // ask when the self-care does not work.
      msk.msk ? fcpNextStepNote() : null,

      cpsas
        ? expand('Who gets the medicines free', [
          bullets(ELIGIBILITY),
          note('Walk-in without a GP referral is only for patients who are homeless, asylum seekers or refugees. Everyone else must be referred.', 'warn'),
        ])
        : null,
    ],
    source: ['Pharmacy First and CPSAS'],
  });
}

/* -------------------------------------------------- making the referral */

const PHARMACY_MESSAGE = [
  'We have referred you to your local community pharmacy under Pharmacy First.',
  '',
  'The pharmacist can assess you and, where appropriate, treat you without an appointment here. The pharmacy will contact you.',
  '',
  'If your symptoms get worse before you are seen, please contact us again.',
].join('\n');

/**
 * How the referral itself is made. Kept apart from the "can this go to the
 * pharmacy?" card because they answer different moments — one decides, this one
 * carries it out — and running them together made the deciding card longer than
 * the decision it was there to support.
 */
export function pharmacyReferralAnswer() {
  return answer({
    title: 'Referring to Pharmacy First',
    subtitle: 'Electronically, from EMIS',
    blocks: [
      fields([
        field('Where', 'Local Services on EMIS, or PharmRefer'),
        field('Which pharmacy', "The patient's local community pharmacy"),
      ], 'Send it through'),
      steps([
        'Open the patient record and go to **Local Services** on EMIS (or use **PharmRefer**).',
        'Choose the **Pharmacy First** referral.',
        'Pick the pharmacy the patient wants to use.',
        'Send it, and tell the patient which pharmacy it went to.',
      ]),
      note('<mark>The referral must go electronically.</mark> Access to the service is limited if a patient simply walks in — walk-ins are at the pharmacy’s discretion, and for free medicines under CPSAS they are only allowed for patients who are homeless, asylum seekers or refugees.', 'critical'),
      message(PHARMACY_MESSAGE),
      expand('Which conditions can go', [
        bullets(CLINICAL_PATHWAYS.map((p) => `**${p.name}** — ${p.age}`), 'Clinical pathways, where the pharmacist can treat'),
        note('Anything else reasonably minor can go as a minor illness referral; that list is not exhaustive.', 'info'),
      ]),
    ],
    source: ['Pharmacy First and CPSAS'],
  });
}
