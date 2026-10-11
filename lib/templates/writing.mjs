// The house style for what reception WRITES: the appointment reason line and
// the booking notes the /accurx card carries, and the record entry for a
// contact with a patient (/consultation).
//
// House style is only worth writing down once. The rules below are handed to
// the model that fills each card and shown on the card that explains them, so
// the two cannot drift apart; and the entry itself is assembled in code
// (consultationEntry) rather than asked for in a prompt.
import { answer, bullets, expand, field, fields, note } from './blocks.mjs';
import { failureNote } from './failure.mjs';

// THE EMIS APPOINTMENT REASON, in the practice's own house style. One line the
// clinician reads before the consultation, as short as it can be while still
// saying what the patient wants and why.
export const REASON_RULES = [
  'One line, as short as possible — aim for under 25 words.',
  'Lowercase clinical shorthand: pt, req, bk’d, hx, inj, bilat, ?condition, sx, yday, tmrw, f/u, abx, meds.',
  'Durations as /7, /52, /12 for days, weeks and months — 3/52, not 3 wks.',
  'Separate clauses with semicolons; use commas within a clause.',
  'Order: what pt wants; main sx/problem (with duration or trend if relevant); relevant hx; other key context (pregnancy, breastfeeding, travel dates, deadlines).',
  'Spell out anything ambiguous — write "breastfeeding", not "bf".',
  'Keep a cause the patient gives as theirs (pt attributes to…), and any concern about a specific drug or interaction.',
  'No full sentences, no greetings, no emotional wording, no contact times, no repetition.',
  'Never include the patient’s name, NHS number, date of birth or address.',
];

