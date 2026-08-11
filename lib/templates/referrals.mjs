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
  // `specialty` here is the specialty AREA, not the box to type. On a cancer
  // referral the speciality box is "2WW" and this becomes the clinic type,
  // "2WW Dermatology" — see ersSpecialty and ersClinicType.
  { name: 'Suspected skin cancer (2WW)', route: 'ers', aliases: ['skin cancer', '2ww skin', 'melanoma', 'cancer dermatology'], specialty: 'Dermatology', clinicType: '', priority: '2WW', cancer: true, note: 'Normally goes through Telederm. Message the patient the summary ONLY for a 2WW referral.' },
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

/* ------------------------------------------- the list the practice keeps */
//
// THE LIST ABOVE IS NOT THE PRACTICE'S LIST. It is a copy of it, made once, and
// a copy of a list somebody else maintains starts going out of date the day it
// is written. "How do I do a dietitian referral" proved it: the practice's own
// Notebook page names Dietitian among the referrals that go by email, the
// assistant reads that page correctly when asked what can be emailed, and the
// referral card still said "not recorded in the practice's notes" — because
// Dietitian was never typed into the array above.
//
// That is the worst shape a wrong answer can take. It is not a gap the reader
// can see; it is the assistant asserting the practice has no process for
// something the practice wrote down.
//
// So the emailed list is READ FROM THE NOTEBOOK instead, every time. Nothing is
// added to the array for it and nothing needs to be: a referral the practice
// adds to its own page is answerable the moment they save it.
//
// WHAT KEEPS THIS HONEST. The model names what is being referred to — extraction,
// which it does reliably — and code does everything after that. The page must
// really be about emailing referrals, and the name must really appear on one of
// its list lines. A prose mention somewhere in the middle of a paragraph is not
// a listing, and does not count.

// A page that lists the referrals which go by email. Recognised by what it is
// about rather than by its title, because the title is the practice's to change.
function isEmailedReferralPage(page) {
  const title = String(page?.docTitle || '');
  const text = String(page?.text || '');
  if (!/referral/i.test(title + ' ' + text)) return false;
  if (!/e-?mail/i.test(title) && !/e-?mail/i.test(text.slice(0, 400))) return false;
  // It has to be a LIST of them, not a page that mentions email once.
  return /^\s*(?:[-*•+]|\d+[.)])\s+\S/m.test(text);
}

// The lines of a page that are list items. What the practice actually listed.
function listLines(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^(?:[-*•+]|\d+[.)])\s+\S/.test(line))
    .map((line) => line.replace(/^(?:[-*•+]|\d+[.)])\s+/, '').trim());
}

// What the reader might have called it. A referral is named half a dozen ways
// and the trailing word "referral" is the reader's, not the practice's.
function nameVariants(name) {
  const base = norm(name).replace(/\s*referrals?$/, '').trim();
  if (!base) return [];
  const out = new Set([base]);
  if (base.endsWith('s')) out.add(base.slice(0, -1));
  else out.add(base + 's');
  return [...out].filter(Boolean);
}

