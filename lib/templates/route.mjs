// Choosing a template, and filling it.
//
// ONE CALL, ALWAYS. The model reads the message, picks the template that fits
// and fills that template's variables. It never writes the answer — the answer
// is the template, rendered in code from the values it returned.
//
// An earlier version matched templates with regular expressions and only
// reached the model when the keywords failed. That was two pipelines wearing
// one coat: "how do I refer for an ECG" hit the pattern and "ecg referral, how
// do I do this?" did not, so the same question got a different quality of
// answer depending on how it was typed. Understanding the question is the one
// job a model is actually good at; it does that, and the deterministic part
// stays where determinism is worth having — in the format of what comes out.
//
// What that buys, which a prompt cannot:
//   - the referral service is an enum of what the practice records, so a
//     pathway cannot be invented, only chosen or declined;
//   - the filing title is assembled by codingTitle from the parts, so its
//     format cannot drift however the model words things;
//   - every card is laid out by the same blocks, so answers stay consistent.
import { z } from 'zod';
import { REFERRAL_SERVICES, referralAnswer, referralTemplates } from './referrals.mjs';
import { pharmacyFirstAnswer, pharmacyReferralAnswer } from './pharmacy.mjs';
import { minorEyeServiceAnswer, triagePatientAnswer } from './triage.mjs';
import { accurxAnswer } from './accurx.mjs';
import { ACCURX_READ_SCHEMA, accurxReadPrompt, readingVerdict } from './accurx-route.mjs';
import { fcpAnswer } from './fcp.mjs';
import { notebookPageAnswer } from './notebook.mjs';
import { REGISTRATION_SCENARIO_IDS, registrationAnswer } from './registration.mjs';
import {
  MAX_GROUPS, MAX_MEDICATIONS, MEDICATION_READ_RULES, repeatMedicationAnswer, repeatMedicationRulesAnswer,
} from './medication.mjs';
import {
  BOOKING_RULES, CONSULTATION_NOTE_RULES, CONTINUITY_RULES, DOC_CODING_RULES, REASON_RULES,
  appointmentReasonAnswer, codedDocumentAnswer, consultationNoteAnswer, consultationNoteRulesAnswer,
  documentCodingAnswer, writtenReasonAnswer,
} from './writing.mjs';

/** Every service name the model may choose between. */
export const REFERRAL_SERVICE_NAMES = REFERRAL_SERVICES.map((s) => s.name);

// A repeat-medication screen as DATA: the screen's own groups, each holding
// its medications in the three parts the card and the AccurX form tell apart.
// One schema for both ways of arriving — /medication, or a screenshot pasted
// into plain Q&A and recognised by the picker — so the card is the same card.
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
 * Shared by the command and the picker so the two paths cannot clean differently.
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

