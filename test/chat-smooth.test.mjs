import { test } from 'node:test';
import assert from 'node:assert/strict';
import { snapEnd, nextShown } from '../app/_components/chat/smooth.mjs';

test('a cut finishes the word in hand', () => {
  const t = 'Book a fifteen minute slot';
  assert.equal(t.slice(0, snapEnd(t, 9)), 'Book a fifteen');
  assert.equal(snapEnd(t, 0), 0);
  assert.equal(snapEnd(t, 999), t.length);
});

test('bold and tags are never left open', () => {
  const t = 'Book the **HCA clinic** under <mark>ECG today</mark> now';
  assert.equal(t.slice(0, snapEnd(t, 12)), 'Book the **HCA clinic**');
  assert.equal(t.slice(0, snapEnd(t, 38)), 'Book the **HCA clinic** under <mark>ECG today</mark>');
});

test('a link is shown whole or not at all', () => {
  const t = 'See [ECG referrals](/notebook/ecg-referrals-12) for more';
  assert.equal(t.slice(0, snapEnd(t, 6)), 'See [ECG referrals](/notebook/ecg-referrals-12)');
});

test('a table row arrives whole, and a header waits for its separator', () => {
  const t = 'Who does it:\n\n| Who | When |\n| --- | --- |\n| HCA | Same week |\n';
  const header = t.indexOf('| Who') + 3;
  assert.equal(t.slice(0, snapEnd(t, header)), 'Who does it:\n\n| Who | When |\n| --- | --- |');
  const row = t.indexOf('| HCA') + 4;
  assert.equal(t.slice(0, snapEnd(t, row)), 'Who does it:\n\n| Who | When |\n| --- | --- |\n| HCA | Same week |');
});

test('the sources line arrives whole', () => {
  const t = 'Done.\n\nSources: [A](/notebook/a-1) · [B](/notebook/b-2)';
  assert.equal(snapEnd(t, t.indexOf('Sources') + 3), t.length);
});

test('a bare list marker brings its first word', () => {
  const t = 'Steps:\n1. Open the record';
  assert.equal(t.slice(0, snapEnd(t, t.indexOf('1.') + 1)), 'Steps:\n1. Open');
});

test('the reveal moves forward, and keeps what still stands when rewritten', () => {
  const a = nextShown('', 'To refer a patient for an ECG, book them', 16);
  assert.ok(a.length > 0 && 'To refer a patient for an ECG, book them'.startsWith(a));
  assert.equal(nextShown('To refer a', 'To book a slot', 0).startsWith('To '), true);
  assert.equal(nextShown('abc', 'abc', 16), 'abc');
});
