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
 * What ONE check answers, about ONE destination.
 *
 * Three fields and no prose. There is nothing here for a model to say about
 * the patient, nothing that could reach the reader as advice, and — the point
 * of a closed question — nothing to weigh: it is not choosing between services,
 * it is answering for the one it was handed.
 */
export const ACCURX_CHECK_SCHEMA = z.object({
  belongs: z.enum(['yes', 'no', 'unsure'])
    .describe('Does this message have to go to the service you were asked about, rather than to any of the less senior ones listed under it? "yes" only if nothing below it would do. "unsure" if the message does not give you enough to say — it is a real answer, it is treated exactly as "no", and it is safer than a guess in either direction.'),
  // The card may only say something the patient wrote. This is the span that
  // proves it, and it is checked against the message in code before a word of
  // it is rendered — see ARCHITECTURE.md on span-local assertions.
  evidence: z.string().default('')
    .describe('If you answered "yes": the words from the message that decided it, COPIED CHARACTER FOR CHARACTER. Not a summary and not your reasoning — a quote. One sentence at most. It is checked against the message and dropped if it is not found there. Empty otherwise.'),
  page: z.string().default('')
    .describe('The exact title of the Notebook page you relied on, copied from the list, or empty. Never invent one.'),
});

/**
 * The Notebook lines one check gets: the pages about ITS OWN destination.
 *
 * The whole catalogue went to the single reader because the single reader was
 * choosing between every service the practice has. A check is not — it is
 * answering for one of them — so every page about the other services is noise
 * in its prompt, and the same catalogue repeated across the fan-out is the one
 * cost the split would otherwise add.
 *
 * Best effort by design. A destination whose filter matches nothing is asked
 * with no Notebook lines rather than with all of them: it still has its own
 * `covers` and `refuses`, which is what it is actually being asked about.
 */
export function pagesFor(id, pages = []) {
  const found = BY_ID.get(String(id || ''));
  if (!found || !found.pages) return [];
  return (pages || []).filter((page) => {
    const first = String(page.text || '').split(/\r?\n/).find((line) => line.trim()) || '';
    return found.pages.test(page.docTitle + ' ' + first);
  });
}

/** The destinations the practice reaches for BEFORE this one. */
export function below(id) {
  const found = BY_ID.get(String(id || ''));
  if (!found) return [];
  return DESTINATIONS.filter((d) => d.rank < found.rank);
}

/**
 * What ONE check is asked.
 *
 * IT IS A FLOOR QUESTION, NOT AN OWNERSHIP QUESTION, and getting that wrong is
 * what broke "pt has sore throat". The check used to be asked "does this
 * message need you?" — so the GP check said yes, because a GP genuinely can see
 * a sore throat, and so did the pharmacy check. The fold takes the most senior
 * yes, which turned an agreement into an escalation and answered a Pharmacy
 * First condition with a GP appointment.
 *
 * The fault was not the model's. A yes is READ as "nothing less senior than
 * this will do", and the question being asked was "could you deal with this" —
 * two different claims, and the second is true of a doctor for almost every
 * message anybody sends. So the question now matches what the answer is used
 * for: would anything BELOW you have been right?
 *
 * WHICH IS WHY EACH CHECK IS SHOWN WHAT SITS BELOW IT, and only that. It cannot
 * answer a floor question without knowing what the floor is made of — the GP
 * check has to know Pharmacy First exists to decline a sore throat. Showing
 * what sits ABOVE would bring back the deferral this fan-out was built to
 * avoid: "the duty doctor will probably catch it" is how every check says no to
 * the message that needed one of them to say yes. Below is what it needs;
 * above is what would let it pass the question on.
 *
 * It still deliberately does NOT say what the patterns decided. An anchored
 * second opinion is not a second opinion — ./safety/triage-pass.mjs classifies
 * without being told the floor either, for exactly this reason.
 */
