import { NextResponse } from 'next/server';
import { ensureKnowledgeSchema, getSql } from '@/lib/db';
import { extractClaims } from '@/lib/ai/claims';
import { replaceClaims } from '@/lib/knowledge';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Analyse a small batch at a time so the review page can progressively process
// a large library without one fragile, very long request.
export async function POST(request) {
  let body = {};
  try { body = await request.json(); } catch (e) { /* defaults */ }
  try {
    await ensureKnowledgeSchema();
    const sql = getSql();
    const requested = String(body?.id || '');
    const rows = requested
      ? await sql`SELECT id, kind, title, content, data FROM knowledge_entries WHERE id = ${requested} AND status = 'active'`
      : await sql`
          SELECT e.id, e.kind, e.title, e.content, e.data
          FROM knowledge_entries e LEFT JOIN knowledge_claims c ON c.entry_id = e.id
          WHERE e.status = 'active' AND e.kind <> 'contact' AND e.claims_stale = true
          GROUP BY e.id HAVING count(c.id) = 0
          ORDER BY e.authority DESC, e.updated_at DESC LIMIT 4
        `;
    // Model calls are independent; analyse the small batch concurrently, then
    // commit claims in a stable order to keep the database work predictable.
    const analysed = await Promise.all(rows.map(async (row) => ({ row, claims: await extractClaims(row) })));
    for (const { row, claims } of analysed) await replaceClaims(row.id, claims);
    return NextResponse.json({ processed: rows.map((r) => ({ id: r.id, title: r.title })), remaining: !requested && rows.length === 4 });
  } catch (e) { return NextResponse.json({ error: 'Could not analyse knowledge.', detail: String(e).slice(0, 400) }, { status: 500 }); }
}
