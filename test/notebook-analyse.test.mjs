import test from 'node:test';
import assert from 'node:assert/strict';
import { analyseNotebook } from '../lib/notebook/analyse.mjs';

const LONG = 'Paste the NHS number into the search box, then choose Refer or seek advice from the menu that appears.';
const NOTES = [
  { id: 1, parentId: null, title: 'Referrals', body: '', isSection: true, updatedAt: '2026-09-01T00:00:00Z' },
  { id: 2, parentId: 1, title: 'Referral pathways', body: '', isSection: true, updatedAt: null },
  { id: 3, parentId: 2, title: 'Hernia', body: 'Speciality: Not Otherwise Specified\nClinic type: Hernias\n\n' + LONG, isSection: false, updatedAt: '2026-09-10T00:00:00Z' },
  { id: 4, parentId: 2, title: 'Derm', body: 'Skin things go through Telederm, and the hospital chosen must contain the word Telederm. ' + LONG, isSection: false, updatedAt: null },
  { id: 5, parentId: null, title: 'Reception', body: '', isSection: true, updatedAt: null },
  { id: 6, parentId: 5, title: 'Stub', body: 'Ask.', isSection: false, updatedAt: null },
  { id: 7, parentId: 5, title: 'Empty', body: '', isSection: false, updatedAt: null },
];

test('the tree sums page values into sections and the root', () => {
  const r = analyseNotebook(NOTES, [], {});
  const referrals = r.tree.children.find((n) => n.id === 1);
  const pathways = referrals.children[0];
  assert.equal(pathways.value, r.pages[3].chars + r.pages[4].chars);
  assert.equal(referrals.value, pathways.value);
  assert.equal(r.tree.value, referrals.value + r.tree.children.find((n) => n.id === 5).value);
});

test('a stub keeps a floor value so it stays visible, and an empty page still reports', () => {
  const r = analyseNotebook(NOTES, [], {});
  const reception = r.tree.children.find((n) => n.id === 5);
  assert.equal(reception.children.find((n) => n.id === 6).value, 40);
  assert.ok(r.pages[7].stub);
  assert.equal(r.pages[7].chars, 0);
});

test('a sentence on two pages is a duplicate on both, and a section is as bad as its worst child', () => {
  const r = analyseNotebook(NOTES, [], {});
  assert.equal(r.pages[3].duplicates.length, 1);
  assert.equal(r.pages[3].duplicates[0].others[0].noteId, 4);
  assert.equal(r.pages[4].duplicates.length, 1);
  // Derm cannot be parsed as a pathway: error, so the section goes red.
  assert.ok(r.pages[4].violations.some((v) => v.rule === 'typed-parse'));
  const referrals = r.tree.children.find((n) => n.id === 1);
  assert.equal(referrals.health.band, r.pages[4].health.band);
  assert.equal(r.totals.pages, 4);
  assert.equal(r.totals.errors, 1);
});

test('signals ride along by note id', () => {
  const r = analyseNotebook(NOTES, [], { 3: { asked: 5, bad: 1, flagged: 0, lastAsked: '2026-09-14T00:00:00Z' } });
  assert.equal(r.pages[3].signals.asked, 5);
  assert.equal(r.pages[4].signals, null);
});
