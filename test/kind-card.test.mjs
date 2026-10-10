// A typed Notebook page draws its own screen from the values saved on it.
//
// What this file protects is the line between SHAPE and ANSWER. A page's type
// may change how the page is drawn; it may never change which page answers.
// The screen is built in code from the stored fields, a draft is never drawn,
// and a page that cannot be drawn comes back exactly as it was.
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildFullNotebookSources } from '../lib/knowledge-context.mjs';
import { withKindCard } from '../lib/templates/route.mjs';
import { notebookPageAnswer } from '../lib/templates/notebook.mjs';
import { noteKind } from '../lib/notebook/kinds.mjs';

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
const page = (title) => PAGES.find((p) => p.docTitle.endsWith('/ ' + title));
const typed = (title) => ({ page: page(title), kind: noteKind(page(title).noteKind) });
const plainCard = (title) => notebookPageAnswer({ pages: [page(title).docTitle], all: PAGES });

test('the screen is drawn first, from the saved fields, above the page', () => {
  const plain = plainCard('Dermatology');
  assert.ok(plain, 'the page did not render');
  const drawn = withKindCard(plain, typed('Dermatology'));
  assert.equal(drawn.blocks[0].type, 'ers');
  assert.equal(drawn.blocks[0].specialty, 'Dermatology');
  assert.equal(drawn.blocks[0].clinicType, 'Not Otherwise Specified');
  // The page is still there underneath.
  assert.deepEqual(drawn.blocks.slice(1), plain.blocks);
});

test('nothing to draw leaves the card unchanged', () => {
  const plain = plainCard('Opening times');
  assert.equal(withKindCard(plain, null), plain);
  assert.equal(withKindCard(null, typed('Dermatology')), null);
  // A plain page has no screen to draw.
  assert.equal(withKindCard(plain, typed('Opening times')), plain);
});

