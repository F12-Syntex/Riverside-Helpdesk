// Restoring a notebook: the stream that says where it has got to.
//
// The two operations that rewrite the whole notebook — importing a backup and
// loading a save — used to happen behind a closed door. The browser posted, and
// nothing moved on screen until it was over. On a few hundred pages that was
// long enough to look broken and long enough to be clicked twice.
//
// What this file holds is the contract between the two halves: the server sends
// one JSON object per line and the browser reads them as they arrive, a failure
// after the response has opened is a LINE rather than a status code, and a
// half-written line at the end of a chunk is never parsed as a whole one.
import test from 'node:test';
import assert from 'node:assert/strict';

import { PHASE_LABELS, phaseLabel, progressStream, readProgress } from '../lib/notebook/progress.mjs';
import { normalisePayload } from '../lib/notebook/snapshot-payload.mjs';
import { importParents } from '../lib/notebook/import-parents.mjs';

// A Response as fetch would hand it back, from lines the server sent — chunked
// wherever the caller says, so a line can be split across two reads.
function streamed(chunks, { ok = true, body = true } = {}) {
  let i = 0;
  return {
    ok,
    body: body ? {
      getReader: () => ({
        read: async () => (i < chunks.length
          ? { value: new TextEncoder().encode(chunks[i++]), done: false }
          : { value: undefined, done: true }),
      }),
    } : null,
    json: async () => JSON.parse(chunks.join('')),
  };
}

const collect = async (res) => {
  const seen = [];
  const out = await readProgress(res, (step) => seen.push(step));
  return { seen, out };
};

/* ------------------------------------------------------------ the reader */

test('every line arrives, and the last one comes back', async () => {
  const { seen, out } = await collect(streamed([
    '{"phase":"notes","done":0,"total":3}\n',
    '{"phase":"notes","done":3,"total":3}\n{"phase":"ready","notes":3}\n',
    '{"phase":"done","ok":true,"notes":3,"indexed":2}\n',
  ]));
  assert.deepEqual(seen.map((s) => s.phase), ['notes', 'notes', 'ready', 'done']);
  assert.equal(out.notes, 3);
  assert.equal(out.indexed, 2);
});

test('a line split across two chunks is one line', async () => {
  const { seen } = await collect(streamed(['{"phase":"not', 'es","done":7,"total":7}\n{"phase":"done","ok":true}\n']));
  assert.deepEqual(seen.map((s) => s.done), [7, undefined]);
});

test('a last line with no newline on it is still read', async () => {
  const { out } = await collect(streamed(['{"phase":"done","ok":true,"notes":4}']));
  assert.equal(out.notes, 4);
});

test('a failure AFTER the stream opened is thrown, not returned', async () => {
  // By then the status is long since 200, so the error can only be a line.
  await assert.rejects(
    collect(streamed(['{"phase":"notes","done":1,"total":9}\n{"phase":"error","error":"Could not import notes."}\n'])),
    /Could not import notes/,
  );
});

test('a refusal BEFORE it opened is read as ordinary JSON', async () => {
  await assert.rejects(collect(streamed(['{"error":"Backup file is too large."}'], { ok: false })), /too large/);
  await assert.rejects(collect(streamed([], { body: false })), /did not finish/);
});

test('a half-written line is skipped rather than guessed at', async () => {
  const { seen } = await collect(streamed(['{"phase":"notes"\n{"phase":"done","ok":true}\n']));
  assert.deepEqual(seen.map((s) => s.phase), ['done']);
});

/* ------------------------------------------------------------ the sender */

const linesOf = async (res) => {
  const text = await new Response(res.body).text();
  return text.trim().split('\n').map((l) => JSON.parse(l));
};

test('the stream sends each step as it happens, then the result', async () => {
  const res = progressStream(async (send) => {
    send({ phase: 'notes', done: 0, total: 2 });
    send({ phase: 'notes', done: 2, total: 2 });
    return { notes: 2, attachments: 0, indexed: 2 };
  });
  assert.match(res.headers.get('Content-Type'), /ndjson/);
  // Proxies buffer a response until it ends unless told not to, which would
  // defeat the entire point of sending it in pieces.
  assert.equal(res.headers.get('X-Accel-Buffering'), 'no');

  const lines = await linesOf(res);
  assert.deepEqual(lines.map((l) => l.phase), ['notes', 'notes', 'done']);
  assert.deepEqual(lines[2], { phase: 'done', ok: true, notes: 2, attachments: 0, indexed: 2 });
});

