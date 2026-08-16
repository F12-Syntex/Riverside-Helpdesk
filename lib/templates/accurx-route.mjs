// Where an AccurX request actually goes, read rather than matched.
//
// THE MESSAGE THAT MADE THIS NECESSARY. A patient wrote in after a recent
// miscarriage: severe daily headaches, swelling and pain in BOTH legs, pain in
// the left shoulder, dizziness on looking up, bloods awaited. It came back as a
// First Contact Physiotherapist appointment.
//
// Nothing was broken. The pattern cascade in ./triage.mjs did exactly what it
// says: "leg pain" and "shoulder pain" made it musculoskeletal, "severe" made
// it disabling, and a disabling musculoskeletal problem is an FCP job. Every
// rule fired correctly and the answer was wrong, because the words were spread
// across four different complaints and no regex can see that the swelling is in
// two legs, that the headache is not the leg, or that "recent miscarriage"
// changes what all of it means together.
//
// THAT IS NOT A TUNING PROBLEM. Another feature word, another exclusion list,
// and the next message finds the next gap. What was missing is not a pattern —
// it is reading.
//
// SO /accurx GETS A READER, AND THE PATTERNS KEEP THE VETO.
//
//   The cascade runs first and unchanged. Whatever it decides is the FLOOR.
//   A model reads the message against the practice's own routing pages and
//   names a destination. Code takes the MORE SENIOR of the two.
//
// ONE READER PER DESTINATION, ALL ASKED AT ONCE.
//
// That reading was one call that picked one destination out of a list, and it
// was the slowest thing on the card. Not because the message is long — because
// the question is: "read all of this, hold every service the practice has in
// mind, weigh them against each other, and name one." A model asked that has to
// do all of the work before it can emit its first token, and the reader at the
// desk waits through every bit of it.
//
// It is now one small call per destination, issued together. Each one is asked
// a single closed question against that service's own description of what it
// covers and what it refuses, and against the list of the services BELOW it:
//
//   "Does this have to go to you, or would one of those have done?"
//
// THAT WORDING IS LOAD-BEARING. It was "does this belong with you?", which is a
// different claim from the one the fold makes of the answer, and the difference
// broke "pt has sore throat": the GP check said yes, because a GP genuinely can
// see a sore throat, and the most senior yes wins. A yes is read as "nothing
// less senior will do", so that has to be what is asked — and a check cannot
// answer it without being shown what less senior looks like. It is shown what
// is below it and never what is above, which is the one direction that informs
// without letting it defer.
//
//   Latency   they run concurrently, so the turn waits for the SLOWEST one
//             rather than for the sum. A closed question against one service
//             answers in a fraction of what the whole comparison took, so the
//             whole fan-out lands inside what the single call used to cost.
//
//   Recall    "is this beyond a pharmacist and a physiotherapist" is a far
//             easier question than "which of eight", and it is asked with only
//             the services it actually has to rule out in front of it. The
//             message that started this file is exactly the shape that gets
//             lost in a comparison and found in a straight question.
//
//   No second call    the answers are folded in code, by seniority — see
//             foldChecks. Asking a model to reconcile them would put back the
//             comparison this was split up to avoid, and would be one more
//             place a wrong answer could come from.
//
// A check that fails, times out or refuses is simply not a "yes", and the other
// checks stand. Every one of them failing is the same as never having asked.
//
// A model that says "physio is fine" changes nothing, because physio is below
// the floor. A model that says "this needs a doctor today" moves it, because
// that is above. The regex is the guarantee; the model is a recall booster —
// the same bargain ./safety/triage-pass.mjs already makes for acuity, and for
// the same reason: being wrong upwards costs a conversation with a doctor, and
// being wrong downwards is how something gets missed.
//
// IT NEVER FAILS THE TURN. No model, a timeout, a refusal, an unparseable
// answer, a destination that is not on the list — all of them leave the card
// exactly as the cascade already made it. There is no path here where asking
// produces a worse answer than not asking.
//
// AND IT REASONS FROM THE PRACTICE'S OWN MATERIAL. The destinations it asks
// about — lib/triage/destinations.mjs — are not a general model of NHS triage;
// they are the destinations this app already renders cards for, described with
// what the practice's own pages say each one covers and refuses. The Notebook
// goes in beside them. Nothing else it has ever read applies here, and the
// prompt says so.
import { z } from 'zod';
import { spanWithin } from '../safety/spans.mjs';
import { DESTINATIONS } from '../triage/destinations.mjs';

