// /accurx — where it goes AND the line to copy, from one pasted request.
//
// WHY ONE COMMAND RATHER THAN THE TWO THIS REPLACED.
//
// An AccurX request arrives as the patient's own words, and reception does two
// things with it, in this order and within about a minute: decide where it goes,
// and write the line that goes into whatever they book. There used to be a
// command for each — /triage answered the first and said nothing about the
// second; /appt answered the second and said outright that it had not decided
// the first. Getting both meant pasting the same message twice, and the half
// that got pasted second is the half that got skipped when the phone rang. So
// they are gone, and this is what is left.
//
// The two halves are unchanged by sitting on one card. The routing is
// triagePatientAnswer, running the practice's own order top to bottom over the
// destinations in lib/triage/destinations.mjs. The wording is the reason line
// and the booking notes under the rules in writing.mjs. Nothing here is a third
// opinion; if this file ever starts deciding anything of its own, that is the
// bug.
//
// WHAT IT DOES DECIDE IS ORDER, and only that:
//
//   Ordinarily      destination, then the reason line, then the rest of the
//                   routing card. The two things that leave the card sit
//                   together at the top, because they leave it together.
//
//   On an emergency  the whole routing card first, and the wording after it,
//                   with no Copy on it. A card that answers "interrupt the duty
//                   doctor now" must not have a tidy appointment line as the
//                   second thing on it — nobody is booking an appointment, and
//                   the line is only there for the handover note.
//
// Which of the two it is comes from `endsInAnEmergency` in triage.mjs — the
// same checks, in the same file, as the branches that produce those cards. It
// is asked there rather than answered here on purpose: a second red-flag test
// living in this file is a second red-flag test to keep in step, and the one
// that fell behind would be the one deciding whether an emergency card offers
// an appointment line.
import { answer, bullets, expand, field, fields, note } from './blocks.mjs';
import {
  clinicianAnswer, endsInAnEmergency, eyeEmergencyAnswer, raisedAnswer, raisedEmergencyAnswer, triagePatientAnswer,
} from './triage.mjs';
import { applyRoute, destinationLabel, signpostsFrom } from './accurx-route.mjs';
import { BOOKING_RULES, REASON_RULES } from './writing.mjs';

// The wording half: the line the clinician reads, and the notes whoever is
// choosing the slot needs. The two lists are kept apart, which is the whole
// reason the reason rules are allowed to drop "call after 2pm" — it has
// somewhere else to go.
function wordingBlocks({ line, details, booking, bookable }) {
  if (!line) {
    return [
      note('Nothing in this message describes what the appointment would be for, so there is no reason line to write. Where it goes is above.', 'info'),
    ];
  }

  return [
    bookable
      // Two Copies on one card, which is deliberate and is the exception. The
      // rule elsewhere is one per card, so that the reader can see at a glance
      // which value they came for; here they came for both, one for the task
      // that passes the patient on and one for the appointment itself. A card
      // that hands over one of them and makes them retype the other has only
      // done half of what typing /accurx asked for.
      ? fields([field('Reason', line, { copy: true })], 'Copy into the appointment')
      : fields([field('Reason', line)], 'For the handover note'),

    details.length ? bullets(details, 'Also worth the clinician seeing') : null,

    bookable
      ? (booking.length
        ? bullets(booking, 'Booking notes')
        : note('Nothing in the message affects how the appointment is booked.', 'info'))
      // Not a booking, so the booking notes are not booking notes. Whatever the
      // patient said about interpreters, access or when to reach them still
      // matters to whoever picks this up, so it is passed on rather than
      // dropped — just not under a heading about choosing a slot.
      : (booking.length ? bullets(booking, 'Also said in the message') : null),
  ];
}

// How the wording was arrived at. Always last, whichever order the card is in:
// these are two disclosures about house style, and the routing steps above them
// are what somebody is doing right now. A rules panel sitting between "where
// this goes" and "how to book it" is a rules panel in the way.
const wordingRules = () => [
  expand('How the reason was written', [bullets(REASON_RULES)]),
  expand('What belongs in a booking note', [bullets(BOOKING_RULES)]),
];

