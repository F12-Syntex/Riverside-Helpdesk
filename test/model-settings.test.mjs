import test from 'node:test';
import assert from 'node:assert/strict';
import { envDefaults, mergeModelSettings, mergeRole, ROLE_KEYS } from '../lib/model-settings.js';

// The rule this file exists to protect: a blank field is not a setting. An
// install that has never opened /settings, or that clears a box, must fall
// straight back to the environment and behave exactly as it did before.

const base = { model: 'anthropic/claude-sonnet-4.6', temperature: 0.2, maxOutputTokens: 4000, reasoningEffort: '' };

test('no stored row leaves the environment default untouched', () => {
  assert.deepEqual(mergeRole(base, undefined), base);
  assert.deepEqual(mergeRole(base, null), base);
});

test('a blank row leaves the environment default untouched', () => {
  const merged = mergeRole(base, { role: 'reasoning', model: '', temperature: null, maxOutputTokens: null, reasoningEffort: '' });
  assert.deepEqual(merged, base);
});

test('a stored model replaces the default', () => {
  const merged = mergeRole(base, { model: 'perplexity/sonar-pro' });
  assert.equal(merged.model, 'perplexity/sonar-pro');
  assert.equal(merged.temperature, 0.2, 'the untouched fields must still inherit');
});

test('temperature of zero is a real setting, not an empty one', () => {
  assert.equal(mergeRole(base, { temperature: 0 }).temperature, 0);
});

test('out-of-range numbers are clamped rather than passed to the provider', () => {
  assert.equal(mergeRole(base, { temperature: 9 }).temperature, 2);
  assert.equal(mergeRole(base, { temperature: -3 }).temperature, 0);
  assert.equal(mergeRole(base, { maxOutputTokens: 1 }).maxOutputTokens, 64);
  assert.equal(mergeRole(base, { maxOutputTokens: 999_999 }).maxOutputTokens, 32_000);
});

test('nonsense is ignored instead of breaking the call', () => {
  const merged = mergeRole(base, { temperature: 'hot', maxOutputTokens: 'lots', reasoningEffort: 'maximum' });
  assert.deepEqual(merged, base);
});

test('a known reasoning effort is applied', () => {
  assert.equal(mergeRole(base, { reasoningEffort: 'high' }).reasoningEffort, 'high');
});

test('every role resolves, and only the stored one changes', () => {
  const defaults = envDefaults({ OPENROUTER_AI_MODEL: 'anthropic/claude-sonnet-4.6' });
  const merged = mergeModelSettings(defaults, [{ role: 'web', model: 'perplexity/sonar' }]);
  assert.deepEqual(Object.keys(merged).sort(), [...ROLE_KEYS].sort());
  assert.equal(merged.web.model, 'perplexity/sonar');
  assert.equal(merged.reasoning.model, 'anthropic/claude-sonnet-4.6');
});

test('one environment variable is enough to configure every role', () => {
  const defaults = envDefaults({ OPENROUTER_AI_MODEL: 'anthropic/claude-sonnet-4.6' });
  assert.equal(defaults.reasoning.model, 'anthropic/claude-sonnet-4.6');
  assert.equal(defaults.fast.model, 'anthropic/claude-sonnet-4.6');
  assert.equal(defaults.vision.model, 'anthropic/claude-sonnet-4.6');
  assert.equal(defaults.web.model, 'anthropic/claude-sonnet-4.6');
});

test('the cheap roles fall back to the analysis model before the expensive one', () => {
  const defaults = envDefaults({
    OPENROUTER_AI_MODEL: 'anthropic/claude-sonnet-4.6',
    OPENROUTER_ANALYSIS_MODEL: 'openai/gpt-oss-120b',
  });
  assert.equal(defaults.fast.model, 'openai/gpt-oss-120b');
  assert.equal(defaults.web.model, 'openai/gpt-oss-120b');
  assert.equal(defaults.reasoning.model, 'anthropic/claude-sonnet-4.6', 'the writer must not be downgraded');
  assert.equal(defaults.vision.model, 'anthropic/claude-sonnet-4.6', 'vision must stay on the vision-capable model');
});
