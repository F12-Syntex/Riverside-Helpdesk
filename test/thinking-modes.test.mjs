// FAST, THINK AND DEEP — A MODEL EACH, AND NOTHING ELSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  THINKING_MODES, DEFAULT_THINKING, accurxModel, isThinkingMode, normaliseThinking, thinkingModel,
} from '../lib/thinking.mjs';
import { resolveRoles, DEFAULT_THINK_MODEL, DEFAULT_DEEP_MODEL, ROLE_KEYS, ROLE_SETTING_KEY } from '../lib/settings.js';

const BASE = 'google/gemini-3.5-flash-lite';

test('three modes, Fast first and the default', () => {
  assert.deepEqual(THINKING_MODES.map((m) => m.id), ['fast', 'think', 'deep']);
  assert.equal(DEFAULT_THINKING, 'fast');
  for (const m of THINKING_MODES) assert.ok(m.label && m.hint, m.id);
});

test('anything that is not a mode is Fast, never something dearer', () => {
  assert.equal(normaliseThinking('deep'), 'deep');
  assert.equal(normaliseThinking('DEEP'), 'fast');
  assert.equal(normaliseThinking(''), 'fast');
  assert.equal(normaliseThinking(undefined), 'fast');
  assert.equal(normaliseThinking({ toString: () => 'think' }), 'think');
  assert.equal(isThinkingMode('ultra'), false);
});

test('with nothing set, Fast is what answered before, and Think and Deep differ from it', () => {
  const roles = resolveRoles({ base: BASE, stored: {}, env: {} });
  assert.equal(thinkingModel(roles, 'fast').model, BASE);
  assert.equal(thinkingModel(roles, 'think').model, DEFAULT_THINK_MODEL);
  assert.equal(thinkingModel(roles, 'deep').model, DEFAULT_DEEP_MODEL);
  assert.notEqual(DEFAULT_THINK_MODEL, BASE);
  assert.notEqual(DEFAULT_DEEP_MODEL, DEFAULT_THINK_MODEL);
});

test('a stored think or deep model wins over its default', () => {
  const roles = resolveRoles({ base: BASE, stored: { think: 'openai/gpt-5.5', deep: 'anthropic/claude-opus-5.5' }, env: {} });
  assert.equal(thinkingModel(roles, 'think').model, 'openai/gpt-5.5');
  assert.equal(thinkingModel(roles, 'deep').model, 'anthropic/claude-opus-5.5');
  assert.equal(roles.think.source, 'database');
});

test('a missing role falls back to Fast rather than failing the turn', () => {
  const roles = { fast: { model: 'a/fast' } };
  assert.deepEqual(thinkingModel(roles, 'deep'), { model: 'a/fast', role: 'fast', mode: 'fast' });
});

test('/accurx keeps its own role on Fast, and takes the chosen model otherwise', () => {
  const roles = resolveRoles({ base: BASE, stored: { accurx: 'openai/gpt-5.4-mini' }, env: {} });
  assert.equal(accurxModel(roles, 'fast'), 'openai/gpt-5.4-mini');
  assert.equal(accurxModel(roles, 'think'), DEFAULT_THINK_MODEL);
  assert.equal(accurxModel(roles, 'deep'), DEFAULT_DEEP_MODEL);
});

test('both are roles the settings page can save', () => {
  assert.ok(ROLE_KEYS.includes('think') && ROLE_KEYS.includes('deep'));
  assert.equal(ROLE_SETTING_KEY.think, 'ai_model_think');
  assert.equal(ROLE_SETTING_KEY.deep, 'ai_model_deep');
});
