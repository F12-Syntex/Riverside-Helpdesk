// Put a page back to an earlier revision. POST { revisionId }.
import { NextResponse } from 'next/server';
import { revertToRevision, listRevisions } from '@/lib/notebook';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  let body = null;
  try { body = await request.json(); } catch (e) { body = null; }
  const revisionId = parseInt(body?.revisionId, 10);
  if (!revisionId) return NextResponse.json({ error: 'revisionId is required.' }, { status: 400 });
  try {
    const turnId = 'r' + Date.now().toString(36);
    const result = await revertToRevision(revisionId, { turnId });
    if (result.error) return NextResponse.json({ error: result.error }, { status: 404 });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: 'Could not revert the page.', detail: String(e.message || e).slice(0, 300) }, { status: 500 });
  }
}

// GET ?noteId= — the revisions a page has.
export async function GET(request) {
  const noteId = parseInt(new URL(request.url).searchParams.get('noteId'), 10);
  if (!noteId) return NextResponse.json({ error: 'noteId is required.' }, { status: 400 });
  try {
    return NextResponse.json({ revisions: await listRevisions(noteId) });
  } catch (e) {
    return NextResponse.json({ error: 'Could not list revisions.', detail: String(e.message || e).slice(0, 300) }, { status: 500 });
  }
}
