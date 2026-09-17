// Output tags: a Notebook folder saying what shape its pages come back in.
//
// What this file protects is the line between SHAPE and ANSWER. A tag may
// change how a page is drawn; it may never change which page answers, what the
// page says, or what a template decides. And a page that cannot fill the screen
// comes back exactly as it did before tags existed — a tag is allowed to add
// nothing, and is never allowed to invent.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  OUTPUT_TAGS, OUTPUT_TAG_IDS, isOutputTag, outputTag, outputTagPrompt, withTaggedOutput,
} from '../lib/templates/output-tags.mjs';
import { buildFullNotebookSources, noteOutputTag } from '../lib/knowledge-context.mjs';
import { renderSelection, taggedNotebookPage } from '../lib/templates/route.mjs';
import { answerToText } from '../lib/questions/flatten.mjs';

// A Notebook with a tagged folder, a sub-folder that overrides it, one page
// that overrides both, and a folder with no tag at all.
const ROWS = [
  { id: 1, parentId: null, title: 'Referrals', isSection: true, outputTag: 'ers', body: '' },
  { id: 2, parentId: 1, title: 'Dermatology', isSection: false, outputTag: '', body: 'Speciality is Dermatology, clinic type Not Otherwise Specified. The hospital must contain Telederm.' },
  { id: 3, parentId: 1, title: 'Email referrals', isSection: true, outputTag: 'profMessage', body: '' },
  { id: 4, parentId: 3, title: 'Dietitian', isSection: false, outputTag: '', body: 'Email dietitian@nhs.net with the EMIS file attached.' },
  { id: 5, parentId: 3, title: 'Bloods first', isSection: false, outputTag: 'pathology', body: 'Order FBC and LFT.' },
  { id: 6, parentId: null, title: 'Front desk', isSection: true, outputTag: '', body: '' },
  { id: 7, parentId: 6, title: 'Opening times', isSection: false, outputTag: '', body: 'The practice opens at 8am.' },
];
const BY_ID = new Map(ROWS.map((r) => [r.id, r]));
const PAGES = buildFullNotebookSources(ROWS, []);
const pageNamed = (name) => PAGES.find((p) => p.docTitle.endsWith(name));

/* -------------------------------------------------------- inheritance */

test('the nearest tagged folder above a page wins', () => {
  assert.equal(noteOutputTag(BY_ID.get(2), BY_ID), 'ers', 'a page inherits its folder');
  assert.equal(noteOutputTag(BY_ID.get(4), BY_ID), 'profMessage', 'a sub-folder overrides the folder');
  assert.equal(noteOutputTag(BY_ID.get(5), BY_ID), 'pathology', 'a page overrides both');
  assert.equal(noteOutputTag(BY_ID.get(7), BY_ID), '', 'nothing tagged is no tag');
});

test('the tag rides on the page the assistant is handed', () => {
  assert.equal(pageNamed('Dermatology').outputTag, 'ers');
  assert.equal(pageNamed('Dietitian').outputTag, 'profMessage');
  assert.equal(pageNamed('Opening times').outputTag, '');
});

test('a cycle in the tree cannot hang the walk', () => {
  const a = { id: 10, parentId: 11, title: 'A', outputTag: '' };
  const b = { id: 11, parentId: 10, title: 'B', outputTag: '' };
  assert.equal(noteOutputTag(a, new Map([[10, a], [11, b]])), '');
});

/* ------------------------------------------------------- what is taggable */

test('only a tag that can actually be drawn may be stored', () => {
  assert.deepEqual(OUTPUT_TAG_IDS, ['ers', 'profMessage', 'pathology']);
  for (const id of OUTPUT_TAG_IDS) {
    const tag = outputTag(id);
    assert.ok(tag.label && tag.help, id + ' has nothing to put in the menu');
    assert.ok(tag.schema && typeof tag.render === 'function', id + ' cannot be read or drawn');
    assert.ok(isOutputTag(id));
  }
  // '' clears it. Anything else is refused rather than stored, so a folder can
  // never be quietly formatted as nothing at all.
  assert.ok(isOutputTag(''));
  assert.equal(isOutputTag('bullets'), false);
  assert.equal(isOutputTag('<script>'), false);
  assert.equal(outputTag('bullets'), null);
  assert.equal(outputTag(''), null);
});

/* ------------------------------------------- when a tag is allowed to apply */

