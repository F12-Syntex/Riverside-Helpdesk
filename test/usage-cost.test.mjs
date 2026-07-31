import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateQueryCost, summariseModelCosts, formatCost } from '../lib/ai/usage-cost.mjs';

// Two rules this file protects.
//
// The page may only show a cost it can stand behind: a role nobody has run, or
// one whose model has no published price, is left out and said to be left out —
// never quietly counted as nothing.
//
// And measurements belong to the MODEL that produced them. Changing model shows
// nothing until the new one has been used; changing back brings the old model's
// record back untouched, because nothing is ever reset.

const GEMINI = 'google/gemini-3.5-flash-lite';
const OSS = 'openai/gpt-oss-120b';
const SONAR = 'perplexity/sonar';

const PRICES = {
  [GEMINI]: { promptPerMillion: 0.1, completionPerMillion: 0.4 },
  [OSS]: { promptPerMillion: 0.05, completionPerMillion: 0.25 },
  [SONAR]: { promptPerMillion: 1, completionPerMillion: 1 },
};

test('a question is priced from the tokens it really used', () => {
  const { total, measured } = estimateQueryCost({
    averages: { reasoning: { [GEMINI]: { inputTokens: 20_000, outputTokens: 2_000 } } },
    roleModels: { reasoning: GEMINI },
    prices: PRICES,
  });
  // 20k in at $0.10/M = $0.002; 2k out at $0.40/M = $0.0008.
  assert.equal(measured, true);
  assert.ok(Math.abs(total - 0.0028) < 1e-9, 'expected $0.0028, got ' + total);
});

test('every role adds to the total', () => {
  const { total, perRole } = estimateQueryCost({
    averages: {
      reasoning: { [GEMINI]: { inputTokens: 20_000, outputTokens: 2_000 } },
      web: { [SONAR]: { inputTokens: 1_000, outputTokens: 500 } },
    },
    roleModels: { reasoning: GEMINI, web: SONAR },
    prices: PRICES,
  });
  assert.ok(Math.abs(total - (0.0028 + 0.0015)) < 1e-9);
  // Sorted dearest first, so the page can say where the money goes.
  assert.equal(perRole[0].role, 'reasoning');
});

test('switching to a model that has never run shows nothing for it', () => {
  const averages = { reasoning: { [GEMINI]: { inputTokens: 20_000, outputTokens: 2_000 } } };
  const { measured, missing } = estimateQueryCost({
    averages,
    roleModels: { reasoning: OSS },
    prices: PRICES,
  });
  assert.equal(measured, false, 'the old model figures must not be priced at the new model rate');
  assert.deepEqual(missing, ['reasoning']);
});

test('switching back to a measured model brings its figures back', () => {
  const averages = { reasoning: { [GEMINI]: { inputTokens: 20_000, outputTokens: 2_000 } } };
  const away = estimateQueryCost({ averages, roleModels: { reasoning: OSS }, prices: PRICES });
  const back = estimateQueryCost({ averages, roleModels: { reasoning: GEMINI }, prices: PRICES });
  assert.equal(away.measured, false);
  assert.equal(back.measured, true);
  assert.ok(Math.abs(back.total - 0.0028) < 1e-9);
});

test('one role can be measured on several models at once', () => {
  const averages = {
    reasoning: {
      [GEMINI]: { inputTokens: 20_000, outputTokens: 2_000 },
      [OSS]: { inputTokens: 20_000, outputTokens: 2_000 },
    },
  };
  const onGemini = estimateQueryCost({ averages, roleModels: { reasoning: GEMINI }, prices: PRICES });
  const onOss = estimateQueryCost({ averages, roleModels: { reasoning: OSS }, prices: PRICES });
  // Same tokens, different rates: $0.0028 against $0.0015.
  assert.ok(Math.abs(onGemini.total - 0.0028) < 1e-9);
  assert.ok(Math.abs(onOss.total - 0.0015) < 1e-9);
});

