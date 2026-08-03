// The general request — "format this email", "shorten this" — and the shape it
// is allowed to come back in.
//
// The composer itself needs a model, so what is pinned down here is the part
// that decides what reaches the reader: that a general answer never claims a
// source, that an empty one is not passed off as an answer, and that a loop
// which recognised the request is not sent round again on the expensive model.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGeneralAnswer } from '../lib/agent/general.mjs';
import { shouldEscalateResearch } from '../lib/agent/research-model.mjs';

const draft = (over = {}) => ({
  handled: true,
  declineReason: '',
  intro: 'Tidied up and shortened.',
  sections: [{ heading: 'What changed', markdown: 'Cut the repetition and split it into two paragraphs.' }],
  message: 'Dear [name],\n\nYour blood test is booked.\n\nKind regards',
  tip: '',
  followUps: [],
  ...over,
});

test('a general section cites nothing and is marked as neither practice nor web', () => {
  const answer = buildGeneralAnswer(draft());
  assert.equal(answer.handled, true);
  assert.equal(answer.sections.length, 1);
  const [section] = answer.sections;
  assert.equal(section.basis, 'general');
  assert.equal(section.cite, null);
  assert.equal(section.web, null);
  assert.equal(section.ref, '');
  // Nothing the assistant writes off its own bat may shout at the reader in red:
  // a critical block is for a safety rule a source actually records.
  assert.equal(section.critical, false);
});

test('the drafted wording survives verbatim, line breaks and all', () => {
  const answer = buildGeneralAnswer(draft());
  assert.equal(answer.message, 'Dear [name],\n\nYour blood test is booked.\n\nKind regards');
});

test('a section with no text is dropped rather than shown as an empty block', () => {
  const answer = buildGeneralAnswer(draft({
    sections: [{ heading: 'Empty', markdown: '   ' }, { heading: '', markdown: 'Real content.' }],
  }));
  assert.equal(answer.sections.length, 1);
  assert.equal(answer.sections[0].markdown, 'Real content.');
});

test('claiming to have handled it while returning nothing does not count as an answer', () => {
  const answer = buildGeneralAnswer(draft({ sections: [], message: '', intro: 'Of course!' }));
  assert.equal(answer.handled, false);
});

test('a refusal is a refusal, whatever else came back with it', () => {
  const answer = buildGeneralAnswer(draft({
    handled: false,
    declineReason: 'this asks what the practice’s policy is',
  }));
  assert.equal(answer.handled, false);
  assert.match(answer.reason, /policy/);
});

test('follow-ups are deduplicated and capped at two', () => {
  const answer = buildGeneralAnswer(draft({
    followUps: ['Make it shorter still', 'Make it shorter still', 'Translate it', 'A fourth one'],
  }));
  assert.deepEqual(answer.followUps, ['Make it shorter still', 'Translate it']);
});

test('a loop that recognised a general request is not researched again on the reasoning model', () => {
  const escalation = shouldEscalateResearch({
    toolCalls: 0,
    generalTask: 'reformat a pasted email',
    model: 'fast/model',
    reasoning: 'reasoning/model',
  });
  assert.equal(escalation.escalate, false);
});

test('a loop that called no tool at all is still escalated', () => {
  const escalation = shouldEscalateResearch({
    toolCalls: 0,
    model: 'fast/model',
    reasoning: 'reasoning/model',
  });
  assert.equal(escalation.escalate, true);
});
