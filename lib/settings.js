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

export const AI_MODEL_KEY = 'ai_model';

// What the assistant runs on until someone chooses otherwise. Cheap, fast and
// vision-capable, which the ingester needs — it reads images with this model
// rather than an OCR engine.
export const DEFAULT_AI_MODEL = 'google/gemini-3.5-flash-lite';

const CACHE_MS = 10_000;
let cached = { value: '', at: 0 };

// An OpenRouter slug is "vendor/model", optionally with a variant after a colon
// ("anthropic/claude-sonnet-4.6:thinking"). Checked before a save so a typo is
// refused at the settings page rather than surfacing as a failed answer later.
export function isModelSlug(value) {
  return /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*(:[a-z0-9._-]+)?$/i.test(String(value || '').trim());
}

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
}
