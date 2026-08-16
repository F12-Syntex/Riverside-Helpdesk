// The nurse clinic and the diabetes nurse.
//
// Two destinations that the triage did not have, and their absence was not a
// gap in coverage — it was a wrong answer every time. "Her stitches need to come
// out on Thursday" matched nothing, fell to the bottom of the order and came
// back as "not on a pharmacy list, pass it to the duty doctor". "Diabetic review
// due" did the same. Both are nurse appointments the practice books every week,
// and sending them to a doctor is how a duty list fills up with work nobody
// needed a doctor for.
//
// WHAT THESE CARDS DO NOT DO. They do not decide whether a wound is infected,
// whether a sugar reading is dangerous, or whether a diabetic is unwell. Those
// questions are answered ABOVE these cards, in lib/triage/destinations.mjs,
// which routes them to a doctor before either card is reached. What is left here
// is a booking, and a booking is what these cards are about.
import { answer, bullets, expand, field, fields, note } from './blocks.mjs';
import {
  BLOODS_FIRST, NURSE_CLINIC_DAYS, NURSE_RULES,
  handledBy, notHandledBy, sendTo,
} from '../triage/destinations.mjs';

const heading = (said) => (said.length > 64 ? said.slice(0, 61).replace(/[\s,;.]+$/, '') + '…' : said);

const NURSE_SOURCES = ['Nurse and HCA services, and which days', 'Reviews that need a blood test first'];

/**
 * A nurse-clinic procedure.
 *
 * `task` is the entry from NURSE_TASKS that matched — the label names it on the
 * card, and its `note` is the one thing that changes the booking. Everything
 * else on the card is the same whichever task it was: which days the nurses
 * work, and the one question reception must not book past.
 */
export function practiceNurseAnswer({ condition = '', task = null } = {}) {
  const said = String(condition || '').trim();
  const what = (task && task.label) || 'A nurse appointment';

  return answer({
    title: said ? heading(said) : what,
    subtitle: 'The nurse clinic',
    blocks: [
      fields([
        field('Send it to', sendTo('practice-nurse'), { copy: true }),
        field('What for', what),
        field('Days', 'Mondays, Wednesdays and Fridays'),
      ], 'Where this goes'),

      task && task.note ? note(task.note, 'warn') : null,

      note('This is a **booking**, not a clinical question. If the patient is describing a new symptom as well as asking for the procedure, the symptom decides where it goes — route that separately.', 'info'),

      bullets([
        `Book a **nurse appointment**. ${NURSE_CLINIC_DAYS}`,
        'Put what the patient asked for in the booking note, in their words.',
      ]),

      expand('What the nurse clinic covers', [
        bullets(handledBy('practice-nurse')),
        bullets(NURSE_RULES, 'The two that catch people out'),
        bullets(BLOODS_FIRST, 'These need the bloods taken first'),
      ]),

      expand('What does not go to the nurse', [bullets(notHandledBy('practice-nurse'))]),
    ],
    source: ['Triage guidelines', ...NURSE_SOURCES],
  });
}

/**
 * A wound the nurse should not be booked for yet.
 *
 * Reached when a dressing or a stitches-out request also says the wound is
 * infected, spreading, not healing, or that the patient feels unwell with it —
 * see nurseTaskNeedsGp. The nurse still does the dressing; a doctor decides
 * first whether that is all it needs, and reception must not book past that.
 */
export function woundNeedsGpAnswer({ condition = '', task = null } = {}) {
  const said = String(condition || '').trim() || (task && task.label) || 'A wound that is not healing';

  return answer({
    title: heading(said),
    subtitle: 'A doctor first — then the dressing',
    blocks: [
      fields([field('Send it to', sendTo('gp'), { copy: true })], 'Where this goes'),

      note('This message says the wound is <mark>infected, spreading, not healing, or that the patient feels unwell with it</mark>. That is a clinical question, not a dressing appointment — pass it to the **duty doctor** today.', 'critical'),

      bullets([
        'Do not book this into the nurse clinic yet.',
        'Repeat what the patient wrote about the wound, in their words.',
        'If a dressing is all it needs, the clinician says so and it goes to the nurse afterwards.',
      ]),
    ],
    source: ['Triage guidelines', ...NURSE_SOURCES],
  });
}

/**
 * Routine diabetes care.
 *
 * Reached only when the message is about diabetes, is asking for something
 * routine, and carries none of the shapes that make it a doctor's — see
 * needsDiabetesNurse. So this card can be about the appointment, and the one
 * thing it has to say about the patient is what would change the appointment:
 * the bloods come first.
 */
export function diabetesNurseAnswer({ condition = '' } = {}) {
  const said = String(condition || '').trim();

  return answer({
    title: said ? heading(said) : 'Diabetes review',
    subtitle: 'The diabetes nurse',
    blocks: [
      fields([
        field('Send it to', sendTo('diabetes-nurse'), { copy: true }),
        field('Days', 'Mondays, Wednesdays and Fridays'),
      ], 'Where this goes'),

      note('A **diabetes review needs the bloods first**. Book the blood test, then the review — a review booked ahead of the results is a review that gets cancelled on the day. Health-check bloods must be taken **before 1 pm**.', 'warn'),

      // The card is a booking card, so the one thing it must say about the
      // patient is the thing that stops it being one.
      note('If the patient is **unwell now** — vomiting, ketones, a hypo, drowsy or confused — or if a **foot has an ulcer, has gone black or looks infected**, this is not a nurse booking. Pass it to the **duty doctor** today.', 'critical'),

      bullets([
        'Book with the **diabetes nurse**, not the duty doctor.',
        'Check whether the HbA1c has been done. If not, book the bloods first.',
      ]),

      expand('What the diabetes nurse covers', [
        bullets(handledBy('diabetes-nurse')),
        bullets(notHandledBy('diabetes-nurse'), 'What goes elsewhere'),
      ]),
    ],
    source: ['Triage guidelines', ...NURSE_SOURCES],
  });
}

/**
 * A diabetes request that is not the nurse's.
 *
 * Three shapes reach this: a patient who has not been diagnosed, one who is
 * unwell now, and a foot that has gone wrong. The card deliberately says which
 * of those it is NOT deciding — whether the sugar is dangerous, whether the foot
 * is infected — because the whole reason it exists is that the nurse booking
 * would have answered those questions by default, silently, by not asking them.
 */
export function diabetesGpAnswer({ condition = '', foot = false } = {}) {
  const said = String(condition || '').trim() || 'Diabetes';

  return answer({
    title: heading(said),
    subtitle: 'A doctor — not the diabetes nurse',
    blocks: [
      fields([field('Send it to', sendTo('gp'), { copy: true })], 'Where this goes'),

      foot
        ? note('A **diabetic foot with an ulcer, a blackened toe or signs of infection** is not a routine foot check and does not wait for the recall. Pass it to the **duty doctor today**.', 'critical')
        : note('This is not routine diabetes care. A patient who has **not been diagnosed**, or who is **unwell now**, needs a clinician rather than a review appointment.', 'critical'),

      bullets([
        'Pass it to the **duty doctor** today.',
        'Repeat what the patient wrote, in their words. You are not confirming it and it is not yours to rule out.',
        'If the patient is acutely unwell, call **999** and stay with them.',
      ]),

      expand('What the diabetes nurse does take', [bullets(handledBy('diabetes-nurse'))]),
    ],
    source: ['Triage guidelines', ...NURSE_SOURCES],
  });
}
