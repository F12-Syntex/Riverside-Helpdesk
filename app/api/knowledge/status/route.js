import { NextResponse } from 'next/server';
import { ensureKnowledgeSchema, getSql } from '@/lib/db';
import { denyNonLocalKnowledgeAdmin } from '@/lib/knowledge-admin-access';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const denied = denyNonLocalKnowledgeAdmin(request); if (denied) return denied;
  try {
    await ensureKnowledgeSchema();
    const sql = getSql();
    const rows = await sql`
      SELECT
        (SELECT count(*)::int FROM knowledge_entries WHERE status='active') AS entries,
        (SELECT count(*)::int FROM knowledge_entries WHERE status='active' AND claims_stale) AS "pendingAnalysis",
        (SELECT count(*)::int FROM knowledge_passages p JOIN knowledge_entries e ON e.id=p.entry_id WHERE e.status='active') AS passages,
        (SELECT count(*)::int FROM knowledge_claims c JOIN knowledge_entries e ON e.id=c.entry_id WHERE e.status='active' AND c.passage_id IS NOT NULL) AS "verifiedClaims",
        (SELECT count(*)::int FROM knowledge_conflicts WHERE status='open') AS contradictions,
        (SELECT count(*)::int FROM knowledge_analysis_jobs j JOIN knowledge_entries e ON e.id=j.entry_id WHERE e.status='active' AND e.claims_stale) AS jobs
    `;
    return NextResponse.json({ status: rows[0] }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (e) {
    return NextResponse.json({ error: 'Could not load knowledge status.' }, { status: 500 });
  }
}
