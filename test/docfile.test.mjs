import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAiJson } from '../lib/ai/prompt.js';
import { normaliseDocDate, resolveDocfileDate, docfileActiveItems, sanitizeDocfileActions, sanitizeDocfileNote } from '../lib/ai/docfile.mjs';

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

test('keeps a labelled discharge date even when a received stamp follows it', () => {
  // The "Received" word belongs to the NEXT date; it must not demote the
  // correctly-labelled discharge date that precedes it.
  const documentText = 'Discharge date: 07/08/2026 Received by practice: 09/08/2026\nFollow-up clinic in 6 weeks.';
  assert.equal(resolveDocfileDate({
    date: '09-Aug-2026', dateEvidence: '09/08/2026', documentText,
  }), '07-Aug-2026');
});

test('does not read a version token like v1.2.34 as the filing date', () => {
  // The only date-like string is a template version footer — there is no real
  // clinical date, so the date must be left blank rather than "01-Feb-2034".
  assert.equal(resolveDocfileDate({
    date: '', dateEvidence: '', documentText: 'Outcome letter. Template v1.2.34. Please file.',
  }), '');
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

test('keeps a new prescription and the current plan, not the story', () => {
  const documentText = [
    'He presented with central chest pain and a history of hypertension.',
    'On examination the chest was clear and observations were stable.',
    'We have started apixaban 5mg BD for three months.',
    'Ramipril has been increased to 10mg OD.',
    'Follow-up in the cardiology clinic in 3 months.',
    'Awaiting the outpatient echo report.',
  ].join('\n');
  const items = docfileActiveItems([
    { text: 'chest pain, known hypertension', evidence: 'He presented with central chest pain and a history of hypertension.' },
    { text: 'chest clear, obs stable', evidence: 'On examination the chest was clear and observations were stable.' },
    { text: 'start apixaban 5mg BD 3/12', evidence: 'We have started apixaban 5mg BD for three months.' },
    { text: 'ramipril increased to 10mg OD', evidence: 'Ramipril has been increased to 10mg OD.' },
    { text: 'cardiology f/u 3/12', evidence: 'Follow-up in the cardiology clinic in 3 months.' },
    { text: 'awaiting echo report', evidence: 'Awaiting the outpatient echo report.' },
  ], { documentText });
  assert.deepEqual(items, [
    { text: 'start apixaban 5mg BD 3/12', kind: 'medication' },
    { text: 'ramipril increased to 10mg OD', kind: 'medication' },
    { text: 'cardiology f/u 3/12', kind: 'plan' },
    { text: 'awaiting echo report', kind: 'plan' },
  ]);
});

test('puts what the practice must do ahead of medication and plan', () => {
  const documentText = [
    'Follow-up in our clinic in 6 weeks.',
    'Amlodipine 5mg OD was started on the ward.',
    'Please arrange U&E in two weeks.',
  ].join('\n');
  const items = docfileActiveItems([
    { text: 'clinic f/u 6/52', evidence: 'Follow-up in our clinic in 6 weeks.' },
    { text: 'start amlodipine 5mg OD', evidence: 'Amlodipine 5mg OD was started on the ward.' },
    { text: 'U&E 2/52', evidence: 'Please arrange U&E in two weeks.' },
  ], { documentText });
  assert.deepEqual(items.map((i) => i.kind), ['task', 'medication', 'plan']);
  assert.deepEqual(sanitizeDocfileActions([
    { text: 'clinic f/u 6/52', evidence: 'Follow-up in our clinic in 6 weeks.' },
    { text: 'start amlodipine 5mg OD', evidence: 'Amlodipine 5mg OD was started on the ward.' },
    { text: 'U&E 2/52', evidence: 'Please arrange U&E in two weeks.' },
  ], { documentText }), ['U&E 2/52', 'start amlodipine 5mg OD', 'clinic f/u 6/52']);
});

test('drops an unchanged repeat list and a whole-sentence life story', () => {
  const story = 'He lives alone in a first floor flat, manages his own shopping, and was independent before this admission with occasional help from his daughter.';
  const documentText = [
    'Current medications: metformin 500mg BD, atorvastatin 20mg ON — no changes made.',
    story,
  ].join('\n');
  assert.deepEqual(docfileActiveItems([
    { text: 'on metformin 500mg BD and atorvastatin 20mg ON', evidence: 'Current medications: metformin 500mg BD, atorvastatin 20mg ON — no changes made.' },
    { text: story, evidence: story },
  ], { documentText }), []);
});

test('reads a discharge summary as task, medication, plan — and nothing else', () => {
  const documentText = [
    'Admitted with community acquired pneumonia. Past medical history: COPD.',
    'On examination: chest crackles at the right base.',
    'Amoxicillin 500mg TDS - 5 day course to complete at home. Ramipril stopped due to AKI.',
    'Please recheck U&E in one week and restart ramipril if renal function has recovered.',
    'Plan: respiratory clinic follow-up in 6 weeks. Awaiting sputum culture results.',
    'GP to review this letter. He stopped smoking in 2019.',
  ].join('\n');
  const items = docfileActiveItems([
    { text: 'admitted with CAP', evidence: 'Admitted with community acquired pneumonia.' },
    { text: 'right basal crackles', evidence: 'On examination: chest crackles at the right base.' },
    { text: 'complete amoxicillin 500mg TDS 5/7', evidence: 'Amoxicillin 500mg TDS - 5 day course to complete at home.' },
    { text: 'ramipril stopped (AKI)', evidence: 'Ramipril stopped due to AKI.' },
    { text: 'recheck U&E 1/52, restart ramipril if renal fn recovered', evidence: 'Please recheck U&E in one week and restart ramipril if renal function has recovered.' },
    { text: 'resp clinic f/u 6/52', evidence: 'Plan: respiratory clinic follow-up in 6 weeks.' },
    { text: 'awaiting sputum culture', evidence: 'Awaiting sputum culture results.' },
    { text: 'GP to review', evidence: 'GP to review this letter.' },
    { text: 'ex-smoker 2019', evidence: 'He stopped smoking in 2019.' },
  ], { documentText });
  assert.deepEqual(items, [
    { text: 'recheck U&E 1/52, restart ramipril if renal fn recovered', kind: 'task' },
    { text: 'complete amoxicillin 500mg TDS 5/7', kind: 'medication' },
    { text: 'ramipril stopped (AKI)', kind: 'medication' },
    { text: 'resp clinic f/u 6/52', kind: 'plan' },
    { text: 'awaiting sputum culture', kind: 'plan' },
  ]);
});

test('caps the live items at six so the title stays a title', () => {
  const lines = Array.from({ length: 9 }, (_, i) => `Please arrange blood test number ${i + 1} in two weeks.`);
  const items = docfileActiveItems(
    lines.map((line, i) => ({ text: `bloods ${i + 1} 2/52`, evidence: line })),
    { documentText: lines.join('\n') },
  );
  assert.equal(items.length, 6);
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
