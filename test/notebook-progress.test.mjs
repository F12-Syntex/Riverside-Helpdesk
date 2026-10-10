import test from 'node:test';
import assert from 'node:assert/strict';
import { notebookProgress } from '../lib/agent/notebook-progress.mjs';

// The working card's "notes" stage, for a turn that reads every page.

test('every page is counted, in its sections, and every page is read', () => {
  const pages = [
    { docTitle: 'Notebook: Referrals / ECG', path: ['Referrals', 'ECG'] },
    { docTitle: 'Notebook: Clinical / Bloods', path: ['Clinical', 'Bloods'] },
    { docTitle: 'Notebook: Referrals / Dietitian', path: ['Referrals', 'Dietitian'] },
    { docTitle: 'Notebook: Start here', path: ['Start here'] },
  ];
  assert.deepEqual(notebookProgress(pages), {
    type: 'progress',
    stage: 'notes',
    total: 4,
    sections: [{ name: 'Clinical', count: 1 }, { name: 'Notebook', count: 1 }, { name: 'Referrals', count: 2 }],
    terms: [],
    matched: 4,
    matches: [],
  });
});

test('no Notebook is an empty read, not an error', () => {
  assert.deepEqual(notebookProgress([]), { type: 'progress', stage: 'notes', total: 0, sections: [], terms: [], matched: 0, matches: [] });
  assert.equal(notebookProgress(null).total, 0);
});
