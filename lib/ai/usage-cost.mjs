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

// A routing variant changes the provider, not the price, so ":nitro" is priced
// as the model it decorates.
function priceFor(prices, model) {
  const price = prices[model] || prices[String(model).split(':')[0]];
  if (!price || (price.promptPerMillion == null && price.completionPerMillion == null)) return null;
  return price;
}

function costOf(used, price) {
  return (used.inputTokens / 1e6) * (price.promptPerMillion || 0)
    + (used.outputTokens / 1e6) * (price.completionPerMillion || 0);
}

/**
 * What one question costs, in dollars, on the models currently chosen.
 *
 * `averages` is measured tokens per question keyed role -> model -> tokens, so
 * a role is only ever priced from what it used ON THAT MODEL. That is what
 * makes the figure reset on a change of model rather than carrying the last
 * model's token counts over to the new one's rates — and what makes it come
 * back, unchanged, if the old model is chosen again.
 *
 * `roleModels` says which model each role runs on now. `prices` is keyed by
 * model id, each carrying { promptPerMillion, completionPerMillion } from the
 * OpenRouter catalogue.
 *
 * A role with no measurements on its current model contributes nothing rather
 * than a guess, and is named in `missing`. A role whose model has no published
 * price is named in `unpriced`: a free model really is $0, but an unknown one
 * must not read as $0.
 */
export function estimateQueryCost({ averages = {}, roleModels = {}, prices = {} }) {
  let total = 0;
  const perRole = [];
  const missing = [];
  const unpriced = [];

  for (const [role, model] of Object.entries(roleModels)) {
    if (!model) continue;
    const used = (averages[role] || {})[model];
    if (!used || (!used.inputTokens && !used.outputTokens)) {
      missing.push(role);
      continue;
    }
    const price = priceFor(prices, model);
    if (!price) {
      unpriced.push(role);
      continue;
    }
    const cost = costOf(used, price);
    total += cost;
    perRole.push({ role, model, cost, inputTokens: used.inputTokens, outputTokens: used.outputTokens });
  }

  perRole.sort((a, b) => b.cost - a.cost);
  return { total, perRole, missing, unpriced, measured: perRole.length > 0 };
}

/**
 * What a question has cost on every model that has ever run one.
 *
 * The history behind the estimate. Nothing here is reset when the model changes
 * — the measurements are kept per model, so a model that is switched away from
 * keeps its record and shows it again the moment it is switched back to. `inUse`
 * marks the models currently doing a job, so the page can say which line is the
 * one in force.
 */
export function summariseModelCosts({ byModel = {}, prices = {}, roleModels = {} }) {
  const current = new Set(Object.values(roleModels).filter(Boolean));
  const rows = [];

  for (const [model, used] of Object.entries(byModel)) {
    if (!used || (!used.inputTokens && !used.outputTokens)) continue;
    const price = priceFor(prices, model);
    rows.push({
      model,
      cost: price ? costOf(used, price) : null,
      priced: !!price,
      inputTokens: used.inputTokens,
      outputTokens: used.outputTokens,
      turns: used.turns || 0,
      lastUsed: used.lastUsed || null,
      inUse: current.has(model),
    });
  }

  // Dearest first, but anything with no published price goes last: it is not
  // cheap, it is unknown, and sorting it as $0 would say the opposite.
  rows.sort((a, b) => {
    if (a.priced !== b.priced) return a.priced ? -1 : 1;
    return (b.cost || 0) - (a.cost || 0);
  });
  return rows;
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
