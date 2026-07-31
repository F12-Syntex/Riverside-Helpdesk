import test from 'node:test';
import assert from 'node:assert/strict';
import { pickResearchModel, shouldEscalateResearch } from '../lib/agent/research-model.mjs';

const FAST = 'openai/gpt-oss-120b';
const BIG = 'anthropic/claude-sonnet-4.6';

test('the research loop reads on the fast role', () => {
  const picked = pickResearchModel({ reasoning: { model: BIG }, fast: { model: FAST } });
  assert.equal(picked.model, FAST);
  assert.equal(picked.role, 'fast');
  assert.equal(picked.reasoning, BIG);
});

test('an install with one model researches on it, and calls it what it is', () => {
  const picked = pickResearchModel({ reasoning: { model: BIG }, fast: { model: BIG } });
  assert.equal(picked.model, BIG);
  assert.equal(picked.role, 'reasoning');
});

test('a loop that searched and found nothing is not run again', () => {
  const { escalate } = shouldEscalateResearch({ toolCalls: 3, model: FAST, reasoning: BIG });
  assert.equal(escalate, false);
});

test('a loop that never called a tool is run again on the reasoning model', () => {
  const { escalate, reason } = shouldEscalateResearch({ toolCalls: 0, model: FAST, reasoning: BIG });
  assert.equal(escalate, true);
  assert.match(reason, /without calling a single tool/);
});

test('a failed loop is run again on the reasoning model', () => {
  const { escalate } = shouldEscalateResearch({ error: new Error('provider is down'), toolCalls: 2, model: FAST, reasoning: BIG });
  assert.equal(escalate, true);
});

test('a hand-off is a decision, not a malfunction', () => {
  const { escalate } = shouldEscalateResearch({ toolCalls: 0, handOff: 'document-to-file', model: FAST, reasoning: BIG });
  assert.equal(escalate, false);
});

test('there is nothing to escalate to when both roles are one model', () => {
  assert.equal(shouldEscalateResearch({ toolCalls: 0, model: BIG, reasoning: BIG }).escalate, false);
  assert.equal(shouldEscalateResearch({ error: new Error('x'), model: BIG, reasoning: BIG }).escalate, false);
});
