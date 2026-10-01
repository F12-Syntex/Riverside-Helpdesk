// The open-questions store: read it, add to it, answer one.
//
// The rules about what belongs here are in ./gaps.mjs, which has no database in
// it and is tested directly. This file is the half that talks to Postgres.
//
// TWO WRITERS, ONE TABLE. A member of staff asking through /questions, and the
// question log noticing that a turn could not be answered (recordQuestion, in
// ./log.js). Both come through `addOpenQuestion`, both dedupe on the normalised
// wording, and neither is ever allowed to throw into the path that called it:
// asking a question that cannot be filed must still leave the asker with an
// answer, and a turn that cannot file its gap is still a turn that answered.
import { ensureNotebookSchema, ensureOpenQuestionsSchema, getSql } from '../db.js';
import { isMachineId } from '../audit/machine.js';
import { ORIGINS, STATUSES, isCollectableQuestion } from './gaps.mjs';
import { cleanPoints, cleanTitle, questionKey, rowPoints } from './template.mjs';
import { isQuestionAnchor, questionContext, stripQuestionMarks } from '../notebook/questions.mjs';

const MAX = { question: 400, detail: 2000, answer: 4000, quote: 600 };
const MAX_ROWS = 200;

const cut = (value, max) => String(value == null ? '' : value).trim().slice(0, max);
const machine = (id) => (isMachineId(id) ? id : '');

/**
 * Add a question, or record that an existing one was asked again.
 *
 * @param {object}  entry
 * @param {string}  entry.question     as it was typed
 * @param {string}  [entry.origin]     'asked' (default) or 'assistant'
 * @param {string}  [entry.reason]     for an 'assistant' row, why it could not answer
 * @param {string}  [entry.detail]     anything the asker added
 * @param {string}  [entry.title]      the template's short title
 * @param {string[]|string} [entry.points]  the template's context points, word for word
 * @param {boolean} [entry.formatted]  asked in the template's shape
 * @param {string}  [entry.turnId]     the turn it came off
 * @param {string}  [entry.machineId]  which computer
 * @returns {Promise<{ok:boolean, id?:number, repeat?:boolean, error?:string}>}
 */
export async function addOpenQuestion(entry = {}) {
  const question = cut(entry.question, MAX.question);
  const title = cleanTitle(entry.title);
  const points = cleanPoints(entry.points);
  // The title is part of what a question is: "Which clinic type?" about chest
  // pain and about diabetes are two questions.
  const key = questionKey({ title, question });
  if (!question || !key) return { ok: false, error: 'There is no question there.' };
  if (!isCollectableQuestion(question)) {
    return { ok: false, error: 'That is longer than a question — put the gap in a line or two.' };
  }

  // A Notebook question has its own way in (addNotebookQuestion): it carries
  // its page and anchor, and must never be merged with one worded the same.
  const origin = ORIGINS.includes(entry.origin) && entry.origin !== 'notebook' ? entry.origin : 'asked';
  const reason = cut(entry.reason, 40);

  await ensureOpenQuestionsSchema();
  const sql = getSql();

  // Asked again: the count goes up and the row comes back to the top of the
  // list, and everything already written on it — who answered it, what they
  // said — is left exactly as it was. The one thing that does change is the
  // reason: a row first raised by hand and now hit by the assistant should say
  // that the assistant hit it, because that is the newer fact about it.
  const rows = await sql`
    INSERT INTO open_questions
      (question, question_key, origin, reason, turn_id, machine_id, detail, title, points, formatted_at)
    VALUES (
      ${question}, ${key}, ${origin}, ${reason},
      ${cut(entry.turnId, 40)}, ${machine(entry.machineId)}, ${cut(entry.detail, MAX.detail)},
      ${title}, ${JSON.stringify(points)}::jsonb, ${entry.formatted ? new Date() : null}
    )
    ON CONFLICT (question_key) DO UPDATE
       SET asked_count = open_questions.asked_count + 1,
           last_at     = now(),
           reason      = CASE WHEN ${reason} = '' THEN open_questions.reason ELSE ${reason} END,
           detail      = CASE WHEN open_questions.detail = ''
                              THEN ${cut(entry.detail, MAX.detail)} ELSE open_questions.detail END,
           points      = CASE WHEN open_questions.points = '[]'::jsonb
                              THEN ${JSON.stringify(points)}::jsonb ELSE open_questions.points END
    RETURNING id, asked_count
  `;

  const row = rows[0] || {};
  return { ok: true, id: row.id, repeat: (row.asked_count || 1) > 1 };
}

/**
 * The same, for a caller that must not be able to fail — the question log.
 *
 * Swallows everything, including a missing DATABASE_URL, and says nothing to
 * the reader: the turn it hangs off has already answered, or already failed,
 * and neither outcome should change because a row could not be filed.
 */
