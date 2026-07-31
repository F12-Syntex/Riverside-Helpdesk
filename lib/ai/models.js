// Which model runs which phase, resolved for one request.
//
// An agent turn is not one model answering a question. It is several jobs with
// very different requirements, and paying the top model for all of them is what
// makes a turn cost what it costs:
//
//   FAST      — plan the searches, then judge whether what came back is enough.
//               Two short structured calls whose output no reader ever sees.
//   REASONING — write the answer from the selected sources, quoting them
//               exactly, and repair it if a claim fails checking. The only
//               phase whose output is shown, so it gets the best model — and
//               the smallest, most relevant input we can give it.
//   VISION    — stands in for FAST on a turn that carries an image.
//   WEB       — one search-grounded call, when the practice's own material does
//               not cover the question.
//   EMBED     — the knowledge base.
//
// Defaults come from the environment; /settings overrides them per role in
// Postgres (lib/model-settings.js). With no database and no overrides the
// environment alone decides, exactly as before.
import { envDefaults, mergeModelSettings, readModelSettingRows, ROLE_KEYS } from '../model-settings.js';

// Settings are read per request, so a change at /settings takes effect without a
// redeploy. Cached briefly so a busy turn does not make five identical queries.
const CACHE_MS = 10_000;
let _cache = null;

export function invalidateModelSettings() {
  _cache = null;
}

// Environment only. For background code that must stay synchronous and does not
// need the per-role overrides.
export function modelConfig() {
  const roles = envDefaults();
  return {
    apiKey: process.env.OPENROUTER_API_KEY || '',
    chat: roles.reasoning.model,
    analysis: roles.fast.model,
    web: roles.web.model,
    embed: roles.embed.model,
  };
}

// The real resolution: environment defaults with the stored overrides applied.
// A database that is missing or unreachable is not an error — model choice
// falls back to the environment rather than failing the question.
export async function resolveModels() {
  const now = Date.now();
  if (_cache && now - _cache.at < CACHE_MS) return _cache.value;

  const defaults = envDefaults();
  let roles = mergeModelSettings(defaults, []);
  let stored = false;
  try {
    const rows = await readModelSettingRows();
    roles = mergeModelSettings(defaults, rows);
    stored = true;
  } catch (e) {
    console.warn('[models] stored model settings unavailable, using environment defaults:', String(e).slice(0, 140));
  }

  const value = {
    apiKey: process.env.OPENROUTER_API_KEY || '',
    roles,
    stored,
    defaults,
    // The role that reads a turn's images. Only turns carrying one pay for it.
    plannerFor: (imageCount = 0) => (imageCount > 0 ? roles.vision : roles.fast),
  };
  _cache = { at: now, value };
  return value;
}

// Options an AI SDK call takes for a role. Reasoning effort is only sent when a
// role actually sets one — an empty string would be rejected by some providers.
export function callOptions(role) {
  const opts = {};
  if (Number.isFinite(role?.temperature)) opts.temperature = role.temperature;
  if (Number.isFinite(role?.maxOutputTokens)) opts.maxOutputTokens = role.maxOutputTokens;
  if (role?.reasoningEffort) {
    opts.providerOptions = { openrouter: { reasoning: { effort: role.reasoningEffort } } };
  }
  return opts;
}

export { ROLE_KEYS };

// Per-phase token accounting, logged at the end of a turn. Without it there is
// no way to tell whether a change made the pipeline cheaper or merely different.
export function createUsageLog(label = 'agent') {
  const phases = [];
  return {
    add(phase, model, usage) {
      phases.push({
        phase,
        model,
        input: usage?.inputTokens ?? usage?.promptTokens ?? 0,
        output: usage?.outputTokens ?? usage?.completionTokens ?? 0,
      });
    },
    summary() {
      const input = phases.reduce((n, p) => n + p.input, 0);
      const output = phases.reduce((n, p) => n + p.output, 0);
      return { calls: phases.length, input, output, phases };
    },
    report() {
      const { calls, input, output, phases: rows } = this.summary();
      const detail = rows.map((p) => `${p.phase}[${p.model}] ${p.input}in/${p.output}out`).join('  ');
      console.log(`[${label}] ${calls} model call(s), ${input} in / ${output} out — ${detail}`);
    },
  };
}
