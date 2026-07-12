import { NextResponse } from 'next/server';
import { ensureKnowledgeSchema, getSql } from '@/lib/db';
import { drainKnowledgeAnalysisJobs, syncKnowledgeClaims } from '@/lib/knowledge';
import { denyNonLocalKnowledgeAdmin } from '@/lib/knowledge-admin-access';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Analyse a small batch at a time so the review page can progressively process
// a large library without one fragile, very long request.
export async function POST(request) {
  const denied = denyNonLocalKnowledgeAdmin(request); if (denied) return denied;
  let body = {};
  try { body = await request.json(); } catch (e) { /* defaults */ }
  try {
    await ensureKnowledgeSchema();
    const sql = getSql();
    const requested = String(body?.id || '');
    if (requested) {
      const rows = await sql`SELECT id,kind,title,content,data FROM knowledge_entries WHERE id=${requested} AND status='active'`;
      await Promise.all(rows.map((row) => syncKnowledgeClaims(row)));
      if (rows.length) await sql`
        DELETE FROM knowledge_analysis_jobs j USING knowledge_entries e
        WHERE j.entry_id=e.id AND j.entry_id=ANY(${rows.map((r) => r.id)}) AND e.claims_stale=false
      `;
      return NextResponse.json({ processed: rows.map((r) => ({ id: r.id, title: r.title })), remaining: false });
    }
    // The durable queue supplies atomic leases; four independent sources run
    // concurrently without two browser tabs analysing the same source.
    const results = await drainKnowledgeAnalysisJobs({ limit: 4 });
    const ids = results.map((result) => result.entryId);
    const rows = ids.length ? await sql`SELECT id,title FROM knowledge_entries WHERE id=ANY(${ids})` : [];
    const titleById = new Map(rows.map((row) => [row.id, row.title]));
    const due = await sql`
      SELECT EXISTS(
        SELECT 1 FROM knowledge_analysis_jobs j JOIN knowledge_entries e ON e.id=j.entry_id
        WHERE e.status='active' AND e.claims_stale=true AND j.available_at<=now()
          AND (j.locked_until IS NULL OR j.locked_until<now())
      ) AS remaining
    `;
    return NextResponse.json({
      processed: results.map((result) => ({ ...result, title: titleById.get(result.entryId) || result.entryId })),
      remaining: !!due[0]?.remaining,
    });
  } catch (e) { return NextResponse.json({ error: 'Could not analyse knowledge.', detail: String(e).slice(0, 400) }, { status: 500 }); }
}