// Does this list line name this referral? Whole words only: "OT" must not match
// inside "Occupational Therapy" by accident, and "ECG" must not match "ECGs
// are not done here" — which is why the line is normalised first and then
// matched on word boundaries.
function lineNames(line, variants) {
  const l = norm(line);
  if (!l) return false;
  return variants.some((v) => new RegExp('\\b' + v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b').test(l));
}

/**
 * Is this referral one the practice's Notebook lists as emailed?
 *
 * Returns a service object shaped like the ones in REFERRAL_SERVICES, carrying
 * the page it came from and the exact line that named it, so the card can show
 * its working and the turn can record it. Null when no page lists it — which is
 * the honest answer and still produces the "not recorded" card.
 *
 * @param {string} name  what is being referred to, as the model read it
 * @param {Array}  pages the Notebook, as loaded for this turn
 */
export function findEmailedReferral({ name = '', pages = [] } = {}) {
  const variants = nameVariants(name);
  if (!variants.length) return null;

  for (const page of pages || []) {
    if (!isEmailedReferralPage(page)) continue;
    for (const line of listLines(page.text)) {
      if (!lineNames(line, variants)) continue;
      return {
        // The practice's own wording for it, not the reader's. "OT
        // (Occupational Therapy)" is what the page says, so that is what the
        // card is titled with.
        name: line.replace(/\s*[—–-]\s.*$/, '').trim() || String(name).trim(),
        route: 'email',
        fromNotebook: true,
        page: String(page.docTitle || ''),
        line,
      };
    }
  }
  return null;
}

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

// On a two week wait referral BOTH boxes change, and not in the way an ordinary
// referral would suggest:
//
//   Speciality  is literally "2WW" — the same on every cancer referral there is.
//   Clinic type carries the specialty name: "2WW Dermatology".
//
// So a service records its specialty area as normal ("Dermatology") and these
// two derive the boxes from it. Doing it here rather than typing the pair into
// each row means a cancer service added later cannot be recorded with an
// ordinary speciality and quietly sent down the routine list.
function ersSpecialty(svc) {
  return svc.cancer ? '2WW' : svc.specialty;
}

function ersClinicType(svc) {
  if (!svc.cancer) return svc.clinicType;
  const area = svc.clinicType || svc.specialty;
  if (!area) return '';
  return /^2ww\b/i.test(area) ? area : `2WW ${area}`;
}

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
        field('Speciality', ersSpecialty(svc), { missing: 'Not recorded — take it from the doctor’s task' }),
        field('Clinic type', ersClinicType(svc), { missing: 'Not recorded — take it from the doctor’s task' }),
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
      // Read off the practice's own page rather than out of the array in this
      // file, so the reader can see WHERE the answer came from and check it.
      // The page's line is quoted, never reworded — the whole reason this card
      // is trustworthy is that nothing rewrote what the practice listed.
      svc.fromNotebook
        ? note(`The practice’s notes list this among the referrals sent by email rather than on e-RS: <mark>“${svc.line}”</mark>.`, 'info')
        : null,
      svc.note ? note(svc.note, 'warn') : null,
      steps(EMAIL_STEPS),
      letterExpander(),
    ],
    source: svc.fromNotebook && svc.page
      ? ['Emailing a referral', svc.page]
      : ['Emailing a referral', 'Referrals that can be emailed'],
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
 * The referral answer for a question. Routing happens here, in code, in the
 * order that keeps the most specific answer winning:
 *
 *   1. the service the model named, from the enum of what the practice records;
 *   2. failing that, a service whose name appears in the question;
 *   3. failing that, THE NOTEBOOK — is this one the practice's own page lists
 *      as emailed? This is the step that stops a referral the practice wrote
 *      down being reported as one it has no process for;
 *   4. failing all of it, the honest "not recorded" card.
 *
 * The Notebook step is deliberately last. A pairing the practice recorded for a
 * named service is more specific than a name on a list, and a service that
 * takes both routes must resolve to the recorded one.
 *
 * @param {string} name  what is being referred to, as the model read it off the
 *                       message. Used only for step 3; the question itself is a
 *                       poor substitute because "how do I do a dietitian
 *                       referral" is mostly words that are not the referral.
 * @param {Array} pages  the Notebook, as loaded for this turn. Empty means step
 *                       3 cannot run, and the card falls back rather than guesses.
 */
export function referralAnswer({ question = '', service = null, name = '', pages = [] } = {}) {
  const svc = service || findReferralService(question) || findReferralService(name);
  if (svc) return svc.route === 'email' ? emailReferral(svc) : ersReferral(svc);

  // The model's name when it gave one; otherwise the question with the words
  // that are never part of a referral's name taken out of it. The fallback is
  // worse and is meant to be — it is what stops an empty field being a dead end,
  // not a substitute for filling the field in. It got noticeably better when
  // "do" joined the list: "how do I do a dietitian referral" was leaving
  // "do dietitian", which matched no page and titled the card with it.
  const named = String(name || '').trim() || String(question || '')
    .replace(/\b(how|do|does|did|i|we|you|to|a|an|the|for|of|make|making|send|sending|refer|referring|referrals?|process|steps?|please)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  const emailed = findEmailedReferral({ name: named, pages });
  if (emailed) return emailReferral(emailed);

  return unknownReferral(named);
}

/**
 * The e-RS flow with no service named.
 *
 * "How do I do an e-RS referral" is a real and common question, and until now
 * nothing could answer it as a card: every referral template needs a service in
 * order to look the pairing up, so a question naming none produced the "not
 * recorded" card — the right answer to "how do I refer to the Royal Free
 * vascular clinic" and the wrong one to "how do referrals work". The model saw
 * that, sensibly refused the template, and wrote the flow out of the Notebook
 * as prose instead.
 *
 * So the steps get shown on their own, with the two boxes left open and SAID to
 * be open. That is the honest card: the flow really is identical every time,
 * and those two values really do come from the task unless a service is named.
 */
export function referralProcessAnswer() {
  return answer({
    title: 'Sending a referral on e-RS',
    subtitle: 'The same flow for every referral',
    blocks: [
      fields([
        field('Request type', 'Referral'),
        field('Priority', 'Routine, unless it is a cancer referral — then 2WW'),
        field('Speciality', '', { missing: 'Depends on the service — name it and this fills in' }),
        field('Clinic type', '', { missing: 'Depends on the service — name it and this fills in' }),
      ], 'Set on e-RS'),
      note('The flow below is the same for every referral. The **only** things that change are the speciality and the clinic type — say which service it is and those two are filled in, or take them from the doctor’s task.', 'info'),
      steps(ersSteps({})),
      letterExpander(),
    ],
    source: ['Standard referral flow (e-RS)'],
  });
}

export const referralTemplates = { ersReferral, emailReferral, unknownReferral, referralProcessAnswer };
