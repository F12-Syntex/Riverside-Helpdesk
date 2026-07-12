import { NextResponse } from 'next/server';
import { ensureKnowledgeSchema, getSql } from '@/lib/db';
import { getDirectory } from '@/lib/lookup/directory';
import { prepareBundledKnowledge } from '@/lib/knowledge-bootstrap';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET() {
  let rows = [];
  try {
    const ready = await prepareBundledKnowledge();
    if (ready) {
      await ensureKnowledgeSchema();
      const sql = getSql();
      rows = await sql`
        SELECT id,title,data FROM knowledge_entries
        WHERE kind='contact' AND status='active' ORDER BY title ASC
      `;
    }
  } catch (e) { /* static directory below remains available */ }

  const entries = rows.length
    ? rows.map((r) => ({
      id: r.id, label: r.title, category: r.data?.category || 'Other numbers',
      aliases: r.data?.aliases || [], phones: r.data?.phones || [], emails: r.data?.emails || [],
      note: r.data?.note || '', source: 'canonical',
    }))
    : getDirectory();
  return NextResponse.json({ entries }, { headers: { 'Cache-Control': 'private, no-store' } });
}
