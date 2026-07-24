import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFullNotebookSources,
  buildSectionNotebookContext,
  contactHitsToCards,
  knowledgeHitToDocumentChunk,
} from '../lib/knowledge-context.mjs';

test('Notebook pages are included whole with their section path', () => {
  const body = '# Important\n\n' + 'Complete instruction. '.repeat(220);
  const sources = buildFullNotebookSources([
    { id: 1, parentId: null, title: 'Reception', body: '', isSection: false },
    { id: 2, parentId: 1, title: 'Registrations', body, isSection: false },
  ]);

  assert.equal(sources.length, 1);
  assert.equal(sources[0].docTitle, 'Notebook: Reception / Registrations');
  assert.equal(sources[0].text, body);
  assert.ok(sources[0].text.length > 4000, 'the full body must not be truncated to a RAG chunk');
  assert.equal(sources[0].section, 'Complete note');
});

test('Notebook containers and empty pages are excluded, while image attachments stay linked', () => {
  const sources = buildFullNotebookSources([
    { id: 1, parentId: null, title: 'Section', body: 'ignored container text', isSection: false },
    { id: 2, parentId: 1, title: 'Subsection', body: 'ignored subsection text', isSection: true },
    { id: 3, parentId: 2, title: 'Empty', body: '   ', isSection: false },
    { id: 4, parentId: 2, title: 'Live page', body: 'Use this instruction in full.', isSection: false },
  ], [
    { noteId: 4, contentType: 'image/png', url: 'https://example.test/one.png' },
    { noteId: 4, contentType: 'application/pdf', url: 'https://example.test/file.pdf' },
  ]);

  assert.deepEqual(sources.map((source) => source.docId), ['note:4']);
  assert.equal(sources[0].docTitle, 'Notebook: Section / Subsection / Live page');
  assert.deepEqual(sources[0].images, ['https://example.test/one.png']);
});

test('section context gathers a section subtree, skipping containers and empty pages', () => {
  const notes = [
    { id: 1, parentId: null, title: 'Triaging notebook', body: '', isSection: false },
    { id: 2, parentId: 1, title: 'Chest pain', body: 'Route chest pain to the duty GP same-day.', isSection: false },
    { id: 3, parentId: 1, title: 'Sub-area', body: 'ignored container text', isSection: true },
    { id: 4, parentId: 3, title: 'Repeat meds', body: 'Send repeat prescription requests to the pharmacist.', isSection: false },
    { id: 5, parentId: 3, title: 'Empty', body: '   ', isSection: false },
    // A different section that must not leak in.
    { id: 6, parentId: null, title: 'Document coding', body: '', isSection: false },
    { id: 7, parentId: 6, title: 'Sources', body: 'Use HUH for Homerton University Hospital.', isSection: false },
  ];

  const triage = buildSectionNotebookContext(notes, 'Triaging notebook');
  assert.equal(triage,
    '### Triaging notebook / Chest pain\nRoute chest pain to the duty GP same-day.\n\n'
    + '### Triaging notebook / Sub-area / Repeat meds\nSend repeat prescription requests to the pharmacist.');

  // Case-insensitive match, and only the requested section's own pages.
  assert.equal(buildSectionNotebookContext(notes, 'document CODING'),
    '### Document coding / Sources\nUse HUH for Homerton University Hospital.');
});

test('section context is empty for a missing or blank section, and strips inline images', () => {
  const notes = [
    { id: 1, parentId: null, title: 'Triaging notebook', body: '', isSection: false },
    { id: 2, parentId: 1, title: 'Photo note', body: 'Before ![x](https://blob/x.png) after.', isSection: false },
  ];
  assert.equal(buildSectionNotebookContext(notes, 'Nonexistent'), '');
  assert.equal(buildSectionNotebookContext(notes, ''), '');
  assert.equal(buildSectionNotebookContext(notes, 'Triaging notebook'),
    '### Triaging notebook / Photo note\nBefore after.');
});

test('document hits keep only document passage data', () => {
  const chunk = knowledgeHitToDocumentChunk({
    id: 'document:one:p0', entryId: 'document:one', title: 'Policy',
    heading: 'Process', content: 'Retrieved passage', score: '0.7',
    location: { kind: 'pdf', url: '/policy.pdf', page: 2, source: 'private-path', images: ['/page.png'] },
  });

  assert.equal(chunk.kind, 'document');
  assert.equal(chunk.text, 'Retrieved passage');
  assert.deepEqual(chunk.view, { kind: 'pdf', url: '/policy.pdf', page: 2 });
  assert.deepEqual(chunk.images, ['/page.png']);
});

test('contact RAG hits become deduplicated structured cards', () => {
  const hits = [
    { id: 'p1', entryId: 'contact:one', title: 'District nurse', data: { phones: [{ tel: '0201' }], emails: [] } },
    { id: 'p2', entryId: 'contact:one', title: 'District nurse duplicate passage', data: {} },
    { id: 'p3', entryId: 'contact:two', title: 'Community matron', data: { phones: [], emails: ['team@example.test'] } },
  ];

  assert.deepEqual(contactHitsToCards(hits, 5), [
    { label: 'District nurse', phones: [{ tel: '0201' }], emails: [] },
    { label: 'Community matron', phones: [], emails: ['team@example.test'] },
  ]);
});
