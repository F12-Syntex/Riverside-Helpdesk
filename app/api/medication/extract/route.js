// Pull a list of medicine names out of a blob of text staff have pasted — a
// comma- or new-line-separated list, a bulleted/numbered list, a prescription
// snippet with doses and frequencies, or ordinary prose. The browser then fans
// each name out to /api/medication. No web search and a tiny token budget, so
// this is cheap and fast; the client falls back to a local parser if it fails.
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_RETENTION = { data_collection: 'deny' };
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_HEADERS = (apiKey) => ({
  Authorization: `Bearer ${apiKey}`,
  'Content-Type': 'application/json',
  'HTTP-Referer': 'https://riverside-practice.local',
  'X-Title': 'Riverside Practice Medication List Extract',
});

const TIMEOUT_MS = 20000;
const MAX_TEXT = 4000;     // bound the prompt size / cost
const MAX_MEDICINES = 12;  // cap the fan-out from one paste
const MAX_NAME_LEN = 120;  // matches the /api/medication name limit

const PROMPT = (text) =>
  'You read free text pasted by NHS GP practice staff and pull out the medicines mentioned. '
  + 'The text may be a list separated by commas or new lines, a bulleted or numbered list, a prescription-style snippet with strengths and frequencies, or ordinary prose.\n\n'
  + 'Return the distinct medicines named in the text, each as the SHORTEST phrase that identifies the medicine (its generic, brand or colloquial name). '
  + 'Drop the strength, dose, form and frequency — for example "amoxicillin 250mg three times a day" becomes "amoxicillin". '
  + 'Keep the name as written; do NOT correct spelling (a later step does that). '
  + 'Do NOT add any medicine that is not in the text, and do NOT include non-medicine words.\n\n'
  + 'Reply with ONE JSON object and nothing else, of exactly this shape: {"medicines":["name one","name two"]}. '
  + 'List at most ' + MAX_MEDICINES + ' medicines. If there are none, return {"medicines":[]}.\n\n'
  + 'TEXT:\n"""\n' + text + '\n"""';

// Parse the model reply into a clean, deduped list of names.
function parseNames(raw) {
  let str = String(raw || '').trim().replace(/^```(json)?/i, '').replace(/```$/, '').trim();
  const a = str.indexOf('{');
  const b = str.lastIndexOf('}');
  if (a !== -1 && b !== -1) str = str.slice(a, b + 1);
  let arr = [];
  try {
    const o = JSON.parse(str);
    if (Array.isArray(o.medicines)) arr = o.medicines;
  } catch (e) { return []; }
  const out = [];
  const seen = new Set();
  for (const n of arr) {
    const name = String(n || '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LEN);
    if (!name || !/[a-z]/i.test(name)) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
    if (out.length >= MAX_MEDICINES) break;
  }
  return out;
}

export async function POST(request) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MEDICATION_MODEL || process.env.OPENROUTER_AI_MODEL;

  let body;
  try { body = await request.json(); } catch (e) { return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 }); }
  const text = typeof body?.text === 'string' ? body.text.slice(0, MAX_TEXT).trim() : '';
  if (!text) return NextResponse.json({ error: 'Some text is required.' }, { status: 400 });

  // No model configured — tell the client so it falls back to its own parser.
  if (!apiKey || !model) return NextResponse.json({ error: 'extraction unavailable' }, { status: 503 });

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let data;
  try {
    const res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: OPENROUTER_HEADERS(apiKey),
      signal: ctrl.signal,
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: 500,
        messages: [{ role: 'user', content: PROMPT(text) }],
        response_format: { type: 'json_object' },
        provider: NO_RETENTION,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error(`[medication/extract] OpenRouter error ${res.status}:`, detail.slice(0, 300));
      return NextResponse.json({ error: 'extraction failed' }, { status: 502 });
    }
    data = await res.json();
  } catch (e) {
    console.error('[medication/extract] model fetch failed:', e);
    return NextResponse.json({ error: 'extraction failed' }, { status: 502 });
  } finally {
    clearTimeout(timer);
  }

  const msg = data && data.choices && data.choices[0] && data.choices[0].message;
  return NextResponse.json({ medicines: parseNames((msg && msg.content) || '') });
}
