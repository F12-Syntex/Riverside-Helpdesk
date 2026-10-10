// The Referrals page's master–detail rules: the address bar and the keys.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_Q, closesOnSearch, findReferral, historyStep, idFromParam, keyAction, paramFromId, readReferralUrl, referralUrl,
  startHighlight,
} from '../lib/search/referrals-view.mjs';

test('a row id and the r parameter convert both ways', () => {
  assert.equal(paramFromId('note:1964'), '1964');
  assert.equal(idFromParam('1964'), 'note:1964');
  assert.equal(idFromParam(paramFromId('note:7')), 'note:7');
  assert.equal(idFromParam('007'), 'note:7');
  assert.equal(paramFromId('odd-id'), 'odd-id');
  assert.equal(idFromParam('odd-id'), 'odd-id');
  assert.equal(paramFromId(null), '');
  assert.equal(idFromParam(''), null);
  assert.equal(idFromParam(null), null);
});

test('the URL is read into the search text and the open referral', () => {
  assert.deepEqual(readReferralUrl('?q=skin&r=1964'), { q: 'skin', id: 'note:1964' });
  assert.deepEqual(readReferralUrl('q=cancer+skin'), { q: 'cancer skin', id: null });
  assert.deepEqual(readReferralUrl('?r=12'), { q: '', id: 'note:12' });
  assert.deepEqual(readReferralUrl(''), { q: '', id: null });
  assert.equal(readReferralUrl('?q=' + 'a'.repeat(500)).q.length, MAX_Q);
});

test('the URL is written with q first, and nothing when there is nothing', () => {
  assert.equal(referralUrl({}), '/');
  assert.equal(referralUrl({ q: '  ' }), '/');
  assert.equal(referralUrl({ q: 'skin' }), '/?q=skin');
  assert.equal(referralUrl({ q: 'cancer skin', id: 'note:1964' }), '/?q=cancer+skin&r=1964');
  assert.equal(referralUrl({ id: 'note:3' }), '/?r=3');
  assert.equal(referralUrl({ q: 'a&b' }), '/?q=a%26b');
  // Round trip.
  const url = referralUrl({ q: 'nurse to visit at home', id: 'note:42' });
  assert.deepEqual(readReferralUrl(url.slice(url.indexOf('?'))), { q: 'nurse to visit at home', id: 'note:42' });
});

test('opening a referral is a new history entry; typing, switching and closing replace', () => {
  // Typing.
  assert.deepEqual(historyStep({ q: '', id: null }, { q: 's', id: null }), { method: 'replace', url: '/?q=s' });
  assert.deepEqual(historyStep({ q: 's', id: null }, { q: 'skin', id: null }), { method: 'replace', url: '/?q=skin' });
  // Opening: push, so Back closes it.
  assert.deepEqual(historyStep({ q: 'skin', id: null }, { q: 'skin', id: 'note:5' }), { method: 'push', url: '/?q=skin&r=5' });
  // Switching to another while one is open: replace, so Back goes to the list.
  assert.deepEqual(historyStep({ q: 'skin', id: 'note:5' }, { q: 'skin', id: 'note:6' }), { method: 'replace', url: '/?q=skin&r=6' });
  // Typing with one open keeps it open.
  assert.deepEqual(historyStep({ q: 'skin', id: 'note:5' }, { q: 'skin c', id: 'note:5' }), { method: 'replace', url: '/?q=skin+c&r=5' });
  // Closing.
  assert.deepEqual(historyStep({ q: 'skin', id: 'note:5' }, { q: 'skin', id: null }), { method: 'replace', url: '/?q=skin' });
  // Nothing changed.
  assert.equal(historyStep({ q: 'skin', id: 'note:5' }, { q: 'skin ', id: 'note:5' }), null);
  assert.equal(historyStep(null, { q: '', id: null }), null);
});