// THE DESTINATIONS ARE NOT WRITTEN OUT HERE ANY MORE.
//
// They were, and the pattern cascade in ./triage.mjs had its own order, and the
// signposting page read a third description live out of the Notebook. Three
// accounts of the same services, none of which knew when another changed — and
// the Notebook one could not be tested at all. They live in
// lib/triage/destinations.mjs now, and everything reads that.
//
// What this file still owns is what to DO with them: one closed question per
// destination, asked with that destination's own `covers` and `refuses` and the
// list of what sits below it, and the fold that takes the most senior yes.
//
// Re-exported because this is the file the checks and their tests are built
// around, and asking accurx-route what it asks about should not mean knowing
// where the answer is kept.
export { DESTINATIONS };


const BY_ID = new Map(DESTINATIONS.map((d) => [d.id, d]));

/** How senior a destination is. An unknown one is the bottom, so it can never raise anything. */
export function rankOfDestination(id) {
  const found = BY_ID.get(String(id || ''));
  return found ? found.rank : 0;
}

export const destinationLabel = (id) => (BY_ID.get(String(id || '')) || {}).label || '';

/**
 * ONE CALL, AND IT IS THE ONLY CALL /accurx MAKES.
 *
 * The reading was a fan-out — one closed question per destination, nine at once
 * — beside a second call that wrote the reason line. That shape existed because
 * the destinations were not written down anywhere a single prompt could be given
 * them: each check had to be handed its own service's description by name, and a
 * model asked "which of these nine" without those descriptions weighed services
 * it was only guessing at.
 *
 * They ARE written down now (lib/triage/destinations.mjs), which is what makes
 * one call viable: the whole ladder goes into the prompt as data, every entry
 * carrying what it covers and — the half that does the work — what it refuses.
 * So one reader sees exactly what nine readers saw between them, and the turn
 * costs one call rather than ten.
 *
 * WHAT MUST NOT COME BACK WITH THE SINGLE CALL. The first single-call version of
 * this answered "pt has sore throat" with a GP appointment, because it was asked
 * which service the message NEEDS and a GP genuinely can see a sore throat. That
 * is the whole reason the fan-out was written, and the fix is in the question,
 * not in the number of calls: it is asked for the LEAST SENIOR service that can
 * safely deal with the whole message. `refuses` is what makes that answerable —
 * "a GP appointment is not the safe default" is on the GP entry itself.
 *
 * AND THE PATTERNS STILL KEEP THE VETO. What comes back goes through applyRoute,
 * which takes the more senior of the reading and the cascade and nothing else.
 * A reading below the floor changes nothing, a missing or unparseable one
 * changes nothing, and there is no path here where asking produces a worse
 * answer than not asking.
 */
