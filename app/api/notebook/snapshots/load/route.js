// Load a save: POST { id }.
//
// This REPLACES the notebook with what the save holds — it is the rollback, not
// the additive import at /api/notebook/import. The state being left is saved
// first (an 'auto' save), so the load can itself be rolled back from the list.
//
// It streams its progress as NDJSON, one line per step, ending with the result
// the route used to return as its whole body. See lib/notebook/progress.mjs.
import { NextResponse } from 'next/server';
import { loadSnapshot } from '@/lib/notebook/snapshots';
import { progressStream } from '@/lib/notebook/progress.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(request) {
  let body = null;
  try { body = await request.json(); } catch (e) { body = null; }
  const id = parseInt(body?.id, 10);
  if (!id) return NextResponse.json({ error: 'A valid save id is required.' }, { status: 400 });

  // Streamed for the same reason the import is: this replaces the whole
  // notebook, and it used to do it in silence. See lib/notebook/progress.mjs.
  return progressStream(async (send) => {
    const result = await loadSnapshot(id, { onProgress: send });
    // A save that has gone, or holds nothing, is a refusal — and the response
    // has already opened, so it is a line rather than a 404.
    if (result.error) throw new Error(result.error);
    return result;
  });
}
