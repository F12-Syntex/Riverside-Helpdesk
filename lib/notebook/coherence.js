// The coherence sweep, as a model call.
//
// The reasoning role — the strongest model configured — because this is the
// question the whole-Notebook rewrite turns on: is the practice telling its
// staff two different things? Candidates are found in code (coherence.mjs) and
// only they are ever sent, so the cost is bounded by how much the Notebook
// actually repeats itself, not by how many pages it has.
import { readStructured } from '../ai/structured.js';
import { buildCoherencePrompt, chunkCandidates, mergeFindings, COHERENCE_SCHEMA } from './coherence.mjs';

/**
 * @param {{ candidates: Array, openrouter: Function, model: string, turnId?: string }} args
 */
export async function judgeCandidates({ candidates, openrouter, model, turnId = '' }) {
  const arrays = [];
  for (const chunk of chunkCandidates(candidates)) {
    const out = await readStructured({
      openrouter,
      model,
      schema: COHERENCE_SCHEMA,
      prompt: buildCoherencePrompt(chunk),
      maxOutputTokens: Math.min(8000, 220 * chunk.length + 300),
      role: 'reasoning',
      phase: 'defragCoherence',
      turnId,
    });
    arrays.push(out.findings || []);
  }
  return mergeFindings(candidates, arrays, { model });
}
