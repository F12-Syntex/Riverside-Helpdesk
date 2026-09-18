// The question back that the router builds must be accepted by the same
// frontend contract as the picker's — and the picker's, which carries no
// targets, must still render and simply teach nothing.
import assert from 'node:assert/strict';
import test from 'node:test';

import { clarifyPayload } from '../lib/routing/decision.mjs';
import { selectionClarify } from '../lib/templates/route.mjs';

// What app/_components/QaApp.jsx does with a clarify payload, copied rather
// than imported: the component is JSX. If that mapping changes, change this.
function frontend(clarify) {
  const hasClarify = !!(clarify && clarify.question && clarify.options.length);
  const options = (clarify ? clarify.options : []).map((opt, i) => ({
    label: opt,
    target: (clarify.targets && clarify.targets[i]) || null,
  }));
  return { hasClarify, options };
}

const page = (ref, leaf, folder = 'Referrals') => ({
  targetKind: 'note', targetRef: ref, score: 0.03, similarity: 0.9,
  page: { docId: ref, docTitle: `Notebook: ${folder} / ${leaf}` },
});
const leafOf = (c) => c.page.docTitle.split('/').pop().trim();
const pathOf = (c) => c.page.docTitle.replace(/^Notebook:\s*/, '');

test('a router clarify has a question, options and a parallel targets list', () => {
  const clarify = clarifyPayload([page('note:1', 'Blood test'), page('note:2', 'Diabetes blood test')], { labelOf: leafOf, fullLabelOf: pathOf });
  assert.ok(clarify);
  assert.equal(clarify.options.length, 2);
  assert.equal(clarify.targets.length, 2);
  assert.deepEqual(clarify.targets, ['note:1', 'note:2']);
  const view = frontend(clarify);
  assert.equal(view.hasClarify, true);
  assert.equal(view.options[1].target, 'note:2');
});

test('two pages with the same leaf title are told apart by their path', () => {
  const clarify = clarifyPayload([page('note:1', 'Referral', 'Dermatology'), page('note:2', 'Referral', 'Cardiology')], { labelOf: leafOf, fullLabelOf: pathOf });
  assert.deepEqual(clarify.options, ['Dermatology / Referral', 'Cardiology / Referral']);
});

test('one distinct option is not a question', () => {
  assert.equal(clarifyPayload([page('note:1', 'Blood test')], { labelOf: leafOf }), null);
  assert.equal(clarifyPayload([page('note:1', 'Same'), page('note:2', 'Same')], { labelOf: leafOf }), null);
});

test('the picker clarify still renders and carries no targets, so a tap teaches nothing', () => {
  const clarify = selectionClarify({ template: 'ask', askQuestion: 'Which one?', askOptions: ['This', 'That'] });
  assert.ok(clarify);
  assert.equal('targets' in clarify, false);
  const view = frontend(clarify);
  assert.equal(view.hasClarify, true);
  assert.deepEqual(view.options.map((o) => o.target), [null, null]);
});