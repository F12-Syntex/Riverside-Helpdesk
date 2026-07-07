// Database layer — Neon (serverless Postgres).
//
// Uses the Neon HTTP driver, which is well suited to Next.js route handlers:
// each query is a single fetch, so there are no long-lived connections to
// manage in a serverless/edge-style environment. The connection string comes
// from DATABASE_URL (the pooled endpoint) in .env.local.
//
// getSql() returns a tagged-template query function with parameterised values
// (`sql`SELECT ... WHERE id = ${id}`` is safe against injection). ensureSchema()
// lazily creates the tables the app needs and is safe to call on every request.
import { neon } from '@neondatabase/serverless';

let _sql = null;

export function getSql() {
  if (!_sql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set — add it to .env.local.');
    _sql = neon(url);
  }
  return _sql;
}

let _schemaReady = null;

// Create the tables on first use. Memoised so the CREATE statements run at most
// once per server process; the IF NOT EXISTS guards make it safe regardless.
export function ensureSchema() {
  if (_schemaReady) return _schemaReady;
  const sql = getSql();
  _schemaReady = (async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS staff (
        id             serial PRIMARY KEY,
        name           text NOT NULL,
        role           text NOT NULL DEFAULT '',
        hours_per_week integer,
        notes          text NOT NULL DEFAULT '',
        created_at     timestamptz NOT NULL DEFAULT now()
      )
    `;
    // Staff carry a free-text description and annual-leave ranges (the rota
    // model from the design). Added via ALTER so existing rows are preserved.
    await sql`ALTER TABLE staff ADD COLUMN IF NOT EXISTS about text NOT NULL DEFAULT ''`;
    await sql`ALTER TABLE staff ADD COLUMN IF NOT EXISTS leave jsonb NOT NULL DEFAULT '[]'::jsonb`;
    // Phone is used to @mention ("ping") the person in the WhatsApp export
    // instead of writing their name; blank falls back to the name.
    await sql`ALTER TABLE staff ADD COLUMN IF NOT EXISTS phone text NOT NULL DEFAULT ''`;
    // Temporary staff pick their own days. They are never auto-generated or
    // AI-adjusted: their shifts are set by hand (early/late/blank) and the rest
    // of the rota is balanced around whatever they're booked for.
    await sql`ALTER TABLE staff ADD COLUMN IF NOT EXISTS temporary boolean NOT NULL DEFAULT false`;

    await sql`
      CREATE TABLE IF NOT EXISTS rotas (
        id            serial PRIMARY KEY,
        week_starting date NOT NULL,
        notes         text NOT NULL DEFAULT '',
        schedule      jsonb NOT NULL,
        created_at    timestamptz NOT NULL DEFAULT now(),
        updated_at    timestamptz NOT NULL DEFAULT now()
      )
    `;
    await sql`ALTER TABLE rotas ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now()`;
    // One stored rota per week (the schedule jsonb holds { grid, times }).
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS rotas_week_uniq ON rotas (week_starting)`;
  })().catch((e) => {
    // Reset so a transient failure can be retried on the next request.
    _schemaReady = null;
    throw e;
  });
  return _schemaReady;
}

let _notebookSchemaReady = null;

// Notebook — a simple OneNote-style store of practice notes. Top-level notes act
// like sections (parent_id NULL); each can hold sub-notes (parent_id -> the
// parent). Body is plain text/markdown. The notebook feeds the assistant: note
// bodies are pulled in at request time as citable supplementary context (see
// lib/notebook.js), so writing a note here makes the assistant use it — no
// re-ingest or redeploy. Kept independent of the rota/medication tables.
export function ensureNotebookSchema() {
  if (_notebookSchemaReady) return _notebookSchemaReady;
  const sql = getSql();
  _notebookSchemaReady = (async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS notes (
        id         serial PRIMARY KEY,
        parent_id  integer REFERENCES notes(id) ON DELETE CASCADE,
        title      text NOT NULL DEFAULT 'Untitled note',
        body       text NOT NULL DEFAULT '',
        position   integer NOT NULL DEFAULT 0,
        is_section boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `;
    // Nested notes can be promoted to sections (name-only containers); root
    // notes are sections implicitly. Column added after the table first shipped.
    await sql`ALTER TABLE notes ADD COLUMN IF NOT EXISTS is_section boolean NOT NULL DEFAULT false`;
    await sql`CREATE INDEX IF NOT EXISTS notes_parent_idx ON notes (parent_id)`;
    // Files attached to a note. The binary lives in Vercel Blob (url/pathname);
    // this table records what belongs to which note, so deleting a note
    // cascades here and the API can clean the blobs up.
    await sql`
      CREATE TABLE IF NOT EXISTS note_attachments (
        id           serial PRIMARY KEY,
        note_id      integer NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
        url          text NOT NULL,
        pathname     text NOT NULL,
        filename     text NOT NULL,
        content_type text NOT NULL DEFAULT 'application/octet-stream',
        size         integer NOT NULL DEFAULT 0,
        created_at   timestamptz NOT NULL DEFAULT now()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS note_attachments_note_idx ON note_attachments (note_id)`;
    // Semantic index over note bodies — the notebook's RAG. Each note is chunked
    // and embedded on save (lib/notebook.js syncNoteEmbeddings); /api/ask scores
    // these vectors against the query so notes are retrieved exactly like
    // knowledge-base documents, with the same numbered-Source citations.
    await sql`
      CREATE TABLE IF NOT EXISTS note_embeddings (
        note_id  integer NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
        chunk    integer NOT NULL,
        section  text NOT NULL DEFAULT '',
        content  text NOT NULL,
        hash     text NOT NULL,
        vec      jsonb NOT NULL,
        PRIMARY KEY (note_id, chunk)
      )
    `;
  })().catch((e) => {
    _notebookSchemaReady = null;
    throw e;
  });
  return _notebookSchemaReady;
}

let _medSchemaReady = null;

// Cache for the Medication Check tool. Looking a medicine up the first time costs
// a web-search-grounded model call (a few seconds); every later lookup of the
// same medicine, and any question already asked about it, is served straight from
// this table so the tool stays fast. The cache grows over time: `data` holds the
// medicine's general layered information, and `queries` accumulates one entry per
// specific question staff have asked (keyed by the normalised question), so the
// knowledge about a medicine deepens the more it is used.
//
// Kept separate from ensureSchema() so the medication route never depends on the
// rota/staff tables (and vice versa). Memoised the same way.
export function ensureMedicationSchema() {
  if (_medSchemaReady) return _medSchemaReady;
  const sql = getSql();
  _medSchemaReady = (async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS medications (
        slug         text PRIMARY KEY,
        name         text NOT NULL,
        data         jsonb NOT NULL DEFAULT '{}'::jsonb,
        queries      jsonb NOT NULL DEFAULT '{}'::jsonb,
        retrieved_at timestamptz NOT NULL DEFAULT now(),
        updated_at   timestamptz NOT NULL DEFAULT now()
      )
    `;
    // Spelling/synonym aliases: a typed slug (e.g. "paracitalmol", "calpol")
    // mapped to the canonical medicine slug it should be treated as. Learned as
    // the tool resolves misspellings, so a repeated typo is corrected instantly
    // with no model call.
    await sql`
      CREATE TABLE IF NOT EXISTS medication_aliases (
        alias      text PRIMARY KEY,
        slug       text NOT NULL,
        name       text NOT NULL DEFAULT '',
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `;
  })().catch((e) => {
    _medSchemaReady = null;
    throw e;
  });
  return _medSchemaReady;
}