export const ACCURX_READ_SCHEMA = z.object({
  // THE REASONING COMES FIRST, AND IT IS NOT DECORATION.
  //
  // A message about ear pain for three to four months, ear drops already tried,
  // asking to see a GP, was answered with a Pharmacy First card for acute otitis
  // media — a pathway whose age range is 1 to 17, printed on the same card that
  // told reception to send an adult there. The words matched. Nothing in the
  // pipeline had to say WHY, so nothing had to notice that a problem lasting
  // months, which has already failed the treatment a pharmacist would offer, is
  // not minor illness whatever it is called.
  //
  // Asking for the reasoning BEFORE the destination is the fix. It is the first
  // field on purpose — a schema is filled in order, so this is where the answer
  // gets worked out, rather than a justification composed after the fact for one
  // already given. It is then shown to the reader on the card, which is the
  // other half of it: a routing decision nobody can check is one nobody can
  // correct.
  reasoning: z.string().default('')
    .describe('WORK IT OUT HERE, BEFORE YOU NAME A DESTINATION. Two or three plain sentences: what the patient is actually asking for, how long it has been going on, what they have already tried, and which service that leaves. Say the thing that decided it. Do not restate the message, do not diagnose, and write nothing you would not want a receptionist to read off the screen.'),
  ruledOut: z.array(z.object({
    id: z.enum(DESTINATIONS.map((d) => d.id)),
    why: z.string().default('').describe('One short sentence: why this service is not right for this message.'),
  })).default([])
    .describe('The services you considered and did not choose, with the reason. The one worth writing down is any whose description fits the WORDS but not the patient — a named condition on a pathway whose age range excludes them, or a problem that has already failed what that service can offer.'),

  // The routing half.
  destination: z.enum(['unsure', ...DESTINATIONS.map((d) => d.id)])
    .describe('The LEAST senior service on the ladder that can safely deal with this whole message, and it must follow from what you just wrote in "reasoning". Not the one that could see it — the one the practice would use. "unsure" if the message does not give you enough to say; it is a real answer, it is treated as "leave it where the practice’s own rules put it", and it is safer than a guess in either direction.'),
  evidence: z.string().default('')
    .describe('The words from the message that decided the destination, COPIED CHARACTER FOR CHARACTER. Not a summary and not your reasoning — a quote, one sentence at most. It is checked against the message and dropped if it is not found there.'),
  page: z.string().default('')
    .describe('The exact title of the Notebook page you relied on, copied from the list, or empty. Never invent one.'),
  // The two nurse clinics rank below a doctor, so their answer can almost never
  // be the destination — see signpostsFrom, which puts it on the card as a note
  // instead. Asked for separately because the destination field can only hold
  // one answer and this is a different question: not "where does this go" but
  // "does the nurse do this thing they are asking for".
  nurseClinics: z.array(z.object({
    id: z.enum(['nurse', 'diabeticNurse']),
    evidence: z.string().default('').describe('The words from the message that show they are asking for it, copied exactly.'),
  })).default([])
    .describe('Any nurse clinic that does something this message asks for, whether or not it is where the message goes. Empty is the normal answer.'),

  // The wording half. Unchanged in content from when it was its own call — the
  // rules are still the ones in ./writing.mjs, and they are still two lists.
  condition: z.string().default('')
    .describe('The problem, under its nearest common clinical name rather than the exact wording used, so "slightly red eyes with some discharge" becomes "conjunctivitis". This TITLES the card only. Keep it short. Empty if no problem was described.'),
  reason: z.string().default('')
    .describe('The single reason line. Lowercase, no full stops, clinical shorthand, one line. Empty only if the message describes no problem at all.'),
  details: z.array(z.string()).default([])
    .describe('At most 5 further shorthand points the CLINICIAN needs. Usually empty.'),
  booking: z.array(z.string()).default([])
    .describe('At most 5 short notes RECEPTION needs to make the booking. An empty array is the normal answer.'),
});

/**
 * The ladder, written out for the one reader.
 *
 * Least senior first, which is the order it is asked to work in. Every entry
 * carries both halves: a check that is only told what a service covers says yes
 * to anything adjacent to it, and it is `refuses` that stops a sore throat
 * becoming a GP appointment.
 */
function ladder() {
  return [...DESTINATIONS]
    .sort((a, b) => a.rank - b.rank || DESTINATIONS.indexOf(a) - DESTINATIONS.indexOf(b))
    .map((d) => [
      `- ${d.id} — ${d.label} (seniority ${d.rank})`,
      `    covers: ${d.covers}`,
      `    refuses: ${d.refuses}`,
    ].join('\n'))
    .join('\n');
}

/**
 * What the one call is asked: where it goes, and the wording, from one message.
 *
 * The two halves are kept apart in the prompt exactly as they were when they
 * were two calls, and for the same reason: they are read by different people.
 * The destination goes into the task that passes the patient on; the reason line
 * goes into whatever gets booked; the booking notes go to whoever picks the
 * slot. A reason line that started carrying "call after 2pm" would be a clinical
 * shorthand line with an appointment preference in it, and a condition that
 * started summarising the routing would title the card with a guess.
 */
