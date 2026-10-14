// What a question actually costs.
//
// The settings page can show a model's advertised rate straight from
// OpenRouter, but a rate is not a cost. What a question costs is the rate
// multiplied by how many tokens THIS practice's questions use, and that is a
// property of the Notebook, the documents and the way staff ask things — not of
// the model. Two installs on the same model differ by more than two models on
// the same install.
//
// So it is measured. Every phase of every turn records what it used (ai_usage,
// see lib/db.js), and the page multiplies the average by the rate of whichever
// model each role is currently set to. Before anything has been measured the
// page says so, rather than showing a number that came from nowhere.
//
// AND WHAT IT WAS CHARGED. Each row also carries the cost OpenRouter reported
// for that call (cost_usd), so the page can show what the recent questions
// really cost — cache discounts and all — beside the estimate from list prices.
//
// A ROLLING WINDOW, NOT A HISTORY. Only the last ROLLING_TURNS questions are
// kept: each new row prunes everything older. That is enough for an average to
// settle, recent enough to reflect how the assistant is set up now, and it
// keeps the table a few hundred rows forever instead of one row per model call
// for the life of the install.
import { ensureUsageSchema, getSql } from '../db.js';
import { costOf, usageCounts } from './usage-counts.mjs';

export const ROLLING_TURNS = 100;


/**
 * Record one phase of one turn. Never throws and never blocks the answer: a
 * turn that cannot write its usage row is still a turn that answered the
 * question, and the estimate is worth less than the answer.
 *
 * `input_tokens` is the whole prompt; `cached_input_tokens` is how much of it
 * the provider read from its prompt cache (null when it did not say) — see
 * usage-counts.mjs. `metadata` is the AI SDK's `providerMetadata`, where
 * OpenRouter reports what the call cost; `cost_usd` is null when it did not.
 */
export async function recordUsage({ turnId = '', role, phase, model, usage, metadata }) {
  const { input, output, cached } = usageCounts(usage);
  if (!role || !model || (!input && !output)) return;
  const cost = costOf({ usage, metadata });
  try {
    await ensureUsageSchema();
    const sql = getSql();
    await sql`
      INSERT INTO ai_usage (turn_id, role, phase, model, input_tokens, output_tokens, cached_input_tokens, cost_usd)
      VALUES (${String(turnId)}, ${String(role)}, ${String(phase || '')}, ${String(model)}, ${input}, ${output}, ${cached}, ${cost})
    `;
    await pruneUsage(sql);
  } catch (e) {
    console.warn('[usage] could not record model usage:', String(e).slice(0, 140));
  }
}

// Everything but the most recent ROLLING_TURNS questions goes. One question's
// rows share a turn_id, and its recency is its newest row, so the turn being
// answered right now is never the one pruned, even half-way through.
//
// A call made outside a turn (the referral search's answer check) has no
// turn_id. It is kept while it is newer than the oldest question still in the
// window, so the window is ROLLING_TURNS questions plus the calls made over
// the same stretch — not a hundred slots that those calls eat half of. Until
// there are ROLLING_TURNS questions there is no cut-off, and nothing goes.
async function pruneUsage(sql) {
  await sql.query(`
    WITH kept AS (
      SELECT turn_id, MAX(at) AS last
      FROM ai_usage
      WHERE turn_id <> ''
      GROUP BY turn_id
      ORDER BY last DESC
      LIMIT ${ROLLING_TURNS}
    )
    DELETE FROM ai_usage
    WHERE (turn_id <> '' AND turn_id NOT IN (SELECT turn_id FROM kept))
       OR (turn_id = '' AND at < (SELECT last FROM kept ORDER BY last DESC OFFSET ${ROLLING_TURNS - 1} LIMIT 1))
  `);
}

const num = (v) => (v == null ? null : Number(v));
const tokens = (v) => Math.round(Number(v) || 0);

/**
 * Average tokens and cost per question over the rolling window, PER MODEL.
 *
 * Per model, not merely per role, because that is what makes the figure honest
 * when the model changes. Tokens measured on one model say nothing about the
 * next one: a terser model writes fewer, a model with a bigger appetite for
 * context reads more, and pricing yesterday's token counts at today's rate
 * quietly reports a number that was never true of either. Keyed by model, a
 * switch simply has nothing to show until it has been used.
 *
 * Averaged over TURNS, not over rows: a role that runs twice in some turns and
 * once in others (the writer, when a claim fails checking and is repaired) must
 * report what a question costs, not what one call costs.
 *
 * Costs are averaged only over the questions whose calls reported one
 * (`costedTurns`), so rows written before the charge was recorded do not drag
 * the average towards zero.
 */
