// Reading and writing the activity audit log.
//
// Server-side half of the feature. The browser sends batches of events; this
// module labels them from the route registry, stores them and reads them back
// for /stats.
//
// One principle runs through the whole file: the log must never be the reason
// the app misbehaves. Every write is best-effort, bounded and swallowed by the
// caller — a full disk, a slow database or a malformed batch costs the practice
// a few missing audit rows, never an unanswered question.
import { ensureAuditSchema, getSql } from '../db.js';
import { routeTitle, routeTool, normalisePath } from '../routes.js';
import { KINDS, MAX_DETAIL, MAX_LABEL, trim } from './describe.js';
import { isMachineId, machineLabel, parseUserAgent } from './machine.js';

// Per request, so one runaway page cannot fill the table in an afternoon.
export const MAX_EVENTS_PER_BATCH = 100;

// How far out of step a browser's clock may be before the server stops
// believing it. Machines at a practice are not reliably time-synced, and a
// clock two days fast would sit at the top of the log for ever.
const MAX_CLOCK_SKEW_MS = 6 * 60 * 60 * 1000;

const MAX_ROWS = 500;

function clampTimestamp(value, now) {
  const at = value ? new Date(value) : null;
  if (!at || Number.isNaN(at.getTime())) return now;
  const drift = at.getTime() - now.getTime();
  if (drift > 60 * 1000 || drift < -MAX_CLOCK_SKEW_MS) return now;
  return at;
}

/**
 * Record what the browser says about the machine it is running on.
 *
 * The derived label is refreshed on every batch (a browser updates itself and
 * "Chrome 131" becomes "Chrome 132"), but a name someone has typed is never
 * touched — that is the practice's own label for the machine and only the
 * practice changes it.
 */
export async function upsertMachine(id, profile = {}) {
  if (!isMachineId(id)) throw new Error('That is not a machine id.');
  await ensureAuditSchema();
  const sql = getSql();

  const userAgent = trim(profile.userAgent, 400);
  const parsed = parseUserAgent(userAgent);
  const label = machineLabel(parsed);

  await sql`
    INSERT INTO audit_machines (id, label, os, browser, device, screen, timezone, language, user_agent, first_seen, last_seen)
    VALUES (
      ${id}, ${label}, ${parsed.os}, ${parsed.browser}, ${parsed.device},
      ${trim(profile.screen, 40)}, ${trim(profile.timezone, 60)}, ${trim(profile.language, 20)},
      ${userAgent}, now(), now()
    )
    ON CONFLICT (id) DO UPDATE SET
      label      = EXCLUDED.label,
      os         = EXCLUDED.os,
      browser    = EXCLUDED.browser,
      device     = EXCLUDED.device,
      screen     = COALESCE(NULLIF(EXCLUDED.screen, ''), audit_machines.screen),
      timezone   = COALESCE(NULLIF(EXCLUDED.timezone, ''), audit_machines.timezone),
      language   = COALESCE(NULLIF(EXCLUDED.language, ''), audit_machines.language),
      user_agent = COALESCE(NULLIF(EXCLUDED.user_agent, ''), audit_machines.user_agent),
      last_seen  = now()
  `;
  return id;
}

/**
 * Store a batch of events for one machine.
 *
 * Labelling happens here rather than in the browser: the route registry is the
 * server's, and denormalising the readable name onto the row means the log can
 * be read back without joining anything or re-deriving a title per row.
 *
 * @returns {Promise<number>} how many rows were written
 */
