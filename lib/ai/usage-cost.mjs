// What a question costs, as arithmetic.
//
// Kept apart from lib/ai/usage.js, which reaches Postgres: the settings page
// runs this in the browser, and importing the recorder there would drag the
// database driver into the bundle with it. Nothing here does any I/O.
//
// The distinction this file exists to make: a model's ADVERTISED RATE is not a
// COST. What a question costs is the rate multiplied by how many tokens this
// practice's questions actually use, which depends on its Notebook, its
// documents and how staff word things. Two installs on one model differ by more
// than two models on one install — so the tokens are measured, never assumed.

/**
 * What one question costs, in dollars, at the rates currently configured.
 *
 * `averages` is measured tokens per question, per role. `roleModels` says which
 * model each role runs on. `prices` is keyed by model id, each carrying
 * { promptPerMillion, completionPerMillion } straight from the OpenRouter
 * catalogue.
 *
 * A role with no measured usage contributes nothing rather than a guess, and is
 * named in `missing` so the page can say which part of the estimate is absent.
 * A role whose model has no published price is named in `unpriced` for the same
 * reason: a free model really is $0, but an unknown one must not read as $0.
 */
export function estimateQueryCost({ averages = {}, roleModels = {}, prices = {} }) {
  let total = 0;
  const perRole = [];
  const missing = [];
  const unpriced = [];

  for (const [role, model] of Object.entries(roleModels)) {
    if (!model) continue;
    const used = averages[role];
    if (!used || (!used.inputTokens && !used.outputTokens)) {
      missing.push(role);
      continue;
    }
    // A routing variant changes the provider, not the price: ":nitro" is priced
    // as the model it decorates.
    const price = prices[model] || prices[String(model).split(':')[0]];
    if (!price || (price.promptPerMillion == null && price.completionPerMillion == null)) {
      unpriced.push(role);
      continue;
    }
    const cost = (used.inputTokens / 1e6) * (price.promptPerMillion || 0)
      + (used.outputTokens / 1e6) * (price.completionPerMillion || 0);
    total += cost;
    perRole.push({ role, model, cost, inputTokens: used.inputTokens, outputTokens: used.outputTokens });
  }

  perRole.sort((a, b) => b.cost - a.cost);
  return { total, perRole, missing, unpriced, measured: perRole.length > 0 };
}

// Small money. A tenth of a penny per question is a real difference over a year
// of questions, so the usual two decimal places would round every honest answer
// to $0.00.
export function formatCost(value) {
  if (!Number.isFinite(value)) return '';
  if (value === 0) return '$0';
  if (value < 0.01) return '$' + value.toFixed(4);
  if (value < 1) return '$' + value.toFixed(3);
  return '$' + value.toFixed(2);
}