test('a tag applies to a Notebook page, and to nothing else', () => {
  const chosen = { template: 'notebook', pages: ['Dermatology'] };
  assert.ok(taggedNotebookPage(chosen, PAGES), 'a tagged page was not recognised');

  // Every other template renders in a shape of its own, decided in code. A
  // folder does not get to overrule the referral card about what one is.
  for (const template of ['referral', 'bloodForm', 'triage', 'fcp', 'registration', 'none']) {
    assert.equal(taggedNotebookPage({ template, pages: ['Dermatology'] }, PAGES), null, template);
  }
  // An untagged folder is the page as it is written.
  assert.equal(taggedNotebookPage({ template: 'notebook', pages: ['Opening times'] }, PAGES), null);
  // Two pages are two answers, and one screen cannot be both.
  assert.equal(taggedNotebookPage({ template: 'notebook', pages: ['Dermatology', 'Dietitian'] }, PAGES), null);
  // A page the Notebook does not hold cannot be tagged into existence.
  assert.equal(taggedNotebookPage({ template: 'notebook', pages: ['Invented page'] }, PAGES), null);
});

/* -------------------------------------------------------------- the read */

test('the read is given the page and the message, and told not to compose', () => {
  const { tag, page } = taggedNotebookPage({ template: 'notebook', pages: ['Dermatology'] }, PAGES);
  const prompt = outputTagPrompt({ tag, page, question: 'how do I refer for a mole' });
  assert.match(prompt, /Speciality is Dermatology/, 'the page is not in the prompt');
  assert.match(prompt, /how do I refer for a mole/, 'the message is not in the prompt');
  assert.match(prompt, /YOU ARE NOT WRITING THE ANSWER/);
  assert.match(prompt, /Leave a value EMPTY rather than guessing/);
  assert.match(prompt, /e-RS screen/);
  // The picker's whole Notebook has no business here: the choosing is done.
  assert.doesNotMatch(prompt, /Opening times/);
});

/* ------------------------------------------------------------ the drawing */

const card = () => renderSelection({ template: 'notebook', pages: ['Dermatology'] }, 'how do I refer for a mole', PAGES);

test('the screen is drawn above the page, and the page is still there', () => {
  const plain = card();
  const drawn = withTaggedOutput(plain, outputTag('ers'), {
    specialty: 'Dermatology', clinicType: 'Not Otherwise Specified', hospital: 'Telederm', priority: 'Routine',
  });

  assert.equal(drawn.blocks[0].type, 'ers', 'the screen is not at the top');
  assert.equal(drawn.blocks[0].specialty, 'Dermatology');
  // Everything the page answered with is still under it, untouched.
  assert.deepEqual(drawn.blocks.slice(1), plain.blocks);
  assert.match(answerToText(drawn), /Speciality is Dermatology/);
  // And the original card is not mutated on the way through.
  assert.equal(plain.blocks[0].type, 'text');
});

test('a read too thin to draw leaves the page exactly as it was', () => {
  const plain = card();
  for (const [id, values] of [
    ['ers', { specialty: '', clinicType: '', clinicTypeOptions: [] }],
    ['profMessage', { to: '', body: '' }],
    ['pathology', { ordered: [], clinicalDetails: 'Health check' }],
  ]) {
    const out = withTaggedOutput(plain, outputTag(id), values);
    assert.deepEqual(out.blocks, plain.blocks, id + ' drew an empty screen');
  }
  // A read that came back as nothing at all, or as the wrong shape entirely.
  assert.deepEqual(withTaggedOutput(plain, outputTag('ers'), {}).blocks, plain.blocks);
  assert.deepEqual(withTaggedOutput(plain, outputTag('ers'), null).blocks, plain.blocks);
  assert.equal(withTaggedOutput(null, outputTag('ers'), {}), null);
  assert.deepEqual(withTaggedOutput(plain, null, {}), plain);
});

test('each tag draws its own screen from what the page carried', () => {
  const plain = card();

  const email = withTaggedOutput(plain, outputTag('profMessage'), {
    to: 'dietitian@nhs.net', org: 'Homerton', body: 'Dear Colleague,', attach: '', form: '',
  });
  assert.equal(email.blocks[0].type, 'profMessage');
  assert.equal(email.blocks[0].to, 'dietitian@nhs.net');
  // A part the page did not carry falls back to the block's own default rather
  // than to an empty string that would draw as "attach nothing".
  assert.equal(email.blocks[0].attach, 'EMIS file');

  const bloods = withTaggedOutput(plain, outputTag('pathology'), {
    ordered: ['Full Blood Count (FBC)', 'Liver Profile (LFT)'], clinicalDetails: 'NHS Health Check',
  });
  assert.equal(bloods.blocks[0].type, 'pathology');
  assert.deepEqual(bloods.blocks[0].ordered, ['Full Blood Count (FBC)', 'Liver Profile (LFT)']);
  // Nothing is ticked from a tagged page: the page lists tests, it does not say
  // which box on the form each one is.
  assert.deepEqual(bloods.blocks[0].groups, []);
});

test('a tagged screen is written into the question log like any other', () => {
  const drawn = withTaggedOutput(card(), outputTag('ers'), { specialty: 'Dermatology', clinicType: 'Not Otherwise Specified' });
  const text = answerToText(drawn);
  assert.match(text, /On e-RS/);
  assert.match(text, /Speciality: Dermatology/);
});
