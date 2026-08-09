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
import { answer, bullets, expand, field, fields, note, steps } from './blocks.mjs';

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
const mentions = (haystack, needle) => norm(haystack).includes(norm(needle));

/** The clinical pathway a question is about, if it is one of the seven. */
export function findClinicalPathway(query) {
  const q = norm(query);
  if (!q) return null;
  let best = null;
  for (const p of CLINICAL_PATHWAYS) {
    for (const name of [p.name, ...p.aliases]) {
      const n = norm(name);
      if (q.includes(n) && (!best || n.length > best.len)) best = { p, len: n.length };
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
 * `condition` is whatever the reader named. Everything is decided from the
 * three tables above before a block is built: which route it takes, whether
 * there is an age gate, and whether the medicines are free.
 */
export function pharmacyFirstAnswer({ condition = '' } = {}) {
  const named = String(condition || '').trim();

  // Checked before anything else. A pharmacy answer for one of these is worse
  // than no answer, and it would look exactly as confident as a correct one.
  if (RED_FLAGS.test(named)) {
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

  const pathway = findClinicalPathway(condition);
  const cpsas = cpsasFor(condition);
  const minor = minorFor(condition);

  // Nothing named, or nothing matched: the overview, so somebody asking "what
  // can go to pharmacy" gets the lists rather than a shrug.
  if (!named || (!pathway && !cpsas && !minor)) {
    return answer({
      title: named ? `${named} — Pharmacy First` : 'Sending a patient to Pharmacy First',
      subtitle: named ? 'Not on a named list, but still referable' : 'What community pharmacy can take',
      blocks: [
        named
          ? note(`**${named}** is not one of the seven clinical pathways or the 24 free-medicine conditions. Community pharmacy can still take it as a **minor illness referral** — that list is not exhaustive — and the pharmacist will use their judgement.`, 'info')
          : note('Community pharmacy takes three different kinds of referral, and which one it is decides what the pharmacist can do.', 'info'),
        steps(REFER_STEPS),
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
