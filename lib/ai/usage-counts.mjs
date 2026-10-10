// The token counts one model call reports, as ai_usage stores them.
//
// Pure, and apart from lib/ai/usage.js (which reaches Postgres) so it is
// tested on its own.
//
// CACHED INPUT IS ITS OWN NUMBER. The Q&A sends the whole Notebook (~43k
// tokens) at the front of every prompt and marks it cacheable
// (lib/templates/route.mjs, proseSystemMessage), so most of a turn's input is
// read from the provider's cache at a fraction of the price. `input` stays the
// whole prompt, cached or not — the figure every average on /settings is built
// on — and `cached` says how much of it came from the cache, so the saving is
// visible rather than assumed.
//
// `cached` is null, not 0, when the provider reported nothing about caching:
// "no cache" and "not said" are different facts.

const count = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
};

/**
 * @param {object} usage the AI SDK's usage (`inputTokens`, `outputTokens`,
 *   `inputTokenDetails.cacheReadTokens`), or an older/decision-shaped one
 *   (`promptTokens`, `completionTokens`, `cachedInputTokens`).
 * @returns {{ input: number, output: number, cached: number|null }}
 */
export function usageCounts(usage) {
  const u = usage || {};
  const cachedRaw = u.inputTokenDetails?.cacheReadTokens ?? u.cachedInputTokens ?? u.cacheReadTokens;
  return {
    input: count(u.inputTokens ?? u.promptTokens),
    output: count(u.outputTokens ?? u.completionTokens),
    cached: cachedRaw == null || !Number.isFinite(Number(cachedRaw)) ? null : count(cachedRaw),
  };
}