export const SELECTION_SCHEMA = z.object({
  template: z.enum([
    'referral',
    'referralProcess',
    'documentCoding',
    'documentCodingRules',
    'appointmentReason',
    'appointmentReasonRules',
    'pharmacyFirst',
    'pharmacyReferral',
    'minorEyeService',
    'fcp',
    'triage',
    'registration',
    'repeatMedication',
    'notebook',
    'ask',
    'none',
  ]).describe('Which template answers this message. Use "ask" when the message could mean two different things and the answers differ. Use "notebook" for anything the Notebook covers that has no template. "none" only when the Notebook does not cover it either.'),

  registrationScenario: z.enum(['none', ...REGISTRATION_SCENARIO_IDS]).default('none')
    .describe('For "registration": which situation the message describes, or "none" when it does not say and the whole card should be shown.'),

  // Asking back is a real answer, not a failure to give one — but only when the
  // readings genuinely lead somewhere different. The options are what the reader
  // taps, so they are written as the reader would say them.
  askQuestion: z.string().default('')
    .describe('For "ask": the one question that would settle what is meant. Short, plain, no preamble.'),
  askOptions: z.array(z.string()).default([])
    .describe('For "ask": two to four short answers to that question, in the reader’s own words. Each must lead to a genuinely different answer.'),

  pages: z.array(z.string()).default([])
    .describe('For "notebook": the exact title of the page that answers the message, copied from the list. Two titles only when the answer genuinely needs both. Never write the answer out — the page is shown as it stands.'),

  referralService: z.enum(['none', ...REFERRAL_SERVICE_NAMES]).default('none')
    .describe('For "referral": which recorded referral this is about, or "none" when the practice records none of them for it.'),

  // The enum above is a fixed list, and the practice's own Notebook has grown
  // past it — "Dietitian" is on their emailed-referrals page and was never in
  // the array, so "how do I do a dietitian referral" came back as "not recorded
  // in the practice's notes" about a referral the practice had written down.
  //
  // Naming the thing is extraction and the model is reliable at it. Deciding
  // what that name means is code's: it reads the Notebook page itself. So this
  // is one plain string, ALWAYS filled in, and no judgement is asked for.
  referralName: z.string().default('')
    .describe('For "referral": what is being referred to, in as few words as possible and WITHOUT the word "referral" — "dietitian", "ECG", "hernia", "social prescriber". Fill this in every time, including when referralService is "none": the practice’s Notebook is checked for it by name.'),

  document: z.object({
    date: z.string().default('').describe('Clinical event date as dd-Mmm-yyyy, e.g. 07-Aug-2026. Empty if it cannot be found.'),
    site: z.string().default('').describe('Site code or organisation, e.g. RLH, HUH, Legal & General.'),
    department: z.string().default('').describe('Department or team in title case, e.g. Ophthalmology.'),
    actions: z.array(z.string()).default([]).describe('Terse actions for the practice only. An empty array is the normal answer.'),
  }).default({ date: '', site: '', department: '', actions: [] })
    .describe('For "documentCoding" only.'),

  condition: z.string().default('')
    .describe('For "pharmacyFirst", "fcp" and "triage": the problem, given its nearest common clinical name rather than the exact wording used, so "slightly red eyes with some discharge" becomes "conjunctivitis" and "bad back" becomes "back pain". This TITLES the card only — the full message is matched separately for red flags, so do not try to summarise the important parts into it. Keep it short. Empty if no problem was described.'),
  reason: z.string().default('').describe('For "appointmentReason": the single reason line.'),
  details: z.array(z.string()).default([]).describe('For "appointmentReason": at most 5 further shorthand points. Usually empty.'),

  medication: z.object({ groups: MEDICATION_GROUPS_SCHEMA }).default({ groups: [] })
    .describe('For "repeatMedication" only: every medication read off the screen, under the screen’s own headings.'),
});

/* ------------------------------------------------------------------ *
 * Decomposition: the one extra field, on the same call.
 *
 * A message asking for five things came back as one card and the other
 * four were never mentioned again. That was not a quality problem — the
 * schema above returns exactly ONE template, so no model however good
 * produces five answers from it.
 *
 * So the model is asked for one more thing, and it is deliberately the
 * dullest thing on the schema: where each separate ask STARTS AND ENDS.
 * Splitting text is extraction, which even a cheap model does reliably.
 * It is not asked which matters most, which is urgent, or what to do
 * about any of them — those are decided by tables in lib/safety, so
 * that they are decided the same way every time.
 *
 * VERBATIM MATTERS AND IS NOT A STYLE PREFERENCE. The span is what
 * every claim on the card is checked against: a sentence may only be
 * written about a complaint if the words justifying it lie inside that
 * complaint's own text. A paraphrased span cannot be found in the
 * message, so it grounds nothing and the card falls silent instead —
 * which is the safe direction, but it also means a paraphrasing model
 * quietly loses the card's detail. Hence the wording below.
 * ------------------------------------------------------------------ */
