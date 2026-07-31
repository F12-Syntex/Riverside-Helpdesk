import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveRoles, ROLE_SETTING_KEY } from '../lib/settings.js';

// The rule this file protects: an install that has only ever chosen one model
// must behave exactly as it did before roles existed. Nothing may silently move
// onto a different model because a role was added.

const BASE = 'google/gemini-3.5-flash-lite';

test('with nothing set, every role runs on the chosen model', () => {
  const roles = resolveRoles({ base: BASE, stored: {}, env: {} });
  for (const key of ['reasoning', 'fast', 'web', 'vision']) {
    assert.equal(roles[key].model, BASE, key + ' should inherit');
  }
  assert.equal(roles.fast.source, 'reasoning');
});

test('a stored role wins over the environment', () => {
  const roles = resolveRoles({
    base: BASE,
    stored: { web: 'perplexity/sonar' },
    env: { OPENROUTER_WEB_MODEL: 'openai/gpt-4.1-nano' },
  });
  assert.equal(roles.web.model, 'perplexity/sonar');
  assert.equal(roles.web.source, 'database');
});

test('the environment variables that used to carry these still do', () => {
  const roles = resolveRoles({
    base: BASE,
    stored: {},
    env: { OPENROUTER_ANALYSIS_MODEL: 'openai/gpt-oss-120b', OPENROUTER_MEDICATION_MODEL: 'openai/gpt-4.1-nano' },
  });
  assert.equal(roles.fast.model, 'openai/gpt-oss-120b');
  assert.equal(roles.fast.source, 'environment');
  // The web role keeps the medication model's old precedence: that is the
  // variable which carried the web-search model before this existed.
  assert.equal(roles.web.model, 'openai/gpt-4.1-nano');
});

test('an explicit web model beats the medication one it used to borrow', () => {
  const roles = resolveRoles({
    base: BASE,
    stored: {},
    env: { OPENROUTER_WEB_MODEL: 'perplexity/sonar', OPENROUTER_MEDICATION_MODEL: 'openai/gpt-4.1-nano' },
  });
  assert.equal(roles.web.model, 'perplexity/sonar');
});

test('a blank stored role inherits rather than blanking the model', () => {
  const roles = resolveRoles({ base: BASE, stored: { fast: '', web: '   ' }, env: {} });
  assert.equal(roles.fast.model, BASE);
  assert.equal(roles.web.model, BASE);
});

test('a stored value that is not a model id is ignored, not passed to OpenRouter', () => {
  const roles = resolveRoles({ base: BASE, stored: { web: 'not a model' }, env: {} });
  assert.equal(roles.web.model, BASE);
});

test('the reasoning role is always the chosen model and cannot be overridden', () => {
  const roles = resolveRoles({ base: BASE, stored: { reasoning: 'openai/gpt-4.1-nano' }, env: {} });
  assert.equal(roles.reasoning.model, BASE);
  assert.ok(!('reasoning' in ROLE_SETTING_KEY), 'the reasoning role must have no separate stored key');
});

test('a routing variant survives as part of the id', () => {
  const roles = resolveRoles({ base: BASE, stored: { fast: 'openai/gpt-oss-120b:nitro' }, env: {} });
  assert.equal(roles.fast.model, 'openai/gpt-oss-120b:nitro');
});
