// The second opinion: does the rewrite still mean what the page meant?
//
// The code checks (lib/notebook/validate.mjs) prove nothing was lost or
// invented at the level of sentences and tokens. They cannot tell that "book
// the patient unless they have chest pain" became "book the patient if they
// have chest pain" — same words, opposite instruction. So every rewritten
// sentence is shown beside what it replaced to a model that had no part in
// writing it, asked one narrow question, and a single "changed" blocks the
// apply. Prompt and merge are pure so they can be tested; the call is in
// lib/notebook/meaning.js.
import { z } from 'zod';

/** Pairs per call. Small enough to be read carefully, large enough not to need thirty calls. */
export const MEANING_CHUNK = 60;

export const MEANING_SCHEMA = z.object({
  verdicts: z.array(z.object({
    id: z.string(),
    verdict: z.enum(['same', 'changed', 'unsure']),
    reason: z.string().max(240).default(''),
  })),
});

export function chunkPairs(pairs, size = MEANING_CHUNK) {
  const out = [];
  for (let i = 0; i < (pairs || []).length; i += size) out.push(pairs.slice(i, i + size));
  return out;
}

export function buildMeaningPrompt(pairs, { path = '' } = {}) {
  const fence = (t) => String(t || '').replace(/"{3,}/g, '""');
  return [
    'You are auditing a rewrite of one page of a GP practice’s internal notes — instructions reception and admin staff follow. You did not write the rewrite and you are not asked whether it reads well. You are asked ONE thing per pair: does the AFTER sentence still instruct exactly what the BEFORE text instructed?',
    '',
    path ? `The page: ${fence(path)}` : '',
    '',
    'For each pair below, BEFORE is one or more sentences from the original page and AFTER is the sentence that replaced them. Answer:',
    '- "same" — a member of staff following AFTER would do exactly what BEFORE told them: the same actions, in the same order, under the same conditions, with the same numbers, names, places, forms and systems, and the same force (must / may / never).',
    '- "changed" — anything differs: a fact, a name, a number or time, a condition ("if", "unless", "only when"), the order of steps, who does it, where it goes, or the force of the instruction; or AFTER adds something BEFORE did not say, or drops something it did.',
    '- "unsure" — you cannot tell from the pair alone.',
    '',
    'Wording, punctuation, capitalisation, markdown formatting and sentence length do not matter. Meaning does. Give a one-sentence reason for every verdict. Return one verdict for EVERY pair id, and nothing for ids that are not listed.',
    '',
    'THE PAIRS',
    '',
    ...(pairs || []).flatMap((p) => [
      `#${p.id}`,
      `BEFORE: ${fence(p.before)}`,
      `AFTER: ${fence(p.after)}`,
      '',
    ]),
  ].filter((line) => line !== null).join('\n');
}

/**
 * Fold the verdict arrays from every chunk into one result.
 * A pair no reply mentioned is "unsure" and listed as missing; a "changed"
 * anywhere makes the whole thing not ok.
 */
export function mergeVerdicts(pairs, verdictArrays, { model = '' } = {}) {
  const verdicts = {};
  for (const arr of verdictArrays || []) {
    for (const v of arr || []) {
      if (!v || !v.id) continue;
      verdicts[String(v.id)] = { verdict: v.verdict, reason: String(v.reason || '') };
    }
  }
  const missing = [];
  for (const p of pairs || []) {
    if (!verdicts[p.id]) { missing.push(p.id); verdicts[p.id] = { verdict: 'unsure', reason: 'No verdict was returned for this sentence.' }; }
  }
  const changed = (pairs || []).filter((p) => verdicts[p.id].verdict === 'changed').map((p) => p.id);
  const unsure = (pairs || []).filter((p) => verdicts[p.id].verdict === 'unsure').map((p) => p.id);
  return { ok: changed.length === 0 && missing.length === 0, verdicts, changed, unsure, missing, model, checkedAt: new Date().toISOString() };
}
