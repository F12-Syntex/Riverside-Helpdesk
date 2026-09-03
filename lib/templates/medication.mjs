// /medication: a repeat-medication screen, read off a screenshot and laid out
// for AccurX.
//
// THE JOB. A patient asks for a repeat prescription through AccurX, and the
// AccurX form wants each medication on its own line, "including the strength
// you are requesting (e.g. Paracetamol 500mg)" — one box per medication, Add
// another medication, and an optional "anything else" box for quantities. What
// reception has in front of them is the EMIS repeat-medication screen: a
// table under headings ("Repeat", "Variable use repeat"), one line per drug,
// the drug and strength in bold, the directions and the quantity after it.
//
// So the card is that screen, transcribed, in the shape the form wants: the
// screen's own headings kept, one row per medication numbered the way the
// form numbers its boxes, the drug-strength-form as the value with its own
// Copy, and the directions and quantity under it for checking against the
// screen. Nothing is reworded — "One To Be Taken Each Day after food" stays
// in the capitals the screen used — because the reader is copying, not
// composing, and a tidied line is a line that no longer matches the record.
//
// THE PICTURE IS READ BY THE IMAGES ROLE (lib/settings.js), not by the model
// that writes answers: this is a transcription, and a small vision model is
// the right size for it. What it returns is DATA (groups of medications), and
// the card is rendered here in code, so the layout cannot drift however the
// model words things.
import { answer, bullets, expand, field, fields, message, note, steps } from './blocks.mjs';

// What the model is told, and what the disclosure at the foot of the card
// shows the reader. One list, so neither can drift from the other.
export const MEDICATION_READ_RULES = [
  'Each medication is copied exactly as the screen shows it: the drug, the strength and the form together — "Citalopram 20mg tablets", "Co-codamol 30mg/500mg tablets". That is the line the AccurX box asks for.',
  'The directions stay as written, capitals and all — "One To Be Taken Each Day after food" — and so does the quantity — "28 tablet". Nothing is tidied, expanded or corrected.',
  'The screen’s own headings are kept, in the order they appear: "Repeat", "Variable use repeat", "Acute", and so on. A medication under no heading is listed under none.',
  'Nothing is added that is not on the screen, no two lines are merged, and no line is dropped. A line that cannot be read in full is still a line: what can be read is copied and the rest is left empty.',
  'No patient name, date of birth, NHS number or address is carried onto the card, even where the screen shows one.',
];

// How many medications one screen can reasonably carry. A screenshot of the
// whole screen is a dozen lines; anything past this is a model repeating
// itself rather than a patient on forty drugs.
export const MAX_MEDICATIONS = 30;
export const MAX_GROUPS = 8;

/**
 * The card, from what was read off the screen.
 *
 * `groups` is [{ heading, medications: [{ name, dose, quantity }] }], already
 * cleaned by the caller. Numbering runs on through the groups rather than
 * restarting under each heading, because the AccurX form's boxes are numbered
 * that way — Medication #1, #2, #3 — and the row on the card should say which
 * box it goes in.
 */
export function repeatMedicationAnswer({ groups = [] }) {
  let n = 0;
  const names = [];
  const blocks = [];
  for (const group of groups) {
    const items = [];
    for (const m of group.medications || []) {
      n += 1;
      names.push(m.name);
      items.push(field('Medication ' + n, m.name, {
        copy: true,
        hint: [m.dose, m.quantity].filter(Boolean).join(' · '),
      }));
    }
    if (items.length) blocks.push(fields(items, group.heading || ''));
  }
  return answer({
    title: 'Repeat prescription request',
    subtitle: n + (n === 1 ? ' medication' : ' medications') + ' read from the screen — one Copy per AccurX box',
    blocks: [
      ...blocks,
      // For the "anything else" box, or for a form that takes a list: every
      // line at once.
      message(names.join('\n'), 'Every medication, one per line'),
      // A transcription is not the record. The screen is still open beside
      // this; the line to check is the one about to be sent.
      note('**Check each line against the screen before sending.** What is here was read off a picture, not taken from the record.', 'warn'),
      expand('How this was read', [bullets(MEDICATION_READ_RULES)]),
    ],
    source: ['Repeat medication screen'],
  });
}

/**
 * Nothing to build a card from: the mode was chosen and no screenshot came
 * with it, or the picture could not be read. How the mode is used, rather than
 * prose — and never an invented list.
 */
export function repeatMedicationRulesAnswer({ images = 0, failed = '' } = {}) {
  // A picture WAS sent and nothing came back from it. That is a different
  // situation from no picture, and the card must not answer it with "paste a
  // screenshot": the reader just did. Say what happened, and what to try.
  const sent = images > 0;
  return answer({
    title: 'Formatting a repeat medication screen for AccurX',
    subtitle: sent
      ? 'The picture was sent, but no medication could be read off it'
      : 'Nothing was read — paste a screenshot of the screen',
    blocks: [
      sent ? note(
        (failed
          ? '**The model could not read the picture** (' + failed + '). '
          : '**Nothing on the picture was read as a medication.** ')
        + 'Check the screenshot shows the repeat medication list itself — the drug, strength and directions on each line — and try again. If it keeps failing, the Images model at /settings may not read pictures; choose one that does.',
        'warn',
      ) : null,
      steps([
        'On the patient’s record, open the repeat medication screen so every line is in view.',
        'Take a screenshot of it (Windows: **Win + Shift + S**, then drag over the list).',
        'With **Repeat medication** chosen in the field, paste the screenshot into the field (**Ctrl + V**) and press Enter.',
        'Each medication comes back with its own **Copy**, numbered the way the AccurX form numbers its boxes.',
      ]),
      fields([
        field('Each box', 'the drug, strength and form as the screen shows it — "Citalopram 20mg tablets"'),
        field('Anything else', 'the quantities, if the patient needs a different one'),
      ], 'What goes where on the AccurX form'),
      note('A typed list works too: "Citalopram 20mg tablets, Mirtazapine 45mg tablets". The screenshot is quicker and copies the strengths exactly.', 'info'),
      expand('How a screen is read', [bullets(MEDICATION_READ_RULES)]),
    ],
    source: ['Repeat medication screen'],
  });
}
