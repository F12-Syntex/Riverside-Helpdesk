import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateQueryCost, formatCost } from '../lib/ai/usage-cost.mjs';

// The rule this file protects: the page may only show a cost it can stand
// behind. A role nobody has run, or one whose model has no published price, is
// left out and said to be left out — never quietly counted as nothing.

const PRICES = {
  'google/gemini-3.5-flash-lite': { promptPerMillion: 0.1, completionPerMillion: 0.4 },
  'openai/gpt-oss-120b': { promptPerMillion: 0.05, completionPerMillion: 0.25 },
  'perplexity/sonar': { promptPerMillion: 1, completionPerMillion: 1 },
};

test('a question is priced from the tokens it really used', () => {
  const { total, measured } = estimateQueryCost({
    averages: { reasoning: { inputTokens: 20_000, outputTokens: 2_000 } },
    roleModels: { reasoning: 'google/gemini-3.5-flash-lite' },
    prices: PRICES,
  });
  // 20k in at $0.10/M = $0.002; 2k out at $0.40/M = $0.0008.
  assert.equal(measured, true);
  assert.ok(Math.abs(total - 0.0028) < 1e-9, 'expected $0.0028, got ' + total);
});

test('every role adds to the total', () => {
  const { total, perRole } = estimateQueryCost({
    averages: {
      reasoning: { inputTokens: 20_000, outputTokens: 2_000 },
      web: { inputTokens: 1_000, outputTokens: 500 },
    },
    roleModels: { reasoning: 'google/gemini-3.5-flash-lite', web: 'perplexity/sonar' },
    prices: PRICES,
  });
  assert.ok(Math.abs(total - (0.0028 + 0.0015)) < 1e-9);
  // Sorted dearest first, so the page can say where the money goes.
  assert.equal(perRole[0].role, 'reasoning');
});

test('a role that has never run is excluded and named, not counted as zero', () => {
  const { total, missing, perRole } = estimateQueryCost({
    averages: { reasoning: { inputTokens: 10_000, outputTokens: 1_000 } },
    roleModels: { reasoning: 'google/gemini-3.5-flash-lite', web: 'perplexity/sonar' },
    prices: PRICES,
  });
  assert.deepEqual(missing, ['web']);
  assert.equal(perRole.length, 1);
  assert.ok(Math.abs(total - 0.0014) < 1e-9);
});

test('a model with no published price is excluded and named', () => {
  const { missing, unpriced, measured } = estimateQueryCost({
    averages: { reasoning: { inputTokens: 10_000, outputTokens: 1_000 } },
    roleModels: { reasoning: 'somebody/brand-new-model' },
    prices: PRICES,
  });
  assert.deepEqual(unpriced, ['reasoning']);
  assert.deepEqual(missing, []);
  assert.equal(measured, false, 'nothing priced means nothing to show');
});

test('a routing variant is priced as the model it decorates', () => {
  const { total } = estimateQueryCost({
    averages: { fast: { inputTokens: 1_000_000, outputTokens: 0 } },
    roleModels: { fast: 'openai/gpt-oss-120b:nitro' },
    prices: PRICES,
  });
  assert.ok(Math.abs(total - 0.05) < 1e-9);
});

test('nothing measured at all reports itself as unmeasured', () => {
  const { measured, total } = estimateQueryCost({
    averages: {},
    roleModels: { reasoning: 'google/gemini-3.5-flash-lite' },
    prices: PRICES,
  });
  assert.equal(measured, false);
  assert.equal(total, 0);
});

test('a genuinely free model is $0, which is a real answer', () => {
  const { total, measured } = estimateQueryCost({
    averages: { reasoning: { inputTokens: 10_000, outputTokens: 1_000 } },
    roleModels: { reasoning: 'someone/free-model' },
    prices: { 'someone/free-model': { promptPerMillion: 0, completionPerMillion: 0 } },
  });
  assert.equal(measured, true);
  assert.equal(total, 0);
});

test('fractions of a penny survive formatting', () => {
  assert.equal(formatCost(0.0028), '$0.0028');
  assert.equal(formatCost(0.42), '$0.420');
  assert.equal(formatCost(3.5), '$3.50');
  assert.equal(formatCost(0), '$0');
});