export function accurxCheckPrompt({ destination, question, notebook = '' }) {
  const fence = (t) => String(t || '').replace(/"{3,}/g, '""');
  const d = destination || {};
  const under = below(d.id);

  return [
    'You are reading one message a patient sent to The Riverside Practice, a UK GP surgery, through AccurX. You are answering ONE question about it, and nothing else.',
    '',
    under.length
      ? 'THE QUESTION: does this message have to go to ' + d.label + ' — or would one of the less senior services listed below have dealt with it perfectly well?'
      : 'THE QUESTION: does this message need ' + d.label + '?',
    '',
    'WHAT THAT SERVICE IS FOR',
    '- ' + d.covers,
    '',
    'WHAT IT WILL NOT TAKE',
    '- ' + d.refuses,
    '',
    under.length
      ? [
        'WHAT THE PRACTICE USES FIRST. These services are all LESS SENIOR than the one you are being asked about, and the practice reaches for them before it reaches for yours:',
        '',
        ...under.map((o) => '- ' + o.label + '. ' + o.covers),
        '',
        'IF ANY ONE OF THEM COULD SAFELY DEAL WITH THIS MESSAGE, ANSWER "no". That is the whole question. Your "yes" does not mean you could see this — you could see almost anything a patient writes in about. It means NOTHING LESS SENIOR SHOULD, and it takes the patient off the service the practice actually uses for this. A sore throat can be dealt with at a pharmacy, so the answer for every service above a pharmacy is "no".',
        '',
      ].join('\n')
      : '',
    'You are NOT writing an answer, NOT advising anybody, NOT diagnosing, and NOT talking to the patient. Nothing you write is shown as advice — the card the receptionist sees is built in code from your yes or no.',
    '',
    'HOW TO ANSWER',
    '- READ THE WHOLE MESSAGE AS ONE PICTURE. It usually describes several things at once. Ask where the WHOLE person has to go, not where the loudest symptom would go on its own — symptoms that are unremarkable apart can be the reason for the appointment together.',
    under.length
      ? '- Answer "yes" only if what the message describes is beyond every service listed above: something they would have to hand on, something none of them can assess, or something that cannot wait as long as they would take.'
      : '- Answer "yes" if this message needs that service. Nothing in the practice sits below it, so there is nothing it could be passed down to.',
    '- Answer "no" if what it describes is on the list that service will not take. Do not say where it should go instead — nobody is asking you, and you are not being shown anything more senior than yourself.',
    '- A recent pregnancy, miscarriage, termination or birth changes what new symptoms mean. So does a symptom that has not been explained, and so does anything the patient is already waiting on a result for. Any of those can put a message beyond a service that would otherwise have handled it.',
    '- You cannot make anything less urgent, and a "no" from you never sends anybody anywhere — the practice’s own rules have already decided where this goes, and the only thing your "yes" can do is move it somewhere MORE senior. So a "no" costs nothing and a loose "yes" costs a patient the service they should have had.',
    '',
    notebook
      ? [
        'THE PRACTICE NOTEBOOK — the pages it holds about this service, one line each. This is the only thing you know about how this practice works. Nothing else you have ever read applies here: not how other surgeries work, not what is usual in the NHS.',
        '',
        notebook,
        '',
        'If one of these pages is what decided it, put its exact title in "page". Otherwise leave it empty.',
        '',
      ].join('\n')
      : '',
    'THE MESSAGE:',
    '"""',
    fence(question),
    '"""',
  ].filter((line) => line !== '').join('\n');
}

/**
 * Every check, folded into the one verdict applyRoute already understands.
 *
 * IN CODE, AND IT HAS TO BE. The checks were split apart so that no model has
 * to weigh services against each other; handing their answers back to a model
 * to reconcile would put that weighing straight back, and put it somewhere with
 * less to go on than the one call it replaced.
 *
 * THE RULE IS THE LADDER. Take the most senior destination that said yes. That
 * only reads correctly because of what a "yes" now means — see
 * accurxCheckPrompt: not "this service could deal with it" but "nothing less
 * senior than this service will do". A fold that takes the maximum of the first
 * kind of answer escalates every message a doctor could have seen, which is
 * every message.
 * Nothing else about the answers is consulted — not how many said yes, not how
 * sure any of them sounded. Two at the same rank is a tie, and ties go to
 * whichever comes first in DESTINATIONS, which is the more specific of them.
 *
 * WHAT COMES BACK
 *   null                          nothing answered at all — no key, every call
 *                                 failed. Identical to never having asked.
 *   { destination: 'unsure' }     checks ran and none said yes. A real answer,
 *                                 and one applyRoute ignores, so the card is
 *                                 the patterns' own. Distinct from null so the
 *                                 log can tell "read, and it agreed" from "not
 *                                 read".
 *   { destination, evidence, page }   the most senior yes.
 *
 * `saidYes` carries EVERY yes, winner included, on all three. The ladder is
 * what decides the card, and the losers are not a second opinion about that —
 * but a nurse clinic saying "this is ours" is worth putting on the card even
 * when it lost, and that cannot be recovered once the fold has picked one. See
 * signpostsFrom, which is the only thing that reads it.
 *
 * @param {Array<object|null>} checks  one per destination, `{ id, ...ACCURX_CHECK_SCHEMA }`,
 *                                     null wherever a check did not come back
 */
export function foldChecks(checks = []) {
  const answered = (checks || []).filter(Boolean);
  if (!answered.length) return null;

  const yes = DESTINATIONS
    .map((d) => ({ d, said: answered.find((c) => String(c.id || '') === d.id) }))
    .filter(({ said }) => said && String(said.belongs || '') === 'yes');

  const saidYes = yes.map(({ d, said }) => ({
    id: d.id,
    evidence: String(said.evidence || ''),
    page: String(said.page || ''),
  }));

  // The ladder, and only the ladder: the highest rank wins, and the first at
  // that rank — which DESTINATIONS orders most specific first — takes a tie.
  let best = null;
  for (const entry of yes) if (!best || entry.d.rank > best.d.rank) best = entry;
  if (!best) return { destination: 'unsure', evidence: '', page: '', saidYes };

  return {
    destination: best.d.id,
    evidence: String(best.said.evidence || ''),
    page: String(best.said.page || ''),
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
