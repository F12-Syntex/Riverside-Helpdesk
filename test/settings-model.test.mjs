import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_AI_MODEL, isModelSlug } from '../lib/settings.js';

// The model id is typed by hand as often as it is picked from the list, and a
// bad one does not fail until the next question is asked — by which point the
// person who typed it has moved on. It is checked before it is stored.

test('accepts the shapes OpenRouter actually serves', () => {
  for (const id of [
    'google/gemini-3.5-flash-lite',
    'anthropic/claude-sonnet-4.6',
    'openai/gpt-4.1-nano',
    'meta-llama/llama-3.3-70b-instruct',
    'anthropic/claude-sonnet-4.6:thinking',
    DEFAULT_AI_MODEL,
  ]) assert.equal(isModelSlug(id), true, id);
});

test('refuses anything that is not a vendor/model id', () => {
  for (const id of ['', '   ', 'gpt-4', 'openai/', '/gpt-4', 'openai//gpt', 'openai/gpt 4', null, undefined]) {
    assert.equal(isModelSlug(id), false, String(id));
  }
});

test('the default is a real slug, so a practice that never opens settings still works', () => {
  assert.equal(DEFAULT_AI_MODEL, 'google/gemini-3.5-flash-lite');
  assert.equal(isModelSlug(DEFAULT_AI_MODEL), true);
});
