// Referral answers.
//
// The shape of a referral answer was set by the practice, not by us: the
// process is the same every time, and the ONLY things that change between one
// referral and the next are the speciality and the clinic type. So those two
// are the headline, and the steps below them are constant text.
//
// Three routes, decided in code before any block is built:
//
//   email    the service is on the practice's emailed list. e-RS never appears
//            in the answer — showing both routes is how the same referral gets
//            sent twice, or by the wrong one.
//   e-RS     the standard flow, with the speciality and clinic type filled in
//            from the pairing the practice records for this service.
//   unknown  the practice records no pairing. The honest answer, naming who to
//            ask. NOT the standard steps with two blank boxes at the top, which
//            reads as an answer and is not one.
//
// Creating the referral letter is deliberately behind a disclosure. The doctor
// has normally already completed it, so walking a receptionist through making a
// second one sends them to redo work sitting in the patient's consultation. It
// is one tap away for the times they have not.
import { answer, bullets, expand, field, fields, note, steps } from './blocks.mjs';

/* --------------------------------------------------------------- the data */
// Every referral the notebook records, and how it goes. `specialty` and
// `clinicType` are copied from the practice's own pages — blank means the
// practice does not record it, which the answer says rather than guesses.
export const REFERRAL_SERVICES = [
  // --- emailed ---------------------------------------------------------
  { name: 'ACERS', route: 'email' },
  { name: 'ECG', route: 'email', note: 'The form must include the practice email or it will be rejected.' },
  { name: '48-hour tape', route: 'email', aliases: ['24 hour tape', 'holter'], note: 'Search `ECG`, pick the 24-hour form, keep pressing OK, then select 48 hours.' },
  { name: 'Echo', route: 'email', aliases: ['echocardiogram', 'rp echo'], note: 'Use the same address as ECGs. The form must include the practice email or it will be rejected.' },
  { name: 'Minor surgery', route: 'email', to: 'NELONDONICB.NIGHTINGALEPRACTICE@NHS.NET', org: 'The Nightingale Practice', note: 'Minor surgery is NOT general surgery.' },
  { name: 'Occupational therapy (OT)', route: 'email', aliases: ['ot'] },
  { name: 'District nurse / community nurse', route: 'email', aliases: ['dn', 'acn', 'adult community nursing'], form: 'RP ACN 2022', note: 'Order the documents latest to earliest, print the set to PDF, then email the PDF.' },
  { name: 'Hackney ARC', route: 'email' },
  { name: 'CAMHS', route: 'email', aliases: ['child and adolescent mental health'] },
  { name: 'Healthy Together', route: 'email' },
  { name: 'Social prescriber', route: 'email', to: 'nelondonicb.hackneydownssp@nhs.net', note: 'For patients who cannot manage finances, forms or benefits.' },
  { name: 'Gym referral', route: 'email', aliases: ['exercise referral'] },

  // --- e-RS ------------------------------------------------------------
  { name: 'Rapid Access Chest Pain Clinic (RACPC)', route: 'ers', aliases: ['racpc', 'chest pain'], specialty: 'Cardiology', clinicType: 'Ischaemic Heart Disease', priority: 'Urgent', hospital: 'Homerton University Hospital', pathway: 'RAS Rapid Access Chest Pain Clinic - Cardiology Department - Homerton - RQX', note: 'This clinic is always urgent.' },
  { name: 'Hearing test / audiology', route: 'ers', aliases: ['audiology', 'hearing'], specialty: 'Diagnostic Physiological Measurement', clinicType: 'Audiology - hearing assess', note: 'Pick the first hospital listed.' },
  { name: 'Hernia (general surgery)', route: 'ers', aliases: ['hernia'], specialty: 'Not Otherwise Specified', clinicType: 'Hernias', note: 'General surgery is NOT minor surgery.' },
  { name: 'Pain management', route: 'ers', specialty: 'Pain Management', clinicType: 'Pain Management Clinic' },
  { name: 'Foot clinic / podiatry', route: 'ers', aliases: ['podiatry', 'at risk foot', 'foot'], specialty: 'Podiatry', clinicType: 'At-Risk Foot', note: "Every foot clinic patient is treated as at-risk foot. Patients are seen with St Leonard's." },
  { name: 'Fertility', route: 'ers', aliases: ['infertility'], specialty: 'Gynaecology', clinicType: 'Infertility', hospital: 'HUH fertility clinic' },
  { name: 'Sleep apnoea', route: 'ers', aliases: ['sleep', 'sleep disordered breathing'], specialty: '', clinicType: '', hospital: 'Homerton University Hospital', pathway: 'RAS Sleep Service (Disordered Breathing) - Main Outpatients - Homerton - RQX' },
  { name: 'Suspected skin cancer (2WW)', route: 'ers', aliases: ['skin cancer', '2ww skin', 'melanoma'], specialty: 'Dermatology', clinicType: '2WW skin cancer option for dermatology', priority: '2WW', cancer: true, note: 'Normally goes through Telederm. Message the patient the summary ONLY for a 2WW referral.' },
  { name: 'Community dermatology', route: 'ers', aliases: ['dermatology community', 'gpwspi'], specialty: 'Dermatology - not otherwise specified', clinicType: '', note: 'Community referrals need a Communitas hospital.' },
  { name: 'Telederm (routine or urgent)', route: 'ers', aliases: ['telederm', 'dermatology'], specialty: 'Dermatology', clinicType: '', note: 'The hospital chosen must contain "Telederm". Do NOT message the patient for routine or urgent Telederm — the hospital contacts them.' },
  { name: 'Paediatrics', route: 'ers', aliases: ['children', 'paeds', 'child'], specialty: 'Children and Adolescence Services', clinicType: '', note: 'The speciality subdivides into the required options once selected.' },
  { name: 'Orthopaedics (upper or lower limb)', route: 'ers', aliases: ['orthopaedics', 'upper limb', 'lower limb'], specialty: 'Orthopaedics', clinicType: '', note: 'The clinic type is in the referral letter. Upper limb is waist up, lower limb is waist down.' },
  { name: 'Community gynaecology', route: 'ers', aliases: ['gynaecology community'], specialty: 'Not Otherwise Specified', clinicType: '', hospital: 'Homerton University Hospital', pathway: 'Advice & Guidance – Gynaecology - Homerton – RQX', note: 'Go through Advice and Guidance, then Not Otherwise Specified.' },
  { name: 'Diabetes education (EDDI)', route: 'ers', aliases: ['eddi', 'diabetes education'], specialty: '', clinicType: '', form: 'RP diabetes (CEG resource → Referral)' },
  { name: 'Retinal / diabetic eye screening', route: 'ers', aliases: ['retinal', 'eye screening'], specialty: '', clinicType: '', form: 'RP retinal' },
  { name: 'BCG (TB vaccine)', route: 'ers', aliases: ['bcg', 'tb vaccine'], specialty: '', clinicType: '', form: 'BCG referral form (RP)', note: 'Only if a parent or grandparent is from a country where TB is more prevalent. Check the country list in your email first.' },
  { name: 'Chronic fatigue (CFS)', route: 'ers', aliases: ['cfs', 'chronic fatigue'], specialty: '', clinicType: '', note: "Only done by St Leonard's, accessed via physio unless otherwise specified. Shows as CFS in the system." },
];

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Find the referral service a question is about. Null when nothing matches. */
export function findReferralService(query) {
  const q = norm(query);
  if (!q) return null;
  let best = null;
  for (const svc of REFERRAL_SERVICES) {
    for (const name of [svc.name, ...(svc.aliases || [])]) {
      const n = norm(name);
      if (!n) continue;
      if (q.includes(n) && (!best || n.length > best.len)) best = { svc, len: n.length };
    }
  }
  return best ? best.svc : null;
}

