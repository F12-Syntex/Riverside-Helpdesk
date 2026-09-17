// Restore a notebook backup produced by /api/notebook/export. Additive: every
// note in the file is recreated with fresh ids (hierarchy preserved) and
// existing notes are untouched. Attachment records are re-linked; the files
// themselves stay at their Vercel Blob URLs.
//
// IT STREAMS, because it used to finish in silence. The browser posted a file
// and then showed nothing — no bar, no count, not even a spinner — for as long
// as the import took, which on a few hundred pages was long enough to look
// broken and long enough to be clicked again. The work now reports where it is
// (see importNotebook), and each report goes down the wire as one line of JSON
// the moment it happens:
//
//   {"phase":"notes","done":312,"total":312}
//   {"phase":"attachments","done":12,"total":12}
//   {"phase":"ready","notes":312,"attachments":12}   <- the notebook is usable
//   {"phase":"indexing","done":60,"total":300}
//   {"phase":"done","notes":312,"attachments":12,"indexed":300}
//
// `ready` is the one that matters to the reader: the pages are in and the tree
// can be reloaded. What follows is the knowledge mirror, which the /knowledge
// tooling reads and which no answer depends on.
//
// A client that does not read the stream is not broken by it — the last line is
// the same object the route used to return, and an error arrives as a line with
// `error` on it rather than as a status code, because by then the response has
// already begun.
import { importNotebook } from '@/lib/notebook';
import { MAX_NOTES, normalisePayload } from '@/lib/notebook/snapshot-payload.mjs';
import { progressStream } from '@/lib/notebook/progress.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const bad = (error, status) => new Response(JSON.stringify({ error }), {
  status, headers: { 'Content-Type': 'application/json' },
});

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch (e) { return bad('Invalid request body.', 400); }

  const notes = Array.isArray(body?.notes) ? body.notes : null;
  if (!notes || !notes.length) return bad('No notes found in the backup file.', 400);
  if (notes.length > MAX_NOTES) return bad('Backup file is too large.', 400);
  // Everything that reaches the database is coerced by the one function that
  // decides what a backup is, rather than trusted as posted.
  const payload = normalisePayload(body);
  if (!payload) return bad('That file is not a notebook backup.', 400);

  return progressStream((send) => importNotebook({
    notes: payload.notes,
    attachments: payload.attachments,
    onProgress: (p) => send(p.phase === 'ready'
      ? { phase: 'ready', notes: p.done, attachments: payload.attachments.length }
      : p),
  }));
}
