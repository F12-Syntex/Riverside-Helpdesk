// The Notebook map: every page, its health, and what the question log says
// about it. Read-only; nothing here calls a model.
import { NextResponse } from 'next/server';
import { listNotes, listAttachments } from '@/lib/notebook';
import { summariseBySource } from '@/lib/questions/log';
import { analyseNotebook } from '@/lib/notebook/analyse.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [notes, attachments, bySource] = await Promise.all([
      listNotes(),
      listAttachments().catch(() => []),
      summariseBySource().catch(() => ({})),
    ]);
    const report = analyseNotebook(notes, attachments, {});
    // The log names a page by the same "Notebook: A / B / C" string the
    // assistant cites, so that string is the join.
    for (const page of Object.values(report.pages)) {
      const key = 'Notebook: ' + page.path.join(' / ');
      if (bySource[key]) page.signals = bySource[key];
    }
    return NextResponse.json(report);
  } catch (e) {
    return NextResponse.json({ error: 'Could not build the Notebook map.', detail: String(e.message || e).slice(0, 300) }, { status: 500 });
  }
}
