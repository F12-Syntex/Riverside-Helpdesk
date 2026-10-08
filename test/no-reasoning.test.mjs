import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chatBody, chatRequest, createRouter, reasoningFor, AI_SDK_EXTRA_BODY, NO_REASONING, NO_RETENTION } from '../lib/ai/openrouter.mjs';

// Every model call this app makes has to carry two things: no-retention provider
// routing, and no extended reasoning. Both used to be copied by hand into a
// dozen hand-built request bodies, and the predictable thing happened — the
// retention flag made it everywhere and the reasoning flag reached two of them.
// Signposting, the reason for appointment, the filing title, the medication
// check, the rota and the Notebook tools were all paying for a model to think
// before answering work that was already settled by the Notebook and the prompt.
//
// So the shape lives in one module, and this file is what keeps it that way: the
// first two tests fix the contract, and the last one fails the build if a new
// call site starts building its own request again.

test('every request carries the no-retention routing and no reasoning', () => {
  const body = chatBody({ model: 'x/y', messages: [] });
  assert.deepEqual(body.provider, NO_RETENTION);
  assert.deepEqual(body.reasoning, NO_REASONING);
  // Minimal effort, NOT `enabled: false`. Endpoints that mandate reasoning
  // reject an explicit disable outright — "Reasoning is mandatory for this
  // endpoint and cannot be disabled" — and that failed every call rather than
  // degrading it. This pins the shape that works everywhere.
  assert.deepEqual(NO_REASONING, { effort: 'minimal', exclude: true });
});

test('a call site cannot switch thinking back on by accident', () => {
  // The flags are stamped after whatever the caller passed, so a stray
  // `reasoning` in a call site's own fields loses.
  const body = chatBody({ model: 'x/y', reasoning: { enabled: true }, provider: { data_collection: 'allow' } });
  assert.deepEqual(body.reasoning, NO_REASONING);
  assert.deepEqual(body.provider, NO_RETENTION);
  assert.deepEqual(AI_SDK_EXTRA_BODY.reasoning, NO_REASONING);
});

test('a Claude model is sent no reasoning field, because minimal effort switches its thinking ON', () => {
  // OpenRouter turns any effort level into an Anthropic thinking budget of at
  // least 1,024 tokens, so "minimal" made Haiku think before every call it
  // would otherwise have answered straight away. Claude's own default is no
  // thinking, and the way to get it is to send nothing.
  for (const id of ['anthropic/claude-haiku-5.5', 'anthropic/claude-sonnet-4.6:nitro', 'anthropic/claude-haiku-5.5@google-vertex/europe']) {
    assert.equal(reasoningFor(id), null, id);
    const body = chatBody({ model: id, messages: [], reasoning: { enabled: true } });
    assert.equal('reasoning' in body, false, id);
    assert.deepEqual(JSON.parse(JSON.stringify(body)).provider.data_collection, 'deny');
  }
  // Everything else keeps the minimal-effort floor that mandatory-reasoning
  // endpoints (Google's flash-lite among them) accept.
  for (const id of ['google/gemini-3.5-flash-lite', 'openai/gpt-oss-120b', 'perplexity/sonar']) {
    assert.deepEqual(reasoningFor(id), NO_REASONING, id);
    assert.deepEqual(chatBody({ model: id }).reasoning, NO_REASONING, id);
  }
});

test('the AI SDK path drops the reasoning field for Claude too', async () => {
  const bodies = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => { bodies.push(JSON.parse(init.body)); throw new Error('stop'); };
  try {
    const { generateText } = await import('ai');
    const openrouter = createRouter('key');
    await generateText({ model: openrouter('anthropic/claude-haiku-5.5'), prompt: 'hi', maxRetries: 0 }).catch(() => {});
    await generateText({ model: openrouter('google/gemini-3.5-flash-lite'), prompt: 'hi', maxRetries: 0 }).catch(() => {});
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.equal('reasoning' in bodies[0], false);
  assert.deepEqual(bodies[0].provider, NO_RETENTION);
  assert.deepEqual(bodies[1].reasoning, NO_REASONING);
});

test('chatRequest is a ready-to-spread fetch call', () => {
  const [url, init] = chatRequest('key-123', { model: 'x/y', messages: [{ role: 'user', content: 'hi' }] });
  assert.match(url, /openrouter\.ai/);
  assert.equal(init.method, 'POST');
  assert.equal(init.headers.Authorization, 'Bearer key-123');
  assert.deepEqual(JSON.parse(init.body).reasoning, NO_REASONING);
});

// Walk the source and fail on any file that talks to OpenRouter's completions
// endpoint without going through the shared module. This is the test that
// actually holds the line: the others would still pass with ten call sites
// quietly rolling their own body again.
const ROOTS = ['app', 'lib', 'rag'];
const SHARED = path.join('lib', 'ai', 'openrouter.mjs');

function sourceFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { sourceFiles(full, out); continue; }
    if (/\.(js|mjs|jsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

test('nothing builds its own OpenRouter request', () => {
  const offenders = [];
  for (const root of ROOTS) {
    for (const file of sourceFiles(root)) {
      if (file === SHARED) continue;
      const text = fs.readFileSync(file, 'utf8');
      // The completions URL written out by hand, the retention flag spelled out
      // rather than imported, or a `reasoning:` key set anywhere else — each one
      // is a request body assembled outside the module, which is exactly how the
      // flag went missing from ten call sites.
      // Matched on the reasoning object's own keys, so the "reasoning" MODEL
      // ROLE in lib/settings.js is not mistaken for the OpenRouter parameter.
      const own = text.includes('api/v1/chat/completions')
        || /data_collection\s*:/.test(text)
        || /\breasoning\s*:\s*\{\s*(?:enabled|effort|exclude|max_tokens)/.test(text);
      if (own) offenders.push(file);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    'These build an OpenRouter request themselves and will miss the reasoning flag. '
    + `Use chatRequest / chatBody from lib/ai/openrouter.mjs instead: ${offenders.join(', ')}`,
  );
});
