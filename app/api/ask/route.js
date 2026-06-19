// Server-side Q&A endpoint for Riva. The browser sends only the question, a
// short history string and any locally-stored custom guides; everything else —
// retrieving knowledge-base chunks, building the prompt, calling the model,
// parsing its JSON and resolving citations — happens here, so the API key and
// the full knowledge base never reach the client.
//
// Answers are grounded strictly in the practice's documents, and the response
// includes `citations` the UI can open in-browser at the exact page/section.
import { NextResponse } from 'next/server';
import { allGuides, guideCatalog } from '@/lib/guides';
import { buildAskPrompt, parseAiJson } from '@/lib/ai/prompt';
import { retrieve, catalogText } from '@/rag/lib/store.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TOP_K = 5;

function locationOf(chunk) {
  if (chunk.view && chunk.view.page) return 'Page ' + chunk.view.page;
  if (chunk.section) return chunk.section;
  if (chunk.headingPath && chunk.headingPath.length) return chunk.headingPath.join(' › ');
  return '';
}

function citationKey(c) {
  const v = c.view || {};
  return [c.docId, v.url || '', v.page || '', v.anchor || ''].join('|');
}

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

  // Tier B — semantically retrieve the most relevant chunks. Never fatal.
  let chunks = [];
  try { chunks = await retrieve(question, TOP_K); } catch (e) { chunks = []; }

  // Number the extracts so the model can cite them, and keep a ref -> chunk map.
  const refMap = new Map();
  const extracts = chunks.map((c, i) => {
    const ref = i + 1;
    refMap.set(ref, c);
    return { ref, title: c.docTitle, location: locationOf(c), text: c.text };
  });

  const candidateImages = [];
  chunks.forEach((c) => (c.images || []).forEach((im) => {
    if (im && !candidateImages.includes(im)) candidateImages.push(im);
  }));

  const validIds = new Set(allGuides(customGuides).map((g) => g.id));
  const prompt = buildAskPrompt({
    question,
    catalog: catalogText(),
    extracts,
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
    let images = (parsed.images || []).filter((im) => candidateImages.includes(im)).slice(0, 3);

    // Resolve the cited extract numbers into clickable source locators.
    const refs = parsed.citations.filter((n) => refMap.has(n));

    const seen = new Set();
    const citations = [];
    for (const ref of refs) {
      const c = refMap.get(ref);
      if (!c) continue;
      const cit = {
        docId: c.docId,
        docTitle: c.docTitle,
        location: locationOf(c),
        snippet: (c.text || '').replace(/\s+/g, ' ').trim().slice(0, 240),
        view: c.view || null,
      };
      const key = citationKey(cit);
      if (seen.has(key)) continue;
      seen.add(key);
      citations.push(cit);
      if (citations.length >= 4) break;
    }

    // Strict grounding: never present an answer that isn't backed by a cited
    // source (or an existing guide). An uncited answer is treated as "not found"
    // so Riva never answers from outside the practice's documents.
    let { intro, steps, message, tip } = parsed;
    if (!guideId && !citations.length && (steps.length || message)) {
      intro = 'I could not find this in the practice’s documents, so I can’t answer it reliably. Please check with the relevant lead — or a clinician if it is a clinical question.';
      steps = [];
      message = '';
      images = [];
    }

    return NextResponse.json({ guideId, intro, steps, message, tip, images, citations });
  } catch (e) {
    return NextResponse.json(
      { error: 'Could not reach OpenRouter.', detail: String(e).slice(0, 300) },
      { status: 502 },
    );
  }
}