test('a job that throws ends the stream with the reason on it', async () => {
  const res = progressStream(async (send) => {
    send({ phase: 'notes', done: 0, total: 5 });
    throw new Error('the database went away');
  });
  const lines = await linesOf(res);
  assert.equal(lines[1].phase, 'error');
  assert.match(lines[1].detail, /database went away/);
  // And the reader turns that back into a throw, so a caller writes one catch.
  await assert.rejects(collect(streamed(lines.map((l) => JSON.stringify(l) + '\n'))), /did not finish/);
});

test('the server is the only place a step is given a name', () => {
  // The two pages that show a bar read their wording from here, so they cannot
  // describe the same step differently.
  for (const phase of ['saving', 'clearing', 'notes', 'attachments', 'indexing']) {
    assert.ok(PHASE_LABELS[phase], phase + ' has no wording');
    assert.equal(phaseLabel(phase), PHASE_LABELS[phase]);
  }
  assert.equal(phaseLabel('something else'), 'Working');
});

/* ------------------------------------------------- what a backup carries */

test('a note kind and its fields survive a backup, and an old backup has neither', () => {
  const clean = normalisePayload({
    notes: [
      { id: 1, parentId: null, title: 'Referrals', isSection: true },
      { id: 2, parentId: 1, title: 'Dermatology', body: 'x', kind: 'ersReferral', fields: { specialty: 'Dermatology' } },
      { id: 3, parentId: 1, title: 'How referrals work', body: 'y' },
      { id: 4, parentId: 1, title: 'Made up', body: 'z', kind: 'somethingElse', fields: 'not an object' },
    ],
  });
  assert.equal(clean.notes[1].kind, 'ersReferral');
  assert.equal(clean.notes[1].fields.specialty, 'Dermatology');
  // A file written before notes had a kind restores as free writing, which is
  // exactly what those pages were.
  assert.equal(clean.notes[2].kind, 'note');
  assert.deepEqual(clean.notes[2].fields, {});
  // A kind this build does not have is a page, not a card half-rendered as one.
  assert.equal(clean.notes[3].kind, 'note');
  assert.deepEqual(clean.notes[3].fields, {});
});

/* ----------------------------------------------- the awkward backup files */
//
// The hierarchy used to be rebuilt by inserting notes whose parent already
// existed, over and over, until a pass placed nothing. What it could not place
// ended up at the top level — implicitly, by running out of passes. The ids are
// taken up front now, so the same decisions are made in one go and can be
// stated: a page whose parent is missing, or in a loop, goes to the top.

const parentsOf = (rows) => importParents(rows, rows.map((n, i) => 100 + i)).parents;

test('an ordinary tree is remapped onto the new ids', () => {
  assert.deepEqual(parentsOf([
    { id: 7, parentId: null },
    { id: 8, parentId: 7 },
    { id: 9, parentId: 8 },
  ]), [null, 100, 101]);
});

test('a parent the file does not hold leaves the page at the top', () => {
  assert.deepEqual(parentsOf([{ id: 1, parentId: null }, { id: 2, parentId: 404 }]), [null, null]);
});

test('a loop in the parent chain leaves those pages at the top', () => {
  // Two notes naming each other, and a child of one of them. None can reach a
  // root, so all three land at the top rather than hanging the walk.
  assert.deepEqual(parentsOf([
    { id: 1, parentId: 2 },
    { id: 2, parentId: 1 },
    { id: 3, parentId: 1 },
  ]), [null, null, null]);
});

test('a note with no id is imported, but is nobody’s parent', () => {
  const rows = [{ id: null, parentId: null }, { id: null, parentId: null }, { id: 3, parentId: null }];
  const { map, parents } = importParents(rows, [100, 101, 102]);
  assert.deepEqual(parents, [null, null, null]);
  // Neither of the two unnamed notes is in the map, so nothing can be attached
  // to "the note with no id" — which would otherwise be both of them.
  assert.deepEqual([...map.keys()], [3]);
});

test('two notes sharing an id: the first wins, and the second is still imported', () => {
  const rows = [
    { id: 4, parentId: null },
    { id: 4, parentId: null },
    { id: 5, parentId: 4 },
  ];
  const { map, parents } = importParents(rows, [100, 101, 102]);
  assert.equal(map.get(4), 100, 'the second note with id 4 took the first one’s place');
  // The child attaches to one of them, deterministically, rather than to
  // whichever happened to be inserted last.
  assert.deepEqual(parents, [null, null, 100]);
});