// A NURSE CLINIC THAT SAID THIS WAS THEIRS, WHEN THE CARD IS NOT GOING THERE.
//
// The commonest thing a patient writes into AccurX that has an obvious right
// answer is the one the ladder cannot give: a smear, a dressing, travel jabs,
// a diabetic review. The patterns send anything they do not recognise to a
// doctor, a nurse clinic ranks below a doctor, and a verdict may never move
// anything down — so the nurse's "yes" is structurally always the losing one.
//
// It goes on the card as a note rather than as the destination. WHERE THIS GOES
// IS NOT TOUCHED: the panel above still says what the practice's own rules
// decided, and nothing here can move it. What the note adds is the one fact
// reception was going to ring somebody to ask — the nurse does this — and the
// decision stays theirs, which is where it already was.
//
// Never on a card nobody is booking from, and never beside the duty doctor:
// "the nurse does this too" under an answer that means today is an invitation
// to book the wrong thing, and that gate is in accurxAnswer, not here.
function clinicNote(clinics) {
  if (!clinics.length) return null;
  const named = clinics.map((c) => '**' + c.label + '**').join(' and ');
  const quoted = clinics.map((c) => c.because).filter(Boolean)[0] || '';
  return note(
    'Reading the message, ' + named + ' does what is being asked for'
    + (quoted ? ' — the patient’s own words: “' + quoted + '”' : '')
    + '. Where this goes above is the practice’s own rules and nothing here has changed it. If a nurse appointment is all this needs, that is your call to make.',
    'info',
  );
}

// THE CARD FOR A RAISE, CHOSEN BY THE DESTINATION IT NAMES.
//
// This used to be a single question — "is it an emergency?" — and everything
// that was not one got the doctor card. That held only while the ladder had
// nothing between the pharmacy and a GP on it, and it stopped holding the
// moment anything did: a message the patterns put on a pharmacy list and the
// reading moved to the physiotherapist came back saying "A GP appointment
// here", which is neither where it was sent nor what anybody should book.
//
// So the destination picks the card, and an id this file has not been told
// about renders as itself rather than as a doctor. See triage.mjs, where all
// three of these live together.
function raisedCard(decided, pattern, condition) {
  const wouldHave = destinationLabel(pattern.destination || '');

  if (decided.destination === 'emergency') {
    return raisedEmergencyAnswer({ condition, because: decided.because });
  }
  // The other card nobody books off, and a different act from the one above:
  // nobody in this building stands up, the patient walks into Moorfields. It is
  // the SAME card the pattern cascade builds — address, telephone and the fact
  // that they can walk in — with the words that moved it added.
  if (decided.destination === 'eyeEmergency') {
    return eyeEmergencyAnswer({ condition, because: decided.because });
  }
  if (decided.destination === 'dutyDoctor' || decided.destination === 'gp') {
    return clinicianAnswer({
      condition,
      sameDay: decided.destination === 'dutyDoctor',
      wouldHave,
      because: decided.because,
      page: decided.page,
    });
  }
  return raisedAnswer({
    condition,
    destination: decided.destination,
    sendTo: destinationLabel(decided.destination),
    wouldHave,
    because: decided.because,
    page: decided.page,
  });
}

/**
 * One AccurX request, routed and written up.
 *
 * `condition` names the problem and titles the card; `text` is the message it
 * came from and is what every routing check actually runs over. `complaint` is
 * the verbatim span of the one request the card is about, when the message
 * carried several — it narrows what the routing card may claim.
 *
 * `reason`, `details` and `booking` are the wording, written by the model from
 * the WHOLE message under the rules in writing.mjs. They are deliberately not
 * narrowed to the complaint: the clinician is about to see this patient about
 * everything they wrote, and a reason line cut down to one of five requests
 * describes an appointment nobody is having.
 *
 * `route` is what the reader made of the whole message — see
 * ./accurx-route.mjs. It can only ever move the card to a MORE senior
 * destination than the patterns chose; anything else is ignored here, in one
 * comparison, so a bad verdict cannot reach the reader. Null, missing, or a
 * turn where the reading did not run, and this file behaves exactly as it did
 * before any of it existed.
 *
 * The one thing it carries besides that destination is which nurse clinics
 * said the message was theirs, which is a NOTE on the card and never the
 * card's answer. See clinicNote for why they cannot be a destination.
 */
