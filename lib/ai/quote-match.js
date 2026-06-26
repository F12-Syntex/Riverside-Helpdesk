// Verbatim-quote matching primitives shared by the grounding logic in both
// /api/ask (practice documents) and the Medication Check tool (web sources).
// These decide whether a model's quote is actually found in a source, so they
// are safety-critical and must not drift between the two callers — hence one
// definition here rather than a copy in each route.

// Normalise text for verbatim comparison: unify smart quotes/dashes, collapse
// whitespace, lowercase.
export function normForMatch(str) {
  return (str || '')
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[–—−]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// How much of `quoteN` is found verbatim inside `bodyN` (0..1). Both inputs must
// already be normalised with normForMatch. Exact containment scores 1; otherwise
// the longest leading run that is contained gives a partial score, so a
// near-verbatim quote (a correct opening that the model then trimmed) still
// verifies. `minRun` is the shortest leading run worth trusting.
export function quoteContainment(quoteN, bodyN, { minRun = 24 } = {}) {
  if (!quoteN || !bodyN) return 0;
  if (bodyN.includes(quoteN)) return 1;
  let best = 0;
  for (const frac of [0.85, 0.7, 0.55, 0.4]) {
    const n = Math.max(minRun, Math.floor(quoteN.length * frac));
    if (n < minRun || n > quoteN.length) continue;
    if (bodyN.includes(quoteN.slice(0, n))) { best = Math.max(best, n / quoteN.length); break; }
  }
  // A long quote whose middle (not just its head) is contained still part-verifies.
  if (quoteN.length > 80 && bodyN.includes(quoteN.slice(minRun, minRun + 60))) best = Math.max(best, 0.5);
  return best;
}
