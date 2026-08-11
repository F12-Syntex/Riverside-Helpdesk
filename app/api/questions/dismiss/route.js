// Closing one item on the unresolved items panel.
//
// POST /api/questions/dismiss — { turnId, itemId, label }
//
// Best-effort, exactly like the feedback endpoint and for the same reason: the
// receptionist is telling us they have dealt with something, and the one thing
// that must never happen is an error message in return. A lost row costs a line
// in a review; an error in front of somebody with a patient at the desk costs
// their trust in the panel, and a panel nobody trusts is a panel nobody reads.
//
// It records a decision. It does not gate one — nothing in the app waits on
// this call, and the interaction can be closed whether or not it succeeds.
import { NextResponse } from 'next/server';
import { recordDismissal } from '@/lib/questions/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MACHINE_COOKIE = /(?:^|;\s*)riva_machine=([^;]+)/;

function machineFromCookie(request) {
  const match = (request.headers.get('cookie') || '').match(MACHINE_COOKIE);
  if (!match) return '';
  try { return decodeURIComponent(match[1]); } catch (e) { return match[1]; }
}

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch (e) {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const turnId = String(body?.turnId || '').slice(0, 40);
  const itemId = String(body?.itemId || '').slice(0, 20);
  if (!turnId || !itemId) {
    return NextResponse.json({ error: 'A turn and an item are both needed.' }, { status: 400 });
  }

  await recordDismissal({
    turnId,
    itemId,
    label: String(body?.label || '').slice(0, 200),
    machineId: machineFromCookie(request),
  });

  return NextResponse.json({ ok: true });
}
