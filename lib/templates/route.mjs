// The prompts and renderers behind a turn.
//
// TWO KINDS OF TURN, AND ONLY TWO.
//
// A SLASH COMMAND names its card outright (/accurx, /consultation,
// /medication — lib/commands.mjs). The model is asked for that one card's
// values and nothing else, and the card is rendered from them in code: the
// record entry is assembled by consultationEntry, the routing card from the
// reading, so the format cannot drift however the model words things. That
// half of this file is COMMAND_SCHEMAS, commandPrompt and renderCommand.
//
// EVERY OTHER QUESTION is answered in prose from the whole Notebook, and the
// answer cites the pages it used (proseSystemPrompt). There is no picker any
// more: no template enum, no page chosen by title, no card in the chat. The
// writer reads every page, answers only from them, and names each page it used
// by its heading; code turns those names into links and refuses any it cannot
// find (lib/questions/references.mjs).
import { z } from 'zod';
import { accurxAnswer } from './accurx.mjs';
import { ACCURX_READ_SCHEMA, accurxReadPrompt, readingVerdict } from './accurx-route.mjs';
import { renderKind } from '../notebook/kinds.mjs';
import {
  MAX_GROUPS, MAX_MEDICATIONS, MEDICATION_READ_RULES, repeatMedicationAnswer, repeatMedicationRulesAnswer,
} from './medication.mjs';
import {
  BOOKING_RULES, CONSULTATION_NOTE_RULES, CONTINUITY_RULES, REASON_LINE_EXAMPLES, REASON_RULES,
  consultationNoteAnswer, consultationNoteRulesAnswer,
} from './writing.mjs';

// A repeat-medication screen as DATA: the screen's own groups, each holding
// its medications in the three parts the card and the AccurX form tell apart.
// The /medication command's schema (COMMAND_SCHEMAS.repeatMedication).
export const MEDICATION_GROUPS_SCHEMA = z.array(z.object({
  heading: z.string().default('')
    .describe('The heading the screen puts over this group, exactly as written: "Repeat", "Variable use repeat", "Acute". Empty when the medications sit under no heading.'),
  medications: z.array(z.object({
    name: z.string().default('')
      .describe('The drug, strength and form together, exactly as shown: "Citalopram 20mg tablets", "Co-codamol 30mg/500mg tablets".'),
    dose: z.string().default('')
      .describe('The directions exactly as shown, capitals and all: "One To Be Taken Each Day after food". Empty if none are shown.'),
    quantity: z.string().default('')
      .describe('The quantity exactly as shown: "28 tablet", "56 tablet". Empty if none is shown.'),
  })).default([]),
})).default([]);

/**
 * What the model returned for a medication screen, cleaned: whitespace
 * collapsed, rows with no drug dropped, empty groups dropped, and both bounded.
 * Used by renderCommand for /medication.
 */
export function medicationGroups(raw) {
  const str = (v) => String(v || '').replace(/\s+/g, ' ').trim();
  let kept = 0;
  return (Array.isArray(raw) ? raw : [])
    .map((g) => ({
      heading: str(g && g.heading),
      medications: (Array.isArray(g && g.medications) ? g.medications : [])
        .map((m) => ({ name: str(m && m.name), dose: str(m && m.dose), quantity: str(m && m.quantity) }))
        // A row with no drug on it is nothing to copy. The directions on
        // their own are not a medication.
        .filter((m) => m.name)
        .filter(() => kept++ < MAX_MEDICATIONS),
    }))
    .filter((g) => g.medications.length)
    .slice(0, MAX_GROUPS);
}

/**
 * Every page of the Notebook, whole, each under its `### ` heading — the
 * page's full path, "Notebook: Section / Page".
 *
 * This is what the Q&A writer reads on every turn, and the heading is what it
 * cites a page by. It is also the text the prose path's number allow-list is
 * built from, so a number written on any page survives the redactor.
 *
 * NO PAGE IS CUT. A page cut at twelve thousand characters is a page whose last
 * section cannot be answered from, and that failure looks exactly like a wrong
 * answer.
 *
 * BYTE-STABLE. The same Notebook gives the same text, in the same order, on
 * every turn — nothing about the question goes into it — so it can sit at the
 * front of the prompt and be cached by the provider (see proseSystemPrompt).
 */
