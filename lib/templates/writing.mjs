// Two answers about HOW TO WRITE something rather than what to do: the filing
// title for an incoming document, and the reason for appointment.
//
// Both are house style, and house style is only worth writing down once. The
// format is executable here rather than described — `codingTitle` builds a
// title from its parts, and the worked examples on the card are produced by
// calling it. An example therefore cannot drift away from the rule it is
// illustrating, which is the usual way a style guide starts lying.
import { answer, bullets, expand, field, fields, note, table } from './blocks.mjs';

/* --------------------------------------------------------- the two rulings */

// TWO DECISIONS THAT WERE OPEN. Both are one edit to reverse.
//
// 1. No semicolon after the department. The format line is
//       (dd-Mmm-yyyy) SITE Department action; action
//    and semicolons separate actions FROM EACH OTHER — putting one after the
//    department makes the department read as the first action. The earlier
//    titles ran without it; the odd one out was "Hackney Ark Audiology; FU
//    6/12". Set DEPT_JOIN to '; ' to go the other way.
const DEPT_JOIN = ' ';

// 2. Abbreviations are kept exactly as the source writes them, never expanded
//    silently. Anything worth expanding is flagged instead, so the person
//    filing decides. This constant makes that a setting rather than a habit.
const EXPAND_ABBREVIATIONS = false;

/* --------------------------------------------------------------- the format */

/**
 * Build a filing title from its parts.
 *   codingTitle({ date: '07-Aug-2026', site: 'RLH', department: 'Ophthalmology',
 *                 actions: ['d/c'] })
 *   → "(07-Aug-2026) RLH Ophthalmology d/c"
 *
 * One line per document however many actions there are, semicolons between
 * them, nothing trailing after the last.
 */
export function codingTitle({ date = 'dd-Mmm-yyyy', site = '', department = '', actions = [] }) {
  const head = [site, department].filter(Boolean).join(' ');
  const tail = actions.map((a) => String(a || '').trim()).filter(Boolean).join('; ');
  return `(${date})` + (head ? ' ' + head : '') + (tail ? DEPT_JOIN + tail : '');
}

const EXAMPLES = [
  { of: 'Discharged, nothing for us', parts: { date: '07-Aug-2026', site: 'RLH', department: 'Ophthalmology', actions: ['d/c'] } },
  { of: 'Prescribing continues, follow-up on us', parts: { date: '12-Mar-2026', site: 'HUH', department: 'Cardiology', actions: ['continue bisoprolol', 'f/u 6/12'] } },
  { of: 'Did not attend', parts: { date: '21-Jan-2026', site: 'HUH', department: 'Dermatology', actions: ['DNA', 'd/c'] } },
  { of: 'Non-NHS sender', parts: { date: '03-Feb-2026', site: 'Legal & General', department: 'Customer Underwriting', actions: ['report requested'] } },
];

// The rules, in one place, so the card that explains them and the prompt that
// applies them cannot drift apart. A style guide that disagrees with the thing
// doing the styling is worse than no style guide.
export const DOC_CODING_RULES = [
  'Format: `(dd-Mmm-yyyy) SITE Department action; action`. One line per document however many actions there are. Semicolons between actions, no dash before the first, nothing trailing after the last.',
  'Date is the clinic or attendance date. Use the letter or email date only where no attendance took place: rebookings, cancellations, insurer letters. Always dd-Mmm-yyyy with a three-letter English month.',
  'Site is the site code and department is the department name in title case, not the letter’s own header wording: "RLH Ophthalmology", not "eye casualty". A non-NHS sender takes the organisation and team, e.g. "Legal & General Customer Underwriting".',
  'INCLUDE: prescribing the GP will continue or reissue; monitoring, referrals or chasing the GP has been asked to do; DNA; d/c; outstanding requests to the practice; follow-up the GP must arrange.',
  'EXCLUDE: normal findings and reassuring results; completed procedures; hospital-booked follow-up; conditional offers ("re-refer if you wish"), which d/c already implies; reasons and clinical reasoning, keeping the consequence and dropping the why; background conditions; confirmation the patient was informed, unless that is the whole content.',
  'd/c means nothing is booked and anything further sits with the GP. It needs no elaboration. Use f/u or r/v, whichever fits.',
  'Keep abbreviations exactly as the source writes them. Never expand one silently.',
  'Never include the patient’s name, NHS number, date of birth or address.',
];

