// Produces the one-line summary and topic tags stored in the catalogue (Tier A,
// the "awareness" layer). Uses the same chat model as everything else. Best
// effort — if it fails, the document still ingests with an empty summary.
import { config } from './config.mjs';

export async function summariseDoc(title, sampleText) {
  const { apiKey, chatModel, base, referer, title: appTitle } = config();
  if (!apiKey || !chatModel) return { summary: '', tags: [] };

  const prompt =
    'You are cataloguing a document for an NHS GP reception knowledge base. '
    + 'Given the title and an extract, reply with ONLY JSON, no fences: '
    + '{"summary":"one sentence, max 20 words, describing what it covers","tags":["3 to 6 short lowercase topic tags"]}.\n\n'
    + 'Title: ' + title + '\nExtract:\n"""\n' + (sampleText || '').slice(0, 4000) + '\n"""';

  try {
    const res = await fetch(base + '/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': referer,
        'X-Title': appTitle,
      },
      body: JSON.stringify({ model: chatModel, temperature: 0.2, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!res.ok) return { summary: '', tags: [] };
    const data = await res.json();
    let t = (data?.choices?.[0]?.message?.content || '').trim().replace(/^```(json)?/i, '').replace(/```$/, '');
    const a = t.indexOf('{');
    const b = t.lastIndexOf('}');
    if (a !== -1 && b !== -1) t = t.slice(a, b + 1);
    const o = JSON.parse(t);
    return {
      summary: typeof o.summary === 'string' ? o.summary.trim() : '',
      tags: Array.isArray(o.tags) ? o.tags.map((x) => String(x).trim().toLowerCase()).filter(Boolean).slice(0, 6) : [],
    };
  } catch (e) {
    return { summary: '', tags: [] };
  }
}
