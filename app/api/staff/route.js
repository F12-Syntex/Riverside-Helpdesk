// Staff CRUD for the rota generator. Backed by the Neon `staff` table.
//   GET    /api/staff        — list all staff (alphabetical)
//   POST   /api/staff        — add a staff member { name, about?, leave? }
//   PATCH  /api/staff        — edit a staff member { id, name?, about?, leave? }
//   DELETE /api/staff?id=123 — remove a staff member
//
// `leave` is an array of { start, end } ISO date ranges (annual leave).
import { NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const COLS = 'id, name, role, hours_per_week AS "hoursPerWeek", notes, about, leave, phone, temporary';

// Keep the phone roughly as typed (so it stays readable in the UI) but bounded
// and single-line. Used to @mention the person in the WhatsApp export.
function cleanPhone(raw) {
  return String(raw || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 32);
}

function cleanLeave(raw) {
  if (!Array.isArray(raw)) return [];
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  return raw
    .map((lv) => ({ start: String(lv?.start || ''), end: String(lv?.end || lv?.start || '') }))
    .filter((lv) => iso.test(lv.start) && iso.test(lv.end))
    .slice(0, 60);
}

export async function GET() {
  try {
    await ensureSchema();
    const sql = getSql();
    const staff = await sql`
      SELECT id, name, role, hours_per_week AS "hoursPerWeek", notes, about, leave, phone, temporary
      FROM staff ORDER BY name ASC
    `;
    return NextResponse.json({ staff });
  } catch (e) {
    return NextResponse.json({ error: 'Could not load staff.', detail: String(e).slice(0, 300) }, { status: 500 });
  }
}

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch (e) { return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 }); }

  const name = String(body?.name || '').trim();
  if (!name) return NextResponse.json({ error: 'A name is required.' }, { status: 400 });
  const about = String(body?.about || '').trim();
  const phone = cleanPhone(body?.phone);
  const leave = JSON.stringify(cleanLeave(body?.leave));
  const temporary = body?.temporary === true;

  try {
    await ensureSchema();
    const sql = getSql();
    const rows = await sql`
      INSERT INTO staff (name, about, phone, leave, temporary)
      VALUES (${name}, ${about}, ${phone}, ${leave}::jsonb, ${temporary})
      RETURNING id, name, role, hours_per_week AS "hoursPerWeek", notes, about, leave, phone, temporary
    `;
    return NextResponse.json({ staff: rows[0] });
  } catch (e) {
    return NextResponse.json({ error: 'Could not add staff member.', detail: String(e).slice(0, 300) }, { status: 500 });
  }
}

export async function PATCH(request) {
  let body;
  try { body = await request.json(); } catch (e) { return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 }); }

  const id = parseInt(body?.id, 10);
  if (!id) return NextResponse.json({ error: 'A valid id is required.' }, { status: 400 });
  const name = String(body?.name || '').trim();
  if (!name) return NextResponse.json({ error: 'A name is required.' }, { status: 400 });
  const about = String(body?.about || '').trim();
  const phone = cleanPhone(body?.phone);
  const leave = JSON.stringify(cleanLeave(body?.leave));
  const temporary = body?.temporary === true;

  try {
    await ensureSchema();
    const sql = getSql();
    const rows = await sql`
      UPDATE staff SET name = ${name}, about = ${about}, phone = ${phone}, leave = ${leave}::jsonb, temporary = ${temporary}
      WHERE id = ${id}
      RETURNING id, name, role, hours_per_week AS "hoursPerWeek", notes, about, leave, phone, temporary
    `;
    if (!rows.length) return NextResponse.json({ error: 'Staff member not found.' }, { status: 404 });
    return NextResponse.json({ staff: rows[0] });
  } catch (e) {
    return NextResponse.json({ error: 'Could not update staff member.', detail: String(e).slice(0, 300) }, { status: 500 });
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
