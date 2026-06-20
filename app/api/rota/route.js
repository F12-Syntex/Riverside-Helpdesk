// Rota generation + history.
//   GET  /api/rota  — list recent saved rotas
//   POST /api/rota  — generate a rota for a week from the current staff and the
//                     given constraints, save it, and return it.
//
// Generation calls the same OpenRouter model used by the Q&A bot, routed only to
// providers that do not retain prompt data (the staff list is personal data).
import { NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import { buildRotaPrompt, parseRotaJson } from '@/lib/ai/rota';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_RETENTION = { data_collection: 'deny' };
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_HEADERS = (apiKey) => ({
  Authorization: `Bearer ${apiKey}`,
  'Content-Type': 'application/json',
  'HTTP-Referer': 'https://riverside-practice.local',
  'X-Title': 'Riverside Practice Rota',
});

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET() {
  try {
    await ensureSchema();
    const sql = getSql();
    const rotas = await sql`
      SELECT id, week_starting::text AS "weekStarting", notes, schedule, created_at AS "createdAt"
      FROM rotas ORDER BY created_at DESC LIMIT 20
    `;
    return NextResponse.json({ rotas });
  } catch (e) {
    return NextResponse.json({ error: 'Could not load rotas.', detail: String(e).slice(0, 300) }, { status: 500 });
  }
}

export async function POST(request) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_AI_MODEL;
  if (!apiKey || !model) {
    return NextResponse.json({ error: 'Server is missing OPENROUTER_API_KEY or OPENROUTER_AI_MODEL.' }, { status: 500 });
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const weekStarting = String(body?.weekStarting || '').trim();
  if (!ISO_DATE.test(weekStarting)) {
    return NextResponse.json({ error: 'A valid week start date (YYYY-MM-DD) is required.' }, { status: 400 });
  }
  const openingHours = String(body?.openingHours || '').trim();
  const requirements = String(body?.requirements || '').trim();

  try {
    await ensureSchema();
    const sql = getSql();

    const staff = await sql`
      SELECT name, role, hours_per_week AS "hoursPerWeek", notes
      FROM staff ORDER BY name ASC
    `;
    if (!staff.length) {
      return NextResponse.json({ error: 'Add at least one staff member before generating a rota.' }, { status: 400 });
    }

    const prompt = buildRotaPrompt({ staff, weekStarting, openingHours, requirements });

    const res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: OPENROUTER_HEADERS(apiKey),
      body: JSON.stringify({
        model,
        temperature: 0.3,
        messages: [{ role: 'user', content: prompt }],
        provider: NO_RETENTION,
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return NextResponse.json({ error: `OpenRouter error (${res.status}).`, detail: detail.slice(0, 500) }, { status: 502 });
    }

    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content || '';
    const parsed = parseRotaJson(text);
    if (!parsed) {
      return NextResponse.json({ error: 'The model did not return a usable rota. Please try again.' }, { status: 502 });
    }

    const schedule = { days: parsed.days, notes: parsed.notes };
    const rows = await sql`
      INSERT INTO rotas (week_starting, notes, schedule)
      VALUES (${weekStarting}, ${requirements}, ${JSON.stringify(schedule)})
      RETURNING id, week_starting::text AS "weekStarting", notes, schedule, created_at AS "createdAt"
    `;
    return NextResponse.json({ rota: rows[0] });
  } catch (e) {
    return NextResponse.json({ error: 'Could not generate the rota.', detail: String(e).slice(0, 300) }, { status: 502 });
  }
}