export const REQUESTS_FIELD = {
  requests: z.array(z.object({
    text: z.string().describe('The exact words of this one request, COPIED FROM THE MESSAGE character for character. Do not tidy it, shorten it, correct the spelling or join it to anything else. If it spans three sentences, copy all three.'),
    gist: z.string().default('').describe('Two or three words naming this request, e.g. "knee pain", "repeat ramipril", "fit note". A label, not a summary.'),
  })).default([])
    .describe('Every distinct thing this message asks for, in the order they were written. One entry per ask. Split it wherever the subject changes — a different body part, a different person, a form, a prescription, a question — even when they share a sentence. Do NOT rank them, do NOT judge which matters, and do NOT leave one out because it seems minor or seems already covered. Leave this empty ONLY if the message genuinely asks for one thing.'),
};

/**
 * The selection schema with decomposition on it.
 *
 * A separate schema rather than an optional field, so a short question pays
 * neither the tokens nor the latency: "how do I refer for an ECG" is asked with
 * exactly the schema and exactly the prompt it was asked with before any of
 * this existed. See looksMultiIntent in lib/safety/requests.mjs for the gate.
 */
export const MULTI_SELECTION_SCHEMA = SELECTION_SCHEMA.extend(REQUESTS_FIELD);

// The instruction that goes with the field above. Appended to the prompt only
// when the gate opened, for the same reason.
export const DECOMPOSITION_RULES = [
  'THIS MESSAGE LOOKS LIKE IT ASKS FOR MORE THAN ONE THING.',
  '',
  'So fill in "requests" as well: one entry for each separate ask, in the order they appear. This is not a summary and it is not a judgement — it is the message cut into pieces.',
  '- Copy the words EXACTLY as they were written. They are quoted back to the reader and checked against the message; a tidied-up version fails that check and the detail is lost.',
  '- Split on a change of subject: a different problem, a different body part, a different person, a form, a prescription, a question about somebody else.',
  '- Include the ones that look like admin — a fit note, a repeat prescription, a letter. They are requests.',
  '- Include the ones you are NOT answering. That is the point of the list.',
  '- Do not rank them and do not mark any of them urgent. That is decided separately, in code.',
  '',
  'Then choose the template and fill its values as normal, for whichever ONE of those requests the card should be about. The rest are handled elsewhere.',
].join('\n');

/**
 * The Notebook as a list the model chooses from, rather than as text it reads.
 *
 * One line per page: the title, and the first real line of the page so a title
 * that undersells itself can still be recognised. About 3k tokens for 96 pages
 * against 18k for the full text — and the model is picking from a list, which
 * it does far more reliably than finding the right paragraph in 70,000
 * characters.
 */
