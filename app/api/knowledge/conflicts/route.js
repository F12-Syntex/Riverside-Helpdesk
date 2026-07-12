import { NextResponse } from 'next/server';
import { listConflicts, resolveConflict } from '@/lib/knowledge';
import { denyNonLocalKnowledgeAdmin } from '@/lib/knowledge-admin-access';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const denied = denyNonLocalKnowledgeAdmin(request); if (denied) return denied;
  try {
    const status = new URL(request.url).searchParams.get('status') || 'open';
    return NextResponse.json({ conflicts: await listConflicts(status) });
  } catch (e) { return NextResponse.json({ error: 'Could not load contradictions.', detail: String(e).slice(0, 400) }, { status: 500 }); }
}

export async function PATCH(request) {
  const denied = denyNonLocalKnowledgeAdmin(request); if (denied) return denied;
  let body;
  try { body = await request.json(); } catch (e) { return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 }); }
  if (!parseInt(body?.id, 10)) return NextResponse.json({ error: 'A valid id is required.' }, { status: 400 });
  try {
    await resolveConflict(body.id, body.status, body.resolution);
    return NextResponse.json({ ok: true });
  } catch (e) { return NextResponse.json({ error: 'Could not resolve contradiction.', detail: String(e).slice(0, 400) }, { status: 500 }); }
}
