// The general request: work the assistant does itself, rather than looks up.
//
// Most of what reception asks this assistant is a question about the practice,
// and the whole pipeline is built so that those are answered from the practice's
// own material and nothing else. But a reception desk also asks for things that
// have no answer in any document: format this email, shorten this message,
// tidy this list, turn these notes into a paragraph, what does this abbreviation
// mean. Before this module the agent researched those, found nothing — because
// there is nothing to find — and replied that the practice's material does not
// cover it. Which is true, and useless: nobody was asking the practice.
//
// So a request of that shape is done here instead. Two rules make it safe to
// sit beside a document-grounded assistant:
//
//   1. NOTHING WRITTEN HERE IS PRACTICE POLICY. This model is given no sources
//      and quotes nothing. The answer is marked in the card as the assistant's
//      own work, so a reader can never mistake it for what the practice does.
//   2. IT MAY REFUSE THE JOB. If the request turns out to need the practice's
//      material after all — how we do something, who to ring, who is on — or a
//      clinician's judgement about a patient, it hands the turn back and the
//      honest "I could not find this" answer is given instead. Answering those
//      from a model's memory is the one thing this app exists not to do.
//
// The output is deliberately shaped like the rest of an answer, so it renders in
// the same card: sections for anything explained, and `message` for a finished
// piece of text the reader is going to copy — a reformatted email belongs in the
// block that has a Copy button under it, not in a markdown section.
import { generateObject } from 'ai';
import { z } from 'zod';
import { attachmentsBlock } from '../attachments/extract.mjs';

export const GeneralAnswerSchema = z.object({
  handled: z.boolean().describe('True when you have carried the request out below. False when it cannot be done without the practice’s own material, or needs a clinician’s judgement about a patient.'),
  declineReason: z.string().default('').describe('When handled is false, one line saying why — for internal logging, not shown to the reader.'),
  intro: z.string().default('').describe('At most one sentence framing what you did. Often empty: the work itself is the answer. Never a pleasantry.'),
  sections: z.array(z.object({
    heading: z.string().default('').describe('A short label, at most six words, in sentence case. Empty when there is only one section.'),
    markdown: z.string().describe('The content, as markdown. Lists, tables and bold are all fine.'),
  })).default([]).describe('Anything explained, compared or worked through. Empty when the whole answer is the text in "message".'),
  message: z.string().default('').describe('The finished text, when the request was for a piece of writing to use — an email, a message, a note, a letter. Plain text with real line breaks, ready to paste, and nothing else: no commentary, no "here is your email". Empty when nothing was being written.'),
  tip: z.string().default('').describe('Optional single practical note about the work — what you assumed, or what to check before sending. Empty if none.'),
  followUps: z.array(z.string()).default([]).describe('At most two things the reader might ask next, each written as they would type it. Usually empty.'),
});

const SYSTEM = [
  'You are the reception assistant for The Riverside Practice, a UK GP surgery, working for a receptionist who has asked you to DO something rather than to look something up.',
  'Carry the request out. Return the finished work, not advice on how to do it yourself.',
  '',
  'WHAT YOU MUST NOT DO',
  '- You have no access here to the practice’s documents, Notebook, telephone directory or rota, and you must not act as though you remember them. Never state how this practice does anything, never give a policy, process, telephone number, email address, staff name or who is on duty. If the request cannot be carried out without one of those, set handled to false and stop.',
  '- Never give clinical judgement about a particular patient — what is wrong with them, how urgent they are, what treatment or advice they need. Set handled to false and stop.',
  '- Do not invent specifics. If the text you were given is missing a date, a name, a number or an address, leave a placeholder in square brackets — [date], [name] — rather than filling it in. A plausible invented detail is worse than an obvious gap.',
  '',
  'HOW TO WRITE IT',
  '- UK English, plain and direct. The reader has a patient at the desk.',
  '- Writing something to send — an email, a message to a patient, a note, a letter — goes in "message", finished and ready to paste, and nowhere else. Do not repeat it in a section, and do not wrap it in "Here is the email you asked for".',
  '- Anything else — an explanation, a comparison, a rewritten list, a summary — goes in sections as markdown.',
  '- Match the register of what you were given: a message to a patient is warm and simple, a note to a colleague is short.',
  '- No preamble, no summary of what you are about to do, no closing pleasantries.',
  '- If the request is a general question of fact rather than a piece of writing, answer it plainly in one section, and say so when it is something worth checking rather than something you are sure of.',
  '- A file dropped onto the question arrives as text below it. That file IS what the request is about — "shorten this" means shorten that. Work from it and nothing else, and if it was too long to send whole you will be told so: say what you have not seen rather than summarising as though you had.',
].join('\n');

