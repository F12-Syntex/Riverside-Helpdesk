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
// a single closed question — "does this belong with YOU?" — against that one
// service's own description of what it covers and what it refuses. Nothing is
// weighed against anything: the weighing is the ladder, and the ladder is code.
//
//   Latency   they run concurrently, so the turn waits for the SLOWEST one
//             rather than for the sum. A closed question against one service
//             answers in a fraction of what the whole comparison took, so the
//             whole fan-out lands inside what the single call used to cost.
//
//   Recall    "is this an FCP job, given that an FCP does joints and refuses
//             everything else" is a far easier question than "which of eight",
//             and it is asked without the other seven crowding it out. The
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
// AND IT REASONS FROM THE PRACTICE'S OWN MATERIAL. The destinations below are
// not a general model of NHS triage; they are the destinations this app already
// renders cards for, described with what the practice's own pages say each one
// covers and refuses. The Notebook goes in beside them. Nothing else it has
// ever read applies here, and the prompt says so.
import { z } from 'zod';
import { spanWithin } from '../safety/spans.mjs';

/**
 * The destinations, in order of seniority. ONE CHECK IS ASKED PER ENTRY.
 *
 * `rank` is the whole safety model of this file. It is not urgency and it is
 * not acuity — it is HOW SENIOR THE PAIR OF EYES IS, which is the only ordering
 * under which "never move it down" means what it needs to mean here. A
 * community pharmacist is a clinician and so is a physiotherapist; neither is
 * who you want deciding whether two swollen legs after a miscarriage are a
 * clot.
 *
 * `covers` and `refuses` are the whole of what a check is told about its own
 * destination, and `refuses` is the half that does the work. "An FCP does
 * joints" invites a yes for anything that hurts in a leg; "an FCP is not who
 * reads a swelling that merely happens to be in one" does not. Every check is
 * asked in isolation, so what a destination will NOT take is the only thing
 * standing between it and a cheerful yes to everything.
 *
 * `pages` picks the Notebook lines that check gets — see pagesFor. It matches
 * a page's title and its first line.
 *
 * `signpost` is for the two nurse clinics, and it exists because of what the
 * never-lower rule does to them. A nurse clinic ranks below a doctor, so a
 * "yes" from one can only ever show when the patterns had the message going
 * somewhere lower still — and the patterns send anything they do not recognise
 * to a doctor. So the destination that most often has the right answer for
 * "my smear is due" is the one whose answer is structurally never seen.
 *
 * Lifting them above a GP would fix that by letting a model move somebody OFF a
 * doctor's list, which is the one thing this file exists to prevent. So they
 * keep their rank, and a losing "yes" from one is put on the card as a NOTE
 * instead — see signpostsFrom. Where the message goes is unchanged and still
 * the practice's own; the note says what the nurse clinic does, and booking it
 * is reception's call to make. Nothing here downgrades anything.
 *
 * THE ARRAY ORDER IS THE TIE-BREAK, and it runs most specific first within a
 * rank. Two services at the same rank both saying yes is a message that is
 * genuinely both, and the more specific of them is the more informative answer:
 * a diabetic review is a diabetic nurse's whether or not a practice nurse could
 * also have taken it.
 */
