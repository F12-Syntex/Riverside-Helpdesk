// Notebook CRUD. Backed by the Neon `notes` table (see lib/notebook.js).
//   GET    /api/notebook          — list all notes (flat; the client builds the tree)
//   POST   /api/notebook          — create a note { title?, parentId? }
//   PATCH  /api/notebook          — update a note { id, title?, body? } (autosave)
//                                   or move it { id, parentId } (drag to a section)
//   DELETE /api/notebook?id=123   — delete a note (its sub-notes cascade)
//
// Notes written here are automatically used by the assistant: the /api/ask route
// pulls them in at request time as citable sources (no re-ingest, no redeploy).
import { NextResponse } from 'next/server';
import { del } from '@vercel/blob';
import { listNotes, createNote, updateNote, moveNote, deleteNote, listAttachments, attachmentsUnderNote } from '@/lib/notebook';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const notes = await listNotes();
    // Attachments are non-fatal: the notebook still works if blob metadata fails.
    const attachments = await listAttachments().catch(() => []);
    return NextResponse.json({ notes, attachments });
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
  if (body?.title == null && body?.body == null && typeof body?.isSection !== 'boolean' && body?.parentId == null) return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });
  try {
    // A move (reparent) is its own operation — validated against the tree.
    if (body?.parentId != null) {
      const out = await moveNote({ id: body.id, parentId: body.parentId });
      if (out.error) return NextResponse.json({ error: out.error }, { status: 400 });
      return NextResponse.json({ note: out.note });
    }
    const note = await updateNote({ id: body.id, title: body.title, body: body.body, isSection: body.isSection });
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
    // Collect blob urls before the DB cascade removes the attachment rows.
    const blobs = await attachmentsUnderNote(id).catch(() => []);
    await deleteNote(id);
    if (blobs.length) await del(blobs.map((b) => b.url)).catch(() => {});
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: 'Could not delete note.', detail: String(e).slice(0, 300) }, { status: 500 });
  }
}
