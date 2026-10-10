# Search Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace "the whole Notebook in every prompt" and the pile of flagged search strategies with one hybrid search module that shortlists pages, indexed automatically on every change.

**Architecture:** `lib/search/` owns all knowledge search: a hybrid Postgres full-text + pgvector query (`searchPassages`), pure shortlist logic, a Notebook orchestrator, and a throttled background embedder. The agent route keeps the full Notebook loaded in code (deterministic resolvers need it) but prompts carry only the shortlist plus every other page's title. The router, its settings and dead search code are deleted.

**Tech Stack:** Next.js 14 App Router (JS/ESM), Neon Postgres + pgvector via `@neondatabase/serverless`, OpenRouter embeddings (`rag/lib/embed.mjs`), `node:test`.

**Spec:** `docs/superpowers/specs/2026-10-10-search-rebuild-design.md`

## Global Constraints

- No feature flags, settings keys or env vars for search. Constants in code: `SHORTLIST_SIZE = 12`, `SHORTLIST_SIZE_MULTI = 20`, `RECENT_MS = 3600000` (1 hour), `RECENT_MAX = 5`, `RRF_K = 60`, embed catch-up throttle `60000` ms, embed batch `200` passages.
- Do not drop database tables. Remove code that creates/reads `routing_triggers`, `routing_decisions`, `snomed_terms`, `ers_directory`; leave the tables.
- Pages shown to the model always come from the live `notes` table (`fullNotebookContext()` page objects); the index only ranks.
- Search failure must never fail a turn: fall back to the whole Notebook.
- Do **not** commit, and do **not** change `package.json` `version` — the orchestrator commits and bumps.
- Do **not** read `evals/routing/pages.md` cases, `cases.md` or `cases-hard.md` (see `evals/routing/judge.md`). Running the benches is fine.
- Match the surrounding code's style: ESM, comment density as in `lib/notebook.js` (explain *why*), `node:test` + `node:assert/strict` tests in `test/*.test.mjs`.
- Test command: `npm test` (all) or `node --test test/<file>.test.mjs`. Baseline: 883/883 pass.

## Review Focus

1. A follow-up ("and for children?") — the shortlist query includes the previous user message from `history`, so the earlier topic's pages are still shortlisted. → Task 1 test `shortlistQuery includes the previous user message`.
2. A page edited a minute ago whose passages have no vector yet — still shortlisted via the recent window. → Task 1 test `recently edited pages join the shortlist`.
3. An image with no words — empty query → whole Notebook, not an empty prompt. → Task 1 test `empty query falls back to the whole notebook`.
4. Search throws (DB/embedding down) — whole Notebook, turn continues. → Task 1 test `a failing search falls back to the whole notebook` (inject a throwing search).
5. The picker names a page that was titles-only — it is rendered in full, because `renderSelection` resolves against the full `notebookPages`. → Task 3 test `a titles-only page the picker names renders in full`.

---

### Task 1: Search core and automatic indexing

**Files:**
- Create: `lib/search/query.mjs`, `lib/search/search.mjs`, `lib/search/shortlist.mjs`, `lib/search/notebook.mjs`, `lib/search/index-notes.mjs`
- Modify: `lib/knowledge.js` (`fillMissingKnowledgeEmbeddingsByKind` ~line 251; delete dead exports `knowledgeCatalogText`, `listKnowledgeDocuments`, `knowledgeEntryPassages`, `knowledgePassagesByTitles`, `unifiedContacts`, `unifiedTelephoneSet`, `rankPassagesLocally` after grepping that nothing outside tests imports them; delete tests that only cover them)
- Modify: `lib/notebook.js` (`syncNoteKnowledge` ~945, `fullNotebookContext` ~725)
- Test: `test/search-query.test.mjs`, `test/search-shortlist.test.mjs`, `test/search-notebook.test.mjs`

