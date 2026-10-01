// Tidy older questions into the template: a title, word-for-word context
// points and the question (lib/questions/template.mjs).
//
//   GET                                   how many are not in the template yet
//   POST { action: 'plan' }               propose the template for up to 40 of
//                                         them — stores nothing
//   POST { action: 'apply', items, skipIds }
//                                         save the ones the reader kept; the
//                                         ones they left are not offered again
import { NextResponse } from 'next/server';
import { getAiModel } from '@/lib/settings';
import { chatRequest } from '@/lib/ai/openrouter.mjs';
import { listUnformattedQuestions, saveFormattedQuestions } from '@/lib/questions/open';
import { REFORMAT_PROMPT, parseReformatted, reformatItems } from '@/lib/questions/template.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const noStore = { 'Cache-Control': 'no-store' };

export async function GET() {
  try {
    const { total } = await listUnformattedQuestions({ limit: 1 });
    return NextResponse.json({ total }, { headers: noStore });
  } catch (e) {
    return NextResponse.json({ error: 'Could not count the questions.', detail: String(e.message || e).slice(0, 200) }, { status: 500, headers: noStore });
  }
}

export async function POST(request) {
  let body = null;
  try { body = await request.json(); } catch (e) { body = null; }
  if (!body) return NextResponse.json({ error: 'Invalid request body.' }, { status: 400, headers: noStore });

  try {
    if (body.action === 'apply') {
      return NextResponse.json(await saveFormattedQuestions(body.items, { skipIds: body.skipIds }), { headers: noStore });
    }
    if (body.action !== 'plan') return NextResponse.json({ error: 'Send { action: "plan" } or { action: "apply", items }.' }, { status: 400, headers: noStore });

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'Server is missing OPENROUTER_API_KEY.' }, { status: 500, headers: noStore });
    const { rows, more, total } = await listUnformattedQuestions({ limit: 40 });
    if (!rows.length) return NextResponse.json({ items: [], more: false, total: 0 }, { headers: noStore });

    const res = await fetch(...chatRequest(apiKey, {
      model: await getAiModel(),
      temperature: 0,
      max_tokens: 16000,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: REFORMAT_PROMPT + reformatItems(rows) }],
    }));
    if (!res.ok) return NextResponse.json({ error: `The AI service returned an error (${res.status}).` }, { status: 502, headers: noStore });
    const data = await res.json();
    const proposed = new Map(parseReformatted(data?.choices?.[0]?.message?.content || '', rows).map((p) => [p.id, p]));
    const items = rows.map((r) => ({
      id: Number(r.id),
      before: { question: r.question, detail: r.detail || '' },
      after: proposed.get(Number(r.id)) || null,
    }));
    return NextResponse.json({ items, more, total }, { headers: noStore });
  } catch (e) {
    console.error('[questions/reformat]', e);
    return NextResponse.json({ error: 'The questions could not be tidied.', detail: String(e.message || e).slice(0, 300) }, { status: 500, headers: noStore });
  }
}
