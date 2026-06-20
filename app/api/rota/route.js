// Rota persistence + generation for one week.
//   GET  /api/rota?week=YYYY-MM-DD  — load the saved grid for that week (or null)
//   POST /api/rota                  — auto-generate a balanced grid and save it
//   PUT  /api/rota                  — save a manually edited grid
//
// A rota is a grid keyed by staff id → 5 shift codes (Mon–Fri), stored in the
// `rotas.schedule` jsonb as { grid, times }. Generation is deterministic
// (instant, always valid coverage); natural-language edits go through
// /api/rota/chat, which uses the AI.
import { NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import { generateGrid, sanitiseGrid, DEFAULT_TIMES } from '@/lib/rota/logic';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

async function loadStaff(sql) {
  return sql`SELECT id, name, about, leave FROM staff ORDER BY name ASC`;
}

async function upsert(sql, weekStarting, schedule) {
  const rows = await sql`
    INSERT INTO rotas (week_starting, schedule)
    VALUES (${weekStarting}, ${JSON.stringify(schedule)}::jsonb)
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
    const rows = await sql`
      SELECT week_starting::text AS "weekStarting", schedule, updated_at AS "updatedAt"
      FROM rotas WHERE week_starting = ${week}
    `;
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
  const minStaff = Number.isFinite(body?.minStaff) ? Math.max(1, Math.min(4, Math.round(body.minStaff))) : 2;

  try {
    await ensureSchema();
    const sql = getSql();
    const staff = await loadStaff(sql);
    if (!staff.length) return NextResponse.json({ error: 'Add at least one staff member before generating a rota.' }, { status: 400 });

    // Random seed so each "Regenerate" produces a different balanced week.
    const seed = Math.floor(Math.random() * 100000);
    const grid = generateGrid(staff, week, minStaff, seed);
    const schedule = { grid, times: DEFAULT_TIMES };
    const saved = await upsert(sql, week, schedule);
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
    const staff = await loadStaff(sql);
    const grid = sanitiseGrid(body?.grid, staff, week);
    const times = (body?.times && body.times.E && body.times.L) ? body.times : DEFAULT_TIMES;
    const saved = await upsert(sql, week, { grid, times });
    return NextResponse.json({ rota: saved });
  } catch (e) {
    return NextResponse.json({ error: 'Could not save the rota.', detail: String(e).slice(0, 300) }, { status: 500 });
  }
}
