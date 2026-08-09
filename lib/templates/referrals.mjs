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
const ERS_STEPS = [
  "Open the patient's record, go to **Consultation** and find the referral document the doctor completed. Check it is the right patient and the right referral.",
  'Go to the **e-RS website** and click **Smartcard**. If you are prompted, choose your practice.',
  'Click **Referring clinician admin**.',
  "Copy the patient's **NHS number** into the NHS patient details field.",
  'Click **Refer or seek advice**.',
  'Set the fields: the **doctor who created the task**, the **request type**, the **priority**, and the **type of referral** (the speciality and clinic type above).',
  'Choose the hospital as the doctor directed — by default the first option listed.',
  'Click **Defer appointment booking**, then **Confirm**.',
  'Click **Referral summary → Add attachment**, select the referral letter, then **Save**.',
  'Download the referral summary and send it to the patient, unless this service says not to.',
];

const LETTER_STEPS = [
  '**Add → Document → Create letter**. The form opens pre-populated with the patient details.',
  'Click the **magnifying glass** to search the forms.',
  'Go to **Shared folder → Publisher → Referral forms**.',
  'Pick the form prefixed **RP** — when several appear, that is almost always the right one.',
  'Double-click to open it. Most of it is pre-filled: **read it through and verify before editing**.',
  'Save and close. It then appears under **Consultation**.',
];

const EMAIL_STEPS = [
  'Open **Accurx**: **Message → Message professional**.',
  'Click **Attach → EMIS file** to list the documents on the patient record.',
  'Select the referral letter. The recipient address fills in automatically from the document.',
  'Click **Send**.',
  'Mark it off: on My Inbox, **Message → Mark done**.',
];

const CLINICIAN_RULE = note(
  'Use the doctor who created the task as the referring clinician. If the task came from someone who is not a doctor, use **Dr Goel**.',
  'critical',
);

const letterExpander = () => expand(
  'The doctor has not made the referral letter — how do I create it?',
  [steps(LETTER_STEPS)],
  "Check the patient's Consultation first. It is normally already there.",
);

/* -------------------------------------------------------------- templates */

function ersReferral(svc) {
  const missing = !svc.specialty && !svc.clinicType;
  return answer({
    title: `${svc.name} referral`,
    subtitle: 'Sent on e-RS',
    warn: svc.cancer ? 'Cancer referral — priority is 2WW, never Routine.' : '',
    blocks: [
      fields([
        field('Request type', 'Referral'),
        field('Priority', svc.priority || 'Routine'),
        field('Speciality', svc.specialty, { key: true, missing: 'Not recorded — take it from the doctor’s task' }),
        field('Clinic type', svc.clinicType, { key: true, missing: 'Not recorded — take it from the doctor’s task' }),
        svc.hospital ? field('Hospital', svc.hospital) : null,
        svc.pathway ? field('Pathway', svc.pathway) : null,
        svc.form ? field('Form', svc.form) : null,
      ]),
      missing ? note('The practice’s notes do not record the speciality and clinic type for this referral. Take both from the doctor’s task, and ask the secretaries if it is not there.', 'warn') : null,
      svc.note ? note(svc.note, 'warn') : null,
      CLINICIAN_RULE,
      steps(ERS_STEPS),
      letterExpander(),
    ],
    source: ['Standard referral flow (e-RS)', `${svc.name} referral`],
  });
}

function emailReferral(svc) {
  return answer({
    title: `${svc.name} referral`,
    subtitle: 'Sent by email, not e-RS',
    blocks: [
      note('This service is referred **by email**. There is no e-RS form, so there is no speciality or clinic type to set.', 'info'),
      fields([
        svc.to
          ? field('Send to', svc.to, { key: true })
          : field('Send to', '', { key: true, missing: 'The address fills in automatically from the document' }),
        svc.org ? field('Organisation', svc.org) : null,
        svc.form ? field('Form', svc.form) : null,
      ]),
      svc.note ? note(svc.note, 'warn') : null,
      CLINICIAN_RULE,
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
