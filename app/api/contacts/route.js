// The practice's contacts, for the Contact numbers page (/lookup).
//   GET    /api/contacts          — every contact { entries, editable }
//   POST   /api/contacts          — add one { label, category?, phones[], emails[], note?, aliases? }
//   PATCH  /api/contacts          — change one { id, ...same }
//   DELETE /api/contacts?id=…     — take one off the list (archived, not deleted)
//
// See lib/contacts-store.js. The CQC register is not here — /api/cqc.
import { NextResponse } from 'next/server';
import { contactDirectory, saveContact, removeContact } from '@/lib/contacts-store';
import { prepareBundledKnowledge } from '@/lib/knowledge-bootstrap';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const NO_STORE = { 'Cache-Control': 'private, no-store' };

const failed = (e, what) => NextResponse.json(
  { error: e && e.status ? e.message : what, detail: String(e).slice(0, 300) },
  { status: (e && e.status) || 500, headers: NO_STORE },
);

export async function GET() {
  // Nudges the sync that copies the bundled sheet into the database; it runs
  // in the background and never holds this request up.
  await prepareBundledKnowledge().catch(() => false);
  try {
    const { entries, editable } = await contactDirectory({ fresh: true });
    return NextResponse.json({ entries, editable }, { headers: NO_STORE });
  } catch (e) {
    return failed(e, 'Could not load the contacts.');
  }
}

async function body(request) {
  try { return await request.json(); } catch (e) { return null; }
}

export async function POST(request) {
  const b = await body(request);
  if (!b) return NextResponse.json({ error: 'Invalid request body.' }, { status: 400, headers: NO_STORE });
  try {
    return NextResponse.json({ contact: await saveContact({ ...b, id: undefined }) }, { headers: NO_STORE });
  } catch (e) {
    return failed(e, 'Could not save the contact.');
  }
}

export async function PATCH(request) {
  const b = await body(request);
  if (!b || !b.id) return NextResponse.json({ error: 'An id is required.' }, { status: 400, headers: NO_STORE });
  try {
    return NextResponse.json({ contact: await saveContact(b) }, { headers: NO_STORE });
  } catch (e) {
    return failed(e, 'Could not save the contact.');
  }
}

export async function DELETE(request) {
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'An id is required.' }, { status: 400, headers: NO_STORE });
  try {
    await removeContact(id);
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  } catch (e) {
    return failed(e, 'Could not remove the contact.');
  }
}
