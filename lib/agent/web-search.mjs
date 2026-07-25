// Web search for the agent, using OpenRouter's own web-search server tool —
// the same mechanism the Medication Check already uses, so it needs no extra
// API key or vendor account.
//
// The call is deliberately thin: a cheap model is asked to search and report,
// and what we keep are the URL citations it came back with. The model's prose
// is only a summary of those pages; the pages themselves (title + URL +
// extract) are the evidence the answer may cite.
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const NO_RETENTION = { data_collection: 'deny' };
const TIMEOUT_MS = 45_000;
const MAX_RESULTS = 6;

function headers(apiKey) {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': 'https://riverside-practice.local',
    'X-Title': 'Riverside Practice Q&A',
  };
}

// OpenRouter returns citations as message annotations. Shape:
//   { type: 'url_citation', url_citation: { url, title, content } }
function resultsFromAnnotations(annotations) {
  const out = [];
  const seen = new Set();
  for (const a of Array.isArray(annotations) ? annotations : []) {
    const c = a && (a.url_citation || a.urlCitation);
    const url = String(c?.url || '').trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push({
      url,
      title: String(c.title || url).trim(),
      snippet: String(c.content || '').replace(/\s+/g, ' ').trim().slice(0, 700),
    });
    if (out.length >= MAX_RESULTS) break;
  }
  return out;
}

// Run one web search. Returns { ok, summary, results } — never throws, because
// a failed web search must degrade the answer honestly rather than fail the
// whole turn.
export async function webSearch({ apiKey, model, query }) {
  const q = String(query || '').trim();
  if (!q) return { ok: false, summary: '', results: [], reason: 'Empty query.' };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: headers(apiKey),
      signal: ctrl.signal,
      body: JSON.stringify({
        model,
        temperature: 0.1,
        max_tokens: 900,
        messages: [{
          role: 'user',
          content:
            `Search the web and report what authoritative UK sources say about: ${q}\n\n` +
            'Prefer NHS, NICE, GOV.UK, royal colleges and NHS trust pages. ' +
            'Answer in at most 6 short bullet points, each stating a single fact. ' +
            'Do not speculate; if the search finds nothing relevant, say so plainly.',
        }],
        tools: [{
          type: 'openrouter:web_search',
          parameters: { engine: 'exa', max_results: MAX_RESULTS, search_context_size: 'medium' },
        }],
        provider: NO_RETENTION,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error(`[agent] web search error ${res.status}:`, detail.slice(0, 300));
      return { ok: false, summary: '', results: [], reason: `Web search failed (${res.status}).` };
    }
    const data = await res.json();
    const msg = data?.choices?.[0]?.message || {};
    return {
      ok: true,
      summary: String(msg.content || '').trim(),
      results: resultsFromAnnotations(msg.annotations),
    };
  } catch (e) {
    console.error('[agent] web search failed:', e);
    return { ok: false, summary: '', results: [], reason: 'Could not reach the web search service.' };
  } finally {
    clearTimeout(timer);
  }
}
