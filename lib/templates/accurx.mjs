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
import { destinationCard, meansNow } from './route-card.mjs';
import { signpostsFrom } from './accurx-route.mjs';
import { spanWithin } from '../safety/spans.mjs';
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
      // AN EMPTY LIST IS SILENCE, NOT A FINDING.
      //
      // This said "Nothing in the message affects how the appointment is booked"
      // whenever the booking list came back empty — which is the same output as
      // never having looked. It printed that sentence under a reason line
      // reading "pain now high", and on a message whose closing words were "no
      // appointment needed". A receptionist was being told a negative nobody had
      // checked, in the one place they would stop reading if they believed it.
      //
      // So an empty list renders nothing at all. The reader is told less, never
      // told something that was not established.
      ? (booking.length ? bullets(booking, 'Booking notes') : null)
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

// THE CARD FOR A RAISE HAS GONE, because nothing raises anything here now.
// The reading names the destination and ./route-card.mjs renders it. What used
// to live here — choosing between an emergency card, an eye card and a doctor
// card by comparing two answers — was the machinery of a floor that no longer
// exists.


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
  // THE READING DECIDES. THERE IS NO PATTERN FLOOR UNDER IT ANY MORE.
  //
  // There was, and every card that has gone wrong went wrong through it: a
  // urinary infection sent to a physiotherapist because "no back pain" contains
  // "back pain"; an adult's three-month ear problem answered with a pathway for
  // children because "ear infection" is on a list; and — the one that settled
  // it — an emergency band telling reception to interrupt a doctor about a chest
  // pain the same sentence said had happened last winter, been investigated at
  // A&E, and turned out to be reflux.
  //
  // Every one of those was a word matching. The layer that had actually
  // understood the message was forbidden from correcting any of them, because
  // the rule was that patterns are the floor and a reading may only raise. That
  // rule is right when the floor is right; when the floor fires on a word, it
  // makes the mistake permanent.
  //
  // So on this path the reading is the answer, and its account of itself is on
  // the card for somebody to disagree with. What the practice's own routes ARE —
  // what each takes, what it refuses, how it is actioned — is still code, still
  // from docs/routing.md, and is what renders below; see ./route-card.mjs.
  const said = String(condition || '').trim();
  const whole = message || text;
  const verdict = route || {};
  const named = String(verdict.destination || '').trim();

  // A quote is only shown if the patient actually wrote it. Checked against the
  // WHOLE message: on a decomposed message `text` is the one request this card
  // is about, and the words that decided it are very often in another.
  const quote = String(verdict.evidence || '').trim();
  const because = quote && spanWithin(quote, [said, whole].filter(Boolean).join('\n')) ? quote : '';

  // Nothing was read at all — no key, a timeout, a refusal. The practice's own
  // rule covers it and this file follows it rather than inventing something:
  // what cannot be placed goes to the duty doctor.
  const destination = named && named !== 'unsure' ? named : 'dutyDoctor';
  const unread = !named || named === 'unsure';

  const routing = destinationCard({ id: destination, condition: said || whole, because });
  const blocks = routing.blocks || [];
  const decided = { destination: routing.destination, because, raised: false };

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
  // NOBODY BOOKS ANYTHING OFF A CARD THAT MEANS NOW, and which cards those are
  // is decided by SENIORITY rather than by a list of destination names.
  //
  // The list was `emergency` and `eyeEmergency`, so `dutyInterrupt` and `ae`
  // — both of which mean somebody moves immediately — came out with a tidy
  // "Copy into the appointment" panel on them. And a list of names is the same
  // fragility one layer in: the identical message rendered the full emergency
  // card when the model called it "cauda equina syndrome" and none of it when
  // the model called it "lower back pain with neurological symptoms". Rank is a
  // property of the destination; the noun is a property of the sentence.
  const urgent = meansNow(decided.destination);

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

  // WHY, IN THE READER'S OWN WORDS. Directly under where it goes, on every card
  // the reading touched — not only the ones it moved. "Why is this the
  // pharmacy's?" is the question reception is asked at the desk, and a card that
  // gives a destination with no account of it can only be believed or ignored.
  const why = justification(route);

  // EVERYTHING ELSE THE MESSAGE ASKED FOR. One card answers one request, and
  // the commonest AccurX message asks for four. This is where the other three
  // live — including the ones for other people, and the one the writer played
  // down on the patient's behalf.
  const asked = Array.isArray(verdict.requests) ? verdict.requests : [];
  const others = asked.filter((r) => r && r.what);
  const panel = others.length > 1
    ? bullets(
      others.map((r) => {
        // NO ITALICS. app/_components/chat/Rich.jsx renders **bold** and four
        // tags, and nothing else — there is no single-asterisk pattern in it.
        // So `*(her 14-year-old son)*` reached the front desk with the
        // asterisks still on it. The words carry it instead of the markup.
        const who = r.who ? ' (for ' + r.who + ')' : '';
        const goes = r.label ? ' → **' + r.label + '**' : '';
        // A REQUEST THE READING COULD NOT PLACE IS STILL A REQUEST.
        //
        // `goes` may come back "unsure", which readingVerdict renders as no
        // label at all; and `note` is now explicitly "empty when goes already
        // says it". A row can therefore arrive with neither, and it used to
        // render as a name with nothing after it — inside the one panel whose
        // whole purpose is that the other four asks survive. A bullet reading
        // only "letter for the council" is an ask the reader takes as handled.
        const does = r.note || (r.label ? '' : 'not placed — your call');
        return '**' + r.what + '**' + who + goes + (does ? ' — ' + does : '');
      }),
      'Everything this message asked for',
    )
    : null;

  // What changes how it is handled rather than where it goes, and where what the
  // patient needs does not meet what the practice offers. Both from the reading,
  // both the practice's own categories (see MODIFYING_FLAGS in destinations).
  const flags = (verdict.flags || []).length ? bullets(verdict.flags, 'Also true of this patient') : null;
  // JOINED WITH A SEPARATOR RATHER THAN A SPACE. Nothing makes a collision end
  // in a full stop — the reading is asked to "say the collision plainly", and
  // what comes back is a clause. Three of them concatenated with a space became
  // one unreadable sentence, and a note is rendered as a single line with no
  // break available inside it, so there was nothing on screen to separate them.
  //
  // ONE collision is left exactly as it was written, punctuation and all. There
  // is nothing to separate it from, and trimming its full stop off would be this
  // file editing the sentence for no reason.
  const collisions = verdict.conflicts || [];
  const conflicts = collisions.length
    ? note(
      '**This will not book the usual way.** '
      + (collisions.length === 1
        ? collisions[0]
        : collisions.map((c) => String(c).replace(/[.;,\s]+$/, '')).join(' · ')),
      'warn',
    )
    : null;

  const couldNotRead = unread
    ? note('The message could not be read this time, so nothing has decided where it goes. It is with the **duty doctor** because that is what the practice does with anything it cannot place — not because anything about it was assessed.', 'warn')
    : null;

  return answer({
    title: routing.title,
    subtitle: routing.subtitle,
    // Where this card actually sends them. Carried so the turn can be logged
    // with the reading's answer beside the outcome.
    destination: decided.destination,
    blocks: hoist
      ? [where, ...why, ...wording, conflicts, flags, panel, ...blocks.slice(1), clinicNote(clinics), couldNotRead, ...wordingRules(), footer(why.length > 0)]
      : [...blocks, handover, ...why, ...wording, conflicts, flags, panel, clinicNote(clinics), couldNotRead, ...wordingRules(), footer(why.length > 0)],
    // Both halves, named. The routing pages first, because the routing is what
    // the top of the card says.
    source: [...new Set([...(routing.source || []), 'Appointment reason'])],
  });
}