export function notebookFullText(pages = []) {
  return pages.map((page) => {
    const body = String(page.text || '').trim();
    return `### ${page.docTitle}\n${body}`;
  }).join('\n\n');
}

/* --------------------------------------------- the prose turn’s prompt */
//
// For a turn that could not see the Notebook at all (it could not be loaded):
// the honest rules, which forbid inventing anything local.
export const PROSE_SYSTEM_WITHOUT_NOTEBOOK = [
  'You are the reception assistant for The Riverside Practice, a UK GP surgery. You are answering a member of practice staff — reception, admin, nursing, clinical or management.',
  '',
  'YOU HAVE NO ACCESS TO THE PRACTICE’S OWN MATERIAL. Its Notebook, policies and guides are not in front of you. So:',
  '- Answer general questions from what you know, plainly and briefly.',
  '- Never invent anything specific to this practice: no telephone numbers, email addresses, staff names, opening times, room numbers, form names, local rules or local pathways. If the answer depends on one of those, say plainly that you cannot see the practice’s own material and name who to ask (the practice manager, the secretaries, the duty doctor).',
  '- Never give clinical judgement about a specific patient. That is a clinician’s decision; route it to the duty doctor.',
  '- If the message could be a medical emergency (chest pain, difficulty breathing, signs of a stroke, severe bleeding, collapse, anaphylaxis, sepsis, a seizure, suicidal thoughts): call 999 now, alert a duty clinician immediately, and stay with the patient.',
  '',
  'HOW TO WRITE',
  '- Plain British English, NHS style. Calm, sentence case, no emoji, no marketing words.',
  '- Short. A busy receptionist with a patient at the desk reads the first few lines and nothing else.',
  '- Markdown: "## " and "### " headings, "- " bullets, "1. " numbered lists for anything done in order, tables where the content is tabular, **bold** for the exact thing to click, type or say.',
  '- No preamble, no summary of what you are about to say, no closing pleasantries. Start with the answer.',
].join('\n');

