import { NextResponse } from 'next/server';
import { ensureBundledKnowledge } from '@/lib/knowledge-bootstrap';
import { denyNonLocalKnowledgeAdmin } from '@/lib/knowledge-admin-access';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

let syncRunning = false;

export async function POST(request) {
  const denied = denyNonLocalKnowledgeAdmin(request); if (denied) return denied;
  if (syncRunning) return NextResponse.json({ error: 'A knowledge reconciliation is already running.' }, { status: 409 });
  syncRunning = true;
  try {
    const summary = await ensureBundledKnowledge({ force: true });
    return NextResponse.json({ ok: true, summary });
  } catch (e) {
    return NextResponse.json({ error: 'Could not reconcile knowledge.', detail: String(e).slice(0, 500) }, { status: 500 });
  } finally {
    syncRunning = false;
  }
}
