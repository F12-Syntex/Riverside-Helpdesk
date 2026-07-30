import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_QUESTION_CHARS,
  SIMILARITY_THRESHOLD,
  isCacheableAnswer,
  isCacheableRequest,
  normaliseQuestion,
  questionKey,
} from '../lib/answer-cache/match.mjs';

// The cache serves one staff member the answer another staff member was given.
// Everything here is about the two ways that goes wrong: the same question
// missing the answer it already has, and a DIFFERENT question being handed one.

test('wording that differs only in case, punctuation or politeness is one key', () => {
  const key = questionKey('How do I report a significant event?');
  for (const q of [
    'how do i report a significant event',
    'How do I report a significant event??',
    'Hi, how do I report a significant event please?',
    'Please can you tell me how do I report a significant event',
    '  How do I report a significant event  ',
    'How do I report a significant event, thanks',
  ]) assert.equal(questionKey(q), key, q);
});

test('a different question keeps a different key', () => {
  const event = questionKey('How do I report a significant event?');
  for (const q of [
    'How do I report a data breach?',
    'Who do I report a significant event to?',
    'How do I report a significant event for a child?',
  ]) assert.notEqual(questionKey(q), event, q);
});

test('normalising keeps the words and drops everything else', () => {
  assert.equal(normaliseQuestion('  What is the COMPLAINTS procedure? '), 'what is the complaints procedure');
  // Apostrophes and hyphens live inside words and change the words when removed.
  assert.equal(normaliseQuestion('What is a 2-week-wait referral?'), 'what is a 2-week-wait referral');
  assert.equal(normaliseQuestion('Where is the patient’s summary?'), "where is the patient's summary");
  // Smart quotes, stray marks and doubled spaces are noise.
  assert.equal(normaliseQuestion('“Repeat”   prescriptions — how?'), 'repeat prescriptions how');
});

test('a follow-up or an attached image is always answered fresh', () => {
  const question = 'How do I report a significant event?';
  assert.equal(isCacheableRequest({ question }), true);
  // "And if they refuse?" means nothing without the conversation it belongs to.
  assert.equal(isCacheableRequest({ question, history: 'Staff member: something earlier' }), false);
  // An image is unique to the message it arrived with.
  assert.equal(isCacheableRequest({ question, images: ['data:image/png;base64,AAAA'] }), false);
});

test('what is too short to identify, and too long to be a question, is not cached', () => {
  assert.equal(isCacheableRequest({ question: '' }), false);
  assert.equal(isCacheableRequest({ question: 'ok?' }), false);
  assert.equal(isCacheableRequest({ question: 'hi please' }), false, 'nothing left after the politeness');
  // A pasted letter or report is a one-off, not a question asked twice.
  assert.equal(isCacheableRequest({ question: 'x'.repeat(MAX_QUESTION_CHARS + 1) }), false);
});

test('only a real, answerable staff answer is worth keeping', () => {
  assert.equal(isCacheableAnswer({ kind: 'answer', answerable: true, sections: [{ markdown: 'Do this.' }] }), true);
  assert.equal(isCacheableAnswer({ kind: 'answer', answerable: true, sections: [], message: 'Dear patient…' }), true);

  // A triage and a filing title are about one patient's message and one pasted
  // document — they are never the answer to somebody else's question.
  assert.equal(isCacheableAnswer({ kind: 'triage', urgency: 'urgent' }), false);
  assert.equal(isCacheableAnswer({ kind: 'docfile', title: '(01-Jan-2026) Hospital' }), false);

  // "I could not find anything" is exactly what should be tried again once the
  // Notebook covers it, so it is never stored.
  assert.equal(isCacheableAnswer({ kind: 'answer', answerable: false, sections: [] }), false);
  assert.equal(isCacheableAnswer({ kind: 'answer', answerable: true, sections: [{ markdown: '  ' }], message: '' }), false);
  assert.equal(isCacheableAnswer(null), false);
});

test('the similarity bar stays high enough to keep two questions apart', () => {
  // Serving the wrong answer to a receptionist is worse than making them wait,
  // so this must not be quietly lowered towards "related topic" territory.
  assert.ok(SIMILARITY_THRESHOLD >= 0.9 && SIMILARITY_THRESHOLD < 1, String(SIMILARITY_THRESHOLD));
});