export const REASON_RULES = [
  'Lowercase, no full stops, clinical shorthand, a single line.',
  'Cut to the actionable core: what the problem is, how long, direction of travel, what has been tried, what they are asking for.',
  'Drop pleasantries, contact preferences and narrative detail.',
  'Keep a cause the patient gives as theirs, not as a finding — "pt attributes to…".',
  'Keep any concern they raise about a specific drug or interaction: the prescriber needs it before deciding.',
  'Use durations as /7, /52, /12 for days, weeks and months.',
  'Never include the patient’s name, NHS number, date of birth or address.',
];

// WHAT RECEPTION NEEDS TO MAKE THE BOOKING, as opposed to what the clinician
// needs to read.
//
// The reason line above deliberately DROPS contact preferences and narrative
// detail — "best to call after 2pm", "I can't do Wednesdays", "I'll need an
// interpreter". That rule is right: none of it belongs in a clinical shorthand
// line a doctor reads thirty seconds before the consultation.
//
// But it is not noise. It is the half of a pasted message that decides which
// slot gets booked, and dropping it on the floor means somebody rings at 11am,
// gets no answer, and the appointment is wasted. So it has somewhere to go
// instead of being lost between the two.
//
// The line this list must not cross: none of it is a clinical judgement. It
// never says how urgent something is or where the patient should go. Urgency is
// decided by the scanners in lib/safety, which run over the same message on the
// same turn, and routing is the other half of the /accurx card.
export const BOOKING_RULES = [
  'Only what reception needs to make the booking. Never how urgent it is and never where the patient should go — neither is decided here.',
  'Who or what they asked for: a named clinician, a nurse, the physio, a telephone call rather than a face-to-face.',
  'When they can and cannot attend, and how they want to be contacted. The reason line drops these on purpose; this is where they belong.',
  'Anything the appointment has to be set up with: an interpreter and which language, step-free access, a chaperone, a double slot they have asked for.',
  'Whether somebody is writing on the patient’s behalf, and who.',
  'An empty list is the normal answer. Do not invent a note to fill it.',
  'Never include the patient’s name, NHS number, date of birth or address.',
];

// HAS THIS ALREADY BEEN DEALT WITH, AND BY WHOM.
//
// The third thing reception does with a pasted request, after deciding where it
// goes and writing the line that gets booked. A patient writing in about the
// same knee, the same rash or the same tablets for the third time is not a new
// problem, and the appointment that helps them is the one with the clinician who
// saw it last: they have the history, they know what was tried, and they said
// what to do if it did not settle. Booked with whoever happens to be free, the
// consultation starts again from nothing and the patient tells the story for the
// third time.
//
// Patients say this themselves, constantly and in passing — "I saw Dr Okafor
// about this in July", "the nurse gave me cream last month", "I was told to come
// back if it did not clear". It is in the message and it was going nowhere: the
// reason line drops it as narrative, and the booking notes are about slots.
//
// The line this list must not cross is the same one the booking notes may not
// cross. It never says how urgent anything is and never says where it goes —
// what it says is who the appointment should be WITH once somewhere has already
// been decided, which is a different question and the last one asked.
export const CONTINUITY_RULES = [
  'Only prior contact about THIS problem. A patient who saw somebody about something unrelated is a patient with a history, not a follow-up.',
  'Take who they saw exactly as the message names them — "Dr Okafor", "the nurse", "the physio", "someone at the hospital". Never turn a role into a name or a name into a role.',
  'Take when in the message’s own words: "in July", "last month", "about 3 weeks ago". Never date it yourself.',
  'Keep what came of it in a few words — what was tried, what they were told, whether they were asked to come back.',
  'Somebody at this practice is somebody to book back with. A hospital, a walk-in centre or 111 is history for the clinician to read, not a booking.',
  'Being told to come back if it did not settle counts, even where the message names nobody: reception can find who said it in the record.',
  'Nothing about urgency and nothing about where it goes. Both are decided elsewhere on the card; this only says who the appointment is with.',
  'Nothing found is the normal answer. Do not read a first-time problem as a follow-up to fill this in.',
];

