// /api/database — a read-only window onto everything this app has stored.
//
// TWO STORES, ONE ENDPOINT. The practice's data lives in two places: the
// Postgres database (Neon) and the blob store the notebook's attachments are
// uploaded to. Somebody asking "what does this app actually hold about us?"
// should not have to know that, so both answer here.
//
// NOTHING HERE WRITES. Every branch builds a SELECT and nothing else: there is
// no INSERT, UPDATE, DELETE or DDL path in this file, the blob store is only
// ever listed, and the only HTTP verb exported is GET. Table and column names
// never come from the query string as text that reaches SQL — they are matched
// against the live catalogue first and re-quoted from what the catalogue said,
// so a name the database does not have cannot reach a statement. Values are
// always parameters.
//
// WHAT IS HELD BACK, AND WHY. Embedding vectors are 1536 floats each; a page of
// them is megabytes of numbers nobody can read. In the grid they are omitted
// and the cell says so, and opening the row shows the start of one. Binary
// columns report their length rather than their bytes.
//
//   GET ?view=overview                      — every table, its rows and its size
//   GET ?view=table&table=notes             — columns, keys, indexes
//   GET ?view=rows&table=notes&…            — a page of rows (limit/offset/sort/q)
//   GET ?view=row&table=notes&rowid=(0,1)   — one row, untruncated
//   GET ?view=files&cursor=…                — the blob store, page by page
import { NextResponse } from 'next/server';
import { list } from '@vercel/blob';
import { getSql, ensureSchema, ensureKnowledgeSchema } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;
// How much of a value the grid shows. Enough to recognise a row by; the rest is
// one click away in the row view, which truncates at a far higher bound.
const CELL_CHARS = 280;
const DETAIL_CHARS = 20000;

// Types whose contents are not worth sending to a browser.
const VECTOR_TYPES = new Set(['vector', 'halfvec', 'sparsevec']);
const BINARY_TYPES = new Set(['bytea']);

// Vercel Blob's list() does not report a content type — only head() does, and
// that is one request per file. The extension is what a browser would go on
// anyway, so a small table beats 200 round trips.
const EXTENSION_TYPES = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
  svg: 'image/svg+xml', heic: 'image/heic', bmp: 'image/bmp', avif: 'image/avif',
  pdf: 'application/pdf', txt: 'text/plain', csv: 'text/csv', json: 'application/json',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint', zip: 'application/zip', mp4: 'video/mp4', mp3: 'audio/mpeg',
};

