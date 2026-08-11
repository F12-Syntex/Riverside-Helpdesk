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
// same turn, and routing is what /triage is for.
export const BOOKING_RULES = [
  'Only what reception needs to make the booking. Never how urgent it is and never where the patient should go — neither is decided here.',
  'Who or what they asked for: a named clinician, a nurse, the physio, a telephone call rather than a face-to-face.',
  'When they can and cannot attend, and how they want to be contacted. The reason line drops these on purpose; this is where they belong.',
  'Anything the appointment has to be set up with: an interpreter and which language, step-free access, a chaperone, a double slot they have asked for.',
  'Whether somebody is writing on the patient’s behalf, and who.',
  'An empty list is the normal answer. Do not invent a note to fill it.',
  'Never include the patient’s name, NHS number, date of birth or address.',
];

/**
 * The reason line and the booking notes, from one pasted message.
 *
 * Two panels because they are read by two different people at two different
 * moments: the reason goes into the appointment for the clinician, the booking
 * notes are for whoever is choosing the slot, right now, with the patient on the
 * phone.
 *
 * NOTHING HERE DECIDES URGENCY. It writes wording. That is worth saying on the
 * card rather than assuming, because a card that summarises a patient's message
 * looks exactly like a card that has assessed it. What has actually assessed it
 * is the deterministic scan that runs over the same message on the same turn —
 * red flags, NG12 features, third-party requests — and renders above this card
 * when it finds something.
 */
export function appointmentBookingAnswer({ reason = '', details = [], booking = [] } = {}) {
  const line = String(reason || '').trim();
  // No reason line means nothing was pasted worth writing one from. The rules
  // card is the honest answer — still the practice's own material, and it tells
  // the reader what this command wants.
  if (!line) return appointmentReasonAnswer();

  return answer({
    title: 'Reason and booking notes',
    subtitle: 'The line to copy, and what the booking needs',
    blocks: [
      fields([field('Reason', line)], 'Copy into the appointment'),

      details.length ? bullets(details, 'Also worth the clinician seeing') : null,

      booking.length
        ? bullets(booking, 'Booking notes')
        : note('Nothing in the message affects how the appointment is booked.', 'info'),

      note('This writes the wording. It does **not** decide how urgent this is or where the patient goes — for that, ask it as a triage. Anything the practice’s safety checks found in this message is shown **above** this card.', 'warn'),

      expand('How the reason was written', [bullets(REASON_RULES)]),
      expand('What belongs in a booking note', [bullets(BOOKING_RULES)]),
    ],
    source: ['Appointment reason'],
  });
}

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
      fields([field('Title', title)], 'Coded'),
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
      fields([field('Reason', reason)], 'Written'),
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