**Interfaces:**
- Produces:
  - `orQuery(text: string): string` — lower-cased `[a-z0-9]+` words of length ≥ 2, unique, first 24, joined `' | '`; `''` when none. Fed to `to_tsquery('english', …)`.
  - `searchPassages(query: string, { kinds = ['note','document'], limit = 30 } = {}): Promise<Row[]>` where `Row = { id, entryId, heading, content, location, kind, title, data, sourceRef, authority, lexical, semantic, score }` sorted by `score` desc (same row shape the old `searchKnowledge` returned, so `knowledgeHitToDocumentChunk` keeps working). Active entries only. Lexical arm: `setweight(to_tsvector('english', e.title), 'A') || p.search_doc` against `to_tsquery('english', orQuery(q))`, top 40. Semantic arm: `embedOne` via the existing `queryVector` pattern (LRU, move it here), `p.embedding <=> qv`, top 40. RRF `1/(60+rank)` summed + `0.001*authority/100`. Embedding failure → lexical arm only. DB error → throws. Empty `orQuery` and no vector → `[]`.
  - `shortlistQuery({ question, history = '', attached = '' }): string` — previous user message from `history` (the last line block attributed to the user; read `app/api/agent/route.js` ~294 and the client that builds `history` to find the format), then `question`, then `attached.slice(0, 1000)`, joined `\n`, capped at 2000 chars, trimmed.
  - `rankPages(hits: Row[], pages: Page[]): Page[]` — `hit.entryId` `note:<id>` ↔ `page.docId` `note:<id>`; best score per page; unknown ids dropped.
  - `buildShortlist({ ranked: Page[], pages: Page[], size: number, now = Date.now() }): Shortlist` with `Shortlist = { full: boolean, pages: Page[], why: Record<docId, 'match'|'recent'>, reason?: string }`. Takes `ranked.slice(0, size)`, then appends up to `RECENT_MAX` pages with `updatedAt` within `RECENT_MS` of `now`, newest first, not already present.
  - `fullShortlist(pages: Page[], reason: string): Shortlist` — `{ full: true, pages, why: {}, reason }`.
  - `shortlistText(shortlist: Shortlist, allPages: Page[]): string` — `full` → exactly `notebookFullText(allPages)` (import from `lib/templates/route.mjs`). Otherwise shortlisted pages as `### ${docTitle}\n${text}` joined by blank lines, then a blank line and `OTHER PAGES (titles only, text not shown):` followed by `- ${docTitle}` for every other page in `allPages` order. No shortlisted pages → only the titles block.
  - `notebookShortlist({ question, history, attached, pages, multi = false, search = searchPassages }): Promise<Shortlist>` — empty `shortlistQuery` → `fullShortlist(pages, 'no-text')`; `search(query, { kinds: ['note'], limit: 80 })` throws → `fullShortlist(pages, 'search-failed')` and `console.warn('[search] …')`; else `buildShortlist` with size `multi ? 20 : 12`.
  - `scheduleNoteEmbedding({ force = false } = {}): void` — fire-and-forget `fillMissingKnowledgeEmbeddingsByKind('note')`; single-flight (a call while running sets a rerun flag); without `force`, skipped if the last start was < 60000 ms ago; wrapped in `waitUntil` from `@vercel/functions`; errors → `console.warn('[search] note embedding: …')`, never throws.
  - `fillMissingKnowledgeEmbeddingsByKind('note')` now accepted; every kind processes at most 200 passages per call (`LIMIT 200`).
  - `fullNotebookContext()` memoised per server instance, keyed by one query: `SELECT (SELECT count(*)::text || ':' || coalesce(max(updated_at)::text,'') FROM notes) || '|' || (SELECT count(*)::text || ':' || coalesce(max(id),0)::text FROM note_attachments) AS v`. Same return value as today.

- [ ] **Step 1: Write failing tests** — `test/search-query.test.mjs`: `orQuery('How do I refer to the District Nurse?')` → `'how | do | refer | to | the | district | nurse'`; `orQuery("2WW o'brien")` → `'2ww | o | brien'` minus `'o'` (length < 2) i.e. `'2ww | brien'`; `orQuery('?? !!')` → `''`. `test/search-shortlist.test.mjs` (fixture of 5 pages with `docId`, `docTitle`, `text`, `updatedAt`): `rankPages` orders by best passage score and drops unknown ids; `buildShortlist` caps at `size`; `recently edited pages join the shortlist` (page edited 10 min ago, not ranked → included with `why === 'recent'`; one edited 2 h ago → not); recent pages capped at 5; `shortlistText` lists shortlisted pages in full and every other title exactly once under `OTHER PAGES (titles only, text not shown):`; `full` shortlist text `===` `notebookFullText(pages)`; `shortlistQuery includes the previous user message`. `test/search-notebook.test.mjs`: `empty query falls back to the whole notebook` (`reason === 'no-text'`); `a failing search falls back to the whole notebook` (injected `search` throws → `full === true`, `reason === 'search-failed'`); multi uses size 20 (injected search returns 25 hits).
- [ ] **Step 2: Run** `node --test test/search-query.test.mjs test/search-shortlist.test.mjs test/search-notebook.test.mjs` — expect FAIL (modules missing).
- [ ] **Step 3: Implement** the modules above; in `syncNoteKnowledge`, after the non-section `upsertKnowledgeEntry`, call `scheduleNoteEmbedding({ force: true })`; memoise `fullNotebookContext`; open `fillMissingKnowledgeEmbeddingsByKind` to `note` with the batch limit and rewrite its comment; delete the dead `lib/knowledge.js` exports. Leave `searchKnowledge` in place (Task 4 removes it).
- [ ] **Step 4: Run** the three test files — PASS; then `npm test` — all pass.
- [ ] **Step 5: Live check** (needs `.env.local`): a scratch script in the scratchpad dir (not the repo) that calls `fillMissingKnowledgeEmbeddingsByKind('note')` until it returns 0, then `searchPassages('refer to district nurse', { kinds: ['note'] })` and prints the top 5 titles. Report the counts and titles. Delete nothing from the DB.