function buildPrompt({ question, history, attachments }) {
  const lines = [];
  if (history) lines.push('CONVERSATION SO FAR:', history, '');
  // The file the request is about — the email to shorten, the letter to
  // summarise. It goes before the request, because the request is usually
  // meaningless without it ("make this shorter").
  const attached = attachmentsBlock(attachments);
  if (attached) lines.push(attached, '');
  lines.push('THE REQUEST:', question);
  return lines.join('\n');
}

// The draft, shaped into the fields the answer card already renders. Kept pure
// and exported so the shaping can be tested without a model: the parts that
// matter here are that nothing claims a source, that a section carrying no text
// is dropped, and that the request cannot come back with the reader's own words
// presented as the practice's.
export function buildGeneralAnswer(draft) {
  const text = (v, max = 4000) => String(v || '').replace(/\r/g, '').trim().slice(0, max);
  const sections = (draft?.sections || [])
    .map((sec) => ({
      heading: text(sec?.heading, 80),
      markdown: text(sec?.markdown, 12000),
      // Not 'practice', not 'web', and not 'judgement' either: judgement means a
      // claim the model made alongside sourced ones, and is shown as an amber
      // block interrupting them. Here every section is the assistant's own work,
      // so the whole answer carries one marker instead of each block carrying
      // the same one. Nothing cites anything.
      basis: 'general',
      critical: false,
      ref: '',
      cite: null,
      web: null,
    }))
    .filter((sec) => sec.markdown)
    .slice(0, 6);

  const message = text(draft?.message, 8000);
  return {
    handled: draft?.handled === true && !!(sections.length || message),
    reason: text(draft?.declineReason, 200),
    intro: text(draft?.intro, 400),
    sections,
    message,
    tip: text(draft?.tip, 400),
    followUps: [...new Set((draft?.followUps || [])
      .map((q) => String(q || '').replace(/\s+/g, ' ').trim())
      .filter((q) => q.length > 5 && q.length <= 120))].slice(0, 2),
  };
}

// Carry out a general request. Returns `handled: false` when the model decided
// this was not its job — the caller then gives the ordinary "nothing found"
// answer, which is the right one for a practice question with no sources behind
// it. A model call that fails outright declines in the same way: a general
// request is a convenience, and it must never be the reason a turn errors.
export async function composeGeneralAnswer({
  model,
  question,
  history = '',
  // The screenshots or photographs attached to the question — the email being
  // reformatted is as often a picture of one as it is pasted text.
  images = [],
  // Documents dropped onto the question and already read into text.
  attachments = [],
  onStatus,
  onUsage,
}) {
  if (onStatus) onStatus('Doing this directly');
  const prompt = buildPrompt({ question, history, attachments });
  const content = images.length
    ? [{ type: 'text', text: prompt }].concat(images.map((url) => ({ type: 'image', image: url })))
    : prompt;

  let generated;
  try {
    generated = await generateObject({
      model,
      schema: GeneralAnswerSchema,
      system: SYSTEM,
      // Writing, not retrieval: a little more room than the grounded answer gets,
      // and still nowhere near enough to start inventing.
      temperature: 0.4,
      maxRetries: 1,
      messages: [{ role: 'user', content }],
    });
  } catch (e) {
    console.warn('[general] could not carry out the request:', String(e).slice(0, 160));
    return { handled: false, reason: 'the model call failed', intro: '', sections: [], message: '', tip: '', followUps: [] };
  }
  if (onUsage) onUsage('general', generated.usage);
  return buildGeneralAnswer(generated.object);
}