export function accurxReadPrompt({ question, notebook = '', attached = '', reasonRules = [], bookingRules = [], extra = '' }) {
  const fence = (t) => String(t || '').replace(/"{3,}/g, '""');

  return [
    'You are reading one message a patient sent to The Riverside Practice, a UK GP surgery, through AccurX. Reception is dealing with it now.',
    '',
    'You are NOT writing the answer, NOT advising anybody, NOT diagnosing and NOT talking to the patient. The card the receptionist sees is built in code from the values you return.',
    '',
    'THE LADDER — every service the practice has, least senior first:',
    '',
    ladder(),
    '',
    'WORK IT OUT IN WRITING FIRST — "reasoning"',
    '- Before you name anything, write two or three plain sentences: what the patient is actually asking for, how long it has been going on, what they have already tried, and which service that leaves.',
    '- A CONDITION NAME IS NOT A ROUTE. "Ear infection", "sore throat", "back pain" appear on a service’s list because that service deals with the ORDINARY case of them. The message in front of you may not be the ordinary case, and the words will not tell you — the rest of the message will.',
    '- Four things change the answer more often than the condition does, and all four are in what the patient wrote:',
    '  · HOW LONG. Something going on for months, or coming back again and again, is not the same problem as something that started on Friday, however it is named.',
    '  · WHAT THEY HAVE ALREADY TRIED. A service has nothing left to offer somebody who has already had what it offers and is no better.',
    '  · WHAT THEY ARE ASKING FOR. "I want it looked at", "I want it checked", "I want medication reviewed" is a request for an examination or a decision, and a service that cannot examine or decide is not the answer to it.',
    '  · WHO THEY ARE. An age range on a pathway is a gate, not a guideline. If the patient is outside it that service cannot treat them at all, and naming it sends them somewhere that will turn them away.',
    '- Then write down what you considered and did not choose, in "ruledOut", with the reason. Any service whose description fits the WORDS but not this patient belongs there.',
    '',
    'WHERE IT GOES — "destination"',
    '- Name the LEAST SENIOR service on that ladder that can safely deal with the WHOLE message, and make it the one your reasoning just arrived at.',
    '- That is not the same question as which service could see it. A GP could see almost anything a patient writes in about; naming one for a message a pharmacist would have dealt with takes the patient off the service the practice actually uses. A sore throat is the pharmacy’s.',
    '- Read the whole message as ONE PICTURE. It usually describes several things at once, and where the whole person has to go is not always where the loudest symptom would go on its own — symptoms that are unremarkable apart can be the reason for the appointment together.',
    '- A recent pregnancy, miscarriage, termination or birth changes what new symptoms mean. So does a symptom nobody has explained, and so does anything the patient is already waiting on a result for. Any of those can put a message beyond a service that would otherwise have handled it.',
    '- Read what each service REFUSES as carefully as what it covers. That is the half that decides it.',
    '- "unsure" is a real answer and costs nothing: the practice’s own rules have already decided where this goes, and what you name can only ever move it somewhere MORE senior.',
    '- Put the words that decided it in "evidence", copied from the message exactly. They are checked against the message and dropped if they are not found in it.',
    '',
    'THE NURSE CLINICS — "nurseClinics"',
    '- Separately from where the message goes: if the practice nurse or the diabetic nurse does something this message asks for — a smear, a dressing, stitches out, a jab, a diabetic review — name it there with the patient’s own words, EVEN IF the message goes somewhere more senior. Reception is asked "does the nurse do this?" at the desk and the answer is useful either way.',
    '- Empty is the normal answer. Do not put a clinic there because it might.',
    '',
    '"condition" — the problem, so the routing card can be titled:',
    '- Its nearest common clinical name, not the words used — "bad back" becomes "back pain".',
    '- Short. It titles the card, and every red flag is worked out from the message itself, in code.',
    '- Empty only if no problem is described at all.',
    '',
    '"reason" — the one line that goes into the appointment for the clinician to read:',
    ...reasonRules.map((r) => '- ' + r),
    '',
    '"booking" — short notes for the receptionist making the booking:',
    ...bookingRules.map((r) => '- ' + r),
    '',
    'Anything about when they can attend or how to contact them goes in "booking", NEVER in "reason" and NEVER in "condition".',
    'Do not write how urgent this is anywhere. Urgency is decided in code from this same message, and a card that carried your opinion of it beside that would be showing two answers.',
    extra ? '\n' + extra : '',
    '',
    notebook
      ? [
        'THE PRACTICE NOTEBOOK — every page it holds, one line each. This is the only thing you know about how this practice works. Nothing else you have ever read applies here: not how other surgeries work, not what is usual in the NHS.',
        '',
        notebook,
        '',
        'If one of these pages is what decided where it goes, put its exact title in "page". Otherwise leave it empty.',
        '',
      ].join('\n')
      : '',
    attached ? 'ATTACHED DOCUMENT:\n"""\n' + fence(attached) + '\n"""\n' : '',
    'THE MESSAGE:',
    '"""',
    fence(question),
    '"""',
  ].filter((line) => line !== '').join('\n');
}

/**
 * What the reader said, in the shape applyRoute and signpostsFrom already take.
 *
 * The fan-out folded nine answers into this; one call returns it nearly whole,
 * and the adapter exists so that the two things which read a verdict never had
 * to learn where it came from. `saidYes` carries the nurse clinics for
 * signpostsFrom, which is the only thing that reads it.
 *
 * Returns null for a reading that did not happen at all — no key, a timeout, a
 * refusal — which is what applyRoute treats as "never asked".
 */
export function readingVerdict(read) {
  if (!read || typeof read !== 'object') return null;
  const said = String(read.destination || '').trim();
  if (!said) return null;

  const saidYes = (Array.isArray(read.nurseClinics) ? read.nurseClinics : [])
    .filter((clinic) => clinic && BY_ID.has(String(clinic.id || '')))
    .map((clinic) => ({
      id: String(clinic.id),
      evidence: String(clinic.evidence || ''),
      page: '',
    }));

  // A destination the ladder does not have is the same as no answer — see
  // applyRoute, which refuses to raise on an id it cannot rank.
  return {
    destination: BY_ID.has(said) ? said : 'unsure',
    evidence: String(read.evidence || ''),
    page: String(read.page || ''),
    // Why, in the reader's own words, and what it turned down. Carried whatever
    // the destination turned out to be: the card shows the reasoning even when
    // the reading agreed with the patterns, because "why is this the pharmacy's"
    // is the question reception is actually being asked at the desk.
    reasoning: String(read.reasoning || '').trim(),
    ruledOut: (Array.isArray(read.ruledOut) ? read.ruledOut : [])
      .filter((r) => r && BY_ID.has(String(r.id || '')))
      .map((r) => ({ id: String(r.id), label: destinationLabel(String(r.id)), why: String(r.why || '').trim() }))
      .filter((r) => r.why)
      .slice(0, 4),
    saidYes,
  };
}

/**
 * The nurse clinics that said yes and are not where the card is sending them.
 *
 * Not a routing decision and never rendered as one. It is the answer to a
 * question reception asks at the desk — "does the nurse do this?" — which the
 * ladder cannot answer for them, because a nurse clinic ranks below the doctor
 * the patterns default to and so its "yes" is always the losing one.
 *
 * The quote is checked against the message exactly as applyRoute checks the one
 * that moves a card: a note that could not prove its words keeps its clinic and
 * loses its quote, rather than telling the reader the patient wrote something
 * they did not.
 *
 * @param {object} verdict      what foldChecks returned, or null
 * @param {string} destination  where the card is actually sending them
 * @param {string} message      the whole message, for checking the quotes
 */
export function signpostsFrom(verdict, destination, message = '') {
  const at = String(destination || '');
  return (((verdict && verdict.saidYes) || []))
    .filter((said) => (BY_ID.get(String(said.id || '')) || {}).signpost && String(said.id) !== at)
    .map((said) => {
      const quote = String(said.evidence || '').trim();
      return {
        id: said.id,
        label: destinationLabel(said.id),
        because: quote && spanWithin(quote, message) ? quote : '',
      };
    });
}

/**
 * Fold what the reader said into what the patterns decided. Never lowers it.
 *
 * @param {string} floor    the destination the cascade chose — the id on its card
 * @param {object} verdict  what foldChecks made of the checks, or null on any failure
 * @param {string} message  the message itself, for checking the quote
 *
 * Returns the destination to render, and — only when the reader actually moved
 * it — the patient's own words that moved it. `because` is empty whenever the
 * quote could not be found in the message: an unevidenced escalation still
 * escalates (the safe direction), it just does not get to put a sentence on the
 * card claiming the patient said something they did not.
 */
export function applyRoute(floor, verdict, message = '') {
  const at = String(floor || '');
  const base = { destination: at, because: '', page: '', raised: false };
  if (!verdict) return base;

  const said = String(verdict.destination || '');
  if (!BY_ID.has(said)) return base;
  if (rankOfDestination(said) <= rankOfDestination(at)) return base;

  const quote = String(verdict.evidence || '').trim();
  return {
    destination: said,
    because: quote && spanWithin(quote, message) ? quote : '',
    page: String(verdict.page || '').trim().slice(0, 120),
    raised: true,
  };
}
