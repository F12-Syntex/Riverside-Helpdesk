// Runtime settings, kept in the database rather than the environment.
//
// The AI model used to come from OPENROUTER_AI_MODEL, which made changing it a
// redeploy and put it out of reach of everyone except whoever holds the hosting
// account. It now lives in one row of app_settings and is changed from
// /settings, so the practice can move between models — a cheaper one for the
// quiet weeks, a stronger one when the answers matter — with no deploy at all.
//
// Every AI route asks for it through getAiModel(). The value is cached in the
// process for a few seconds so a single request that makes several model calls
// does not make several database round trips for the same string; a save clears
// the cache immediately, so a change takes effect on the very next request in
// that process and within seconds everywhere else.
import { ensureSettingsSchema, getSql } from './db.js';
import { isModelSlug } from './model-id.mjs';

export const AI_MODEL_KEY = 'ai_model';

// What the assistant runs on until someone chooses otherwise. Cheap, fast and
// vision-capable, which the ingester needs — it reads images with this model
// rather than an OCR engine.
export const DEFAULT_AI_MODEL = 'google/gemini-3.5-flash-lite';

const CACHE_MS = 10_000;
let cached = { value: '', at: 0 };

// An OpenRouter slug is "vendor/model", optionally with a routing variant after
// a colon ("openai/gpt-oss-120b:nitro"). Both live in lib/model-id.mjs, which
// has no database import, so the settings page can validate in the browser with
// exactly the rule the save uses here. Re-exported so every existing caller
// (and its tests) keeps importing it from the settings module.
export { isModelSlug };

async function readStored() {
  await ensureSettingsSchema();
  const sql = getSql();
  const rows = await sql`SELECT value, updated_at AS "updatedAt" FROM app_settings WHERE key = ${AI_MODEL_KEY}`;
  const row = rows[0];
  const value = String(row?.value || '').trim();
  return { value: isModelSlug(value) ? value : '', updatedAt: row?.updatedAt || null };
}

/**
 * The model every AI route runs on.
 *
 * Falls back to the default rather than throwing: a database that is briefly
 * unreachable must not take the assistant down with it, and the default is a
 * real, working model rather than a placeholder.
 */
export async function getAiModel() {
  if (cached.value && Date.now() - cached.at < CACHE_MS) return cached.value;
  try {
    const { value } = await readStored();
    cached = { value: value || DEFAULT_AI_MODEL, at: Date.now() };
  } catch (e) {
    console.warn('[settings] could not read the AI model, using the default:', String(e).slice(0, 160));
    cached = { value: DEFAULT_AI_MODEL, at: Date.now() };
  }
  return cached.value;
}

// The model plus where it came from, for the settings page: "default" means
// nobody has chosen one yet, and the page says so rather than presenting the
// fallback as a deliberate choice.
export async function getAiModelSetting() {
  const { value, updatedAt } = await readStored();
  return {
    model: value || DEFAULT_AI_MODEL,
    defaultModel: DEFAULT_AI_MODEL,
    source: value ? 'database' : 'default',
    updatedAt: updatedAt ? new Date(updatedAt).toISOString() : null,
  };
}

export async function setAiModel(value) {
  const model = String(value || '').trim();
  if (!isModelSlug(model)) throw new Error('That is not an OpenRouter model id — it should look like "vendor/model".');
  await ensureSettingsSchema();
  const sql = getSql();
  await sql`
    INSERT INTO app_settings (key, value, updated_at) VALUES (${AI_MODEL_KEY}, ${model}, now())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
  `;
  cached = { value: model, at: Date.now() };
  return model;
}

// Used by the settings route after a save, and by tests.
export function clearSettingsCache() {
  cached = { value: '', at: 0 };
  roleCache = { value: null, at: 0 };
}

/* ------------------------------------------------------------------ *
 * Model roles
 *
 * Answering a question is not one model doing one job. The research loop
 * decides which source to open and writes nothing anyone reads; the writer
 * turns those sources into the answer and is the only output a reader sees;
 * the web search wants a model that is good at searching, which is a different
 * thing again. Paying the writer's rate for all of them is most of what a turn
 * costs, and the best writer is not automatically the best searcher.
 *
 * So the model above is the REASONING role, and the others sit beside it in the
 * same app_settings table. Every one of them is optional: an unset role falls
 * back to the environment variable that used to carry it, and then to the
 * reasoning model — so an install that has only ever chosen one model is
 * completely unaffected.
 * ------------------------------------------------------------------ */

