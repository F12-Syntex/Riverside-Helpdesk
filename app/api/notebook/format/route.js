// AI formatter for notebook pages: tidies a note's markdown (headings, lists,
// spacing) and fixes typos while keeping the wording as close as possible to
// what the author wrote. The client shows the result as a diff the user must
// confirm — nothing is saved here.
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_RETENTION = { data_collection: 'deny' };
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_HEADERS = (apiKey) => ({
  Authorization: `Bearer ${apiKey}`,
  'Content-Type': 'application/json',
  'HTTP-Referer': 'https://riverside-practice.local',
  'X-Title': 'Riverside Practice Q&A',
});

const PROMPT = `You are a careful copy editor for a GP practice's internal notebook.
Reformat the note below as clean markdown and fix obvious typos and punctuation.

Rules — follow all of them:
- Keep the wording as close as possible to the original. Do NOT rephrase, summarise, shorten, or add content.
- Fix spelling/typos and obvious punctuation mistakes only.
- Improve structure: consistent headings (##/###), bullet or numbered lists where the text is clearly a list, blank lines between blocks.
- Never change medical or procedural meaning, names, phone numbers, or times.
- Output ONLY the reformatted note text. No preamble, no explanation, no code fences.

NOTE:
`;

export async function POST(request) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_AI_MODEL;
  if (!apiKey || !model) {
    return NextResponse.json({ error: 'Server is missing OPENROUTER_API_KEY or OPENROUTER_AI_MODEL.' }, { status: 500 });
  }

  let body;
  try { body = await request.json(); } catch (e) { return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 }); }
  const text = String(body?.text || '');
  if (!text.trim()) return NextResponse.json({ error: 'Nothing to format.' }, { status: 400 });
  if (text.length > 60000) return NextResponse.json({ error: 'Note is too long to format.' }, { status: 400 });

  try {
    const res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: OPENROUTER_HEADERS(apiKey),
      // Only providers that do not retain prompt data (same policy as /api/ask).
      body: JSON.stringify({ model, temperature: 0, messages: [{ role: 'user', content: PROMPT + text }], provider: NO_RETENTION }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return NextResponse.json({ error: `OpenRouter error (${res.status}).`, detail: detail.slice(0, 500) }, { status: 502 });
    }
    const data = await res.json();
    let formatted = data?.choices?.[0]?.message?.content || '';
    // Strip an accidental fence despite the instructions.
    formatted = formatted.replace(/^\s*```(?:markdown|md)?\n([\s\S]*?)\n```\s*$/, '$1').trim();
    if (!formatted) return NextResponse.json({ error: 'No content returned by the model.' }, { status: 502 });
    return NextResponse.json({ formatted });
  } catch (e) {
    return NextResponse.json({ error: 'Could not reach OpenRouter.', detail: String(e).slice(0, 300) }, { status: 502 });
  }
}