### Task 2: Remove the router and dead search code

**Files (delete unless noted):**
- `lib/routing/**`, `app/api/routing/**`, `scripts/routing-seed.mjs`, `scripts/routing-embed.mjs`, `scripts/routing-stats.mjs`, `scripts/routing-questions.mjs`, `evals/routing/bench-pages.mjs`, `test/routing-additive.test.mjs`, `test/routing-decision.test.mjs`, `test/routing-normalise.test.mjs`, `test/routing-clarify-shape.test.mjs`
- Modify `app/api/agent/route.js`: remove the `routeQuestion` block (~1160–1182) and its imports so the picker always runs when no earlier branch answered; leave everything else in the file alone (Task 3 owns the rest).
- Modify `app/_components/QaApp.jsx` (~608 tap → `/api/routing/learn`): remove the call and anything only it used.
- Modify `app/settings/page.js` (~156–158, 222–232, 426–479) and `app/api/settings/route.js` (~9, 32, 69): remove Router on/off, Answer at, Ask at, Clear lead.
- Modify `lib/db.js`: remove `ensureRoutingSchema` and `ensureSnomedSchema` and their callers.
- Modify `package.json` `scripts`: remove `routing:*`, `rag:migrate-legacy`, `data:ers`. Do not touch `version`.
- Delete dead code: `rag/migrate-legacy.mjs`; `lib/referrals/ers-lookup.js` (`lookupErsMapping` and helpers), `scripts/ingest-snomed-ers.mjs`, `test/ers-lookup.test.mjs` (keep `ereferrals.csv` — it is data); `lib/referrals/route-determination.mjs` and `lib/referrals/scope.mjs` and tests that only cover them; `matchContacts`/`matchContactsIn` in `lib/contacts.js`; `groundedTitles` in `lib/questions/grounding.mjs`; `notebookPageFor` in `lib/templates/contracts.mjs`.
- Do **not** touch `lib/knowledge.js`, `lib/notebook.js`, `lib/search/**` (Task 1 owns them).

**Interfaces:**
- Consumes: nothing new.
- Produces: an agent route with no router step; a `/settings` page and `/api/settings` with no routing keys.

- [ ] **Step 1:** Before each deletion, `grep -rn` the symbol/file across `app lib scripts evals test rag extension` and confirm the only users are the ones being deleted. If anything live uses it, keep it and report it.
- [ ] **Step 2:** Delete/modify as listed. Rewrite comments that mention the router so they don't describe removed code (e.g. route.js comments referring to "the router", `lib/agent/note-scan.mjs` header — comment-only edits there are fine).
- [ ] **Step 3: Run** `npm test` — all remaining tests pass; `npx next lint` reports no new errors in touched files.
- [ ] **Step 4: Run** `grep -rn "routing_enabled\|routeQuestion\|routing_triggers\|lookupErsMapping\|/api/routing" app lib scripts evals test` — expect no matches (except the untouched-table note if you add one to ARCHITECTURE.md).

### Task 3: The turn uses the shortlist

**Files:**
- Modify: `app/api/agent/route.js` (~464–498 notebook loader comment, ~1034–1060 load/scan, ~1076 `decompose`, ~1117–1154 referral read, ~1184–1224 picker, ~1300–1336 prose + `verifiedNumbers`)
- Modify: `lib/templates/route.mjs` (`notebookFullText` docblock ~227–248, `PROSE_SYSTEM_WITH_NOTEBOOK` ~282–298, `proseSystemPrompt` ~300–319, `selectionPrompt` ~321–408 incl. lines that say "every page … in full")
- Modify: `lib/agent/referral-read.mjs` (`referralReadPrompt` ~84–109; delete `referralPages` ~121–131)
- Modify: `lib/agent/note-scan.mjs` (replace `scanNotes`)
- Test: `test/prose-notebook.test.mjs`, `test/referral-read.test.mjs`, `test/note-scan.test.mjs`, `test/nel-contracts.test.mjs:270-279`, plus any other test the run turns red