test('a role that has never run is excluded and named, not counted as zero', () => {
  const { total, missing, perRole } = estimateQueryCost({
    averages: { reasoning: { [GEMINI]: { inputTokens: 10_000, outputTokens: 1_000 } } },
    roleModels: { reasoning: GEMINI, web: SONAR },
    prices: PRICES,
  });
  assert.deepEqual(missing, ['web']);
  assert.equal(perRole.length, 1);
  assert.ok(Math.abs(total - 0.0014) < 1e-9);
});

test('a model with no published price is excluded and named', () => {
  const { missing, unpriced, measured } = estimateQueryCost({
    averages: { reasoning: { 'somebody/brand-new-model': { inputTokens: 10_000, outputTokens: 1_000 } } },
    roleModels: { reasoning: 'somebody/brand-new-model' },
    prices: PRICES,
  });
  assert.deepEqual(unpriced, ['reasoning']);
  assert.deepEqual(missing, []);
  assert.equal(measured, false, 'nothing priced means nothing to show');
});

test('a routing variant is priced as the model it decorates', () => {
  const { total } = estimateQueryCost({
    averages: { fast: { 'openai/gpt-oss-120b:nitro': { inputTokens: 1_000_000, outputTokens: 0 } } },
    roleModels: { fast: 'openai/gpt-oss-120b:nitro' },
    prices: PRICES,
  });
  assert.ok(Math.abs(total - 0.05) < 1e-9);
});

test('nothing measured at all reports itself as unmeasured', () => {
  const { measured, total } = estimateQueryCost({
    averages: {},
    roleModels: { reasoning: GEMINI },
    prices: PRICES,
  });
  assert.equal(measured, false);
  assert.equal(total, 0);
});

test('a genuinely free model is $0, which is a real answer', () => {
  const { total, measured } = estimateQueryCost({
    averages: { reasoning: { 'someone/free-model': { inputTokens: 10_000, outputTokens: 1_000 } } },
    roleModels: { reasoning: 'someone/free-model' },
    prices: { 'someone/free-model': { promptPerMillion: 0, completionPerMillion: 0 } },
  });
  assert.equal(measured, true);
  assert.equal(total, 0);
});

test('the per-model history keeps a model that is no longer in use', () => {
  const rows = summariseModelCosts({
    byModel: {
      [GEMINI]: { inputTokens: 20_000, outputTokens: 2_000, turns: 40 },
      [OSS]: { inputTokens: 20_000, outputTokens: 2_000, turns: 12 },
    },
    prices: PRICES,
    roleModels: { reasoning: OSS },
  });
  assert.equal(rows.length, 2);
  const gemini = rows.find((r) => r.model === GEMINI);
  const oss = rows.find((r) => r.model === OSS);
  assert.equal(gemini.inUse, false, 'a model switched away from is still listed');
  assert.equal(oss.inUse, true);
  assert.equal(gemini.turns, 40);
  assert.ok(Math.abs(gemini.cost - 0.0028) < 1e-9);
});

test('the history is dearest first, with unpriced models last rather than cheapest', () => {
  const rows = summariseModelCosts({
    byModel: {
      [OSS]: { inputTokens: 20_000, outputTokens: 2_000, turns: 5 },
      'somebody/unknown': { inputTokens: 20_000, outputTokens: 2_000, turns: 5 },
      [SONAR]: { inputTokens: 20_000, outputTokens: 2_000, turns: 5 },
    },
    prices: PRICES,
    roleModels: {},
  });
  assert.deepEqual(rows.map((r) => r.model), [SONAR, OSS, 'somebody/unknown']);
  assert.equal(rows[2].priced, false);
  assert.equal(rows[2].cost, null, 'unknown must not read as $0');
});

test('fractions of a penny survive formatting', () => {
  assert.equal(formatCost(0.0028), '$0.0028');
  assert.equal(formatCost(0.42), '$0.420');
  assert.equal(formatCost(3.5), '$3.50');
  assert.equal(formatCost(0), '$0');
});
