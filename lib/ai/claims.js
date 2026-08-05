// Turns prose into small, comparable claims. Embeddings answer "what is this
// about?"; claims answer "what does it actually say?", which is what enables
// contradiction detection and review.
import { getModelRoles } from '../settings.js';
import { OPENROUTER_URL as URL, openRouterHeaders, chatBody } from './openrouter.mjs';

export const CLAIM_SCHEMA_VERSION = 'claims-v3';

function parseJson(raw) {
  const text = String(raw || '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  const start = text.indexOf('['), end = text.lastIndexOf(']');
  if (start < 0 || end < start) return null;
  try {
    const value = JSON.parse(text.slice(start, end + 1));
    return Array.isArray(value) ? value : null;
  } catch (e) { return null; }
}

export async function extractClaimsResult({ title, kind, content, data = {} }) {
  // Contacts are already structured and should never be re-authored by a model.
  if (kind === 'contact') {
    const claims = [];
    // Labels such as just "Contact" carry no shared real-world identity. Scope
    // those to their source row so two unrelated PCSE addresses do not become
    // a false contradiction merely because both labels were generic.
    const generic = /^(?:contact|telephone|phone|email|details?)$/i.test(String(title || '').trim());
    const subject = generic && data.sourceRef ? `${title} (${data.sourceRef})` : title;
    for (const p of (data.phones || [])) claims.push({ subject, predicate: 'telephone number', value: p.tel || p.display, quote: p.display || p.tel, confidence: 1 });
    for (const email of (data.emails || [])) claims.push({ subject, predicate: 'email address', value: email, quote: email, confidence: 1 });
    return { ok: true, claims };
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  // Claim extraction is short, structured background work that no reader ever
  // sees, so it runs on the fast role rather than the model that writes answers.
  const model = (await getModelRoles()).fast.model;
  if (!String(content || '').trim()) return { ok: true, claims: [] };
  if (!apiKey || !model) return { ok: false, claims: [], error: 'Claim analysis is not configured.' };
  const prompt = `Extract only explicit operational claims from this NHS GP practice source.
Return a JSON array only. Each item must be:
{"subject":"stable thing being described","predicate":"property or instruction","value":"the asserted value/rule","quote":"short exact quote from the source","confidence":0.0}

Rules:
- Extract atomic facts that could genuinely disagree with another source. Do not emit generic procedure-step or summary claims.
- Make the subject specific enough to include its condition/scope (for example "urgent referral acknowledgement", not "practice").
- Use a stable, single-valued predicate (for example "deadline", "destination", "telephone number", "required action"). Avoid generic predicates such as "will ensure", "has", "is" or "procedure step".
- Multiple steps or simultaneous requirements are complementary, not contradictory: either omit them or give each a distinct scoped subject.
- Make subjects and predicates consistent and reusable across documents, so genuinely conflicting values align.
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
      headers: openRouterHeaders(apiKey, 'Riverside Knowledge Manager'),
      body: JSON.stringify(chatBody({ model, temperature: 0, messages: [{ role: 'user', content: prompt }] })),
    });
    if (!res.ok) return { ok: false, claims: [], error: `Claim model failed (${res.status}).` };
    const json = await res.json();
    const parsed = parseJson(json?.choices?.[0]?.message?.content);
    if (!parsed) return { ok: false, claims: [], error: 'Claim model returned invalid JSON.' };
    return { ok: true, claims: parsed.slice(0, 40) };
  } catch (e) { return { ok: false, claims: [], error: String(e).slice(0, 300) }; }
}

export async function extractClaims(input) {
  const result = await extractClaimsResult(input);
  if (!result.ok) throw new Error(result.error || 'Claim analysis failed.');
  return result.claims;
}

export async function extractPassageClaimGroups({ title, kind, data = {}, passages = [] }) {
  const items = Array.isArray(passages) ? passages.slice(0, 8) : [];
  if (!items.length) return { ok: true, groups: [] };
  if (kind === 'contact') {
    const one = await extractClaimsResult({ title, kind, data, content: items[0].content });
    return { ok: one.ok, groups: [one.claims], error: one.error };
  }
  const apiKey = process.env.OPENROUTER_API_KEY;
  // Claim extraction is short, structured background work that no reader ever
  // sees, so it runs on the fast role rather than the model that writes answers.
  const model = (await getModelRoles()).fast.model;
  if (!apiKey || !model) return { ok: false, groups: [], error: 'Claim analysis is not configured.' };
  const sources = items.map((p, index) => ({ index, heading: p.heading || '', text: String(p.content || '') }));
  const prompt = `Extract contradiction-capable operational claims from several passages of one NHS GP practice source.
Return JSON only: [{"index":0,"claims":[{"subject":"specific scoped subject","predicate":"stable single-valued property/rule","value":"asserted value","quote":"exact quote from that passage","confidence":0.0}]}]. Return one item for every passage index, with an empty claims array when none apply.

Only extract atomic facts that could genuinely disagree with another source: deadlines, destinations, opening hours, eligibility, explicit prohibitions, single responsible roles, or scoped required actions. Exclude generic procedure steps, summaries and complementary duties. Subjects must include their condition/scope. Avoid predicates such as "will ensure", "has", "is" and "procedure step". Quotes must be copied exactly from the corresponding passage. Never infer or use outside knowledge.

Document: ${title}
Passages:
${JSON.stringify(sources)}`;
  try {
    const res = await fetch(URL, {
      method: 'POST', signal: AbortSignal.timeout(45000),
      headers: openRouterHeaders(apiKey, 'Riverside Claim Extractor'),
      body: JSON.stringify(chatBody({ model, temperature: 0, messages: [{ role: 'user', content: prompt }] })),
    });
    if (!res.ok) return { ok: false, groups: [], error: `Claim model failed (${res.status}).` };
    const json = await res.json();
    const parsed = parseJson(json?.choices?.[0]?.message?.content);
    if (!parsed) return { ok: false, groups: [], error: 'Claim model returned invalid JSON.' };
    const groups = items.map((_, index) => {
      const row = parsed.find((x) => Number(x.index) === index);
      return Array.isArray(row?.claims) ? row.claims : null;
    });
    // Some providers occasionally omit an index from an otherwise valid batch.
    // Retry only those passages with the strict single-passage extractor; never
    // turn an omission into a cached empty claim set.
    const missing = groups.map((claims, index) => claims === null ? index : -1).filter((index) => index >= 0);
    const retries = await Promise.all(missing.map((index) => extractClaimsResult({
      title, kind, data, content: items[index].content,
    })));
    const failed = retries.find((retry) => !retry.ok);
    if (failed) return { ok: false, groups: [], error: failed.error || 'Claim model omitted one or more passages.' };
    missing.forEach((index, at) => { groups[index] = retries[at].claims; });
    return { ok: true, groups };
  } catch (e) { return { ok: false, groups: [], error: String(e).slice(0, 300) }; }
}

export async function classifyClaimPairs(pairs) {
  const input = Array.isArray(pairs) ? pairs.slice(0, 60) : [];
  if (!input.length) return [];
  const apiKey = process.env.OPENROUTER_API_KEY;
  // Claim extraction is short, structured background work that no reader ever
  // sees, so it runs on the fast role rather than the model that writes answers.
  const model = (await getModelRoles()).fast.model;
  if (!apiKey || !model) throw new Error('Contradiction analysis is not configured.');
  const compact = input.map((p, index) => ({
    index, subject: p.subject, predicate: p.predicate,
    a: { source: p.titleA, value: p.valueA, quote: p.quoteA },
    b: { source: p.titleB, value: p.valueB, quote: p.quoteB },
  }));
  const prompt = `Classify pairs of claims from an NHS GP practice knowledge base.
Return a JSON array only: [{"index":0,"relation":"contradiction|compatible|duplicate|supersedes|unrelated","confidence":0.0,"reason":"short explanation"}].

A contradiction means both claims apply to the SAME subject, scope, circumstances and time, and cannot both be true or followed. Different simultaneous steps, duties, contacts, options, review dates for different documents, broad vs specific wording, or wording variants are compatible—not contradictions. A general principle and a specific implementation can both apply: "not longer than necessary" is compatible with a 31-day retention schedule unless the source says 31 days is unnecessary. Equivalent schedules are compatible too: Q1 and Q3 is twice yearly/biannual. A shared generic noun is not a shared subject: staff professional registration and patient registration are unrelated. "Supersedes" requires clear version/date evidence. Be conservative: if scope is unclear, use unrelated or compatible. Only call it contradiction at confidence 0.9 or above when the incompatibility is explicit.

Pairs:
${JSON.stringify(compact)}`;
  const res = await fetch(URL, {
    method: 'POST', signal: AbortSignal.timeout(45000),
    headers: openRouterHeaders(apiKey, 'Riverside Contradiction Classifier'),
    body: JSON.stringify(chatBody({ model, temperature: 0, messages: [{ role: 'user', content: prompt }] })),
  });
  if (!res.ok) throw new Error(`Contradiction classifier failed (${res.status}).`);
  const json = await res.json();
  const parsed = parseJson(json?.choices?.[0]?.message?.content);
  if (!parsed) throw new Error('Contradiction classifier returned invalid JSON.');
  return parsed;
}
