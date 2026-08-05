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

export const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Only providers that do not retain prompt data.
export const NO_RETENTION = { data_collection: 'deny' };

// No extended reasoning. See above — this is a speed decision made once for the
// whole app, not a default for a call site to weigh.
export const NO_REASONING = { enabled: false, exclude: true };

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
 * The body of a chat completion request.
 *
 * Pass whatever the call needs — model, messages, temperature, max_tokens,
 * response_format, tools. The retention and reasoning settings are applied on
 * top and cannot be overridden.
 */
export function chatBody(fields = {}) {
  return { ...fields, provider: NO_RETENTION, reasoning: NO_REASONING };
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
