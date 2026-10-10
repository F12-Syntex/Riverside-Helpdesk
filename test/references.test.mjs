import test from 'node:test';
import assert from 'node:assert/strict';
import { citedPages, resolveReferences, saysDontKnow, sourcesLine } from '../lib/questions/references.mjs';

// The writer cites a page by the heading it was shown; code decides whether
// that heading is a page, and only then makes it a link.

const PAGES = [
  { docId: 'note:12', docTitle: 'Notebook: Clinical / Blood tests', text: 'Book on the phlebotomy rota.' },
  { docId: 'note:31', docTitle: 'Notebook: Documents and filing / Discharge letters', text: 'Code and file.' },
  { docId: 'note:40', docTitle: 'Notebook: Reception / Opening hours', text: '8 to 6.30' },
  { docId: 'note:41', docTitle: 'Notebook: Pharmacy / Opening hours', text: 'other hours' },
];

test('an exact heading becomes a link to that page, and the answer ends with its sources', () => {
  const out = resolveReferences('Book them on the rota [[Notebook: Clinical / Blood tests]].', PAGES);
  assert.equal(out.text, 'Book them on the rota [Blood tests](/notebook/blood-tests-12).\n\nSources: [Blood tests](/notebook/blood-tests-12)');
  assert.deepEqual(out.cited, [{ docId: 'note:12', title: 'Blood tests', href: '/notebook/blood-tests-12' }]);
  assert.deepEqual(out.unknown, []);
  assert.equal(out.body, 'Book them on the rota [Blood tests](/notebook/blood-tests-12).');
});

test('the heading without its "Notebook:" prefix, or in another case, is the same page', () => {
  const out = resolveReferences('See [[clinical / blood TESTS]].', PAGES);
  assert.deepEqual(out.cited.map((c) => c.docId), ['note:12']);
});

test('a page\'s own name finds it when exactly one page carries that name', () => {
  const out = resolveReferences('File it [[Discharge letters]].', PAGES);
  assert.deepEqual(out.cited.map((c) => c.docId), ['note:31']);
  assert.match(out.text, /\[Discharge letters\]\(\/notebook\/discharge-letters-31\)/);
});

test('a name two pages share is not an address, and is left as plain words', () => {
  const out = resolveReferences('Hours are on [[Opening hours]].', PAGES);
  assert.equal(out.text, 'Hours are on Opening hours.');
  assert.deepEqual(out.cited, []);
  assert.deepEqual(out.unknown, ['Opening hours']);
});

test('a heading that names no page becomes plain text and is reported', () => {
  const out = resolveReferences('Park at the back [[Notebook: Staff / Motorbike parking]].', PAGES);
  assert.equal(out.text, 'Park at the back Staff / Motorbike parking.');
  assert.deepEqual(out.unknown, ['Notebook: Staff / Motorbike parking']);
  assert.ok(!out.text.includes('Sources:'), 'nothing cited, no sources line');
});

test('a page cited twice is linked twice and listed once', () => {
  const out = resolveReferences('One [[Notebook: Clinical / Blood tests]]. Two [[Blood tests]]. Three [[Discharge letters]].', PAGES);
  assert.deepEqual(out.cited.map((c) => c.docId), ['note:12', 'note:31']);
  assert.equal(out.text.split('(/notebook/blood-tests-12)').length - 1, 3, 'two in the text, one in the sources');
  assert.match(out.text, /\n\nSources: \[Blood tests\]\(\/notebook\/blood-tests-12\) · \[Discharge letters\]\(\/notebook\/discharge-letters-31\)$/);
});

test('a marker inside code is an example, and is left exactly as written', () => {
  const text = 'Cite like `[[Notebook: Clinical / Blood tests]]`.\n\n```\n[[Discharge letters]]\n```\n\nReal one [[Discharge letters]].';
  const out = resolveReferences(text, PAGES);
  assert.ok(out.text.includes('`[[Notebook: Clinical / Blood tests]]`'));
  assert.ok(out.text.includes('```\n[[Discharge letters]]\n```'));
  assert.deepEqual(out.cited.map((c) => c.docId), ['note:31']);
});

test('a "Sources" line the model wrote is replaced by the one code builds', () => {
  for (const tail of ['Source: [[Blood tests]]', '**Sources:** [[Blood tests]]', 'Sources: Blood tests']) {
    const out = resolveReferences(`Use the rota [[Blood tests]].\n\n${tail}`, PAGES);
    assert.equal(out.text, 'Use the rota [Blood tests](/notebook/blood-tests-12).\n\nSources: [Blood tests](/notebook/blood-tests-12)', tail);
  }
});

test('square brackets in a title do not break the link', () => {
  const pages = [{ docId: 'note:5', docTitle: 'Notebook: Forms [old]', text: '' }];
  const out = resolveReferences('[[Notebook: Forms [old]]]', pages);
  // The marker cannot hold brackets, so it is not a marker at all.
  assert.deepEqual(out.cited, []);
  assert.equal(sourcesLine([{ title: 'Forms [old]', href: '/notebook/forms-old-5' }]), 'Sources: [Forms (old)](/notebook/forms-old-5)');
});

test('the cited pages come back whole, in citing order, for the answer check', () => {
  const out = resolveReferences('[[Discharge letters]] then [[Blood tests]]', PAGES);
  assert.deepEqual(citedPages(out.cited, PAGES).map((p) => p.text), ['Code and file.', 'Book on the phlebotomy rota.']);
});

test('"I don\'t know" is recognised, and its page is named as the closest rather than a source', () => {
  assert.equal(saysDontKnow('I don’t know — the Notebook does not cover this. [[Blood tests]]'), true);
  assert.equal(saysDontKnow('**I don\'t know** — the Notebook does not cover this.'), true);
  assert.equal(saysDontKnow('Book them on the rota. I don’t know who else does.'), false);
  // An answer that hedges and then answers is an answer.
  assert.equal(saysDontKnow('I don’t know of a specific discharge letter procedure, so follow the general one: …'), false);
  const general = 'I don’t know — the Notebook does not cover discharge letters specifically. The general procedure:\n\n'
    + Array.from({ length: 8 }, (_, i) => `${i + 1}. A step from the incoming-letters pages, written out in full.`).join('\n');
  assert.equal(saysDontKnow(general), false, 'a hedge followed by a whole procedure is an answer');
  const out = resolveReferences('I don’t know — the Notebook does not cover this. Closest: [[Blood tests]].', PAGES);
  assert.equal(sourcesLine(out.cited, 'Closest page'), 'Closest page: [Blood tests](/notebook/blood-tests-12)');
});

test('no markers, no change', () => {
  const out = resolveReferences('I don’t know — the Notebook does not cover this.', PAGES);
  assert.equal(out.text, 'I don’t know — the Notebook does not cover this.');
  assert.deepEqual(out.cited, []);
});