export async function readUsageAverages() {
  await ensureUsageSchema();
  const sql = getSql();

  // What each role costs on each model it has actually run on.
  const roleRows = await sql`
    WITH per_turn AS (
      SELECT turn_id, role, model,
             SUM(input_tokens)  AS input_tokens,
             SUM(output_tokens) AS output_tokens,
             SUM(cost_usd)      AS cost
      FROM ai_usage
      WHERE turn_id <> ''
      GROUP BY turn_id, role, model
    )
    SELECT role, model,
           AVG(input_tokens)::float  AS "inputTokens",
           AVG(output_tokens)::float AS "outputTokens",
           AVG(cost)::float          AS "avgCost",
           COUNT(*)::int             AS turns
    FROM per_turn
    GROUP BY role, model
  `;

  // What a question costs on each model overall, whichever roles it ran.
  const modelRows = await sql`
    WITH per_turn AS (
      SELECT turn_id, model,
             SUM(input_tokens)  AS input_tokens,
             SUM(output_tokens) AS output_tokens,
             SUM(cost_usd)      AS cost,
             MAX(at)            AS at
      FROM ai_usage
      WHERE turn_id <> ''
      GROUP BY turn_id, model
    )
    SELECT model,
           AVG(input_tokens)::float  AS "inputTokens",
           AVG(output_tokens)::float AS "outputTokens",
           AVG(cost)::float          AS "avgCost",
           SUM(cost)::float          AS "totalCost",
           COUNT(*)::int             AS turns,
           MAX(at)                   AS "lastUsed"
    FROM per_turn
    GROUP BY model
  `;

  // The window as a whole: every question in it, every model it ran on, and
  // the calls made outside a question (the screen) in the total as well.
  const [totals] = await sql`
    WITH per_turn AS (
      SELECT turn_id,
             SUM(input_tokens)  AS input_tokens,
             SUM(output_tokens) AS output_tokens,
             SUM(cached_input_tokens) AS cached_tokens,
             SUM(cost_usd)      AS cost,
             MIN(at)            AS first_at,
             MAX(at)            AS last_at
      FROM ai_usage
      WHERE turn_id <> ''
      GROUP BY turn_id
    )
    SELECT COUNT(*)::int                                  AS turns,
           COUNT(cost)::int                               AS "costedTurns",
           AVG(input_tokens)::float                       AS "avgInputTokens",
           AVG(output_tokens)::float                      AS "avgOutputTokens",
           AVG(cached_tokens)::float                      AS "avgCachedTokens",
           AVG(cost)::float                               AS "avgCost",
           SUM(cost)::float                               AS "turnCost",
           (SELECT SUM(cost_usd) FROM ai_usage)::float    AS "totalCost",
           MIN(first_at)                                  AS since,
           MAX(last_at)                                   AS until
    FROM per_turn
  `;

  // role -> model -> what a question costs on it.
  const byRole = {};
  for (const row of roleRows) {
    if (!byRole[row.role]) byRole[row.role] = {};
    byRole[row.role][row.model] = {
      inputTokens: tokens(row.inputTokens),
      outputTokens: tokens(row.outputTokens),
      avgCost: num(row.avgCost),
      turns: row.turns || 0,
    };
  }

  const byModel = {};
  for (const row of modelRows) {
    byModel[row.model] = {
      inputTokens: tokens(row.inputTokens),
      outputTokens: tokens(row.outputTokens),
      avgCost: num(row.avgCost),
      totalCost: num(row.totalCost),
      turns: row.turns || 0,
      lastUsed: row.lastUsed ? new Date(row.lastUsed).toISOString() : null,
    };
  }

  const t = totals || {};
  return {
    byRole,
    byModel,
    turns: t.turns || 0,
    window: ROLLING_TURNS,
    rolling: {
      turns: t.turns || 0,
      costedTurns: t.costedTurns || 0,
      avgInputTokens: tokens(t.avgInputTokens),
      avgOutputTokens: tokens(t.avgOutputTokens),
      avgCachedTokens: t.avgCachedTokens == null ? null : tokens(t.avgCachedTokens),
      // Per question, over the questions that reported a charge.
      avgCost: num(t.avgCost),
      // Every recorded call in the window, the screen included.
      totalCost: num(t.totalCost),
      since: t.since ? new Date(t.since).toISOString() : null,
      until: t.until ? new Date(t.until).toISOString() : null,
    },
  };
}

// The arithmetic lives in usage-cost.mjs, which the settings page imports in the
// browser — this module cannot go there, because it reaches Postgres. Re-exported
// so server callers have one place to import from.
export { estimateQueryCost, summariseModelCosts, formatCost } from './usage-cost.mjs';
