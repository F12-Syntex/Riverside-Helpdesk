// Reason-for-appointment endpoint. Reception pastes the text of a patient's
// AccurX online consultation (patient-identifiable details already removed) and
// gets back a CONCISE clinical reason for the appointment, written in medical
// terms for the clinician who will see or process the request. Deliberately
// lightweight — no retrieval, no citations, no Notebook dependency — because it
// only rephrases what the patient wrote into clinical shorthand; it never
// diagnoses or adds management.
import { NextResponse } from 'next/server';

// Parse the model's JSON reply: strip any markdown fences, then fall back to
// the first-{…last-} slice for replies with prose around the object.
function parseReply(raw) {
  const str = String(raw || '').trim().replace(/^```(json)?/i, '').replace(/```$/, '').trim();
  try { return JSON.parse(str); } catch (e) { /* fall through */ }
  const a = str.indexOf('{');
  const b = str.lastIndexOf('}');
  if (a !== -1 && b > a) {
    try { return JSON.parse(str.slice(a, b + 1)); } catch (e) { /* fall through */ }
  }
  return {};
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const NO_RETENTION = { data_collection: 'deny' };
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

function buildPrompt(text) {
  return `You are a clinical summarising assistant for a UK GP practice (The Riverside Practice). Reception pastes the text of a patient's AccurX online consultation (patient-identifiable details removed). Write the clinical REASON FOR THE APPOINTMENT for the clinician who will see or process this request.

RULES
- Write for a doctor. Be CONCISE and use standard medical terminology and accepted abbreviations where natural (e.g. SOB, N&V, LBP, URTI, PMH, Hx, /7 for days, /52 for weeks).
- "reason": ONE short line — the presenting complaint with its key qualifiers (site, duration, severity, associated features). Prefer clinical phrasing over the patient's lay words.
- "details": 0 to 5 terse clinical bullet points for anything else the clinician needs — onset/duration, associated symptoms, relevant past history or medication the patient mentions, what the patient is specifically requesting, and any red-flag features stated. Omit anything not present in the text.
- Summarise ONLY what the consultation says. Do NOT diagnose, do NOT add management or advice, and do NOT invent symptoms, negatives or details that are not stated. You may prefix a possible clinical category with "?" when the text clearly points to one, but never assert a diagnosis.
- Do not write any patient-identifiable information: never include the patient's name, date of birth, NHS number, address or contact details, even if the pasted text still contains one.

Reply with ONLY this JSON (no markdown fences):
{
  "reason": "<one concise clinical line>",
  "details": ["<point>", "<point (optional)>"]
}

AccurX consultation text:
"""
${text}
"""`;
}

export async function POST(request) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_AI_MODEL;
  if (!apiKey || !model) {
    return NextResponse.json({ error: 'Server is missing OPENROUTER_API_KEY or OPENROUTER_AI_MODEL.' }, { status: 500 });
  }

  let text = '';
  try {
    const body = await request.json();
    text = typeof body?.text === 'string' ? body.text.trim() : '';
  } catch (e) {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }
  if (!text) return NextResponse.json({ error: 'Empty consultation text.' }, { status: 400 });
  if (text.length > 20_000) return NextResponse.json({ error: 'Consultation text is too long.' }, { status: 400 });

  try {
    const res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://riverside-practice.local',
        'X-Title': 'Riverside Practice Q&A',
      },
      // provider: only route to providers that do not retain prompt data.
      body: JSON.stringify({
        model, temperature: 0.1, provider: NO_RETENTION,
        messages: [{ role: 'user', content: buildPrompt(text) }],
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return NextResponse.json({ error: `OpenRouter error (${res.status}).`, detail: detail.slice(0, 500) }, { status: 502 });
    }
    const data = await res.json();
    const raw = data?.choices?.[0]?.message?.content || '';
    if (!raw) return NextResponse.json({ error: 'No content returned by the model.' }, { status: 502 });

    const parsed = parseReply(raw);
    const reason = typeof parsed.reason === 'string' ? parsed.reason.trim() : '';
    const details = (Array.isArray(parsed.details) ? parsed.details : [])
      .filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim()).slice(0, 5);
    if (!reason && !details.length) {
      return NextResponse.json({ error: 'Could not summarise a reason from that text.' }, { status: 422 });
    }

    return NextResponse.json({ reason, details });
  } catch (e) {
    return NextResponse.json({ error: 'Could not reach OpenRouter.', detail: String(e).slice(0, 300) }, { status: 502 });
  }
}
