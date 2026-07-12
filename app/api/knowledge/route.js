import { NextResponse } from 'next/server';
import { archiveKnowledgeEntry, getKnowledgeEntry, listKnowledge, syncKnowledgeClaims, upsertKnowledgeEntry } from '@/lib/knowledge';
import { denyNonLocalKnowledgeAdmin } from '@/lib/knowledge-admin-access';
import { deleteNote, updateNote } from '@/lib/notebook';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request) {
  const denied = denyNonLocalKnowledgeAdmin(request); if (denied) return denied;
  const p = new URL(request.url).searchParams;
  try {
    if (p.get('id')) return NextResponse.json({ entry: await getKnowledgeEntry(p.get('id')) });
    const entries = await listKnowledge({ kind: p.get('kind') || '', query: p.get('q') || '', status: p.get('status') || 'active' });
    return NextResponse.json({ entries });
  } catch (e) {
    return NextResponse.json({ error: 'Could not load knowledge.', detail: String(e).slice(0, 400) }, { status: 500 });
  }
}

async function save(body) {
  if (body.kind === 'note' && body.data?.legacyNoteId) {
    const note = await updateNote({ id: body.data.legacyNoteId, title: body.title, body: body.content });
    if (!note) throw new Error('Notebook page not found.');
    const data = { ...(body.data || {}), parentId: note.parentId, noteRevision: new Date(note.updatedAt).getTime() };
    delete data.backendOverride; delete data.correctedAt;
    return upsertKnowledgeEntry({
      ...body, id: `note:${note.id}`, content: note.body, data,
      sourceRef: `notebook:${note.id}`, authority: body.authority ?? 90,
    });
  }
  const entry = await upsertKnowledgeEntry({
    ...body,
    data: { ...(body.data || {}), backendOverride: true, correctedAt: new Date().toISOString() },
  });
  if (!entry.unchanged || entry.claimsStale) await syncKnowledgeClaims(entry);
  return entry;
}

export async function POST(request) {
  const denied = denyNonLocalKnowledgeAdmin(request); if (denied) return denied;
  let body;
  try { body = await request.json(); } catch (e) { return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 }); }
  if (!body?.title || !['document', 'note', 'contact'].includes(body?.kind)) return NextResponse.json({ error: 'A title and valid kind are required.' }, { status: 400 });
  try { return NextResponse.json({ entry: await save(body) }); }
  catch (e) { return NextResponse.json({ error: 'Could not save knowledge.', detail: String(e).slice(0, 400) }, { status: 500 }); }
}

export async function PATCH(request) {
  const denied = denyNonLocalKnowledgeAdmin(request); if (denied) return denied;
  let body;
  try { body = await request.json(); } catch (e) { return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 }); }
  if (!body?.id || !body?.title || !['document', 'note', 'contact'].includes(body?.kind)) return NextResponse.json({ error: 'An id, title and valid kind are required.' }, { status: 400 });
  try { return NextResponse.json({ entry: await save(body) }); }
  catch (e) { return NextResponse.json({ error: 'Could not update knowledge.', detail: String(e).slice(0, 400) }, { status: 500 }); }
}

export async function DELETE(request) {
  const denied = denyNonLocalKnowledgeAdmin(request); if (denied) return denied;
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'An id is required.' }, { status: 400 });
  try {
    const entry = await getKnowledgeEntry(id);
    if (entry?.kind === 'note' && entry.data?.legacyNoteId) await deleteNote(entry.data.legacyNoteId);
    else await archiveKnowledgeEntry(id, { backendOverride: true });
    return NextResponse.json({ ok: true });
  }
  catch (e) { return NextResponse.json({ error: 'Could not archive knowledge.', detail: String(e).slice(0, 400) }, { status: 500 }); }
}
