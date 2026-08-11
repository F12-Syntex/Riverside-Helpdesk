// The question log: what was asked, and what the assistant answered.
//
// Written by /api/agent as each turn finishes, read by /stats. One row per
// answer, so "what did it say to that?" still has an answer months later, when
// the Notebook page it was built from has been rewritten twice.
//
// Best-effort throughout, like the audit log and the usage rows: a turn that
// cannot write its log row is still a turn that answered the question. Nothing
// here is allowed to throw into the answer path.
import { ensureFeedbackSchema, ensureQuestionLogSchema, getSql } from '../db.js';
import { isMachineId } from '../audit/machine.js';
import { VERDICTS } from '../feedback.mjs';

// How an answer came about. Three, because three is what somebody monitoring
// output has to tell apart: the practice's own material, the model writing from
// general knowledge, and a turn that fell over.
export const OUTCOMES = ['template', 'prose', 'failed'];

// The verdicts that mean the answer was good, as a comma-separated list for
// Postgres, so the two halves cannot drift apart.
const GOOD_VERDICTS = VERDICTS.filter((v) => v.good).map((v) => v.id).join(',');

const MAX = { question: 2000, answer: 20000, source: 400, template: 60, model: 120, error: 300 };
const MAX_ROWS = 200;

const cut = (value, max) => String(value == null ? '' : value).trim().slice(0, max);

/**
 * Record one finished turn. Never throws.
 *
 * @param {object} turn
 * @param {string} turn.turnId      the id the answer carries, so a verdict can join to it
 * @param {string} turn.machineId   from the machine cookie; '' when there isn't one
 * @param {string} turn.question    what was asked
 * @param {string} turn.outcome     one of OUTCOMES
 * @param {string} [turn.template]  which template answered it ('notebook', 'referral', …)
 * @param {string} [turn.source]    what it was built from — Notebook page titles
 * @param {string} [turn.answer]    the answer as text (see ./flatten.mjs)
 * @param {string} [turn.model]     the model that ran
 * @param {number} [turn.durationMs]
 * @param {number} [turn.images]
 * @param {number} [turn.attachments]
 * @param {string} [turn.error]
 */
export async function recordQuestion(turn = {}) {
  const question = cut(turn.question, MAX.question);
  if (!question) return;
  const outcome = OUTCOMES.includes(turn.outcome) ? turn.outcome : 'prose';
  const machineId = isMachineId(turn.machineId) ? turn.machineId : '';
  const duration = Number.isFinite(Number(turn.durationMs))
    ? Math.max(0, Math.trunc(Number(turn.durationMs)))
    : null;

  try {
    await ensureQuestionLogSchema();
    const sql = getSql();
    await sql`
      INSERT INTO question_log
        (turn_id, machine_id, question, outcome, template, source, answer, model, duration_ms, images, attachments, error)
      VALUES (
        ${cut(turn.turnId, 40)}, ${machineId}, ${question}, ${outcome},
        ${cut(turn.template, MAX.template)}, ${cut(turn.source, MAX.source)},
        ${cut(turn.answer, MAX.answer)}, ${cut(turn.model, MAX.model)},
        ${duration}, ${Math.max(0, Math.trunc(Number(turn.images) || 0))},
        ${Math.max(0, Math.trunc(Number(turn.attachments) || 0))}, ${cut(turn.error, MAX.error)}
      )
    `;
  } catch (e) {
    console.warn('[questions] could not record a turn:', String(e).slice(0, 200));
  }
}

// Filters travel as plain strings for the same reason the audit log's do: the
// HTTP driver sends every parameter untyped, and a bare NULL leaves Postgres
// with nothing to infer a type from. An empty string means "no filter".
function filterArgs({ machineId = '', outcome = '', rated = '', search = '', since = null } = {}) {
  return {
    machine: String(machineId || ''),
    outcome: OUTCOMES.includes(outcome) ? outcome : '',
    rated: ['any', 'good', 'bad'].includes(rated) ? rated : '',
    search: String(search || '').trim().slice(0, 120),
    since: since ? new Date(since).toISOString() : '',
  };
}

/**
 * A page of the log, newest first, each row carrying the verdict left on it.
 *
 * The verdict joins on the turn id, which is exact. Rows from before turn ids
 * existed fall back to matching the wording on the same machine within two hours
 * of the answer — close enough for the handful of old rows, and never reached
 * once a turn id is present on both sides.
 *
 * Paged by an (at, id) cursor rather than an offset, so rows written while the
 * page is being read cannot push a row into being shown twice.
 */
