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
//
// A PROVIDER PIN rides on the end of the id the same way, after an "@":
//
//     anthropic/claude-haiku-5.5@google-vertex/europe
//     openai/gpt-oss-120b:nitro@groq,cerebras
//
// That says "serve this model from these providers, in this order, and from
// nobody else" — OpenRouter's `provider.only` with fallbacks switched off. It is
// for the times WHERE a model runs matters, not just which model: a regional
// endpoint that keeps patient-adjacent text in Europe, or the one provider whose
// copy of a model is known to behave. Unlike a variant it is not sent as part
// of the model name — lib/ai/openrouter.mjs strips it off and turns it into the
// request's provider routing — but it is stored, chosen and inherited as part of
// the one string, so every role can carry its own and nothing else had to learn
// a second setting.

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
const MODEL_SLUG = /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*(:[a-z0-9._-]+)?(@[a-z0-9][a-z0-9._-]*(\/[a-z0-9][a-z0-9._-]*)?(,[a-z0-9][a-z0-9._-]*(\/[a-z0-9][a-z0-9._-]*)?)*)?$/i;
const VARIANT = /^[a-z0-9._-]+$/i;
// One OpenRouter provider slug: "groq", "google-vertex", or a provider's own
// regional or tiered endpoint, "google-vertex/europe", "deepinfra/turbo".
const PROVIDER = /^[a-z0-9][a-z0-9._-]*(\/[a-z0-9][a-z0-9._-]*)?$/i;

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
// A provider pin is carried through untouched on whichever half it lands, so a
// split and a join still round-trip an id that has one; splitProviders reads it.
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

/**
 * The provider pin, read off an id.
 *
 * "anthropic/claude-haiku-5.5@google-vertex/europe"
 *   -> { model: 'anthropic/claude-haiku-5.5', providers: ['google-vertex/europe'] }
 *
 * `model` is what OpenRouter is sent as the model name — the variant stays on
 * it, because ":nitro" IS part of the name. No pin gives an empty list, which
 * means "OpenRouter chooses", exactly as before pins existed.
 */
export function splitProviders(value) {
  const raw = String(value || '').trim();
  const at = raw.indexOf('@');
  if (at < 0) return { model: raw, providers: [] };
  const providers = raw.slice(at + 1).split(',').map((p) => p.trim()).filter(Boolean);
  return { model: raw.slice(0, at), providers };
}

/** The other direction. An empty list gives the id back with no "@". */
export function joinProviders(model, providers) {
  const m = String(model || '').trim();
  const list = (Array.isArray(providers) ? providers : String(providers || '').split(','))
    .map((p) => String(p).trim())
    .filter(Boolean);
  if (!m) return '';
  return list.length ? m + '@' + list.join(',') : m;
}

export function isProviderSlug(value) {
  return PROVIDER.test(String(value || '').trim());
}

/**
 * Why an id is not one, in a sentence a person can act on — '' when it is.
 *
 * The settings page puts this under a field that isModelSlug has refused, so
 * the person is told WHAT to change rather than only that something is wrong.
 * It never disagrees with isModelSlug: '' comes back exactly when the id is
 * valid (or blank, which is the caller's to allow or refuse — a blank role
 * inherits, a blank Reasoning cannot), and every other id gets a reason, so
 * the field and the save always agree. Case is not checked: isModelSlug lets
 * capitals through, and so does this.
 */
export function modelIdProblem(value) {
  const v = String(value || '').trim();
  if (!v || isModelSlug(v)) return '';
  // Something typed to search the list, left in the field.
  if (!v.includes('/')) return 'Not an id yet. Pick a model from the list, or type it in full as vendor/model.';
  if (/\s/.test(v)) return 'An id has no spaces in it.';
  const odd = v.match(/[^a-z0-9._\-/:@,]/i);
  if (odd) return '“' + odd[0] + '” cannot go in an id: letters, numbers, dots, dashes and underscores only.';

  const at = v.indexOf('@');
  const head = at < 0 ? v : v.slice(0, at);
  const pin = at < 0 ? null : v.slice(at + 1);
  if (head.includes(',')) return 'A comma only goes between providers, after the @.';
  const colon = head.indexOf(':');
  const name = colon < 0 ? head : head.slice(0, colon);
  const variant = colon < 0 ? null : head.slice(colon + 1);
  const slash = name.indexOf('/');
  if (slash < 0) return 'The slash comes before the colon: vendor/model:variant.';
  const vendor = name.slice(0, slash);
  const model = name.slice(slash + 1);
  if (!vendor) return 'The vendor goes before the slash: vendor/model.';
  if (!model) return 'The model’s name goes after the slash: vendor/model.';
  if (model.includes('/')) return 'Only one slash, between the vendor and the model.';
  if (!/^[a-z0-9]/i.test(vendor) || !/^[a-z0-9]/i.test(model)) return 'The vendor and the model each start with a letter or a number.';
  if (variant !== null) {
    if (!variant) return 'Nothing after the colon. Add a variant such as :nitro, or take the colon out.';
    if (variant.includes(':')) return 'Only one :variant to an id.';
    if (variant.includes('/')) return 'A variant has no slash in it.';
  }
  if (pin !== null) {
    if (pin.includes(':')) return 'The :variant goes before the @provider.';
    const providers = pin.split(',');
    if (providers.some((p) => !p)) return 'A provider is missing after the @ or a comma.';
    const wrong = providers.find((p) => !isProviderSlug(p));
    if (wrong) return '“' + wrong + '” is not a provider. It looks like groq, or google-vertex/europe.';
  }
  return 'That does not look like vendor/model.';
}
