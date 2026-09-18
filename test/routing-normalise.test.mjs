import test from 'node:test';
import assert from 'node:assert/strict';
import { normaliseQuestion, questionKey } from '../lib/routing/normalise.mjs';

// The exact-match rung of the router serves one staff member the page another
// staff member was shown. Everything here is about the two ways that goes
// wrong: the same question missing the key it already has, and a DIFFERENT
// question being handed one.

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

test('nothing left after the politeness is an empty key, not a crash', () => {
  assert.equal(normaliseQuestion('hi please'), '');
  assert.equal(normaliseQuestion(''), '');
  assert.equal(normaliseQuestion(null), '');
  assert.equal(questionKey('hi please'), questionKey(''));
});
