import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GAP_REASONS, gapLabel, isCollectableQuestion, normaliseQuestion, unansweredReason,
} from '../lib/questions/gaps.mjs';

// The /questions list writes half of itself, off the row the question log
// already stores. Everything about whether that half is trustworthy is in these
// two functions: what counts as "could not answer", and when two askings of the
// same thing are one row.

test('a turn that fell over is collected, and says so rather than blaming the notes', () => {
  assert.equal(unansweredReason({ outcome: 'failed', error: 'out of credit' }), 'failed');
  // It is labelled as the model call it was, so nobody writes a Notebook page
  // to fix an OpenRouter balance.
  assert.equal(gapLabel('failed'), 'The turn failed');
});

test('a card that rendered under its own not-recorded flag is a gap in the practice’s notes', () => {
  assert.equal(unansweredReason({ outcome: 'template', template: 'referral:not-recorded' }), 'not-recorded');
});

test('a template answer is an answer, and is not collected', () => {
  assert.equal(unansweredReason({ outcome: 'template', template: 'referral' }), '');
  assert.equal(unansweredReason({ outcome: 'template', template: 'notebook', answer: 'Ring the hub.' }), '');
});

test('asking back which of two things was meant is not a question that went unanswered', () => {
  assert.equal(unansweredReason({ outcome: 'template', template: 'ask' }), '');
  assert.equal(unansweredReason({ outcome: 'template', template: 'ask:router' }), '');
});

test('prose with no source line stood on general knowledge, so the notes did not cover it', () => {
  assert.equal(
    unansweredReason({ outcome: 'prose', answer: '## Lunch cover\n\nAsk the practice manager.' }),
    'no-page',
  );
});

test('prose that names the page it answered from is an answer from the practice’s own material', () => {
  const answered = { outcome: 'prose', answer: 'Ring the hub on the number in the note.\n\nSource: Out of hours' };
  assert.equal(unansweredReason(answered), '');
  // However it was written — the model is asked for "Source:" and sometimes
  // bolds it, pluralises it, or indents it.
  assert.equal(unansweredReason({ outcome: 'prose', answer: 'x\n\n**Source:** Out of hours' }), '');
  assert.equal(unansweredReason({ outcome: 'prose', answer: 'x\n\n  Sources: A / B' }), '');
});

test('a pasted document or a command is not a question anybody can write a page for', () => {
  assert.equal(isCollectableQuestion('Who covers the phones at lunch?'), true);
  // Coding mode and the other commands are logged with their slash prefix, and
  // the text under them is patient material by design.
  assert.equal(isCollectableQuestion('/coding (12-Mar-2026) letter from cardiology…'), false);
  assert.equal(isCollectableQuestion('x'.repeat(401)), false);
  assert.equal(isCollectableQuestion('   '), false);
});

test('every reason the classifier can return has a row to be shown as', () => {
  const ids = GAP_REASONS.map((r) => r.id);
  for (const turn of [
    { outcome: 'failed' },
    { outcome: 'template', template: 'referral:not-recorded' },
    { outcome: 'prose', answer: 'no source line here' },
  ]) {
    assert.ok(ids.includes(unansweredReason(turn)), 'unlabelled reason for ' + JSON.stringify(turn));
  }
});

test('the same question typed two ways is one row', () => {
  const asked = normaliseQuestion('Who covers the phones at lunch?');
  assert.equal(normaliseQuestion('who covers the phones at lunch'), asked);
  assert.equal(normaliseQuestion('  Who  covers   the phones at LUNCH?? '), asked);
  assert.equal(normaliseQuestion('Please who covers the phones at lunch'), asked);
  assert.equal(normaliseQuestion('Can you tell me who covers the phones at lunch?'), asked);
  assert.equal(normaliseQuestion('Does anyone know who covers the phones at lunch?'), asked);
});

test('two different questions stay two questions', () => {
  // Shallow on purpose: it collapses the wording, never the meaning.
  assert.notEqual(
    normaliseQuestion('how do I refer to dermatology'),
    normaliseQuestion('how do I refer to cardiology'),
  );
  assert.notEqual(normaliseQuestion('derm referral'), normaliseQuestion('how do I refer to dermatology'));
});

test('a question with nothing in it but punctuation normalises to nothing, and is not stored', () => {
  assert.equal(normaliseQuestion('???'), '');
  assert.equal(normaliseQuestion('  '), '');
});