// THE CARD THAT USED TO LIVE HERE WAS /appt's, and it has gone with it.
//
// appointmentBookingAnswer rendered the reason line and the booking notes on
// their own, under a warning saying it had NOT decided where the patient went.
// That warning was the problem: half an answer, on the one channel where the
// other half is the first thing anybody needs. /accurx renders both halves from
// one paste — see lib/templates/accurx.mjs, which builds the same two panels
// under the same two rule lists above.

/**
 * The finished filing title for a document that was pasted in. The model
 * supplies the parts; the title itself is assembled by codingTitle, so the
 * format is enforced in code rather than asked for in a prompt.
 */
export function codedDocumentAnswer({ date, site, department, actions = [], noAction = false }) {
  const title = codingTitle({ date, site, department, actions });
  return answer({
    title: 'Filing title',
    subtitle: 'Copy this onto the document',
    blocks: [
      // The whole point of this card is a string that gets typed onto a
      // document, so it carries its own Copy.
      fields([field('Title', title, { copy: true })], 'Coded'),
      noAction || !actions.length
        ? note('Nothing in this document needs an action from the practice.', 'info')
        : bullets(actions, 'Actions kept'),
      expand('How this was coded', [bullets(DOC_CODING_RULES)]),
    ],
    source: ['Document coding'],
  });
}

/** The finished reason line for a consultation that was pasted in. */
export function writtenReasonAnswer({ reason, details = [] }) {
  return answer({
    title: 'Reason for appointment',
    subtitle: 'Copy this into the appointment',
    blocks: [
      fields([field('Reason', reason, { copy: true })], 'Written'),
      details.length ? bullets(details, 'Also worth the clinician seeing') : null,
      expand('How this was written', [bullets(REASON_RULES)]),
    ],
    source: ['Appointment reason'],
  });
}

export function documentCodingAnswer() {
  return answer({
    title: 'Coding a document title',
    subtitle: 'One line per document, however many actions',
    blocks: [
      fields([
        field('Format', '(dd-Mmm-yyyy) SITE Department action; action'),
        field('Date', 'Clinic or attendance date'),
      ], 'The title'),

      table(['Example', 'Title'], EXAMPLES.map((e) => [e.of, codingTitle(e.parts)])),

      bullets([
        'Prescribing the GP will continue or reissue',
        'Monitoring, referrals or chasing the GP has been asked to do',
        'DNA, and **d/c**',
        'Outstanding requests to the practice',
        'Follow-up the GP must arrange',
      ], 'Include'),

      bullets([
        'Normal findings and reassuring results',
        'Completed procedures, and hospital-booked follow-up',
        'Conditional offers ("re-refer if you wish") — **d/c** already implies it',
        'Reasons and clinical reasoning — keep the consequence, drop the why',
        'Background conditions',
        'Confirmation the patient was informed, unless that is the whole content',
      ], 'Leave out'),

      note('**d/c** means nothing is booked and anything further sits with the GP — it needs no elaboration. Use **f/u** or **r/v**, whichever fits.', 'info'),

      expand('Site, department and dates in full', [
        bullets([
          'Site is your site code; department is the department name in **title case**, not the letter\'s own header wording. **RLH Ophthalmology**, not "eye casualty".',
          'A non-NHS sender takes the organisation and team, e.g. **Legal & General Customer Underwriting**.',
          'Use the letter or email date only where no attendance took place: rebookings, cancellations, insurer letters.',
          EXPAND_ABBREVIATIONS
            ? 'Abbreviations are expanded to their full form.'
            : 'Abbreviations stay exactly as the source writes them. Anything worth expanding is flagged rather than expanded silently.',
        ]),
      ]),
    ],
    source: ['Document coding'],
  });
}

/* ------------------------------------------------------ consultation note */

