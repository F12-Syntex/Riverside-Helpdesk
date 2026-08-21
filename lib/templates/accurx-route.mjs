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
import { BLOODS_FIRST, DESTINATIONS, HARD_GATES, NURSE_CLINIC_DAYS, NURSE_RULES } from '../triage/destinations.mjs';

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
  //
  // AND IT IS ONE SENTENCE, NOT THREE. It was "two or three plain sentences",
  // and most of what came back was the message told back to itself before the
  // clause that decided anything. These tokens are emitted BEFORE the
  // destination is, so every word of restatement is time the receptionist
  // spends watching a spinner. One sentence still makes the model work the
  // answer out before it names one, which is the whole point of the field; it
  // only stops it narrating.
  reasoning: z.string().default('')
    .describe('WORK IT OUT HERE, BEFORE YOU NAME A DESTINATION. ONE sentence, 30 words at most: the thing about THIS message that decides where it goes — how long it has gone on, what has already failed, what they are asking for, or who they are. Do not restate the message, do not list what you considered, do not diagnose. A SECOND sentence only when the practice cannot do what is being asked, or the message contradicts itself about how long something has gone on: those two have to be said in full and the limit gives way to them.'),
  ruledOut: z.array(z.object({
    id: z.enum(DESTINATIONS.map((d) => d.id)),
    why: z.string().default('').describe('A few words, six at most — "age range is 1-17", "drops already failed". Not a sentence.'),
  })).default([])
    .describe('At most TWO services whose description fits the WORDS of this message but not this patient: a named condition on a pathway whose age range excludes them, or a problem that has already failed what that service offers. Empty is the normal answer — a service nobody would have picked anyway does not belong here.'),

  // The routing half.
  destination: z.enum(['unsure', ...DESTINATIONS.map((d) => d.id)])
    .describe('The LEAST senior service on the ladder that can safely deal with this whole message, and it must follow from what you just wrote in "reasoning". Not the one that could see it — the one the practice would use. "unsure" if the message does not give you enough to say; it is a real answer, it is treated as "leave it where the practice’s own rules put it", and it is safer than a guess in either direction.'),
  evidence: z.string().default('')
    .describe('The words from the message that decided the destination, COPIED CHARACTER FOR CHARACTER. Not a summary and not your reasoning — a quote, one clause, at most 15 words. It is checked against the message and dropped if it is not found there.'),
  // THERE IS NO `page` ANY MORE. It named the Notebook page the reading relied
  // on, and the Notebook is no longer in front of the reader — the routing guide
  // is the only source now (see accurxReadPrompt). A field asking which page was
  // used, on a call that was shown no pages, can only be answered by inventing
  // one. readingVerdict still emits `page: ''` so the two things that read a
  // verdict did not have to change.
  //
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

  // EVERY DISTINCT THING THE MESSAGE ASKS FOR, AND WHAT HAPPENS TO EACH.
  //
  // This used to be produced by splitting the text and banding each piece
  // against tables. The tables have gone (see the header): they fired on the
  // words "chest pain" in a sentence saying the chest pain was last winter,
  // investigated at A&E, and turned out to be reflux — and nothing downstream
  // was allowed to retire an alarm the words had raised.
  //
  // So the reading lists them, and says where each one goes. A request nobody
  // can act on is still listed: the point of the list is that the reader can see
  // the five things they were asked for, not just the one the card is about.
  requests: z.array(z.object({
    what: z.string().describe('The request, in a few words — "diabetes review", "numb feet", "repeat metformin". A label, not a summary.'),
    who: z.string().default('').describe('Whose request it is when the message is not about the person writing it: "the patient’s mother", "her 14-year-old son". Empty when it is the patient themselves.'),
    goes: z.enum(['unsure', ...DESTINATIONS.map((d) => d.id)]).describe('Where this one goes.'),
    // A few words, not a sentence. This is a list the reader scans down, and it
    // is the longest thing the schema produces: nine notes at a sentence each
    // was more output than the rest of the card put together, for a column
    // nobody reads as prose. `goes` already says where it went; this says only
    // what reception has to DO, or that it cannot be done here at all.
    // NEVER EMPTY BECAUSE `goes` "SAID IT". It said WHERE, and this says WHAT
    // TO DO — which are the same only when the answer is "book it". "14-year-old
    // needs bloods" goes to the nurse and CANNOT be done here, and a row reading
    // only "blood test → The practice nurse" is a request reception books, waits
    // on, and finds out about a fortnight later.
    note: z.string().default('').describe('What reception DOES about this one, in a few words — "book with HCA", "send task", "not here, hospital does it". Where it cannot be done at all, say that here: this is the only place it is said.'),
  })).default([])
    .describe('EVERY separate thing asked for, including the ones the card is not about, the ones asked on somebody else’s behalf, and the ones the patient played down. A symptom somebody mentions and then dismisses belongs here. One entry per request, not one per sentence.'),

  // WHAT ELSE HAS TO HAPPEN, WHICH IS NOT WHERE IT GOES.
  //
  // The practice's own list of things that change what happens alongside the
  // route without changing the route: an interpreter, a carer, somebody who
  // cannot use a website, a safeguarding concern. A message saying "she doesn't
  // read English and doesn't use the internet, I do it all for her" had none of
  // it on the card, and the appointment that follows is a text nobody can read.
  // A FEW WORDS EACH, BUT NOT FEWER OF THEM.
  //
  // The cap went to three while trimming output, and the practice's own list
  // (MODIFYING_FLAGS in destinations.mjs) has six categories on it. A message
  // saying she has no English, no internet, that her daughter writes for her,
  // and that she is frightened of her husband is five — and nothing told the
  // model which two to drop. The length of each one is where the tokens are;
  // the number of them is where the safeguarding is.
  flags: z.array(z.string()).default([])
    .describe('Anything that changes how this is handled rather than where it goes: an interpreter and which language, somebody writing on the patient’s behalf, a carer, no internet or no English, a reasonable adjustment, a safeguarding or domestic abuse concern. A FEW WORDS EACH — "Bengali interpreter", "no internet". Usually none; at most five, and a safeguarding or domestic abuse concern always goes in whatever else has to make way for it.'),

  // WHERE WHAT THEY NEED AND WHAT THE PRACTICE OFFERS DO NOT MEET.
  conflicts: z.array(z.string()).default([])
    .describe('Where what the message asks for cannot be booked as the practice normally books it — "cannot do mornings, but health-check bloods must be taken before 1 pm". Say the collision plainly. Usually empty.'),

  // HAS IT BEEN DEALT WITH BEFORE, AND BY WHOM.
  //
  // Asked as its own question because it has its own answer and its own reader.
  // The destination says where the request goes; this says who the appointment
  // should be WITH once it gets there, and the two are decided by different
  // things — a follow-up about the same knee still goes to the physio, it just
  // goes to the physio who saw the knee.
  //
  // It is asked AFTER the routing on purpose, for the same reason `reasoning` is
  // asked before it: what is worked out first shapes what comes after, and "she
  // saw Dr Okafor in July" must not be the thing that decides a destination.
  // Continuity is who, never where.
  seenBefore: z.object({
    who: z.string().default('')
      .describe('Who they saw about THIS problem, exactly as the message names them — "Dr Okafor", "the nurse", "the physio", "the hospital". Empty when the message says it has been dealt with before but not by whom, and empty when nobody has dealt with it.'),
    when: z.string().default('')
      .describe('When, in the message’s own words — "in July", "last month", "about 3 weeks ago". Never work a date out yourself. Empty if it is not said.'),
    what: z.string().default('')
      .describe('What came of it, in a few words — "given cream, did not clear", "told to come back if no better", "bloods done, waiting". Not a sentence.'),
    here: z.boolean().default(false)
      .describe('True only if it was somebody at THIS practice. A hospital, a walk-in centre, 111 or another surgery is false — that is history for the clinician, not somebody to book back with.'),
    evidence: z.string().default('')
      .describe('The words saying they have been seen about this before, COPIED CHARACTER FOR CHARACTER, at most 15 words. Checked against the message and dropped if it is not found there.'),
  }).default({ who: '', when: '', what: '', here: false, evidence: '' })
    .describe('ONLY prior contact about THIS problem, and only what the message itself says. Something unrelated they once saw somebody about is not this. Leave every field empty when the message describes a first-time problem — that is the normal answer, and reading a follow-up into a new problem sends the patient to a clinician who has never heard of it.'),

  // The wording half. Unchanged in content from when it was its own call — the
  // rules are still the ones in ./writing.mjs, and they are still two lists.
  condition: z.string().default('')
    .describe('The problem, under its nearest common clinical name rather than the exact wording used, so "slightly red eyes with some discharge" becomes "conjunctivitis". This TITLES the card only. Keep it short. Empty if no problem was described.'),
  reason: z.string().default('')
    .describe('The single reason line. Lowercase, no full stops, clinical shorthand, one line. Empty only if the message describes no problem at all.'),
  details: z.array(z.string()).default([])
    .describe('At most 3 further shorthand points the CLINICIAN needs, and only what "reason" could not carry. Usually empty.'),
  booking: z.array(z.string()).default([])
    .describe('At most 3 short notes RECEPTION needs to make the booking. An empty array is the normal answer.'),
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
export function accurxReadPrompt({ question, attached = '', reasonRules = [], bookingRules = [], continuityRules = [], extra = '' }) {
  const fence = (t) => String(t || '').replace(/"{3,}/g, '""');

  return [
    'You are reading one message a patient sent to The Riverside Practice, a UK GP surgery, through AccurX. Reception is dealing with it now.',
    '',
    'You are NOT writing the answer, NOT advising anybody, NOT diagnosing and NOT talking to the patient. The card the receptionist sees is built in code from the values you return.',
    '',
    'ANSWER SHORT. Every field below has a length on it and the lengths are not suggestions: the receptionist is watching a spinner until the last one is written, and a card that says the same thing in half the words is the same card sooner. Nothing you write is prose for anybody to read as prose — each value drops into a fixed place on a card that is laid out in code.',
    '',
    'THE LADDER — the practice’s Accurx Task Routing Guide, every service it lists, least senior first:',
    '',
    ladder(),
    '',
    'THAT LADDER IS THE ONLY THING YOU KNOW ABOUT THIS PRACTICE. It is the practice’s own routing guide: what each service covers, and — the half that decides most messages — what each one refuses. Nothing else you have ever read applies here: not how other surgeries work, not what is usual in the NHS, not a pathway you know exists but cannot see above. If a service is not on that ladder the practice does not route to it, and you may not name it.',
    '',
    // THE GATES GO IN WITH THE LADDER, BECAUSE THEY ARE THE SAME GUIDE.
    //
    // The reading was shown `covers` and `refuses` and nothing else, and the
    // guide is not only that. Its hard gates are the half that says what the
    // practice CANNOT do at all — no phlebotomy under 16, HPV to 24 and under,
    // six weeks for travel jabs, health-check bloods before 1 pm. The prompt was
    // already asking the reading to spot exactly those collisions ("conflicts",
    // and "IF A HARD RULE MEANS THE PRACTICE CANNOT DO WHAT IS BEING ASKED, SAY
    // SO") against rules it had never been given. It answered from what it knows
    // about the NHS at large, which is the one thing this prompt forbids.
    //
    // They cost about 250 tokens of INPUT, on a call that just gave back three
    // thousand by dropping the Notebook. They cost nothing in output, which is
    // the half the receptionist waits on.
    'THE PRACTICE’S HARD GATES — the same guide. These are absolute. They are not clinical judgements, nothing outweighs them, and a request that hits one CANNOT be done here however reasonable it is:',
    ...HARD_GATES.map((g) => `- ${g.gate}: ${g.rule}`),
    '',
    'THE NURSE CLINIC RUNS ON RULES TOO:',
    `- ${NURSE_CLINIC_DAYS}`,
    ...NURSE_RULES.map((r) => '- ' + r.replace(/\*\*/g, '')),
    '- Bloods have to be taken, and back, BEFORE any of these is booked: ' + BLOODS_FIRST.join(', ').toLowerCase() + '.',
    '',
    'YOU ARE THE ONLY THING READING THIS MESSAGE.',
    '- There is no keyword net underneath you any more. There was: it matched "chest pain" in a sentence that said the chest pain was last winter, that she went to A&E overnight, that every test was normal and that it turned out to be reflux — and it told reception to interrupt a doctor, quoting that sentence as its evidence. Nothing was allowed to retire an alarm the words had raised, so the alarm stood.',
    '- So nothing else will catch what you miss, and nothing else will retire what you raise. Both directions are yours.',
    '',
    'WHAT IS HAPPENING NOW, AND WHAT ALREADY HAPPENED',
    '- A symptom is only urgent if the message describes it as happening NOW or recently, unexplained. The same words can describe a resolved episode, an investigation that came back normal, or a diagnosis somebody already has, and none of those is an emergency.',
    '- Read what the message says became of it. "Last winter", "they did all the tests", "said her heart was fine", "it turned out to be X", "she has been fine since" are the message telling you the outcome. Take it.',
    '- The reverse holds and matters more: something described as new, getting worse, or never explained stays urgent however calmly it is written, and however much the patient plays it down. "She is not fussed about it, she only mentioned it because I asked" is not a clinical opinion — patients and their families minimise, and a symptom that is dismissed in the message is still a symptom.',
    '- Say which it is in your reasoning, in the message’s own words, whenever the answer turns on it.',
    '',
    'WORK IT OUT IN WRITING FIRST — "reasoning"',
    '- Before you name anything, write ONE sentence, 30 words at most: the thing about this message that decides it. Not a summary of the message — the receptionist has the message in front of them. The clause that changes the answer.',
    '- Two sentences ONLY when the practice cannot do what is being asked, or the message gives two different durations. Both of those have to be said in full, and the word limit gives way to them rather than the other way round.',
    // TWO RULES WERE WRITTEN FOR THIS PROMPT AND MEASURED WORSE, SO THEY ARE NOT
    // IN IT. They are recorded because they are the two any careful reader will
    // write next, having noticed the same two failure shapes.
    //
    //   "WHEN THE MESSAGE ASKS FOR SEVERAL THINGS, YOUR SENTENCE MUST SAY WHICH
    //    ONE GOVERNS."  — for a message whose reasoning gave one clause per
    //    request and never said which one decided it.
    //   "READ YOUR OWN SENTENCE BACK BEFORE YOU NAME ANYTHING."  — for reasoning
    //    that argues its way to "not routine" and then names the routine
    //    appointment.
    //
    // Both are true. Both are about real failures. Adding them took the suite
    // from 40/60 to 36/60 over five passes of the twelve hard cases, and put two
    // more cases into the never-right column — including the travel-vaccination
    // one the hard gates had just fixed.
    //
    // The lesson is not about these two sentences. It is that a prompt is not a
    // list of true statements: every rule added competes for attention with the
    // rules already earning their place, and the only way to know which won is
    // to run it. `evals/routing/bench.mjs --repeats 5` is what settled it — and
    // a single pass had "settled" the opposite, twice, in both directions.
    '- A CONDITION NAME IS NOT A ROUTE. "Ear infection", "sore throat", "back pain" appear on a service’s list because that service deals with the ORDINARY case of them. The message in front of you may not be the ordinary case, and the words will not tell you — the rest of the message will.',
    '- Four things change the answer more often than the condition does, and all four are in what the patient wrote:',
    '  · HOW LONG. Something going on for months, or coming back again and again, is not the same problem as something that started on Friday, however it is named.',
    '  · WHAT THEY HAVE ALREADY TRIED, AND WHETHER IT WORKED. These are opposite answers and they are easy to run together. Treatment that FAILED means that service has nothing left to offer. Treatment that WORKED — especially in an earlier episode that resolved — is a reason to use that service again, and taking the pathway away from somebody it already cured is the worst kind of wrong. "It cleared it in two days" is not a failed treatment.',
    '  · WHAT THEY ARE ASKING FOR. "I want it looked at", "I want it checked", "I want medication reviewed" is a request for an examination or a decision, and a service that cannot examine or decide is not the answer to it.',
    '  · WHO THEY ARE. An age range on a pathway is a gate, not a guideline. If the patient is outside it that service cannot treat them at all, and naming it sends them somewhere that will turn them away.',
    '- Then write down what you considered and did not choose, in "ruledOut", with the reason. Any service whose description fits the WORDS but not this patient belongs there.',
    '',
    'WHAT YOU MAY NOT DO WHILE REASONING',
    '- DO NOT STATE ANYTHING THE MESSAGE DOES NOT. If it gives no age, you do not know the age — do not call them an adult, and do not clear an age gate by assuming one. If nobody has examined the patient, their word for what they have is their word for it: keep it as what they report, never as what they have.',
    '- DO NOT RESOLVE A CONTRADICTION BY PICKING ONE SIDE. A message saying three months in one place and two in another has told you something real about how long it has gone on: carry both, in their words. Deleting one is not tidying, it is deciding.',
    '- DO NOT ARGUE AN EXCLUSION AWAY WITH THE CRITERIA FOR THE ORDINARY CASE. Once something in the message takes a patient off a pathway, the reason it took them off is the thing that decides where they go instead — "it has only been two days and they are otherwise stable" is the argument for the simple presentation, and this one is not simple.',
    '- IF A HARD RULE MEANS THE PRACTICE CANNOT DO WHAT IS BEING ASKED, SAY SO. A rule that is stated and then not applied is worse than one nobody knew: it reads as though the request is being handled. Name it in the reasoning, route to whoever has to explain it, and say plainly in "reasoning" that the thing asked for cannot be done here — and, if the message says where else it happens, say that too.',
    '- ANSWER WHAT THEY ASKED FOR, EVEN WHEN THE ANSWER IS NO. If the patient asked for something specific and they are not getting it, that belongs in your reasoning, because somebody is about to telephone them and contradict them.',
    '',
    'WHERE IT GOES — "destination"',
    '- Name the LEAST SENIOR service on that ladder that can safely deal with the WHOLE message, and make it the one your reasoning just arrived at.',
    '- That is not the same question as which service could see it. A GP could see almost anything a patient writes in about; naming one for a message a pharmacist would have dealt with takes the patient off the service the practice actually uses. A sore throat is the pharmacy’s.',
    '- Read the whole message as ONE PICTURE. It usually describes several things at once, and where the whole person has to go is not always where the loudest symptom would go on its own — symptoms that are unremarkable apart can be the reason for the appointment together.',
    '- A recent pregnancy, miscarriage, termination or birth changes what new symptoms mean. So does a symptom nobody has explained, and so does anything the patient is already waiting on a result for. Any of those can put a message beyond a service that would otherwise have handled it.',
    '- Read what each service REFUSES as carefully as what it covers. That is the half that decides it.',
    // THIS LINE USED TO PROMISE A FLOOR THAT NO LONGER EXISTS.
    //
    // It read: "the practice's own rules have already decided where this goes,
    // and what you name can only ever move it somewhere MORE senior." That was
    // true when the pattern cascade ran underneath and applyRoute took the more
    // senior of the two. It has not been true since the cascade came off this
    // path: accurxAnswer takes `destination` whole, and applyRoute has no caller
    // on it at all. So the sentence was telling the model that naming a junior
    // service was free — in the one direction the header of this file calls
    // unrecoverable. What replaces it is the guide's own front-page rule.
    '- "unsure" is a real answer and it is the right one when you cannot place the message. NOTHING IS READING THIS AFTER YOU, in either direction: no pattern will catch what you miss and none will retire what you raise. So when you are not sure, ROUTE UPWARD — dutyDoctor is the correct destination for anything you cannot confidently place. A task sent to the wrong clinician costs a few minutes; a missed escalation does not.',
    '- Put the words that decided it in "evidence", copied from the message exactly. They are checked against the message and dropped if they are not found in it.',
    '',
    'EVERYTHING IT ASKS FOR — "requests"',
    '- List every separate thing, not just the one the card is about: the other people it asks about, the admin, the repeat prescription, and the symptom the writer dismissed on the patient’s behalf.',
    '- Give each one where it goes and, in a few words, what reception DOES about it — not a sentence, and not a restatement of where it went. If the practice cannot do it at all, say that there rather than sending it to a queue that will find out later.',
    '- A message asking for seven things and answered with one is how six of them stop existing. This list is the only place they survive.',
    '',
    'WHAT ELSE HAS TO HAPPEN — "flags" and "conflicts"',
    '- "flags": anything that changes how it is handled rather than where it goes — no English and which language, no internet, somebody writing on the patient’s behalf, a carer, a reasonable adjustment, a safeguarding or domestic abuse concern.',
    '- "conflicts": where what they need and what the practice offers do not meet. If they cannot attend mornings and the thing they need is only done in the morning, say so — that collision is the most useful sentence on the card, and nobody else is going to notice it.',
    '',
    'THE NURSE CLINICS — "nurseClinics"',
    '- Separately from where the message goes: if the practice nurse or the diabetic nurse does something this message asks for — a smear, a dressing, stitches out, a jab, a diabetic review — name it there with the patient’s own words, EVEN IF the message goes somewhere more senior. Reception is asked "does the nurse do this?" at the desk and the answer is useful either way.',
    '- Empty is the normal answer. Do not put a clinic there because it might.',
    '',
    'HAS IT BEEN DEALT WITH BEFORE — "seenBefore"',
    '- Read the message for anything saying somebody has already dealt with THIS problem: a clinician they name, a visit they mention in passing, treatment they were given, or being told to come back if it did not settle.',
    ...continuityRules.map((r) => '- ' + r),
    '- Do not let it move the destination. Where this goes is the question you have already answered; this one is only who the appointment is with when it gets there.',
    '- Put the words that say it in "evidence", copied from the message exactly. They are checked against the message and dropped if they are not found in it.',
    '',
    '"condition" — the problem, so the routing card can be titled:',
    '- Its nearest common clinical name, not the words used — "bad back" becomes "back pain".',
    '- Short. It titles the card, and every red flag is worked out from the message itself, in code.',
    '- WHOSE CLAIM IT IS SURVIVES THE RENAMING. Nobody has examined this patient. If they name their own condition — "my ear infections", "my sciatica" — keep it as theirs ("reports recurrent ear infections"), because the title, the condition and the reason line all repeat it and a lay word becomes the practice’s diagnosis three times over before a clinician has seen them.',
    '- Empty only if no problem is described at all.',
    '',
    '"reason" — the one line that goes into the appointment for the clinician to read:',
    ...reasonRules.map((r) => '- ' + r),
    '- THIS IS THE LINE THAT GETS COPIED. Everything else you write can be collapsed or skipped; this is what the clinician reads. Anything you worked out above and did not put here has, for practical purposes, not been said.',
    '- Carry a disagreement rather than smoothing it. If the message gives two different durations, the line says both — "3-4/12 in one place, 2/12 in another" — because that disagreement is often the clinically interesting part. Never invent an approximation to cover it: no "~", no "about", no rounding the patient did not do.',
    '',
    '"booking" — short notes for the receptionist making the booking:',
    ...bookingRules.map((r) => '- ' + r),
    '',
    'Anything about when they can attend or how to contact them goes in "booking", NEVER in "reason" and NEVER in "condition".',
    'Do not write how urgent this is anywhere. Urgency is decided in code from this same message, and a card that carried your opinion of it beside that would be showing two answers.',
    extra ? '\n' + extra : null,
    '',
    // THE NOTEBOOK IS NOT HERE, AND ITS ABSENCE IS THE POINT.
    //
    // It went in as "every page the practice holds, one line each", and it was
    // the wrong source for this one question. The Notebook is how the practice
    // DOES things — how a clinic runs, how a form is filled in, who covers what
    // on a Thursday. The routing guide is where a task GOES. A reader handed
    // both weighed a page about running the diabetic clinic against the guide's
    // own account of what that clinic refuses, and a title is all it ever saw of
    // either: the catalogue is one line per page, so what actually reached the
    // model was a list of headings to pattern-match against — the failure mode
    // this whole file exists to replace.
    //
    // It also cost a database round-trip and roughly three thousand prompt
    // tokens on the one call the receptionist waits for, to supply nothing the
    // ladder above does not already say better.
    //
    // The guide is the source. If it is wrong, docs/routing.md and
    // lib/triage/destinations.mjs are what get edited — together, in one commit
    // — and every reading changes with them.
    attached ? 'ATTACHED DOCUMENT:\n"""\n' + fence(attached) + '\n"""\n' : null,
    'THE MESSAGE:',
    '"""',
    fence(question),
    '"""',
    // NULL IS "NOT THERE"; '' IS A BLANK LINE, AND IT HAS TO SURVIVE.
    //
    // This filtered out '' — which is what the two dozen '' entries above are —
    // so every paragraph break in the prompt was stripped and the whole thing
    // arrived as one 130-line wall with the section headings run into the
    // paragraph before them. The blank lines were written on purpose and they
    // are what tell the reader where "WHERE IT GOES" stops and "EVERYTHING IT
    // ASKS FOR" starts. The two conditional entries say null now, which is the
    // thing that actually means "omit me".
  ].filter((line) => line !== null && line !== undefined).join('\n');
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

  const seen = (read.seenBefore && typeof read.seenBefore === 'object') ? read.seenBefore : {};

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
    // Always empty. The reading is shown no Notebook, so there is no page it
    // could have relied on; the key stays because applyRoute and the card both
    // read it, and a shape that changed would be a change in two more files for
    // a value that is now always the same.
    page: '',
    // Why, in the reader's own words, and what it turned down. Carried whatever
    // the destination turned out to be: the card shows the reasoning even when
    // the reading agreed with the patterns, because "why is this the pharmacy's"
    // is the question reception is actually being asked at the desk.
    reasoning: String(read.reasoning || '').trim(),
    // Everything the message asked for, what happens alongside it, and where it
    // does not fit what the practice offers. The card renders all three; see
    // ./accurx.mjs.
    requests: (Array.isArray(read.requests) ? read.requests : [])
      .filter((r) => r && String(r.what || '').trim())
      .map((r) => ({
        what: String(r.what).trim(),
        who: String(r.who || '').trim(),
        goes: BY_ID.has(String(r.goes || '')) ? String(r.goes) : '',
        label: destinationLabel(String(r.goes || '')),
        note: String(r.note || '').trim(),
      }))
      .slice(0, 9),
    // Whether this has already been dealt with, and by whom. The card decides
    // what to do with it (see ./accurx.mjs); this only carries what was said,
    // trimmed, with each value kept short — `who` is a name or a role and `what`
    // is a few words, and a paragraph in either is a paragraph on the card.
    seenBefore: {
      who: String(seen.who || '').trim().slice(0, 60),
      when: String(seen.when || '').trim().slice(0, 40),
      what: String(seen.what || '').trim().slice(0, 90),
      here: seen.here === true,
      evidence: String(seen.evidence || '').trim(),
    },
    flags: (Array.isArray(read.flags) ? read.flags : []).map((f) => String(f || '').trim()).filter(Boolean).slice(0, 5),
    conflicts: (Array.isArray(read.conflicts) ? read.conflicts : []).map((c) => String(c || '').trim()).filter(Boolean).slice(0, 3),
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
  // A FLOOR IS STILL A FLOOR WHEREVER ONE IS PASSED IN, and on /accurx nothing
  // passes one any more: the keyword cascade decided a urinary infection was a
  // physiotherapy problem, an ear that had hurt for months was a child's
  // pathway, and a chest pain from last winter was an emergency — and the rule
  // that it could only ever be raised meant the reading could not put any of
  // them right. See ./accurx.mjs, which now calls this with no floor at all.
  // This is kept for the callers that DO have one (the ordinary router's own
  // triage card), where a pattern that fired is still a pattern that fired.
  if (rankOfDestination(said) <= rankOfDestination(at)) return base;

  const quote = String(verdict.evidence || '').trim();
  return {
    destination: said,
    because: quote && spanWithin(quote, message) ? quote : '',
    page: String(verdict.page || '').trim().slice(0, 120),
    raised: true,
  };
}