export function notebookCatalogue(pages = []) {
  return pages.map((page) => {
    const first = String(page.text || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line && !/^[#>|*_-]/.test(line)) || '';
    return `- ${page.docTitle}${first ? ' — ' + first.replace(/[*_`]/g, '').slice(0, 110) : ''}`;
  }).join('\n');
}

export function selectionPrompt({ question, attached = '', notebook = '', decompose = false, images = 0 }) {
  const fence = (t) => String(t || '').replace(/"{3,}/g, '""');
  return [
    decompose ? DECOMPOSITION_RULES + '\n' : '',
    'You are the assistant for The Riverside Practice, a UK GP surgery. Read the message, choose the template that answers it, and fill in that template\'s values.',
    '',
    'For every template except "notebook" you are NOT writing the answer — the answer is the template, rendered from the values you return. Only "notebook" asks you to write anything.',
    '',
    notebook
      ? [
        'THE PRACTICE NOTEBOOK — every page it holds, one line each. This is the ONLY thing you know about this practice. Nothing else you have ever read applies here: not how other surgeries work, not what is usual in the NHS, not what sounds sensible.',
        '',
        notebook,
        '',
        'RULES FOR USING IT',
        '- If one of these pages answers the message and no other template fits, choose "notebook" and put that page\'s title in "pages". The page is then shown to the reader exactly as it is written.',
        '- YOU ARE NOT WRITING THE ANSWER. Do not restate, summarise or improve the page. Naming it is the whole job — the page is already correct, already formatted, and rewriting it can only make it different, not better.',
        '- Name two pages only when the answer genuinely needs both. Prefer one.',
        '- If no page covers it, choose "none". Do not answer from general knowledge: an invented practice fact is worse than no answer, because it is indistinguishable from a real one.',
        '- Copy titles exactly as they appear in the list. Never invent one.',
        '',
      ].join('\n')
      : 'The Notebook could not be loaded for this message, so the "notebook" template is unavailable. Use a template that fits, or "none".\n',
    'THE TEMPLATES',
    '',
    '1. "referral" — the message is about making or sending a referral, however it is worded ("how do I refer for an ECG", "ecg referral, how to do this?", "2ww skin"). This ALSO covers asking which FORM to use, or where a form is: "which form for suspected skin cancer", "what\'s the dexa form called", "is there a teledermatology form". Set referralService to the recorded referral it is about. Set it to "none" if the practice records none of them for this — a wrong match sends a referral to the wrong service, so "none" is the safe answer when unsure. Never invent a service.',
    '   ALWAYS also fill in "referralName" with what is being referred to, in the fewest words and without the word "referral" itself. Do this even when referralService is "none", and ESPECIALLY then: the practice\'s own page of referrals sent by email is longer than the choices above and is checked by that name. Leaving it empty is how a referral that is written down somewhere gets reported as one nobody has a process for.',
    '   NEVER write a form name out yourself, and never name a form off the NEL Referral Tree: this path does not read it. Where the practice has recorded nothing, the card says so and tells the reader to choose Referral form, which searches the tree. A form name you compose is one that finds nothing when it is typed in.',
    '',
    '1a. "referralProcess" — the message asks how referrals work IN GENERAL, with no service named: "how do I do an e-RS referral", "how do referrals work", "what are the steps for a referral". Use this rather than "referral" whenever no particular service is being referred to, and rather than writing the steps out yourself.',
    '',
    '1b. THE TWO NEL LISTS ARE NOT ON THIS PATH. Primary Care IT\'s "NEL Referral Tree introduction & document list (EMIS Web)" and their "NEL Local Contract Specifications" are read ONLY when the reader arms the mode that names one — Referral form, or Contract template. So: never name a referral form or an EMIS template, and never state a contract or a build status, however confident you are. "Which template for the ADHD shared pathway", "what is OneTemplate NonPrescriber for", "is the housebound winter vacs template live" are questions for Contract template. If the practice\'s own Notebook answers what was actually asked — how the practice runs a service, who does it, when it happens — choose "notebook", which is a different and better answer. Otherwise choose "none" and say the list is what holds it and which mode searches that list.',
    '',
    '2. "documentCoding" — a document ABOUT a patient, written by another service, has been pasted in or attached to be filed: a discharge summary, clinic letter, A&E attendance, report or insurer letter. Fill in "document" so a filing title can be built:',
    ...DOC_CODING_RULES.map((r) => '   - ' + r),
    '',
    '3. "documentCodingRules" — the message ASKS how documents are titled or coded, without pasting one in.',
    '',
    '4. "appointmentReason" — the words a PATIENT wrote have been pasted in (an online consultation or triage form, first person: "I have", "my", "I tried") AND the reason line for the appointment is what is wanted. Write "reason":',
    ...REASON_RULES.map((r) => '   - ' + r),
    '',
    '5. "appointmentReasonRules" — the message ASKS how to write a reason for appointment, without pasting one in.',
    '',
    '6. "pharmacyFirst" — the message asks specifically about Pharmacy First, CPSAS, community pharmacy or self-care. Put the condition named into "condition".',
    '',
    '6a. "pharmacyReferral" — the message asks HOW to send a Pharmacy First referral ("how do I refer to the pharmacy", "pharmacy first referral steps", "where is Local Services").',
    '',
    '6b. "minorEyeService" — the message asks about the minor eye service, MECS, Rose Opticians, or for the wording to send a patient about an eye appointment.',
    '',
    '6c. "fcp" — a musculoskeletal problem in an adult, or a question about the First Contact Physiotherapist: back, neck, joint, muscle, tendon or limb pain, sciatica, a sprain or a strain, or anybody asking for physio, an FCP appointment or an MSK assessment. Put the problem into "condition". Choose this over "pharmacyFirst" for any back or joint problem, however the pharmacy lists would match it.',
    '',
    '7. "triage" — a member of STAFF describes the problem a patient has, and needs to know WHERE IT GOES: "pt has mild discomfort in their eyes, slightly red with some discharge", "patient calling about a sore throat", "someone has come in with a rash". Third person, usually short, often shorthand such as "pt". Put the description into "condition".',
    '   THIS IS THE DEFAULT for any described symptom. Choose "appointmentReason" over it ONLY when first-person text a patient wrote was pasted in and a reason line is what is wanted. A staff member describing a patient is asking where to send them, not asking for a summary of what they just wrote.',
    '   ALWAYS fill in "condition" when you choose this. An empty condition is not an answer.',
    '',
    '8. "registration" — registering a NEW patient on EMIS: the registration email or form, the patient trace, an NHS number that is missing or does not match, a patient who has never had one. Set "registrationScenario" when the message says which situation it is (the patient shows as inactive, shows as active, several patients come back, or has no NHS number at all); leave it "none" and the whole card is shown.',
    '',
    '9. "notebook" — a Notebook page answers it and none of the shapes above fit. Most questions land here: how something is done, what a service covers, who does what on which day. Put the page title in "pages" and write nothing else.',
    '',
    '10. "ask" — the message could mean two different things AND those things have different answers, so answering either one is a coin toss. Put the single question that settles it in "askQuestion" and two to four short answers in "askOptions". Use this SPARINGLY: only when guessing wrong sends somebody to the wrong place or has them do the wrong thing. If one reading is clearly the likely one, answer that instead — a question back costs the reader a whole extra turn.',
    '',
    '11. "none" — the Notebook does not cover it either. Choose it freely rather than stretching a template or writing from general knowledge.',
    '',
    '12. "repeatMedication" — a picture of a patient’s REPEAT MEDICATION screen (EMIS Web) is attached: a table of medications under headings such as "Repeat" and "Variable use repeat", one line per drug with the strength, the directions and the quantity. Choose this whenever the attached picture is that screen, whatever the message says — it is being pasted so the list can be typed into an AccurX repeat prescription request. Fill in "medication.groups", reading every line off the screen:',
    ...MEDICATION_READ_RULES.map((r) => '   - ' + r),
    '',
    images
      ? `ATTACHED: ${images === 1 ? 'one picture' : images + ' pictures'}, included with this message. Look at ${images === 1 ? 'it' : 'them'} before choosing: a repeat medication screen is "repeatMedication", a letter or discharge summary about a patient is "documentCoding", and the message text may be no more than a placeholder saying to look at the picture.\n`
      : '',
    attached ? 'ATTACHED DOCUMENT:\n"""\n' + fence(attached) + '\n"""\n' : '',
    'THE MESSAGE:',
    '"""',
    fence(question),
    '"""',
  ].filter((line) => line !== '').join('\n');
}

/* ------------------------------------------------------------------ *
 * Commands: the template is given, only the values are missing.
 *
 * A slash command (lib/commands.mjs) has already said what the message
 * is, so there is nothing to choose. The model is asked for that one
 * template's variables and nothing else — a smaller schema, a shorter
 * prompt, and no Notebook catalogue to read — and the card is rendered
 * from what comes back.
 *
 * No command falls through to prose. That is the point of typing one:
 * /accurx always answers with both halves of the card it promises, and
 * /coding with a filing card (or with how documents are titled, when
 * there was nothing in the message to build a title from), however
 * little the model managed to fill in.
 * ------------------------------------------------------------------ */

export const COMMAND_SCHEMAS = {
  documentCoding: z.object({
    document: z.object({
      date: z.string().default('').describe('Clinical event date as dd-Mmm-yyyy, e.g. 07-Aug-2026. Empty if it cannot be found.'),
      site: z.string().default('').describe('Site code or organisation, e.g. RLH, HUH, Legal & General.'),
      department: z.string().default('').describe('Department or team in title case, e.g. Ophthalmology.'),
      actions: z.array(z.string()).default([]).describe('Terse actions for the practice only. An empty array is the normal answer.'),
    }).default({ date: '', site: '', department: '', actions: [] }),
  }),
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

// The same decomposition, for a command that has already said what the message
// is. Only /accurx: it is pointed at the one channel patients write into at
// length, so a message carrying five asks is the ordinary case here rather than
// the exception, and the card can only be about one of them. A pasted letter to
// file is one document however many paragraphs it has, so /coding is not here
// and splitting it would produce a panel of headings.
//
// The reason line is still written from the WHOLE message rather than from the
// routed request — the clinician is about to see this patient about everything
// they wrote, and cutting the line down to one complaint would lose what the
// consultation is for.
// NOTHING EXTENDS THE /accurx SCHEMA ANY MORE, and the reason is a collision
// that cost a receptionist six of seven requests.
//
// REQUESTS_FIELD defines `requests` as {text, gist} — the deterministic split,
// for scanners to band. ACCURX_READ_SCHEMA now defines `requests` as what the
// reading found: what, who for, where it goes, what reception does. Extending
// one with the other overwrote the second with the first, so a message asking
// for seven things came back in the OLD shape and rendered nothing at all: the
// field worked on every message except the ones it exists for.
//
// The reading returns them itself, so there is nothing left to extend with.
export const MULTI_COMMAND_SCHEMAS = {};

// The templates whose card is a triage of the message, and which therefore want
// the message split up when it carries several requests: the card answers one
// of them and the panel beside it has to show the other four.
// No command splits a message deterministically any more. /accurx was the only
// one, and the reading now returns the requests itself — with where each goes,
// which the split never knew.
export const DECOMPOSING_COMMANDS = [];

// Three commands reach a model: /accurx, /consultation and /coding. (/practice
// searches the documents and never gets here.) /accurx returns first and
// /consultation second; what is left is the document one, and anything else
// arriving would be a command with no prompt of its own — which COMMAND_SCHEMAS
// has already refused to give a schema for.
export function commandPrompt({ template, question, attached = '', decompose = false, notebook = '', images = 0 }) {
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
    // else — see accurxReadPrompt, which says why at length. `notebook` remains
    // a parameter of this function because the OTHER prompt it builds,
    // selectionPrompt, genuinely needs the catalogue: picking a page IS its job.
    return accurxReadPrompt({
      question,
      attached,
      reasonRules: REASON_RULES,
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

  const rules = template === 'consultationNote'
    ? [
      'A member of reception staff has written up, in their own words, a contact they have just had with a patient — on the telephone, at the front desk, or by message. Fill in the parts so a one-line entry for the patient’s record can be built. The entry is read by whoever the patient reaches next, so they know what has already happened:',
      ...CONSULTATION_NOTE_RULES.map((r) => '- ' + r),
      'NOTHING THE NOTE SAYS IS LEFT OUT. Every symptom, how long it has gone on, which way it is going, what the patient asked for, what was done and what is still to happen all appear somewhere in the parts. The entry is short because it is written in shorthand, not because it is a summary — a detail dropped here is a detail the next person never learns.',
      'Leave a part empty rather than guessing it, and name what was left open in "unclear". An empty part is shown as missing; an invented one goes on a medical record.',
    ]
    : [
      'A document about a patient has been handed to you to file. Fill in "document" so a filing title can be built:',
      ...DOC_CODING_RULES.map((r) => '- ' + r),
      'Leave a value empty rather than guessing it. An empty value is shown as missing; a wrong one is filed wrong.',
    ];

  return [
    'You are the assistant for The Riverside Practice, a UK GP surgery.',
    '',
    'You are NOT writing the answer — the answer is a fixed card, rendered in code from the values you return.',
    '',
    ...rules,
    ...(decompose && DECOMPOSING_COMMANDS.includes(template) ? ['', DECOMPOSITION_RULES] : []),
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
export function renderCommand(template, values = {}, question = '', { complaint = '', gist = '', route = null, images = 0, failed = '' } = {}) {
  if (template === 'accurxTriage') {
    // Both halves at once. The routing half takes the routed span, so a knee
    // card is decided by what was written about the knee; the wording half takes
    // what the model wrote from the whole message, for the reason set out in
    // MULTI_COMMAND_SCHEMAS above.
    const said = String(values.condition || '').trim();
    return accurxAnswer({
      condition: complaint ? (String(gist || '').trim() || said || complaint) : (said || question),
      text: complaint || question,
      complaint,
      reason: String(values.reason || '').trim(),
      details: Array.isArray(values.details) ? values.details.filter(Boolean).slice(0, 5) : [],
      booking: Array.isArray(values.booking) ? values.booking.filter(Boolean).slice(0, 5) : [],
      // Where the same call said it goes. It comes back on these values now
      // rather than from a fan-out of its own, so it is read off them here —
      // `route` is still accepted for a caller that has one already. Either way
      // it is checked against the patterns' answer inside accurxAnswer and can
      // only ever raise it; see lib/templates/accurx-route.mjs.
      route: route || readingVerdict(values),
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
  if (template === 'documentCoding') {
    const d = values.document || {};
    const hasParts = d.date || d.site || d.department || (d.actions || []).length;
    // Nothing to build a title from — a message about filing rather than a
    // letter, or a paste that did not arrive. The rules card is the honest
    // answer, and is still the practice's own material rather than prose.
    if (!hasParts) return documentCodingAnswer({ failed });
    return codedDocumentAnswer({
      date: d.date || 'dd-Mmm-yyyy',
      site: d.site || '',
      department: d.department || '',
      actions: Array.isArray(d.actions) ? d.actions.filter(Boolean).slice(0, 6) : [],
    });
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
 * The question back, when the model chose to ask one.
 *
 * Returns null unless there is a real question with at least two answers to
 * choose between — a question with one option is not a question, and an empty
 * one would leave the reader looking at a card with nothing on it. The caller
 * treats null as "answer it anyway".
 */
export function selectionClarify(selection) {
  const sel = selection || {};
  if (sel.template !== 'ask') return null;
  const question = String(sel.askQuestion || '').trim();
  const options = (Array.isArray(sel.askOptions) ? sel.askOptions : [])
    .map((option) => String(option || '').trim())
    .filter(Boolean)
    .slice(0, 4);
  if (!question || options.length < 2) return null;
  return { question, options };
}

// The templates that answer a described problem, and therefore the ones a
// complaint span means anything to. Exported because the caller has to know
// whether the card it is about to show runs the deterministic triage net over
// its own text — if it does, a finding inside that text is already the card's
// business and does not need saying twice on the band above it.
export const CLINICAL_TEMPLATES = ['triage', 'fcp', 'pharmacyFirst', 'minorEyeService'];

/**
 * Turn the model's selection into a rendered answer. Returns null when no
 * template applies, which is the caller's signal to fall back to prose.
 *
 * `complaint` is the verbatim span of the ONE request this card is about, when
 * the message carried several (see lib/safety/scan.mjs). Two things follow from
 * it, and only for the clinical templates:
 *
 *   The card is BUILT from that span rather than from the whole message, so a
 *   knee card is decided by what was written about the knee.
 *
 *   Every sentence it would otherwise write about self-care, severity or nerve
 *   root symptoms has to be evidenced from inside it, so text from one
 *   complaint can no longer write the wording for another.
 *
 * Empty — every single-intent turn — and nothing changes: the whole message is
 * the complaint, exactly as before.
 */
export function renderSelection(selection, question = '', notebookPages = [], { complaint = '', gist = '' } = {}) {
  const sel = selection || {};
  // What the clinical cards are handed. The routed span when there is one, the
  // whole message otherwise. The heading prefers the gist of the routed request
  // over the model's condition for the same reason: `condition` describes
  // whichever request the model was answering, which is not necessarily this
  // one.
  const said = String(sel.condition || '').trim();
  const spoken = complaint ? (String(gist || '').trim() || said || complaint) : (said || question);
  const evidence = complaint || question;
  switch (sel.template) {
    case 'notebook':
      // The page itself, verbatim. Null when the title matches nothing, which
      // falls through to prose rather than showing an empty card.
      return notebookPageAnswer({
        pages: Array.isArray(sel.pages) ? sel.pages.slice(0, 2) : [],
        all: notebookPages,
      });
    case 'referral': {
      const chosen = String(sel.referralService || '').trim();
      const service = chosen && chosen.toLowerCase() !== 'none'
        ? REFERRAL_SERVICES.find((s) => s.name === chosen) || null
        : null;
      // No match is not the end of it. The practice's Notebook lists referrals
      // that go by email, and that list is longer than the enum above — so it
      // is read, by name, before falling back. Failing that, referralAnswer
      // produces the "not recorded" card, which names who to ask instead of
      // inventing a pathway.
      return referralAnswer({
        question,
        service,
        name: String(sel.referralName || '').trim(),
        pages: notebookPages,
      });
    }
    case 'referralProcess':
      return referralTemplates.referralProcessAnswer();
    case 'registration': {
      const scenario = String(sel.registrationScenario || '').trim();
      // The card is code, so it has no pictures of its own. The Notebook page it
      // stands in for does, and they are screenshots of the very screens the
      // steps describe — so they are carried across.
      const page = (notebookPages || []).find((p) => /registering a patient on emis/i.test(String(p.docTitle || '')));
      return registrationAnswer({
        scenario: scenario === 'none' ? '' : scenario,
        pictures: (page && page.images) || [],
      });
    }
    case 'documentCoding': {
      const d = sel.document || {};
      // A title with nothing in it is not a title. If the model chose this
      // template but found no parts, prose is the honest fallback.
      if (!d.date && !d.site && !d.department && !(d.actions || []).length) return null;
      return codedDocumentAnswer({
        date: d.date || 'dd-Mmm-yyyy',
        site: d.site || '',
        department: d.department || '',
        actions: Array.isArray(d.actions) ? d.actions.filter(Boolean).slice(0, 6) : [],
      });
    }
    case 'appointmentReason': {
      const reason = String(sel.reason || '').trim();
      if (!reason) return null;
      return writtenReasonAnswer({
        reason,
        details: Array.isArray(sel.details) ? sel.details.filter(Boolean).slice(0, 5) : [],
      });
    }
    // A slot the model left empty is not a reason to show the reader a prompt
    // asking them to say what the patient has — they already did, in the
    // message. Falling back to the question means the matching runs over their
    // own words, which is worse than a clean condition name and far better than
    // a dead end. It fails safe too: a red flag anywhere in the text still
    // wins, because that check runs first.
    //
    // `text` is the message itself, ALWAYS, alongside whatever the model named.
    // The condition is a heading; the message is the evidence. Passing only the
    // condition is what let "severe lower back pain radiating into my left leg,
    // numbness, maximum dose ibuprofen not touching it" reach the pharmacy card
    // as the two words "back pain".
    case 'triage':
      return triagePatientAnswer({ condition: spoken, text: evidence, complaint });
    case 'pharmacyFirst':
      return pharmacyFirstAnswer({ condition: spoken, text: evidence, complaint });
    case 'fcp':
      return fcpAnswer({ condition: spoken, text: evidence, complaint });
    case 'pharmacyReferral':
      return pharmacyReferralAnswer();
    case 'minorEyeService':
      return minorEyeServiceAnswer({ condition: complaint ? String(gist || '').trim() || said : said });
    case 'documentCodingRules':
      return documentCodingAnswer();
    // A repeat medication screen pasted into plain Q&A: the same card the
    // /medication command builds. Nothing read is null, so the turn falls
    // through to prose rather than showing the how-to card for a mode the
    // reader did not choose.
    case 'repeatMedication': {
      const groups = medicationGroups((sel.medication || {}).groups);
      return groups.length ? repeatMedicationAnswer({ groups }) : null;
    }
    case 'appointmentReasonRules':
      return appointmentReasonAnswer();
    default:
      return null;
  }
}
