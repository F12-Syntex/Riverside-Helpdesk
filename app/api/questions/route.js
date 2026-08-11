// The question log endpoint — every question asked and the answer it was given.
//
//   GET /api/questions — read the log back for /stats, filtered and paged.
//
// Read-only. Rows are written by /api/agent as each turn finishes (see
// lib/questions/log.js); nothing here can create, change or delete one.
import { NextResponse } from 'next/server';
import { listQuestions, summariseQuestions } from '@/lib/questions/log';
import { listMachines } from '@/lib/audit/store';
import { isMachineId } from '@/lib/audit/machine';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStore = { 'Cache-Control': 'no-store' };

// The same windows the audit log offers, so the two halves of /stats agree
// about what "7 days" means. `null` days is everything.
const RANGES = { today: 1, week: 7, month: 30, quarter: 90, all: null };

function sinceFor(range) {
  const days = RANGES[range] === undefined ? 7 : RANGES[range];
  if (days === null) return null;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

export async function GET(request) {
  const params = new URL(request.url).searchParams;
  const machineId = params.get('machine') || '';
  if (machineId && !isMachineId(machineId)) {
    return NextResponse.json({ error: 'That is not a machine id.' }, { status: 400, headers: noStore });
  }

  const range = params.get('range') || 'week';
  const since = sinceFor(range);
  const filters = {
    machineId,
    since,
    outcome: params.get('outcome') || '',
    rated: params.get('rated') || '',
    search: params.get('q') || '',
  };

  try {
    const limit = Math.min(Math.max(Number(params.get('limit')) || 40, 1), 200);
    const beforeAt = params.get('beforeAt') || '';
    const beforeId = Number(params.get('beforeId')) || 0;

    // "Load older" needs the next page and nothing else: the summary and the
    // machine list have not changed, and re-running them would be several
    // queries to redraw numbers that are already on screen.
    if (beforeAt) {
      const questions = await listQuestions({ ...filters, beforeAt, beforeId, limit });
      return NextResponse.json({ questions, hasMore: questions.length === limit }, { headers: noStore });
    }

    const [summary, machines, questions] = await Promise.all([
      summariseQuestions({ machineId, since }),
      listMachines(),
      listQuestions({ ...filters, limit }),
    ]);

    return NextResponse.json(
      { range, summary, machines, questions, hasMore: questions.length === limit },
      { headers: noStore },
    );
  } catch (e) {
    return NextResponse.json(
      { error: 'Could not read the question log: ' + String(e.message || e) },
      { status: 500, headers: noStore },
    );
  }
}
