// Staff CRUD for the rota generator. Backed by the Neon `staff` table.
//   GET    /api/staff        — list all staff (alphabetical)
//   POST   /api/staff        — add a staff member { name, role?, hoursPerWeek?, notes? }
//   DELETE /api/staff?id=123 — remove a staff member
import { NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await ensureSchema();
    const sql = getSql();
    const staff = await sql`
      SELECT id, name, role, hours_per_week AS "hoursPerWeek", notes
      FROM staff ORDER BY name ASC
    `;
    return NextResponse.json({ staff });
  } catch (e) {
    return NextResponse.json({ error: 'Could not load staff.', detail: String(e).slice(0, 300) }, { status: 500 });
  }
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const name = String(body?.name || '').trim();
  if (!name) return NextResponse.json({ error: 'A name is required.' }, { status: 400 });
  const role = String(body?.role || '').trim();
  const notes = String(body?.notes || '').trim();
  const hoursRaw = body?.hoursPerWeek;
  const hours = hoursRaw === '' || hoursRaw == null || isNaN(Number(hoursRaw))
    ? null
    : Math.max(0, Math.min(168, Math.round(Number(hoursRaw))));

  try {
    await ensureSchema();
    const sql = getSql();
    const rows = await sql`
      INSERT INTO staff (name, role, hours_per_week, notes)
      VALUES (${name}, ${role}, ${hours}, ${notes})
      RETURNING id, name, role, hours_per_week AS "hoursPerWeek", notes
    `;
    return NextResponse.json({ staff: rows[0] });
  } catch (e) {
    return NextResponse.json({ error: 'Could not add staff member.', detail: String(e).slice(0, 300) }, { status: 500 });
  }
}

export async function DELETE(request) {
  const id = parseInt(new URL(request.url).searchParams.get('id') || '', 10);
  if (!id) return NextResponse.json({ error: 'A valid id is required.' }, { status: 400 });
  try {
    await ensureSchema();
    const sql = getSql();
    await sql`DELETE FROM staff WHERE id = ${id}`;
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: 'Could not remove staff member.', detail: String(e).slice(0, 300) }, { status: 500 });
  }
}
