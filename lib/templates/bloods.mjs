// The blood form: which tests get ordered, and what goes in Clinical Details.
//
// THE JOB. Somebody at the desk has a patient booked for a health check and
// has to raise the pathology request on EMIS. What they are looking at is the
// Order tab: a wall of tick boxes in sections — Biochemistry 1, Biochemistry 2,
// Virology, Haematology — an **Ordered Items** list on the right that fills up
// as boxes are ticked, and a **Clinical Details** box under it. Two things get
// that screen wrong: ticking the wrong boxes, and leaving Clinical Details
// empty, which is what the laboratory reads to know why the sample was sent.
//
// So the card is that screen, filled in: the tests to tick under the screen's
// own section headings, the Ordered Items list as it should read when they are
// all ticked, and the type of health check typed into Clinical Details. It is
// laid out here in code — the same argument the e-RS screen makes next door in
// ./referrals.mjs — so the boxes cannot drift however a model words things.
//
// WHAT IS RECORDED AND WHAT IS NOT. The practice has recorded ONE filled-in
// form: the health-check bloods, shown here exactly as it was sent. The other
// reviews on the bloods-first list have no form recorded, and the tests for
// them are not the same tests. So a review this file does not hold is answered
// with the screen, the Clinical Details line and an honest empty Ordered Items
// box — never with the health-check panel wearing another review's name. A
// wrong tick is a patient bled for the wrong test and a review that cannot go
// ahead when the results come back.
import { answer, bullets, expand, note, pathology, steps } from './blocks.mjs';
import { BLOODS_FIRST, HARD_GATES } from '../triage/destinations.mjs';

/**
 * The forms the practice has recorded, each exactly as it was filled in.
 *
 * `groups` are the screen's own sections in the screen's own order, holding the
 * boxes that are ticked. `ordered` is the Ordered Items list as the screen
 * shows it — kept separately rather than derived from the groups, because it is
 * what the reader checks their own screen against, and it is listed in the
 * order the boxes were ticked rather than in section order.
 *
 * `clinicalDetails` is what was typed into that box on the recorded form. The
 * card overwrites it with the check the reader named — that is the whole point
 * of the field — and falls back to this when they named none.
 */
export const BLOOD_FORMS = [
  {
    id: 'healthCheck',
    // What this form is for, in the practice's own words. Matched against the
    // message by `bloodForm` below.
    check: 'Health check',
    re: /\b(nhs health check|health check|new patient (?:health )?check|well ?(?:man|woman) check|cvs|cardiovascular)\b/i,
    groups: [
      { heading: 'Biochemistry 1', tests: ['Electrolytes + Creatinine', 'Liver Profile (LFT)'] },
      { heading: 'Biochemistry 2', tests: ['TFTs - Free T4 & TSH'] },
      { heading: 'Haematology', tests: ['Full Blood Count (FBC)'] },
    ],
    ordered: [
      'Electrolytes + Creatinine',
      'Liver Profile (LFT)',
      'TFTs - Free T4 & TSH',
      'Full Blood Count (FBC)',
    ],
    clinicalDetails: 'CVS',
  },
];

/** Every test on a recorded form, in the order the Ordered Items box lists them. */
export const orderedItems = (form) => (form && form.ordered ? form.ordered.slice() : []);

/**
 * The recorded form for what was named, or null.
 *
 * Matched on the whole string the model returned rather than on a fixed list of
 * ids: "NHS health check", "new patient check" and "health check bloods" are
 * the same form, and reception types all three.
 */
export function bloodForm(check = '') {
  const asked = String(check || '').trim();
  if (!asked) return null;
  return BLOOD_FORMS.find((f) => f.re.test(asked)) || null;
}

/**
 * What goes in Clinical Details: the type of health check, in the words the
 * reader used, with only the words that are not the name of a check taken out.
 * "bloods for an NHS health check" is typed into that box as "NHS Health
 * Check"; "blood form" names no check at all and comes back empty.
 *
 * The reader's own words rather than a canonical name on purpose: the practice
 * writes "CVS" on one form and "NHS Health Check" on the next, and neither is
 * this file's to correct.
 */
