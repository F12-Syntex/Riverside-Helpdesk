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