/* ----------------------------------------------------------- shared parts */

// The standard e-RS send. Constant text: the same for every referral.
//
// Written short on purpose. The earlier version narrated each click in a full
// sentence and ran to ten steps, and the referring-clinician rule was repeated
// as a red banner AND inside the step that sets it. Someone with a patient at
// the desk reads the bold words and nothing else, so the rule now lives in the
// one step where it is typed, and the sentences around it are gone.
// "Pick the first hospital listed" is the DEFAULT, not the rule. Where the
// practice records a hospital or a named service for a referral, the first
// listed is usually the wrong one, and sending a referral to the wrong trust is
// the most expensive mistake on this card. So the hospital step is written from
// the service rather than being constant text.
const ersSteps = (svc) => [
  "Find the doctor's referral letter in the patient's **Consultation**.",
  'Open **e-RS** → **Smartcard** → **Referring clinician admin**. Choose your practice if prompted.',
  "Paste the patient's **NHS number**, then **Refer or seek advice**.",
  'Set the fields above. Referring clinician is **the doctor who created the task** — if it came from someone who is not a doctor, use **Dr Goel**.',
  svc.hospital || svc.pathway
    ? 'Pick the hospital and service named above — **not** the first one listed.'
    : 'Pick the hospital the doctor named. If they did not name one, take the first listed.',
  '**Defer appointment booking**, then **Confirm**.',
  '**Referral summary → Add attachment** → the letter → **Save**.',
  'Send the summary to the patient.',
];

