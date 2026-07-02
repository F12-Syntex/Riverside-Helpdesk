// Notebook CRUD. Backed by the Neon `notes` table (see lib/notebook.js).
//   GET    /api/notebook          — list all notes (flat; the client builds the tree)
//   POST   /api/notebook          — create a note { title?, parentId? }
//   PATCH  /api/notebook          — update a note { id, title?, body? }  (autosave)
//   DELETE /api/notebook?id=123   — delete a note (its sub-notes cascade)
//
// Notes written here are automatically used by the assistant: the /api/ask route
// pulls them in at request time as citable sources (no re-ingest, no redeploy).
import { NextResponse } from 'next/server';
import { listNotes, createNote, updateNote, deleteNote } from '@/lib/notebook';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const notes = await listNotes();
    return NextResponse.json({ notes });
  } catch (e) {
    return NextResponse.json({ error: 'Could not load notes.', detail: String(e).slice(0, 300) }, { status: 500 });
  }
}

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch (e) { return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 }); }
  try {
    const note = await createNote({ title: body?.title, parentId: body?.parentId });
    return NextResponse.json({ note });
  } catch (e) {
    return NextResponse.json({ error: 'Could not create note.', detail: String(e).slice(0, 300) }, { status: 500 });
  }
}

export async function PATCH(request) {
  let body;
  try { body = await request.json(); } catch (e) { return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 }); }
  if (!parseInt(body?.id, 10)) return NextResponse.json({ error: 'A valid id is required.' }, { status: 400 });
  if (body?.title == null && body?.body == null) return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });
  try {
    const note = await updateNote({ id: body.id, title: body.title, body: body.body });
    if (!note) return NextResponse.json({ error: 'Note not found.' }, { status: 404 });
    return NextResponse.json({ note });
  } catch (e) {
    return NextResponse.json({ error: 'Could not save note.', detail: String(e).slice(0, 300) }, { status: 500 });
  }
}

export async function DELETE(request) {
  const id = parseInt(new URL(request.url).searchParams.get('id') || '', 10);
  if (!id) return NextResponse.json({ error: 'A valid id is required.' }, { status: 400 });
  try {
    await deleteNote(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: 'Could not delete note.', detail: String(e).slice(0, 300) }, { status: 500 });
  }
}