export const DESTINATIONS = [
  {
    id: 'minorEyeService',
    rank: 1,
    label: 'The minor eye service (Rose Opticians)',
    covers: 'An eye problem on the practice’s MECS list — red or sore eyes, discharge, watering, flashes and floaters, reduced vision, mild trauma, a suspected foreign body.',
    refuses: 'Sudden loss of vision, considerable eye pain, significant trauma, bleeding, a chemical injury, or a problem after recent eye surgery — those go straight to eye A&E. Also anything already watched by an optometrist or the hospital eye service: cataracts, glaucoma, dry eye.',
    pages: /\beyes?\b|mecs|optic|optom|vision|sight|rose/i,
  },
  {
    id: 'pharmacy',
    rank: 1,
    label: 'Community pharmacy (Pharmacy First)',
    covers: 'A Pharmacy First clinical pathway, a CPSAS condition, or ordinary minor illness in somebody otherwise well.',
    refuses: 'Anybody who is not otherwise well, and anything the message gives a reason to look at twice. A pharmacist works from the counter with no notes and no examination.',
    pages: /pharmac|cpsas|minor illness|self.?care|over.the.counter/i,
  },
  {
    id: 'diabeticNurse',
    rank: 2,
    signpost: true,
    label: 'The diabetic nurse',
    covers: 'Diabetes care in somebody who already has the diagnosis: the annual or interim review, HbA1c follow-up, a foot check, a query about insulin or diabetes medication, blood-sugar readings in an established diabetic.',
    refuses: 'Newly suspected diabetes, and a diabetic who is unwell NOW. Both of those are a doctor’s, not a review appointment’s.',
    pages: /diabet|hba1c|insulin|\bdsn\b/i,
  },
  {
    id: 'fcp',
    rank: 2,
    label: 'First Contact Physiotherapist (FCP)',
    covers: 'A joint, muscle, tendon or back problem in an adult, and NOTHING ELSE. An FCP assesses and rehabilitates musculoskeletal injuries.',
    refuses: 'Everything that is not musculoskeletal, however much it hurts and wherever it is. An FCP does not investigate, does not order urgent bloods, and is NOT who reads swelling, colour change, numbness, breathlessness, dizziness or headache — a symptom that merely happens to be in a limb is not a limb problem.',
    pages: /physio|\bfcp\b|musculoskeletal|\bmsk\b|back pain|joint/i,
  },
  {
    id: 'nurse',
    rank: 2,
    signpost: true,
    label: 'The practice nurse',
    covers: 'Something a nurse or HCA does to a plan somebody has already made: immunisations and travel vaccines, wound care and dressings, taking stitches or clips out, cervical smears, blood pressure checks, B12 injections, a booked long-term-condition review.',
    refuses: 'A new or unexplained symptom. A nurse clinic runs to a protocol for a decision that has already been taken — it is not where a problem gets worked out for the first time. Diabetes care in a diagnosed diabetic is the diabetic nurse’s, not yours.',
    pages: /nurse|\bhca\b|immunis|immuniz|vaccin|smear|cervical|dressing|wound|\bb12\b|blood pressure|travel|stitch|suture/i,
  },
  {
    id: 'gp',
    rank: 3,
    label: 'A GP appointment here',
    covers: 'It needs a doctor, and it can wait for the next ordinary appointment. The default for anything that is a clinical problem but not squarely one of the practice’s other services.',
    refuses: 'A request that is plainly and completely one of the other services’ ordinary work with nothing in the message complicating it, and anything that cannot wait for the next ordinary appointment — that is somebody else’s answer, not a slower version of yours.',
    pages: /\bgp\b|doctor|triag|appointment/i,
  },
  {
    id: 'dutyDoctor',
    rank: 4,
    label: 'The duty doctor — today',
    covers: 'It needs a clinician’s eyes TODAY: a symptom that could be serious, several symptoms that together could be, a recent pregnancy, miscarriage or birth with new symptoms, swelling in a limb, a symptom nobody has managed to explain, or somebody deteriorating while they wait for something already arranged.',
    refuses: 'An ordinary problem that has been going on unchanged and is not getting worse.',
    pages: /duty|same.?day|urgent|triag|on.the.day/i,
  },
  {
    id: 'emergency',
    rank: 5,
    label: 'The duty doctor now, or 999',
    covers: 'It cannot wait for an appointment of any kind. Somebody stands up.',
    refuses: 'Anything that can safely be an appointment today. "Today" is the duty doctor’s answer, not yours.',
    pages: /emergenc|999|red.?flag|\ba&e\b|ambulance|sepsis|collapse/i,
  },
];

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
    .describe('Does this message need the service you were asked about? "yes" only if it does. "unsure" if the message does not give you enough to say — it is a real answer, it is treated exactly as "no", and it is safer than a guess in either direction.'),
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

/**
 * What ONE check is asked.
 *
 * Deliberately does NOT say what the patterns decided, and deliberately does
 * NOT list the other destinations. An anchored second opinion is not a second
 * opinion — ./safety/triage-pass.mjs classifies without being told the floor
 * either, for exactly this reason — and a check told what else is being asked
 * is a check that can defer. "The duty doctor will probably catch it" is how
 * every one of them says no to the message that needed one of them to say yes.
 */
export function accurxCheckPrompt({ destination, question, notebook = '' }) {
  const fence = (t) => String(t || '').replace(/"{3,}/g, '""');
  const d = destination || {};
  return [
    'You are reading one message a patient sent to The Riverside Practice, a UK GP surgery, through AccurX. You are answering ONE question about it, and nothing else.',
    '',
    'THE QUESTION: does this message need ' + d.label + '?',
    '',
    'WHAT THAT SERVICE IS FOR',
    '- ' + d.covers,
    '',
    'WHAT IT WILL NOT TAKE',
    '- ' + d.refuses,
    '',
    'You are NOT writing an answer, NOT advising anybody, NOT diagnosing, and NOT talking to the patient. Nothing you write is shown as advice — the card the receptionist sees is built in code from your yes or no.',
    '',
    'HOW TO ANSWER',
    '- READ THE WHOLE MESSAGE AS ONE PICTURE. It usually describes several things at once. Ask whether the WHOLE person needs this service, not whether the loudest symptom does on its own — symptoms that are unremarkable apart can be the reason for the appointment together.',
    '- Answer "yes" if this message NEEDS that service. Not whether that service could cope with it, and not whether it is the best of the practice’s options: only whether it needs those eyes on it. Say yes even if something else fits as well.',
    '- Answer "no" if the message belongs somewhere else, or if what it describes is on the list that service will not take. Do not say where it should go instead — nobody is asking you, and you are not being shown the alternatives.',
    '- A recent pregnancy, miscarriage, termination or birth changes what new symptoms mean. So does a symptom that has not been explained, and so does anything the patient is already waiting on a result for.',
    '- You cannot make anything less urgent, and a "no" from you never sends anybody anywhere. The practice’s own rules have already decided where this goes; the only thing your "yes" can do is move it somewhere MORE senior. So there is nothing to be gained by hedging in either direction — answer the question you were asked.',
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
 * THE RULE IS THE LADDER. Take the most senior destination that said yes.
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
