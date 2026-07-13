import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAiJson } from '../lib/ai/prompt.js';
import { normaliseDocDate, resolveDocfileDate, sanitizeDocfileActions, sanitizeDocfileNote } from '../lib/ai/docfile.mjs';

test('normalises short UK dates without changing the day and month', () => {
  assert.equal(normaliseDocDate('7/8/26'), '07-Aug-2026');
  assert.equal(normaliseDocDate('21/06/24'), '21-Jun-2024');
  assert.equal(normaliseDocDate('2026-08-07'), '07-Aug-2026');
  assert.equal(normaliseDocDate('31/02/26'), '');
});

test('prefers a labelled clinical event date over DOB and model output', () => {
  const documentText = 'Date of birth: 21/06/24\nClinic date: 7/8/26\nDear Doctor';
  assert.equal(resolveDocfileDate({
    date: '21-Jun-2024', dateEvidence: '21/06/24', documentText,
  }), '07-Aug-2026');
});

test('rejects a date that is not present in a pasted text document', () => {
  assert.equal(resolveDocfileDate({
    date: '21-Jun-2024', dateEvidence: '21/06/24',
    documentText: 'Clinic date: 7/8/26',
  }), '07-Aug-2026');
  assert.equal(resolveDocfileDate({
    date: '21-Jun-2024', dateEvidence: '21/06/24',
    documentText: 'No date is shown.',
  }), '');
});

test('keeps only concrete practice actions with exact evidence', () => {
  const documentText = [
    'Please arrange repeat U&E in two weeks.',
    'We will review the patient in our clinic in three months.',
  ].join('\n');
  const actions = sanitizeDocfileActions([
    { text: 'repeat U&E 2/52', evidence: 'Please arrange repeat U&E in two weeks.' },
    { text: 'GP to review', evidence: 'We will review the patient in our clinic in three months.' },
    { text: 'GP r/v', evidence: '' },
  ], { documentText });
  assert.deepEqual(actions, ['repeat U&E 2/52']);
});

test('drops generic GP review even when the phrase appears in the document', () => {
  assert.deepEqual(sanitizeDocfileActions([
    { text: 'GP to review', evidence: 'GP to review' },
  ], { documentText: 'GP to review' }), []);
});

test('does not add filing comments without explicit status evidence', () => {
  assert.equal(sanitizeDocfileNote({ note: 'FYI', noteEvidence: '', documentText: 'Routine letter.' }), '');
  assert.equal(sanitizeDocfileNote({
    note: 'pt d/c', noteEvidence: 'The patient was discharged from our service.',
    documentText: 'The patient was discharged from our service.',
  }), 'pt d/c');
});

test('parses docfile evidence fields for server-side validation', () => {
  const parsed = parseAiJson(JSON.stringify({
    kind: 'docfile', date: '07-Aug-2026', dateEvidence: '7/8/26', dateType: 'clinic',
    source: 'Ipswich Hospital', department: 'Cardiology',
    actions: [{ text: 'repeat U&E 2/52', evidence: 'Please arrange repeat U&E in two weeks.' }],
    note: '', noteEvidence: '',
  }));
  assert.equal(parsed.dateEvidence, '7/8/26');
  assert.deepEqual(parsed.actions, [{ text: 'repeat U&E 2/52', evidence: 'Please arrange repeat U&E in two weeks.' }]);
});
