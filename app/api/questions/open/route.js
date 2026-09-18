// The questions nobody has an answer for yet.
//
//   GET    /api/questions/open            the list, newest activity first
//   POST   /api/questions/open            ask one — { question, detail }
//   PATCH  /api/questions/open            answer one — { id, answer }
//   DELETE /api/questions/open?id=12      remove one that should not be there
//
// The list has two kinds of row in it and only one of them is written here: the
// other half arrives from the question log, which files every turn the
// assistant could not answer (lib/questions/log.js → lib/questions/gaps.mjs).
//
// UNLIKE the feedback endpoint, POST here is NOT best-effort. Feedback is a
// button pressed on the way past and a lost row costs one row; this is somebody
// typing out a question they need answering, and silently dropping it would be
// the worst thing the page could do. So a failed write says so, and the box
// keeps what was typed.
import { NextResponse } from 'next/server';
import {
  addOpenQuestion, answerOpenQuestion, deleteOpenQuestion, listOpenQuestions,
} from '@/lib/questions/open';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStore = { 'Cache-Control': 'no-store' };

const MACHINE_COOKIE = /(?:^|;\s*)riva_machine=([^;]+)/;

function machineFromCookie(request) {
  const match = (request.headers.get('cookie') || '').match(MACHINE_COOKIE);
  if (!match) return '';
  try { return decodeURIComponent(match[1]); } catch (e) { return match[1]; }
}

async function readBody(request) {
  try { return await request.json(); } catch (e) { return null; }
}

export async function GET(request) {
  const params = new URL(request.url).searchParams;
  try {
    const { rows, counts } = await listOpenQuestions({
      status: params.get('status') || '',
      origin: params.get('origin') || '',
      limit: Number(params.get('limit')) || 100,
    });
    return NextResponse.json({ rows, counts }, { headers: noStore });
  } catch (e) {
    return NextResponse.json(
      { error: 'Could not read the questions list.', detail: String(e.message || e).slice(0, 200) },
      { status: 500, headers: noStore },
    );
  }
}

export async function POST(request) {
  const body = await readBody(request);
  if (!body) return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });

  try {
    const result = await addOpenQuestion({
      question: body.question,
      detail: body.detail,
      origin: 'asked',
      machineId: machineFromCookie(request),
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400, headers: noStore });
    // `repeat` is how the page can say "somebody has already asked this" rather
    // than pretending a fresh row was made.
    return NextResponse.json(result, { headers: noStore });
  } catch (e) {
    return NextResponse.json(
      { error: 'The question could not be saved — nothing was stored.', detail: String(e.message || e).slice(0, 200) },
      { status: 500, headers: noStore },
    );
  }
}

export async function PATCH(request) {
  const body = await readBody(request);
  if (!body) return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });

  try {
    const result = await answerOpenQuestion({
      id: body.id,
      // Empty puts an answered question back to open — see answerOpenQuestion.
      answer: body.answer,
      machineId: machineFromCookie(request),
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400, headers: noStore });
    return NextResponse.json(result, { headers: noStore });
  } catch (e) {
    return NextResponse.json(
      { error: 'The answer could not be saved.', detail: String(e.message || e).slice(0, 200) },
      { status: 500, headers: noStore },
    );
  }
}

export async function DELETE(request) {
  const id = Number(new URL(request.url).searchParams.get('id')) || 0;
  try {
    const result = await deleteOpenQuestion(id);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400, headers: noStore });
    return NextResponse.json(result, { headers: noStore });
  } catch (e) {
    return NextResponse.json(
      { error: 'The question could not be removed.', detail: String(e.message || e).slice(0, 200) },
      { status: 500, headers: noStore },
    );
  }
}
