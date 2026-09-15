// Saves of the whole Notebook (see lib/notebook/snapshots.js).
//   GET    /api/notebook/snapshots               — list every save (no payloads)
//   GET    /api/notebook/snapshots?id=12         — one save, with its notes
//   GET    /api/notebook/snapshots?id=12&download=1 — the same JSON as a file
//   POST   /api/notebook/snapshots               — save the notebook as it stands { label? }
//   DELETE /api/notebook/snapshots?id=12         — forget a save
//
// Loading one back is /api/notebook/snapshots/load; storing an uploaded backup
// file as a save is /api/notebook/snapshots/import.
import { NextResponse } from 'next/server';
import { listSnapshots, getSnapshot, createSnapshot, deleteSnapshot } from '@/lib/notebook/snapshots';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function fileName(snap) {
  const stamp = new Date(snap.createdAt).toISOString().slice(0, 16).replace(/[:T]/g, '-');
  const label = String(snap.label || 'save').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);
  return `notebook-${label || 'save'}-${stamp}.json`;
}

export async function GET(request) {
  const params = new URL(request.url).searchParams;
  const id = parseInt(params.get('id') || '', 10);
  try {
    if (!id) return NextResponse.json({ snapshots: await listSnapshots() });
    const snap = await getSnapshot(id);
    if (!snap) return NextResponse.json({ error: 'That save no longer exists.' }, { status: 404 });
    if (params.get('download')) {
      return new NextResponse(JSON.stringify(snap.payload, null, 2), {
        headers: { 'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename="${fileName(snap)}"` },
      });
    }
    return NextResponse.json({ snapshot: snap });
  } catch (e) {
    return NextResponse.json({ error: 'Could not load the saves.', detail: String(e).slice(0, 300) }, { status: 500 });
  }
}

export async function POST(request) {
  let body = null;
  try { body = await request.json(); } catch (e) { body = null; }
  try {
    const snap = await createSnapshot({ label: body?.label, kind: 'manual' });
    if (!snap) return NextResponse.json({ error: 'There is nothing to save yet.' }, { status: 400 });
    if (snap.error) return NextResponse.json({ error: snap.error }, { status: 400 });
    return NextResponse.json({ ok: true, snapshot: snap });
  } catch (e) {
    return NextResponse.json({ error: 'Could not save the notebook.', detail: String(e).slice(0, 300) }, { status: 500 });
  }
}

export async function DELETE(request) {
  const id = parseInt(new URL(request.url).searchParams.get('id') || '', 10);
  if (!id) return NextResponse.json({ error: 'A valid id is required.' }, { status: 400 });
  try {
    const gone = await deleteSnapshot(id);
    if (!gone) return NextResponse.json({ error: 'That save no longer exists.' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: 'Could not delete the save.', detail: String(e).slice(0, 300) }, { status: 500 });
  }
}
