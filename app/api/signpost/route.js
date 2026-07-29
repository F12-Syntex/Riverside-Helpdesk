// AccurX signposting endpoint. Reception pastes the text of an AccurX
// consultation (with patient-identifiable details already removed) and gets a
// CONCISE pathway back: who in the practice team should pick it up, how
// urgently, and the one or two next steps. This is deliberately lightweight —
// no retrieval, no citations — because the output is a routing suggestion for
// staff to sanity-check, not clinical advice.
//
// The one exception is the practice's own triaging guidance: the "Triaging
// notebook" section of the in-app Notebook is read live and folded into the
// prompt, so the routing follows how this practice actually triages. It is
// best-effort — if the Notebook cannot be read the endpoint still signposts.
import { NextResponse } from 'next/server';
import { notebookSectionContext } from '@/lib/notebook';
import { getAiModel } from '@/lib/settings';

// Parse the model's JSON reply: strip any markdown fences, then fall back to
// the first-{…last-} slice for replies with prose around the object. (The
// shared parseAiJson coerces into the Q&A answer/triage shapes, so this route
// keeps its own tiny parser for its own shape.)
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

// The practice team the model may route to. Kept as data so the roster is easy
// to amend in one place when the team changes.
const TEAM = [
  { key: 'gp', label: 'GP (doctor)', handles: 'undifferentiated or complex symptoms, anything needing diagnosis or examination, mental health concerns, safeguarding, abnormal results needing interpretation, urgent same-day clinical problems' },
  { key: 'diabetes-nurse', label: 'Diabetes nurse', handles: 'diabetes reviews, HbA1c follow-up, blood sugar concerns, diabetic foot checks, insulin/diabetes medication queries in established diabetics' },
  { key: 'practice-nurse', label: 'Practice nurse', handles: 'immunisations and vaccinations, wound care and dressings (bandage changes), stitch/clip removal, cervical smears, blood pressure checks, B12 injections, travel advice' },
  { key: 'pharmacist', label: 'In-house pharmacist', handles: 'medication queries and reviews, repeat prescription issues, dose queries, minor side effects, asthma reviews and inhaler technique' },
  { key: 'admin', label: 'Reception / admin', handles: 'appointment booking or cancellation, fit (sick) note continuations, test result release once already actioned, registration and forms, letters' },
  { key: 'urgent-care', label: '999 / A&E or NHS 111', handles: 'emergencies and red-flag symptoms: chest pain, breathing difficulty, stroke signs, heavy bleeding, sepsis signs, suicidal intent' },
];

const URGENCIES = new Set(['emergency', 'same-day', 'routine']);

// The Notebook section whose subtree holds the practice's triaging guidance.
const TRIAGE_SECTION = 'Triaging notebook';

function buildPrompt(text, guidance) {
  const roster = TEAM.map((t) => `- ${t.key}: ${t.label} — handles: ${t.handles}`).join('\n');
  // Practice guidance is authoritative: where the notes say how a given request
  // is triaged at this practice, follow them over the generic rules below.
  const guidanceBlock = guidance
    ? `PRACTICE TRIAGING GUIDANCE (from the practice's Notebook — follow this when it applies; it overrides the generic rules below):
"""
${guidance}
"""

`
    : '';
  return `You are a signposting assistant for a UK GP practice (The Riverside Practice). Reception pastes the text of a patient's AccurX online consultation (patient-identifiable details removed). Suggest which member of the practice team should handle it.

PRACTICE TEAM (route to exactly one, by key):
${roster}

${guidanceBlock}RULES
- Be CONCISE. This is a routing hint for trained reception staff, not advice.
- If ANY red-flag / emergency feature is present (chest pain, severe breathlessness, stroke signs, anaphylaxis, heavy bleeding, sepsis signs, suicidal intent, seriously unwell child), route to urgent-care with urgency "emergency" — regardless of what the request nominally asks for.
- Asthma routine reviews / inhaler queries go to the pharmacist; an asthma attack or worsening breathlessness is a GP same-day or an emergency.
- Diabetes routine care goes to the diabetes nurse; newly suspected diabetes or an unwell diabetic goes to the GP.
- When the request mixes several needs, route to whoever must act FIRST and mention the rest in the steps.
- If genuinely unclear, route to the GP — never guess a nurse/pharmacist pathway for an undifferentiated problem.
- Do not invent details that are not in the consultation text. Do not write any patient-identifiable information.

Reply with ONLY this JSON (no markdown fences):
{
  "who": "<one team key from the roster>",
  "urgency": "emergency" | "same-day" | "routine",
  "reason": "<one short sentence: why this person and this urgency>",
  "steps": ["<step 1>", "<step 2 (optional)>", "<step 3 (optional)>"],
  "flags": ["<red flag spotted, if any — else empty array>"]
}

AccurX consultation text:
"""
${text}
"""`;
}

export async function POST(request) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  // The model is a practice setting now, changed at /settings — see lib/settings.js.
  const model = await getAiModel();
  if (!apiKey) {
    return NextResponse.json({ error: 'Server is missing OPENROUTER_API_KEY.' }, { status: 500 });
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

  // Practice triaging guidance is best-effort: a missing or unreachable Notebook
  // must never stop reception getting a routing suggestion.
  const guidance = await notebookSectionContext(TRIAGE_SECTION).catch(() => '');

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
        messages: [{ role: 'user', content: buildPrompt(text, guidance) }],
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
    // Unknown/missing routing key falls back to the GP — the safe default for
    // anything the model could not place.
    const team = TEAM.find((t) => t.key === parsed.who) || TEAM[0];
    const urgency = URGENCIES.has(parsed.urgency) ? parsed.urgency : 'same-day';
    const strings = (v, max) => (Array.isArray(v) ? v : [])
      .filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim()).slice(0, max);

    return NextResponse.json({
      who: team.key,
      whoLabel: team.label,
      urgency,
      reason: typeof parsed.reason === 'string' ? parsed.reason.trim() : '',
      steps: strings(parsed.steps, 3),
      flags: strings(parsed.flags, 4),
    });
  } catch (e) {
    return NextResponse.json({ error: 'Could not reach OpenRouter.', detail: String(e).slice(0, 300) }, { status: 502 });
  }
}