// THE RULES FOR A TURN THAT READS THE WHOLE NOTEBOOK.
//
// The writer is shown every page and answers from them alone. Three things
// follow from that, and the rules say each one outright:
//
// CITED BY HEADING, LINKED BY CODE. Each page used is named by the heading it
// was shown, in double square brackets. The model never writes a link; code
// finds the page and writes it (lib/questions/references.mjs), and a heading
// that names no page is left as plain words. So a citation can be wrong only by
// pointing at a real page, never by inventing an address.
//
// "I DON'T KNOW" IS AN ANSWER; A GENERIC ONE IS NOT. Where no page holds what
// was asked, the writer says so in one line and names the closest page — the
// answer check (lib/questions/answer-check.mjs) stands behind it, withdrawing
// any answer that still does not answer.
//
// THE NOTEBOOK'S OWN WORDS for anything typed, clicked, dialled or sent: a
// paraphrased form name is one that finds nothing when it is typed in.
export const PROSE_SYSTEM_WITH_NOTEBOOK = [
  'You are the Q&A assistant for The Riverside Practice, a UK GP surgery. You are answering a member of practice staff — reception, admin, nursing, clinical or management. The practice’s Notebook above is everything this practice has written down about itself, every page in full. It outranks anything you know about how GP surgeries usually work.',
  '',
  'HOW TO ANSWER',
  '- Answer ONLY from the Notebook. Find every page that bears on the question — match on meaning, not exact words: staff write in shorthand, misspell, and use different names for the same thing ("bloods", "phlebotomy", "blood test"). Read the bodies, not only the headings: the answer is often a line inside a page whose heading says something else.',
  '- Use the Notebook’s EXACT wording for anything that gets typed, clicked, dialled or sent: form names, speciality and clinic type, email addresses, telephone numbers, template names, slot names.',
  '- Where two pages disagree, say so and give both rather than picking one.',
  '',
  'CITE EVERY PAGE YOU USE',
  '- After the sentence, list item or paragraph that uses a page, cite that page by its heading copied EXACTLY as it appears after "### ", in double square brackets: [[Notebook: Section / Page]].',
  '- Cite every page you used, and only pages you used. Never invent a heading, never shorten or reword one, and never write a link or a URL yourself — the citation becomes the link.',
  '- Do NOT end with a "Source:" or "Sources:" line. The list of sources is added for you.',
  '',
  'WHEN THE NOTEBOOK DOES NOT COVER IT',
  '- Covered only in general — a procedure for every incoming letter, say, when the question names one kind — IS covered: answer from the general pages, and say in a short lead-in that this is the general procedure. Do not open that answer with "I don’t know".',
  '- Not covered at all: say so in one line: "I don’t know — the Notebook does not cover this." Then name the closest page as a citation, [[its exact heading]], and who to ask (the practice manager, the secretaries, the duty doctor).',
  '- NEVER give a generic answer in its place: an answer about something else, or true of GP surgeries in general but not written in the Notebook, is worse than saying you do not know. NEVER fill a gap with a plausible local detail: no telephone numbers, email addresses, staff names, opening times, room numbers, form names, local rules or local pathways that are not written in it.',
  '',
  'SAFETY',
  '- Never give clinical judgement about a specific patient. That is a clinician’s decision; route it to the duty doctor.',
  '- If the message could be a medical emergency (chest pain, difficulty breathing, signs of a stroke, severe bleeding, collapse, anaphylaxis, sepsis, a seizure, suicidal thoughts): call 999 now, alert a duty clinician immediately, and stay with the patient.',
  '',
  'HOW TO WRITE',
  '- Plain British English, NHS style. Calm, sentence case, no emoji, no marketing words.',
  '- SHORT: about 150 words at most. A busy receptionist with a patient at the desk reads the first few lines and nothing else. Give what answers THIS question — the steps or facts they need now — and do not reproduce whole pages: the citations are links, and the reader opens the page for the rest.',
  '- Markdown: "- " bullets, "1. " numbered lists for anything done in order, **bold** for the exact thing to click, type or say. A short bold lead-in rather than a heading.',
  '- No preamble, no summary of what you are about to say, no closing pleasantries. Start with the answer.',
].join('\n');

/**
 * The system prompt for a Q&A turn: the whole Notebook FIRST, then the rules.
 *
 * THE NOTEBOOK LEADS SO IT CACHES. It is ~170k characters (~43k tokens) and
 * the same on every turn until somebody edits a page; the rules after it are
 * constant too. Nothing about the question is in here — the question, the
 * conversation and any attachment go in the messages after it — so the whole
 * system prompt is one byte-stable prefix, and a provider that caches prefixes
 * (Anthropic with an explicit marker, Gemini and others on their own) charges
 * full price for it once. The route marks it cacheable (proseSystemMessage).
 *
 * No Notebook at all (it could not be loaded) gets the no-access rules instead.
 */
