// Rota persistence + generation for one week.
//   GET  /api/rota?week=YYYY-MM-DD  — load the saved schedule (or null)
//   POST /api/rota                  — (re)generate: deterministic base, then the
//                                     AI applies the saved list of rules on top
//   PUT  /api/rota                  — save a manually edited grid (keeps rules)
//
// A schedule is { grid, times, rules, seed }:
//   - grid: staff id -> 5 shift codes (Mon–Fri)
//   - rules: plain-English instructions ("Simin is off all week") shown in the
//     UI; each chat change adds one, and they can be deleted. Generation always
//     starts from a fair base (seeded) and re-applies the whole rule list, so a
//     rule can be removed and the week rebuilt without it.
import { NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import { generateGrid, sanitiseGrid, rebalance, changedKeys, DEFAULT_TIMES } from '@/lib/rota/logic';
import { buildRotaChatPrompt, parseGridResponse } from '@/lib/ai/rota';

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

function cleanRules(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((r) => String(r || '').trim()).filter(Boolean).slice(0, 40);
}

async function upsert(sql, week, schedule) {
  const rows = await sql`
    INSERT INTO rotas (week_starting, schedule)
    VALUES (${week}, ${JSON.stringify(schedule)}::jsonb)
    ON CONFLICT (week_starting)
    DO UPDATE SET schedule = EXCLUDED.schedule, updated_at = now()
    RETURNING week_starting::text AS "weekStarting", schedule, updated_at AS "updatedAt"
  `;
  return rows[0];
}

export async function GET(request) {
  const week = new URL(request.url).searchParams.get('week') || '';
  if (!ISO_DATE.test(week)) return NextResponse.json({ error: 'A valid ?week=YYYY-MM-DD is required.' }, { status: 400 });
  try {
    await ensureSchema();
    const sql = getSql();
    const rows = await sql`SELECT week_starting::text AS "weekStarting", schedule, updated_at AS "updatedAt" FROM rotas WHERE week_starting = ${week}`;
    return NextResponse.json({ rota: rows[0] || null });
  } catch (e) {
    return NextResponse.json({ error: 'Could not load the rota.', detail: String(e).slice(0, 300) }, { status: 500 });
  }
}

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch (e) { return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 }); }
  const week = String(body?.weekStarting || '').trim();
  if (!ISO_DATE.test(week)) return NextResponse.json({ error: 'A valid week start date (YYYY-MM-DD) is required.' }, { status: 400 });
  const rules = cleanRules(body?.rules);
  const seed = Number.isInteger(body?.seed) ? body.seed : Math.floor(Math.random() * 100000);
  const minStaff = 2;

  try {
    await ensureSchema();
    const sql = getSql();
    const staff = await sql`SELECT id, name, about, leave FROM staff ORDER BY name ASC`;
    if (!staff.length) return NextResponse.json({ error: 'Add at least one staff member before generating a rota.' }, { status: 400 });

    // 1) Fair base for the week (seeded so each regenerate differs).
    let grid = generateGrid(staff, week, minStaff, seed);
    let times = DEFAULT_TIMES;

    // 2) Apply all rules together via the AI, then rebalance coverage around them.
    const apiKey = process.env.OPENROUTER_API_KEY;
    const model = process.env.OPENROUTER_AI_MODEL;
    if (rules.length && apiKey && model) {
      const message = rules.length === 1
        ? rules[0]
        : 'Apply ALL of these rules to the rota together (if two conflict, the later one wins):\n' + rules.map((r, i) => `${i + 1}. ${r}`).join('\n');
      const prompt = buildRotaChatPrompt({ staff, weekStarting: week, grid, times, message });
      try {
        const res = await fetch(OPENROUTER_URL, { method: 'POST', headers: OPENROUTER_HEADERS(apiKey), body: JSON.stringify({ model, temperature: 0.2, messages: [{ role: 'user', content: prompt }], provider: NO_RETENTION }) });
        if (res.ok) {
          const data = await res.json();
          const parsed = parseGridResponse(data?.choices?.[0]?.message?.content || '');
          if (parsed) {
            const aiGrid = sanitiseGrid(parsed.grid, staff, week);
            grid = rebalance(aiGrid, staff, changedKeys(grid, aiGrid, staff), minStaff);
            if (parsed.times) times = parsed.times;
          }
        }
      } catch (e) { /* non-fatal: keep the base grid */ }
    }

    const saved = await upsert(sql, week, { grid, times, rules, seed });
    return NextResponse.json({ rota: saved });
  } catch (e) {
    return NextResponse.json({ error: 'Could not generate the rota.', detail: String(e).slice(0, 300) }, { status: 500 });
  }
}

export async function PUT(request) {
  let body;
  try { body = await request.json(); } catch (e) { return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 }); }
  const week = String(body?.weekStarting || '').trim();
  if (!ISO_DATE.test(week)) return NextResponse.json({ error: 'A valid week start date (YYYY-MM-DD) is required.' }, { status: 400 });

  try {
    await ensureSchema();
    const sql = getSql();
    const staff = await sql`SELECT id, name, about, leave FROM staff ORDER BY name ASC`;
    const grid = sanitiseGrid(body?.grid, staff, week);
    const times = (body?.times && body.times.E && body.times.L) ? body.times : DEFAULT_TIMES;
    const rules = cleanRules(body?.rules);
    const seed = Number.isInteger(body?.seed) ? body.seed : 0;
    const saved = await upsert(sql, week, { grid, times, rules, seed });
    return NextResponse.json({ rota: saved });
  } catch (e) {
    return NextResponse.json({ error: 'Could not save the rota.', detail: String(e).slice(0, 300) }, { status: 500 });
  }
}