// THE THIRD THING WRITTEN IN HOUSE STYLE: what went on the record after a
// contact with a patient.
//
// Reception and the care navigators speak to patients all day — on the phone,
// at the desk, over AccurX — and what was said has to go on the record, or the
// next person the patient reaches starts from nothing. What is typed into the
// box is the contact as the member of staff would tell a colleague: who rang,
// what about, what was done, what was agreed. What comes out is the entry, in
// the shorthand the record is read in, short enough to be read in the seconds
// before the next call is answered.
//
// The line this list must not cross is the same one the reason line keeps to.
// It writes what was SAID and what was DONE. It decides nothing clinical, adds
// nothing that was not in the note, and is not the place for urgency — that is
// the /accurx card's, on the message it was asked about.
export const CONSULTATION_NOTE_RULES = [
  'One short entry for the record, in clinical shorthand: standard abbreviations (pt, c/w, tel, f2f, r/v, f/u, d/w, req, adv, DNA, TCI, SOS, s/n) and durations as /7, /52, /12. Lowercase apart from names of services, drugs and clinicians; no full stops between items — a semicolon separates them.',
  'Lead with the kind of contact and who initiated it: "tel c/w pt", "pt attended desk", "pt msg via AccurX", "tel c/w daughter (with pt consent)".',
  'Then what it was about, in the patient’s own terms where those matter: what the problem or request is, how long, what has been tried, what they asked for.',
  'Then what was done, as facts: booked, tasked, advised, referred, messaged, chased, declined — with who and when where they were said. "booked tel appt Dr Okafor 04-Sep", "tasked secretaries re referral letter", "adv 111 if worse o/n".',
  'Keep only what changes what the next person does. Drop pleasantries, hold music, how the patient was feeling about waiting, and anything the record already holds.',
  'Keep a cause or a concern the patient gave as theirs, not as a finding: "pt attributes to…", "pt concerned re…".',
  'Keep any safety-netting that was given, exactly as strong as it was said: "adv 999 if chest pain returns", "s/n given".',
  'Never invent an action, a date, a name or a decision that the note does not say. Never add clinical judgement, a diagnosis or an urgency — write what was said and done.',
  'Never include the patient’s name, NHS number, date of birth or address: the entry sits on their record already.',
];

/**
 * Build the record entry from its parts.
 *
 *   consultationEntry({ contact: 'tel c/w pt', summary: 'req sick note 2/52 back pain',
 *                       actions: ['tasked Dr Okafor', 'pt to call Fri if not ready'],
 *                       safetyNet: 'adv 111 if worse' })
 *   → "tel c/w pt: req sick note 2/52 back pain; tasked Dr Okafor; pt to call Fri if not ready; adv 111 if worse"
 *
 * One line, semicolons between the items, nothing trailing. Assembled here so
 * the shape is the same however the model words each part.
 */
export function consultationEntry({ contact = '', summary = '', actions = [], safetyNet = '' } = {}) {
  const head = String(contact || '').trim();
  const body = [String(summary || '').trim()]
    .concat(actions.map((a) => String(a || '').trim()))
    .concat([String(safetyNet || '').trim()])
    .filter(Boolean)
    .join('; ');
  if (!head) return body;
  return body ? head + ': ' + body : head;
}

const CONSULTATION_EXAMPLES = [
  {
    from: 'Patient rang, she has had a sore throat for about a week and is asking for antibiotics. I explained we can\'t just prescribe and booked her a telephone appointment with Dr Okafor tomorrow afternoon. Told her to ring 111 if she gets worse tonight.',
    parts: { contact: 'tel c/w pt', summary: 'sore throat 1/52, req abx', actions: ['adv not prescribed without assessment', 'booked tel appt Dr Okafor 03-Sep pm'], safetyNet: 'adv 111 if worse o/n' },
  },
  {
    from: 'Daughter came to the desk about her mum\'s referral to cardiology that was done in July, nothing heard. Mum has given consent for daughter to speak for her. I checked and the letter was sent 15 July, gave her the e-RS number to chase.',
    parts: { contact: 'daughter attended desk (pt consent on record)', summary: 'chasing cardiology referral Jul, nothing heard', actions: ['confirmed referral sent 15-Jul', 'e-RS ref given to chase'], safetyNet: '' },
  },
  {
    from: 'Called the patient back about the repeat prescription query. He wanted his ramipril early because he is going away for a month on Friday. Sent the request to the prescribing team as urgent and told him to check with the pharmacy Thursday.',
    parts: { contact: 'tel c/w pt (call back)', summary: 'req early ramipril, away 1/12 from Fri', actions: ['sent to prescribing team as urgent', 'pt to check with pharmacy Thu'], safetyNet: '' },
  },
];