function guessType(pathname) {
  const ext = String(pathname || '').split('.').pop().toLowerCase();
  return EXTENSION_TYPES[ext] || '';
}
function ident(name) {
  return '"' + String(name).replace(/"/g, '""') + '"';
}

function fail(message, status) {
  return NextResponse.json({ error: message }, { status: status || 400, headers: { 'Cache-Control': 'no-store' } });
}

function ok(payload) {
  return NextResponse.json(payload, { headers: { 'Cache-Control': 'no-store' } });
}

// Make sure the tables exist before reporting on them, so a fresh database
// reads as empty rather than as missing. Best effort: the catalogue queries
// below are still worth running if this fails.
async function readySchemas() {
  await Promise.allSettled([ensureSchema(), ensureKnowledgeSchema()]);
}

/* ---------------------------------------------------------------- *
 * The catalogue. Everything else in this file starts here, because a
 * name that came back from these queries is a name the database has.
 * ---------------------------------------------------------------- */

async function listTables(sql) {
  return sql`
    SELECT c.relname                       AS name,
           c.relkind                       AS kind,
           pg_total_relation_size(c.oid)   AS bytes,
           obj_description(c.oid, 'pg_class') AS comment
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
    ORDER BY c.relname
  `;
}

async function resolveTable(sql, wanted) {
  const name = String(wanted || '').trim();
  if (!name) return null;
  const tables = await listTables(sql);
  return tables.find((t) => t.name === name) || null;
}

async function listColumns(sql, table) {
  return sql`
    SELECT a.attname                                        AS name,
           format_type(a.atttypid, a.atttypmod)             AS type,
           t.typname                                        AS udt,
           a.attnotnull                                     AS not_null,
           pg_get_expr(d.adbin, d.adrelid)                  AS default_expr,
           a.attnum                                         AS ordinal,
           col_description(a.attrelid, a.attnum)            AS comment
    FROM pg_attribute a
    JOIN pg_class c      ON c.oid = a.attrelid
    JOIN pg_namespace n  ON n.oid = c.relnamespace
    JOIN pg_type t       ON t.oid = a.atttypid
    LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
    WHERE n.nspname = 'public' AND c.relname = ${table}
      AND a.attnum > 0 AND NOT a.attisdropped
    ORDER BY a.attnum
  `;
}

async function primaryKey(sql, table) {
  const rows = await sql`
    SELECT a.attname AS name
    FROM pg_index i
    JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey)
    JOIN pg_class c     ON c.oid = i.indrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = ${table} AND i.indisprimary
  `;
  return rows.map((r) => r.name);
}

// How a column is read. The expression is what goes in the SELECT list; the
// flags travel to the browser so a cell can say why it is empty.
function readPlan(column, chars) {
  const udt = String(column.udt || '').toLowerCase();
  const q = ident(column.name);
  if (VECTOR_TYPES.has(udt)) {
    // In the grid: nothing but the shape. In the row view: the start of it.
    if (!chars) return { expr: 'NULL::text AS ' + q, omitted: true, searchable: false };
    return { expr: 'left(' + q + '::text, ' + chars + ') AS ' + q, searchable: false };
  }
  if (BINARY_TYPES.has(udt)) {
    return { expr: 'octet_length(' + q + ') AS ' + q, bytes: true, searchable: false };
  }
  return { expr: q, searchable: true };
}

/* ---------------------------------------------------------------- *
 * Values on the way out. Everything becomes a string, because the grid
 * shows strings and a browser cannot be trusted with a bigint.
 * ---------------------------------------------------------------- */

function cell(value, plan, limit) {
  if (value === null || value === undefined) return { null: true };
  if (plan && plan.bytes) return { text: Number(value).toLocaleString('en-GB') + ' bytes', note: true };
  let text;
  if (value instanceof Date) text = value.toISOString();
  else if (Buffer.isBuffer(value)) text = value.length + ' bytes';
  else if (typeof value === 'object') text = JSON.stringify(value);
  else text = String(value);
  const full = text.length;
  if (full > limit) return { text: text.slice(0, limit), truncated: true, length: full };
  return { text };
}

/* ---------------------------------------------------------------- *
 * The views.
 * ---------------------------------------------------------------- */

async function overview(sql) {
  const tables = await listTables(sql);
  if (!tables.length) return ok({ tables: [] });

  // One round trip for every count. These tables are a practice's worth of
  // rows, not a warehouse's, so an exact count is affordable and an estimate
  // that says -1 on a table nobody has analysed is not.
  const names = tables.map((t) => t.name);
  const unionText = names
    .map((n, i) => 'SELECT $' + (i + 1) + '::text AS t, count(*)::bigint AS n FROM public.' + ident(n))
    .join(' UNION ALL ');
  let counts = new Map();
  try {
    const rows = await sql.query(unionText, names);
    counts = new Map(rows.map((r) => [r.t, Number(r.n)]));
  } catch (e) {
    counts = new Map();
  }

  const columnRows = await sql`
    SELECT c.relname AS name, count(*)::int AS n
    FROM pg_attribute a
    JOIN pg_class c     ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND a.attnum > 0 AND NOT a.attisdropped
    GROUP BY c.relname
  `;
  const columns = new Map(columnRows.map((r) => [r.name, Number(r.n)]));

  return ok({
    tables: tables.map((t) => ({
      name: t.name,
      rows: counts.has(t.name) ? counts.get(t.name) : null,
      columns: columns.get(t.name) || 0,
      bytes: Number(t.bytes || 0),
      comment: t.comment || '',
    })),
  });
}

async function structure(sql, table) {
  const [columns, pk, constraints, indexes, referencedBy] = await Promise.all([
    listColumns(sql, table.name),
    primaryKey(sql, table.name),
    sql`
      SELECT con.conname AS name, pg_get_constraintdef(con.oid) AS definition, con.contype AS kind
      FROM pg_constraint con
      JOIN pg_class c     ON c.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = ${table.name}
      ORDER BY con.contype, con.conname
    `,
    sql`
      SELECT indexname AS name, indexdef AS definition
      FROM pg_indexes WHERE schemaname = 'public' AND tablename = ${table.name}
      ORDER BY indexname
    `,
    sql`
      SELECT src.relname AS table, con.conname AS name, pg_get_constraintdef(con.oid) AS definition
      FROM pg_constraint con
      JOIN pg_class tgt   ON tgt.oid = con.confrelid
      JOIN pg_class src   ON src.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = tgt.relnamespace
      WHERE n.nspname = 'public' AND tgt.relname = ${table.name} AND con.contype = 'f'
      ORDER BY src.relname
    `,
  ]);

  const pkSet = new Set(pk);
  return ok({
    table: table.name,
    comment: table.comment || '',
    bytes: Number(table.bytes || 0),
    primaryKey: pk,
    columns: columns.map((c) => ({
      name: c.name,
      type: c.type,
      udt: c.udt,
      nullable: !c.not_null,
      default: c.default_expr || '',
      comment: c.comment || '',
      primaryKey: pkSet.has(c.name),
      readable: !VECTOR_TYPES.has(String(c.udt).toLowerCase()),
    })),
    constraints: constraints.map((c) => ({ name: c.name, definition: c.definition, kind: c.kind })),
    indexes: indexes.map((i) => ({ name: i.name, definition: i.definition })),
    referencedBy: referencedBy.map((r) => ({ table: r.table, name: r.name, definition: r.definition })),
  });
}

async function rows(sql, table, params) {
  const columns = await listColumns(sql, table.name);
  if (!columns.length) return ok({ columns: [], rows: [], total: 0 });

  const limit = Math.min(Math.max(parseInt(params.get('limit'), 10) || DEFAULT_LIMIT, 1), MAX_LIMIT);
  const offset = Math.max(parseInt(params.get('offset'), 10) || 0, 0);
  const plans = columns.map((c) => ({ column: c, plan: readPlan(c, 0) }));

  // A sort column is only ever a name the catalogue just gave us.
  const pk = await primaryKey(sql, table.name);
  const requested = params.get('sort');
  const sortable = new Set(plans.filter((p) => !VECTOR_TYPES.has(String(p.column.udt).toLowerCase())).map((p) => p.column.name));
  const sort = sortable.has(requested) ? requested : (sortable.has(pk[0]) ? pk[0] : columns[0].name);
  const dir = String(params.get('dir')).toLowerCase() === 'asc' ? 'ASC' : 'DESC';

  // The search is one box over every column the database can cast to text,
  // because somebody looking for a phone number does not know which column
  // it is in — that is the reason they are on this page.
  const needle = String(params.get('q') || '').trim();
  const searchable = plans.filter((p) => p.plan.searchable).map((p) => ident(p.column.name));
  const args = [];
  let where = '';
  if (needle && searchable.length) {
    args.push('%' + needle + '%');
    where = ' WHERE (' + searchable.map((c) => c + '::text ILIKE $1').join(' OR ') + ')';
  }

  const from = ' FROM public.' + ident(table.name) + where;
  const countRows = await sql.query('SELECT count(*)::bigint AS n' + from, args);
  const total = Number((countRows[0] || {}).n || 0);

  const select = plans.map((p) => p.plan.expr).join(', ');
  const text = 'SELECT ctid::text AS __rowid, ' + select + from
    + ' ORDER BY ' + ident(sort) + ' ' + dir + ' NULLS LAST'
    + ' LIMIT ' + limit + ' OFFSET ' + offset;
  const data = await sql.query(text, args);

  return ok({
    table: table.name,
    total,
    limit,
    offset,
    sort,
    dir: dir.toLowerCase(),
    query: needle,
    columns: plans.map((p) => ({
      name: p.column.name,
      type: p.column.type,
      omitted: !!p.plan.omitted,
      primaryKey: pk.includes(p.column.name),
    })),
    rows: data.map((r) => ({
      id: r.__rowid,
      cells: plans.map((p) => (p.plan.omitted ? { omitted: true } : cell(r[p.column.name], p.plan, CELL_CHARS))),
    })),
  });
}

async function oneRow(sql, table, rowid) {
  if (!/^\(\d+,\d+\)$/.test(String(rowid || ''))) return fail('That row id is not one of ours.', 400);
  const columns = await listColumns(sql, table.name);
  const plans = columns.map((c) => ({ column: c, plan: readPlan(c, DETAIL_CHARS) }));
  const text = 'SELECT ' + plans.map((p) => p.plan.expr).join(', ')
    + ' FROM public.' + ident(table.name) + ' WHERE ctid = $1::tid';
  const found = await sql.query(text, [rowid]);
  if (!found.length) return fail('That row is no longer there.', 404);
  const row = found[0];
  return ok({
    table: table.name,
    id: rowid,
    values: plans.map((p) => ({
      column: p.column.name,
      type: p.column.type,
      ...cell(row[p.column.name], p.plan, DETAIL_CHARS),
    })),
  });
}

/* The other store. Blobs are listed straight from Vercel Blob rather than from
   note_attachments, so a file the database has forgotten about still shows up —
   which is the only way anybody would ever find one. */
async function files(sql, params) {
  const cursor = params.get('cursor') || undefined;
  let page;
  try {
    page = await list({ limit: 200, cursor });
  } catch (e) {
    return ok({
      blobs: [],
      hasMore: false,
      error: 'The blob store could not be read: ' + String(e.message || e).slice(0, 200),
    });
  }

  const owners = new Map();
  let attachmentRows = 0;
  try {
    const rows = await sql`
      SELECT a.id, a.url, a.pathname, a.filename, a.note_id, a.created_at, n.title AS note_title
      FROM note_attachments a
      LEFT JOIN notes n ON n.id = a.note_id
    `;
    attachmentRows = rows.length;
    for (const r of rows) owners.set(r.pathname, r);
  } catch (e) {
    // No attachments table yet: every blob simply reads as unattached.
  }

  return ok({
    cursor: page.cursor || '',
    hasMore: !!page.hasMore,
    // So the page can say when a row points at a file the store no longer has.
    attachmentRows,
    blobs: (page.blobs || []).map((b) => {
      const owner = owners.get(b.pathname);
      return {
        url: b.url,
        downloadUrl: b.downloadUrl || b.url,
        pathname: b.pathname,
        size: Number(b.size || 0),
        uploadedAt: b.uploadedAt || null,
        contentType: b.contentType || (owner && owner.content_type) || guessType(b.pathname),
        attachment: owner
          ? { id: owner.id, noteId: owner.note_id, noteTitle: owner.note_title || '', filename: owner.filename, at: owner.created_at }
          : null,
      };
    }),
  });
}

export async function GET(request) {
  const params = request.nextUrl.searchParams;
  const view = params.get('view') || 'overview';

  let sql;
  try {
    sql = getSql();
  } catch (e) {
    return fail(String(e.message || e), 500);
  }
  await readySchemas();

  try {
    if (view === 'overview') return await overview(sql);
    if (view === 'files') return await files(sql, params);

    const table = await resolveTable(sql, params.get('table'));
    if (!table) return fail('No table by that name.', 404);
    if (view === 'table') return await structure(sql, table);
    if (view === 'rows') return await rows(sql, table, params);
    if (view === 'row') return await oneRow(sql, table, params.get('rowid'));
    return fail('Unknown view.', 400);
  } catch (e) {
    return fail(String(e.message || e).slice(0, 400), 500);
  }
}
