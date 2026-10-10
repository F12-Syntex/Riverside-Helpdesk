// What the search index holds for each Notebook page, and that it is exactly
// the set of pages the model can be shown.
//
// THE INDEX ONLY RANKS, BUT IT CAN ONLY RANK WHAT IT HOLDS. A live typed note
// — an e-RS card with its boxes filled in and no prose under it — is served to
// the model as its fields; if the index held only prose, that page had no
// passages, could never be shortlisted, and reached the model as a title.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFullNotebookSources, isServedPage, notebookIndexText } from '../lib/knowledge-context.mjs';
import { chunkText } from '../lib/text-chunk.mjs';

const ERS = { service: 'Dermatology', specialty: 'Dermatology', clinicType: 'Not Otherwise Specified', hospitalRule: 'The hospital must contain Telederm.' };
const ROWS = [
  { id: 1, parentId: null, title: 'Referrals', isSection: true, body: '' },
  { id: 2, parentId: 1, title: 'Dermatology', body: '', kind: 'ersReferral', fields: ERS, status: 'live' },
  { id: 3, parentId: 1, title: 'Dietitian', body: 'Email the dietitian.', kind: 'emailReferral', fields: { service: 'Dietitian' }, status: 'draft' },
  { id: 4, parentId: 1, title: 'Podiatry', body: '', kind: 'emailReferral', fields: { service: 'Podiatry' }, status: 'draft' },
  { id: 5, parentId: 1, title: 'Opening times', body: 'The practice opens at 8am.', kind: 'note', status: 'live' },
  { id: 6, parentId: 1, title: 'Blank', body: '   ', kind: 'note', status: 'live' },
  { id: 7, parentId: 1, title: 'Old section', body: 'Stray text', isSection: true },
];

test('the index holds exactly the pages the model can be shown', () => {
  const served = buildFullNotebookSources(ROWS, []).map((p) => p.docId).sort();
  const indexed = ROWS.filter((row) => isServedPage(row) && notebookIndexText(row)).map((row) => `note:${row.id}`).sort();
  assert.deepEqual(indexed, served);
  assert.deepEqual(served, ['note:2', 'note:3', 'note:5']);
});

test('a live typed note is indexed by its fields, then its writing', () => {
  const text = notebookIndexText(ROWS[1]);
  assert.match(text, /Dermatology/);
  assert.match(text, /Not Otherwise Specified/);
  const withProse = notebookIndexText({ ...ROWS[1], body: 'Attach photos.' });
  assert.ok(withProse.indexOf('Not Otherwise Specified') < withProse.indexOf('Attach photos.'));
});

test('a draft and a plain note are indexed by their writing alone', () => {
  // A draft is served as its prose: its half-filled card is not something the
  // model reads, so it is not something search should rank it on.
  assert.equal(notebookIndexText(ROWS[2]), 'Email the dietitian.');
  assert.equal(notebookIndexText(ROWS[3]), '');
  assert.equal(notebookIndexText(ROWS[4]), 'The practice opens at 8am.');
  assert.equal(notebookIndexText(ROWS[5]), '');
});

test('inline pictures are indexed as their alt text, not their address', () => {
  const text = notebookIndexText({ ...ROWS[4], body: 'See ![the form](https://blob/x.png) here.' });
  assert.doesNotMatch(text, /blob/);
  assert.match(text, /the form/);
  // A page that is only a picture is still a page: it is found by its title.
  assert.equal(notebookIndexText({ ...ROWS[4], body: '![](https://blob/x.png)' }), 'Opening times');
});

/* ------------------------------------------------------------ chunking */

const letters = (s) => s.replace(/\s+/g, '');

test('every character of a page lands in some passage', () => {
  // One paragraph far longer than a passage: it used to be cut at 1,500
  // characters and the rest was never indexed.
  const long = Array.from({ length: 120 }, (_, i) => `Sentence ${i} says something specific.`).join(' ');
  const page = ['# Heading', 'Short opening.', long, 'Closing line.'].join('\n\n');
  const chunks = chunkText(page);
  assert.ok(chunks.every((c) => c.length <= 1500), 'no passage is over the cap');
  assert.equal(letters(chunks.join('')), letters(page));
});

test('a page with no long paragraph chunks exactly as it did', () => {
  // Unchanged passages keep their hashes, and with them their vectors.
  const blocks = Array.from({ length: 6 }, (_, i) => `Paragraph ${i}. ` + 'words '.repeat(40).trim());
  const expected = blocks.reduce((out, b) => {
    const last = out[out.length - 1];
    if (last != null && last.length + b.length + 2 <= 900) out[out.length - 1] = last + '\n\n' + b;
    else out.push(b);
    return out;
  }, []);
  assert.deepEqual(chunkText(blocks.join('\n\n')), expected);
});

test('a single word longer than a passage is split rather than dropped', () => {
  const blob = 'x'.repeat(4000);
  const chunks = chunkText(blob);
  assert.equal(chunks.join(''), blob);
  assert.ok(chunks.every((c) => c.length <= 1500));
});
