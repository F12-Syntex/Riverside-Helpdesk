import test from 'node:test';
import assert from 'node:assert/strict';
import {
  rankPages, buildShortlist, fullShortlist, shortlistText, OTHER_PAGES_HEADING,
} from '../lib/search/shortlist.mjs';
import { shortlistQuery } from '../lib/search/query.mjs';
import { notebookFullText } from '../lib/templates/route.mjs';

// An invented Notebook, in the shape fullNotebookContext() returns.
const NOW = Date.parse('2026-10-10T12:00:00Z');
const DAY = 24 * 3600 * 1000;
const page = (id, title, text, updatedAt = new Date(NOW - DAY)) => ({
  id: `note:${id}:full`, docId: `note:${id}`, docTitle: `Notebook: ${title}`, text, updatedAt,
});
const PAGES = [
  page(1, 'Referrals / District nurses', 'Refer housebound patients to the district nurses by email.'),
  page(2, 'Reception / Sick notes', 'Fit notes are done by the GP.'),
  page(3, 'Referrals / ECG', 'ECG requests go by email.'),
  page(4, 'Reception / Complaints', 'Complaints go to the practice manager.'),
  page(5, 'Admin / Rota', 'The rota is on the shared drive.'),
];
const hit = (entryId, score) => ({ entryId, score });

test('rankPages orders pages by their best passage score and drops unknown ids', () => {
  const ranked = rankPages([
    hit('note:3', 0.5), hit('note:1', 0.9), hit('note:3', 0.95),
    hit('note:99', 1), hit('document:policy', 2),
  ], PAGES);
  assert.deepEqual(ranked.map((p) => p.docId), ['note:3', 'note:1']);
});

test('rankPages reads a score that arrives as a string', () => {
  const ranked = rankPages([hit('note:2', '0.01'), hit('note:4', '0.02')], PAGES);
  assert.deepEqual(ranked.map((p) => p.docId), ['note:4', 'note:2']);
});

test('buildShortlist caps the ranked pages at size', () => {
  const s = buildShortlist({ ranked: PAGES, pages: PAGES, size: 3, now: NOW });
  assert.equal(s.full, false);
  assert.deepEqual(s.pages.map((p) => p.docId), ['note:1', 'note:2', 'note:3']);
  assert.deepEqual(s.why, { 'note:1': 'match', 'note:2': 'match', 'note:3': 'match' });
});

test('recently edited pages join the shortlist', () => {
  const pages = PAGES.map((p) => ({ ...p }));
  pages[3].updatedAt = new Date(NOW - 10 * 60 * 1000); // ten minutes ago
  pages[4].updatedAt = new Date(NOW - 2 * 3600 * 1000); // two hours ago
  const s = buildShortlist({ ranked: [pages[0]], pages, size: 12, now: NOW });
  assert.deepEqual(s.pages.map((p) => p.docId), ['note:1', 'note:4']);
  assert.equal(s.why['note:4'], 'recent');
  assert.equal(s.why['note:5'], undefined);
});

test('a recent page that already matched stays a match and is not repeated', () => {
  const pages = PAGES.map((p) => ({ ...p }));
  pages[0].updatedAt = new Date(NOW - 60 * 1000);
  const s = buildShortlist({ ranked: [pages[0]], pages, size: 12, now: NOW });
  assert.deepEqual(s.pages.map((p) => p.docId), ['note:1']);
  assert.equal(s.why['note:1'], 'match');
});

test('recent pages are capped at five, newest first', () => {
  const pages = Array.from({ length: 8 }, (_, i) => page(i + 1, 'P' + (i + 1), 'x', new Date(NOW - (i + 1) * 60 * 1000)));
  // Shuffle so "newest first" is the shortlist's doing, not the fixture's.
  const shuffled = [pages[5], pages[2], pages[7], pages[0], pages[4], pages[1], pages[6], pages[3]];
  const s = buildShortlist({ ranked: [], pages: shuffled, size: 12, now: NOW });
  assert.deepEqual(s.pages.map((p) => p.docId), ['note:1', 'note:2', 'note:3', 'note:4', 'note:5']);
  assert.ok(Object.values(s.why).every((w) => w === 'recent'));
});