export async function noteUnansweredQuestion(entry = {}) {
  try {
    await addOpenQuestion({ ...entry, origin: 'assistant' });
  } catch (e) {
    console.warn('[questions] could not file an unanswered question:', String(e).slice(0, 200));
  }
}

/**
 * The list, newest activity first.
 *
 * @param {object} [options]
 * @param {string} [options.status] 'open' | 'answered' | '' for both
 * @param {string} [options.origin] 'asked' | 'assistant' | 'notebook' | '' for all
 * @param {number} [options.limit]
 */
export async function listOpenQuestions({ status = '', origin = '', limit = 100 } = {}) {
  await ensureOpenQuestionsSchema();
  const sql = getSql();
  const wantStatus = STATUSES.includes(status) ? status : '';
  const wantOrigin = ORIGINS.includes(origin) ? origin : '';
  const take = Math.min(Math.max(Math.trunc(Number(limit) || 100), 1), MAX_ROWS);

  // The page a Notebook question is on, by its current title: the row keeps
  // the id, so a page renamed since still links, and a page deleted since
  // comes back with no title, which the list says.
  await ensureNotebookSchema();
  const rows = await sql`
    SELECT q.id, q.question, q.question_key AS "key", q.origin, q.reason, q.turn_id AS "turnId",
           q.machine_id AS "machineId", q.detail, q.status, q.answer,
           q.answered_by AS "answeredBy", q.answered_at AS "answeredAt",
           q.asked_count AS "askedCount", q.last_at AS "lastAt", q.at,
           q.note_id AS "noteId", q.anchor, q.quote, q.written_at AS "writtenAt",
           q.title, q.points, q.formatted_at AS "formattedAt",
           n.title AS "noteTitle", n.body AS "noteBody"
    FROM open_questions q
    LEFT JOIN notes n ON n.id = q.note_id
    WHERE (${wantStatus} = '' OR q.status = ${wantStatus})
      AND (${wantOrigin} = '' OR q.origin = ${wantOrigin})
    ORDER BY q.last_at DESC, q.id DESC
    LIMIT ${take}
  `;

  // CONTEXT, so a question can be answered without going to find it: the
  // words round a Notebook question. The page itself is not sent - only the
  // paragraph the question is in.
  for (const row of rows) {
    row.points = rowPoints(row.points);
    row.context = row.origin === 'notebook' ? questionContext(row.noteBody, row.anchor) : null;
    delete row.noteBody;
  }
  const counts = await sql`
    SELECT status, origin, count(*)::int AS n
    FROM open_questions
    GROUP BY status, origin
  `;

  return { rows, counts };
}

/**
 * Write the answer to one question, or put an answered one back to open.
 *
 * An empty answer reopens it rather than storing a blank: "I was wrong, this
 * is not settled" is a thing that happens, and deleting the row would take the
 * question with it.
 */
export async function answerOpenQuestion({ id = 0, answer = '', machineId = '' } = {}) {
  const rowId = Math.trunc(Number(id) || 0);
  if (rowId <= 0) return { ok: false, error: 'Which question?' };
  const text = cut(answer, MAX.answer);

  await ensureOpenQuestionsSchema();
  const sql = getSql();
  const rows = text
    ? await sql`
        UPDATE open_questions
           SET answer = ${text}, status = 'answered',
               answered_by = ${machine(machineId)}, answered_at = now()
         WHERE id = ${rowId}
        RETURNING id
      `
    : await sql`
        UPDATE open_questions
           SET answer = '', status = 'open', answered_by = '', answered_at = NULL, written_at = NULL
         WHERE id = ${rowId}
        RETURNING id
      `;

  if (!rows.length) return { ok: false, error: 'That question is no longer there.' };
  return { ok: true, id: rowId, status: text ? 'answered' : 'open' };
}

/**
 * Remove one question.
 *
 * For the row that should never have been there — a test, a duplicate the
 * wording check did not catch, a question typed into the wrong box. Answering
 * is what closes a real one; this is not the way to close it.
 */
export async function deleteOpenQuestion(id = 0) {
  const rowId = Math.trunc(Number(id) || 0);
  if (rowId <= 0) return { ok: false, error: 'Which question?' };
  await ensureOpenQuestionsSchema();
  const sql = getSql();
  const rows = await sql`DELETE FROM open_questions WHERE id = ${rowId} RETURNING id, note_id AS "noteId", anchor`;
  if (!rows.length) return { ok: false, error: 'That question is no longer there.' };
  await unmarkPages(sql, rows);
  return { ok: true, id: rowId };
}

