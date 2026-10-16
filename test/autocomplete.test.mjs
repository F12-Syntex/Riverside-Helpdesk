// SUGGESTIONS AS YOU TYPE — from what the page already holds, nothing sent.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSuggestions, completionFor, related, suggest, SUGGEST_MAX_INPUT } from '../lib/autocomplete.mjs';

const all = buildSuggestions({
  notes: [
    { id: 1, title: 'Referrals', isSection: true },
    { id: 2, title: 'ECG', parentId: 1 },
    { id: 3, title: 'ECG for a child', parentId: 1 },
    { id: 4, title: 'Dermatology', parentId: 1 },
    { id: 5, title: 'Fit notes' },
    { id: 6, title: 'Untitled' },
  ],
  guides: [{ id: 'g1', question: 'How do I book an appointment?' }],
  contacts: [{ id: 'c1', label: 'Homerton Hospital switchboard' }],
  modes: [
    { name: '', label: 'Q&A' },
    { name: 'accurx', label: 'AccurX', icon: 'inbox', summary: 'Route a request' },
    { name: 'form', label: 'Referral form', icon: 'file', summary: 'Find a form' },
  ],
  recent: ['how do I do a fit note extension'],
});

const labels = (xs) => xs.map((x) => x.label);

test('sections and untitled pages are not suggested', () => {
  assert.ok(!labels(all).includes('Referrals'));
  assert.ok(!labels(all).includes('Untitled'));
});

test('the start of a word is enough, and the closest match comes first', () => {
  assert.deepEqual(labels(suggest(all, 'ec')), ['ECG', 'ECG for a child']);
  assert.equal(suggest(all, 'derm')[0].label, 'Dermatology');
});

test('one slip in a longer word still finds it', () => {
  assert.equal(suggest(all, 'dermotology')[0].label, 'Dermatology');
});

test('every typed word has to be met', () => {
  assert.deepEqual(labels(suggest(all, 'ecg child')), ['ECG for a child']);
  assert.deepEqual(suggest(all, 'ecg zebra'), []);
});

test('a contact is offered as the question the directory answers', () => {
  const [hit] = suggest(all, 'homerton');
  assert.equal(hit.kind, 'contact');
  assert.equal(hit.value, 'What is the number for Homerton Hospital switchboard?');
  assert.equal(suggest(all, 'phone home')[0].kind, 'contact');
});

test('a question asked earlier on this page comes back', () => {
  const hits = suggest(all, 'fit note');
  assert.equal(hits[0].label, 'Fit notes');
  assert.ok(hits.some((h) => h.kind === 'recent'));
});

test('a slash lists the modes, and only the modes', () => {
  assert.deepEqual(labels(suggest(all, '/')), ['AccurX', 'Referral form']);
  assert.deepEqual(labels(suggest(all, '/acc')), ['AccurX']);
  assert.ok(suggest(all, '/').every((s) => s.kind === 'mode'));
});

test('nothing for one letter, nothing for a paste, nothing for the exact words typed', () => {
  assert.deepEqual(suggest(all, 'e'), []);
  assert.deepEqual(suggest(all, 'ecg '.repeat(Math.ceil(SUGGEST_MAX_INPUT / 4) + 1)), []);
  assert.ok(!labels(suggest(all, 'Dermatology')).includes('Dermatology'));
});

test('the faint completion is only ever the rest of what was typed', () => {
  const top = suggest(all, 'derm')[0];
  assert.equal(completionFor('derm', top), 'atology');
  assert.equal(completionFor('Derm', top), 'atology');
  // Matched loosely, but does not start with it: no completion, never a correction.
  assert.equal(completionFor('dermotology', suggest(all, 'dermotology')[0]), '');
  assert.equal(completionFor('/acc', suggest(all, '/acc')[0]), '');
  assert.equal(completionFor('', top), '');
});

test('related pages: a meaningful shared word is enough, and filler is not', () => {
  const hits = related(all, 'How do I refer a patient for an ECG?');
  assert.deepEqual(hits.map((h) => h.label), ['ECG', 'ECG for a child']);
  assert.deepEqual(related(all, 'how do I get the patient to do it please'), []);
  assert.ok(related(all, 'what about the fit notes').every((h) => h.kind === 'page'));
});

test('related pages leave out what the answer already linked', () => {
  const hits = related(all, 'ECG for a child', { exclude: ['ECG'] });
  assert.deepEqual(hits.map((h) => h.label), []);
  assert.deepEqual(related(all, 'ecg referral', { exclude: ['ECG'] }).map((h) => h.label), ['ECG for a child']);
});

test('a word most titles share does not make pages related', () => {
  const many = buildSuggestions({
    notes: ['Asthma referral', 'Rheumatology referral', 'Paediatric referrals', 'Gym referral', 'ECG', 'Echo', 'Fit notes', 'Smears', 'Travel jabs', 'Flu clinic', 'Registration', 'Home visits']
      .map((title, i) => ({ id: i, title })),
  });
  assert.deepEqual(related(many, 'How do I refer for an ECG?').map((h) => h.label), ['ECG']);
  assert.deepEqual(related(many, 'asthma referral form').map((h) => h.label), ['Asthma referral']);
});