export function accurxAnswer({
  condition = '', text = '', complaint = '',
  reason = '', details = [], booking = [],
  route = null, message = '',
} = {}) {
  const pattern = triagePatientAnswer({ condition, text, complaint });

  // THE ONE COMPARISON. `applyRoute` returns the floor's own destination unless
  // the reading named a more senior one, so `raised` is false for every turn
  // that did not move — including every turn where no reading ran at all.
  //
  // The quote is checked against the WHOLE message, not against `text`. On a
  // decomposed message `text` is the one complaint the card is about, and the
  // words that moved this are very often in a different one — that is the whole
  // reason reading the message beat matching it.
  const decided = applyRoute(
    pattern.destination || '',
    route,
    [condition, message || text].filter(Boolean).join('\n'),
  );
  const routing = decided.raised ? raisedCard(decided, pattern, condition) : pattern;
  const blocks = routing.blocks || [];

  // Nobody is booking anything off an emergency card, so the wording is not an
  // appointment line on one: it loses its Copy, it is named for what it is, and
  // it goes below everything the routing card has to say. A reading that raised
  // this to an emergency counts, for the same reason the patterns do — the test
  // is what the card now says, not which of the two said it.
  //
  // The eye A&E is on this list for exactly the same reason, even though the
  // patient is walking into a hospital rather than being handed to the duty
  // doctor: either way nobody is booking an appointment, and a tidy reason line
  // with a Copy on it is an invitation to book one.
  const urgent = decided.destination === 'emergency'
    || decided.destination === 'eyeEmergency'
    || endsInAnEmergency({ condition, text });

  // Every routing card leads with its destination panel — see triage.mjs, where
  // "where it goes" is the one thing that leaves the card. Anything else is a
  // card shape this file has not been told about, and the safe reading of that
  // is to leave the routing card whole and put the wording after it rather than
  // to guess at where its middle is.
  const where = blocks[0] && blocks[0].type === 'fields' ? blocks[0] : null;
  const hoist = !!where && !urgent;

  const wording = wordingBlocks({
    line: String(reason || '').trim(),
    details: (details || []).filter(Boolean).slice(0, 5),
    booking: (booking || []).filter(Boolean).slice(0, 5),
    bookable: !urgent,
  });

  const handover = urgent
    ? note('This is not an appointment to book. The wording below is for the **handover** — say what the patient reported, in their words, and pass it on now.', 'warn')
    : null;

  // THE GATE ON THE NURSE NOTE, and it is two things at once. Nothing is
  // suggested on a card nobody is booking from, and nothing is suggested beside
  // an answer that means today: "the nurse does this too" under the duty doctor
  // is an invitation to book the wrong thing on the one card where the wrong
  // thing costs the most. Everywhere else the note is a fact reception would
  // otherwise ring somebody for.
  const clinics = urgent || decided.destination === 'dutyDoctor'
    ? []
    : signpostsFrom(route, decided.destination, [condition, message || text].filter(Boolean).join('\n'));

  return answer({
    title: routing.title,
    subtitle: routing.subtitle,
    // Where this card actually sends them, whichever half decided it. Carried
    // so the turn can be logged with the reading's answer beside the outcome.
    destination: decided.destination,
    blocks: hoist
      ? [where, ...wording, ...blocks.slice(1), clinicNote(clinics), ...wordingRules(), footer(decided.raised)]
      : [...blocks, handover, ...wording, clinicNote(clinics), ...wordingRules(), footer(decided.raised)],
    // Both halves, named. The routing pages first, because the routing is what
    // the top of the card says.
    source: [...new Set([...(routing.source || []), 'Appointment reason'])],
  });
}

// The one thing this card must say about itself. It looks like a card that has
// read the patient's message and formed a view of it, and half of it has not:
// the wording is a rewrite and asserts nothing. Where the urgency was actually
// decided is worth pointing at rather than leaving to be assumed.
//
// And when the whole message WAS read, the footer says so rather than claiming
// the triage order alone got here. A card that hides which of the two decided
// it is a card nobody can check.
function footer(raised = false) {
  return note(
    (raised
      ? 'Where this goes was decided by **reading the whole message** against the practice’s pages, on top of the practice’s own triage order — which had it going somewhere less senior. Reading can only ever send something to a MORE senior destination, never a less senior one.'
      : 'Where this goes is decided by the practice’s own triage order, from the whole message.')
    + ' The reason line only **rewrites** what the patient wrote — it judges nothing. Anything the safety checks found is shown **above** this card.',
    'warn',
  );
}