**Interfaces:**
- Consumes: Task 1's `notebookShortlist`, `shortlistText`, `scheduleNoteEmbedding`, `orQuery`.
- Produces: `scanShortlist(shortlist: Shortlist, pages: Page[]): Scan` in `lib/agent/note-scan.mjs`, same wire shape as today's `scanNotes` (`total`, `sections`, `terms`, `matched`, `matches[{index,title,section,terms}]`, server-only `find`, `rowAt`), where `matches` are the shortlisted pages in shortlist order (first 6), `matched` is the shortlist length, `terms` the `orQuery` words of the question (first 12). `scanEvent` and `chosenOnScan` unchanged.

- [ ] **Step 1: Write failing tests:** update `test/prose-notebook.test.mjs` to the new contract — `proseSystemPrompt(shortlistText(...))` contains the shortlisted page bodies and the `OTHER PAGES (titles only, text not shown):` block and tells the writer titles-only pages' text is not shown; a full fallback still contains every page byte-identical. `test/note-scan.test.mjs`: `scanShortlist` returns shortlist pages as matches with today's wire keys. New test `a titles-only page the picker names renders in full`: `renderSelection({ template: 'notebook', pages: ['Notebook: A / Off list'] }, 'q', allPages, {})` renders that page's full text when it was not in the shortlist. `test/referral-read.test.mjs`: drop `referralPages` cases; the prompt embeds the text it is given.
- [ ] **Step 2: Run** those files — expect FAIL.
- [ ] **Step 3: Implement** in route.js: call `scheduleNoteEmbedding()` once at turn start (before commands, so command turns also catch up); move `decompose = looksMultiIntent(question)` above the Notebook load; after `notebookPages = await notebook()`, `shortlist = await notebookShortlist({ question, history, attached, pages: notebookPages, multi: decompose })` and `notebookText = shortlistText(shortlist, notebookPages)`; the picker, the prose system prompt and the referral read all receive `notebookText`; `verifiedNumbers` receives `notebookFullText(notebookPages)` so the number allow-list is unchanged; `noteScan = scanShortlist(shortlist, notebookPages)`. Add `shortlist: { size: shortlist.pages.length, full: shortlist.full, reason: shortlist.reason || '' }` to the turn log payload. Rewrite the prompt wording and every stale comment that claims the whole Notebook / "no third state" / 26k tokens / catalogue fallback / list commands reading the Notebook.
- [ ] **Step 4: Run** the test files — PASS; `npm test` — all pass.

### Task 4: `/practice` on the new search, old search removed, bench and docs

**Files:**
- Modify: `app/api/agent/route.js` (~640 `/practice`): `searchKnowledge(q, 12, { kind: 'document', semantic: true })` → `searchPassages(q, { kinds: ['document'], limit: 12 })`
- Modify: `lib/knowledge.js`: delete `searchKnowledge` and its `queryVector` cache if Task 1 moved it (grep for other callers first; the admin routes use `listKnowledge`, not this)
- Modify: `evals/routing/bench-picker.mjs`: build the prompt with `notebookShortlist` + `shortlistText` (live search) instead of `notebookFullText`; keep its verdicts and `meanInputTokens`
- Modify: `ARCHITECTURE.md` (Notebook/knowledge/search sections incl. the stale `NOTEBOOK_FULL_MAX_CHARS` line ~462), `evals/routing/results.md` header note that bench-pages was removed with the router
- Test: `test/practice-answer.test.mjs` and any test mocking `searchKnowledge`

- [ ] **Step 1:** grep `searchKnowledge` everywhere; switch the caller; delete the function; update tests that referenced it.
- [ ] **Step 2: Run** `npm test` — all pass.
- [ ] **Step 3: Run** `node evals/routing/bench-picker.mjs <scratchpad>/picker.json --repeats 1 --concurrency 3` and report `pageCorrectRate`, `pageWrongRate`, `meanInputTokens`, `meanMs`. Do not open the cases file.
- [ ] **Step 4:** Update the docs listed above to describe `lib/search/` as the one search system.
