import test from 'node:test';
import assert from 'node:assert/strict';
import { isModelSlug, isProviderSlug, joinProviders, splitModelId, joinModelId, splitProviders } from '../lib/model-id.mjs';
import { chatBody, createRouter, providerRouting, NO_RETENTION } from '../lib/ai/openrouter.mjs';
import { isNativeSearchModel } from '../lib/agent/web-search.mjs';
import { estimateQueryCost } from '../lib/ai/usage-cost.mjs';

// A provider pin — "anthropic/claude-haiku-5.5@google-vertex/europe" — says
// WHERE a model runs. It is stored as part of the model id, so every role can
// carry one, and it is turned into OpenRouter's provider routing at the one
// place every request is built.

test('a pinned id is a valid id, and reads back as model plus providers', () => {
  for (const id of [
    'anthropic/claude-haiku-5.5@google-vertex/europe',
    'openai/gpt-oss-120b:nitro@groq',
    'openai/gpt-oss-120b@groq,cerebras',
    'meta-llama/llama-3.3-70b-instruct@deepinfra/turbo,together',
  ]) assert.equal(isModelSlug(id), true, id);

  assert.deepEqual(splitProviders('anthropic/claude-haiku-5.5@google-vertex/europe'), {
    model: 'anthropic/claude-haiku-5.5', providers: ['google-vertex/europe'],
  });
  // The variant is part of the model NAME, so it stays on the model.
  assert.deepEqual(splitProviders('openai/gpt-oss-120b:nitro@groq,cerebras'), {
    model: 'openai/gpt-oss-120b:nitro', providers: ['groq', 'cerebras'],
  });
  assert.deepEqual(splitProviders('openai/gpt-oss-120b'), { model: 'openai/gpt-oss-120b', providers: [] });
});

test('a malformed pin is refused before it is saved', () => {
  for (const id of ['a/b@', 'a/b@,groq', 'a/b@groq,', 'a/b@x/y/z', 'a/b@gr oq', 'a/b@groq@together']) {
    assert.equal(isModelSlug(id), false, id);
  }
  assert.equal(isProviderSlug('google-vertex/europe'), true);
  assert.equal(isProviderSlug('google vertex'), false);
});

test('pins join back, and a split/join of the variant still round-trips', () => {
  assert.equal(joinProviders('a/b', ['x', 'y/z']), 'a/b@x,y/z');
  assert.equal(joinProviders('a/b', ' x , y '), 'a/b@x,y');
  assert.equal(joinProviders('a/b', []), 'a/b');
  for (const id of ['a/b@x', 'a/b:nitro@x,y']) {
    const { base, variant } = splitModelId(id);
    assert.equal(joinModelId(base, variant), id);
  }
});

test('an unpinned request is exactly what it was before pins existed', () => {
  assert.deepEqual(providerRouting('openai/gpt-oss-120b'), NO_RETENTION);
  const body = chatBody({ model: 'openai/gpt-oss-120b:nitro', messages: [] });
  assert.equal(body.model, 'openai/gpt-oss-120b:nitro');
  assert.deepEqual(body.provider, NO_RETENTION);
});

test('a pinned request sends the bare model and strict routing, retention rule kept', () => {
  const body = chatBody({ model: 'anthropic/claude-haiku-5.5@google-vertex/europe', messages: [] });
  assert.equal(body.model, 'anthropic/claude-haiku-5.5');
  assert.deepEqual(body.provider, {
    data_collection: 'deny',
    only: ['google-vertex/europe'],
    order: ['google-vertex/europe'],
    allow_fallbacks: false,
  });
  // A caller cannot loosen it either.
  const loose = chatBody({ model: 'a/b@x', provider: { allow_fallbacks: true } });
  assert.equal(loose.provider.allow_fallbacks, false);
});

test('the AI SDK path sends the same thing', async () => {
  let sent = null;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    sent = JSON.parse(init.body);
    throw new Error('stop here');
  };
  try {
    const openrouter = createRouter('key');
    const { generateText } = await import('ai');
    await generateText({ model: openrouter('anthropic/claude-haiku-5.5@google-vertex/europe'), prompt: 'hi', maxRetries: 0 }).catch(() => {});
    assert.equal(sent.model, 'anthropic/claude-haiku-5.5');
    assert.deepEqual(sent.provider.only, ['google-vertex/europe']);
    assert.equal(sent.provider.allow_fallbacks, false);
    assert.equal(sent.provider.data_collection, 'deny');
    assert.equal(sent.reasoning.effort, 'minimal');

    await generateText({ model: openrouter('openai/gpt-oss-120b'), prompt: 'hi', maxRetries: 0 }).catch(() => {});
    assert.equal(sent.model, 'openai/gpt-oss-120b');
    assert.deepEqual(sent.provider, NO_RETENTION);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('a pin changes where a model runs, not what it is or what it costs', () => {
  assert.equal(isNativeSearchModel('perplexity/sonar@perplexity'), true);
  assert.equal(isNativeSearchModel('openai/gpt-4.1:online@openai'), true);
  const prices = { 'a/b': { promptPerMillion: 1, completionPerMillion: 2 } };
  const averages = { reasoning: { 'a/b@x': { inputTokens: 1e6, outputTokens: 1e6 } } };
  const pinned = estimateQueryCost({ roleModels: { reasoning: 'a/b@x' }, averages, prices });
  assert.ok(pinned && pinned.total > 0, JSON.stringify(pinned));
});
