// Natural-language rota edits. The manager types a change in plain English;
// we send the current grid + team to the AI, get back an updated grid, sanitise
// it against the real staff/leave, save it, and return a short reply.
//
// Uses the same OpenRouter model and zero-retention provider routing as the
// rest of the app (staff names are personal data).
import { NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import { buildRotaChatPrompt, parseGridResponse } from '@/lib/ai/rota';
import { sanitiseGrid, analyze, rebalance, changedKeys, DEFAULT_TIMES } from '@/lib/rota/logic';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const NO_RETENTION = { data_collection: 'deny' };
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_HEADERS = (apiKey) => ({
  Authorization: `Bearer ${apiKey}`,
  'Content-Type': 'application/json',
  'HTTP-Referer': 'https://riverside-practice.local',
  'X-Title': 'Riverside Practice Rota',
});

export async function POST(request) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_AI_MODEL;
  if (!apiKey || !model) return NextResponse.json({ error: 'Server is missing OPENROUTER_API_KEY or OPENROUTER_AI_MODEL.' }, { status: 500 });

  let body;
  try { body = await request.json(); } catch (e) { return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 }); }
  const week = String(body?.weekStarting || '').trim();
  const message = String(body?.message || '').trim();
  if (!ISO_DATE.test(week)) return NextResponse.json({ error: 'A valid week start date is required.' }, { status: 400 });
  if (!message) return NextResponse.json({ error: 'Type a change to make.' }, { status: 400 });

  try {
    await ensureSchema();
    const sql = getSql();
    const staff = await sql`SELECT id, name, about, leave FROM staff ORDER BY name ASC`;
    if (!staff.length) return NextResponse.json({ error: 'Add staff first.' }, { status: 400 });

    const rows = await sql`SELECT schedule FROM rotas WHERE week_starting = ${week}`;
    if (!rows.length) return NextResponse.json({ error: 'Generate a rota for this week first.' }, { status: 400 });
    const current = rows[0].schedule || {};
    const grid = sanitiseGrid(current.grid, staff, week);
    const times = current.times && current.times.E ? current.times : DEFAULT_TIMES;

    const prompt = buildRotaChatPrompt({ staff, weekStarting: week, grid, times, message });

    const res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: OPENROUTER_HEADERS(apiKey),
      body: JSON.stringify({ model, temperature: 0.2, messages: [{ role: 'user', content: prompt }], provider: NO_RETENTION }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return NextResponse.json({ error: `OpenRouter error (${res.status}).`, detail: detail.slice(0, 400) }, { status: 502 });
    }
    const data = await res.json();
    const parsed = parseGridResponse(data?.choices?.[0]?.message?.content || '');
    if (!parsed) return NextResponse.json({ error: "Sorry, I couldn't work out that change. Try rephrasing it." }, { status: 502 });

    // Apply the manager's change, then rebalance coverage around it: the cells
    // the AI changed are locked, and the rest are nudged back to full cover.
    const aiGrid = sanitiseGrid(parsed.grid, staff, week);
    const locked = changedKeys(grid, aiGrid, staff);
    const newGrid = rebalance(aiGrid, staff, locked);
    const schedule = { grid: newGrid, times: parsed.times || times };
    const saved = await sql`
      INSERT INTO rotas (week_starting, schedule) VALUES (${week}, ${JSON.stringify(schedule)}::jsonb)
      ON CONFLICT (week_starting) DO UPDATE SET schedule = EXCLUDED.schedule, updated_at = now()
      RETURNING week_starting::text AS "weekStarting", schedule, updated_at AS "updatedAt"
    `;
    const issues = analyze(newGrid, staff);
    return NextResponse.json({ rota: saved[0], reply: parsed.reply, issues });
  } catch (e) {
    return NextResponse.json({ error: 'Could not apply the change.', detail: String(e).slice(0, 300) }, { status: 502 });
  }
}
