// Restore a notebook backup produced by /api/notebook/export. Additive: every
// note in the file is recreated with fresh ids (hierarchy preserved) and
// existing notes are untouched. Attachment records are re-linked; the files
// themselves stay at their Vercel Blob URLs.
import { NextResponse } from 'next/server';
import { importNotebook } from '@/lib/notebook';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch (e) { return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 }); }
  const notes = Array.isArray(body?.notes) ? body.notes : null;
  if (!notes || !notes.length) return NextResponse.json({ error: 'No notes found in the backup file.' }, { status: 400 });
  if (notes.length > 5000) return NextResponse.json({ error: 'Backup file is too large.' }, { status: 400 });
  try {
    const result = await importNotebook({ notes, attachments: Array.isArray(body.attachments) ? body.attachments : [] });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: 'Could not import notes.', detail: String(e).slice(0, 300) }, { status: 500 });
  }
}
