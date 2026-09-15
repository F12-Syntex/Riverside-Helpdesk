// Load a save: POST { id }.
//
// This REPLACES the notebook with what the save holds — it is the rollback, not
// the additive import at /api/notebook/import. The state being left is saved
// first (an 'auto' save), so the load can itself be rolled back from the list.
import { NextResponse } from 'next/server';
import { loadSnapshot } from '@/lib/notebook/snapshots';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(request) {
  let body = null;
  try { body = await request.json(); } catch (e) { body = null; }
  const id = parseInt(body?.id, 10);
  if (!id) return NextResponse.json({ error: 'A valid save id is required.' }, { status: 400 });
  try {
    const result = await loadSnapshot(id);
    if (result.error) return NextResponse.json({ error: result.error }, { status: 404 });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: 'Could not load that save.', detail: String(e.message || e).slice(0, 300) }, { status: 500 });
  }
}
