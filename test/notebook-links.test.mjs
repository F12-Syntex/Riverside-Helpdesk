import test from 'node:test';
import assert from 'node:assert/strict';
import { noteSegment, notebookHref, parseNoteRef, resolveNote, slugify } from '../lib/notebook/links.mjs';

const NOTES = [
  { id: 1286, title: 'Pharmacy First: the seven conditions' },
  { id: 1279, title: 'Private letters (non-NHS work)' },
  { id: 1385, title: 'Private letters (non‑NHS work)' },
  { id: 1399, title: 'Self‑care and minor illness advice' },
];

test('a page’s address is its title in words, then its id', () => {
  assert.equal(notebookHref(NOTES[0]), '/notebook/pharmacy-first-the-seven-conditions-1286');
  assert.equal(notebookHref({ id: 7, title: 'Hospital codes & A&E' }), '/notebook/hospital-codes-and-a-and-e-7');
  assert.equal(notebookHref({ id: 9, title: '' }), '/notebook/9');
  assert.equal(slugify('Patient’s   records — “GP Connect”'), 'patients-records-gp-connect');
});

test('long titles are cut at a word, not mid-word', () => {
  const slug = slugify('Hypertension Case‑Finding Service eligibility and referral guidance for reception');
  assert.ok(slug.length <= 60, slug);
  assert.ok(!slug.endsWith('-'));
});

test('the id decides, so a renamed page keeps its links', () => {
  assert.equal(resolveNote(NOTES, 'an-old-title-1286'), NOTES[0]);
  assert.equal(resolveNote(NOTES, '1286'), NOTES[0]);
  assert.deepEqual(parseNoteRef('pharmacy-first-1286'), { id: 1286, slug: 'pharmacy-first' });
});

test('a bare title works only while it names one page', () => {
  assert.equal(resolveNote(NOTES, 'pharmacy-first-the-seven-conditions'), NOTES[0]);
  assert.equal(resolveNote(NOTES, 'self-care-and-minor-illness-advice'), NOTES[3]);
  // Two pages share this title (one with a non-breaking hyphen): not an address.
  assert.equal(resolveNote(NOTES, 'private-letters-non-nhs-work'), null);
  assert.equal(resolveNote(NOTES, 'no-such-page'), null);
});

test('only /notebook/<one segment> names a page', () => {
  assert.equal(noteSegment('/notebook/pharmacy-first-1286'), 'pharmacy-first-1286');
  assert.equal(noteSegment('/notebook'), '');
  assert.equal(noteSegment('/notebook/saves/x'), '');
});
