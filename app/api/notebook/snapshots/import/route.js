// Store an uploaded backup file as a save: POST { label?, load?, notes, attachments }.
//
// The body is a notebook backup as /api/notebook/export writes it (a save
// downloaded from the list is the same file). Importing only ADDS it to the
// list — the notebook is untouched until the save is loaded, unless `load` is
// true, which loads it in the same request.
import { NextResponse } from 'next/server';
import { storeSnapshot, loadSnapshot } from '@/lib/notebook/snapshots';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch (e) { return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 }); }
  try {
    const snap = await storeSnapshot({ payload: body, label: body?.label, kind: 'import' });
    if (!snap) return NextResponse.json({ error: 'That file is not a notebook backup (no notes in it).' }, { status: 400 });
    if (!body?.load) return NextResponse.json({ ok: true, snapshot: snap });
    const result = await loadSnapshot(snap.id);
    if (result.error) return NextResponse.json({ error: result.error }, { status: 500 });
    return NextResponse.json({ ok: true, snapshot: snap, ...result });
  } catch (e) {
    return NextResponse.json({ error: 'Could not import that file.', detail: String(e.message || e).slice(0, 300) }, { status: 500 });
  }
}
