// Find the questions in a pasted block of text.
//
//   POST /api/questions/extract   { text }  →  { questions: [{ question, detail }] }
//
// Stores nothing. The page shows what was found for somebody to tick and edit,
// then adds each through POST /api/questions/open like a typed question. The
// prompt and the reading of the reply are in lib/questions/extract.mjs.
import { NextResponse } from 'next/server';
import { getAiModel } from '@/lib/settings';
import { chatRequest } from '@/lib/ai/openrouter.mjs';
import { EXTRACT_PROMPT, MAX_PASTE, parseExtracted } from '@/lib/questions/extract.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStore = { 'Cache-Control': 'no-store' };

export async function POST(request) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Server is missing OPENROUTER_API_KEY.' }, { status: 500, headers: noStore });
  }

  let body;
  try { body = await request.json(); } catch (e) {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400, headers: noStore });
  }
  const text = String(body?.text || '').trim();
  if (!text) return NextResponse.json({ error: 'Paste some text first.' }, { status: 400, headers: noStore });
  if (text.length > MAX_PASTE) {
    return NextResponse.json(
      { error: `That is too long to read in one go — paste it in parts of up to ${MAX_PASTE.toLocaleString('en-GB')} characters.` },
      { status: 400, headers: noStore },
    );
  }

  try {
    const model = await getAiModel();
    // No-retention routing and minimal reasoning, both from lib/ai/openrouter.
    const res = await fetch(...chatRequest(apiKey, {
      model,
      temperature: 0,
      max_tokens: 6000,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: EXTRACT_PROMPT + text }],
    }));
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return NextResponse.json(
        { error: `The AI service returned an error (${res.status}).`, detail: detail.slice(0, 500) },
        { status: 502, headers: noStore },
      );
    }
    const data = await res.json();
    const questions = parseExtracted(data?.choices?.[0]?.message?.content || '');
    return NextResponse.json({ questions }, { headers: noStore });
  } catch (e) {
    return NextResponse.json(
      { error: 'Could not reach the AI service.', detail: String(e).slice(0, 300) },
      { status: 502, headers: noStore },
    );
  }
}
