// Registering a new patient on EMIS.
//
// The Notebook page for this is long, and it is long for a good reason: most of
// it is the four things that go wrong when the NHS number is not simply there.
// Read as a page, a receptionist with the patient in front of them has to scan
// past three scenarios that are not theirs to find the one that is.
//
// So it is a template. The workflow up to the trace form is the same every time
// and is always shown; the scenario is a variable, and naming it puts that one
// scenario's steps on the front of the card, with the others still one press
// away. Nothing is summarised — the steps are the page's steps, in the page's
// order, in the page's words.
//
// The two rules that are not steps at all — the under-5 vaccination warning and
// the over-5 health check — are notes, because they apply whichever scenario
// this turns out to be, and they are the parts nobody should have to scroll for.
import { answer, bullets, expand, field, fields, images, note, steps } from './blocks.mjs';

const SOURCE = ['Notebook: Registration and records / Registering a patient on EMIS'];

// The scenarios, in the order the page puts them: what the patient's record
// looks like when you search for them.
export const REGISTRATION_SCENARIOS = [
  {
    id: 'inactive',
    label: 'Shows as a local patient, inactive',
    when: 'No NHS number, and the patient appears under Local Patient marked inactive.',
    steps: [
      'Send **Iqra** a task to check the patient, and put the task **on hold**.',
      'Only once that is approved: select the patient and click **Register**.',
      'Press **OK** on the popup.',
      'A popup asks “Do you want to re-register the patient?” — press **Yes**.',
      'Check the patient’s details match the registration form, then press **Next**.',
    ],
    warn: 'An inactive patient needs Iqra’s explicit permission before registering. That is the whole difference between this and an active one.',
  },
  {
    id: 'active',
    label: 'Shows as a local patient, active',
    when: 'No NHS number to hand, but the patient is marked active under Local Patient.',
    steps: [
      'Press on the patient, then click **Register Patient**.',
      'Then follow the same steps as an inactive patient — check the details match, press **Next**.',
    ],
    warn: '',
  },
  {
    id: 'multiple',
    label: 'Several patients come back',
    when: 'The search returns more than one person.',
    steps: [
      'Call the patient and confirm their **NHS number**.',
      'If they cannot give it, confirm their **previous address** instead.',
      '**Do not register them** if neither can be confirmed — they need to bring their NHS number.',
    ],
    warn: 'Registering the wrong record is far harder to undo than asking the patient to ring back.',
  },
  {
    id: 'noNhsNumber',
    label: 'No NHS number at all (not born in the UK)',
    when: 'The patient has never had one — a baby, or somebody new to the UK.',
    steps: [
      'Press **Continue to create new patient**.',
      'On the **Add Regular Patient** screen, fill in the usual fields marked with an asterisk.',
      'Set the NHS number to **NONE** — not a previous number. This is their first time in the UK.',
      'Fill in the remaining details as normal.',
    ],
    warn: '',
  },
];

export const REGISTRATION_SCENARIO_IDS = REGISTRATION_SCENARIOS.map((s) => s.id);

// Up to the trace form. The same every time, whatever the search then shows.
const OPENING_STEPS = [
  'Find the registration email, or the paper form.',
  'Check whether NHS details are given under **Patient Details**.',
  'In EMIS, click the **EMIS** button in the top left.',
  'Go to **Registration → Registration**.',
  'Click **Add Patient → Regular Patient**.',
  'When the patient trace form opens, note down the **NHS number** if there is one.',
];

// After the scenario, and again the same every time.
const FINISHING_STEPS = [
  'Keep pressing **Next**, filling in the mandatory fields.',
  'Save the registration document to the patient’s record. A virtual registration needs no physical copy scanned.',
  'Send the patient the **new patient invite** — patients over 5 only.',
  'Attach a **booking link for a nurse AM appointment**.',
  'Double-click the **named GP missing** error in the popup.',
  'Press **OK**, then tick the two boxes that appear.',
  'Press **Save**, top left.',
];

function scenarioBlocks(scenario) {
  return [
    fields([field('When this happens', scenario.when)], scenario.label),
    steps(scenario.steps),
    scenario.warn ? note(scenario.warn, 'warn') : null,
  ].filter(Boolean);
}

/**
 * The card.
 *
 * @param {object} input
 * @param {string} [input.scenario] one of REGISTRATION_SCENARIO_IDS, or empty
 *                                  when the message does not say which it is
 * @param {string[]} [input.pictures] screenshots attached to the Notebook page
 *                                    this card stands in for. The template is
 *                                    code and cannot hold pictures of its own,
 *                                    so the page's own ones are passed in.
 */
export function registrationAnswer({ scenario = '', pictures = [] } = {}) {
  const named = REGISTRATION_SCENARIOS.find((s) => s.id === scenario) || null;
  const others = REGISTRATION_SCENARIOS.filter((s) => s !== named);

  return answer({
    title: named ? `Register a patient — ${named.label.toLowerCase()}` : 'Register a new patient on EMIS',
    subtitle: named ? 'EMIS registration' : 'EMIS registration — every scenario',
    blocks: [
      // First, because it is the one thing on this card that is about a person
      // rather than a screen, and the one thing that gets missed.
      note('<mark>Anyone under 5 who brings up the warning “incomplete routine schedule vacs” is booked in for a nursing appointment.</mark>', 'critical'),

      fields([
        field('Start from', 'The registration email, or the paper form'),
        field('Check first', 'Whether NHS details are given under Patient Details'),
      ], 'Before you open EMIS'),

      steps(OPENING_STEPS),

      // The scenario the message named, on the front of the card.
      ...(named ? scenarioBlocks(named) : []),

      // The rest, still here, still one press away.
      expand(
        named ? 'The other scenarios' : 'What the search shows, and what to do about it',
        others.flatMap((s) => scenarioBlocks(s)),
        named ? '' : 'Four ways it goes',
      ),

      steps(FINISHING_STEPS),

      // The screens themselves, when the page has them. A screenshot of the
      // trace form settles in one look what a sentence about it cannot.
      pictures.length ? images(pictures, 'The screens, from the Notebook page') : null,

      note('If a “Next Registration” popup appears, press **Exit New Registration** — then send the message and clear the named GP error as above.', 'info'),
      note('Patients over 5 are eligible for a new patient health check. That is what the invite and the nurse booking link are for.', 'info'),

      expand('If anything looks wrong', [
        bullets([
          'Check every detail against the registration form before pressing Next — verifying carefully is the whole job here.',
          'If a step does not match what is on screen, ask a senior member of staff rather than guessing.',
        ]),
      ]),
    ],
    source: SOURCE,
  });
}
