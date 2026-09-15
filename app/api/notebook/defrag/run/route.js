// Defragmenting the whole Notebook. One endpoint, one unit of work per call,
// because the run stops and waits for the reader whenever two pages disagree.
//
//   GET  ?runId=…                       the run's state (no id: the latest run)
//   POST { start: true, scope }         start one: read every page, find the
//                                       pairs that might disagree, queue the rest
//   POST { runId, step: true }          do the next thing — judge the next chunk
//                                       of candidates, or propose the next page
//   POST { contradictionId, decision, note, edits }
//                                       settle one flag: 'a' or 'b' (the other
//                                       page takes that wording), 'edit' (the
//                                       reader's own wording for either page or
//                                       both), 'dismiss', 'defer', 'resolved'
//   POST { itemId, apply|reject: true } apply or reject one page's proposal
//   POST { runId, applyAll: true }      apply the next proposal that passed
//                                       cleanly, and say how many are left
//   POST { runId, cancel: true }        abandon the run
//
// See lib/notebook/run.js for what each step refuses and why. Every write still
// goes through the single-page path, so nothing here can apply a rewrite the
// code checks and the meaning check have not both passed.
import { NextResponse } from 'next/server';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { AI_SDK_EXTRA_BODY } from '@/lib/ai/openrouter.mjs';
import { getModelRoles } from '@/lib/settings';
import { runState, startRun, stepRun, cancelRun, decideContradiction, applyRunItem, rejectRunItem, applyAllClean } from '@/lib/notebook/run.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const turn = () => 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const reply = (out) => NextResponse.json(out, { status: out && out.error ? out.status || 400 : 200 });

export async function GET(request) {
  try {
    const runId = new URL(request.url).searchParams.get('runId');
    return NextResponse.json(await runState(runId ? parseInt(runId, 10) : null));
  } catch (e) {
    console.error('[defrag/run]', e);
    return NextResponse.json({ error: 'Could not read the run.', detail: String(e.message || e).slice(0, 300) }, { status: 500 });
  }
}

export async function POST(request) {
  let body = null;
  try { body = await request.json(); } catch (e) { body = null; }
  if (!body) return NextResponse.json({ error: 'A JSON body is required.' }, { status: 400 });
  const turnId = turn();

  try {
    // The decisions and the writes need no model, so they work even without a key.
    if (body.contradictionId) {
      return reply(await decideContradiction({
        id: parseInt(body.contradictionId, 10),
        decision: String(body.decision || ''),
        note: body.note || '',
        edits: body.edits && typeof body.edits === 'object' ? body.edits : {},
        turnId,
      }));
    }
    if (body.itemId && body.apply) return reply(await applyRunItem({ itemId: parseInt(body.itemId, 10), turnId }));
    if (body.itemId && body.reject) return reply(await rejectRunItem({ itemId: parseInt(body.itemId, 10) }));
    if (body.runId && body.applyAll) return reply(await applyAllClean({ runId: parseInt(body.runId, 10), limit: body.limit, turnId }));
    if (body.runId && body.cancel) return reply(await cancelRun(parseInt(body.runId, 10)));
    if (body.start) return reply(await startRun({ scope: body.scope === 'needs-attention' ? 'needs-attention' : 'all', turnId }));

    if (body.runId && body.step) {
      const apiKey = process.env.OPENROUTER_API_KEY;
      if (!apiKey) return NextResponse.json({ error: 'OPENROUTER_API_KEY is not set.' }, { status: 500 });
      const openrouter = createOpenRouter({ apiKey, extraBody: AI_SDK_EXTRA_BODY });
      const roles = await getModelRoles();
      return reply(await stepRun({ runId: parseInt(body.runId, 10), openrouter, roles, turnId }));
    }

    return NextResponse.json({ error: 'Send { start: true } to begin, { runId, step: true } to advance, { contradictionId, decision } to settle a flag, or { itemId, apply: true } to apply a page.' }, { status: 400 });
  } catch (e) {
    console.error('[defrag/run]', e);
    return NextResponse.json({ error: 'The run could not be advanced.', detail: String(e.message || e).slice(0, 300) }, { status: 500 });
  }
}
