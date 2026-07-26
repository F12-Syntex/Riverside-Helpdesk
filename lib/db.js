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
    // Next.js patches server-side fetch. Database POSTs must always bypass its
    // Data Cache or identical status/search queries can return an old snapshot
    // after a write from another request.
    _sql = neon(url, { fetchOptions: { cache: 'no-store' } });
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
// parent). Body is plain text/markdown. Every non-empty page is pulled in full
// at request time as citable context, so writing a note makes it available
// immediately with no RAG cutoff or redeploy. Kept independent of the
// rota/medication tables.
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
  })().catch((e) => {
    _notebookSchemaReady = null;
    throw e;
  });
  return _notebookSchemaReady;
}

let _snomedSchemaReady = null;

// SNOMED CT terms, and the e-RS Specialty / Clinic Type maps they resolve to.
//
// The purpose of this store is one lookup: given a clinical phrase pulled out of
// a doctor's referral note ("suspected melanoma"), find the e-RS Specialty and
// Clinic Type the referral must be sent under. That runs in two hops — phrase →
// SNOMED conceptId (snomed_terms), then conceptId → e-RS value
// (ers_specialty_map / ers_clinic_type_map).
//
// ers_directory is the CLOSED VOCABULARY of valid Specialty + Clinic Type
// pairings, loaded from the practice's e-RS referral types export. A lookup may
// only ever return a pairing that exists in this table, so the assistant can
// suggest a route but can never invent one that e-RS would reject.
//
// Note there is no SNOMED-to-e-RS mapping published anywhere: no edition of the
// SNOMED CT UK release carries an e-RS refset, and the referral types export
// carries no concept ids. The link between the two is made by matching the
// resolved concept's wording against this vocabulary, and is therefore a
// SUGGESTION. The Notebook stays the first and preferred source for both fields.
export function ensureSnomedSchema() {
  if (_snomedSchemaReady) return _snomedSchemaReady;
  const sql = getSql();
  _snomedSchemaReady = (async () => {
    await sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`;
    await sql`
      CREATE TABLE IF NOT EXISTS snomed_terms (
        concept_id   text NOT NULL,
        term         text NOT NULL,
        term_norm    text NOT NULL,
        semantic_tag text NOT NULL DEFAULT '',
        is_fsn       boolean NOT NULL DEFAULT false,
        PRIMARY KEY (concept_id, term_norm)
      )
    `;
    // Exact-phrase hits are the common case and must not need a scan.
    await sql`CREATE INDEX IF NOT EXISTS snomed_terms_norm_idx ON snomed_terms (term_norm)`;
    // Trigram index for the near misses: notes are typed at speed, so
    // "melanona" still has to reach "melanoma".
    await sql`CREATE INDEX IF NOT EXISTS snomed_terms_trgm_idx ON snomed_terms USING gin (term_norm gin_trgm_ops)`;
    await sql`
      CREATE TABLE IF NOT EXISTS ers_directory (
        specialty      text NOT NULL,
        clinic_type    text NOT NULL,
        specialty_norm text NOT NULL,
        clinic_norm    text NOT NULL,
        PRIMARY KEY (specialty, clinic_type)
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS ers_directory_trgm_idx ON ers_directory USING gin (clinic_norm gin_trgm_ops)`;
  })().catch((e) => {
    _snomedSchemaReady = null;
    throw e;
  });
  return _snomedSchemaReady;
}

let _medSchemaReady = null;

let _knowledgeSchemaReady = null;

// Canonical knowledge store. Documents, Notebook pages and contacts share the
// same entry/passages model for administration and conflict review. At answer
// time, `kind` also defines the context path: document/contact passages are
// retrieved, while Notebook pages are read whole from the live notes table.
// PostgreSQL full-text and pgvector provide the two RAG corpora. Atomic claims
// and conflicts make disagreements reviewable.
export function ensureKnowledgeSchema() {
  if (_knowledgeSchemaReady) return _knowledgeSchemaReady;
  const sql = getSql();
  _knowledgeSchemaReady = (async () => {
    await sql`CREATE EXTENSION IF NOT EXISTS vector`;
    await sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`;
    await sql`
      CREATE TABLE IF NOT EXISTS knowledge_entries (
        id             text PRIMARY KEY,
        kind           text NOT NULL CHECK (kind IN ('document', 'note', 'contact')),
        title          text NOT NULL,
        content        text NOT NULL DEFAULT '',
        data           jsonb NOT NULL DEFAULT '{}'::jsonb,
        source_ref     text NOT NULL DEFAULT '',
        authority      integer NOT NULL DEFAULT 50 CHECK (authority BETWEEN 0 AND 100),
        status         text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'draft', 'archived')),
        content_hash   text NOT NULL DEFAULT '',
        claims_stale  boolean NOT NULL DEFAULT true,
        created_at     timestamptz NOT NULL DEFAULT now(),
        updated_at     timestamptz NOT NULL DEFAULT now()
      )
    `;
    await sql`ALTER TABLE knowledge_entries ADD COLUMN IF NOT EXISTS claims_stale boolean NOT NULL DEFAULT true`;
    await sql`CREATE INDEX IF NOT EXISTS knowledge_entries_kind_idx ON knowledge_entries (kind, status)`;
    await sql`
      CREATE TABLE IF NOT EXISTS knowledge_passages (
        id          text PRIMARY KEY,
        entry_id    text NOT NULL REFERENCES knowledge_entries(id) ON DELETE CASCADE,
        ordinal     integer NOT NULL DEFAULT 0,
        heading     text NOT NULL DEFAULT '',
        content     text NOT NULL,
        content_hash text NOT NULL DEFAULT '',
        embedding   vector(1536),
        location    jsonb NOT NULL DEFAULT '{}'::jsonb,
        search_doc  tsvector GENERATED ALWAYS AS
          (to_tsvector('english', coalesce(heading, '') || ' ' || coalesce(content, ''))) STORED,
        UNIQUE (entry_id, ordinal)
      )
    `;
    await sql`ALTER TABLE knowledge_passages ADD COLUMN IF NOT EXISTS content_hash text NOT NULL DEFAULT ''`;
    await sql`CREATE INDEX IF NOT EXISTS knowledge_passages_entry_idx ON knowledge_passages (entry_id)`;
    await sql`CREATE INDEX IF NOT EXISTS knowledge_passages_search_idx ON knowledge_passages USING gin (search_doc)`;
    // HNSW is maintained incrementally and avoids scanning every vector at query
    // time. cosine distance matches the previous in-memory retrieval semantics.
    await sql`CREATE INDEX IF NOT EXISTS knowledge_passages_embedding_idx ON knowledge_passages USING hnsw (embedding vector_cosine_ops)`;
    await sql`
      CREATE TABLE IF NOT EXISTS knowledge_claims (
        id             bigserial PRIMARY KEY,
        entry_id       text NOT NULL REFERENCES knowledge_entries(id) ON DELETE CASCADE,
        passage_id     text REFERENCES knowledge_passages(id) ON DELETE CASCADE,
        subject        text NOT NULL,
        predicate      text NOT NULL,
        value          text NOT NULL,
        normalized_key text NOT NULL,
        quote          text NOT NULL DEFAULT '',
        fingerprint    text NOT NULL DEFAULT '',
        confidence     real NOT NULL DEFAULT 1,
        created_at     timestamptz NOT NULL DEFAULT now()
      )
    `;
    await sql`ALTER TABLE knowledge_claims ADD COLUMN IF NOT EXISTS fingerprint text NOT NULL DEFAULT ''`;
    await sql`CREATE INDEX IF NOT EXISTS knowledge_claims_key_idx ON knowledge_claims (normalized_key)`;
    await sql`
      CREATE TABLE IF NOT EXISTS knowledge_conflicts (
        id            bigserial PRIMARY KEY,
        normalized_key text NOT NULL,
        claim_a       bigint NOT NULL REFERENCES knowledge_claims(id) ON DELETE CASCADE,
        claim_b       bigint NOT NULL REFERENCES knowledge_claims(id) ON DELETE CASCADE,
        reason        text NOT NULL DEFAULT '',
        pair_fingerprint text NOT NULL DEFAULT '',
        confidence    real NOT NULL DEFAULT 0,
        status        text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'ignored')),
        resolution    text NOT NULL DEFAULT '',
        created_at    timestamptz NOT NULL DEFAULT now(),
        resolved_at   timestamptz,
        UNIQUE (claim_a, claim_b)
      )
    `;
    await sql`ALTER TABLE knowledge_conflicts ADD COLUMN IF NOT EXISTS pair_fingerprint text NOT NULL DEFAULT ''`;
    await sql`ALTER TABLE knowledge_conflicts ADD COLUMN IF NOT EXISTS confidence real NOT NULL DEFAULT 0`;
    await sql`UPDATE knowledge_conflicts SET status='ignored', resolution='Legacy unclassified candidate' WHERE pair_fingerprint='' AND status='open'`;
    await sql`CREATE INDEX IF NOT EXISTS knowledge_conflicts_status_idx ON knowledge_conflicts (status, created_at DESC)`;
    await sql`
      CREATE TABLE IF NOT EXISTS knowledge_conflict_decisions (
        pair_fingerprint text PRIMARY KEY,
        status          text NOT NULL CHECK (status IN ('resolved', 'ignored')),
        resolution      text NOT NULL DEFAULT '',
        updated_at      timestamptz NOT NULL DEFAULT now()
      )
    `;
    // Claim extraction is expensive reasoning work. Cache it by exact content
    // hash so unchanged/reverted text is never sent to the model again.
    await sql`
      CREATE TABLE IF NOT EXISTS knowledge_claim_cache (
        content_hash text PRIMARY KEY,
        claims       jsonb NOT NULL,
        created_at   timestamptz NOT NULL DEFAULT now()
      )
    `;
    // Small fingerprints let a cold server instance prove the bundled
    // documents/contacts are already current without reparsing the corpus.
    await sql`
      CREATE TABLE IF NOT EXISTS knowledge_sync_state (
        source_key  text PRIMARY KEY,
        fingerprint text NOT NULL,
        updated_at  timestamptz NOT NULL DEFAULT now()
      )
    `;
    // Coalescing claim-analysis queue. Repeated autosaves overwrite one row per
    // entry, so only the newest content hash is ever reasoned over.
    await sql`
      CREATE TABLE IF NOT EXISTS knowledge_analysis_jobs (
        entry_id    text PRIMARY KEY REFERENCES knowledge_entries(id) ON DELETE CASCADE,
        target_hash text NOT NULL,
        available_at timestamptz NOT NULL DEFAULT now(),
        attempts    integer NOT NULL DEFAULT 0,
        last_error  text NOT NULL DEFAULT '',
        locked_until timestamptz,
        lease_token text NOT NULL DEFAULT '',
        updated_at  timestamptz NOT NULL DEFAULT now()
      )
    `;
    await sql`ALTER TABLE knowledge_analysis_jobs ADD COLUMN IF NOT EXISTS locked_until timestamptz`;
    await sql`ALTER TABLE knowledge_analysis_jobs ADD COLUMN IF NOT EXISTS lease_token text NOT NULL DEFAULT ''`;
    await sql`CREATE INDEX IF NOT EXISTS knowledge_analysis_jobs_due_idx ON knowledge_analysis_jobs (available_at)`;
  })().catch((e) => {
    _knowledgeSchemaReady = null;
    throw e;
  });
  return _knowledgeSchemaReady;
}

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
