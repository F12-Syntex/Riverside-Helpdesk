import test from 'node:test';
import assert from 'node:assert/strict';
import { rankSources, selectSources } from '../lib/agent/select.mjs';

// The writer runs on the most expensive model in the configuration, so what it
// is allowed to read is a cost decision as much as a quality one. These cover
// the rule that matters: the sources that bear on the question survive, and the
// ones that merely turned up do not.

const source = (ref, title, text, kind = 'notebook') => ({ ref, docTitle: title, text, kind });

test('the page that answers the question outranks one that shares a word', () => {
  const sources = [
    source('P1', 'Ordering stationery', 'Order envelopes and paper from the supplier each month.'),
    source('P2', 'Dermatology referrals', 'A suspected skin cancer referral is sent as a two week wait under the Dermatology speciality.'),
  ];
  const [first] = rankSources(sources, 'how do I do a 2ww dermatology skin cancer referral');
  assert.equal(first.source.ref, 'P2');
});

test('the Notebook outranks a document that matches equally well', () => {
  const text = 'Referrals are sent through e-RS with a speciality and a clinic type.';
  const ranked = rankSources([
    source('P1', 'Referral policy', text, 'document'),
    source('P2', 'Referral policy', text, 'notebook'),
  ], 'referral speciality clinic type');
  assert.equal(ranked[0].source.ref, 'P2');
});

test('everything relevant is kept when there is not much of it', () => {
  const sources = [
    source('P1', 'Referrals', 'Send the referral through e-RS.'),
    source('P2', 'Referral priorities', 'A cancer referral is a two week wait referral.'),
  ];
  const { kept, dropped } = selectSources(sources, 'referral');
  assert.deepEqual([...kept].sort(), ['P1', 'P2']);
  assert.equal(dropped.length, 0);
});

test('a greedy fan-out is trimmed to the source cap, best first', () => {
  const sources = Array.from({ length: 12 }, (_, i) =>
    source('P' + (i + 1), 'Page ' + (i + 1), 'referral '.repeat(12 - i) + 'general practice text'));
  const { kept, dropped } = selectSources(sources, 'referral');
  assert.equal(kept.length, 8);
  assert.equal(dropped.length, 4);
  // The best-scoring page must survive; the weakest must be among those dropped.
  assert.ok(kept.includes('P1'));
  assert.ok(dropped.some((d) => d.ref === 'P12'));
});

test('the character budget stops a few enormous pages filling the prompt', () => {
  const sources = [
    source('P1', 'Huge', 'referral ' + 'x'.repeat(20_000)),
    source('P2', 'Also huge', 'referral ' + 'y'.repeat(20_000)),
    source('P3', 'Also huge again', 'referral ' + 'z'.repeat(20_000)),
  ];
  const { kept } = selectSources(sources, 'referral');
  assert.ok(kept.length < 3, 'not every oversized page should reach the writer');
});

test('the single best source is kept even when it alone exceeds the budget', () => {
  const { kept } = selectSources([source('P1', 'Enormous', 'referral ' + 'x'.repeat(50_000))], 'referral');
  assert.deepEqual(kept, ['P1']);
});

test('a question with no usable words keeps sources rather than dropping them all', () => {
  const sources = [source('P1', 'Referrals', 'Send the referral through e-RS.')];
  const { kept } = selectSources(sources, 'the and for');
  assert.deepEqual(kept, ['P1']);
});
