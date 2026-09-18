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
import { ensureOpenQuestionsSchema, getSql } from '../db.js';
import { isMachineId } from '../audit/machine.js';
import { ORIGINS, STATUSES, isCollectableQuestion, normaliseQuestion } from './gaps.mjs';

const MAX = { question: 400, detail: 2000, answer: 4000 };
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
 * @param {string}  [entry.turnId]     the turn it came off
 * @param {string}  [entry.machineId]  which computer
 * @returns {Promise<{ok:boolean, id?:number, repeat?:boolean, error?:string}>}
 */
export async function addOpenQuestion(entry = {}) {
  const question = cut(entry.question, MAX.question);
  const key = normaliseQuestion(question);
  if (!question || !key) return { ok: false, error: 'There is no question there.' };
  if (!isCollectableQuestion(question)) {
    return { ok: false, error: 'That is longer than a question — put the gap in a line or two.' };
  }

  const origin = ORIGINS.includes(entry.origin) ? entry.origin : 'asked';
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
      (question, question_key, origin, reason, turn_id, machine_id, detail)
    VALUES (
      ${question}, ${key}, ${origin}, ${reason},
      ${cut(entry.turnId, 40)}, ${machine(entry.machineId)}, ${cut(entry.detail, MAX.detail)}
    )
    ON CONFLICT (question_key) DO UPDATE
       SET asked_count = open_questions.asked_count + 1,
           last_at     = now(),
           reason      = CASE WHEN ${reason} = '' THEN open_questions.reason ELSE ${reason} END,
           detail      = CASE WHEN open_questions.detail = ''
                              THEN ${cut(entry.detail, MAX.detail)} ELSE open_questions.detail END
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
 * @param {string} [options.origin] 'asked' | 'assistant' | '' for both
 * @param {number} [options.limit]
 */
export async function listOpenQuestions({ status = '', origin = '', limit = 100 } = {}) {
  await ensureOpenQuestionsSchema();
  const sql = getSql();
  const wantStatus = STATUSES.includes(status) ? status : '';
  const wantOrigin = ORIGINS.includes(origin) ? origin : '';
  const take = Math.min(Math.max(Math.trunc(Number(limit) || 100), 1), MAX_ROWS);

  const rows = await sql`
    SELECT id, question, question_key AS "key", origin, reason, turn_id AS "turnId",
           machine_id AS "machineId", detail, status, answer,
           answered_by AS "answeredBy", answered_at AS "answeredAt",
           asked_count AS "askedCount", last_at AS "lastAt", at
    FROM open_questions
    WHERE (${wantStatus} = '' OR status = ${wantStatus})
      AND (${wantOrigin} = '' OR origin = ${wantOrigin})
    ORDER BY last_at DESC, id DESC
    LIMIT ${take}
  `;

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
           SET answer = '', status = 'open', answered_by = '', answered_at = NULL
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
  const rows = await sql`DELETE FROM open_questions WHERE id = ${rowId} RETURNING id`;
  if (!rows.length) return { ok: false, error: 'That question is no longer there.' };
  return { ok: true, id: rowId };
}
