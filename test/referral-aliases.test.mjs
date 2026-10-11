// The words a reader says for a referral (lib/search/referral-aliases.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';

import { ALIAS_GROUPS, conceptsOf, nameSays, searchWords, tokens } from '../lib/search/referral-aliases.mjs';

const has = (concept, phrase) => concept.terms.some((t) => t.join(' ') === phrase);

test('tokens: lower case, plain hyphens, letters and digits only', () => {
  assert.deepEqual(tokens('2‑Week‑Wait (2WW) Dermatology'), ['2', 'week', 'wait', '2ww', 'dermatology']);
  assert.deepEqual(tokens('ECG and 48-hour tape'), ['ecg', 'and', '48', 'hour', 'tape']);
  assert.deepEqual(tokens(''), []);
});

test('a word in a group stands for the whole group', () => {
  const [skin] = conceptsOf('skin');
  assert.ok(has(skin, 'dermatology') && has(skin, 'teledermatology'));
  assert.equal(skin.typed, false);
  // One typo in a word of five letters or more still finds its group.
  assert.ok(has(conceptsOf('ezcema')[0], 'dermatology'));
});

test('phrases are taken longest first', () => {
  const concepts = conceptsOf('heart tracing');
  assert.equal(concepts.length, 1);
  assert.ok(has(concepts[0], 'ecg'));
  assert.ok(!has(concepts[0], 'cardiology'));
  assert.ok(has(conceptsOf('camera down throat')[0], 'endoscopy'));
});

test('words of one group are one concept; stop words go; an unknown word is its own', () => {
  const nurse = conceptsOf('nurse to visit at home');
  assert.equal(nurse.length, 1);
  assert.deepEqual(nurse[0].words, ['nurse', 'visit', 'home']);
  assert.equal(conceptsOf('cancer skin').length, 2);
  const [odd] = conceptsOf('qwerty');
  assert.deepEqual(odd, { words: ['qwerty'], terms: [['qwerty']], typed: true });
  assert.deepEqual(conceptsOf('to the at'), []);
});

test('a typed word matches loosely; an alias only as a whole word', () => {
  const name = tokens('Rheumatology referral · HOMERTON UNIVERSITY HOSPITAL · Diagnostic Physiological Measurement');
  // Typed: a start, and two typos in a long word.
  assert.ok(nameSays(name, ['rheum'], { typed: true }));
  assert.ok(nameSays(name, ['rhumotology'], { typed: true }));
  // Alias: "home" is not "Homerton", "physio" is not "Physiological".
  assert.ok(!nameSays(name, ['home']));
  assert.ok(!nameSays(name, ['physio']));
  // A long alias inside a word: "dermatology" in "teledermatology".
  assert.ok(nameSays(tokens('2WW Teledermatology'), ['dermatology']));
  // A phrase matches its words in order.
  assert.ok(nameSays(tokens('Echo · heart scan'), ['heart', 'scan']));
  assert.ok(!nameSays(tokens('scan heart'), ['heart', 'scan']));
});

test('the keyword search is given every term of every concept', () => {
  const words = searchWords(conceptsOf('skin')).split(' ');
  assert.ok(words.includes('dermatology') && words.includes('skin'));
});

test('every alias term is lower case and non-empty', () => {
  for (const group of ALIAS_GROUPS) {
    assert.ok(group.length >= 2);
    for (const term of group) assert.equal(term, term.toLowerCase().trim());
  }
});
