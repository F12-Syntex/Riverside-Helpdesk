// The activity audit log endpoint.
//
//   POST  /api/audit        — the browser sends a batch of events (see
//                             lib/audit/client.js). Fire-and-forget: it answers
//                             quickly, never returns anything the page needs,
//                             and treats a bad batch as nothing to store rather
//                             than as an error worth surfacing to staff.
//   GET   /api/audit        — read the log back for /stats, filtered.
//   PATCH /api/audit        — name a machine ("Reception PC 1").
//
// This is the one route the tracker never records. Logging the log would
// produce a request per request and never settle.
import { NextResponse } from 'next/server';
import { listEvents, listMachines, recordEvents, renameMachine, summarise, upsertMachine, MAX_EVENTS_PER_BATCH } from '@/lib/audit/store';
import { KINDS } from '@/lib/audit/describe';
import { isMachineId } from '@/lib/audit/machine';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStore = { 'Cache-Control': 'no-store' };

// The time windows the stats page offers. `null` days means everything.
const RANGES = {
  today: 1,
  week: 7,
  month: 30,
  quarter: 90,
  all: null,
};

function sinceFor(range) {
  const days = RANGES[range] === undefined ? 7 : RANGES[range];
  if (days === null) return null;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return NextResponse.json({ ok: false }, { status: 400, headers: noStore });
  }

  const machineId = String(body?.machineId || '');
  if (!isMachineId(machineId)) {
    return NextResponse.json({ ok: false, error: 'A machine id is required.' }, { status: 400, headers: noStore });
  }

  const events = Array.isArray(body?.events) ? body.events.slice(0, MAX_EVENTS_PER_BATCH) : [];

  try {
    // The profile arrives with every batch; it is cheap and it keeps the
    // browser version current without a separate handshake.
    await upsertMachine(machineId, body?.machine || {});
    const stored = events.length ? await recordEvents(machineId, events) : 0;
    return NextResponse.json({ ok: true, stored }, { headers: noStore });
  } catch (e) {
    // A failure here must never reach the page the staff member is using, so it
    // is logged for whoever runs the app and reported as a plain 500 the
    // tracker will quietly retry.
    console.warn('[audit] could not store a batch:', String(e).slice(0, 300));
    return NextResponse.json({ ok: false }, { status: 500, headers: noStore });
  }
}

export async function GET(request) {
  const params = new URL(request.url).searchParams;
  const machineId = params.get('machine') || '';
  if (machineId && !isMachineId(machineId)) {
    return NextResponse.json({ error: 'That is not a machine id.' }, { status: 400, headers: noStore });
  }

  const kinds = (params.get('kinds') || '')
    .split(',')
    .map((k) => k.trim())
    .filter((k) => KINDS.includes(k));

  const range = params.get('range') || 'week';
  const since = sinceFor(range);
  const filters = { machineId, kinds, search: params.get('q') || '', since };

  try {
    const limit = Math.min(Math.max(Number(params.get('limit')) || 100, 1), 500);
    // The cursor is the (at, id) of the last row the page already has.
    const beforeAt = params.get('beforeAt') || '';
    const beforeId = Number(params.get('beforeId')) || 0;

    // A "load more" only needs the next page; the summary and the machine list
    // are unchanged and re-sending them would be several needless queries.
    if (beforeAt) {
      const events = await listEvents({ ...filters, beforeAt, beforeId, limit });
      return NextResponse.json({ events, hasMore: events.length === limit }, { headers: noStore });
    }

    const [summary, machines, events] = await Promise.all([
      summarise({ machineId, since, hourly: range === 'today' }),
      listMachines(),
      listEvents({ ...filters, limit }),
    ]);

    return NextResponse.json(
      { range, summary, machines, events, hasMore: events.length === limit },
      { headers: noStore },
    );
  } catch (e) {
    return NextResponse.json(
      { error: 'Could not read the audit log: ' + String(e.message || e) },
      { status: 500, headers: noStore },
    );
  }
}

export async function PATCH(request) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400, headers: noStore });
  }

  try {
    const machine = await renameMachine(String(body?.machineId || ''), body?.name);
    return NextResponse.json({ machine }, { headers: noStore });
  } catch (e) {
    const message = String(e.message || e);
    const bad = /machine id|has not been seen/.test(message);
    return NextResponse.json({ error: message }, { status: bad ? 400 : 500, headers: noStore });
  }
}
