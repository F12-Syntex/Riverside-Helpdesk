import test from 'node:test';
import assert from 'node:assert/strict';
import { parseExtracted, MAX_FOUND } from '../lib/questions/extract.mjs';

test('reads the object the prompt asks for', () => {
  const raw = JSON.stringify({ questions: [
    { question: 'Who orders the flu vaccines?', detail: 'Raised by the practice manager.' },
    { question: 'Where is the spare printer toner kept?', detail: '' },
  ] });
  assert.deepEqual(parseExtracted(raw), [
    { question: 'Who orders the flu vaccines?', detail: 'Raised by the practice manager.' },
    { question: 'Where is the spare printer toner kept?', detail: '' },
  ]);
});

test('survives a code fence, prose round the JSON, a bare array and plain strings', () => {
  assert.equal(parseExtracted('```json\n{"questions":[{"question":"A?"}]}\n```').length, 1);
  assert.equal(parseExtracted('Here you go: {"questions":[{"question":"A?"}]} Hope that helps').length, 1);
  assert.deepEqual(parseExtracted('["Who locks up on Fridays?"]'), [{ question: 'Who locks up on Fridays?', detail: '' }]);
});

test('drops empties, near-duplicates and anything the store would refuse', () => {
  const raw = JSON.stringify({ questions: [
    { question: '  ' },
    { question: 'Who orders the flu vaccines?' },
    { question: 'Hi, who orders the flu vaccines' },
    { question: '/stats' },
    null,
  ] });
  assert.deepEqual(parseExtracted(raw).map((q) => q.question), ['Who orders the flu vaccines?']);
});

test('collapses whitespace and caps how many come back', () => {
  const many = Array.from({ length: MAX_FOUND + 10 }, (_, i) => ({ question: `Question   number\n${i}?` }));
  const out = parseExtracted(JSON.stringify({ questions: many }));
  assert.equal(out.length, MAX_FOUND);
  assert.equal(out[0].question, 'Question number 0?');
});

test('nothing usable reads as an empty list, not an error', () => {
  assert.deepEqual(parseExtracted(''), []);
  assert.deepEqual(parseExtracted('I could not find any questions.'), []);
  assert.deepEqual(parseExtracted('{"questions":"none"}'), []);
});
