// A typed Notebook page draws its own screen from the values saved on it.
//
// What this file protects is the line between SHAPE and ANSWER. A page's type
// may change how the page is drawn; it may never change which page answers.
// The screen is built in code from the stored fields, a draft is never drawn,
// and a page that cannot be drawn comes back exactly as it was.
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildFullNotebookSources } from '../lib/knowledge-context.mjs';
import { renderSelection, typedNotebookPage, withKindCard } from '../lib/templates/route.mjs';

const ERS = {
  service: 'Dermatology',
  specialty: 'Dermatology',
  clinicType: 'Not Otherwise Specified',
  hospitalRule: 'The hospital must contain Telederm.',
};

const ROWS = [
  { id: 1, parentId: null, title: 'Referrals', isSection: true, body: '' },
  { id: 2, parentId: 1, title: 'Dermatology', body: 'Attach photos.', kind: 'ersReferral', fields: ERS, status: 'live' },
  { id: 3, parentId: 1, title: 'Dietitian', body: 'Email the dietitian.', kind: 'emailReferral', fields: { service: 'Dietitian' }, status: 'draft' },
  { id: 4, parentId: null, title: 'Front desk', isSection: true, body: '' },
  { id: 5, parentId: 4, title: 'Opening times', body: 'The practice opens at 8am.', kind: 'note', status: 'live' },
];
const PAGES = buildFullNotebookSources(ROWS, []);
const pick = (title) => ({ template: 'notebook', pages: [title] });

test('a live typed page is drawn, and nothing else is', () => {
  assert.ok(typedNotebookPage(pick('Dermatology'), PAGES), 'a live e-RS page was not recognised');
  // Every other template renders in a shape of its own, decided in code.
  for (const template of ['referral', 'bloodForm', 'triage', 'fcp', 'registration', 'none']) {
    assert.equal(typedNotebookPage({ template, pages: ['Dermatology'] }, PAGES), null, template);
  }
  // A plain page is the page as it is written.
  assert.equal(typedNotebookPage(pick('Opening times'), PAGES), null);
  // A draft is not drawn: half a card drawn like a whole one misleads.
  assert.equal(typedNotebookPage(pick('Dietitian'), PAGES), null);
  // Two pages are two answers, and one screen cannot be both.
  assert.equal(typedNotebookPage({ template: 'notebook', pages: ['Dermatology', 'Opening times'] }, PAGES), null);
  // A page the Notebook does not hold cannot be typed into existence.
  assert.equal(typedNotebookPage(pick('Invented page'), PAGES), null);
});

test('the screen is drawn first, from the saved fields, above the page', () => {
  const selection = pick('Dermatology');
  const plain = renderSelection(selection, 'how do I refer for a mole', PAGES, {});
  assert.ok(plain, 'the page did not render');
  const drawn = withKindCard(plain, typedNotebookPage(selection, PAGES));
  assert.equal(drawn.blocks[0].type, 'ers');
  assert.equal(drawn.blocks[0].specialty, 'Dermatology');
  assert.equal(drawn.blocks[0].clinicType, 'Not Otherwise Specified');
  // The page is still there underneath.
  assert.deepEqual(drawn.blocks.slice(1), plain.blocks);
});

test('nothing to draw leaves the card unchanged', () => {
  const plain = renderSelection(pick('Opening times'), 'when do you open', PAGES, {});
  assert.equal(withKindCard(plain, null), plain);
  assert.equal(withKindCard(null, typedNotebookPage(pick('Dermatology'), PAGES)), null);
});