export async function listQuestions(options = {}) {
  // Both, because the verdict is joined in here: on a fresh install the feedback
  // table exists but without turn_id until its own schema step has run, and the
  // join names that column.
  await Promise.all([ensureQuestionLogSchema(), ensureFeedbackSchema()]);
  const sql = getSql();
  const f = filterArgs(options);
  const beforeId = Math.max(0, Math.trunc(Number(options.beforeId) || 0));
  const beforeAt = options.beforeAt ? new Date(options.beforeAt).toISOString() : '';
  const limit = Math.min(Math.max(Math.trunc(Number(options.limit) || 40), 1), MAX_ROWS);
  const like = '%' + f.search.replace(/[%_\\]/g, (c) => '\\' + c) + '%';

  return sql`
    SELECT
      q.id, q.turn_id AS "turnId", q.machine_id AS "machineId", q.question, q.outcome,
      q.template, q.source, q.answer, q.model, q.duration_ms AS "durationMs",
      q.images, q.attachments, q.error, q.at,
      v.verdict, v.at AS "verdictAt"
    FROM question_log q
    LEFT JOIN LATERAL (
      SELECT f.verdict, f.at
      FROM answer_feedback f
      WHERE (q.turn_id <> '' AND f.turn_id = q.turn_id)
         OR (f.turn_id = '' AND f.question = q.question
             AND (f.machine_id = q.machine_id OR f.machine_id = '' OR q.machine_id = '')
             AND f.at >= q.at AND f.at < q.at + interval '2 hours')
      ORDER BY f.at
      LIMIT 1
    ) v ON true
    WHERE (${f.machine} = '' OR q.machine_id = ${f.machine})
      AND (${f.outcome} = '' OR q.outcome = ${f.outcome})
      AND (${f.since} = '' OR q.at >= nullif(${f.since}, '')::timestamptz)
      AND (${beforeAt} = '' OR (q.at, q.id) < (nullif(${beforeAt}, '')::timestamptz, ${beforeId}))
      AND (${f.search} = '' OR q.question ILIKE ${like} OR q.answer ILIKE ${like} OR q.source ILIKE ${like})
      AND (
        ${f.rated} = ''
        OR (${f.rated} = 'any'  AND v.verdict IS NOT NULL)
        OR (${f.rated} = 'good' AND v.verdict = ANY(string_to_array(${GOOD_VERDICTS}, ',')))
        OR (${f.rated} = 'bad'  AND v.verdict IS NOT NULL
            AND NOT (v.verdict = ANY(string_to_array(${GOOD_VERDICTS}, ','))))
      )
    ORDER BY q.at DESC, q.id DESC
    LIMIT ${limit}
  `;
}

/**
 * The headline numbers for the window: how many questions, how they were
 * answered, how they were judged, and which templates and questions recur.
 *
 * Deliberately not filtered by the search box or the rated filter — the tiles
 * describe the window, and a total that moved every time somebody typed in the
 * search box would be a worse number, not a more precise one.
 */
export async function summariseQuestions({ machineId = '', since = null } = {}) {
  await Promise.all([ensureQuestionLogSchema(), ensureFeedbackSchema()]);
  const sql = getSql();
  const f = filterArgs({ machineId, since });

  const totals = await sql`
    SELECT
      count(*)::int                                        AS questions,
      count(*) FILTER (WHERE outcome = 'template')::int    AS "fromPractice",
      count(*) FILTER (WHERE outcome = 'prose')::int       AS "fromModel",
      count(*) FILTER (WHERE outcome = 'failed')::int      AS failed,
      count(DISTINCT machine_id) FILTER (WHERE machine_id <> '')::int AS machines,
      avg(duration_ms)::float                              AS "averageMs",
      max(at)                                              AS "lastAt"
    FROM question_log
    WHERE (${f.machine} = '' OR machine_id = ${f.machine})
      AND (${f.since} = '' OR at >= nullif(${f.since}, '')::timestamptz)
  `;

  // Verdicts on the answers given in this window, not verdicts left during it: a
  // button pressed this morning about yesterday's answer belongs to yesterday.
  const verdicts = await sql`
    SELECT v.verdict, count(*)::int AS total
    FROM question_log q
    JOIN LATERAL (
      SELECT f.verdict
      FROM answer_feedback f
      WHERE (q.turn_id <> '' AND f.turn_id = q.turn_id)
         OR (f.turn_id = '' AND f.question = q.question
             AND (f.machine_id = q.machine_id OR f.machine_id = '' OR q.machine_id = '')
             AND f.at >= q.at AND f.at < q.at + interval '2 hours')
      ORDER BY f.at
      LIMIT 1
    ) v ON true
    WHERE (${f.machine} = '' OR q.machine_id = ${f.machine})
      AND (${f.since} = '' OR q.at >= nullif(${f.since}, '')::timestamptz)
    GROUP BY v.verdict
  `;

  const templates = await sql`
    SELECT coalesce(nullif(template, ''), 'no template') AS template, count(*)::int AS total
    FROM question_log
    WHERE (${f.machine} = '' OR machine_id = ${f.machine})
      AND (${f.since} = '' OR at >= nullif(${f.since}, '')::timestamptz)
    GROUP BY 1
    ORDER BY total DESC, 1
    LIMIT 8
  `;

  // The same question in slightly different words is a different row; grouping
  // on the wording as typed is honest about that rather than guessing at intent.
  const asked = await sql`
    SELECT min(question) AS question, count(*)::int AS total
    FROM question_log
    WHERE (${f.machine} = '' OR machine_id = ${f.machine})
      AND (${f.since} = '' OR at >= nullif(${f.since}, '')::timestamptz)
    GROUP BY lower(question)
    HAVING count(*) > 1
    ORDER BY total DESC, min(question)
    LIMIT 8
  `;

  return { ...totals[0], verdicts, templates, asked };
}
