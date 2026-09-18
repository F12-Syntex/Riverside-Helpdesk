// Trigger phrases for a Notebook page, written once by the fast role.
//
// Staff do not ask for a page in the words on the page. They ask for "the
// smear one", "2ww", "med3 for a patient off sick", "where do the DNAs go". So
// each page is given, once, a list of how reception staff would ask for it —
// including abbreviations, colloquialisms and the common WRONG term — and
// the router matches the question against that list rather than against the
// page body. This is the one-off pass that writes the list
// (`npm run routing:seed`); tap-learned phrasings accumulate beside it later.
//
// One structured call per page on the fast role, temperature low, output
// capped: about ten tokens a phrase. A hundred pages cost cents.
import { generateObject } from 'ai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { z } from 'zod';
import { AI_SDK_EXTRA_BODY } from '../ai/openrouter.mjs';
import { cleanPhrases } from './triggers.mjs';

export const MIN_GENERATED = 8;
export const MAX_GENERATED = 15;
// A page longer than this is summarised by its opening, which is where the
// title, the purpose and the vocabulary sit.
const PAGE_CHARS = 6000;
const OUTPUT_TOKENS = 700;

export const TRIGGERS_SCHEMA = z.object({
  phrases: z.array(z.string()).min(1).max(MAX_GENERATED)
    .describe(`${MIN_GENERATED} to ${MAX_GENERATED} short ways a receptionist might ask for this page.`),
});

export function triggerPrompt({ title, text }) {
  return [
    'You are helping the reception team of a GP practice find the right page in their own Notebook.',
    'Below is ONE Notebook page. Write the short phrasings a receptionist would TYPE when they need THIS page and no other:',
    '- questions and fragments as typed at a busy desk ("how do i book a smear", "2ww referral", "med3 off sick");',
    '- the abbreviations and colloquial names staff actually use, and the common wrong term for the thing;',
    '- each phrasing under twelve words; no full sentences from the page; no punctuation-only variants.',
    'Do NOT write phrasings that would fit a different page just as well — nothing generic like "how do I do a referral".',
    'Do NOT include patient names, phone numbers or anything that is not a way of asking for the page.',
    `Return ${MIN_GENERATED} to ${MAX_GENERATED} phrasings.`,
    '',
    `PAGE TITLE: ${String(title || '').trim()}`,
    'PAGE:',
    String(text || '').slice(0, PAGE_CHARS),
  ].join('\n');
}

/**
 * Write the phrasings for one page. Returns `{ phrases, usage }`, phrases
 * already cleaned and de-duplicated. Throws on a failed call; the seed script
 * decides what to do about a page that would not generate.
 */
export async function generateTriggersForPage({ title, text }, { apiKey, model, temperature = 0.3 }) {
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not set');
  if (!model) throw new Error('No model given for trigger generation');
  const openrouter = createOpenRouter({ apiKey, extraBody: AI_SDK_EXTRA_BODY });
  const out = await generateObject({
    model: openrouter(model),
    schema: TRIGGERS_SCHEMA,
    temperature,
    maxOutputTokens: OUTPUT_TOKENS,
    prompt: triggerPrompt({ title, text }),
  });
  const phrases = cleanPhrases(out.object.phrases).map((p) => p.phrase);
  return { phrases, usage: out.usage || null };
}