import test from 'node:test';
import assert from 'node:assert/strict';
import { orQuery } from '../lib/search/query.mjs';

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
