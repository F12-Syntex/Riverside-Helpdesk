// Notebook backup: downloads every note + attachment record as one JSON file
// that /api/notebook/import can restore on any deployment (works on Vercel —
// no filesystem involved, data comes straight from Postgres).
import { NextResponse } from 'next/server';
import { listNotes, listAttachments } from '@/lib/notebook';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const notes = await listNotes();
    const attachments = await listAttachments().catch(() => []);
    const payload = {
      version: 1,
      kind: 'riverside-notebook-backup',
      exportedAt: new Date().toISOString(),
      notes,
      attachments,
    };
    const stamp = new Date().toISOString().slice(0, 10);
    return new NextResponse(JSON.stringify(payload, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="notebook-backup-${stamp}.json"`,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: 'Could not export notes.', detail: String(e).slice(0, 300) }, { status: 500 });
  }
}