export async function recordEvents(machineId, events) {
  if (!isMachineId(machineId)) throw new Error('That is not a machine id.');
  if (!Array.isArray(events) || !events.length) return 0;
  await ensureAuditSchema();
  const sql = getSql();

  const now = new Date();
  const rows = events.slice(0, MAX_EVENTS_PER_BATCH).map((raw) => {
    const path = normalisePath(raw?.path);
    const kind = KINDS.includes(raw?.kind) ? raw.kind : 'action';
    // A pageview is labelled from the registry so the log reads in the
    // practice's own words ("Instant lookup"), not the browser's tab title.
    const label = kind === 'pageview'
      ? routeTitle(path) || trim(raw?.label, MAX_LABEL)
      : trim(raw?.label, MAX_LABEL);
    const status = Number.isFinite(Number(raw?.status)) ? Math.trunc(Number(raw.status)) : null;
    const duration = Number.isFinite(Number(raw?.durationMs)) ? Math.max(0, Math.trunc(Number(raw.durationMs))) : null;
    return {
      session_id: trim(raw?.sessionId, 40),
      kind,
      tool: trim(raw?.tool || routeTool(path), 60),
      path,
      label: label || path,
      detail: trim(raw?.detail, MAX_DETAIL),
      method: trim(raw?.method, 10).toUpperCase(),
      status: status !== null && status >= 0 && status < 1000 ? status : null,
      duration_ms: duration !== null && duration < 86_400_000 ? duration : null,
      at: clampTimestamp(raw?.at, now).toISOString(),
    };
  });

  // One round trip whatever the batch size: the rows go over as a single jsonb
  // parameter and Postgres expands them.
  await sql`
    INSERT INTO audit_events (machine_id, session_id, kind, tool, path, label, detail, method, status, duration_ms, at)
    SELECT ${machineId}, e.session_id, e.kind, e.tool, e.path, e.label, e.detail, e.method, e.status, e.duration_ms, e.at
    FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) AS e(
      session_id text, kind text, tool text, path text, label text, detail text,
      method text, status integer, duration_ms integer, at timestamptz
    )
  `;
  await sql`
    UPDATE audit_machines
    SET events = events + ${rows.length}, last_seen = GREATEST(last_seen, now())
    WHERE id = ${machineId}
  `;
  return rows.length;
}

// The practice's own name for a machine ("Reception PC 1"). Blank clears it and
// the machine falls back to its short code.
export async function renameMachine(id, name) {
  if (!isMachineId(id)) throw new Error('That is not a machine id.');
  await ensureAuditSchema();
  const sql = getSql();
  const rows = await sql`
    UPDATE audit_machines SET name = ${trim(name, 60)} WHERE id = ${id}
    RETURNING id, name
  `;
  if (!rows.length) throw new Error('That machine has not been seen before.');
  return rows[0];
}

// Every machine that has ever used the app, most recently seen first, each with
// the part of the app it is used for most.
export async function listMachines() {
  await ensureAuditSchema();
  const sql = getSql();
  return sql`
    SELECT
      m.id, m.name, m.label, m.os, m.browser, m.device, m.screen, m.timezone, m.language,
      m.events,
      m.first_seen AS "firstSeen",
      m.last_seen  AS "lastSeen",
      (SELECT e.tool FROM audit_events e
        WHERE e.machine_id = m.id AND e.tool <> ''
        GROUP BY e.tool ORDER BY count(*) DESC, max(e.at) DESC LIMIT 1) AS "topTool"
    FROM audit_machines m
    ORDER BY m.last_seen DESC
  `;
}

// Filters travel as plain strings rather than as nulls and arrays: the HTTP
// driver sends every parameter untyped, and a bare NULL or a JS array in a
// comparison leaves Postgres with nothing to infer a type from. An empty string
// means "no filter" throughout.
function filterArgs({ machineId = '', kinds = [], search = '', since = null } = {}) {
  return {
    machine: String(machineId || ''),
    kinds: (Array.isArray(kinds) ? kinds : []).filter((k) => KINDS.includes(k)).join(','),
    search: String(search || '').trim().slice(0, 120),
    since: since ? new Date(since).toISOString() : '',
  };
}

/**
 * A page of the log, newest first.
 *
 * Ordered by when things HAPPENED, not by when they were written down. Those
 * are not the same: events are batched in the browser and a tab that was
 * offline, asleep or simply left open flushes a run of older events long after
 * newer ones have been stored. Ordering by id would scatter those through the
 * log and hand the page two separate runs of the same day to draw.
 *
 * Paged by a cursor rather than an offset, because the log grows while it is
 * being read and an offset would show the same row twice as new events push the
 * page along. The cursor is (at, id) — the timestamp for the order and the id to
 * break ties between events recorded in the same millisecond — compared row-wise
 * so it matches the (at DESC, id DESC) index exactly.
 */
export async function listEvents(options = {}) {
  await ensureAuditSchema();
  const sql = getSql();
  const f = filterArgs(options);
  const beforeId = Math.max(0, Math.trunc(Number(options.beforeId) || 0));
  const beforeAt = options.beforeAt ? new Date(options.beforeAt).toISOString() : '';
  const limit = Math.min(Math.max(Math.trunc(Number(options.limit) || 100), 1), MAX_ROWS);
  const like = '%' + f.search.replace(/[%_\\]/g, (c) => '\\' + c) + '%';

  return sql`
    SELECT
      e.id, e.machine_id AS "machineId", e.session_id AS "sessionId", e.kind, e.tool,
      e.path, e.label, e.detail, e.method, e.status, e.duration_ms AS "durationMs", e.at
    FROM audit_events e
    WHERE (${f.machine} = '' OR e.machine_id = ${f.machine})
      AND (${f.kinds} = '' OR e.kind = ANY(string_to_array(${f.kinds}, ',')))
      AND (${f.since} = '' OR e.at >= nullif(${f.since}, '')::timestamptz)
      AND (${beforeAt} = '' OR (e.at, e.id) < (nullif(${beforeAt}, '')::timestamptz, ${beforeId}))
      AND (${f.search} = '' OR e.label ILIKE ${like} OR e.detail ILIKE ${like} OR e.path ILIKE ${like})
    ORDER BY e.at DESC, e.id DESC
    LIMIT ${limit}
  `;
}

