// The router's decision policy, over synthetic tuples. No database, no model.
//
// What matters is the boundaries: a hit needs BOTH a confident cosine and a
// clear margin; a confident lead with a close runner-up asks back; anything
// less falls through to the picker, which is what "strictly additive" means.
import assert from 'node:assert/strict';
import test from 'node:test';

import { CLARIFY_OPTIONS, RRF_K, decide, fuseCandidates } from '../lib/routing/decision.mjs';

const T = { hitCos: 0.82, askCos: 0.70, minMargin: 0.15 };
// Deliberately NOT the shipped defaults (see lib/routing/thresholds.mjs): the
// policy is what is under test here, not the numbers chosen for the practice.
const cand = (ref, score, similarity) => ({ targetKind: 'note', targetRef: ref, phrase: ref, score, similarity, matches: 1 });

test('an empty candidate set is a miss with nothing to say', () => {
  const v = decide([], T);
  assert.equal(v.decision, 'miss');
  assert.equal(v.target, null);
  assert.deepEqual(v.candidates, []);
});

test('a confident, clear lead is a hit', () => {
  const v = decide([cand('a', 0.03, 0.9), cand('b', 0.02, 0.6)], T);
  assert.equal(v.decision, 'hit');
  assert.equal(v.target.targetRef, 'a');
  assert.ok(v.margin >= T.minMargin);
});

test('the boundaries are inclusive: exactly hitCos and exactly minMargin still hit', () => {
  // confidence 0.82 is exactly hitCos; the cosine gap 0.90 - 0.75 is exactly
  // minMargin once rounded, which is why decide rounds before comparing.
  assert.equal(decide([cand('a', 0.03, 0.82), cand('b', 0.02, 0.67)], T).decision, 'hit');
  const v = decide([cand('a', 0.03, 0.9), cand('b', 0.02, 0.75)], T);
  assert.equal(v.margin, 0.15);
  assert.equal(v.decision, 'hit');
});

test('the margin is a cosine gap, not a gap between fused scores', () => {
  // THIS IS THE BUG THIS TEST EXISTS FOR. Fused scores sit a hair apart by
  // construction: a runner-up one rank behind in both arms scores
  // 1/62 + 1/62 against 1/61 + 1/61, a normalised gap of 0.016 whatever the
  // two pages actually say. Judged that way, nothing could ever be a hit.
  const top = 1 / (RRF_K + 1) + 1 / (RRF_K + 1);
  const next = 1 / (RRF_K + 2) + 1 / (RRF_K + 2);
  assert.ok((top - next) / top < 0.02, 'fused scores are structurally almost equal');

  // Same two fused scores, two very different cosine pictures, two different
  // answers — which is the whole point of reading the calibrated number.
  assert.equal(decide([cand('a', top, 0.93), cand('b', next, 0.61)], T).decision, 'hit');
  assert.equal(decide([cand('a', top, 0.93), cand('b', next, 0.92)], T).decision, 'ambiguous');
});

test('a fused winner that is behind on cosine is ambiguity, not a hit', () => {
  // The lexical arm put "a" first; the vectors disagree. A disagreement
  // between the two arms is exactly when a question should be asked back.
  const v = decide([cand('a', 0.03, 0.84), cand('b', 0.02, 0.95)], T);
  assert.equal(v.margin, 0);
  assert.equal(v.decision, 'ambiguous');
});

test('a confident lead with a close runner-up asks back instead of guessing', () => {
  const v = decide([cand('a', 0.0300, 0.9), cand('b', 0.0299, 0.89)], T);
  assert.equal(v.decision, 'ambiguous');
  assert.equal(v.target, null);
  assert.equal(v.candidates.length, 2);
});

test('below askCos is a miss whatever the margin', () => {
  assert.equal(decide([cand('a', 0.03, 0.69), cand('b', 0.01, 0.2)], T).decision, 'miss');
  assert.equal(decide([cand('a', 0.03, 0.69)], T).decision, 'miss');
});

test('between askCos and hitCos with a clear margin is a miss — the picker decides, not the router', () => {
  const v = decide([cand('a', 0.03, 0.75), cand('b', 0.01, 0.2)], T);
  assert.equal(v.decision, 'miss');
});

test('a single candidate has nobody to be confused with', () => {
  const v = decide([cand('a', 0.03, 0.9)], T);
  assert.equal(v.decision, 'hit');
  assert.equal(v.margin, 1);
});

test('lexical-only rows carry no confidence, so they can never render a page on their own', () => {
  const rows = [{ targetKind: 'note', targetRef: 'a', phrase: '2ww', lexicalRank: 1, semanticRank: null, similarity: null }];
  const v = decide(fuseCandidates(rows), T);
  assert.equal(v.decision, 'miss');
  assert.equal(v.confidence, 0);
});

test('fusion is one candidate per target, scored by its best phrase, ranked by RRF', () => {
  const rows = [
    { targetKind: 'note', targetRef: 'a', phrase: 'a1', lexicalRank: 1, semanticRank: 3, similarity: 0.80 },
    { targetKind: 'note', targetRef: 'a', phrase: 'a2', lexicalRank: null, semanticRank: 1, similarity: 0.91 },
    { targetKind: 'note', targetRef: 'b', phrase: 'b1', lexicalRank: 2, semanticRank: 2, similarity: 0.85 },
  ];
  const fused = fuseCandidates(rows);
  assert.equal(fused.length, 2);
  const a = fused.find((c) => c.targetRef === 'a');
  const b = fused.find((c) => c.targetRef === 'b');
  // a's best phrase: a1 = 1/61 + 1/63; a2 = 1/61 → a1 wins on score, a2 on cosine
  assert.equal(a.matches, 2);
  assert.equal(a.phrase, 'a1');
  assert.equal(a.similarity, 0.91);
  assert.ok(Math.abs(a.score - (1 / (RRF_K + 1) + 1 / (RRF_K + 3))) < 1e-12);
  assert.ok(Math.abs(b.score - (2 / (RRF_K + 2))) < 1e-12);
  assert.equal(fused[0].targetRef, 'a', 'sorted by score, best first');
});

test('the clarify list is capped', () => {
  const many = Array.from({ length: 6 }, (_, i) => cand('p' + i, 0.03 - i * 0.0001, 0.9));
  const v = decide(many, T);
  assert.equal(v.decision, 'ambiguous');
  assert.equal(v.candidates.length, CLARIFY_OPTIONS);
});