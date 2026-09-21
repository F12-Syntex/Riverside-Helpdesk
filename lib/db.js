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

let _settingsSchemaReady = null;

// Runtime settings the practice can change without a redeploy — the AI model
// above all. A model used to be an environment variable, which meant changing it
// was a deploy and nobody but the person holding the Vercel project could do it.
// One row per setting, values as text: this table is read on nearly every AI
// request, so it stays small and boring on purpose.
export function ensureSettingsSchema() {
  if (_settingsSchemaReady) return _settingsSchemaReady;
  const sql = getSql();
  _settingsSchemaReady = (async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS app_settings (
        key        text PRIMARY KEY,
        value      text NOT NULL DEFAULT '',
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `;
  })().catch((e) => {
    _settingsSchemaReady = null;
    throw e;
  });
  return _settingsSchemaReady;
}

let _routingSchemaReady = null;

// The router's trigger index (lib/routing/): the phrasings each Notebook page
// answers to — generated once from the page, learned from clarify taps — with
// a tsvector for the lexical arm and an embedding for the vector arm. And one
// row per routed turn, so the fall-through rate can be read back.
//
// Kept independent of every other schema, like the settings: the router must
// never be the reason a question cannot be answered, so a failure here is
// swallowed by the router and the question goes to the picker as before.
export function ensureRoutingSchema() {
  if (_routingSchemaReady) return _routingSchemaReady;
  const sql = getSql();
  _routingSchemaReady = (async () => {
    await sql`CREATE EXTENSION IF NOT EXISTS vector`;
    await sql`
      CREATE TABLE IF NOT EXISTS routing_triggers (
        id            text PRIMARY KEY,
        target_kind   text NOT NULL,
        target_ref    text NOT NULL,
        phrase        text NOT NULL,
        phrase_norm   text NOT NULL,
        source        text NOT NULL,
        source_hash   text NOT NULL DEFAULT '',
        embedding     vector(1536),
        search_doc    tsvector GENERATED ALWAYS AS (to_tsvector('english', phrase)) STORED,
        created_at    timestamptz NOT NULL DEFAULT now(),
        UNIQUE (target_kind, target_ref, phrase_norm)
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS routing_triggers_doc_idx ON routing_triggers USING gin (search_doc)`;
    await sql`CREATE INDEX IF NOT EXISTS routing_triggers_vec_idx ON routing_triggers USING hnsw (embedding vector_cosine_ops)`;
    await sql`CREATE INDEX IF NOT EXISTS routing_triggers_norm_idx ON routing_triggers (phrase_norm)`;
    await sql`
      CREATE TABLE IF NOT EXISTS routing_decisions (
        id          bigserial PRIMARY KEY,
        turn_id     text NOT NULL DEFAULT '',
        decision    text NOT NULL,
        confidence  real NOT NULL DEFAULT 0,
        margin      real NOT NULL DEFAULT 0,
        target_kind text NOT NULL DEFAULT '',
        target_ref  text NOT NULL DEFAULT '',
        at          timestamptz NOT NULL DEFAULT now()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS routing_decisions_at_idx ON routing_decisions (at)`;
  })().catch((e) => {
    _routingSchemaReady = null;
    throw e;
  });
  return _routingSchemaReady;
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
    // WHAT A NOTE IS. `kind` is one of NOTE_KIND_IDS (lib/notebook/kinds.mjs):
    // the plain note, or one of the typed cards. The kind fixes the fields the
    // note holds, what "complete" means for it and how it is shown, and a
    // person chooses it when the note is created. `fields` holds those values;
    // `status` is live or draft, decided from the fields on every save, and a
    // draft is never served to a reader.
    await sql`ALTER TABLE notes ADD COLUMN IF NOT EXISTS kind   text  NOT NULL DEFAULT 'note'`;
    await sql`ALTER TABLE notes ADD COLUMN IF NOT EXISTS fields jsonb NOT NULL DEFAULT '{}'::jsonb`;
    await sql`ALTER TABLE notes ADD COLUMN IF NOT EXISTS status text  NOT NULL DEFAULT 'live'`;
    // THE OUTPUT TAG IS GONE FROM THE CODE, AND THE COLUMN STAYS.
    //
    // A page's shape used to be inherited from the folder above it, so dragging
    // it somewhere else silently changed how it answered and nobody was told.
    // The shape is a property of the note now — see `kind` — and nothing reads
    // `output_tag` any more.
    //
    // This dropped the column, and that took production down. Every deployment
    // and every developer's machine points at the same Neon database, so the
    // first request to this branch ran the drop — and the version still serving
    // the practice was selecting that column, so the Notebook answered "Could
    // not load notes" to everybody. A migration that removes something is a
    // migration that breaks whatever has not been deployed yet, and
    // ensureNotebookSchema runs on the first request rather than at a moment
    // anybody chose.
    //
    // ADDING IS SAFE AND REMOVING IS NOT. This function only ever adds from
    // here on. The column is dead weight of one text field per row; dropping it
    // is a job for a migration run deliberately, once the old version is no
    // longer serving anybody.
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
    // What a page said before it was rewritten. Written BEFORE every apply on
    // the defragmentation path, and before every revert, so any change made
    // through that path can be undone from here. Cascades with the note.
    await sql`
      CREATE TABLE IF NOT EXISTS note_revisions (
        id          serial PRIMARY KEY,
        note_id     integer NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
        title       text NOT NULL DEFAULT '',
        body        text NOT NULL DEFAULT '',
        reason      text NOT NULL DEFAULT '',
        proposal_id integer,
        turn_id     text NOT NULL DEFAULT '',
        created_at  timestamptz NOT NULL DEFAULT now()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS note_revisions_note_idx ON note_revisions (note_id, created_at DESC)`;
    // A proposed rewrite of one page, with the validation it passed, kept
    // server-side so the apply step trusts its own record rather than a flag
    // the browser sends back.
    await sql`
      CREATE TABLE IF NOT EXISTS note_proposals (
        id          serial PRIMARY KEY,
        note_id     integer NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
        source_hash text NOT NULL,
        body        text NOT NULL,
        map         jsonb NOT NULL DEFAULT '[]'::jsonb,
        validation  jsonb NOT NULL DEFAULT '{}'::jsonb,
        meaning     jsonb NOT NULL DEFAULT '{}'::jsonb,
        status      text NOT NULL DEFAULT 'draft',
        turn_id     text NOT NULL DEFAULT '',
        created_at  timestamptz NOT NULL DEFAULT now(),
        updated_at  timestamptz NOT NULL DEFAULT now()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS note_proposals_note_idx ON note_proposals (note_id, status)`;
    // Defragmenting the whole Notebook in one go. A run is a list of pages to
    // rewrite plus the candidate contradictions found before any of them is
    // touched; it is long-lived on purpose, because it stops and waits for the
    // reader whenever two pages disagree. Kept server-side so a closed tab
    // loses nothing and an apply trusts this record, never the browser.
    await sql`
      CREATE TABLE IF NOT EXISTS note_defrag_runs (
        id         serial PRIMARY KEY,
        status     text NOT NULL DEFAULT 'scanning',
        candidates jsonb NOT NULL DEFAULT '[]'::jsonb,
        cursor     integer NOT NULL DEFAULT 0,
        stats      jsonb NOT NULL DEFAULT '{}'::jsonb,
        turn_id    text NOT NULL DEFAULT '',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS note_defrag_runs_status_idx ON note_defrag_runs (status, created_at DESC)`;
    // One page of one run. 'blocked' is a page named in a contradiction nobody
    // has decided yet: it is not rewritten until they have.
    await sql`
      CREATE TABLE IF NOT EXISTS note_defrag_items (
        id          serial PRIMARY KEY,
        run_id      integer NOT NULL REFERENCES note_defrag_runs(id) ON DELETE CASCADE,
        note_id     integer NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
        title       text NOT NULL DEFAULT '',
        path        text NOT NULL DEFAULT '',
        status      text NOT NULL DEFAULT 'pending',
        proposal_id integer,
        detail      text NOT NULL DEFAULT '',
        position    integer NOT NULL DEFAULT 0,
        updated_at  timestamptz NOT NULL DEFAULT now(),
        UNIQUE (run_id, note_id)
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS note_defrag_items_run_idx ON note_defrag_items (run_id, position)`;
    // Two pages that tell staff different things. pair_key is the fingerprint of
    // the two statements, so a decision made in one run is remembered in the
    // next and the reader is not asked the same question twice.
    await sql`
      CREATE TABLE IF NOT EXISTS note_contradictions (
        id         serial PRIMARY KEY,
        run_id     integer REFERENCES note_defrag_runs(id) ON DELETE CASCADE,
        pair_key   text NOT NULL,
        kind       text NOT NULL DEFAULT 'echo',
        verdict    text NOT NULL DEFAULT 'contradiction',
        severity   text NOT NULL DEFAULT 'high',
        note_a     integer REFERENCES notes(id) ON DELETE CASCADE,
        note_b     integer REFERENCES notes(id) ON DELETE CASCADE,
        side_a     jsonb NOT NULL DEFAULT '{}'::jsonb,
        side_b     jsonb NOT NULL DEFAULT '{}'::jsonb,
        subject    text NOT NULL DEFAULT '',
        why        text NOT NULL DEFAULT '',
        reason     text NOT NULL DEFAULT '',
        question   text NOT NULL DEFAULT '',
        status     text NOT NULL DEFAULT 'open',
        resolution text NOT NULL DEFAULT '',
        decided_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS note_contradictions_run_idx ON note_contradictions (run_id, status)`;
    await sql`CREATE INDEX IF NOT EXISTS note_contradictions_pair_idx ON note_contradictions (pair_key)`;
    // A save of the WHOLE Notebook at one moment — every page and attachment
    // record, in the same JSON shape /api/notebook/export downloads, so a save
    // and a downloaded backup file are the same thing and either can be loaded
    // from the other. note_revisions above undoes one page; this undoes the
    // notebook. Loading one snapshots the state being left first (kind
    // 'auto'), so a load can itself be rolled back.
    await sql`
      CREATE TABLE IF NOT EXISTS notebook_snapshots (
        id               serial PRIMARY KEY,
        label            text NOT NULL DEFAULT '',
        kind             text NOT NULL DEFAULT 'manual',
        note_count       integer NOT NULL DEFAULT 0,
        attachment_count integer NOT NULL DEFAULT 0,
        payload          jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at       timestamptz NOT NULL DEFAULT now()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS notebook_snapshots_created_idx ON notebook_snapshots (created_at DESC)`;
  })().catch((e) => {
    _notebookSchemaReady = null;
    throw e;
  });
  return _notebookSchemaReady;
}

let _auditSchemaReady = null;

let _usageSchemaReady = null;

// What the models actually cost, measured rather than guessed.
//
// Every phase of every turn writes one row: which role ran, on which model, and
// how many tokens went in and came out. That is the only honest way to put a
// price per question on the settings page — a model's advertised rate says
// nothing about how many tokens THIS practice's questions use, and those differ
// between installs by more than the rates do.
//
// No question text is stored. A row is a role, a model, two counts and a time;
// nothing here identifies a patient, a member of staff or a machine.
export function ensureUsageSchema() {
  if (_usageSchemaReady) return _usageSchemaReady;
  const sql = getSql();
  _usageSchemaReady = (async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS ai_usage (
        id            bigserial PRIMARY KEY,
        turn_id       text NOT NULL DEFAULT '',
        role          text NOT NULL DEFAULT '',
        phase         text NOT NULL DEFAULT '',
        model         text NOT NULL DEFAULT '',
        input_tokens  integer NOT NULL DEFAULT 0,
        output_tokens integer NOT NULL DEFAULT 0,
        at            timestamptz NOT NULL DEFAULT now()
      )
    `;
    // The page averages recent rows and counts the distinct turns behind them;
    // both are range scans over this.
    await sql`CREATE INDEX IF NOT EXISTS ai_usage_at_idx ON ai_usage (at DESC)`;
  })().catch((e) => {
    _usageSchemaReady = null;
    throw e;
  });
  return _usageSchemaReady;
}

// Answer feedback: the question that was asked, and what the reader thought of
// the answer.
//
// The question is stored here rather than joined out of the audit log, because
// the two are read together and the audit log truncates. A row exists only when
// somebody presses a button, so this is a list of judged answers, not traffic.
//
// `turn_id` is the turn the verdict is about. Matching a verdict to an answer by
// its wording almost works and then quietly does not: the same question asked
// twice in a morning can get two different answers, and nothing afterwards says
// which of them was the one called wrong. The turn id is minted with the answer
// and travels back with the button press, so the join is exact. Rows written
// before it existed carry an empty one and fall back to matching on wording.
//
// Kept independent of every other schema, like the audit log: telling us an
// answer was wrong must never be the reason a question cannot be answered.
let _feedbackSchemaReady = null;
export function ensureFeedbackSchema() {
  if (_feedbackSchemaReady) return _feedbackSchemaReady;
  const sql = getSql();
  _feedbackSchemaReady = (async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS answer_feedback (
        id          bigserial PRIMARY KEY,
        machine_id  text NOT NULL DEFAULT '',
        question    text NOT NULL DEFAULT '',
        verdict     text NOT NULL DEFAULT '',
        template    text NOT NULL DEFAULT '',
        answer_kind text NOT NULL DEFAULT '',
        at          timestamptz NOT NULL DEFAULT now()
      )
    `;
    // Added after the table first shipped.
    await sql`ALTER TABLE answer_feedback ADD COLUMN IF NOT EXISTS turn_id text NOT NULL DEFAULT ''`;
    await sql`CREATE INDEX IF NOT EXISTS answer_feedback_at_idx ON answer_feedback (at DESC)`;
    await sql`CREATE INDEX IF NOT EXISTS answer_feedback_turn_idx ON answer_feedback (turn_id)`;
  })().catch((e) => {
    _feedbackSchemaReady = null;
    throw e;
  });
  return _feedbackSchemaReady;
}

// Every question asked of the assistant, and the answer it was given.
//
// The audit log records THAT a question was asked, truncated to 400 characters,
// with nothing about what came back. That answers "how busy was Tuesday"; it
// cannot answer the question whoever runs the app actually has, which is "is
// this thing giving good answers?" — and the answer is not recoverable after the
// fact, because the Notebook it was built from gets edited and the template it
// was rendered from changes.
//
// So one row per turn, written by the server as the answer is sent: what was
// asked, what was shown, which template built it, which model ran and how long
// it took. Verdicts join on `turn_id`.
//
// No patient text. Assistant questions are staff questions about practice
// process, and the routes that exist to have consultations pasted into them
// (Signpost, Reason, Code a document) do not write here at all.
//
// Kept independent of every other schema: failing to write the log must never be
// the reason a question goes unanswered, so the caller swallows every error.
let _questionLogSchemaReady = null;
export function ensureQuestionLogSchema() {
  if (_questionLogSchemaReady) return _questionLogSchemaReady;
  const sql = getSql();
  _questionLogSchemaReady = (async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS question_log (
        id          bigserial PRIMARY KEY,
        turn_id     text NOT NULL DEFAULT '',
        machine_id  text NOT NULL DEFAULT '',
        question    text NOT NULL DEFAULT '',
        outcome     text NOT NULL DEFAULT '',
        template    text NOT NULL DEFAULT '',
        source      text NOT NULL DEFAULT '',
        answer      text NOT NULL DEFAULT '',
        model       text NOT NULL DEFAULT '',
        duration_ms integer,
        images      integer NOT NULL DEFAULT 0,
        attachments integer NOT NULL DEFAULT 0,
        error       text NOT NULL DEFAULT '',
        at          timestamptz NOT NULL DEFAULT now()
      )
    `;
    // Provenance, added after the table existed, so it is added rather than
    // declared: an install that has been running since before the safety work
    // has a question_log full of rows and CREATE TABLE IF NOT EXISTS would
    // leave it exactly as it found it.
    //
    // `provenance` is how a significant event review reconstructs a turn — the
    // requests the message was split into, every deterministic rule that fired
    // with the words that fired it, the Notebook page revisions the card was
    // built from. `dismissed` is what reception said they had dealt with, and
    // when. Both jsonb, because both are lists that will grow a field.
    await sql`ALTER TABLE question_log ADD COLUMN IF NOT EXISTS provenance jsonb NOT NULL DEFAULT '{}'::jsonb`;
    await sql`ALTER TABLE question_log ADD COLUMN IF NOT EXISTS dismissed jsonb NOT NULL DEFAULT '[]'::jsonb`;
    // Read newest-first, whole or filtered to one machine, one outcome or one
    // turn; every one of those is a range scan on these.
    await sql`CREATE INDEX IF NOT EXISTS question_log_at_idx ON question_log (at DESC, id DESC)`;
    await sql`CREATE INDEX IF NOT EXISTS question_log_machine_idx ON question_log (machine_id, at DESC)`;
    await sql`CREATE INDEX IF NOT EXISTS question_log_turn_idx ON question_log (turn_id)`;
  })().catch((e) => {
    _questionLogSchemaReady = null;
    throw e;
  });
  return _questionLogSchemaReady;
}

// The questions nobody has an answer for yet — see lib/questions/gaps.mjs for
// what goes in here and why the two halves belong in one table.
//
// One row per question, not per asking. The same gap put to the assistant six
// times in a fortnight is the strongest signal in the practice about what to
// write down next, and six rows would bury it: the wording is normalised and
// `asked_count` carries the number instead.
//
// `answer` is what somebody typed back. It is NOT the practice's record — the
// Notebook is, which is why an answered row still says to write the page — but
// an answer written here is readable the same afternoon, and the alternative to
// that was nothing.
//
// Kept independent of every other schema, like the log it is fed by: a question
// that cannot be filed must never be the reason a question cannot be answered.
let _openQuestionsSchemaReady = null;
export function ensureOpenQuestionsSchema() {
  if (_openQuestionsSchemaReady) return _openQuestionsSchemaReady;
  const sql = getSql();
  _openQuestionsSchemaReady = (async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS open_questions (
        id            bigserial PRIMARY KEY,
        question      text NOT NULL DEFAULT '',
        -- The wording collapsed to what two people asking the same thing have
        -- in common (normaliseQuestion), and the key everything dedupes on.
        question_key  text NOT NULL DEFAULT '',
        -- 'asked' — somebody typed it here. 'assistant' — a turn could not
        -- answer it. The list shows which, because the two read differently.
        origin        text NOT NULL DEFAULT 'asked',
        -- For an 'assistant' row, why it could not answer: see GAP_REASONS.
        reason        text NOT NULL DEFAULT '',
        -- The turn it came off, so the question log still has the whole story.
        turn_id       text NOT NULL DEFAULT '',
        machine_id    text NOT NULL DEFAULT '',
        -- Anything the asker added underneath the question itself.
        detail        text NOT NULL DEFAULT '',
        status        text NOT NULL DEFAULT 'open',
        answer        text NOT NULL DEFAULT '',
        answered_by   text NOT NULL DEFAULT '',
        answered_at   timestamptz,
        asked_count   integer NOT NULL DEFAULT 1,
        last_at       timestamptz NOT NULL DEFAULT now(),
        at            timestamptz NOT NULL DEFAULT now()
      )
    `;
    // One row per question is the whole design, so it is the database that
    // holds it rather than the code that writes it: two desks hitting the same
    // gap in the same second both land on this index.
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS open_questions_key_idx ON open_questions (question_key)`;
    // Read newest-first, and filtered to what is still open.
    await sql`CREATE INDEX IF NOT EXISTS open_questions_last_idx ON open_questions (last_at DESC, id DESC)`;
    await sql`CREATE INDEX IF NOT EXISTS open_questions_status_idx ON open_questions (status, last_at DESC)`;
  })().catch((e) => {
    _openQuestionsSchemaReady = null;
    throw e;
  });
  return _openQuestionsSchemaReady;
}

// The activity audit log behind /stats — what was done in the app, on which
// machine, in what order.
//
// Keyed by machine, never by IP address. Every machine in the practice shares
// one public address and a laptop changes address between the car park and the
// consulting room, so an IP-keyed log answers neither "who did this" nor "was
// this the same person". The browser mints a random id per machine instead (see
// lib/audit/machine.js); no IP address is recorded in either table.
//
// Kept independent of every other schema: the log must never be the reason a
// question cannot be answered, so nothing else waits on these tables and a
// failure to write one is swallowed by the caller.
export function ensureAuditSchema() {
  if (_auditSchemaReady) return _auditSchemaReady;
  const sql = getSql();
  _auditSchemaReady = (async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS audit_machines (
        id         text PRIMARY KEY,
        name       text NOT NULL DEFAULT '',
        label      text NOT NULL DEFAULT '',
        os         text NOT NULL DEFAULT '',
        browser    text NOT NULL DEFAULT '',
        device     text NOT NULL DEFAULT '',
        screen     text NOT NULL DEFAULT '',
        timezone   text NOT NULL DEFAULT '',
        language   text NOT NULL DEFAULT '',
        user_agent text NOT NULL DEFAULT '',
        first_seen timestamptz NOT NULL DEFAULT now(),
        last_seen  timestamptz NOT NULL DEFAULT now(),
        events     integer NOT NULL DEFAULT 0
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS audit_events (
        id          bigserial PRIMARY KEY,
        machine_id  text NOT NULL REFERENCES audit_machines(id) ON DELETE CASCADE,
        session_id  text NOT NULL DEFAULT '',
        kind        text NOT NULL CHECK (kind IN ('pageview', 'query', 'action', 'load', 'error')),
        tool        text NOT NULL DEFAULT '',
        path        text NOT NULL DEFAULT '',
        label       text NOT NULL DEFAULT '',
        detail      text NOT NULL DEFAULT '',
        method      text NOT NULL DEFAULT '',
        status      integer,
        duration_ms integer,
        at          timestamptz NOT NULL DEFAULT now()
      )
    `;
    // The log is read newest-first, whole or filtered to one machine or one
    // kind; every one of those is a range scan on these three.
    await sql`CREATE INDEX IF NOT EXISTS audit_events_at_idx ON audit_events (at DESC, id DESC)`;
    await sql`CREATE INDEX IF NOT EXISTS audit_events_machine_idx ON audit_events (machine_id, at DESC)`;
    await sql`CREATE INDEX IF NOT EXISTS audit_events_kind_idx ON audit_events (kind, at DESC)`;
  })().catch((e) => {
    _auditSchemaReady = null;
    throw e;
  });
  return _auditSchemaReady;
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
