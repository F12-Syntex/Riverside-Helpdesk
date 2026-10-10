import test from 'node:test';
import assert from 'node:assert/strict';
import { scanShortlist, scanEvent, chosenOnScan, scanTerms } from '../lib/agent/note-scan.mjs';
import { fullShortlist } from '../lib/search/shortlist.mjs';

// An invented Notebook, in the shape fullNotebookContext() returns.
const page = (id, path, text) => ({ docId: 'note:' + id, docTitle: 'Notebook: ' + path.join(' / '), path, text });
const PAGES = [
  page(1, ['Referrals', 'Gynaecology'], 'Refer on e-RS to the A+G clinic.'),
  page(2, ['Reception', 'Sick notes'], 'Fit notes are done by the GP.'),
  page(3, ['Referrals', 'ECG'], 'ECG requests go by email.'),
  page(4, ['Reception', 'Complaints'], 'Complaints go to the practice manager.'),
];
const shortlistOf = (...ids) => ({ full: false, pages: ids.map((id) => PAGES[id - 1]), why: {} });

test('the question keeps its own words and drops the glue', () => {
  assert.deepEqual(scanTerms('How do I refer a patient for an ECG?'), ['refer', 'ecg']);
});

test('every page is counted, in section order, and the shortlist lights in its own order', () => {
  // Search ranked ECG first and Gynaecology second; the grid is section order.
  const scan = scanShortlist(shortlistOf(3, 1), PAGES, { question: 'ecg referral' });
  assert.equal(scan.total, 4);
  assert.deepEqual(scan.sections, [{ name: 'Reception', count: 2 }, { name: 'Referrals', count: 2 }]);
  assert.equal(scan.matched, 2);
  assert.deepEqual(scan.matches.map((m) => m.title), ['ECG', 'Gynaecology']);
  assert.equal(scan.matches[0].section, 'Referrals');
  // Placed where the page sits on the grid, not where it ranked.
  assert.equal(scan.matches[0].index, 2);
  assert.equal(scan.matches[1].index, 3);
  assert.deepEqual(scan.matches[0].terms, ['ecg', 'referral']);
  assert.deepEqual(scan.terms, ['ecg', 'referral']);
});

test('the wire event keeps its keys and carries no server-side helpers', () => {
  const event = scanEvent(scanShortlist(shortlistOf(4), PAGES, { question: 'complaints' }));
  assert.equal(event.type, 'progress');
  assert.equal(event.stage, 'notes');
  assert.deepEqual(Object.keys(event).sort(), ['matched', 'matches', 'sections', 'stage', 'terms', 'total', 'type']);
  assert.deepEqual(Object.keys(event.matches[0]).sort(), ['index', 'section', 'terms', 'title']);
  assert.equal(event.find, undefined);
  assert.equal(event.rowAt, undefined);
  assert.doesNotThrow(() => JSON.stringify(event));
});

test('only the first six shortlisted pages are named', () => {
  const many = Array.from({ length: 10 }, (_, i) => page(i + 1, ['S', 'P' + i], 'x'));
  const scan = scanShortlist({ full: false, pages: many, why: {} }, many, { question: 'x' });
  assert.equal(scan.matched, 10);
  assert.equal(scan.matches.length, 6);
});

test('a whole-Notebook shortlist singles no page out', () => {
  const scan = scanShortlist(fullShortlist(PAGES, 'search-failed'), PAGES, { question: 'complaints' });
  assert.equal(scan.matched, 4);
  assert.deepEqual(scan.matches, []);
});

test('a chosen page is placed by its full title or its own name', () => {
  const scan = scanShortlist(shortlistOf(4), PAGES, { question: 'complaints' });
  const byFull = chosenOnScan(scan, ['Notebook: Reception / Complaints']);
  const byName = chosenOnScan(scan, ['complaints']);
  assert.equal(byFull.length, 1);
  assert.deepEqual(byFull, byName);
  assert.equal(byFull[0].title, 'Complaints');
  assert.deepEqual(chosenOnScan(scan, ['Not a page']), []);
});

test('a chosen page outside the shortlist is still placed on the grid', () => {
  // The picker may name a page from the titles-only list.
  const scan = scanShortlist(shortlistOf(3), PAGES, { question: 'sick notes' });
  assert.deepEqual(chosenOnScan(scan, ['Notebook: Reception / Sick notes']).map((c) => c.title), ['Sick notes']);
});

test('a chosen title copied with its list or heading marker is still placed', () => {
  const scan = scanShortlist(shortlistOf(4), PAGES, { question: 'complaints' });
  for (const title of ['- Notebook: Reception / Complaints', '### Notebook: Reception / Complaints', '- Complaints']) {
    assert.deepEqual(chosenOnScan(scan, [title]).map((c) => c.title), ['Complaints'], title);
  }
});
