// Server-side Q&A endpoint. The browser sends only the question, a short history
// string and any locally-stored custom guides; retrieval, prompt building, the
// model call, parsing and citation resolution all happen here, so the API key
// and the full knowledge base never reach the client.
//
// Answers are grounded strictly in the practice's documents: every step names
// the Source that backs it, resolved here into a clickable citation the UI opens
// in its in-page viewer. If the documents don't cover the question, the response
// is `answerable: false` and the UI shows a decline.
import { NextResponse } from 'next/server';
import { allGuides } from '@/lib/guides';
import { buildAskPrompt, parseAiJson, buildCondenseQuery } from '@/lib/ai/prompt';
import { retrieve, catalogText } from '@/rag/lib/store.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TOP_K = 5;
// Cheap text analysis (follow-up condensing) runs on a small model, routed only
// to providers that do not retain prompt data.
const ANALYSIS_MODEL = process.env.OPENROUTER_ANALYSIS_MODEL || 'openai/gpt-oss-120b';
const NO_RETENTION = { data_collection: 'deny' };
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_HEADERS = (apiKey) => ({
  Authorization: `Bearer ${apiKey}`,
  'Content-Type': 'application/json',
  'HTTP-Referer': 'https://riverside-practice.local',
  'X-Title': 'Riverside Practice Q&A',
});

// Resolve a follow-up ("how is this done") into a standalone search query using
// the conversation so far, so retrieval looks in the right documents. Best-effort:
// any failure falls back to the original question, so a hiccup here never blocks
// an answer.
async function condenseQuery({ question, history, apiKey, model }) {
  try {
    const res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: OPENROUTER_HEADERS(apiKey),
      body: JSON.stringify({
        model,
        temperature: 0,
        // gpt-oss is a reasoning model: leave headroom for its reasoning tokens
        // (a tiny cap returns empty content) and keep reasoning effort low.
        max_tokens: 400,
        reasoning: { effort: 'low' },
        messages: [{ role: 'user', content: buildCondenseQuery({ history, question }) }],
        provider: NO_RETENTION,
      }),
    });
    if (!res.ok) return '';
    const data = await res.json();
    const out = (data?.choices?.[0]?.message?.content || '')
      .replace(/^["'`]+|["'`]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    return out;
  } catch (e) {
    return '';
  }
}

function locationOf(chunk) {
  if (chunk.view && chunk.view.page) return 'Page ' + chunk.view.page;
  if (chunk.section) return chunk.section;
  if (chunk.headingPath && chunk.headingPath.length) return chunk.headingPath.join(' › ');
  return 'Document';
}

function citationFor(chunk) {
  const body = (chunk.text || '').replace(/\s+/g, ' ').trim();
  return {
    docId: chunk.docId,
    docTitle: chunk.docTitle,
    location: locationOf(chunk),
    snippet: body.length > 220 ? body.slice(0, 218).trim() + '…' : body,
    view: chunk.view || null,
  };
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

  // Resolve follow-ups against the conversation before retrieving, so e.g.
  // "how is this done" searches for the actual subject, not the literal words.
  let searchQuery = question;
  if (history.trim()) {
    const condensed = await condenseQuery({ question, history, apiKey, model: ANALYSIS_MODEL });
    if (condensed) searchQuery = condensed;
  }

  // Tier B — semantically retrieve the most relevant chunks (never fatal).
  let chunks = [];
  try { chunks = await retrieve(searchQuery, TOP_K); } catch (e) { chunks = []; }

  // Number them as Sources and keep a ref -> chunk map for citation resolution.
  const refMap = new Map();
  const extracts = chunks.map((c, i) => {
    const ref = i + 1;
    refMap.set(ref, c);
    return { ref, title: c.docTitle, location: locationOf(c), text: c.text };
  });

  const guideCatalog = allGuides(customGuides).map((g) => '- ' + g.question).join('\n');
  const prompt = buildAskPrompt({ question, catalog: catalogText(), extracts, history, guideCatalog });

  try {
    const res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: OPENROUTER_HEADERS(apiKey),
      // provider: only route to providers that do not retain prompt data, so the
      // question and document extracts are never stored by the model provider.
      body: JSON.stringify({ model, temperature: 0.2, messages: [{ role: 'user', content: prompt }], provider: NO_RETENTION }),
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

    // Strict grounding: if the model can't answer from the documents, decline.
    if (parsed.answerable === false || (!parsed.steps.length && !parsed.message)) {
      return NextResponse.json({
        answerable: false,
        intro: parsed.intro || 'I could not find this in the practice’s documents.',
        steps: [],
        message: '',
        messageCite: null,
        tip: '',
        citations: [],
      });
    }

    const at = (n) => (refMap.has(n) ? citationFor(refMap.get(n)) : null);
    const steps = parsed.steps.map((s) => ({ text: s.text, cite: at(s.source) }));
    const messageCite = at(parsed.messageSource);

    // The distinct sources this answer relied on (for any list/summary use).
    const seen = new Set();
    const citations = [];
    for (const c of steps.map((s) => s.cite).concat([messageCite])) {
      if (!c) continue;
      const key = [c.docId, c.location].join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      citations.push(c);
    }

    return NextResponse.json({
      answerable: true,
      intro: parsed.intro,
      steps,
      message: parsed.message,
      messageCite,
      tip: parsed.tip,
      citations,
    });
  } catch (e) {
    return NextResponse.json(
      { error: 'Could not reach OpenRouter.', detail: String(e).slice(0, 300) },
      { status: 502 },
    );
  }
}
