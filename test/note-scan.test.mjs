import test from 'node:test';
import assert from 'node:assert/strict';
import { scanNotes, scanEvent, chosenOnScan, scanTerms } from '../lib/agent/note-scan.mjs';

// An invented Notebook, in the shape fullNotebookContext() returns.
const page = (path, text) => ({ docTitle: 'Notebook: ' + path.join(' / '), path, text });
const PAGES = [
  page(['Referrals', 'Gynaecology'], 'Refer on e-RS to the A+G clinic.'),
  page(['Reception', 'Sick notes'], 'Fit notes are done by the GP.'),
  page(['Referrals', 'ECG'], 'ECG requests go by email.'),
  page(['Reception', 'Complaints'], 'Complaints go to the practice manager.'),
];

test('the question keeps its own words and drops the glue', () => {
  assert.deepEqual(scanTerms('How do I refer a patient for an ECG?'), ['refer', 'ecg']);
});

test('every page is counted, in section order, and title matches rank first', () => {
  const scan = scanNotes('ecg referral', PAGES);
  assert.equal(scan.total, 4);
  assert.deepEqual(scan.sections, [{ name: 'Reception', count: 2 }, { name: 'Referrals', count: 2 }]);
  assert.equal(scan.matches[0].title, 'ECG');
  assert.equal(scan.matches[0].section, 'Referrals');
  assert.equal(scan.matched, 2);
});

test('the wire event carries no server-side helpers', () => {
  const event = scanEvent(scanNotes('complaints', PAGES));
  assert.equal(event.type, 'progress');
  assert.equal(event.stage, 'notes');
  assert.equal(event.find, undefined);
  assert.equal(event.rowAt, undefined);
  assert.doesNotThrow(() => JSON.stringify(event));
});

test('a chosen page is placed by its full title or its own name', () => {
  const scan = scanNotes('complaints', PAGES);
  const byFull = chosenOnScan(scan, ['Notebook: Reception / Complaints']);
  const byName = chosenOnScan(scan, ['complaints']);
  assert.equal(byFull.length, 1);
  assert.deepEqual(byFull, byName);
  assert.equal(byFull[0].title, 'Complaints');
  assert.deepEqual(chosenOnScan(scan, ['Not a page']), []);
});