// There is no vision role. Every model worth choosing here reads images, and a
// separate one only bought a second model to keep an eye on.
export const ROLE_KEYS = ['reasoning', 'fast', 'web'];

export const ROLES = [
  {
    key: 'reasoning',
    name: 'Reasoning',
    used: 'Researches the question and writes the answer.',
    wants: 'The model the practice runs on, chosen above. The roles below only override the jobs it is not the best fit for.',
  },
  {
    key: 'fast',
    name: 'Fast',
    used: 'Short background jobs: summarising a source, extracting claims, condensing a query.',
    wants: 'Cheap and quick. Nothing it writes is ever shown to a reader.',
  },
  {
    key: 'web',
    name: 'Web search',
    used: 'Searching the open internet, and reading a page to lift a phone number off it.',
    wants: 'A search-grounded model — perplexity/sonar and its siblings are built for exactly this.',
  },
];

// One app_settings row per overridden role. The reasoning role IS ai_model, so
// it has no separate key — that would be two places to set one thing.
export const ROLE_SETTING_KEY = { fast: 'ai_model_fast', web: 'ai_model_web' };

// Pure, and exported for tests: what each role runs on. Precedence is the stored
// setting, then the environment variable that used to carry it, then the
// reasoning model — so nothing has to be set for everything to work.
export function resolveRoles({ base, stored = {}, env = {} }) {
  const pick = (role, ...fallbacks) => {
    const chosen = String(stored[role] || '').trim();
    if (chosen && isModelSlug(chosen)) return { model: chosen, source: 'database' };
    for (const value of fallbacks) {
      const slug = String(value || '').trim();
      if (slug) return { model: slug, source: 'environment' };
    }
    return { model: base, source: 'reasoning' };
  };
  return {
    reasoning: { model: base, source: 'reasoning' },
    fast: pick('fast', env.OPENROUTER_ANALYSIS_MODEL),
    web: pick('web', env.OPENROUTER_WEB_MODEL, env.OPENROUTER_MEDICATION_MODEL, env.OPENROUTER_ANALYSIS_MODEL),
  };
}

let roleCache = { value: null, at: 0 };

async function readStoredRoles() {
  await ensureSettingsSchema();
  const sql = getSql();
  const keys = Object.values(ROLE_SETTING_KEY);
  const rows = await sql`SELECT key, value FROM app_settings WHERE key = ANY(${keys})`;
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const stored = {};
  for (const [role, key] of Object.entries(ROLE_SETTING_KEY)) stored[role] = byKey.get(key) || '';
  return stored;
}

/**
 * What every phase of a turn runs on. Cached for the same few seconds as the
 * model itself, and degraded the same way: a database that is briefly away
 * leaves every role on the reasoning model rather than failing the question.
 */
export async function getModelRoles() {
  if (roleCache.value && Date.now() - roleCache.at < CACHE_MS) return roleCache.value;
  const base = await getAiModel();
  let stored = {};
  try {
    stored = await readStoredRoles();
  } catch (e) {
    console.warn('[settings] could not read the model roles, using the reasoning model for all:', String(e).slice(0, 160));
  }
  const value = resolveRoles({ base, stored, env: process.env });
  roleCache = { value, at: Date.now() };
  return value;
}

// For the settings page: what is stored, kept separate from what it resolves to,
// so the page can show an empty box that plainly inherits rather than a value
// somebody thinks they chose.
export async function getModelRoleSettings() {
  const base = await getAiModel();
  const stored = await readStoredRoles();
  return { base, stored, resolved: resolveRoles({ base, stored, env: process.env }), roles: ROLES };
}

export async function setModelRole(role, value) {
  const key = ROLE_SETTING_KEY[role];
  if (!key) throw new Error('There is no model role called "' + role + '".');
  const model = String(value || '').trim();
  if (model && !isModelSlug(model)) {
    throw new Error('That is not an OpenRouter model id — it should look like "vendor/model".');
  }
  await ensureSettingsSchema();
  const sql = getSql();
  // Clearing a role deletes the row rather than storing a blank: an absent row
  // is what "inherit" means everywhere else here.
  if (!model) await sql`DELETE FROM app_settings WHERE key = ${key}`;
  else {
    await sql`
      INSERT INTO app_settings (key, value, updated_at) VALUES (${key}, ${model}, now())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
    `;
  }
  roleCache = { value: null, at: 0 };
  return model;
}
