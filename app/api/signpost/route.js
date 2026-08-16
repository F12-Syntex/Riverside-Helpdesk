// AccurX signposting endpoint. Reception pastes the text of an AccurX
// consultation (with patient-identifiable details already removed) and gets a
// CONCISE pathway back: who in the practice team should pick it up, how
// urgently, and the one or two next steps. This is deliberately lightweight —
// no retrieval, no citations — because the output is a routing suggestion for
// staff to sanity-check, not clinical advice.
//
// WHERE THE ROUTING COMES FROM. This endpoint used to read the "Triaging
// notebook" section of the in-app Notebook live and paste it into the prompt.
// That made the routing model something nobody could test and something that
// changed under the code whenever a page was edited — and it meant this page and
// the assistant's own triage cards answered the same question from two different
// sets of rules. Both now read lib/triage/destinations.mjs: the practice's
// destinations written down once, with what each one takes, what it never takes,
// and the order the checks run in.
import { NextResponse } from 'next/server';
import { DESTINATIONS, routingGuidance } from '@/lib/triage/destinations.mjs';
import { getAiModel } from '@/lib/settings';
import { chatRequest } from '@/lib/ai/openrouter.mjs';

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


// The team the model may route to, and the order the routing runs in — both
// read from the practice's destinations file rather than written out again here.
// The keys below are the keys this endpoint answers with; the page shows the
// label beside them.
const TEAM = DESTINATIONS;

const URGENCIES = new Set(['emergency', 'same-day', 'routine']);

function buildPrompt(text) {
  return `You are a signposting assistant for a UK GP practice (The Riverside Practice). Reception pastes the text of a patient's AccurX online consultation (patient-identifiable details removed). Suggest which member of the practice team should handle it.

${routingGuidance()}

RULES
- Be CONCISE. This is a routing hint for trained reception staff, not advice.
- The order above is the practice's own and runs top to bottom. Nothing later overrides something earlier: a request matching both a red flag and a minor illness is a red flag.
- If ANY red-flag / emergency feature is present (chest pain, severe breathlessness, stroke signs, anaphylaxis, heavy bleeding, sepsis signs, suicidal intent, seriously unwell child), route to urgent-care with urgency "emergency" — regardless of what the request nominally asks for.
- When the request mixes several needs, route to whoever must act FIRST and mention the rest in the steps.
- If genuinely unclear, route to gp — never guess a nurse pathway for an undifferentiated problem.
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

  try {
    // No-retention routing and no extended reasoning, both from lib/ai/openrouter.
    const res = await fetch(...chatRequest(apiKey, {
      model, temperature: 0.1, messages: [{ role: 'user', content: buildPrompt(text) }],
    }));
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return NextResponse.json({ error: `OpenRouter error (${res.status}).`, detail: detail.slice(0, 500) }, { status: 502 });
    }
    const data = await res.json();
    const raw = data?.choices?.[0]?.message?.content || '';
    if (!raw) return NextResponse.json({ error: 'No content returned by the model.' }, { status: 502 });

    const parsed = parseReply(raw);
    // Unknown/missing routing key falls back to the GP — the safe default for
    // anything the model could not place, and the same default the practice's
    // own order ends on.
    const team = TEAM.find((t) => t.key === parsed.who) || TEAM.find((t) => t.key === 'gp');
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
