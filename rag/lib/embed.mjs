// Text embeddings via OpenRouter (openai/text-embedding-3-small by default).
// Returns one vector per input string, in the same order.
import { config } from './config.mjs';

const BATCH = 64;

export async function embedTexts(texts) {
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

export async function embedOne(text) {
  const [v] = await embedTexts([text]);
  return v;
}
