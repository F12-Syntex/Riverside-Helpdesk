// An OpenRouter model id, and the routing variant that can be pinned to it.
//
// "openai/gpt-oss-120b" names the model. The optional suffix after the colon
// tells OpenRouter HOW to serve it: ":nitro" routes to the fastest provider
// serving that model, ":floor" to the cheapest, ":free" to a free endpoint
// where one exists, ":online" adds web search to every call. Several models
// also publish their own suffixes (":thinking", ":extended", ":exacto").
//
// The suffix is part of the id that is stored and sent, so a variant is not a
// second setting — it is the same one string, split for editing and joined
// again for saving. Pure string handling with no database or network imports,
// so the settings page can use it in the browser and lib/settings.js on the
// server.

// The suffixes worth offering as a button. Anything else can still be typed —
// this list is a shortcut, not the vocabulary.
export const MODEL_VARIANTS = [
  { id: '', label: 'Default', hint: 'OpenRouter chooses the provider' },
  { id: 'nitro', label: ':nitro', hint: 'Fastest provider serving this model' },
  { id: 'floor', label: ':floor', hint: 'Cheapest provider serving this model' },
  { id: 'free', label: ':free', hint: 'A free endpoint, where the model has one' },
  { id: 'online', label: ':online', hint: 'Adds web search to every call' },
];

// vendor/model, optionally with one variant after a colon. Checked before a
// save so a typo is refused on the settings page rather than surfacing as a
// failed answer later.
const MODEL_SLUG = /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*(:[a-z0-9._-]+)?$/i;
const VARIANT = /^[a-z0-9._-]+$/i;

export function isModelSlug(value) {
  return MODEL_SLUG.test(String(value || '').trim());
}

// The empty variant is valid: it means "no suffix", which is how most ids are
// written.
export function isModelVariant(value) {
  const v = String(value || '').trim().replace(/^:+/, '');
  return v === '' || VARIANT.test(v);
}

/** "openai/gpt-oss-120b:nitro" -> { base: 'openai/gpt-oss-120b', variant: 'nitro' }. */
export function splitModelId(value) {
  const raw = String(value || '').trim();
  const at = raw.indexOf(':');
  if (at < 0) return { base: raw, variant: '' };
  return { base: raw.slice(0, at), variant: raw.slice(at + 1) };
}

/** The other direction. A blank variant gives the plain id back, with no colon. */
export function joinModelId(base, variant) {
  const b = String(base || '').trim();
  const v = String(variant || '').trim().replace(/^:+/, '');
  if (!b) return '';
  return v ? b + ':' + v : b;
}

/** What a variant does, for the line under the picker. '' for one we don't know. */
export function variantHint(variant) {
  const v = String(variant || '').trim().replace(/^:+/, '');
  const known = MODEL_VARIANTS.find((item) => item.id === v);
  return known ? known.hint : '';
}
