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
import { fcpAnswer } from './fcp.mjs';
import { notebookPageAnswer } from './notebook.mjs';
import { REGISTRATION_SCENARIO_IDS, registrationAnswer } from './registration.mjs';
import {
  BOOKING_RULES, DOC_CODING_RULES, REASON_RULES,
  appointmentBookingAnswer, appointmentReasonAnswer, codedDocumentAnswer, documentCodingAnswer, writtenReasonAnswer,
} from './writing.mjs';

/** Every service name the model may choose between. */
export const REFERRAL_SERVICE_NAMES = REFERRAL_SERVICES.map((s) => s.name);

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

export function selectionPrompt({ question, attached = '', notebook = '', decompose = false }) {
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
    '1. "referral" — the message is about making or sending a referral, however it is worded ("how do I refer for an ECG", "ecg referral, how to do this?", "2ww skin"). Set referralService to the recorded referral it is about. Set it to "none" if the practice records none of them for this — a wrong match sends a referral to the wrong service, so "none" is the safe answer when unsure. Never invent a service.',
    '   ALWAYS also fill in "referralName" with what is being referred to, in the fewest words and without the word "referral" itself. Do this even when referralService is "none", and ESPECIALLY then: the Notebook lists referrals that are sent by email rather than on e-RS, that list is longer than the choices above, and the name is how the page is checked. Leaving it empty is how a referral the practice has written down gets reported as one it has no process for.',
    '',
    '1a. "referralProcess" — the message asks how referrals work IN GENERAL, with no service named: "how do I do an e-RS referral", "how do referrals work", "what are the steps for a referral". Use this rather than "referral" whenever no particular service is being referred to, and rather than writing the steps out yourself.',
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
 * /triage always answers with a triage, /document with a filing card
 * (or with how documents are titled, when there was nothing in the
 * message to build a title from), and /accurx with both halves of the
 * card it promises, however little the model managed to fill in.
 * ------------------------------------------------------------------ */

export const COMMAND_SCHEMAS = {
  triage: z.object({
    condition: z.string().default('').describe(
      'The problem, under its nearest common clinical name rather than the exact wording used, so "slightly red eyes with some discharge" becomes "conjunctivitis". This TITLES the card only — the full message is matched separately for red flags, so do not try to summarise the important parts into it. Keep it short. Empty if no problem was described.',
    ),
  }),
  documentCoding: z.object({
    document: z.object({
      date: z.string().default('').describe('Clinical event date as dd-Mmm-yyyy, e.g. 07-Aug-2026. Empty if it cannot be found.'),
      site: z.string().default('').describe('Site code or organisation, e.g. RLH, HUH, Legal & General.'),
      department: z.string().default('').describe('Department or team in title case, e.g. Ophthalmology.'),
      actions: z.array(z.string()).default([]).describe('Terse actions for the practice only. An empty array is the normal answer.'),
    }).default({ date: '', site: '', department: '', actions: [] }),
  }),
  // /appt. The same reason line the "appointmentReason" template writes, plus
  // the practical half the reason rules deliberately throw away. Two lists, so
  // the model cannot solve the tension between them by putting "call after 2pm"
  // into a clinical shorthand line.
  appointmentBooking: z.object({
    reason: z.string().default('').describe('The single reason line. Lowercase, no full stops, clinical shorthand, one line. Empty only if the message describes no problem at all.'),
    details: z.array(z.string()).default([]).describe('At most 5 further shorthand points the CLINICIAN needs. Usually empty.'),
    booking: z.array(z.string()).default([]).describe('At most 5 short notes RECEPTION needs to make the booking. An empty array is the normal answer.'),
  }),
  // /accurx. The two above on one call: the condition that titles the routing
  // card, and the wording that goes into whatever gets booked. Deliberately the
  // same fields with the same descriptions rather than a merged instruction —
  // the model is doing two separate extractions, not one blended one, and a
  // condition that started summarising the booking notes would be a routing
  // card titled with somebody's interpreter request.
  accurxTriage: z.object({
    condition: z.string().default('').describe(
      'The problem, under its nearest common clinical name rather than the exact wording used, so "slightly red eyes with some discharge" becomes "conjunctivitis". This TITLES the card only — the full message is matched separately for red flags, so do not try to summarise the important parts into it. Keep it short. Empty if no problem was described.',
    ),
    reason: z.string().default('').describe('The single reason line. Lowercase, no full stops, clinical shorthand, one line. Empty only if the message describes no problem at all.'),
    details: z.array(z.string()).default([]).describe('At most 5 further shorthand points the CLINICIAN needs. Usually empty.'),
    booking: z.array(z.string()).default([]).describe('At most 5 short notes RECEPTION needs to make the booking. An empty array is the normal answer.'),
  }),
};

// The same decomposition, for a command that has already said what the message
// is. Only /triage: a pasted letter to file is one document however many
// paragraphs it has, and splitting it would produce a panel of headings.
export const MULTI_COMMAND_SCHEMAS = {
  triage: COMMAND_SCHEMAS.triage.extend(REQUESTS_FIELD),
  // /appt too: a pasted eConsult is the commonest thing typed at it, and a
  // message asking for five things needs the panel beside the card just as much
  // here as anywhere. The reason line is still written from the WHOLE message
  // rather than from the routed request — the clinician is about to see this
  // patient about everything they wrote, and cutting the line down to one
  // complaint would lose what the consultation is for.
  appointmentBooking: COMMAND_SCHEMAS.appointmentBooking.extend(REQUESTS_FIELD),
  // /accurx most of all. It is pointed at the one channel patients write into
  // at length, so a message carrying five asks is the ordinary case here rather
  // than the exception, and the card can only be about one of them.
  accurxTriage: COMMAND_SCHEMAS.accurxTriage.extend(REQUESTS_FIELD),
};

// The templates whose card is a triage of the message, and which therefore want
// the message split up when it carries several requests: the card answers one
// of them and the panel beside it has to show the other four. A pasted letter
// to file is one document however many paragraphs it has, so /document is not
// here and splitting it would produce a panel of headings.
export const DECOMPOSING_COMMANDS = ['triage', 'accurxTriage'];

export function commandPrompt({ template, question, attached = '', decompose = false }) {
  const fence = (t) => String(t || '').replace(/"{3,}/g, '""');
  const rules = template === 'accurxTriage'
    ? [
      'A patient has written in through AccurX and reception is dealing with it. Fill in two things, and keep them apart — they are read by different people for different reasons.',
      '',
      '"condition" — the problem, so the routing card can be titled:',
      '- Its nearest common clinical name, not the words used — "bad back" becomes "back pain".',
      '- Short. It titles the card; where the patient goes and every red flag are worked out from the message itself, in code.',
      '- Empty only if no problem is described at all.',
      '',
      '"reason" — the one line that goes into the appointment for the clinician to read:',
      ...REASON_RULES.map((r) => '- ' + r),
      '',
      '"booking" — short notes for the receptionist making the booking:',
      ...BOOKING_RULES.map((r) => '- ' + r),
      '',
      'Anything about when they can attend or how to contact them goes in "booking", NEVER in "reason" and NEVER in "condition".',
      'You are not deciding how urgent this is, whether it is serious, or where the patient should go. Do not write any of those anywhere. They are decided in code from this same message.',
    ]
    : template === 'appointmentBooking'
    ? [
      'A patient has written in and reception is booking them an appointment. Write two things, and keep them apart.',
      '',
      '"reason" — the one line that goes into the appointment for the clinician to read:',
      ...REASON_RULES.map((r) => '- ' + r),
      '',
      '"booking" — short notes for the receptionist making the booking:',
      ...BOOKING_RULES.map((r) => '- ' + r),
      '',
      'Anything about when they can attend or how to contact them goes in "booking", NEVER in "reason".',
      'You are not deciding how urgent this is, whether it is serious, or where the patient should go. Do not write any of those. They are decided elsewhere on this same message.',
    ]
    : template === 'documentCoding'
    ? [
      'A document about a patient has been handed to you to file. Fill in "document" so a filing title can be built:',
      ...DOC_CODING_RULES.map((r) => '- ' + r),
      'Leave a value empty rather than guessing it. An empty value is shown as missing; a wrong one is filed wrong.',
    ]
    : [
      'A member of staff has described a patient’s problem and needs to know where it goes. Name the problem in "condition":',
      '- Its nearest common clinical name, not the words used — "bad back" becomes "back pain".',
      '- Short. It titles the card; the routing and the red flags are worked out from the message itself.',
      '- Empty only if no problem is described at all.',
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
export function renderCommand(template, values = {}, question = '', { complaint = '', gist = '' } = {}) {
  if (template === 'triage') {
    const said = String(values.condition || '').trim();
    return triagePatientAnswer({
      condition: complaint ? (String(gist || '').trim() || said || complaint) : (said || question),
      text: complaint || question,
      complaint,
    });
  }
  if (template === 'accurxTriage') {
    // Both halves at once, and each is handed exactly what /triage and /appt
    // would hand it on its own. The routing half takes the routed span, so a
    // knee card is decided by what was written about the knee; the wording half
    // takes what the model wrote from the whole message, for the reason set out
    // in MULTI_COMMAND_SCHEMAS above.
    const said = String(values.condition || '').trim();
    return accurxAnswer({
      condition: complaint ? (String(gist || '').trim() || said || complaint) : (said || question),
      text: complaint || question,
      complaint,
      reason: String(values.reason || '').trim(),
      details: Array.isArray(values.details) ? values.details.filter(Boolean).slice(0, 5) : [],
      booking: Array.isArray(values.booking) ? values.booking.filter(Boolean).slice(0, 5) : [],
    });
  }
  if (template === 'appointmentBooking') {
    // `complaint` is deliberately ignored: see MULTI_COMMAND_SCHEMAS above. The
    // panel lists every request; the reason line describes the appointment.
    return appointmentBookingAnswer({
      reason: String(values.reason || '').trim(),
      details: Array.isArray(values.details) ? values.details.filter(Boolean).slice(0, 5) : [],
      booking: Array.isArray(values.booking) ? values.booking.filter(Boolean).slice(0, 5) : [],
    });
  }
  if (template === 'documentCoding') {
    const d = values.document || {};
    const hasParts = d.date || d.site || d.department || (d.actions || []).length;
    // Nothing to build a title from — a message about filing rather than a
    // letter, or a paste that did not arrive. The rules card is the honest
    // answer, and is still the practice's own material rather than prose.
    if (!hasParts) return documentCodingAnswer();
    return codedDocumentAnswer({
      date: d.date || 'dd-Mmm-yyyy',
      site: d.site || '',
      department: d.department || '',
      actions: Array.isArray(d.actions) ? d.actions.filter(Boolean).slice(0, 6) : [],
    });
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
    case 'appointmentReasonRules':
      return appointmentReasonAnswer();
    default:
      return null;
  }
}
