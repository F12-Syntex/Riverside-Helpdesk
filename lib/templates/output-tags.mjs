// Output tags: a Notebook folder saying what shape its pages come back in.
//
// THE PROBLEM. Most questions are answered by the `notebook` template, which
// shows the practice's page exactly as they wrote it. That is the right answer
// for prose — rewriting "put the papers in the yellow scanner" can only make it
// different, not more true. But a referrals page is not prose: it is a set of
// values that get typed into ONE screen, and showing it as a paragraph leaves
// the reader mapping sentences onto boxes. The templates that draw those
// screens exist (lib/templates/blocks.mjs — `ers`, `profMessage`, `pathology`),
// and until now the only way to reach one was for the picker to choose a
// template that happened to build it.
//
// THE TAG. The practice tags a folder in the Notebook — right-click, Format
// answers as — and every page beneath it comes back drawn as that screen. So
// "the referrals folder is an e-RS screen" is something the practice states
// once, in the Notebook, rather than something a model decides each time.
//
// WHAT A TAG DOES AND WHAT IT CANNOT DO.
//
//   It changes the SHAPE of an answer. It never changes WHICH answer: routing
//   is untouched, the picker chooses the page it always chose, and a tag cannot
//   make a page win a question it would otherwise lose.
//
//   The values come from the page and from nowhere else. A tagged page is read
//   once against the tag's schema, and the model is asked only to lift what is
//   written there — extraction, which it does reliably. It is not asked what a
//   referral usually needs, and a value the page does not carry is left empty,
//   which the screen draws as missing IN the box it belongs to.
//
//   THE PAGE IS STILL SHOWN, under the screen, always. A tagged card is the
//   page plus a drawing of it, never the drawing instead of it — so a page too
//   thin to fill the screen loses nothing, and a reader who thinks the screen
//   has it wrong can see what it was read from.
import { z } from 'zod';
import { ers, pathology, profMessage } from './blocks.mjs';

// What the model is told before it reads a tagged page. The same words for
// every tag, because the discipline is the same one every time.
const READ_RULES = [
  'Fill in the values from THE PAGE ITSELF. Copy the practice’s own wording exactly — a speciality, a clinic type, an address, a test name is typed into a screen character for character, and a tidied version is one that finds nothing.',
  'Leave a value EMPTY rather than guessing it. An empty box is drawn as missing, which tells the reader to find it; an invented one sends a referral to the wrong service.',
  'Nothing you know about how GP surgeries usually work belongs here. If the page does not say it, it is not known.',
  'Where the page describes several different cases, fill in the one the MESSAGE is about. If it is about none of them in particular, leave the values empty — the page is shown underneath either way.',
];

/**
 * A colour per tag, so a tagged folder can be recognised down a sidebar without
 * reading it.
 *
 * FROM THE NHS IDENTITY PALETTE, and chosen to be told apart rather than to be
 * pretty: blue, aqua green and pink sit far enough apart that a glance down a
 * tree sorts them, and far enough from the red this app reserves for deleting
 * and for a safety rule that neither can be mistaken for one.
 *
 * `ink` is the colour of the word, `tint` the ground it sits on, and `edge` the
 * line that runs down the folder's contents. Colour is never the only signal —
 * every chip carries its name, and the folder's own row spells the tag out in
 * full — so this works for somebody who cannot tell aqua from blue.
 */
export const TAG_COLOURS = {
  blue: { ink: '#005eb8', tint: '#e8f1f8', edge: '#4a90c9' },
  aqua: { ink: '#00786f', tint: '#e3f3f2', edge: '#3fada5' },
  pink: { ink: '#ae2573', tint: '#fbe9f2', edge: '#c15f98' },
};

/**
 * Every tag a folder can carry.
 *
 * `schema` is what the model fills in from the page; `render` turns that into
 * the block, or returns null when what came back is too thin to draw — in which
 * case the card is the page alone, exactly as it was before the tag existed.
 *
 * The list is deliberately the three SCREEN blocks and nothing else. A tag
 * earns its place the same way a block does: the reader is copying values into
 * one particular screen, and a card that names the values without drawing it
 * leaves them hunting for the boxes. "Format this page as bullet points" is a
 * different kind of wish and does not belong here.
 */
