import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MODEL_VARIANTS,
  isModelSlug,
  isModelVariant,
  joinModelId,
  modelIdProblem,
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

// The settings page explains a refused id under its field. The explanation
// must never disagree with the check the save makes: nothing for a valid id
// (or a blank one, which the page allows or refuses itself), and a reason for
// every id isModelSlug refuses — otherwise the field would say "fine" to an id
// the server then rejects, or block one it would have taken.
test('a refused id always comes with a reason, and a valid one never does', () => {
  const ids = [
    '', '   ', 'openai/gpt-oss-120b', ' openai/gpt-oss-120b ', 'Google/Gemini-3.5-Flash', 'a.b/c_d-e',
    'openai/gpt-oss-120b:nitro', 'openai/gpt-oss-120b:nitro@groq,cerebras', 'anthropic/claude-haiku-5.5@google-vertex/europe',
    'son 4', 'claude', 'claude:nitro', 'openai/gpt 4o', 'openai/gpt#4', 'a/b,c', 'a:b/c', '/gpt', 'openai/', 'a/b/c',
    '-a/b', 'a/-b', 'a/b:', 'a/b:c:d', 'a/b:c/d', 'a/b@', 'a/b@groq,', 'a/b@,groq', 'a/b@groq:nitro', 'a/b@-x',
    'a/b@x/y/z', 'a/b@@x', 'a/b@x@y', 'a/b:-', 'é/b',
  ];
  for (const id of ids) {
    const valid = !id.trim() || isModelSlug(id);
    assert.equal(modelIdProblem(id) === '', valid, JSON.stringify(id) + ' -> ' + JSON.stringify(modelIdProblem(id)));
  }
});

test('the reason says what to change', () => {
  assert.match(modelIdProblem('son 4'), /Pick a model from the list/);
  assert.match(modelIdProblem('openai/gpt 4o'), /no spaces/);
  assert.match(modelIdProblem('openai/gpt#4'), /“#”/);
  assert.match(modelIdProblem('openai/'), /after the slash/);
  assert.match(modelIdProblem('a/b/c'), /Only one slash/);
  assert.match(modelIdProblem('openai/gpt-oss-120b:'), /after the colon/);
  assert.match(modelIdProblem('openai/gpt-oss-120b@groq:nitro'), /before the @provider/);
  assert.match(modelIdProblem('openai/gpt-oss-120b@groq,'), /provider is missing/);
});
