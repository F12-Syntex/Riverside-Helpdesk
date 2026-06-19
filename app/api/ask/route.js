// Server-side Q&A endpoint for Riva. The browser sends only the question, a
// short history string and any locally-stored custom guides; everything else —
// retrieving knowledge-base chunks, building the prompt, calling the model and
// parsing its JSON — happens here, so the OPENROUTER_API_KEY and the full
// knowledge base never reach the client.
import { NextResponse } from 'next/server';
import { allGuides, guideCatalog } from '@/lib/guides';
import { buildAskPrompt, parseAiJson } from '@/lib/ai/prompt';
import { retrieve, catalogText } from '@/rag/lib/store.mjs';

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

  let question = '';
  let history = '';
  let customGuides = [];
  try {
    const body = await request.json();
    question = typeof body?.question === 'string' ? body.question : '';
    history = typeof body?.history === 'string' ? body.history : '';
    customGuides = Array.isArray(body?.customGuides) ? body.customGuides : [];
  } catch (e) {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }
  if (!question.trim()) {
    return NextResponse.json({ error: 'Empty question.' }, { status: 400 });
  }

  // Tier B — semantically retrieve the most relevant chunks. Never fatal: if the
  // index is missing or embedding fails, we just answer from the guides alone.
  let chunks = [];
  try { chunks = await retrieve(question, 4); } catch (e) { chunks = []; }

  const candidateImages = [];
  chunks.forEach((c) => (c.images || []).forEach((im) => {
    if (im && !candidateImages.includes(im)) candidateImages.push(im);
  }));

  // Tier A — the catalogue is always present so the model is aware of the whole
  // knowledge base even when a specific chunk wasn't retrieved.
  let context = '';
  const cat = catalogText();
  if (cat) context += 'The practice knowledge base contains these documents:\n' + cat + '\n\n';
  if (chunks.length) {
    context += 'Most relevant extracts:\n' + chunks.map((c) => {
      const loc = c.section || (c.headingPath && c.headingPath.length ? c.headingPath.join(' › ') : '');
      return '[' + c.docTitle + (loc && loc !== c.docTitle ? ' — ' + loc : '') + ']\n' + c.text;
    }).join('\n\n');
  }

  const validIds = new Set(allGuides(customGuides).map((g) => g.id));
  const prompt = buildAskPrompt({
    question,
    context,
    history,
    guideCatalog: guideCatalog(customGuides),
    candidateImages,
  });

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://riverside-practice.local',
        'X-Title': 'Riva - EMIS Helper',
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [{ role: 'user', content: prompt }],
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

    const parsed = parseAiJson(text);
    const guideId = parsed.guideId && validIds.has(parsed.guideId) ? parsed.guideId : '';
    // Only allow images the model was actually offered from the retrieved set.
    const images = (parsed.images || []).filter((im) => candidateImages.includes(im)).slice(0, 3);

    return NextResponse.json({
      guideId,
      intro: parsed.intro,
      steps: parsed.steps,
      message: parsed.message,
      tip: parsed.tip,
      images,
    });
  } catch (e) {
    return NextResponse.json(
      { error: 'Could not reach OpenRouter.', detail: String(e).slice(0, 300) },
      { status: 502 },
    );
  }
}