export const OUTPUT_TAGS = [
  {
    id: 'ers',
    label: 'e-RS screen',
    short: 'e-RS',
    help: 'Pages come back drawn as the e-RS “Search for a service” screen.',
    colour: TAG_COLOURS.blue,
    schema: z.object({
      specialty: z.string().default('').describe('The e-RS Specialty, exactly as the page writes it — "Dermatology", "Children and Adolescence Services". Empty if the page does not name one.'),
      clinicType: z.string().default('').describe('The Clinic type, exactly as the page writes it. Empty if the page does not name one, or where the page offers a choice — put those in clinicTypeOptions instead.'),
      clinicTypeOptions: z.array(z.string()).default([]).describe('Only where the page records a CHOICE of clinic type the reader has to make. Two or three at most, in the page’s words. Empty otherwise.'),
      clinicTypeCondition: z.string().default('').describe('A rule the page states against the clinic type — "Extended Scope only when the doctor has asked for it". Empty if it states none.'),
      hospital: z.string().default('').describe('The organisation or site the page NAMES — "Homerton University Hospital". Empty if the page names none; a rule for picking one goes in hospitalRule, not here.'),
      hospitalRule: z.string().default('').describe('How the page says to pick the hospital, where it gives a rule rather than a name — "the first hospital that is not a telederm", "must contain Telederm". Empty if the page gives none.'),
      pathway: z.string().default('').describe('A named service or pathway the page says to search for. Empty if it names none.'),
      priority: z.string().default('Routine').describe('"Routine", "Urgent" or "2WW" — only where the page says which. "Routine" otherwise.'),
    }),
    // A screen with neither a speciality nor a clinic type on it is a picture of
    // an empty form: it tells the reader nothing the page did not, and it takes
    // the top of the card to do it.
    render: (v) => (v.specialty || v.clinicType || (v.clinicTypeOptions || []).length
      ? ers({
        specialty: v.specialty,
        clinicType: v.clinicType,
        clinicTypeOptions: v.clinicTypeOptions,
        clinicTypeCondition: v.clinicTypeCondition,
        hospital: v.hospital,
        hospitalRule: v.hospitalRule,
        pathway: v.pathway,
        priority: v.priority,
        missing: 'Not on the page — take it from the doctor’s task',
      })
      : null),
  },
  {
    id: 'profMessage',
    label: 'AccurX message',
    short: 'AccurX',
    help: 'Pages come back drawn as the AccurX “New professional message” window.',
    colour: TAG_COLOURS.aqua,
    schema: z.object({
      to: z.string().default('').describe('The email address the page says to send to, character for character. Empty if the page does not give one.'),
      org: z.string().default('').describe('The organisation or team it goes to, as the page names it. Empty if it does not.'),
      body: z.string().default('').describe('The wording the page says to send, COPIED FROM THE PAGE. Never composed: if the page does not give wording, leave this empty. No patient name, date of birth or NHS number, ever — Accurx attaches the record itself.'),
      attach: z.string().default('').describe('What the page says to attach — "EMIS file", a named form. Empty if it does not say.'),
      form: z.string().default('').describe('The form the page names, if any. Empty otherwise.'),
    }),
    // An address or wording is the point of the window. Without either it is a
    // drawing of an empty message box.
    render: (v) => (v.to || v.body
      ? profMessage({
        to: v.to,
        toMissing: 'Not on the page — fills in from the document',
        org: v.org,
        body: v.body,
        attach: v.attach || 'EMIS file',
        form: v.form,
      })
      : null),
  },
  {
    id: 'pathology',
    label: 'Blood form',
    short: 'Bloods',
    help: 'Pages come back drawn as the EMIS Test Requests screen.',
    colour: TAG_COLOURS.pink,
    schema: z.object({
      ordered: z.array(z.string()).default([]).describe('Every test the page says to order, in the order it lists them, in the page’s own words. Empty if the page names no tests.'),
      clinicalDetails: z.string().default('').describe('What the page says goes in Clinical Details — usually the type of health check or review. Empty if it does not say.'),
    }),
    // Nothing ordered is nothing to draw: the blood-form card built from the
    // practice's own recorded forms (./bloods.mjs) is a better answer than an
    // empty screen, and it is reachable by its own template.
    render: (v) => ((v.ordered || []).length
      ? pathology({
        ordered: v.ordered,
        groups: [],
        clinicalDetails: v.clinicalDetails,
        orderedMissing: 'Nothing on the page to order',
        detailsMissing: 'Not on the page — the type of health check',
      })
      : null),
  },
];

/** The tag ids, for the schema the API and the notebook validate against. */
export const OUTPUT_TAG_IDS = OUTPUT_TAGS.map((t) => t.id);

/** One tag by id, or null. An unknown id is no tag at all, never a default. */
export const outputTag = (id) => OUTPUT_TAGS.find((t) => t.id === String(id || '')) || null;

/** Is this something a folder may be tagged with? '' clears the tag. */
export const isOutputTag = (id) => id === '' || OUTPUT_TAG_IDS.includes(String(id || ''));

/**
 * What the model is asked when a tagged page answers a question.
 *
 * The page and the message, and nothing else — no Notebook, no catalogue, no
 * templates to choose between. The choosing already happened; this call lifts
 * values out of one page.
 */
export function outputTagPrompt({ tag, page, question = '' }) {
  const fence = (t) => String(t || '').replace(/"{3,}/g, '""');
  return [
    'You are the assistant for The Riverside Practice, a UK GP surgery.',
    '',
    'The page below is the practice’s own, and it is the answer to the message. The practice has said that pages in this part of its Notebook are shown as the ' + tag.label + ', so the values on that screen have to be filled in from the page.',
    '',
    'YOU ARE NOT WRITING THE ANSWER. The page is shown to the reader in full, underneath, exactly as it is written. All you are doing is lifting the values out of it so the screen can be drawn.',
    '',
    ...READ_RULES.map((r) => '- ' + r),
    '',
    'THE PAGE:',
    '"""',
    fence(page.text),
    '"""',
    '',
    'THE MESSAGE:',
    '"""',
    fence(question),
    '"""',
  ].join('\n');
}

/**
 * The card, with the tagged screen drawn above the page.
 *
 * Returns the card UNCHANGED when the read came back too thin to draw, which is
 * the honest outcome for a page that does not carry the values: the reader gets
 * what they got before, rather than a picture of an empty form.
 */
export function withTaggedOutput(card, tag, values) {
  if (!card || !tag) return card;
  let block = null;
  try {
    block = tag.render(values || {});
  } catch (e) {
    // A malformed read is a read that did not happen. The page still answers.
    block = null;
  }
  if (!block) return card;
  return { ...card, blocks: [block, ...(card.blocks || [])] };
}