/**
 * The finished record entry for a contact that was written up in the box. The
 * model supplies the parts; the entry itself is assembled by consultationEntry,
 * so the shape is enforced in code rather than asked for in a prompt.
 */
export function consultationNoteAnswer({ contact = '', summary = '', actions = [], safetyNet = '', unclear = [] } = {}) {
  const entry = consultationEntry({ contact, summary, actions, safetyNet });
  return answer({
    title: 'Record entry',
    subtitle: 'Copy this onto the patient’s record',
    blocks: [
      // The whole point of this card is a string that goes on the record, so it
      // carries its own Copy.
      fields([field('Entry', entry, { copy: true })], 'Written'),
      actions.length ? bullets(actions, 'Actions recorded') : null,
      // What the note left open, said back to the reader rather than filled in:
      // an entry that guesses a date or a name is worse than one that says the
      // note did not give it.
      unclear.length ? note('**Not in the note, so not in the entry:** ' + unclear.join('; ') + '.', 'warn') : null,
      expand('How this was written', [bullets(CONSULTATION_NOTE_RULES)]),
    ],
    source: ['Consultation note'],
  });
}

export function consultationNoteRulesAnswer() {
  return answer({
    title: 'Writing up a contact with a patient',
    subtitle: 'One line on the record, in the shorthand it is read in',
    blocks: [
      fields([
        field('Shape', 'contact: what about; what was done; what was done; safety-net'),
        field('Contact', 'tel c/w pt · pt attended desk · pt msg via AccurX · tel c/w daughter (with pt consent)'),
      ], 'The entry'),

      table(['What you would tell a colleague', 'Entry'], CONSULTATION_EXAMPLES.map((e) => [e.from, consultationEntry(e.parts)])),

      bullets([
        'How the contact happened, and who started it',
        'What it was about — the problem or the request, how long, what has been tried',
        'What was done: booked, tasked, advised, referred, messaged, chased, declined — with who and when',
        'Any safety-netting given, as strong as it was said',
      ], 'Keep'),

      bullets([
        'Pleasantries, waiting, and how the patient felt about it',
        'Anything the record already holds',
        'Any action, date, name or decision the note did not say',
        'Clinical judgement, a diagnosis, or how urgent it is',
      ], 'Leave out'),

      note('Write what was **said** and what was **done**. The entry is read by whoever the patient reaches next, so it must let them carry on rather than start again — and it must not tell them something that did not happen.', 'warn'),
    ],
    source: ['Consultation note'],
  });
}

/* ------------------------------------------------------- appointment reason */

const REASON_EXAMPLES = [
  {
    from: "Hi, I've had really bad heartburn for about 3 weeks and it's getting worse. Tried Gaviscon, no help. I'm worried because I read omeprazole interacts with my clopidogrel. Best to call after 2pm please.",
    to: 'heartburn 3/52, worsening, gaviscon not helping; pt concerned re omeprazole/clopidogrel interaction',
  },
  {
    from: 'My knee has been really painful since I came off my bike about 2 months ago. I think I twisted it landing. Would like to see a physio if possible.',
    to: 'knee pain 2/12 since fall from bike, pt attributes to twisting on landing; req physio',
  },
];

export function appointmentReasonAnswer() {
  return answer({
    title: 'Writing the reason for appointment',
    subtitle: 'Lowercase, no full stops, clinical shorthand, one line',
    blocks: [
      bullets([
        'What the problem is',
        'How long, and which direction it is going',
        'What has been tried',
        'What they are asking for',
      ], 'Cut to'),

      bullets([
        'Pleasantries and narrative detail',
        'Contact preferences',
      ], 'Drop'),

      note('Keep a cause the patient gives as **theirs**, not as a finding. Keep any concern they raise about a specific drug or interaction — the prescriber needs that before deciding.', 'warn'),

      table(['What they wrote', 'Reason'], REASON_EXAMPLES.map((e) => [e.from, e.to])),
    ],
    source: ['Appointment reason'],
  });
}
