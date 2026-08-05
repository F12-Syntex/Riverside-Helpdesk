// Web search for the agent, over OpenRouter.
//
// Two mechanisms, picked from the model:
//   - A search-grounded model (perplexity/sonar and friends) searches by itself.
//     It is asked a question and comes back with citations; it takes no tools
//     parameter at all, and sending one is a 404 from OpenRouter because there
//     is no tool-supporting endpoint for it.
//   - Any other model needs OpenRouter's web-search server tool bolted on — the
//     same mechanism the Medication Check uses, so it needs no extra API key.
//
// The call is deliberately thin either way: a cheap model is asked to search and
// report, and what we keep are the URL citations it came back with. The model's
// prose is only a summary of those pages; the pages themselves (title + URL +
// extract) are the evidence the answer may cite.
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const NO_RETENTION = { data_collection: 'deny' };
const TIMEOUT_MS = 45_000;
const MAX_RESULTS = 6;

// Models that search the web natively. For these the request must carry NO
// tools parameter: perplexity's endpoints on OpenRouter do not support tool
// calling, so asking for one fails the whole call with a 404 rather than
// quietly ignoring it.
//   perplexity/*            — sonar, sonar-pro, sonar-reasoning, deep-research
//   *:online                — OpenRouter's own suffix; it attaches the search
//                             plugin server-side, so the tool would be double
//   *-search-preview        — openai/gpt-4o[-mini]-search-preview
export function isNativeSearchModel(model) {
  const slug = String(model || '').trim().toLowerCase();
  if (!slug) return false;
  return slug.startsWith('perplexity/')
    || slug.includes('sonar')
    || slug.endsWith(':online')
    || slug.includes('-search-preview');
}

function headers(apiKey) {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': 'https://riverside-practice.local',
    'X-Title': 'Riverside Practice Q&A',
  };
}

// Where the cited pages turn up depends on which mechanism ran, so all three
// shapes are read and merged in order of how much they carry:
//   message.annotations — [{ type: 'url_citation', url_citation: { url, title, content } }]
//                         from the web-search server tool, and from perplexity
//                         once OpenRouter normalises it.
//   search_results      — [{ title, url, snippet }] passed through from perplexity.
//   citations           — bare URL strings, perplexity's oldest shape. No title
//                         and no extract, but a URL alone is still a source.
function collectResults(data, snippetChars) {
  const out = [];
  const seen = new Set();
  const add = (url, title, snippet) => {
    const u = String(url || '').trim();
    if (!u || seen.has(u) || out.length >= MAX_RESULTS) return;
    seen.add(u);
    out.push({
      url: u,
      title: String(title || u).trim(),
      snippet: String(snippet || '').replace(/\s+/g, ' ').trim().slice(0, snippetChars),
    });
  };

  const msg = data?.choices?.[0]?.message || {};
  for (const a of Array.isArray(msg.annotations) ? msg.annotations : []) {
    const c = a && (a.url_citation || a.urlCitation);
    if (c) add(c.url, c.title, c.content);
  }
  for (const r of Array.isArray(data?.search_results) ? data.search_results : []) {
    if (r) add(r.url, r.title, r.snippet ?? r.content);
  }
  for (const c of Array.isArray(data?.citations) ? data.citations : []) {
    add(typeof c === 'string' ? c : c?.url, typeof c === 'string' ? '' : c?.title, '');
  }
  return out;
}

// How much of each cited page is kept. Enough for the model to quote a sentence
// from; a contact lookup asks for more, because the number it is after is often
// past the first paragraph.
const SNIPPET_CHARS = 700;

// Run one web search. Returns { ok, summary, results } — never throws, because
// a failed web search must degrade the answer honestly rather than fail the
// whole turn.
// The request body. `withTool` decides whether the web-search server tool is
// bolted on — exported for tests, because whether the tools key is present at
// all is the whole of this fix.
export function buildRequestBody({ model, query, withTool }) {
  const body = {
    model,
    temperature: 0.1,
    max_tokens: 900,
    messages: [{
      role: 'user',
      content:
        `Search the web and report what authoritative UK sources say about: ${query}\n\n` +
        'Prefer NHS, NICE, GOV.UK, royal colleges and NHS trust pages. ' +
        'Answer in at most 6 short bullet points, each stating a single fact. ' +
        'Do not speculate; if the search finds nothing relevant, say so plainly.',
    }],
    provider: NO_RETENTION,
    // No extended reasoning. This call searches and lists what it found — there
    // is nothing to deliberate about, and on a model that thinks first that
    // deliberation is most of the wait, paid on every contact lookup and every
    // web search. The last path in the app that was still allowed to think.
    // Models that always reason ignore it.
    reasoning: { enabled: false, exclude: true },
  };
  if (withTool) {
    body.tools = [{
      type: 'openrouter:web_search',
      parameters: { engine: 'exa', max_results: MAX_RESULTS, search_context_size: 'medium' },
    }];
  }
  return body;
}

export async function webSearch({ apiKey, model, query, snippetChars = SNIPPET_CHARS }) {
  const q = String(query || '').trim();
  if (!q) return { ok: false, summary: '', results: [], reason: 'Empty query.' };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const call = (withTool) => fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: headers(apiKey),
    signal: ctrl.signal,
    body: JSON.stringify(buildRequestBody({ model, query: q, withTool })),
  });

  try {
    // A search-grounded model does its own searching and has no tool-supporting
    // endpoint, so it is asked plainly.
    let withTool = !isNativeSearchModel(model);
    let res = await call(withTool);
    // Belt and braces for a search-grounded model this file has not been taught
    // to recognise: OpenRouter answers "no endpoints found that support tool
    // use" with a 404, and the same question without the tool usually works.
    if (!res.ok && res.status === 404 && withTool) {
      console.warn(`[agent] ${model} rejected the web-search tool (404); retrying as a native search.`);
      withTool = false;
      res = await call(false);
    }
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
      results: collectResults(data, snippetChars),
      // Passed back so the turn can record what the web role cost. OpenRouter
      // reports this in the OpenAI shape, not the one the AI SDK uses.
      usage: data?.usage
        ? { inputTokens: Number(data.usage.prompt_tokens) || 0, outputTokens: Number(data.usage.completion_tokens) || 0 }
        : null,
    };
  } catch (e) {
    console.error('[agent] web search failed:', e);
    return { ok: false, summary: '', results: [], reason: 'Could not reach the web search service.' };
  } finally {
    clearTimeout(timer);
  }
}
