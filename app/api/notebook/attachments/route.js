// Notebook attachments. Files are stored in Vercel Blob (BLOB_READ_WRITE_TOKEN
// from the environment); metadata lives in the note_attachments table so every
// file is tied to a note and cleaned up when the note goes.
//   POST   /api/notebook/attachments        — multipart form { noteId, file }
//   DELETE /api/notebook/attachments?id=12  — remove one attachment (row + blob)
import { NextResponse } from 'next/server';
import { put, del } from '@vercel/blob';
import { createAttachment, deleteAttachment, getNote } from '@/lib/notebook';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 20 * 1024 * 1024; // 20 MB per file

export async function POST(request) {
  let form;
  try { form = await request.formData(); } catch (e) {
    return NextResponse.json({ error: 'Expected multipart form data.' }, { status: 400 });
  }
  const noteId = parseInt(form.get('noteId'), 10);
  const file = form.get('file');
  if (!noteId) return NextResponse.json({ error: 'A valid noteId is required.' }, { status: 400 });
  if (!file || typeof file === 'string') return NextResponse.json({ error: 'A file is required.' }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'File is too large (20 MB max).' }, { status: 413 });

  // Sections are name-only categories — files belong on pages. Checked before
  // the blob upload so a rejected request stores nothing.
  const note = await getNote(noteId).catch(() => null);
  if (!note) return NextResponse.json({ error: 'Note not found.' }, { status: 404 });
  if (note.parentId == null) return NextResponse.json({ error: 'Files attach to pages, not sections.' }, { status: 400 });

  const safeName = (file.name || 'file').replace(/[^\w.\- ()]/g, '_').slice(0, 200);
  try {
    const blob = await put(`notebook/${noteId}/${safeName}`, file, {
      access: 'public',
      addRandomSuffix: true,
      contentType: file.type || 'application/octet-stream',
    });
    const attachment = await createAttachment({
      noteId,
      url: blob.url,
      pathname: blob.pathname,
      filename: file.name || safeName,
      contentType: file.type,
      size: file.size,
    });
    if (!attachment) {
      await del(blob.url).catch(() => {});
      return NextResponse.json({ error: 'Note not found.' }, { status: 404 });
    }
    return NextResponse.json({ attachment });
  } catch (e) {
    return NextResponse.json({ error: 'Could not upload file.', detail: String(e).slice(0, 300) }, { status: 500 });
  }
}

export async function DELETE(request) {
  const id = parseInt(new URL(request.url).searchParams.get('id') || '', 10);
  if (!id) return NextResponse.json({ error: 'A valid id is required.' }, { status: 400 });
  try {
    const removed = await deleteAttachment(id);
    if (removed) await del(removed.url).catch(() => {});
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: 'Could not delete attachment.', detail: String(e).slice(0, 300) }, { status: 500 });
  }
}
