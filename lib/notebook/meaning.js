// The independent meaning check, as a model call.
//
// A separate prompt, a separate call, and the reasoning role — the strongest
// model configured — because this is the judge, and the one place a subtle
// change of instruction can be caught. Pairs already judged (by id, which is
// a hash of before+after) are not sent again, so an edit re-checks only what
// changed.
import { readStructured } from '../ai/structured.js';
import { buildMeaningPrompt, chunkPairs, mergeVerdicts, MEANING_SCHEMA } from './meaning-prompt.mjs';

/**
 * @param {{ pairs: Array, openrouter: Function, model: string, turnId?: string,
 *           path?: string, cache?: Record<string,{verdict:string,reason:string}> }} args
 */
export async function checkMeaning({ pairs, openrouter, model, turnId = '', path = '', cache = {} }) {
  const known = cache || {};
  // Sentences that did not change need no judge: the same words mean the same.
  const trivially = (pairs || []).filter((p) => p.same).map((p) => ({ id: p.id, verdict: 'same', reason: 'Unchanged.' }));
  const cached = (pairs || []).filter((p) => !p.same && known[p.id] && known[p.id].verdict).map((p) => ({ id: p.id, ...known[p.id] }));
  const cachedIds = new Set([...trivially, ...cached].map((v) => v.id));
  const todo = (pairs || []).filter((p) => !cachedIds.has(p.id));

  const arrays = [trivially, cached];
  for (const chunk of chunkPairs(todo)) {
    const out = await readStructured({
      openrouter,
      model,
      schema: MEANING_SCHEMA,
      prompt: buildMeaningPrompt(chunk, { path }),
      maxOutputTokens: Math.min(8000, 80 * chunk.length + 200),
      role: 'reasoning',
      phase: 'defragMeaning',
      turnId,
    });
    arrays.push(out.verdicts || []);
  }
  return mergeVerdicts(pairs, arrays, { model });
}
