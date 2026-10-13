import test from 'node:test';
import assert from 'node:assert/strict';
import { TITLE_MAX, checkTitle, fallbackTitle, titleKey } from '../lib/notebook/title-check.mjs';

test('a title of nothing but spaces is empty', () => {
  assert.equal(checkTitle('').empty, true);
  assert.equal(checkTitle('   \t ').empty, true);
  assert.equal(checkTitle(null).empty, true);
  assert.equal(checkTitle(' Fit notes ').empty, false);
});

test('a sibling with the same title, spaced or cased differently, is a duplicate', () => {
  const siblings = ['How to book appointments', 'Repeat prescriptions'];
  assert.equal(checkTitle('how to  book appointments ', siblings).duplicate, true);
  assert.equal(checkTitle('REPEAT PRESCRIPTIONS', siblings).duplicate, true);
  assert.equal(checkTitle('Repeat prescription', siblings).duplicate, false);
  // An empty box is the empty message, not a duplicate of an empty sibling.
  assert.equal(checkTitle('  ', ['', ' ']).duplicate, false);
});

test('the length shows from 160 characters and the limit is the server’s 200', () => {
  assert.equal(TITLE_MAX, 200);
  assert.equal(checkTitle('a'.repeat(159)).showCount, false);
  assert.equal(checkTitle('a'.repeat(160)).showCount, true);
  assert.equal(checkTitle('a'.repeat(199)).long, false);
  assert.equal(checkTitle('a'.repeat(200)).long, true);
  assert.equal(checkTitle('a'.repeat(200)).length, 200);
});

test('a title left empty goes back to the last saved one, else a plain default', () => {
  assert.equal(fallbackTitle('Fit notes'), 'Fit notes');
  assert.equal(fallbackTitle('  Fit notes  '), 'Fit notes');
  assert.equal(fallbackTitle(''), 'Untitled page');
  assert.equal(fallbackTitle('   ', true), 'Untitled section');
  assert.equal(fallbackTitle(undefined), 'Untitled page');
});

test('titles compare trimmed, collapsed and case-blind', () => {
  assert.equal(titleKey('  A  B\tC '), 'a b c');
  assert.equal(titleKey(undefined), '');
});
