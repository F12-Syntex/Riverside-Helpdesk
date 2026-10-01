import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanPoints, cleanTitle, parseReformatted, parseTemplate, questionKey, reformatItems, rowPoints,
} from '../lib/questions/template.mjs';

const PASTED = `Chest pain clinic type (C15)

* Rapid Access Chest Pain Clinic card: speciality Cardiology, clinic type "Ischaemic Heart Disease", pathway "RAS Rapid Access Chest Pain Clinic - Cardiology Department - Homerton - RQX", always urgent.
* All specialities and clinic types list: Cardiology has both "Ischaemic Heart Disease" and a separate "Rapid Access Chest Pain" clinic type.
* Question: Which clinic type do we select?`;

test('the pasted template reads into title, word-for-word points and the question', () => {
  assert.deepEqual(parseTemplate(PASTED), {
    title: 'Chest pain clinic type (C15)',
    points: [
      'Rapid Access Chest Pain Clinic card: speciality Cardiology, clinic type "Ischaemic Heart Disease", pathway "RAS Rapid Access Chest Pain Clinic - Cardiology Department - Homerton - RQX", always urgent.',
      'All specialities and clinic types list: Cardiology has both "Ischaemic Heart Disease" and a separate "Rapid Access Chest Pain" clinic type.',
    ],
    question: 'Which clinic type do we select?',
  });
});

test('a last line ending in "?" is the question when there is no Question: line', () => {
  assert.deepEqual(parseTemplate('Flu clinic\n- Saturdays only\n- Who books them?'), {
    title: 'Flu clinic', points: ['Saturdays only'], question: 'Who books them?',
  });
  assert.deepEqual(parseTemplate('- Saturdays only\nWho books them?'), { title: '', points: ['Saturdays only'], question: 'Who books them?' });
});

test('a plain question is not a template', () => {
  assert.equal(parseTemplate('Who covers the phones at lunch?'), null);
  assert.equal(parseTemplate('Some notes\nwith no question in them'), null);
});

test('points lose their bullet marks and nothing else', () => {
  assert.deepEqual(cleanPoints('* one\n- two  words\n• three\n1. four\n\n  '), ['one', 'two words', 'three', 'four']);
  assert.deepEqual(cleanPoints(['  "Quoted" — exactly, as given. ', null, '']), ['"Quoted" — exactly, as given.']);
  assert.equal(cleanTitle('  Chest pain clinic type (C15):  '), 'Chest pain clinic type (C15)');
});

test('the same question under two titles is two questions', () => {
  assert.notEqual(questionKey({ title: 'Chest pain (C15)', question: 'Which clinic type?' }), questionKey({ title: 'Diabetes (D2)', question: 'Which clinic type?' }));
  assert.equal(questionKey({ question: 'Which clinic type?' }), 'which clinic type');
});

test('the reformat reply is checked against the rows that were sent', () => {
  const rows = [{ id: 4, question: 'Q4?', detail: 'note' }, { id: 5, question: 'Q5?' }];
  const raw = '```json\n' + JSON.stringify({ items: [
    { id: 4, title: 'Four', points: ['note'], question: 'Q4?' },
    { id: 4, title: 'again', points: [], question: 'dup' },
    { id: 9, title: 'not sent', points: [], question: 'x' },
    { id: 5, title: '', points: [], question: '  ' },
  ] }) + '\n```';
  assert.deepEqual(parseReformatted(raw, rows), [{ id: 4, title: 'Four', points: ['note'], question: 'Q4?' }]);
  assert.ok(reformatItems(rows).includes('"notes":"note"'));
});

test('points read back from the database as an array', () => {
  assert.deepEqual(rowPoints(['a', ' b ']), ['a', 'b']);
  assert.deepEqual(rowPoints('["a"]'), ['a']);
  assert.deepEqual(rowPoints(null), []);
});
