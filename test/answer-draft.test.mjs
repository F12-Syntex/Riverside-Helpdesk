// The streamed answer: what of the text so far may be shown (lib/agent/draft.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';

import { draftThrottle, settledDraft } from '../lib/agent/draft.mjs';

test('settled text is shown whole', () => {
  assert.equal(settledDraft('District nurse referrals go by email.'), 'District nurse referrals go by email.');
  assert.equal(settledDraft(''), '');
  assert.equal(settledDraft(null), '');
});

test('a number still being written is held back until it ends', () => {
  assert.equal(settledDraft('Call 020 7'), 'Call ');
  assert.equal(settledDraft('Call 020 7946 '), 'Call ');
  assert.equal(settledDraft('Call +44 20'), 'Call ');
  // Once something that is not part of a number follows, it is whole. A full
  // stop can be part of one ("020.7946.0000"), so it waits for the next word.
  assert.equal(settledDraft('Call 020 7946 0000. Then'), 'Call 020 7946 0000. Then');
  assert.equal(settledDraft('Call 020 7946 0000.'), 'Call ');
  assert.equal(settledDraft('Use the 2WW form'), 'Use the 2WW form');
});

test('a citation still being written is held back until it closes', () => {
  assert.equal(settledDraft('See [[Notebook: Referrals / Dist'), 'See ');
  assert.equal(settledDraft('See [[Notebook: Referrals / District Nurse]] for'), 'See [[Notebook: Referrals / District Nurse]] for');
  // An earlier closed one stays; only the open one at the end goes.
  assert.equal(settledDraft('[[Notebook: A / B]] and [[Notebook: C'), '[[Notebook: A / B]] and ');
});

test('the throttle lets one draft through per interval', () => {
  const due = draftThrottle(100);
  assert.equal(due(0), true);
  assert.equal(due(50), false);
  assert.equal(due(100), true);
  assert.equal(due(150), false);
  assert.equal(due(260), true);
});
