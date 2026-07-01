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
import { buildAskPrompt, parseAiJson, buildSearchQuery } from '@/lib/ai/prompt';
import { normForMatch, quoteContainment } from '@/lib/ai/quote-match';
import { retrieve, catalogText } from '@/rag/lib/store.mjs';
import { supplementarySourcesFor } from '@/lib/ai/context.mjs';
import { matchContacts, contactTelSet, digitsOf, redactUnverifiedNumbers } from '@/lib/contacts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TOP_K = 5;
// provider routing: only providers that do not retain prompt data, so the
// question and document extracts are never stored by the model provider.
const NO_RETENTION = { data_collection: 'deny' };
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_HEADERS = (apiKey) => ({
  Authorization: `Bearer ${apiKey}`,
  'Content-Type': 'application/json',
  'HTTP-Referer': 'https://riverside-practice.local',
  'X-Title': 'Riverside Practice Q&A',
});

function locationOf(chunk) {
  if (chunk.view && chunk.view.page) return 'Page ' + chunk.view.page;
  if (chunk.section) return chunk.section;
  if (chunk.headingPath && chunk.headingPath.length) return chunk.headingPath.join(' › ');
  return 'Document';
}

function citationFor(chunk, quote = '') {
  const body = (chunk.text || '').replace(/\s+/g, ' ').trim();
  const q = (quote || '').replace(/\s+/g, ' ').trim();
  return {
    docId: chunk.docId,
    docTitle: chunk.docTitle,
    location: locationOf(chunk),
    snippet: body.length > 220 ? body.slice(0, 218).trim() + '…' : body,
    // The full extract that was given to the model as this Source — kept for
    // context and as a fallback when there is no verified quote.
    text: body,
    // The precise verbatim span the step is based on, verified to appear in this
    // source. Empty when the model's quote could not be verified. Drives the
    // exact-passage highlight and the "what this is based on" text.
    quote: q,
    view: chunk.view || null,
  };
}

// Resolve a step's citation. Given the model's claimed Source number and its
// verbatim quote, find the retrieved chunk that actually contains the quote
// (correcting a wrong source number), and attach the quote so the UI can show
// and highlight the exact words. Falls back to the claimed source when the
// quote can't be verified, so a step is never left without a source.
function resolveCite(refMap, claimedRef, quote) {
  const claimed = refMap.get(claimedRef) || null;
  const quoteN = normForMatch(quote);
  if (quoteN.length < 12) return claimed ? citationFor(claimed) : null;

  let bestChunk = null, bestScore = 0;
  for (const [ref, c] of refMap) {
    // Tiny nudge toward the claimed source so an exact tie keeps the model's pick.
    const score = quoteContainment(quoteN, normForMatch(c.text)) + (ref === claimedRef ? 0.001 : 0);
    if (score > bestScore) { bestScore = score; bestChunk = c; }
  }
  if (bestChunk && bestScore >= 0.5) return citationFor(bestChunk, quote); // verified
  return claimed ? citationFor(claimed) : (bestChunk ? citationFor(bestChunk) : null); // unverified fallback
}

