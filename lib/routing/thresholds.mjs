// The router's thresholds, kept in app_settings so they tune without a redeploy.
//
// The three numbers below decide whether a question is answered from the
// trigger index without a model call, asked back about, or handed to the
// picker as before. They were guessed in a sandbox, not measured, and the only
// honest way to set them is against real questions in a quiet week — so they
// live beside the model choice in app_settings and change from /settings, and
// the master switch defaults to OFF: the router ships wired up and doing
// nothing until somebody turns it on and watches the fall-through rate.
//
// Same cache discipline as lib/settings.js: read once per few seconds per
// process, cleared on save, so a turn that asks twice does not query twice.
import { ensureSettingsSchema, getSql } from '../db.js';

export const ROUTING_SETTING_KEYS = Object.freeze({
  enabled: 'routing_enabled',
  hitCos: 'routing_hit_cos',
  askCos: 'routing_ask_cos',
  minMargin: 'routing_min_margin',
});

// Starting values. HIT_COS is deliberately conservative: a wrong page rendered
// confidently looks complete and authoritative, with no gaps section to tip
// the reader off, which is a worse failure than "I do not know".
export const DEFAULT_THRESHOLDS = Object.freeze({
  enabled: false,
  hitCos: 0.82,
  askCos: 0.70,
  minMargin: 0.15,
});

const CACHE_MS = 10_000;
let cache = { value: null, at: 0 };

const TRUE_WORDS = new Set(['1', 'true', 'on', 'yes']);

function unit(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : fallback;
}

/**
 * The thresholds as a plain object, from whatever was stored. Unknown or
 * malformed values fall back to the defaults field by field rather than
 * failing the whole read — a typo in one number must not switch the router on
 * or off.
 */
export function thresholdsFrom(stored = {}, base = DEFAULT_THRESHOLDS) {
  const enabledRaw = stored[ROUTING_SETTING_KEYS.enabled];
  return {
    enabled: enabledRaw == null || enabledRaw === '' ? base.enabled : TRUE_WORDS.has(String(enabledRaw).trim().toLowerCase()),
    hitCos: unit(stored[ROUTING_SETTING_KEYS.hitCos], base.hitCos),
    askCos: unit(stored[ROUTING_SETTING_KEYS.askCos], base.askCos),
    minMargin: unit(stored[ROUTING_SETTING_KEYS.minMargin], base.minMargin),
  };
}

/**
 * Check a proposed set of thresholds. Throws with a message the settings page
 * can show. `hitCos >= askCos` is the one relation that has to hold: a hit is a
 * confident match, and a match confident enough to render cannot be less
 * confident than one that only earns a question back.
 */
export function validateThresholds(next) {
  for (const key of ['hitCos', 'askCos', 'minMargin']) {
    const n = Number(next[key]);
    if (!Number.isFinite(n) || n < 0 || n > 1) throw new Error(`routing ${key} must be a number between 0 and 1.`);
  }
  if (Number(next.hitCos) < Number(next.askCos)) throw new Error('routing hitCos must not be below askCos.');
  if (typeof next.enabled !== 'boolean') throw new Error('routing enabled must be true or false.');
  return next;
}

export async function getRoutingThresholds() {
  if (cache.value && Date.now() - cache.at < CACHE_MS) return cache.value;
  try {
    await ensureSettingsSchema();
    const sql = getSql();
    const keys = Object.values(ROUTING_SETTING_KEYS);
    const rows = await sql`SELECT key, value FROM app_settings WHERE key = ANY(${keys})`;
    const stored = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    cache = { value: thresholdsFrom(stored), at: Date.now() };
  } catch (e) {
    // A database that cannot be read leaves the router OFF, which is exactly
    // current behaviour — never a reason a question goes unanswered.
    console.warn('[routing] could not read the thresholds, router off:', String(e).slice(0, 160));
    cache = { value: { ...DEFAULT_THRESHOLDS, enabled: false }, at: Date.now() };
  }
  return cache.value;
}

/** Save some or all of the thresholds. Fields left out keep their stored value. */
export async function setRoutingThresholds(partial = {}) {
  const current = await getRoutingThresholds();
  const next = validateThresholds({
    enabled: typeof partial.enabled === 'boolean' ? partial.enabled : current.enabled,
    hitCos: partial.hitCos == null ? current.hitCos : Number(partial.hitCos),
    askCos: partial.askCos == null ? current.askCos : Number(partial.askCos),
    minMargin: partial.minMargin == null ? current.minMargin : Number(partial.minMargin),
  });
  await ensureSettingsSchema();
  const sql = getSql();
  const rows = [
    [ROUTING_SETTING_KEYS.enabled, next.enabled ? '1' : '0'],
    [ROUTING_SETTING_KEYS.hitCos, String(next.hitCos)],
    [ROUTING_SETTING_KEYS.askCos, String(next.askCos)],
    [ROUTING_SETTING_KEYS.minMargin, String(next.minMargin)],
  ];
  for (const [key, value] of rows) {
    await sql`
      INSERT INTO app_settings (key, value, updated_at) VALUES (${key}, ${value}, now())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
    `;
  }
  cache = { value: null, at: 0 };
  return next;
}

export function clearRoutingThresholdsCache() {
  cache = { value: null, at: 0 };
}
