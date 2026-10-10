// Text embeddings via OpenRouter (openai/text-embedding-3-small by default).
// Returns one vector per input string, in the same order.
import { config } from './config.mjs';

const BATCH = 64;
// How long one request (one batch of up to 64) may take before it is given
// up. Per request, not per call: a bulk ingest of thousands of passages is
// many requests, each bounded on its own, so it is never cut short for being
// large. The point is only that nothing waits forever on a connection that has
// stopped answering; a Q&A turn passes a far shorter budget of its own
// (lib/search/search.mjs).
export const EMBED_TIMEOUT_MS = 60000;

export async function embedTexts(texts, { timeoutMs = EMBED_TIMEOUT_MS } = {}) {
  if (!texts || !texts.length) return [];
  const { apiKey, embedModel, embedProvider, base, referer, title } = config();
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not set');

  const out = [];
  for (let i = 0; i < texts.length; i += BATCH) {
    const batch = texts.slice(i, i + BATCH);
    const res = await fetch(base + '/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': referer,
        'X-Title': title,
      },
      // provider: pin to Azure (private, zero-retention) — see config.mjs.
      body: JSON.stringify({ model: embedModel, input: batch, provider: embedProvider }),
      // Also bounds reading the body: a response that starts and then stalls
      // is abandoned at the same deadline.
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Embedding request failed (${res.status}): ${detail.slice(0, 300)}`);
    }
    const data = await res.json();
    const vecs = (data.data || [])
      .slice()
      .sort((a, b) => (a.index || 0) - (b.index || 0))
      .map((d) => d.embedding);
    out.push(...vecs);
  }
  return out;
}

export async function embedOne(text, options) {
  const [v] = await embedTexts([text], options);
  return v;
}
