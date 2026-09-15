import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMeaningPrompt, chunkPairs, mergeVerdicts, MEANING_SCHEMA } from '../lib/notebook/meaning-prompt.mjs';

const PAIRS = [
  { id: 'a1', before: 'Book the patient unless they have chest pain.', after: 'Book the patient if they have chest pain.' },
  { id: 'b2', before: 'Ring before 08:30.', after: 'Ring before 08:30 in the morning.' },
  { id: 'c3', before: 'Tell Dr Goel.', after: 'Tell Dr Goel.' },
];

test('the prompt lists every pair by id with BEFORE and AFTER, and asks one question', () => {
  const p = buildMeaningPrompt(PAIRS, { path: 'Referrals / Physio' });
  for (const pair of PAIRS) {
    assert.ok(p.includes('#' + pair.id));
    assert.ok(p.includes('BEFORE: ' + pair.before));
    assert.ok(p.includes('AFTER: ' + pair.after));
  }
  assert.match(p, /"same"/);
  assert.match(p, /"changed"/);
  assert.match(p, /"unsure"/);
  assert.match(p, /Referrals \/ Physio/);
});

test('pairs are chunked, and verdicts from every chunk merge with missing ones marked unsure', () => {
  const chunks = chunkPairs(PAIRS, 2);
  assert.deepEqual(chunks.map((c) => c.length), [2, 1]);
  const merged = mergeVerdicts(PAIRS, [
    [{ id: 'a1', verdict: 'changed', reason: 'unless became if' }],
    [{ id: 'c3', verdict: 'same', reason: 'identical' }],
  ], { model: 'm' });
  assert.equal(merged.ok, false);
  assert.deepEqual(merged.changed, ['a1']);
  assert.deepEqual(merged.missing, ['b2']);
  assert.equal(merged.verdicts.b2.verdict, 'unsure');
  assert.equal(merged.model, 'm');
});

test('all same means ok; an unsure alone does not block but is listed', () => {
  const ok = mergeVerdicts(PAIRS, [PAIRS.map((p) => ({ id: p.id, verdict: 'same', reason: '' }))]);
  assert.ok(ok.ok);
  const unsure = mergeVerdicts(PAIRS, [PAIRS.map((p) => ({ id: p.id, verdict: p.id === 'b2' ? 'unsure' : 'same', reason: '' }))]);
  assert.ok(unsure.ok);
  assert.deepEqual(unsure.unsure, ['b2']);
});

test('the schema accepts the verdict shape and rejects a made-up verdict', () => {
  assert.ok(MEANING_SCHEMA.safeParse({ verdicts: [{ id: 'x', verdict: 'same', reason: 'r' }] }).success);
  assert.ok(!MEANING_SCHEMA.safeParse({ verdicts: [{ id: 'x', verdict: 'fine' }] }).success);
});
