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
    // The images role's own fallback, so the settings page can caption an empty
    // Images box with the model it actually resolves to.
    defaultImagesModel: DEFAULT_IMAGES_MODEL,
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
 * Answering a question is not one model doing one job. It splits cleanly in two:
 * READING — searching the practice's material, skimming what comes back,
 * choosing the next file to open, pulling names out of a pasted list,
 * transcribing a screenshot — and DECIDING, which means the answer itself and
 * every judgement inside it. The reading is most of the calls and none of the
 * output; the deciding is one call and all of it.
 *
 * So the reading runs on the FAST role and the deciding on the REASONING role,
 * and the web search wants a model that is good at searching, which is a
 * different thing again. Paying the writer's rate for the reading is most of
 * what a turn costs, and the best writer is not automatically the best searcher.
 *
 * So the model above is the REASONING role, and the others sit beside it in the
 * same app_settings table. Every one of them is optional: an unset role falls
 * back to the environment variable that used to carry it, and then to the
 * reasoning model — so an install that has only ever chosen one model is
 * completely unaffected.
 * ------------------------------------------------------------------ */

// THERE IS AN IMAGES ROLE NOW, AND IT DOES NOT INHERIT.
//
// There was deliberately none: every model worth choosing read images, so a
// separate one only bought a second model to keep an eye on. What changed is
// that a screenshot became an everyday input rather than an occasional one — a
// repeat-medication screen pasted in to be formatted for AccurX is a picture
// and nothing else — and the model that is right for READING A PICTURE is not
// the model that is right for writing an answer. So a message with an image on
// it runs on this role instead, whichever path it takes: a command, the
// template picker, or prose.
//
// It falls back to ITS OWN DEFAULT rather than to the reasoning model, which
// makes it the one role that does. A practice that has chosen a text-only
// model above must still be able to paste a screenshot, and inheriting would
// have sent the picture to a model that cannot see it.
export const ROLE_KEYS = ['reasoning', 'fast', 'web', 'accurx', 'superSpeed', 'images'];

// Small, quick and sees pictures. Used for nothing but a message that carries
// one, so a wrong choice here costs a screenshot and never an answer.
export const DEFAULT_IMAGES_MODEL = 'mistralai/ministral-14b-2512';

export const ROLES = [
  {
    key: 'reasoning',
    name: 'Reasoning',
    used: 'Decides and writes: the answer, and every judgement in it.',
    // The answer is ALWAYS written here, and that is deliberate: writing is the
    // one job that needs the whole context held at once, which is what this
    // model is chosen for. The other roles take work away from it; they never
    // take the writing off it.
    wants: 'The model the practice runs on, chosen above. Every answer is written by this model — the roles below only take the reading and the searching off it.',
  },
  {
    key: 'fast',
    name: 'Fast',
    used: 'Reads and searches: the research loop that finds the sources, plus background jobs — extracting claims, pulling names out of a pasted list, transcribing a screenshot.',
    wants: 'Cheap and quick, and able to call tools reliably — the research loop is nothing but tool calls. Nothing it writes is ever shown to a reader.',
  },
  {
    key: 'web',
    name: 'Web search',
    used: 'Searching the open internet, and reading a page to lift a phone number off it.',
    wants: 'A search-grounded model — perplexity/sonar and its siblings are built for exactly this.',
  },
  {
    key: 'accurx',
    name: 'AccurX routing',
    // The one role whose job is a JUDGEMENT about a patient rather than reading
    // or extraction, which is why it is worth being able to set on its own. An
    // AccurX message is the longest thing anybody pastes in and the one where
    // the patterns are least likely to have the whole picture: they match words,
    // and a post-miscarriage patient with a headache, two swollen legs and
    // dizziness is a picture rather than a word.
    used: 'Reading a pasted /accurx request against the practice’s own routing pages and saying where it goes. It can only ever send something to a MORE senior destination than the patterns already chose — never a less senior one.',
    wants: 'A model that reasons about what it is reading rather than matching it. This is the one role where paying more buys something a receptionist would notice.',
  },
  {
    key: 'superSpeed',
    name: 'Super speed',
    // THE ONLY ROLE THAT RUNS BEFORE THE MESSAGE IS SENT, AND THE ONLY ONE A
    // READER WAITS ON WITH NOTHING ON THE SCREEN YET. Every other call in this
    // app happens after the question has gone up and while a card is already
    // filling in; this one holds the send. That is the whole reason it is a role
    // of its own rather than another job for `fast`: the model chosen here is
    // chosen for how quickly it answers, and the practice can put the quickest
    // thing OpenRouter serves on it without that choice reaching anything else.
    used: 'Checking a message for patient details BEFORE it is sent, and stopping it if there are any. One yes-or-no per message, on the critical path — nothing it returns is ever shown as an answer.',
    wants: 'The fastest model available, not the cleverest. It answers one closed question with one word, and every millisecond it takes is a millisecond somebody spends looking at a message they have already finished typing.',
  },
  {
    key: 'images',
    name: 'Images',
    // THE ONLY ROLE WITH A DEFAULT OF ITS OWN. Every other role inherits when
    // it is blank; this one falls back to a model chosen for seeing pictures,
    // because the model above may not be able to — and a screenshot sent to a
    // text-only model is a turn that fails rather than a turn that degrades.
    used: 'Any message with an image attached: a screenshot of the repeat-medication screen to format for AccurX, a photo of a letter, a picture of a form. Whichever path the message takes — a command, the template picker, or prose — the picture is read here.',
    wants: 'A model that reads a screenshot accurately and quickly. It is only ever asked to transcribe what it can see, so a small vision model is the right size.',
  },
];

