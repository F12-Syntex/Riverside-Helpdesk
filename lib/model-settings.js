// Which model does which job — stored, and editable at /settings.
//
// Model choice is an operational decision, not a deployment one. Swapping the
// writer for a stronger model, or the planner for a faster one, should not need
// a redeploy and a new environment variable, so the choices live in Postgres and
// the environment supplies only the defaults.
//
// Nothing here is required: with no DATABASE_URL, or no row for a role, the
// environment default applies and the pipeline behaves exactly as it did before
// this table existed.
// Explicit extension: this module is covered by node --test, which resolves
// ESM strictly and will not guess the ".js" the bundler is happy to infer.
import { getSql } from './db.js';

export const ROLE_KEYS = ['reasoning', 'fast', 'web', 'vision', 'embed'];

// What each role is for, in the words someone choosing a model needs. Sent to
// the settings page so the UI never has to hardcode any of it.
export const ROLES = [
  {
    key: 'reasoning',
    name: 'Reasoning',
    used: 'Writes the answer, and repairs it when a claim fails checking.',
    wants: 'The best model you are willing to pay for. It runs once or twice per question and is the only output a reader ever sees. Its input is deliberately kept small — only the sources actually relevant to the question reach it.',
    tunable: true,
  },
  {
    key: 'fast',
    name: 'Fast',
    used: 'Plans which searches to run, and judges whether what came back is enough.',
    wants: 'Cheap and quick. It never writes prose anyone reads — it emits a short list of search queries. Must support structured output.',
    tunable: true,
  },
  {
    key: 'web',
    name: 'Web search',
    used: 'One search of the open internet, when the practice’s own material does not cover the question.',
    wants: 'A search-grounded model — Perplexity Sonar, or any model that supports OpenRouter’s web_search tool.',
    tunable: true,
  },
  {
    key: 'vision',
    name: 'Vision',
    used: 'Reading a pasted image or screenshot, in place of the fast model for that turn.',
    wants: 'Must be vision-capable. Only runs on turns that carry an image.',
    tunable: true,
  },
  {
    key: 'embed',
    name: 'Embeddings',
    used: 'The knowledge base: indexing documents and matching a question to passages.',
    wants: 'An embedding model. Changing it invalidates the existing index — everything must be re-embedded.',
    tunable: false,
  },
];

// The environment side of the defaults. Every role falls back to
// OPENROUTER_AI_MODEL, so an install that sets only that still works.
export function envDefaults(env = process.env) {
  const chat = env.OPENROUTER_AI_MODEL || '';
  const analysis = env.OPENROUTER_ANALYSIS_MODEL || chat;
  return {
    reasoning: { model: chat, temperature: 0.2, maxOutputTokens: 4000, reasoningEffort: '' },
    fast: { model: env.OPENROUTER_RESEARCH_MODEL || analysis, temperature: 0.1, maxOutputTokens: 900, reasoningEffort: 'low' },
    web: { model: env.OPENROUTER_WEB_MODEL || env.OPENROUTER_MEDICATION_MODEL || analysis, temperature: 0.1, maxOutputTokens: 900, reasoningEffort: '' },
    vision: { model: env.OPENROUTER_VISION_MODEL || chat, temperature: 0.2, maxOutputTokens: 900, reasoningEffort: '' },
    embed: { model: env.OPENROUTER_EMBED_MODEL || 'openai/text-embedding-3-small', temperature: null, maxOutputTokens: null, reasoningEffort: '' },
  };
}

export const EFFORTS = ['', 'low', 'medium', 'high'];

// One stored row over one default. Kept pure and exported so the precedence
// rules can be tested without a database: a blank or absent field means "no
// opinion", and the default stands.
export function mergeRole(base, row) {
  const out = { ...base };
  if (!row) return out;
  const model = String(row.model || '').trim();
  if (model) out.model = model;
  const temp = Number(row.temperature);
  if (row.temperature !== null && row.temperature !== undefined && row.temperature !== '' && Number.isFinite(temp)) {
    out.temperature = Math.min(2, Math.max(0, temp));
  }
  const cap = Number(row.maxOutputTokens);
  if (row.maxOutputTokens !== null && row.maxOutputTokens !== undefined && row.maxOutputTokens !== '' && Number.isFinite(cap)) {
    out.maxOutputTokens = Math.min(32_000, Math.max(64, Math.round(cap)));
  }
  const effort = String(row.reasoningEffort || '').trim().toLowerCase();
  if (effort && EFFORTS.includes(effort)) out.reasoningEffort = effort;
  return out;
}

export function mergeModelSettings(defaults, rows = []) {
  const byRole = new Map(rows.map((r) => [String(r.role || ''), r]));
  const out = {};
  for (const key of ROLE_KEYS) out[key] = mergeRole(defaults[key], byRole.get(key));
  return out;
}

let _schemaReady = null;

export function ensureModelSettingsSchema() {
  if (_schemaReady) return _schemaReady;
  const sql = getSql();
  _schemaReady = (async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS model_settings (
        role              text PRIMARY KEY,
        model             text NOT NULL DEFAULT '',
        temperature       real,
        max_output_tokens integer,
        reasoning_effort  text NOT NULL DEFAULT '',
        updated_at        timestamptz NOT NULL DEFAULT now()
      )
    `;
  })().catch((e) => {
    // Reset so a transient failure can be retried on the next request.
    _schemaReady = null;
    throw e;
  });
  return _schemaReady;
}

export async function readModelSettingRows() {
  await ensureModelSettingsSchema();
  const sql = getSql();
  return sql`
    SELECT role, model, temperature, max_output_tokens AS "maxOutputTokens", reasoning_effort AS "reasoningEffort"
    FROM model_settings
  `;
}

export async function writeModelSettingRows(entries) {
  await ensureModelSettingsSchema();
  const sql = getSql();
  for (const entry of entries) {
    const role = String(entry?.role || '');
    if (!ROLE_KEYS.includes(role)) continue;
    const model = String(entry.model || '').trim();
    const temp = Number(entry.temperature);
    const cap = Number(entry.maxOutputTokens);
    const blank = (v) => v === '' || v === null || v === undefined;
    const effort = EFFORTS.includes(String(entry.reasoningEffort || '')) ? String(entry.reasoningEffort || '') : '';
    await sql`
      INSERT INTO model_settings (role, model, temperature, max_output_tokens, reasoning_effort, updated_at)
      VALUES (
        ${role},
        ${model},
        ${!blank(entry.temperature) && Number.isFinite(temp) ? temp : null},
        ${!blank(entry.maxOutputTokens) && Number.isFinite(cap) ? Math.round(cap) : null},
        ${effort},
        now()
      )
      ON CONFLICT (role) DO UPDATE SET
        model = EXCLUDED.model,
        temperature = EXCLUDED.temperature,
        max_output_tokens = EXCLUDED.max_output_tokens,
        reasoning_effort = EXCLUDED.reasoning_effort,
        updated_at = now()
    `;
  }
}
