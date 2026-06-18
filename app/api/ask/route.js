// Server-side proxy to OpenRouter. The OPENROUTER_API_KEY never reaches the
// browser — the client sends either a single `prompt` string or a full
// `messages` array (system + the whole conversation), and we relay it to the
// model named in OPENROUTER_AI_MODEL, returning just the model's text.
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_AI_MODEL;

  if (!apiKey || !model) {
    return NextResponse.json(
      { error: 'Server is missing OPENROUTER_API_KEY or OPENROUTER_AI_MODEL.' },
      { status: 500 },
    );
  }

  let prompt = '';
  let messages = null;
  try {
    const body = await request.json();
    prompt = typeof body?.prompt === 'string' ? body.prompt : '';
    if (Array.isArray(body?.messages)) {
      // Keep only well-formed turns with a known role and non-empty text, so
      // the whole conversation reaches the model as real multi-turn context.
      messages = body.messages
        .filter(
          (m) =>
            m &&
            (m.role === 'system' || m.role === 'user' || m.role === 'assistant') &&
            typeof m.content === 'string' &&
            m.content.trim(),
        )
        .map((m) => ({ role: m.role, content: m.content }));
    }
  } catch (e) {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  // Prefer the full conversation when provided; otherwise fall back to the
  // single-prompt shape so older callers keep working.
  const outgoing =
    messages && messages.length ? messages : prompt.trim() ? [{ role: 'user', content: prompt }] : null;
  if (!outgoing) {
    return NextResponse.json({ error: 'Empty prompt.' }, { status: 400 });
  }

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        // Optional attribution headers recommended by OpenRouter.
        'HTTP-Referer': 'https://riverside-practice.local',
        'X-Title': 'Riva - EMIS Helper',
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: outgoing,
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return NextResponse.json(
        { error: `OpenRouter error (${res.status}).`, detail: detail.slice(0, 500) },
        { status: 502 },
      );
    }

    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content || '';
    if (!text) {
      return NextResponse.json({ error: 'No content returned by the model.' }, { status: 502 });
    }
    return NextResponse.json({ text });
  } catch (e) {
    return NextResponse.json(
      { error: 'Could not reach OpenRouter.', detail: String(e).slice(0, 300) },
      { status: 502 },
    );
  }
}