/**
 * The headline numbers and the activity chart behind them.
 *
 * `buckets` is one row per day (or per hour over a single day) covering the
 * whole window including the quiet ones, so the chart has no gaps to guess at.
 */
export async function summarise({ machineId = '', since = null, hourly = false } = {}) {
  await ensureAuditSchema();
  const sql = getSql();
  const f = filterArgs({ machineId, since });
  // Hourly buckets only make sense over a window with a start.
  const byHour = hourly && !!f.since;

  const totals = await sql`
    SELECT
      count(*)::int                                    AS events,
      count(DISTINCT machine_id)::int                  AS machines,
      count(*) FILTER (WHERE kind = 'pageview')::int   AS pageviews,
      count(*) FILTER (WHERE kind = 'query')::int      AS queries,
      count(*) FILTER (WHERE kind = 'action')::int     AS actions,
      count(*) FILTER (WHERE kind = 'error')::int      AS errors,
      count(DISTINCT session_id) FILTER (WHERE session_id <> '')::int AS visits,
      min(at) AS "firstAt",
      max(at) AS "lastAt"
    FROM audit_events
    WHERE (${f.machine} = '' OR machine_id = ${f.machine})
      AND (${f.since} = '' OR at >= nullif(${f.since}, '')::timestamptz)
  `;

  // generate_series fills the quiet hours and days back in, so the chart never
  // draws a busy Monday next to a busy Wednesday as though they were adjacent.
  const buckets = byHour
    ? await sql`
        SELECT g.bucket AS bucket, coalesce(e.total, 0)::int AS total
        FROM generate_series(
          date_trunc('hour', ${f.since}::timestamptz), date_trunc('hour', now()), interval '1 hour'
        ) AS g(bucket)
        LEFT JOIN (
          SELECT date_trunc('hour', at) AS bucket, count(*) AS total
          FROM audit_events
          WHERE at >= ${f.since}::timestamptz
            AND (${f.machine} = '' OR machine_id = ${f.machine})
          GROUP BY 1
        ) e ON e.bucket = g.bucket
        ORDER BY g.bucket
      `
    : await sql`
        SELECT g.bucket AS bucket, coalesce(e.total, 0)::int AS total
        FROM generate_series(
          date_trunc('day', coalesce(
            nullif(${f.since}, '')::timestamptz,
            (SELECT min(at) FROM audit_events),
            now()
          )),
          date_trunc('day', now()),
          interval '1 day'
        ) AS g(bucket)
        LEFT JOIN (
          SELECT date_trunc('day', at) AS bucket, count(*) AS total
          FROM audit_events
          WHERE (${f.since} = '' OR at >= nullif(${f.since}, '')::timestamptz)
            AND (${f.machine} = '' OR machine_id = ${f.machine})
          GROUP BY 1
        ) e ON e.bucket = g.bucket
        ORDER BY g.bucket
      `;

  const topPages = await sql`
    SELECT label, path, count(*)::int AS total
    FROM audit_events
    WHERE kind = 'pageview'
      AND (${f.machine} = '' OR machine_id = ${f.machine})
      AND (${f.since} = '' OR at >= nullif(${f.since}, '')::timestamptz)
    GROUP BY label, path
    ORDER BY total DESC, label
    LIMIT 8
  `;

  const topTools = await sql`
    SELECT tool, count(*)::int AS total
    FROM audit_events
    WHERE tool <> ''
      AND (${f.machine} = '' OR machine_id = ${f.machine})
      AND (${f.since} = '' OR at >= nullif(${f.since}, '')::timestamptz)
    GROUP BY tool
    ORDER BY total DESC, tool
    LIMIT 8
  `;

  // Trimmed to the last 400 buckets, so a log a year old cannot ask the browser
  // to draw a bar per day since the practice started using the app.
  return { ...totals[0], bucketSize: byHour ? 'hour' : 'day', buckets: buckets.slice(-400), topPages, topTools };
}
