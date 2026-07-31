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
import { ensureUsageSchema, getSql } from '../db.js';

// Recent enough to reflect how the assistant is set up now, long enough that a
// quiet week still has something in it.
const WINDOW_DAYS = 30;

/**
 * Record one phase of one turn. Never throws and never blocks the answer: a
 * turn that cannot write its usage row is still a turn that answered the
 * question, and the estimate is worth less than the answer.
 */
export async function recordUsage({ turnId = '', role, phase, model, usage }) {
  const input = Number(usage?.inputTokens ?? usage?.promptTokens ?? 0) || 0;
  const output = Number(usage?.outputTokens ?? usage?.completionTokens ?? 0) || 0;
  if (!role || !model || (!input && !output)) return;
  try {
    await ensureUsageSchema();
    const sql = getSql();
    await sql`
      INSERT INTO ai_usage (turn_id, role, phase, model, input_tokens, output_tokens)
      VALUES (${String(turnId)}, ${String(role)}, ${String(phase || '')}, ${String(model)}, ${input}, ${output})
    `;
  } catch (e) {
    console.warn('[usage] could not record model usage:', String(e).slice(0, 140));
  }
}

/**
 * Average tokens per question, measured PER MODEL.
 *
 * Per model, not merely per role, because that is what makes the figure honest
 * when the model changes. Tokens measured on one model say nothing about the
 * next one: a terser model writes fewer, a model with a bigger appetite for
 * context reads more, and pricing yesterday's token counts at today's rate
 * quietly reports a number that was never true of either. Keyed by model, a
 * switch simply has nothing to show until it has been used — and switching back
 * finds the old measurements exactly where they were left, because nothing is
 * ever reset or deleted. The rows are the record; the page only reads them.
 *
 * Averaged over TURNS, not over rows: a role that runs twice in some turns and
 * once in others (the writer, when a claim fails checking and is repaired) must
 * report what a question costs, not what one call costs.
 */
export async function readUsageAverages() {
  await ensureUsageSchema();
  const sql = getSql();

  // What each role costs on each model it has actually run on.
  const roleRows = await sql`
    WITH per_turn AS (
      SELECT turn_id, role, model,
             SUM(input_tokens)  AS input_tokens,
             SUM(output_tokens) AS output_tokens
      FROM ai_usage
      WHERE at > now() - (${WINDOW_DAYS} || ' days')::interval AND turn_id <> ''
      GROUP BY turn_id, role, model
    )
    SELECT role, model,
           AVG(input_tokens)::float  AS "inputTokens",
           AVG(output_tokens)::float AS "outputTokens",
           COUNT(*)::int             AS turns
    FROM per_turn
    GROUP BY role, model
  `;

  // What a question costs on each model overall, whichever roles it ran. This is
  // the per-model history: it survives a change of model and comes back if that
  // model is chosen again.
  const modelRows = await sql`
    WITH per_turn AS (
      SELECT turn_id, model,
             SUM(input_tokens)  AS input_tokens,
             SUM(output_tokens) AS output_tokens,
             MAX(at)            AS at
      FROM ai_usage
      WHERE at > now() - (${WINDOW_DAYS} || ' days')::interval AND turn_id <> ''
      GROUP BY turn_id, model
    )
    SELECT model,
           AVG(input_tokens)::float  AS "inputTokens",
           AVG(output_tokens)::float AS "outputTokens",
           COUNT(*)::int             AS turns,
           MAX(at)                   AS "lastUsed"
    FROM per_turn
    GROUP BY model
  `;

  const turns = await sql`
    SELECT COUNT(DISTINCT turn_id)::int AS turns
    FROM ai_usage
    WHERE at > now() - (${WINDOW_DAYS} || ' days')::interval AND turn_id <> ''
  `;

  // role -> model -> what a question costs on it.
  const byRole = {};
  for (const row of roleRows) {
    if (!byRole[row.role]) byRole[row.role] = {};
    byRole[row.role][row.model] = {
      inputTokens: Math.round(row.inputTokens || 0),
      outputTokens: Math.round(row.outputTokens || 0),
      turns: row.turns || 0,
    };
  }

  const byModel = {};
  for (const row of modelRows) {
    byModel[row.model] = {
      inputTokens: Math.round(row.inputTokens || 0),
      outputTokens: Math.round(row.outputTokens || 0),
      turns: row.turns || 0,
      lastUsed: row.lastUsed ? new Date(row.lastUsed).toISOString() : null,
    };
  }

  return { byRole, byModel, turns: turns[0]?.turns || 0, windowDays: WINDOW_DAYS };
}

// The arithmetic lives in usage-cost.mjs, which the settings page imports in the
// browser — this module cannot go there, because it reaches Postgres. Re-exported
// so server callers have one place to import from.
export { estimateQueryCost, summariseModelCosts, formatCost } from './usage-cost.mjs';
