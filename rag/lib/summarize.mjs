// Produces the one-line summary and topic tags stored in the catalogue (Tier A,
// the "awareness" layer). Reading a document to say what it covers is the fast
// role's work, and this summary is what the agent's list_practice_sources shows
// when it chooses a file — so the two are read by the same model. Best effort —
// if it fails, the document still ingests with an empty summary.
import { config, readingModel } from './config.mjs';
import { chatBody } from '../../lib/ai/openrouter.mjs';

export async function summariseDoc(title, sampleText) {
  const { apiKey, base, referer, title: appTitle } = config();
  const analysisModel = await readingModel();
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
      // Saying what a document covers is not a puzzle: chatBody turns reasoning
      // off outright rather than asking for a little of it.
      body: JSON.stringify(chatBody({ model: analysisModel, temperature: 0.2, messages: [{ role: 'user', content: prompt }] })),
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
