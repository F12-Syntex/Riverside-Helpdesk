import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MODEL_VARIANTS,
  isModelSlug,
  isModelVariant,
  joinModelId,
  splitModelId,
  variantHint,
} from '../lib/model-id.mjs';

// The variant is the ":nitro" in "openai/gpt-oss-120b:nitro" — same model,
// different provider choice. It is edited as its own field on the settings page
// but stored as one string, so splitting and joining have to round-trip exactly.

test('an id splits into model and variant, and joins back unchanged', () => {
  for (const id of [
    'openai/gpt-oss-120b:nitro',
    'openai/gpt-oss-120b',
    'anthropic/claude-sonnet-4.6:thinking',
    'google/gemini-3.5-flash-lite',
    'meta-llama/llama-3.3-70b-instruct:free',
  ]) {
    const { base, variant } = splitModelId(id);
    assert.equal(joinModelId(base, variant), id, id);
    assert.equal(isModelSlug(id), true, id);
  }
});

test('the variant is read off the id, not guessed', () => {
  assert.deepEqual(splitModelId('openai/gpt-oss-120b:nitro'), { base: 'openai/gpt-oss-120b', variant: 'nitro' });
  assert.deepEqual(splitModelId('openai/gpt-oss-120b'), { base: 'openai/gpt-oss-120b', variant: '' });
  assert.deepEqual(splitModelId('  openai/gpt-oss-120b:floor  '), { base: 'openai/gpt-oss-120b', variant: 'floor' });
});

test('joining tolerates what a person types', () => {
  // A typed ":nitro" keeps its colon out of the joined id rather than doubling it.
  assert.equal(joinModelId('openai/gpt-oss-120b', ':nitro'), 'openai/gpt-oss-120b:nitro');
  assert.equal(joinModelId('openai/gpt-oss-120b', ' nitro '), 'openai/gpt-oss-120b:nitro');
  // No variant means no colon — the plain id, exactly as before this existed.
  assert.equal(joinModelId('openai/gpt-oss-120b', ''), 'openai/gpt-oss-120b');
  assert.equal(joinModelId('', 'nitro'), '');
});

test('a variant is refused before it can be saved into a broken id', () => {
  for (const v of ['', 'nitro', 'floor', 'free', 'online', 'thinking', 'exacto', 'extended', 'v1.2_beta']) {
    assert.equal(isModelVariant(v), true, JSON.stringify(v));
  }
  for (const v of ['ni tro', 'nitro:floor', 'nitro/floor', '!']) {
    assert.equal(isModelVariant(v), false, JSON.stringify(v));
  }
});

test('every offered variant produces a valid id and explains itself', () => {
  for (const v of MODEL_VARIANTS) {
    const id = joinModelId('openai/gpt-oss-120b', v.id);
    assert.equal(isModelSlug(id), true, id);
    assert.ok(v.hint, 'a variant offered as a button says what it does: ' + v.label);
    assert.equal(variantHint(v.id), v.hint);
  }
  // Nothing is claimed about a variant we do not know — the field stays usable.
  assert.equal(variantHint('exacto'), '');
});
