# Search rebuild — design

## Why

Every Q&A turn hands the AI the entire Notebook: 184 pages, ~43k tokens. The
measured average over the last 14 days (121 turns) was ~48k input tokens per
turn, and 90–140k when both the picker and the prose writer run. That is
almost all of the cost and most of the wait. On top of that, the codebase has
grown a pile of overlapping ways to find a page: a trigger-phrase router with
four settings and its own tables (switched off), a keyword note-scan that only
feeds the progress card, a referral page pre-filter, the whole-Notebook
picker, and a separate hybrid search used only by `/practice`. The owner wants
one search system, built fresh, with no flags.

## Goals

- The AI is shown a **shortlist**: the full text of the pages most likely to
  answer, plus the **title of every other page**, so it can still name a page
  that missed the shortlist (the page is rendered from the full Notebook, which
  stays loaded in code).
- **Indexing is automatic and never manual.** Every Notebook change is
  searchable on the next question, by keyword at once and by meaning a moment
  later, with no script for anyone to run.
- **One search module** (`lib/search/`) serves Notebook pages and `/practice`
  documents. Hybrid: Postgres full-text + pgvector, fused with reciprocal rank
  fusion.
- **No flags.** Sizes and windows are constants in code.
- Remove the router, its settings, tables' code, scripts, API, UI and tests;
  remove dead search code.

## Non-goals

- Name lookups over fixed lists stay as they are: the directory short-circuit
  and contacts fuzzy search, CQC search, `/form` and `/template` fuzzy matching,
  web contact lookup, the Notebook page's own filter box, and the deterministic
  matchers inside templates (referral pathways, bloods, registration).
- Plain Q&A does not start retrieving documents.
- Database tables belonging to removed code (`routing_triggers`,
  `routing_decisions`, `snomed_terms`, `ers_directory`) are **not dropped** —
  the code stops creating and reading them; dropping data is the owner's call.

## Anti-goals

- A page the practice just edited being invisible to the assistant.
- The assistant failing a turn because search is down — it must fall back to
  today's behaviour (the whole Notebook), not to nothing.
- Answer text that isn't the practice's live text: pages are always rendered
  from the live `notes` table; the index only ranks.

## How it works

### Indexing (automatic)

- Every Notebook write already calls `syncNoteKnowledge` (lib/notebook.js),
  which keeps `knowledge_passages` current with a keyword index
  (`search_doc`). Today all 275 note passages have **no vector**
  (`embed: false`, and `fillMissingKnowledgeEmbeddingsByKind` refuses `note`).
- New: after a save, a **background** job embeds note passages that have no
  vector (only changed text — unchanged passages keep their vector via the
  existing hash reuse). The save does not wait for it.
- New: a **catch-up** at the start of every Q&A turn kicks the same job,
  throttled to once a minute per server instance, so a failed background job
  is repaired by the next question and the existing 275 passages are filled
  on first use.

### Searching

- `searchPassages(query, { kinds, limit })`: lexical arm ranks
  `setweight(to_tsvector(title),'A') || search_doc` against the question's
  words joined with **OR** (a natural-language question would match almost
  nothing under AND); semantic arm is pgvector cosine on the embedded query.
  RRF with k = 60. If the query can't be embedded, the lexical arm alone runs.
- Notebook passage hits are rolled up to pages (best passage score wins).

### The shortlist

- Query text: the previous user message from `history` (for follow-ups), the
  question, and the first 1000 characters of any attached text.
- Up to **12** ranked pages (**20** for a multi-request message), plus up to
  **5** pages edited in the last **hour** that aren't already in it.
- Fallback to the **whole Notebook** when the query has no searchable text
  (e.g. an image with no words) or search throws.
- The prompt text is: the shortlisted pages in full, then a titles-only list of
  every other page. The picker may name any title; the prose writer is told the
  titles-only pages exist but their text is not shown.
- The progress card ("notes" stage) keeps its wire shape but shows the
  shortlist instead of the old keyword scan.

### Cheaper Notebook read

- `fullNotebookContext()` is memoised in server memory and reloaded only when
  a one-row version query (note count + latest `updated_at`, attachment count +
  max id) changes.

## Measuring

`evals/routing/bench-picker.mjs` runs the real picker against the golden
cases in `pages.md`; it is updated to use the shortlist and reports page
accuracy and mean input tokens. Per `evals/routing/judge.md`, whoever changes
routing code runs the bench but does not read the cases.
