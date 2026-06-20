// Produces the one-line summary and topic tags stored in the catalogue (Tier A,
// the "awareness" layer). Uses the same chat model as everything else. Best
// effort — if it fails, the document still ingests with an empty summary.
import { config } from './config.mjs';

export async function summariseDoc(title, sampleText) {
  const { apiKey, analysisModel, noRetentionProvider, base, referer, title: appTitle } = config();
  if (!apiKey || !analysisModel) return { summary: '', tags: [] };

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
      // gpt-oss is a reasoning model — keep reasoning effort low for this simple
      // cataloguing task so it returns the JSON without burning tokens.
      body: JSON.stringify({ model: analysisModel, temperature: 0.2, reasoning: { effort: 'low' }, messages: [{ role: 'user', content: prompt }], provider: noRetentionProvider }),
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
