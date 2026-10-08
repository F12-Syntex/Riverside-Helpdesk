// One place that owns the shape of an OpenRouter request.
//
// Every model call in this app has to carry two things, and neither is
// negotiable:
//
//   provider  { data_collection: 'deny' }         — the question and the
//               practice's own text are never stored by the model provider.
//   reasoning { enabled: false, exclude: true }   — no extended thinking.
//
// Both were copied by hand into a dozen call sites, each with its own private
// NO_RETENTION constant and its own hand-built body, and the predictable thing
// happened: the retention flag made it everywhere and the reasoning flag reached
// two of them. Signposting, the reason for appointment, the filing title, the
// medication check, the rota, the Notebook tools and claim extraction were all
// paying for a model to deliberate before answering.
//
// WHY REASONING IS OFF, EVERYWHERE. Nothing this app asks a model to do is a
// puzzle. The thinking has already been done — by the staff who wrote the
// Notebook, and by the prompts, which pin down the shape of the answer, and by
// the code, which checks every claim against its source afterwards. What is left
// for the model is to read what it has been handed and write it out. On a model
// that thinks first, that deliberation is most of what a receptionist waits for,
// paid on every single request, for work that was already settled before the
// call was made. Models that always reason ignore the flag; the rest answer
// straight away.
//
// So the shape lives here and the flags are stamped LAST, after whatever the
// caller passed, which makes them impossible to override by accident. A call
// site that wants a different temperature or a longer max_tokens says so; a call
// site cannot say "and think about it first", because there is no reason it
// should want to.

import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { splitProviders } from '../model-id.mjs';

export const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Only providers that do not retain prompt data.
//
// Deliberately NOT `require_parameters: true`. That looks like the right guard
// — it makes OpenRouter refuse a provider that cannot honour the request — but
// it applies to every parameter, including the reasoning setting below, and
// several endpoints mandate reasoning. Turning it on left zero eligible
// endpoints for every model tried, including the app's own default.
export const NO_RETENTION = { data_collection: 'deny' };

// As little reasoning as the endpoint will allow. See above — a speed decision
// made once for the whole app, not a default for a call site to weigh.
//
// It asks for MINIMAL EFFORT rather than `enabled: false`, and the difference is
// not cosmetic. A growing number of endpoints mandate reasoning and reject an
// explicit disable outright:
//
//     "Reasoning is mandatory for this endpoint and cannot be disabled."
//
// Every call carrying `enabled: false` to one of those fails — not degrades,
// fails — and in this app that surfaced as every answer quietly falling back to
// prose. Google's flash-lite, the app's own default, was among the endpoints
// refusing it. `effort: 'minimal'` is accepted everywhere tried and buys the
// same thing: the least deliberation the provider offers, with the reasoning
// tokens excluded from the response so nobody pays to read them.
export const NO_REASONING = { effort: 'minimal', exclude: true };

// EXCEPT ON CLAUDE, WHERE "MINIMAL" MEANS "ON".
//
// Minimal effort is the floor on a model that always thinks. On a model whose
// thinking is OFF unless asked for, it is the ask: OpenRouter turns any effort
// level into an Anthropic thinking budget, and the smallest budget Anthropic
// takes is 1,024 tokens. So every Claude call this app made — the picker, the
// answer, the screen before the send — was paying for up to a thousand tokens
// of deliberation the flag was written to prevent, on a model that would
// otherwise have answered straight away. The same question asked of Haiku
// directly, with no reasoning field, came back in seconds.
//
// So a Claude model gets NO reasoning field at all, which is its own default:
// no thinking. Claude never mandates reasoning, so there is no endpoint to
// refuse the omission the way flash-lite refused `enabled: false`. A practice
// that wants Claude to think picks a variant that says so (":thinking").
const THINKS_ONLY_WHEN_ASKED = /^anthropic\//i;

/** The reasoning setting for one model id, or null to send none. */
export function reasoningFor(model) {
  return THINKS_ONLY_WHEN_ASKED.test(String(model || '').trim()) ? null : NO_REASONING;
}

// `title` is what shows against the call on OpenRouter's own dashboard, so the
// medication check and the rota generator stay tellable apart from the Q&A.
export function openRouterHeaders(apiKey, title = 'Riverside Practice Q&A') {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': 'https://riverside-practice.local',
    'X-Title': title,
  };
}

/**
 * The provider routing for one model id.
 *
 * A plain id gets the no-retention rule and nothing else — OpenRouter chooses
 * among the providers that honour it. An id with a provider pin
 * ("anthropic/claude-haiku-5.5@google-vertex/europe", see lib/model-id.mjs) is
 * served by those providers, in that order, and by nobody else: `only` keeps
 * the rest out, `order` tries the list as written, and `allow_fallbacks: false`
 * stops OpenRouter reaching past it when they are all busy. A pinned call that
 * cannot be served FAILS rather than quietly landing somewhere it was pinned
 * away from — the point of a pin is that it holds.
 *
 * The no-retention rule still applies on top of a pin. A pinned provider that
 * keeps prompts is not made acceptable by being named: the request finds no
 * eligible endpoint and says so.
 */