/**
 * Take the markers of deleted Notebook questions off their pages, words kept.
 *
 * A marker with no question behind it draws nothing, but it is still in the
 * page - and it used to stop anybody asking about those words again. The
 * page's revision time is left alone: the text a reader sees, and the text
 * the assistant reads, are exactly what they were. Best-effort - the
 * question is already gone, and the editor ignores a marker it has no
 * question for in any case.
 */
async function unmarkPages(sql, rows) {
  const byNote = new Map();
  for (const r of rows) {
    if (!r.noteId || !isQuestionAnchor(r.anchor)) continue;
    if (!byNote.has(r.noteId)) byNote.set(r.noteId, []);
    byNote.get(r.noteId).push(r.anchor);
  }
  for (const [noteId, anchors] of byNote) {
    try {
      const found = await sql`SELECT body FROM notes WHERE id = ${noteId}`;
      if (!found[0]) continue;
      const body = String(found[0].body || '');
      const next = stripQuestionMarks(body, anchors);
      if (next !== body) await sql`UPDATE notes SET body = ${next} WHERE id = ${noteId} AND body = ${body}`;
    } catch (e) {
      console.warn('[questions] could not take a marker off note ' + noteId + ':', String(e).slice(0, 160));
    }
  }
}

/* ----------------------- Questions on a Notebook page ----------------------- *
 * Asked by highlighting words on a page. The page carries only a marker round
 * those words (lib/notebook/questions.mjs); the question, and the answer when
 * it comes, are rows here like every other, so they are on /questions too.  */

/**
 * Ask a question about some words on a page.
 *
 * @param {object} entry
 * @param {number} entry.noteId     the page
 * @param {string} entry.anchor     the marker's id, minted by the editor
 * @param {string} entry.quote      the words highlighted, as plain text
 * @param {string} entry.question   what the asker wants to know
 * @param {string} [entry.machineId]
 */
export async function addNotebookQuestion(entry = {}) {
  const noteId = Math.trunc(Number(entry.noteId) || 0);
  const anchor = String(entry.anchor || '');
  const question = cut(entry.question, MAX.question);
  if (noteId <= 0) return { ok: false, error: 'Which page?' };
  if (!isQuestionAnchor(anchor)) return { ok: false, error: 'That highlight could not be marked.' };
  if (!question) return { ok: false, error: 'There is no question there.' };

  await ensureOpenQuestionsSchema();
  const sql = getSql();
  const rows = await sql`
    INSERT INTO open_questions (question, question_key, origin, machine_id, note_id, anchor, quote)
    VALUES (${question}, ${'notebook:' + anchor}, 'notebook', ${machine(entry.machineId)},
            ${noteId}, ${anchor}, ${cut(entry.quote, MAX.quote)})
    ON CONFLICT (question_key) DO NOTHING
    RETURNING id, question, status, answer, answered_by AS "answeredBy", answered_at AS "answeredAt",
              machine_id AS "machineId", at, note_id AS "noteId", anchor, quote, written_at AS "writtenAt"
  `;
  if (!rows.length) return { ok: false, error: 'That highlight already has a question on it.' };
  return { ok: true, row: rows[0] };
}

/** Every question asked on one page, oldest first - the order they were asked in. */
export async function listNotebookQuestions(noteId) {
  const id = Math.trunc(Number(noteId) || 0);
  if (id <= 0) return [];
  await ensureOpenQuestionsSchema();
  const sql = getSql();
  return sql`
    SELECT id, question, status, answer, answered_by AS "answeredBy", answered_at AS "answeredAt",
              machine_id AS "machineId", at, note_id AS "noteId", anchor, quote, written_at AS "writtenAt"
    FROM open_questions
    WHERE origin = 'notebook' AND note_id = ${id}
    ORDER BY at ASC, id ASC
  `;
}

/**
 * Record that Format with AI wrote these answers into their page.
 *
 * Only answered questions on that page are touched: the marker came off with
 * the answer worked in, and this is the row saying so.
 */
export async function markNotebookAnswersWritten({ noteId = 0, ids = [] } = {}) {
  const note = Math.trunc(Number(noteId) || 0);
  const want = (Array.isArray(ids) ? ids : []).map((v) => Math.trunc(Number(v) || 0)).filter((v) => v > 0).slice(0, 200);
  if (note <= 0 || !want.length) return { ok: true, ids: [] };
  await ensureOpenQuestionsSchema();
  const sql = getSql();
  const rows = await sql`
    UPDATE open_questions SET written_at = now()
     WHERE id = ANY(${want}) AND note_id = ${note} AND origin = 'notebook' AND status = 'answered'
    RETURNING id
  `;
  return { ok: true, ids: rows.map((r) => r.id) };
}

/**
 * Clear the answered questions off the list - all of them, or those from one
 * origin. Answers already written into the Notebook are in the Notebook; this
 * removes only the rows.
 */
