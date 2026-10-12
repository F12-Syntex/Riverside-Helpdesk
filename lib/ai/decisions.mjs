// OpenRouter's decisions endpoint: a closed question, answered with a number.
//
// Everything else this app sends to OpenRouter is a chat completion — a prompt
// in, words out — and goes through lib/ai/openrouter.mjs. This is the one call
// that is not. A DECISION MODEL is handed some state and a named question with
// its two outcomes spelled out, and returns how likely the "true" outcome is:
//
//   POST /api/alpha/decisions
//   { model, state, questions: { answers: { type: 'noul', instructions,
//                                           criteria: { true, false } } } }
//   → { answers: { answers: { type: 'noul', noul: 0.94 } }, usage, provider }
//
// It writes nothing, so there is nothing to read back or to check: a number
// between 0 and 1 is the whole reply. That is what makes it the right tool for
// a yes-or-no judgement on the critical path — TypeSafe's Jev answers in about
// 300 ms warm and costs a few thousandths of a penny — and the wrong tool for
// anything a reader sees.
//
// THE SAME RETENTION RULE AS EVERY CHAT CALL, AND ONE MORE. The provider gets
// the no-retention rule from the shared module (NO_RETENTION, imported — the
// guard in test/no-reasoning.test.mjs fails the build if it is spelled out
// anywhere else), and
// `zdr: true` on top: zero data retention, which TypeSafe accepts (checked
// against the live endpoint on 2026-10-10). There is no `reasoning` field — a
// decision model does not write, so there is nothing for it to think about.
//
// NOT IN THE CHAT CATALOGUE. The decision models are not listed by OpenRouter's
// /api/v1/models (only `typesafe/jev-router`, a chat router, is), so the
// settings page cannot find them by searching that list. DECISION_MODELS below
// is what it offers instead; any other id can still be typed.
import { NO_RETENTION, openRouterHeaders, timedFetch } from './openrouter.mjs';
import { splitProviders } from '../model-id.mjs';

export const DECISIONS_URL = 'https://openrouter.ai/api/alpha/decisions';

// No retention by the provider, and none by OpenRouter either.
export const DECISION_PROVIDER = { ...NO_RETENTION, zdr: true };

// The decision models the settings page offers, with the rates OpenRouter
// charged for them on 2026-10-10 (input $0.042 per million tokens, output
// free). Kept here because the catalogue the page normally prices from does not
// carry them; a rate that moves is a line to change here, and the measured
// tokens on /settings are unaffected either way.
//
// NO "-latest" ALIAS. TypeSafe publish `typesafe/jev-latest`, but the decisions
// endpoint answered it with "Model typesafe/jev-latest does not exist" on
// 2026-10-10 while `typesafe/jev-1.13` was served. The plain version id follows
// the current 1.13 snapshot; the dated id pins one snapshot exactly.
export const DECISION_MODELS = [
  {
    id: 'typesafe/jev-1.13',
    name: 'TypeSafe Jev 1.13',
    contextLength: 32000,
    promptPerMillion: 0.042,
    completionPerMillion: 0,
    vision: false,
  },
  {
    id: 'typesafe/jev-1.13-20260917',
    name: 'TypeSafe Jev 1.13 (17 Sep 2026 snapshot)',
    contextLength: 32000,
    promptPerMillion: 0.042,
    completionPerMillion: 0,
    vision: false,
  },
];

/**
 * The request, ready for fetch. Pure, so the body — the provider rule above
 * all — is tested without a network.
 *
 * A provider pin on the model id ("typesafe/jev-1.13@typesafe") is honoured
 * the way a chat call honours one: the pin leaves the model name and becomes
 * `only`, with no fallback, and the retention rule still applies on top.
 */
export function decisionRequest(apiKey, { model, state, questions } = {}) {
  const { model: plain, providers } = splitProviders(model);
  const provider = providers.length
    ? { ...DECISION_PROVIDER, only: providers, order: providers, allow_fallbacks: false }
    : DECISION_PROVIDER;
  return [DECISIONS_URL, {
    method: 'POST',
    headers: openRouterHeaders(apiKey),
    body: JSON.stringify({ model: plain, state, questions, provider }),
  }];
}

/**
 * Ask a decision model. Returns `{ answers, usage, model, provider, id }`.
 *
 * Throws on a non-2xx reply, a reply with no answers, or no reply within
 * `timeoutMs` — the caller decides what a failure means, and for the answer
 * check it means "leave the answer alone". `signal` is an outer abort (the
 * turn's own deadline) folded in with the timeout.
 */
export async function decide({
  model,
  state,
  questions,
  timeoutMs = 3000,
  apiKey = process.env.OPENROUTER_API_KEY,
  signal = null,
  fetchImpl = timedFetch,
} = {}) {
  if (!apiKey) throw new Error('no OPENROUTER_API_KEY');
  if (!model) throw new Error('no decision model');
  const timeout = AbortSignal.timeout(timeoutMs);
  const [url, init] = decisionRequest(apiKey, { model, state, questions });
  const res = await fetchImpl(url, { ...init, signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
  let data = null;
  try { data = await res.json(); } catch (e) { /* reported below */ }
  if (!res.ok) {
    const message = data && data.error ? (data.error.message || JSON.stringify(data.error)) : '';
    throw new Error(`decision ${res.status}${message ? ': ' + String(message).slice(0, 200) : ''}`);
  }
  if (!data || !data.answers || typeof data.answers !== 'object') throw new Error('decision returned no answers');
  return {
    answers: data.answers,
    usage: data.usage || null,
    model: data.model || model,
    provider: data.provider || '',
    id: data.id || '',
  };
}

/**
 * The usage of one decision, in the shape recordUsage (lib/ai/usage.js)
 * reads, so the answer check is measured on /settings like every other role.
 */
export function decisionUsage(usage) {
  if (!usage) return null;
  const counts = {
    inputTokens: Number(usage.input_tokens ?? usage.inputTokens ?? 0) || 0,
    outputTokens: Number(usage.output_tokens ?? usage.outputTokens ?? 0) || 0,
  };
  // The charge, when the response reports one (see costOf in usage-counts.mjs).
  if (usage.cost != null) counts.cost = usage.cost;
  return counts;
}