test('a page with no edit time is never counted as recent', () => {
  const pages = [page(1, 'A', 'a', null), page(2, 'B', 'b', 'not a date')];
  const s = buildShortlist({ ranked: [], pages, size: 12, now: NOW });
  assert.deepEqual(s.pages, []);
});

test('shortlistText shows shortlisted pages in full and every other title once', () => {
  const s = buildShortlist({ ranked: [PAGES[1], PAGES[3]], pages: PAGES, size: 12, now: NOW });
  const text = shortlistText(s, PAGES);
  assert.equal(text, [
    '### Notebook: Reception / Sick notes\nFit notes are done by the GP.',
    '### Notebook: Reception / Complaints\nComplaints go to the practice manager.',
    OTHER_PAGES_HEADING + '\n'
      + '- Notebook: Referrals / District nurses\n'
      + '- Notebook: Referrals / ECG\n'
      + '- Notebook: Admin / Rota',
  ].join('\n\n'));
  assert.equal(OTHER_PAGES_HEADING, 'OTHER PAGES (titles only, text not shown):');
  for (const p of PAGES) {
    assert.equal(text.split(p.docTitle).length - 1, 1, p.docTitle + ' appears exactly once');
  }
  assert.ok(!text.includes('Refer housebound patients'), 'a titles-only page shows no text');
});

test('a full shortlist is exactly the whole Notebook text', () => {
  const s = fullShortlist(PAGES, 'no-text');
  assert.deepEqual(s, { full: true, pages: PAGES, why: {}, reason: 'no-text' });
  assert.equal(shortlistText(s, PAGES), notebookFullText(PAGES));
});

test('an empty shortlist is only the titles block', () => {
  const s = buildShortlist({ ranked: [], pages: PAGES, size: 12, now: NOW });
  assert.equal(shortlistText(s, PAGES), OTHER_PAGES_HEADING + '\n' + PAGES.map((p) => '- ' + p.docTitle).join('\n'));
});

test('a shortlist holding every page has no titles block', () => {
  const s = buildShortlist({ ranked: PAGES, pages: PAGES, size: 12, now: NOW });
  const text = shortlistText(s, PAGES);
  assert.ok(!text.includes(OTHER_PAGES_HEADING));
  assert.equal(text, notebookFullText(PAGES));
});

test('shortlistQuery includes the previous user message', () => {
  const history = [
    'Staff member: how do I refer to the district nurse?',
    'The assistant answered: Email the district nurses.',
  ].join('\n');
  const q = shortlistQuery({ question: 'and for children?', history });
  assert.match(q, /and for children\?/);
  assert.match(q, /how do I refer to the district nurse\?/);
  assert.doesNotMatch(q, /Email the district nurses/, 'what the assistant said is not the subject');
  assert.doesNotMatch(q, /Staff member:/, 'the speaker label is not a search word');
});

test('shortlistQuery takes only the LAST user message, all of its lines', () => {
  const history = [
    'Staff member: where is the rota?',
    'The assistant answered: On the shared drive.',
    'Staff member: a patient needs a dressing at home',
    'she is housebound',
    'The assistant answered: Refer to the district nurses.',
  ].join('\n');
  const q = shortlistQuery({ question: 'what form?', history });
  assert.match(q, /dressing at home/);
  assert.match(q, /she is housebound/);
  assert.doesNotMatch(q, /rota/);
  assert.doesNotMatch(q, /Refer to the district nurses/);
});

test('shortlistQuery leads with the question, adds attached text, and is capped', () => {
  assert.equal(shortlistQuery({ question: '  ecg?  ' }), 'ecg?');
  assert.equal(shortlistQuery({ question: '', history: '', attached: '' }), '');
  const attached = 'x'.repeat(5000);
  const q = shortlistQuery({ question: 'what is this letter', attached });
  assert.ok(q.startsWith('what is this letter\n'));
  assert.equal(q.length, 'what is this letter\n'.length + 1000);
  const long = shortlistQuery({ question: 'q'.repeat(3000) });
  assert.equal(long.length, 2000);
});

test('a long previous message cannot push the question out of the query', () => {
  const history = 'Staff member: ' + Array.from({ length: 60 }, (_, i) => 'word' + i).join(' ');
  const q = shortlistQuery({ question: 'district nurse referral', history });
  assert.ok(q.startsWith('district nurse referral'));
});