export function clinicalDetails(check = '') {
  const said = String(check || '')
    .replace(/\b(blood(?:s| test| form)?s?|form|pathology|request|order|tests?|please|for|the|a|an)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return said ? said.replace(/^[a-z]/, (c) => c.toUpperCase()) : '';
}

// What makes a string the name of a check rather than the tail of a question.
// Deliberately small: the recorded forms are matched by name of their own, and
// this only has to tell "diabetes review" from "what goes on".
const CHECK_WORDS = /\b(check|review|screen(?:ing)?|monitoring|mot)\b/i;

// The two gates that stop a blood form before the tests on it matter: who may
// be bled here at all, and by when. Taken from the practice's hard gates BY
// NAME rather than by matching their wording — the gate is a key and the rule
// is prose, and a card that greps prose loses the rule the day somebody
// rewrites it.
const GATES = ['Health check bloods', 'Under 16 — blood tests'];
const TIMING = GATES
  .map((gate) => HARD_GATES.find((g) => g.gate === gate))
  .filter(Boolean)
  .map((g) => '**' + g.gate + '** — ' + g.rule);

const SOURCE = ['Blood form — test requests (EMIS Web)', 'Reviews that need a blood test first'];

/**
 * The card.
 *
 * `check` is the type of health check the message named, in whatever words it
 * used. Three ways it can go, and they are different answers:
 *
 *   A check this file holds a form for — the form, filled in, with the check
 *   typed into Clinical Details.
 *
 *   A check it holds no form for — the screen and the Clinical Details line,
 *   with NOTHING ticked and the gap flagged. The health-check panel wearing
 *   another review's name is a patient bled for the wrong tests.
 *
 *   No check named at all ("what goes on a blood form") — the one form the
 *   practice has recorded, said to be that one, with Clinical Details still
 *   reading what was on it.
 */
export function bloodFormAnswer({ check = '' } = {}) {
  const asked = String(check || '').trim();
  const recorded = bloodForm(asked);
  const said = clinicalDetails(asked);
  // What the message named, IF it named a check. Two things are not that, and
  // they are different from each other: a question about the form itself
  // ("what goes on a blood form"), and words left over from one ("what goes
  // on"). Neither is a check nobody has recorded, and answering either with
  // "no form recorded for what goes on" is a card that has misread its own
  // input. So a check is a recorded form, or text that says check or review.
  const named = recorded ? said : (CHECK_WORDS.test(said) ? said : '');
  const form = recorded || (named ? null : BLOOD_FORMS[0]);
  const unrecorded = !!named && !form;
  const details = named || (form ? form.clinicalDetails : '');

  return answer({
    title: 'Blood form',
    subtitle: unrecorded
      ? 'No form recorded for ' + details.toLowerCase() + ' — the tests come from the request'
      : named
        ? details + ' — the tests to order, and what goes in Clinical Details'
        : form.check + ' bloods — the tests to order, and what goes in Clinical Details',
    blocks: [
      unrecorded ? note(
        '**The practice has recorded one filled-in blood form: the health check.** The tests for '
        + details.toLowerCase() + ' are not those tests, so nothing is ticked below. Take them from the '
        + 'clinician’s request, or ask the nurse, before the patient is bled.',
        'warn',
      ) : null,

      // Nobody said which check. The form below is a real one and the card says
      // which, rather than letting it read as the panel for every review.
      !named && form ? note(
        'This is the blood form the practice has recorded — the **' + form.check.toLowerCase() + '**. Clinical Details on it reads **'
        + form.clinicalDetails + '**; change it to the check the patient is booked for. For a review with a '
        + 'different form, say which and the card follows it.',
        'info',
      ) : null,

      // The screen itself, filled in. Ordered Items is the list the reader
      // checks their own screen against; Clinical Details is the box that is
      // left empty otherwise.
      pathology({
        groups: form ? form.groups : [],
        ordered: form ? orderedItems(form) : [],
        clinicalDetails: details,
        ticksMissing: 'Not recorded — tick what the clinician’s request asks for',
        orderedMissing: 'Nothing ordered yet — the list fills as the boxes are ticked',
        detailsMissing: 'The type of health check — "NHS Health Check", "New patient health check"',
      }),

      note(
        '**Clinical Details is the type of health check**, and it is not optional: it is what the laboratory reads to know why the sample was sent. A form that goes off with it empty comes back queried.',
        'info',
      ),

      steps([
        'On the patient’s record, open **Test Requests** and go to the **Order** tab.',
        form
          ? 'Under **Pathology**, tick ' + form.ordered.map((t) => '**' + t + '**').join(', ') + '.'
          : 'Under **Pathology**, tick the tests the request asks for. **Test Search** finds one by name if it is not on the visible list.',
        'Check the **Ordered Items** list on the right reads back the same tests — that list, not the tick boxes, is what gets sent.',
        'Type the type of health check into **Clinical Details**' + (details ? ' — **' + details + '**.' : '.'),
      ]),

      ...TIMING.map((rule) => note(rule, 'warn')),

      expand('Which reviews need the bloods first', [
        bullets(BLOODS_FIRST),
        note('The bloods are booked BEFORE the review, not after it. Results take about five working days, so a review booked the wrong way round wastes both appointments.', 'info'),
      ]),
    ],
    source: SOURCE,
    // A gap the practice should hear about, rather than one met with a shrug at
    // the desk: a review that needs bloods first and has no form written down.
    flag: unrecorded ? 'No blood form recorded for ' + details.toLowerCase() : '',
  });
}