/**
 * What the reading decided, and what it turned down.
 *
 * THE CARD THAT MADE THIS NECESSARY said "Acute otitis media — Pharmacy First,
 * age range 1 to 17" about an adult whose ear had been troubling them for three
 * to four months, who had already tried ear drops, and who had written down that
 * they wanted a GP to look at it. Every word on it was right about the words in
 * the message and wrong about the patient, and there was nothing on the card to
 * disagree with — a destination, some steps, and no account of itself.
 *
 * So the reader's own reasoning goes on the card, whether or not it moved
 * anything. Reception can then see the case being made and say "no, that is not
 * this patient" — which is the only kind of checking a card like this can
 * actually get.
 *
 * `ruledOut` is the more useful half in practice: it is where a service whose
 * words fit and whose patient does not gets named, which is exactly the failure
 * above.
 */
function justification(route) {
  const said = route || {};
  const reasoning = String(said.reasoning || '').trim();
  const ruledOut = Array.isArray(said.ruledOut) ? said.ruledOut.filter((r) => r && r.why) : [];
  if (!reasoning && !ruledOut.length) return [];

  // THE REASON IS ON THE CARD, NOT BEHIND IT.
  //
  // This was one collapsed panel, and the evaluation found the consequence
  // across four different cases: the card reasoned better than it acted. A
  // request for a 14-year-old's blood test worked out correctly that the
  // practice does not do paediatric phlebotomy and that it has to happen
  // elsewhere — and the only place that appeared was inside the disclosure,
  // under a card whose visible answer was "a doctor task". A rule nobody sees
  // is a rule that did not change anything.
  //
  // So the account itself is a note in the open. What stays behind the
  // disclosure is the list of services turned down, which is the part a reader
  // consults rather than reads.
  return [
    reasoning ? note('**Why here.** ' + reasoning, 'info') : null,
    ruledOut.length
      ? expand('Considered and not chosen', [
        bullets(ruledOut.map((r) => `**${r.label || r.id}** — ${r.why}`)),
        note('This is the **reading’s** account of the message, not a clinical opinion. If it has misread the patient in front of you, route it yourself — you are the one who can see them.', 'warn'),
      ], ruledOut.map((r) => r.label || r.id).join(', ').slice(0, 90))
      : null,
  ];
}

// The one thing this card must say about itself. It looks like a card that has
// read the patient's message and formed a view of it, and half of it has not:
// the wording is a rewrite and asserts nothing. Where the urgency was actually
// decided is worth pointing at rather than leaving to be assumed.
//
// And when the whole message WAS read, the footer says so rather than claiming
// the triage order alone got here. A card that hides which of the two decided
// it is a card nobody can check.
//
// AND IT ONLY CLAIMS THE ACCOUNT IS HERE WHEN IT IS. `reasoning` is one
// sentence now and it may be empty, and justification() renders nothing at all
// when it is — leaving a card that named a destination, said nothing about why,
// and then told the reader in its own last line that the account of the reading
// was on it. The one thing this footer exists to be is true.
function footer(accounted = true) {
  return note(
    'Where this goes was decided by **reading the whole message** against the practice’s own routes'
    + (accounted
      ? ', and the account of that reading is on this card'
      : ', and it gave no account of itself this time — so there is nothing on this card to check it against')
    + '. There is no keyword matching underneath it: if the reading has misread the patient in front of you, route it yourself. The reason line only **rewrites** what the patient wrote — it judges nothing.',
    'warn',
  );
}
