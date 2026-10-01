// Questions asked about words on a Notebook page.
//
//   GET    /api/notebook/questions?noteId=12   every question on that page
//   POST   /api/notebook/questions             ask one — { noteId, anchor, quote, question }
//   POST   /api/notebook/questions             { action: 'written', noteId, ids } — Format
//                                              with AI wrote these answers into the page
//   PATCH  /api/notebook/questions             answer one — { id, answer } ('' reopens it)
//   DELETE /api/notebook/questions?id=40       remove one
//
// The rows are the open-questions table's (lib/questions/open.js), so every
// question asked here is also on /questions, and an answer written in either
// place is the same answer. The page itself carries only a marker round the
// words (lib/notebook/questions.mjs), written by the editor's own autosave.
import { NextResponse } from 'next/server';
import {
  addNotebookQuestion, answerOpenQuestion, deleteOpenQuestion, listNotebookQuestions, markNotebookAnswersWritten,
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

function failed(message, e, status = 500) {
  return NextResponse.json({ error: message, detail: String((e && e.message) || e || '').slice(0, 200) }, { status, headers: noStore });
}

export async function GET(request) {
  const noteId = Number(new URL(request.url).searchParams.get('noteId')) || 0;
  try {
    return NextResponse.json({ rows: await listNotebookQuestions(noteId) }, { headers: noStore });
  } catch (e) {
    return failed('Could not read the questions on this page.', e);
  }
}

export async function POST(request) {
  const body = await readBody(request);
  if (!body) return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  try {
    const result = body.action === 'written'
      ? await markNotebookAnswersWritten({ noteId: body.noteId, ids: body.ids })
      : await addNotebookQuestion({
        noteId: body.noteId, anchor: body.anchor, quote: body.quote, question: body.question,
        machineId: machineFromCookie(request),
      });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400, headers: noStore });
    return NextResponse.json(result, { headers: noStore });
  } catch (e) {
    return failed('The question could not be saved — nothing was stored.', e);
  }
}

export async function PATCH(request) {
  const body = await readBody(request);
  if (!body) return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  try {
    const result = await answerOpenQuestion({ id: body.id, answer: body.answer, machineId: machineFromCookie(request) });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400, headers: noStore });
    return NextResponse.json(result, { headers: noStore });
  } catch (e) {
    return failed('The answer could not be saved.', e);
  }
}

export async function DELETE(request) {
  const id = Number(new URL(request.url).searchParams.get('id')) || 0;
  try {
    const result = await deleteOpenQuestion(id);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400, headers: noStore });
    return NextResponse.json(result, { headers: noStore });
  } catch (e) {
    return failed('The question could not be removed.', e);
  }
}