// One app_settings row per overridden role. The reasoning role IS ai_model, so
// it has no separate key — that would be two places to set one thing.
export const ROLE_SETTING_KEY = {
  fast: 'ai_model_fast',
  web: 'ai_model_web',
  accurx: 'ai_model_accurx',
  superSpeed: 'ai_model_super_speed',
  images: 'ai_model_images',
};

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
  const fast = pick('fast', env.OPENROUTER_ANALYSIS_MODEL);
  return {
    reasoning: { model: base, source: 'reasoning' },
    fast,
    web: pick('web', env.OPENROUTER_WEB_MODEL, env.OPENROUTER_MEDICATION_MODEL, env.OPENROUTER_ANALYSIS_MODEL),
    // ACCURX INHERITS FROM FAST, NOT FROM REASONING. Every other role falls back
    // to the model the practice runs on; this one falls back to whatever is
    // already doing the reading, so adding the role changes nothing about what
    // /accurx costs or which model answers it until somebody deliberately sets
    // it. The row exists so that it CAN be set — the routing judgement is the
    // one place in the app where a better model is worth buying on its own.
    accurx: (() => {
      const chosen = pick('accurx', env.OPENROUTER_ACCURX_MODEL);
      return chosen.source === 'reasoning' ? { model: fast.model, source: 'fast' } : chosen;
    })(),
    // SUPER SPEED INHERITS FROM FAST TOO, for a different reason from accurx.
    // That one falls back to fast so a better model can be bought for one
    // judgement; this one does it because the reasoning model is the WRONG
    // default for it. The screen holds the send, so an install that has chosen a
    // large, careful, slow model above would otherwise have put that model in
    // front of every message anybody types. Whatever is already doing the quick
    // work is the right starting point, and the row exists so a practice can put
    // something quicker still on it.
    superSpeed: (() => {
      const chosen = pick('superSpeed', env.OPENROUTER_SUPER_SPEED_MODEL);
      return chosen.source === 'reasoning' ? { model: fast.model, source: 'fast' } : chosen;
    })(),
    // IMAGES FALLS BACK TO ITS OWN DEFAULT, NOT TO ANY OTHER ROLE. The model
    // chosen above may be text-only, and a picture sent to it is a failed turn.
    // So an unset images role is a small vision model rather than "whatever is
    // answering" — see DEFAULT_IMAGES_MODEL.
    images: (() => {
      const chosen = pick('images', env.OPENROUTER_IMAGES_MODEL);
      return chosen.source === 'reasoning' ? { model: DEFAULT_IMAGES_MODEL, source: 'default' } : chosen;
    })(),
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