const LETTER_STEPS = [
  '**Add → Document → Create letter**.',
  '**Magnifying glass → Shared folder → Publisher → Referral forms**.',
  'Pick the form prefixed **RP**.',
  'Open it. Most of it is pre-filled — **verify before editing**.',
  'Referring clinician is **the doctor who created the task**, or **Dr Goel** if it came from someone who is not a doctor.',
  'Save and close. It appears under **Consultation**.',
];

const EMAIL_STEPS = [
  'Open **Accurx** → **Message professional**.',
  '**Attach → EMIS file** → the referral letter. The address fills in automatically.',
  '**Send**.',
  'On My Inbox, **Message → Mark done**.',
];

const letterExpander = () => expand(
  'The doctor has not made the referral letter',
  [steps(LETTER_STEPS)],
  "Check the patient's Consultation first — it is normally already there.",
);

// The referral form, which is only touched when the letter has to be made.
// Hospital and service used to live here too and that was wrong: they are
// chosen on e-RS like the speciality and the clinic type, so they belong in the
// panel with them, not behind a disclosure the reader has no reason to open.
const formExpander = (svc) => (svc.form
  ? expand('Which form to use', [fields([field('Form', svc.form)])])
  : null);

/* -------------------------------------------------------------- templates */

function ersReferral(svc) {
  return answer({
    title: `${svc.name} referral`,
    subtitle: 'Sent on e-RS',
    warn: svc.cancer ? 'Priority is 2WW, never Routine.' : '',
    blocks: [
      // Only the boxes the reader types into. Request type is "Referral" on
      // every referral there is, so showing it said nothing; priority is only
      // worth a row when it is not the default.
      fields([
        field('Speciality', svc.specialty, { missing: 'Not recorded — take it from the doctor’s task' }),
        field('Clinic type', svc.clinicType, { missing: 'Not recorded — take it from the doctor’s task' }),
        svc.priority && svc.priority !== 'Routine' ? field('Priority', svc.priority) : null,
        // Selected on e-RS exactly like the two above, so it belongs here. When
        // the practice records one, the first hospital listed is usually the
        // wrong one — see the hospital step.
        svc.hospital ? field('Hospital', svc.hospital) : null,
        svc.pathway ? field('Service', svc.pathway) : null,
      ], 'Set on e-RS'),
      svc.note ? note(svc.note, 'warn') : null,
      steps(ersSteps(svc)),
      formExpander(svc),
      letterExpander(),
    ],
    source: ['Standard referral flow (e-RS)', `${svc.name} referral`],
  });
}

function emailReferral(svc) {
  return answer({
    title: `${svc.name} referral`,
    // The route is the headline, and it is the whole reason this card looks
    // different from the e-RS one. Said once, here, not repeated as a note.
    subtitle: 'Sent by email — no e-RS form, so nothing to set',
    blocks: [
      fields([
        svc.to
          ? field('Send to', svc.to)
          : field('Send to', '', { missing: 'Fills in automatically from the document' }),
        svc.org ? field('Organisation', svc.org) : null,
        svc.form ? field('Form', svc.form) : null,
      ], 'Email it to'),
      svc.note ? note(svc.note, 'warn') : null,
      steps(EMAIL_STEPS),
      letterExpander(),
    ],
    source: ['Emailing a referral', 'Referrals that can be emailed'],
  });
}

function unknownReferral(name) {
  return answer({
    title: name ? `${name} referral` : 'Referral',
    subtitle: 'Not recorded in the practice’s notes',
    blocks: [
      note(`The practice’s notes do not record how ${name || 'this'} referrals are sent, or which speciality and clinic type to use.`, 'warn'),
      bullets([
        'Take the speciality and clinic type from the doctor’s task, or from the referral document itself.',
        'If neither gives them, ask the secretaries or the referring GP.',
      ]),
      note('Do not follow the standard steps with the two boxes left blank — a referral cannot be sent without both, and a guess sends it to the wrong service.', 'critical'),
    ],
    source: [],
  });
}

/**
 * The referral answer for a question. Routing happens here, in code: emailed
 * service, e-RS service, or nothing recorded.
 */
export function referralAnswer({ question = '', service = null } = {}) {
  const svc = service || findReferralService(question);
  if (!svc) {
    const named = String(question || '')
      .replace(/\b(how do i|refer|referral|for|a|an|the|to|send)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
    return unknownReferral(named);
  }
  return svc.route === 'email' ? emailReferral(svc) : ersReferral(svc);
}

export const referralTemplates = { ersReferral, emailReferral, unknownReferral };