export function providerRouting(model) {
  const { providers } = splitProviders(model);
  if (!providers.length) return NO_RETENTION;
  return { ...NO_RETENTION, only: providers, order: providers, allow_fallbacks: false };
}

/**
 * The body of a chat completion request.
 *
 * Pass whatever the call needs — model, messages, temperature, max_tokens,
 * response_format, tools. The retention and reasoning settings are applied on
 * top and cannot be overridden. A provider pin on the model id is taken off the
 * model name and sent as routing instead.
 */
export function chatBody(fields = {}) {
  const reasoning = reasoningFor(fields.model);
  const pinned = { ...fields, provider: providerRouting(fields.model), reasoning };
  // No field at all, rather than null: a caller's own `reasoning` is still
  // dropped, so it cannot switch thinking on by accident here either.
  if (!reasoning) delete pinned.reasoning;
  if (fields.model !== undefined) pinned.model = splitProviders(fields.model).model;
  return pinned;
}

/**
 * The whole request, ready for fetch. Kept next to the body builder so a call
 * site never has to remember the URL or the headers either.
 */
export function chatRequest(apiKey, fields = {}) {
  return [OPENROUTER_URL, {
    method: 'POST',
    headers: openRouterHeaders(apiKey),
    body: JSON.stringify(chatBody(fields)),
  }];
}

/**
 * What the Vercel AI SDK provider needs to carry the same two settings, for the
 * paths that go through `createOpenRouter` rather than fetch.
 */
export const AI_SDK_EXTRA_BODY = { provider: NO_RETENTION, reasoning: NO_REASONING };

/**
 * The AI SDK provider, with both settings and any provider pin applied.
 *
 * Use it exactly as `createOpenRouter`'s result — `openrouter(model)` — and a
 * model id carrying "@provider" is sent as the bare model with its routing
 * attached. The per-model extraBody is spread after the provider-wide one by
 * the SDK, so a pinned model's routing replaces the plain no-retention rule
 * rather than being merged into it (providerRouting keeps that rule in).
 */
export function createRouter(apiKey) {
  const base = createOpenRouter({ apiKey, extraBody: AI_SDK_EXTRA_BODY, fetch: timedFetch });
  return (id, settings = {}) => {
    const { model, providers } = splitProviders(id);
    const extraBody = { ...settings.extraBody };
    if (providers.length) extraBody.provider = providerRouting(id);
    // Undefined, not deleted: the per-model extraBody is spread over the
    // provider-wide one, so this is what takes NO_REASONING back off, and
    // JSON.stringify leaves the key out of the request entirely.
    if (!reasoningFor(id)) extraBody.reasoning = undefined;
    return base(model, { ...settings, extraBody });
  };
}

/**
 * fetch, with one log line per OpenRouter attempt.
 *
 * A turn that ran past the function's time limit used to leave nothing behind
 * but "Task timed out after 120 seconds" — no way to tell a slow model from a
 * slow provider from the AI SDK quietly retrying a failed call twice. Each
 * attempt is its own line now, so a retry shows as two, and every line says
 * which model, how long, what came back and which provider served it:
 *
 *   [openrouter] anthropic/claude-haiku-5.5 200 in 2.4s via Google (in 15872, out 212, thinking 0)
 *
 * Reads a CLONE of the body, so the SDK still gets the response untouched.
 */
export async function timedFetch(url, init = {}) {
  const started = Date.now();
  let model = '?';
  try { model = JSON.parse(init.body || '{}').model || '?'; } catch (e) { /* not JSON */ }
  const secs = () => ((Date.now() - started) / 1000).toFixed(1) + 's';
  try {
    const res = await fetch(url, init);
    let detail = '';
    try {
      const data = await res.clone().json();
      const u = data.usage || {};
      const thinking = u.completion_tokens_details?.reasoning_tokens;
      detail = (data.provider ? ' via ' + data.provider : '')
        + (u.prompt_tokens != null ? ` (in ${u.prompt_tokens}, out ${u.completion_tokens}${thinking != null ? ', thinking ' + thinking : ''})` : '')
        + (data.error ? ' ' + JSON.stringify(data.error).slice(0, 200) : '');
    } catch (e) { /* not JSON, or a stream: the status and time are still worth having */ }
    console.info(`[openrouter] ${model} ${res.status} in ${secs()}${detail}`);
    return res;
  } catch (e) {
    console.warn(`[openrouter] ${model} failed after ${secs()}:`, String(e).slice(0, 160));
    throw e;
  }
}