// De-duplicate the distinct sources an answer relied on, keyed by document +
// location, preserving order. Used for the "sources this answer used" list.
function dedupeCitations(cites) {
  const seen = new Set();
  const out = [];
  for (const c of cites) {
    if (!c) continue;
    const key = [c.docId, c.location].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

// Single place the model is called. Returns { text } on success or
// { error } (a ready-to-send NextResponse) on any failure, so both the Q&A and
// triage branches share identical provider routing and error handling.
async function callModel(apiKey, model, prompt) {
  try {
    const res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: OPENROUTER_HEADERS(apiKey),
      // provider: only route to providers that do not retain prompt data, so the
      // request and document extracts are never stored by the model provider.
      body: JSON.stringify({ model, temperature: 0.2, messages: [{ role: 'user', content: prompt }], provider: NO_RETENTION }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return { error: NextResponse.json({ error: `OpenRouter error (${res.status}).`, detail: detail.slice(0, 500) }, { status: 502 }) };
    }
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content || '';
    if (!text) return { error: NextResponse.json({ error: 'No content returned by the model.' }, { status: 502 }) };
    return { text };
  } catch (e) {
    return { error: NextResponse.json({ error: 'Could not reach OpenRouter.', detail: String(e).slice(0, 300) }, { status: 502 }) };
  }
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

  // Resolve follow-ups for retrieval by concatenating the recent conversation
  // locally — no extra model call. "how is this done" then searches with the
  // subject carried over from the previous question. The single model call below
  // still receives the full history to interpret the follow-up.
  const searchQuery = buildSearchQuery({ history, question });

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

  // Supplementary context — practice notes / triage instructions fetched at
  // request time (OneNote, configured URLs, or the local rag/context folder), so
  // they can be updated without a redeploy. Appended as extra numbered Sources
  // after the knowledge-base chunks, so the model must quote them and the server
  // verifies the quote exactly as for any document. Never fatal.
  try {
    const supp = await supplementarySourcesFor(searchQuery);
    for (const s of supp) {
      const ref = extracts.length + 1;
      const chunk = { docId: s.docId, docTitle: s.docTitle, text: s.text, section: s.section, view: null };
      refMap.set(ref, chunk);
      extracts.push({ ref, title: chunk.docTitle, location: s.section || 'Note', text: chunk.text });
    }
  } catch (e) { /* supplementary context is optional */ }

  // Deterministic contacts directory match — exact numbers/emails shown to the
  // reader verbatim (never authored by the model). Also build the set of numbers
  // we can vouch for (directory + anything present in the retrieved Sources), so
  // any other phone number the model writes can be stripped as unverified.
  const contacts = matchContacts(searchQuery);
  const verifiedNums = new Set(contactTelSet());
  for (const ex of extracts) {
    for (const run of (ex.text.match(/\d[\d ()\/-]{7,}\d/g) || [])) {
      const d = digitsOf(run);
      if (d.length >= 9) verifiedNums.add(d);
    }
  }
  const redact = (t) => redactUnverifiedNumbers(t, verifiedNums);

  const guideCatalog = allGuides(customGuides).map((g) => '- ' + g.question).join('\n');
  const prompt = buildAskPrompt({ question, catalog: catalogText(), extracts, history, guideCatalog, contacts: contacts.map((c) => c.label) });

  try {
    const { text, error } = await callModel(apiKey, model, prompt);
    if (error) return error;

    const parsed = parseAiJson(text);

    // The model decides for itself whether the message is a staff question or an
    // incoming patient request to route, and returns the matching shape.
    if (parsed.kind === 'triage') {
      const actions = parsed.actions.map((s) => ({ text: redact(s.text), cite: resolveCite(refMap, s.source, s.quote) }));
      const redFlags = parsed.redFlags.map((s) => ({ text: redact(s.text), cite: resolveCite(refMap, s.source, s.quote) }));
      const patientMessageCite = resolveCite(refMap, parsed.patientMessageSource, parsed.patientMessageQuote);
      const citations = dedupeCitations(
        actions.map((a) => a.cite).concat(redFlags.map((r) => r.cite)).concat([patientMessageCite]),
      );

      return NextResponse.json({
        kind: 'triage',
        urgency: parsed.urgency,
        urgencyReason: redact(parsed.urgencyReason),
        summary: redact(parsed.summary),
        actions,
        redFlags,
        route: redact(parsed.route),
        patientMessage: redact(parsed.patientMessage),
        patientMessageCite,
        citations,
        contacts,
      });
    }

    // Strict grounding: if the model can't answer from the documents, decline.
    if (parsed.answerable === false || (!parsed.steps.length && !parsed.message)) {
      return NextResponse.json({
        kind: 'answer',
        answerable: false,
        intro: parsed.intro || 'I could not find this in the practice’s documents.',
        steps: [],
        message: '',
        messageCite: null,
        tip: '',
        citations: [],
        contacts,
      });
    }

    // Resolve each citation by verifying the model's verbatim quote against the
    // retrieved Sources — correcting wrong source numbers and attaching the exact
    // supporting words, so the citation shows accurate, precise text.
    const steps = parsed.steps.map((s) => ({ text: redact(s.text), cite: resolveCite(refMap, s.source, s.quote) }));
    const messageCite = resolveCite(refMap, parsed.messageSource, parsed.messageQuote);

    // The distinct sources this answer relied on (for any list/summary use).
    const citations = dedupeCitations(steps.map((s) => s.cite).concat([messageCite]));

    return NextResponse.json({
      kind: 'answer',
      answerable: true,
      intro: redact(parsed.intro),
      steps,
      message: redact(parsed.message),
      messageCite,
      tip: redact(parsed.tip),
      citations,
      contacts,
    });
  } catch (e) {
    return NextResponse.json(
      { error: 'Could not reach OpenRouter.', detail: String(e).slice(0, 300) },
      { status: 502 },
    );
  }
}