export async function clearAnsweredQuestions({ origin = '' } = {}) {
  const want = ORIGINS.includes(origin) ? origin : '';
  await ensureOpenQuestionsSchema();
  const sql = getSql();
  const rows = await sql`
    DELETE FROM open_questions
     WHERE status = 'answered' AND (${want} = '' OR origin = ${want})
    RETURNING id, note_id AS "noteId", anchor
  `;
  await unmarkPages(sql, rows);
  return { ok: true, removed: rows.length };
}

/**
 * The answered questions not yet written into the Notebook, oldest answer
 * first, so a run that stops at the cap leaves the newest for the next one.
 */
export async function listUnwrittenAnswers({ limit = 40 } = {}) {
  await ensureOpenQuestionsSchema();
  const sql = getSql();
  const take = Math.min(Math.max(Math.trunc(Number(limit) || 40), 1), MAX_ROWS);
  const rows = await sql`
    SELECT id, question, answer, origin, note_id AS "noteId", anchor, quote, title, points
      FROM open_questions
     WHERE status = 'answered' AND written_at IS NULL AND btrim(answer) <> ''
     ORDER BY answered_at ASC NULLS FIRST, id ASC
     LIMIT ${take + 1}
  `;
  for (const r of rows) r.points = rowPoints(r.points);
  return { rows: rows.slice(0, take), more: rows.length > take };
}

/** Record that these answered questions are now written into the Notebook. */
export async function markQuestionsWritten(ids = []) {
  const want = (Array.isArray(ids) ? ids : []).map((v) => Math.trunc(Number(v) || 0)).filter((v) => v > 0).slice(0, MAX_ROWS);
  if (!want.length) return { ok: true, ids: [] };
  await ensureOpenQuestionsSchema();
  const sql = getSql();
  const rows = await sql`
    UPDATE open_questions SET written_at = now()
     WHERE id = ANY(${want}) AND status = 'answered'
    RETURNING id
  `;
  return { ok: true, ids: rows.map((r) => r.id) };
}

/* ------------------------------ The template ------------------------------ *
 * Older questions are a question and a free note. The AI tidy-up on
 * /questions (app/api/questions/reformat) proposes each in the template's
 * shape; these are its two database halves.                                */

/** Questions not yet in the template, oldest first, with what the prompt needs. */
export async function listUnformattedQuestions({ limit = 40 } = {}) {
  await ensureOpenQuestionsSchema();
  await ensureNotebookSchema();
  const sql = getSql();
  const take = Math.min(Math.max(Math.trunc(Number(limit) || 40), 1), MAX_ROWS);
  const rows = await sql`
    SELECT q.id, q.question, q.detail, q.quote, q.title, q.points, n.title AS "noteTitle"
      FROM open_questions q LEFT JOIN notes n ON n.id = q.note_id
     WHERE q.formatted_at IS NULL
     ORDER BY q.at ASC, q.id ASC
     LIMIT ${take + 1}
  `;
  const count = await sql`SELECT count(*)::int AS n FROM open_questions WHERE formatted_at IS NULL`;
  return { rows: rows.slice(0, take), more: rows.length > take, total: count[0] ? count[0].n : rows.length };
}

/**
 * Save tidied questions. The note moves into the points, so it is cleared -
 * unless no points came back, when it stays rather than be lost. The dedupe
 * key is left as it was: it is how the row was first filed.
 */
export async function saveFormattedQuestions(items = [], { skipIds = [] } = {}) {
  await ensureOpenQuestionsSchema();
  const sql = getSql();
  let saved = 0;
  for (const item of (Array.isArray(items) ? items : []).slice(0, MAX_ROWS)) {
    const id = Math.trunc(Number(item && item.id) || 0);
    const question = cut(item && item.question, MAX.question);
    if (id <= 0 || !question) continue;
    const points = cleanPoints(item.points);
    const rows = await sql`
      UPDATE open_questions
         SET title = ${cleanTitle(item.title)}, points = ${JSON.stringify(points)}::jsonb, question = ${question},
             detail = CASE WHEN ${points.length} > 0 THEN '' ELSE detail END, formatted_at = now()
       WHERE id = ${id}
      RETURNING id
    `;
    saved += rows.length;
  }
  // Ones the reader looked at and left as they were: do not offer them again.
  const skip = (Array.isArray(skipIds) ? skipIds : []).map((v) => Math.trunc(Number(v) || 0)).filter((v) => v > 0).slice(0, MAX_ROWS);
  if (skip.length) await sql`UPDATE open_questions SET formatted_at = now() WHERE id = ANY(${skip}) AND formatted_at IS NULL`;
  return { ok: true, saved };
}