// Worked examples of the finished line, handed to the /accurx reading as
// "example output".
export const REASON_LINE_EXAMPLES = [
  'pt req bloods bk’d sooner ?b12 def; worsening bilat tingling face/limbs; hx severe b12 def (inj); breastfeeding, travelling 22/10',
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
  'One entry for the record, in clinical shorthand: standard abbreviations (pt, c/w, tel, f2f, r/v, f/u, d/w, req, adv, DNA, TCI, SOS, s/n) and durations as /7, /52, /12. Lowercase apart from names of services, drugs and clinicians; no full stops between items — a semicolon separates them.',
  'It is made short by the shorthand, never by leaving something out. Everything the note says happened is in the entry; the abbreviations are what keep it to a line.',
  'Lead with the kind of contact and who initiated it: "tel c/w pt", "pt attended desk", "pt msg via AccurX", "tel c/w daughter (with pt consent)".',
  'Say how the contact ended where the patient was not reached: "tel pt, no answer", "tel pt, no answer, VM left", "tel pt x2, no answer". A call nobody picked up is still an entry — it is what the next person needs before ringing again.',
  'Then what it was about, in the patient’s own terms where those matter: what the problem or request is, how long, what has been tried, what they asked for.',
  'Keep EVERY symptom the note names, all of them, in the order they were written: "fever, cough w/ mucus, sore throat". Three of the four symptoms describes a different patient from the one who rang.',
  'Keep how long it has gone on and which way it is going: "1/52 unchanged", "3/7 worsening", "settling since Mon". Unchanged is not padding — it is usually why the patient is ringing again.',
  'Keep what the patient asked for in their own terms, whether or not it is what they will get: "req abx", "req sick note", "wants to be seen today".',
  'Then what was done, as facts: booked, tasked, advised, referred, messaged, chased, declined — with who and when where they were said. "booked tel appt Dr Okafor 04-Sep", "tasked secretaries re referral letter", "adv 111 if worse o/n".',
  'Keep what is still to happen where the note says so, as plainly as it was said: "to book appt Fri", "pt to call back pm".',
  'Drop only what changes nothing for the next person: pleasantries, hold music, how the patient felt about waiting, and anything the record already holds. Never drop a symptom, a duration, a request or an action to save room.',
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

// THE SAME ENTRY, IN WORDS.
//
// The entry is written in the shorthand the record is read in, which is right:
// it is read by clinicians, in seconds, and "1/52 unchanged" is faster than the
// sentence it stands for. But the person checking it is the receptionist who
// just wrote the note, and the check they are making is "is everything I said
// in there" — which is exactly the check shorthand makes hard. A detail that
// was dropped is invisible in a line of abbreviations.
//
// So the card shows the entry twice: the shorthand that gets copied onto the
// record, and underneath it the same line with the abbreviations expanded, to
// read rather than to copy. Expanded HERE, in code, from the list the rules
// name — never by a model, which would be free to reword it and could quietly
// disagree with the line above it.
//
// Order matters: the longer form goes first where one pattern is a prefix of
// another ("c/w" before "w/", "d/w" before "w/"), or the shorter one eats it.
const SHORTHAND = [
  // "tel pt" is a call the practice made, and reads as one; the generic rules
  // below would leave it as the two words it abbreviates.
  [/\btel\s+pt\b/gi, 'telephone call to patient'],
  [/\bc\/w\b/gi, 'call with'],
  [/\bd\/w\b/gi, 'discussed with'],
  [/\bs\/n\b/gi, 'safety-netting'],
  [/\bf\/u\b/gi, 'follow-up'],
  [/\br\/v\b/gi, 'review'],
  [/\bo\/n\b/gi, 'overnight'],
  [/\bc\/o\b/gi, 'complaining of'],
  [/\bw\/\s/gi, 'with '],
  [/\bf2f\b/gi, 'face-to-face'],
  [/\bDNA\b/g, 'did not attend'],
  [/\bTCI\b/g, 'to come in'],
  [/\bSOS\b/g, 'as needed'],
  [/\bNAA\b/g, 'no answer'],
  [/\bVM\b/g, 'voicemail'],
  [/\bpt\b/gi, 'patient'],
  [/\btel\b/gi, 'telephone'],
  [/\bappt\b/gi, 'appointment'],
  [/\bmsg\b/gi, 'message'],
  [/\breq\b/gi, 'requests'],
  [/\badv\b/gi, 'advised'],
  [/\babx\b/gi, 'antibiotics'],
  [/\bhx\b/gi, 'history'],
  [/\bre\b/gi, 'about'],
  // Durations. The number decides the plural, so "1/52" reads "1 week" and
  // "2/52" reads "2 weeks" rather than the same word twice.
  [/\b(\d+)\/7\b/g, (_, n) => n + (n === '1' ? ' day' : ' days')],
  [/\b(\d+)\/52\b/g, (_, n) => n + (n === '1' ? ' week' : ' weeks')],
  [/\b(\d+)\/12\b/g, (_, n) => n + (n === '1' ? ' month' : ' months')],
];

/**
 * The entry with its abbreviations written out, for reading rather than for
 * copying.
 *
 *   plainEnglish('tel c/w pt: sore throat 1/52, req abx; adv 111 if worse o/n')
 *   → 'Telephone call with patient: sore throat 1 week, requests antibiotics;
 *      advised 111 if worse overnight'
 *
 * Only the abbreviations change. Nothing is added, nothing is reordered and
 * nothing is dropped, so the two lines on the card always say the same thing.
 */
export function plainEnglish(entry = '') {
  const line = SHORTHAND.reduce((s, [pattern, to]) => s.replace(pattern, to), String(entry || '').trim());
  return line ? line.charAt(0).toUpperCase() + line.slice(1) : '';
}

/**
 * The finished record entry for a contact that was written up in the box. The
 * model supplies the parts; the entry itself is assembled by consultationEntry,
 * so the shape is enforced in code rather than asked for in a prompt.
 */
export function consultationNoteAnswer({ contact = '', summary = '', actions = [], safetyNet = '', unclear = [] } = {}) {
  const entry = consultationEntry({ contact, summary, actions, safetyNet });
  return answer({
    title: 'Record entry',
    subtitle: 'Copy this onto the patient\u2019s record',
    blocks: [
      // The whole point of this card is a string that goes on the record, so it
      // carries its own Copy. The plain reading sits under it as a hint rather
      // than as a block of its own: it is the same line, and it is never what
      // gets copied.
      fields([field('Entry', entry, { copy: true, hint: plainEnglish(entry) })], 'Written'),

      // The entry taken apart, in the order it is assembled. The reader is
      // checking one thing — that everything they wrote is in there — and a
      // line of shorthand is the hardest possible place to notice something
      // missing. Every part is shown even when it is empty, because an empty
      // part is the finding: "none given" under safety-netting is worth more
      // than a row that quietly is not there.
      fields([
        field('Contact', contact, { missing: 'the note does not say how the contact happened' }),
        field('What it was about', summary, { missing: 'the note does not say what it was about' }),
        field('What was done', actions.join('; '), { missing: 'the note does not say anything was done' }),
        field('Safety-netting', safetyNet, { missing: 'none given, and none is added' }),
      ], 'Part by part'),

      // What the note left open, said back to the reader rather than filled in:
      // an entry that guesses a date or a name is worse than one that says the
      // note did not give it.
      unclear.length ? note('**Not in the note, so not in the entry:** ' + unclear.join('; ') + '.', 'warn') : null,
      expand('How this was written', [bullets(CONSULTATION_NOTE_RULES)]),
    ],
    source: ['Consultation note'],
  });
}

export function consultationNoteRulesAnswer({ failed = '' } = {}) {
  return answer({
    title: 'Writing up a contact with a patient',
    subtitle: failed
      ? 'No entry could be written — this is the house style instead'
      : 'One line on the record, in the shorthand it is read in',
    blocks: [
      // A card standing in for an answer that failed says so first. Without
      // this the house style IS the answer, and a mode that could not reach a
      // model reads as a mode that does not work.
      failureNote(failed, 'No entry was written from your note'),

      fields([
        field('Shape', 'contact: what about; what was done; what was done; safety-net'),
        field('Contact', 'tel c/w pt · pt attended desk · pt msg via AccurX · tel c/w daughter (with pt consent)'),
        field('Not reached', 'tel pt, no answer · tel pt, no answer, VM left · tel pt x2, no answer'),
      ], 'The entry'),

      note('The shorthand is what makes the entry short — **never leaving something out**. A symptom, a duration, a request or an action that was in the note is in the entry, however long the note was.', 'info'),

      note('Write what was **said** and what was **done**. The entry is read by whoever the patient reaches next, so it must let them carry on rather than start again — and it must not tell them something that did not happen.', 'warn'),
    ],
    source: ['Consultation note'],
  });
}
