// Answer feedback: store one button press, and read the log back.
//
// POST is best-effort by design. A reader telling us an answer was wrong must
// never see an error for their trouble, and the assistant must never be held up
// by it, so a failed write is logged on the server and reported as accepted.
// The cost of losing one row is one row.
//
// GET is the review list — every judged answer, newest first, for /feedback.
import { NextResponse } from 'next/server';
import { ensureFeedbackSchema, getSql } from '@/lib/db';
import { VERDICT_IDS } from '@/lib/feedback.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The question is kept whole rather than truncated the way the audit log does
// it: the whole point of this table is being able to read what was actually
// asked. Capped only against a pasted document arriving as a "question".
const MAX_QUESTION = 2000;

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch (e) {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const verdict = String(body?.verdict || '').trim();
  if (!VERDICT_IDS.includes(verdict)) {
    return NextResponse.json({ error: 'Unknown verdict.' }, { status: 400 });
  }

  const row = {
    machineId: String(body?.machineId || '').slice(0, 80),
    question: String(body?.question || '').slice(0, MAX_QUESTION),
    verdict,
    template: String(body?.template || '').slice(0, 200),
    answerKind: String(body?.answerKind || '').slice(0, 40),
    // Which turn this verdict is about. The answer carries the id, the button
    // sends it back and the question log joins on it — so "wrong" lands on the
    // answer it was pressed under rather than on the next identically worded
    // question. Empty from an older page, which falls back to matching wording.
    turnId: String(body?.turnId || '').slice(0, 40),
  };

  try {
    await ensureFeedbackSchema();
    const sql = getSql();
    await sql`
      INSERT INTO answer_feedback (machine_id, question, verdict, template, answer_kind, turn_id)
      VALUES (${row.machineId}, ${row.question}, ${row.verdict}, ${row.template}, ${row.answerKind}, ${row.turnId})
    `;
  } catch (e) {
    console.warn('[feedback] could not store:', String(e).slice(0, 200));
  }
  return NextResponse.json({ ok: true });
}

export async function GET(request) {
  const limit = Math.min(500, Math.max(1, parseInt(new URL(request.url).searchParams.get('limit'), 10) || 200));
  try {
    await ensureFeedbackSchema();
    const sql = getSql();
    const rows = await sql`
      SELECT id, machine_id AS "machineId", question, verdict, template,
             answer_kind AS "answerKind", turn_id AS "turnId", at
      FROM answer_feedback
      ORDER BY at DESC
      LIMIT ${limit}
    `;
    const counts = await sql`
      SELECT verdict, count(*)::int AS n FROM answer_feedback GROUP BY verdict
    `;
    return NextResponse.json({ rows, counts });
  } catch (e) {
    return NextResponse.json({ error: 'Could not read the feedback log.', detail: String(e).slice(0, 200) }, { status: 500 });
  }
}