test('the arrows move the highlight and never open anything', () => {
  assert.deepEqual(keyAction({ key: 'ArrowDown', idx: -1, count: 3 }), { type: 'move', idx: 0 });
  assert.deepEqual(keyAction({ key: 'ArrowDown', idx: 0, count: 3 }), { type: 'move', idx: 1 });
  assert.deepEqual(keyAction({ key: 'ArrowDown', idx: 2, count: 3 }), { type: 'move', idx: 2 });
  assert.deepEqual(keyAction({ key: 'ArrowUp', idx: 2, count: 3 }), { type: 'move', idx: 1 });
  assert.deepEqual(keyAction({ key: 'ArrowUp', idx: 0, count: 3 }), { type: 'move', idx: 0 });
  assert.deepEqual(keyAction({ key: 'ArrowUp', idx: -1, count: 3 }), { type: 'move', idx: 0 });
  // A highlight past the end of a list that shrank comes back inside it.
  assert.deepEqual(keyAction({ key: 'ArrowDown', idx: 9, count: 3 }), { type: 'move', idx: 2 });
  for (const key of ['ArrowDown', 'ArrowUp']) {
    assert.notEqual(keyAction({ key, idx: 0, count: 3 }).type, 'open');
    assert.equal(keyAction({ key, idx: 0, count: 0 }), null);
  }
});

test('Enter opens the highlighted row, and only a real one', () => {
  assert.deepEqual(keyAction({ key: 'Enter', idx: 1, count: 3 }), { type: 'open', idx: 1 });
  assert.equal(keyAction({ key: 'Enter', idx: -1, count: 3 }), null);
  assert.equal(keyAction({ key: 'Enter', idx: 3, count: 3 }), null);
  assert.equal(keyAction({ key: 'Enter', idx: 0, count: 0 }), null);
});

test('Esc goes back from a referral first, then clears the search', () => {
  assert.deepEqual(keyAction({ key: 'Escape', open: true, hasQuery: true, count: 3 }), { type: 'close' });
  assert.deepEqual(keyAction({ key: 'Escape', open: true, hasQuery: false, count: 0 }), { type: 'close' });
  assert.deepEqual(keyAction({ key: 'Escape', open: false, hasQuery: true, count: 3 }), { type: 'clear' });
  assert.equal(keyAction({ key: 'Escape', open: false, hasQuery: false }), null);
  assert.equal(keyAction({ key: 'a', idx: 0, count: 3 }), null);
});

test('a search highlights its top row; the empty box highlights nothing', () => {
  assert.equal(startHighlight('skin'), 0);
  assert.equal(startHighlight('  '), -1);
  assert.equal(startHighlight(''), -1);
});

test('the open referral is found in the full list first, then the search rows', () => {
  const book = [{ id: 'note:1', title: 'A' }, { id: 'note:2', title: 'B' }];
  const search = [{ id: 'note:2', title: 'B (search)' }, { id: 'note:3', title: 'C' }];
  assert.equal(findReferral('note:2', book, search).title, 'B');
  assert.equal(findReferral('note:3', book, search).title, 'C');
  assert.equal(findReferral('note:9', book, search), null);
  assert.equal(findReferral(null, book), null);
  assert.equal(findReferral('note:1', null, undefined, book).title, 'A');
});

test('a new search, or the box cleared, closes the open referral', () => {
  assert.equal(closesOnSearch({ prev: 'skin', next: 'skin c', open: true }), true);
  assert.equal(closesOnSearch({ prev: 'skin', next: '', open: true }), true);
  // Nothing open, nothing to close.
  assert.equal(closesOnSearch({ prev: 'skin', next: 'eye', open: false }), false);
  // Only spaces changed: the same search.
  assert.equal(closesOnSearch({ prev: 'skin', next: 'skin ', open: true }), false);
  // Before the URL is read: a link with ?q=…&r=… keeps its referral open.
  assert.equal(closesOnSearch({ prev: null, next: 'skin', open: true }), false);
});
