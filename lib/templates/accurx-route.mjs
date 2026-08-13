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
 * The destinations, in order of seniority.
 *
 * `rank` is the whole safety model of this file. It is not urgency and it is
 * not acuity — it is HOW SENIOR THE PAIR OF EYES IS, which is the only ordering
 * under which "never move it down" means what it needs to mean here. A
 * community pharmacist is a clinician and so is a physiotherapist; neither is
 * who you want deciding whether two swollen legs after a miscarriage are a
 * clot.
 */
export const DESTINATIONS = [
  {
    id: 'pharmacy',
    rank: 1,
    label: 'Community pharmacy (Pharmacy First)',
    covers: 'A Pharmacy First clinical pathway, a CPSAS condition, or ordinary minor illness in somebody otherwise well.',
  },
  {
    id: 'minorEyeService',
    rank: 1,
    label: 'The minor eye service (Rose Opticians)',
    covers: 'An eye problem on the practice’s MECS list — red or sore eyes, discharge, watering, flashes and floaters, reduced vision, mild trauma, a suspected foreign body.',
  },
  {
    id: 'fcp',
    rank: 2,
    label: 'First Contact Physiotherapist (FCP)',
    covers: 'A joint, muscle, tendon or back problem in an adult, and NOTHING ELSE. An FCP assesses and rehabilitates musculoskeletal injuries. They do not investigate, they do not order urgent bloods, and they are not who reads a symptom that merely happens to be in a limb.',
  },
  {
    id: 'gp',
    rank: 3,
    label: 'A GP appointment here',
    covers: 'It needs a doctor, and it can wait for the next ordinary appointment. The default for anything that is a clinical problem but not one of the pathways above.',
  },
  {
    id: 'dutyDoctor',
    rank: 4,
    label: 'The duty doctor — today',
    covers: 'It needs a clinician’s eyes TODAY: a symptom that could be serious, several symptoms that together could be, a recent pregnancy, miscarriage or birth with new symptoms, swelling in a limb, a symptom nobody has managed to explain, or somebody deteriorating while they wait for something already arranged.',
  },
  {
    id: 'emergency',
    rank: 5,
    label: 'The duty doctor now, or 999',
    covers: 'It cannot wait for an appointment of any kind. Somebody stands up.',
  },
];

const BY_ID = new Map(DESTINATIONS.map((d) => [d.id, d]));

/** How senior a destination is. An unknown one is the bottom, so it can never raise anything. */
export function rankOfDestination(id) {
  const found = BY_ID.get(String(id || ''));
  return found ? found.rank : 0;
}

export const destinationLabel = (id) => (BY_ID.get(String(id || '')) || {}).label || '';

export const ACCURX_ROUTE_SCHEMA = z.object({
  destination: z.enum([...DESTINATIONS.map((d) => d.id), 'unsure'])
    .describe('Which of the practice’s destinations this message goes to. "unsure" if the message does not give you enough to say — it is a real answer and it changes nothing, which is safer than a guess.'),
  // The card may only say something the patient wrote. This is the span that
  // proves it, and it is checked against the message in code before a word of
  // it is rendered — see ARCHITECTURE.md on span-local assertions.
  evidence: z.string().default('')
    .describe('The words from the message that decided it, COPIED CHARACTER FOR CHARACTER. Not a summary and not your reasoning — a quote. One sentence at most. It is checked against the message and dropped if it is not found there.'),
  page: z.string().default('')
    .describe('The exact title of the Notebook page you relied on, copied from the list, or empty. Never invent one.'),
});

/**
 * What the reader is asked.
 *
 * Deliberately does NOT say what the patterns decided. An anchored second
 * opinion is not a second opinion — ./safety/triage-pass.mjs classifies without
 * being told the floor either, for exactly this reason.
 */
export function accurxRoutePrompt({ question, notebook = '' }) {
  const fence = (t) => String(t || '').replace(/"{3,}/g, '""');
  return [
    'You are reading one message a patient sent to The Riverside Practice, a UK GP surgery, through AccurX. Reception has to decide where it goes. That is the only thing you are doing.',
    '',
    'You are NOT writing an answer, NOT advising anybody, NOT diagnosing, and NOT talking to the patient. Nothing you write is shown as advice — the card the receptionist sees is built in code from the destination you name.',
    '',
    'THE PRACTICE’S DESTINATIONS. These are the only ones. Do not name a service that is not on this list, however sensible it would be.',
    '',
    ...DESTINATIONS.map((d) => '- "' + d.id + '" — ' + d.label + '. ' + d.covers),
    '',
    'HOW TO CHOOSE',
    '- READ THE WHOLE MESSAGE AS ONE PICTURE. It usually describes several things at once. Ask where the WHOLE person goes, not where the loudest symptom goes on its own — symptoms that are unremarkable apart can be the reason for the appointment together.',
    '- A symptom in a limb is not automatically musculoskeletal. Swelling, colour change, breathlessness, dizziness and headache are not joint, muscle or tendon problems however much they hurt, and an FCP is the wrong reader for them.',
    '- Say who NEEDS to read this, not who could. If more than one destination fits, choose the more senior one. Being wrong upwards costs somebody a conversation with a doctor; being wrong downwards is how something gets missed.',
    '- A recent pregnancy, miscarriage, termination or birth changes what new symptoms mean. So does a symptom that has not been explained, and so does anything the patient is already waiting on a result for.',
    '- You cannot make anything less urgent. If you name a destination less senior than the practice’s own rules already chose, it is ignored — so there is nothing to be gained by being cautious downwards, and "unsure" is a real answer.',
    '',
    notebook
      ? [
        'THE PRACTICE NOTEBOOK — every page it holds, one line each. This is the only thing you know about how this practice works. Nothing else you have ever read applies here: not how other surgeries work, not what is usual in the NHS.',
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
 * Fold what the reader said into what the patterns decided. Never lowers it.
 *
 * @param {string} floor    the destination the cascade chose — the id on its card
 * @param {object} verdict  what ACCURX_ROUTE_SCHEMA returned, or null on any failure
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
