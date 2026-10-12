import test from 'node:test';
import assert from 'node:assert/strict';
import { costOf, usageCounts } from '../lib/ai/usage-counts.mjs';

// What ai_usage records for one call: the whole prompt, the output, and how much
// of the prompt the provider read from its cache.

test('the AI SDK usage, with the cached Notebook read back', () => {
  const usage = {
    inputTokens: 44210,
    inputTokenDetails: { noCacheTokens: 120, cacheReadTokens: 44090, cacheWriteTokens: 0 },
    outputTokens: 212,
  };
  assert.deepEqual(usageCounts(usage), { input: 44210, output: 212, cached: 44090 });
});

test('a first call writes the cache and reads none of it', () => {
  const usage = { inputTokens: 44210, inputTokenDetails: { cacheReadTokens: 0, cacheWriteTokens: 44090 }, outputTokens: 90 };
  assert.deepEqual(usageCounts(usage), { input: 44210, output: 90, cached: 0 });
});

test('a provider that says nothing about caching is recorded as not said, not as zero', () => {
  assert.deepEqual(usageCounts({ inputTokens: 10, outputTokens: 2 }), { input: 10, output: 2, cached: null });
  assert.deepEqual(usageCounts({ promptTokens: 7, completionTokens: 1 }), { input: 7, output: 1, cached: null });
  assert.deepEqual(usageCounts(null), { input: 0, output: 0, cached: null });
});

test('nonsense is not a count', () => {
  assert.deepEqual(usageCounts({ inputTokens: 'x', outputTokens: -3, cachedInputTokens: 4.6 }), { input: 0, output: 0, cached: 5 });
});

test('the charge OpenRouter reports is read from the AI SDK metadata or a raw response', () => {
  assert.equal(costOf({ metadata: { openrouter: { usage: { cost: 0.000022869 } } } }), 0.000022869);
  assert.equal(costOf({ usage: { prompt_tokens: 2, cost: 0.0004 } }), 0.0004);
  assert.equal(costOf({ usage: { cost: 0 } }), 0);
});

test('no charge reported is null, not free', () => {
  assert.equal(costOf({ usage: { inputTokens: 3 } }), null);
  assert.equal(costOf({}), null);
  assert.equal(costOf(), null);
  assert.equal(costOf({ usage: { cost: 'x' } }), null);
  assert.equal(costOf({ usage: { cost: -1 } }), null);
});
