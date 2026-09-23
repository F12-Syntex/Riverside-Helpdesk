// The whole Notebook, and the rules for choosing out of it.
//
// WHAT THIS REPLACED. First a template router — three model calls and a
// catalogue of templates. Then one call in which the model wrote the answer out
// of the Notebook as prose, told to keep the practice's wording and measured
// afterwards for whether it had. Measured, not enforced: a sentence it made up
// was shown all the same.
//
// WHAT IS HERE NOW. The model does not write the answer. It reads the Notebook
// and CHOOSES: which pages answer the question, whether a page's recorded card
// is the answer, and which of a page's own sentences are. It returns ids and
// quotes, and lib/agent/verify-answer.mjs checks every one against the page
// before a word of it is shown — and then shows the page's text, not the
// model's. The one thing it writes is a short lead line, held to rules a
// heading can meet and a fact cannot.
//
// The Notebook sits at the END of the system prompt, which is itself the first
// thing in the request and byte-identical from one question to the next, so a
// provider that caches prompt prefixes pays for it once rather than per turn.
import { z } from 'zod';
import { readStructured } from '../ai/structured.js';
import { pageRef } from './verify-answer.mjs';

// The choice's output cap. Left unset, OpenRouter reserves the model's whole
// output window before the call is made, and refuses the request outright when
// the account cannot cover that reservation. Three quotes and a lead are short.
const SELECTION_MAX_TOKENS = 1500;

/** What the model returns: a choice, not an answer. */
export const SELECTION_SCHEMA = z.object({
  verdict: z.enum(['answer', 'not_covered', 'ambiguous']),
  lead: z.string(),
  picks: z.array(z.object({
    page: z.string(),
    type: z.enum(['card', 'quote']),
    quote: z.string(),
  })),
  nearest: z.array(z.string()),
});

/** Every page as one block under its id and full path. */
export function notebookFullText(pages = []) {
  return pages.map((page) => {
    const body = String(page.text || '').trim();
    return `### [${pageRef(page)}] ${page.docTitle}\n${body}`;
  }).join('\n\n');
}

export const SELECTOR_RULES = [
  'You work for The Riverside Practice, a UK GP surgery. A member of staff has asked a question. The practice’s Notebook is at the end of this message; each page starts with a heading like "### [p123] Notebook: Folder / Page title", and [p123] is that page’s id.',
  '',
  'YOU DO NOT WRITE THE ANSWER. You choose which parts of the Notebook answer the question, and the practice’s own words are shown to the reader exactly as saved. Anything you choose that is not on the page you name is thrown away.',
  '',
  'Reply with JSON:',
  '- "verdict": "answer" if the Notebook answers the question; "not_covered" if it does not; "ambiguous" only if two or more different pages could each be what was meant and the question does not say which.',
  '- "picks": at most 3, the fewest that fully answer it, most important first. Each is {"page": "p123", "type": "card" | "quote", "quote": "..."}.',
  '  - "card": the page begins **e-RS referral**, **Email referral** or **Blood test set** and its recorded values are the answer. Leave "quote" as "".',
  '  - "quote": copy a passage from that page WORD FOR WORD — whole sentences, in the page’s order, at least eight words. Do not shorten, reword, merge or fix it. A quote that is not character-for-character on the page is discarded.',
  '- "lead": one short line introducing the picks, at most 15 words, using only words from the question or the picked text. No numbers, email addresses, names, times or advice of your own. It may be "".',
  '- "nearest": for "not_covered" or "ambiguous", up to 3 page ids closest to the question, best first. Otherwise [].',
  '',
  'RULES',
  '- Only the Notebook counts. Never answer from general knowledge: if the Notebook does not say it, the verdict is "not_covered". A partial match is not an answer — choose "not_covered" rather than a page about something else.',
  '- Where two pages disagree, pick both.',
  '- The question may ask to write, reformat or draft something. That is "not_covered" unless a page holds the wording to use.',
  '- Emergencies are handled before you are asked; do not add advice about them.',
].join('\n');

/**
 * The system prompt for this turn: the rules, then the Notebook itself.
 *
 * There is no prompt for a turn without a Notebook: a turn that cannot read
 * the practice's own material has nothing to choose from, and the endpoint says
 * so without asking a model anything.
 */
export function selectorSystemPrompt(notebookText) {
  // The Notebook is the practice’s own writing rather than a reader’s, but the
  // fence still has to survive a page that contains the fence.
  const fenced = String(notebookText || '').replace(/"{3,}/g, '”””');
  return [
    SELECTOR_RULES,
    '',
    'THE NOTEBOOK, IN FULL. Every page the practice has written, exactly as it is saved.',
    '"""',
    fenced,
    '"""',
  ].join('\n');
}

/**
 * The one model call: the Notebook and the question in, a choice out.
 *
 * Shared by the endpoint and evals/answer/bench-answer.mjs, so what the bench
 * measures is the call staff get, not a copy of it.
 */
export function selectFromNotebook({ openrouter, model, pages, question, history = '', attached = '', images = [], role = 'fast', turnId = '' }) {
  const userContent = images.length
    ? [{ type: 'text', text: question }].concat(images.map((url) => ({ type: 'image', image: url })))
    : question;
  return readStructured({
    openrouter,
    model,
    schema: SELECTION_SCHEMA,
    system: selectorSystemPrompt(notebookFullText(pages)),
    messages: [
      ...(history ? [{ role: 'user', content: `Conversation so far:\n${history}` }] : []),
      // A dropped document goes in before the question, as the context the
      // question is asked against.
      ...(attached ? [{ role: 'user', content: attached }] : []),
      { role: 'user', content: userContent },
    ],
    maxOutputTokens: SELECTION_MAX_TOKENS,
    role,
    phase: 'select',
    turnId,
  });
}
