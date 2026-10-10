import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveRoles, DEFAULT_CHECK_MODEL, DEFAULT_IMAGES_MODEL, ROLES, ROLE_KEYS, ROLE_SETTING_KEY } from '../lib/settings.js';
import { DECISION_MODELS } from '../lib/ai/decisions.mjs';

// The rule this file protects: an install that has only ever chosen one model
// must behave exactly as it did before roles existed. Nothing may silently move
// onto a different model because a role was added.

const BASE = 'google/gemini-3.5-flash-lite';

test('with nothing set, every role runs on the chosen model', () => {
  const roles = resolveRoles({ base: BASE, stored: {}, env: {} });
  for (const key of ['reasoning', 'fast', 'web']) {
    assert.equal(roles[key].model, BASE, key + ' should inherit');
  }
  // Images are read by whichever model is answering. A separate vision role only
  // bought a second model to keep an eye on.
  assert.equal(roles.vision, undefined);
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

/* ------------------------------------------------------------- the images role */

// The one role that does NOT inherit. A message with a picture on it is read
// by this model whichever path it takes, and the model chosen above may be
// text-only — so an unset images role is a small vision model of its own,
// never "whatever is answering".
test('the images role falls back to its own default, not to the reasoning model', () => {
  const roles = resolveRoles({ base: BASE, stored: {}, env: {} });
  assert.equal(roles.images.model, DEFAULT_IMAGES_MODEL);
  assert.equal(roles.images.source, 'default');
  assert.equal(DEFAULT_IMAGES_MODEL, 'mistralai/ministral-14b-2512');
  assert.ok(ROLE_KEYS.includes('images'));
  assert.equal(ROLE_SETTING_KEY.images, 'ai_model_images');
});

test('a chosen images model wins, and the environment sits between', () => {
  const chosen = resolveRoles({ base: BASE, stored: { images: 'c/vision' }, env: { OPENROUTER_IMAGES_MODEL: 'd/env' } });
  assert.equal(chosen.images.model, 'c/vision');
  assert.equal(chosen.images.source, 'database');
  const fromEnv = resolveRoles({ base: BASE, stored: {}, env: { OPENROUTER_IMAGES_MODEL: 'd/env' } });
  assert.equal(fromEnv.images.model, 'd/env');
  assert.equal(fromEnv.images.source, 'environment');
  // A blank or malformed stored value is the default, not a blank model.
  assert.equal(resolveRoles({ base: BASE, stored: { images: '  ' }, env: {} }).images.model, DEFAULT_IMAGES_MODEL);
  assert.equal(resolveRoles({ base: BASE, stored: { images: 'not a model' }, env: {} }).images.model, DEFAULT_IMAGES_MODEL);
});

/* -------------------------------------------------------- the answer check */

// The one role that is not a chat model. It is a DECISION model — it scores
// an answer and writes nothing — so no chat model can stand in for it, and an
// unset check role is TypeSafe's Jev rather than "whatever is answering".
test('the answer check falls back to its own decision model, never to a chat role', () => {
  const roles = resolveRoles({ base: BASE, stored: { fast: 'openai/gpt-oss-120b' }, env: {} });
  assert.equal(roles.check.model, DEFAULT_CHECK_MODEL);
  assert.equal(roles.check.source, 'default');
  assert.equal(DEFAULT_CHECK_MODEL, 'typesafe/jev-1.13');
  assert.ok(ROLE_KEYS.includes('check'));
  assert.equal(ROLE_SETTING_KEY.check, 'ai_model_check');
  assert.ok(ROLES.some((r) => r.key === 'check' && r.name === 'Answer check'));
  // The default is one the settings page offers, priced, because the chat
  // catalogue it normally searches does not list decision models.
  assert.ok(DECISION_MODELS.some((m) => m.id === DEFAULT_CHECK_MODEL));
});

test('a chosen check model wins; a blank or malformed one is the default', () => {
  const chosen = resolveRoles({ base: BASE, stored: { check: 'typesafe/jev-1.13-20260917' }, env: {} });
  assert.equal(chosen.check.model, 'typesafe/jev-1.13-20260917');
  assert.equal(chosen.check.source, 'database');
  assert.equal(resolveRoles({ base: BASE, stored: { check: ' ' }, env: {} }).check.model, DEFAULT_CHECK_MODEL);
  assert.equal(resolveRoles({ base: BASE, stored: { check: 'not a model' }, env: {} }).check.model, DEFAULT_CHECK_MODEL);
});
