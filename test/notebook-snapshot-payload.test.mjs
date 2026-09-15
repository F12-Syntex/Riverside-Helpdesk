import test from 'node:test';
import assert from 'node:assert/strict';
import { normalisePayload, cleanLabel, SNAPSHOT_KIND, MAX_NOTES } from '../lib/notebook/snapshot-payload.mjs';

const FILE = {
  version: 1,
  kind: SNAPSHOT_KIND,
  exportedAt: '2026-09-01T10:00:00.000Z',
  notes: [
    { id: 1, parentId: null, title: 'Referrals', body: '', isSection: true, updatedAt: '2026-08-01' },
    { id: 2, parentId: 1, title: 'Physio', body: 'Ring 020 8123 4567.', isSection: false },
  ],
  attachments: [
    { id: 9, noteId: 2, url: 'https://blob/x.pdf', pathname: 'x.pdf', filename: 'form.pdf', contentType: 'application/pdf', size: 1200 },
  ],
};

test('a backup file keeps its tree, its text and its files', () => {
  const out = normalisePayload(FILE);
  assert.equal(out.kind, SNAPSHOT_KIND);
  assert.equal(out.exportedAt, '2026-09-01T10:00:00.000Z');
  assert.equal(out.notes.length, 2);
  // Ids are kept as written: they are how a note names its parent in the file.
  assert.deepEqual(out.notes.map((n) => [n.id, n.parentId]), [[1, null], [2, 1]]);
  assert.equal(out.notes[0].isSection, true);
  assert.equal(out.notes[1].body, 'Ring 020 8123 4567.');
  assert.equal(out.attachments.length, 1);
  assert.equal(out.attachments[0].size, 1200);
});

test('anything that is not a notebook backup is refused', () => {
  assert.equal(normalisePayload(null), null);
  assert.equal(normalisePayload({}), null);
  assert.equal(normalisePayload({ notes: [] }), null);
  assert.equal(normalisePayload({ notes: 'lots' }), null);
  assert.equal(normalisePayload({ notes: [null, 'x'] }), null);
});

test('a file larger than the import ceiling is refused rather than half-loaded', () => {
  const many = (n) => ({ notes: Array.from({ length: n }, (_, i) => ({ id: i + 1, title: 't' + i })) });
  assert.notEqual(normalisePayload(many(MAX_NOTES)), null);
  assert.equal(normalisePayload(many(MAX_NOTES + 1)), null);
});

test('missing and oversized fields are coerced, not trusted', () => {
  const out = normalisePayload({
    notes: [{ title: null, body: null }, { title: 'x'.repeat(400), body: 'b', isSection: 'yes' }],
    attachments: [{ noteId: 1, url: '', filename: 'orphan.pdf' }, { noteId: 1, url: 'https://b/y', size: 'huge' }],
  });
  assert.equal(out.notes[0].title, 'Untitled');
  assert.equal(out.notes[0].body, '');
  assert.equal(out.notes[0].parentId, null);
  assert.equal(out.notes[1].title.length, 200);
  assert.equal(out.notes[1].isSection, true);
  // A file record with no url points at nothing, so it is dropped.
  assert.equal(out.attachments.length, 1);
  assert.equal(out.attachments[0].size, 0);
  assert.equal(out.attachments[0].contentType, 'application/octet-stream');
});

test('a save is named by the reader, or by what took it', () => {
  assert.equal(cleanLabel('  before   the rewrite ', 'Save'), 'before the rewrite');
  assert.equal(cleanLabel('', 'Save'), 'Save');
  assert.equal(cleanLabel(null, 'Before loading a save'), 'Before loading a save');
  assert.equal(cleanLabel('y'.repeat(200), 'Save').length, 120);
});
