// Turns prose into small, comparable claims. Embeddings answer "what is this
// about?"; claims answer "what does it actually say?", which is what enables
// contradiction detection and review.
const URL = 'https://openrouter.ai/api/v1/chat/completions';

function parseJson(raw) {
  const text = String(raw || '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  const start = text.indexOf('['), end = text.lastIndexOf(']');
  if (start < 0 || end < start) return [];
  try {
    const value = JSON.parse(text.slice(start, end + 1));
    return Array.isArray(value) ? value : [];
  } catch (e) { return []; }
}

export async function extractClaims({ title, kind, content, data = {} }) {
  // Contacts are already structured and should never be re-authored by a model.
  if (kind === 'contact') {
    const claims = [];
    for (const p of (data.phones || [])) claims.push({ subject: title, predicate: 'telephone number', value: p.tel || p.display, quote: p.display || p.tel, confidence: 1 });
    for (const email of (data.emails || [])) claims.push({ subject: title, predicate: 'email address', value: email, quote: email, confidence: 1 });
    return claims;
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_AI_MODEL;
  if (!apiKey || !model || !String(content || '').trim()) return [];
  const prompt = `Extract only explicit operational claims from this NHS GP practice source.
Return a JSON array only. Each item must be:
{"subject":"stable thing being described","predicate":"property or instruction","value":"the asserted value/rule","quote":"short exact quote from the source","confidence":0.0}

Rules:
- Make subjects and predicates consistent and reusable across documents, so conflicting values align.
- Include phone/email, opening hours, deadlines, routing rules, eligibility rules, required actions, prohibitions and named responsibilities.
- Do not infer, summarise vague prose, diagnose, or use outside knowledge.
- Every claim needs an exact supporting quote. Maximum 40 claims.

Source type: ${kind}
Title: ${title}
Source text:
${String(content).slice(0, 30000)}`;
  try {
    const res = await fetch(URL, {
      method: 'POST',
      signal: AbortSignal.timeout(45000),
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://riverside-practice.local', 'X-Title': 'Riverside Knowledge Manager' },
      body: JSON.stringify({ model, temperature: 0, messages: [{ role: 'user', content: prompt }], provider: { data_collection: 'deny' } }),
    });
    if (!res.ok) return [];
    const json = await res.json();
    return parseJson(json?.choices?.[0]?.message?.content).slice(0, 40);
  } catch (e) { return []; }
}
