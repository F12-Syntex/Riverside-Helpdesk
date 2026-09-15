// One page, rewritten under supervision. Three shapes on one endpoint:
//
//   POST { noteId }                    propose: model rewrite, code validation,
//                                      independent meaning check; stored as a draft
//   POST { proposalId, body }          re-check an edited proposal
//   POST { proposalId, apply: true }   apply: re-validated server-side, snapshot first
//   POST { proposalId, reject: true }  mark it rejected
//
// See lib/notebook/defrag.js for what each step refuses and why.
import { NextResponse } from 'next/server';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { AI_SDK_EXTRA_BODY } from '@/lib/ai/openrouter.mjs';
import { getModelRoles } from '@/lib/settings';
import { proposeDefrag, revalidateProposal, applyProposal, rejectProposal } from '@/lib/notebook/defrag.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(request) {
  let body = null;
  try { body = await request.json(); } catch (e) { body = null; }
  if (!body) return NextResponse.json({ error: 'A JSON body is required.' }, { status: 400 });
  const turnId = 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  try {
    if (body.proposalId && body.apply) {
      const out = await applyProposal({ proposalId: parseInt(body.proposalId, 10), turnId });
      return NextResponse.json(out, { status: out.error ? out.status || 400 : 200 });
    }
    if (body.proposalId && body.reject) {
      const out = await rejectProposal({ proposalId: parseInt(body.proposalId, 10) });
      return NextResponse.json(out, { status: out.error ? out.status || 400 : 200 });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'OPENROUTER_API_KEY is not set.' }, { status: 500 });
    const openrouter = createOpenRouter({ apiKey, extraBody: AI_SDK_EXTRA_BODY });
    const roles = await getModelRoles();

    if (body.proposalId && typeof body.body === 'string') {
      const out = await revalidateProposal({ proposalId: parseInt(body.proposalId, 10), body: body.body, openrouter, roles, turnId });
      return NextResponse.json(out, { status: out.error ? out.status || 400 : 200 });
    }
    if (body.noteId) {
      const out = await proposeDefrag({ noteId: parseInt(body.noteId, 10), openrouter, roles, turnId });
      return NextResponse.json(out, { status: out.error ? out.status || 400 : 200 });
    }
    return NextResponse.json({ error: 'Send { noteId } to propose, { proposalId, body } to re-check, or { proposalId, apply: true } to apply.' }, { status: 400 });
  } catch (e) {
    console.error('[defrag]', e);
    return NextResponse.json({ error: 'The rewrite could not be completed.', detail: String(e.message || e).slice(0, 300) }, { status: 500 });
  }
}
