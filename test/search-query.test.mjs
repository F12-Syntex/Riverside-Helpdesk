import test from 'node:test';
import assert from 'node:assert/strict';
import { orQuery, previousUserMessage } from '../lib/search/query.mjs';

// The lexical arm ORs the question's words. A natural-language question under
// AND matches almost nothing, because no page contains "how", "do" and "I"
// beside the words that matter; Postgres drops the stop words itself.

test('orQuery ORs every lower-cased word, in order', () => {
  assert.equal(orQuery('How do I refer to the District Nurse?'), 'how | do | refer | to | the | district | nurse');
});

test('orQuery keeps digits and drops one-letter fragments', () => {
  // "o'brien" splits at the apostrophe; the lone "o" is too short to search on.
  assert.equal(orQuery("2WW o'brien"), '2ww | brien');
});

test('orQuery is empty when there are no words', () => {
  assert.equal(orQuery('?? !!'), '');
  assert.equal(orQuery(''), '');
  assert.equal(orQuery(null), '');
});

test('orQuery repeats no word and stops at 24', () => {
  assert.equal(orQuery('nurse Nurse NURSE district'), 'nurse | district');
  const many = Array.from({ length: 30 }, (_, i) => 'w' + i).join(' ');
  const words = orQuery(many).split(' | ');
  assert.equal(words.length, 24);
  assert.equal(words[23], 'w23');
});

test('orQuery output carries nothing to_tsquery could read as syntax', () => {
  assert.equal(orQuery("a & b | c ! (d) 'e':* <-> f"), '');
  assert.equal(orQuery('blood&tests|today'), 'blood | tests | today');
});

// The staff member's previous message, for the answer check: "and for
// children?" is not a question on its own.

test('previousUserMessage is the staff member’s last message, not the assistant’s answer', () => {
  const history = [
    'Staff member: how do I refer to the district nurse?',
    'The assistant answered: Email the district nurses.',
  ].join('\n');
  assert.equal(previousUserMessage(history), 'how do I refer to the district nurse?');
});

test('previousUserMessage takes only the LAST user message, all of its lines', () => {
  const history = [
    'Staff member: where is the rota?',
    'The assistant answered: On the shared drive.',
    'Staff member: a patient needs a dressing at home',
    'she is housebound',
    'The assistant answered: Refer to the district nurses.',
  ].join('\n');
  assert.equal(previousUserMessage(history), 'a patient needs a dressing at home\nshe is housebound');
  assert.equal(previousUserMessage(''), '');
});