export function proseSystemPrompt(notebookText) {
  if (!notebookText) return PROSE_SYSTEM_WITHOUT_NOTEBOOK;
  // The Notebook is the practice’s own writing rather than a reader’s, but the
  // fence still has to survive a page that contains the fence.
  const fenced = String(notebookText).replace(/"{3,}/g, '”””');
  return [
    'THE PRACTICE NOTEBOOK. Every page, in full, each under its "### " heading, exactly as the practice saved it.',
    '"""',
    fenced,
    '"""',
    '',
    PROSE_SYSTEM_WITH_NOTEBOOK,
  ].join('\n');
}

// How the system prompt is marked cacheable. OpenRouter passes `cache_control`
// through to the providers that need an explicit breakpoint (Anthropic) and
// the rest cache a repeated prefix on their own; the AI SDK provider reads it
// off the system message's providerOptions (@openrouter/ai-sdk-provider 3.x,
// convertToOpenRouterChatMessages). Measured through OpenRouter on Claude Haiku
// (Vertex) and Gemini flash-lite: the second call reads the whole prefix from
// the cache.
export const PROSE_CACHE_CONTROL = { openrouter: { cacheControl: { type: 'ephemeral' } } };

/**
 * The system message for a Q&A turn, as the AI SDK's `system` takes it: the
 * prompt, and the cache marker when there is a Notebook to cache.
 */
export function proseSystemMessage(notebookText) {
  const content = proseSystemPrompt(notebookText);
  return notebookText
    ? { role: 'system', content, providerOptions: PROSE_CACHE_CONTROL }
    : { role: 'system', content };
}

/* ------------------------------------------------------------------ *
 * Commands: the template is given, only the values are missing.
 *
 * A slash command (lib/commands.mjs) has already said what the message
 * is, so there is nothing to choose. The model is asked for that one
 * template's variables and nothing else — a smaller schema, a shorter
 * prompt, and no Notebook to read — and the card is rendered
 * from what comes back.
 *
 * No command falls through to prose. That is the point of typing one:
 * /accurx always answers with both halves of the card it promises, and
 * /consultation with a record entry (or with how one is written, when
 * there was nothing in the message to build one from), however little
 * the model managed to fill in.
 * ------------------------------------------------------------------ */

export const COMMAND_SCHEMAS = {
  // /consultation. The contact as the reader described it, in parts, so the
  // entry is assembled by consultationEntry and the shape cannot drift. Every
  // part is what the note SAID: an empty part is the honest answer where it
  // said nothing, and `unclear` is where the model says so instead of guessing.
  consultationNote: z.object({
    contact: z.string().default('')
      .describe('How the contact happened and who started it, in shorthand: "tel c/w pt", "pt attended desk", "pt msg via AccurX", "tel c/w daughter (with pt consent)", "tel c/w pt (call back)". Where the patient was NOT reached, say so here too: "tel pt, no answer", "tel pt, no answer, VM left", "tel pt x2, no answer". Empty only if the note does not say.'),
    summary: z.string().default('')
      .describe('What it was about, in clinical shorthand: EVERY symptom the note names — all of them, in the order written — how long, which way it is going, what has been tried, and what the patient asked for. E.g. "fever, cough w/ mucus, sore throat 1/52 unchanged, req abx". Shorten it by abbreviating, NEVER by leaving something out: a note naming four symptoms produces four here. No name, no judgement, nothing the note did not say.'),
    actions: z.array(z.string()).default([])
      .describe('What was DONE, and what is still to happen where the note says so, one item each, as terse facts with who and when where the note gives them: "booked tel appt Dr Okafor 03-Sep pm", "to book appt Fri", "tasked secretaries re referral letter", "adv not prescribed without assessment". Only what the note says. Empty if nothing was done.'),
    safetyNet: z.string().default('')
      .describe('Any safety-netting the note says was given, as strong as it was said: "adv 111 if worse o/n", "adv 999 if chest pain returns", "s/n given". Empty if none was given — never add one.'),
    unclear: z.array(z.string()).default([])
      .describe('Things the entry needs that the note left open, each in a few words: "date of the appointment booked", "which clinician was tasked". Empty when nothing is missing.'),
  }),
  // /accurx. ONE call for the whole card: where it goes, and the wording that
  // goes into whatever gets booked. It reads the practice's destinations —
  // lib/triage/destinations.mjs, handed to it as data — so the routing half is
  // not a separate fan-out of model calls any more. See ./accurx-route.mjs.
  //
  // The fields stay separate with separate descriptions rather than becoming one
  // merged instruction: the model is doing several distinct extractions, not one
  // blended one, and a condition that started summarising the booking notes
  // would be a routing card titled with somebody's interpreter request.
  accurxTriage: ACCURX_READ_SCHEMA,
  // /medication. A repeat-medication screen, transcribed as DATA: the screen's
  // own groups, each holding its medications in the three parts the card and
  // the AccurX form tell apart. The picture itself goes in beside the prompt
  // (app/api/agent/route.js, `withImages`) and is read by the images role.
  repeatMedication: z.object({ groups: MEDICATION_GROUPS_SCHEMA }),
};

// Three commands reach a model: /accurx, /consultation and /medication.
// (/practice searches the documents, and /form and /template look a list up,
// so none of them gets here.) /medication and /accurx return first; what is
// left is the consultation note, and anything else arriving would be a command
// with no prompt of its own — which COMMAND_SCHEMAS has already refused to give
// a schema for.
export function commandPrompt({ template, question, attached = '', images = 0 }) {
  const fence = (t) => String(t || '').replace(/"{3,}/g, '""');

  // /medication is a transcription, and the thing being transcribed is the
  // picture beside this prompt — or, when none was pasted, a typed list. The
  // message is very often a placeholder ("Please look at the attached image"),
  // and the prompt says so rather than letting the model read meaning into it.
  if (template === 'repeatMedication') {
    return [
      'You are the assistant for The Riverside Practice, a UK GP surgery.',
      '',
      'You are NOT writing the answer — the answer is a fixed card, rendered in code from the values you return.',
      '',
      images
        ? `Attached ${images === 1 ? 'is a screenshot' : 'are ' + images + ' screenshots'} of a patient’s repeat medication screen (EMIS Web): a table of medications under headings such as "Repeat" and "Variable use repeat", one line per drug, with the drug and strength first and the directions and quantity after it.`
        : 'The message below lists a patient’s medications — typed out, or pasted from the repeat medication screen.',
      'Read every medication off it into "groups", so a repeat prescription request can be typed into AccurX. The AccurX form asks for each medication on its own line, including the strength:',
      ...MEDICATION_READ_RULES.map((r) => '- ' + r),
      'Leave a part empty rather than guessing it. An empty part is shown as missing; an invented one goes on a prescription request.',
      '',
      'THE MESSAGE (may be empty, or a placeholder saying to look at the image — the picture is what matters):',
      '"""',
      fence(question),
      '"""',
    ].join('\n');
  }

  // /accurx is asked for the whole card on one call — where it goes as well as
  // the wording — so its prompt is built where the destinations are described,
  // rather than here. The wording rules are still this file's to hand over.
  if (template === 'accurxTriage') {
    // NO NOTEBOOK. The reading is done against the routing guide and nothing
    // else — see accurxReadPrompt, which says why at length.
    return accurxReadPrompt({
      question,
      attached,
      reasonRules: REASON_RULES,
      reasonExamples: REASON_LINE_EXAMPLES,
      bookingRules: BOOKING_RULES,
      // The third question the card asks: has somebody already dealt with this,
      // and so who should it be booked with. Handed over here with the other two
      // for the same reason — the rules and the panel that discloses them are
      // one list in ./writing.mjs, so neither can drift away from the other.
      continuityRules: CONTINUITY_RULES,
      // No decomposition rules: `requests` is part of the read now, and asking
      // for the same thing twice in two shapes is what broke it.
      extra: '',
    });
  }

  return [
    'You are the assistant for The Riverside Practice, a UK GP surgery.',
    '',
    'You are NOT writing the answer — the answer is a fixed card, rendered in code from the values you return.',
    '',
    'A member of reception staff has written up, in their own words, a contact they have just had with a patient — on the telephone, at the front desk, or by message. Fill in the parts so a one-line entry for the patient’s record can be built. The entry is read by whoever the patient reaches next, so they know what has already happened:',
    ...CONSULTATION_NOTE_RULES.map((r) => '- ' + r),
    'NOTHING THE NOTE SAYS IS LEFT OUT. Every symptom, how long it has gone on, which way it is going, what the patient asked for, what was done and what is still to happen all appear somewhere in the parts. The entry is short because it is written in shorthand, not because it is a summary — a detail dropped here is a detail the next person never learns.',
    'Leave a part empty rather than guessing it, and name what was left open in "unclear". An empty part is shown as missing; an invented one goes on a medical record.',
    '',
    attached ? 'ATTACHED DOCUMENT:\n"""\n' + fence(attached) + '\n"""\n' : '',
    'THE MESSAGE:',
    '"""',
    fence(question),
    '"""',
  ].filter((line) => line !== '').join('\n');
}

/**
 * Render a command's answer from the values the model filled in.
 *
 * `values` is whatever COMMAND_SCHEMAS produced. Returns null only for a
 * template no command claims, so a caller cannot force an arbitrary card.
 */
export function renderCommand(template, values = {}, question = '', { complaint = '', gist = '', images = 0, failed = '' } = {}) {
  if (template === 'accurxTriage') {
    // Both halves at once. The routing half takes the routed span, so a knee
    // card is decided by what was written about the knee; the wording half takes
    // what the model wrote from the whole message — the clinician is about to
    // see this patient about everything they wrote, and cutting the line down to
    // one complaint would lose what the consultation is for.
    const said = String(values.condition || '').trim();
    return accurxAnswer({
      condition: complaint ? (String(gist || '').trim() || said || complaint) : (said || question),
      text: complaint || question,
      complaint,
      reason: String(values.reason || '').trim(),
      details: Array.isArray(values.details) ? values.details.filter(Boolean).slice(0, 5) : [],
      booking: Array.isArray(values.booking) ? values.booking.filter(Boolean).slice(0, 5) : [],
      noAnswer: String(values.noAnswer || '').trim(),
      // Where the same call said it goes. It comes back on these values rather
      // than from a fan-out of its own, so it is read off them here; see
      // lib/templates/accurx-route.mjs.
      route: readingVerdict(values),
      // The whole message, for checking the quote that moved it. `text` above
      // is only the routed complaint when the message carried several.
      message: question,
    });
  }
  if (template === 'consultationNote') {
    const strings = (list) => (Array.isArray(list) ? list.map((s) => String(s || '').trim()).filter(Boolean) : []);
    const parts = {
      contact: String(values.contact || '').trim(),
      summary: String(values.summary || '').trim(),
      actions: strings(values.actions).slice(0, 8),
      safetyNet: String(values.safetyNet || '').trim(),
      unclear: strings(values.unclear).slice(0, 5),
    };
    // Nothing to build an entry from — a question about how to write one, or
    // a call that did not come back. The rules card is the honest answer, and
    // is still the practice's own material rather than prose.
    const hasParts = parts.contact || parts.summary || parts.actions.length || parts.safetyNet;
    if (!hasParts) return consultationNoteRulesAnswer({ failed });
    return consultationNoteAnswer(parts);
  }
  if (template === 'repeatMedication') {
    const groups = medicationGroups(values.groups);
    // Nothing read — no picture came, or it could not be read. How the mode
    // is used, never an invented list; and when a picture WAS sent, the card
    // says so rather than telling the reader to paste one.
    if (!groups.length) return repeatMedicationRulesAnswer({ images, failed });
    return repeatMedicationAnswer({ groups });
  }
  return null;
}

/**
 * The card, with the typed page's screen drawn above the page.
 *
 * The screen is built in code from the page's saved, validated fields — no
 * model reads the page for it. Returns the card UNCHANGED when the screen
 * cannot be drawn, so the reader still gets the page.
 */
export function withKindCard(card, typed) {
  if (!card || !typed || !typed.page) return card;
  const block = renderKind(typed.page.noteKind, typed.page.fields);
  if (!block) return card;
  return { ...card, blocks: [block, ...(card.blocks || [])] };
}
