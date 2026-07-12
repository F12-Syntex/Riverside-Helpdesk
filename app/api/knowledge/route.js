import { NextResponse } from 'next/server';
import { archiveKnowledgeEntry, listKnowledge, upsertKnowledgeEntry, replaceClaims } from '@/lib/knowledge';
import { extractClaims } from '@/lib/ai/claims';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const p = new URL(request.url).searchParams;
  try {
    const entries = await listKnowledge({ kind: p.get('kind') || '', query: p.get('q') || '', status: p.get('status') || 'active' });
    return NextResponse.json({ entries });
  } catch (e) {
    return NextResponse.json({ error: 'Could not load knowledge.', detail: String(e).slice(0, 400) }, { status: 500 });
  }
}

async function save(body) {
  const entry = await upsertKnowledgeEntry(body);
  const claims = await extractClaims(entry);
  await replaceClaims(entry.id, claims);
  return entry;
}

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch (e) { return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 }); }
  if (!body?.title || !['document', 'note', 'contact'].includes(body?.kind)) return NextResponse.json({ error: 'A title and valid kind are required.' }, { status: 400 });
  try { return NextResponse.json({ entry: await save(body) }); }
  catch (e) { return NextResponse.json({ error: 'Could not save knowledge.', detail: String(e).slice(0, 400) }, { status: 500 }); }
}

export async function PATCH(request) {
  let body;
  try { body = await request.json(); } catch (e) { return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 }); }
  if (!body?.id || !body?.title || !['document', 'note', 'contact'].includes(body?.kind)) return NextResponse.json({ error: 'An id, title and valid kind are required.' }, { status: 400 });
  try { return NextResponse.json({ entry: await save(body) }); }
  catch (e) { return NextResponse.json({ error: 'Could not update knowledge.', detail: String(e).slice(0, 400) }, { status: 500 }); }
}

export async function DELETE(request) {
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'An id is required.' }, { status: 400 });
  try { await archiveKnowledgeEntry(id); return NextResponse.json({ ok: true }); }
  catch (e) { return NextResponse.json({ error: 'Could not archive knowledge.', detail: String(e).slice(0, 400) }, { status: 500 }); }
}
