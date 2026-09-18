// Learn a phrasing from a tap on a "which did you mean?" card.
//
// The router asked the question back with two or three Notebook pages as the
// options and the reader tapped one. That tap is a labelled example — this
// wording, this page, from a person — and it is worth more than anything the
// generator wrote, so it is kept as a trigger phrase with source = 'tap'.
//
// Fire-and-forget from the browser (app/_components/QaApp.jsx): the re-ask
// that answers the reader goes out regardless, and a failure here changes
// nothing about the turn. The target must be a page that exists — a stale
// card must not teach the router a page the practice has since deleted.
import { NextResponse } from 'next/server';
import { ensureNotebookSchema, getSql } from '@/lib/db';
import { addTapTrigger } from '@/lib/routing/triggers.mjs';
import { normaliseQuestion } from '@/lib/routing/normalise.mjs';
import { MIN_NORMALISED_CHARS } from '@/lib/routing/router.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStore = { 'Cache-Control': 'no-store' };
const TARGET = /^note:([A-Za-z0-9_-]{1,80})$/;
const MAX_QUESTION_CHARS = 400;

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400, headers: noStore });
  }
  const question = String(body?.question || '').trim().slice(0, MAX_QUESTION_CHARS);
  const target = String(body?.target || '').trim();
  const m = TARGET.exec(target);
  if (!m || normaliseQuestion(question).length < MIN_NORMALISED_CHARS) {
    return NextResponse.json({ ok: false, learned: false }, { headers: noStore });
  }
  try {
    await ensureNotebookSchema();
    const sql = getSql();
    const rows = await sql`SELECT id FROM notes WHERE id = ${m[1]} LIMIT 1`;
    if (!rows.length) return NextResponse.json({ ok: false, learned: false }, { headers: noStore });
    const id = await addTapTrigger({ targetKind: 'note', targetRef: target, phrase: question });
    return NextResponse.json({ ok: true, learned: !!id }, { headers: noStore });
  } catch (e) {
    console.warn('[routing] learn failed:', String(e).slice(0, 160));
    return NextResponse.json({ ok: false, learned: false }, { status: 500, headers: noStore });
  }
}