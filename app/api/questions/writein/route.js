// Write answered questions into the Notebook.
//
//   POST { action: 'plan' }            find each unwritten answer's page and
//                                      propose each page's new text — stores nothing
//   POST { action: 'apply', pages }    write the pages the reader kept: a Notebook
//                                      save first, a revision of each page, and a
//                                      page changed since the plan is refused
//
// See lib/questions/writein.js (and ./writein.mjs for the prompts and checks).
import { NextResponse } from 'next/server';
import { createRouter } from '@/lib/ai/openrouter.mjs';
import { getModelRoles } from '@/lib/settings';
import { applyWriteIn, planWriteIn } from '@/lib/questions/writein';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const noStore = { 'Cache-Control': 'no-store' };

export async function POST(request) {
  let body = null;
  try { body = await request.json(); } catch (e) { body = null; }
  if (!body) return NextResponse.json({ error: 'Invalid request body.' }, { status: 400, headers: noStore });
  const turnId = 'w' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  try {
    if (body.action === 'apply') {
      return NextResponse.json(await applyWriteIn({ pages: body.pages, turnId }), { headers: noStore });
    }
    if (body.action !== 'plan') return NextResponse.json({ error: 'Send { action: "plan" } or { action: "apply", pages }.' }, { status: 400, headers: noStore });
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'Server is missing OPENROUTER_API_KEY.' }, { status: 500, headers: noStore });
    const openrouter = createRouter(apiKey);
    const roles = await getModelRoles();
    return NextResponse.json(await planWriteIn({ apiKey, openrouter, roles, turnId }), { headers: noStore });
  } catch (e) {
    console.error('[questions/writein]', e);
    return NextResponse.json(
      { error: body.action === 'apply' ? 'The answers could not be written in.' : 'The answers could not be placed.', detail: String(e.message || e).slice(0, 300) },
      { status: 500, headers: noStore },
    );
  }
}
