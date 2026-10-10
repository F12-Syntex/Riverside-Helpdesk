# Q&A as a Whole-Notebook Search with Clickable References — Plan

> **For agentic workers:** two tasks on disjoint files, run in parallel. Steps use checkbox (`- [ ]`) syntax.

**Why.** Referrals now have their own front page (`/`), so the Q&A (`/ask`) no longer needs to be a card-picking front door. The owner chose (2026-10-11): **the model reads the whole Notebook and writes a short answer, citing the pages it used as clickable links. The page picker and in-chat cards go from the Q&A; slash commands stay. No embeddings on the Q&A path.**

## Decided

- Non-command Q&A turns: load the full Notebook (`fullNotebookContext()`, memoised), put `notebookFullText(pages)` in the prompt, one model call writes the answer. No shortlist, no `searchPassages`, no picker, no referral read, no `renderSelection` cards on this path.
- **References are resolved by code, never invented.** The model cites a page by its exact heading as `[[Notebook: Section / Page]]` (the `### …` headings it was shown). Before the answer is sent, the server replaces each marker that names a real page with a markdown link `[Page](/notebook/<slug>-<id>)` (`notebookHref` in `lib/notebook/links.mjs`); a marker naming no real page becomes plain text and is logged. The answer ends with a "Sources" list of the linked pages.
- **Prompt caching:** the Notebook block is the first, byte-stable part of the system prompt, so providers that cache prefixes charge for it once. Mark it cacheable for providers that need an explicit marker (OpenRouter `cache_control: { type: 'ephemeral' }` on the content part — research how `@openrouter/ai-sdk-provider` passes it, e.g. `providerOptions.openrouter.cacheControl`). Record cached input tokens in `ai_usage` (new nullable column `cached_input_tokens`) so the saving is visible.
- **Kept:** the safety scan and its bands, the directory short-circuit (contact-number questions answered from Contacts with no model — not a Notebook card), slash commands (`/accurx`, `/practice`, `/form`, `/template`, `/coding`, `/consultation`, `/medication`, …), images (whole Notebook + the images role), the Jev answer check (sources = the cited pages' text; if none cited, the answer is checked against the question alone and "I don't know" applies as now), the "I don't know" card (its closest-page names become links), `verifiedNumbers` (whole Notebook), the question log + provenance (record cited page ids).
- **Removed as dead once the picker is gone** (grep each; delete only if nothing live uses it): `SELECTION_SCHEMA`/`MULTI_SELECTION_SCHEMA`/`selectionPrompt`/`selectionClarify`/the picker's `readValues` call site, `lib/agent/referral-read.mjs`, `lib/agent/note-scan.mjs` (the progress card's "notes" stage becomes a simple "Reading the Notebook — N pages"), `lib/search/notebook.mjs` (`notebookShortlist`), the shortlist parts of `lib/search/shortlist.mjs` only the Q&A used, `evals/routing/bench-picker.mjs` (it benchmarks the removed picker) and their tests. **Keep** everything the Referrals page (`lib/search/referrals*.mjs`), `/practice` (`searchPassages`) and note embedding (`scheduleNoteEmbedding`, `fillMissingKnowledgeEmbeddingsByKind`) use. Template renderers still used by slash commands stay.
- No flags. Don't commit; don't change `package.json` `version`. Don't read `evals/routing/pages.md`, `cases.md`, `cases-hard.md`. Baseline `npm test` 921/921. Dev server http://127.0.0.1:3000.

---

### Task A: The turn

**Owns:** `app/api/agent/route.js`, `lib/templates/route.mjs`, new `lib/questions/references.mjs`, `lib/questions/answer-check.mjs`, `lib/ai/usage.js`, `lib/db.js` (usage column only), `lib/agent/**`, `lib/search/notebook.mjs`, `lib/search/shortlist.mjs`, `evals/routing/**`, `ARCHITECTURE.md`, tests for these.
**Must not touch:** `app/_components/**`, `app/ask/**`, `app/page.js`, `lib/search/referrals*.mjs`, `app/api/referrals/**`.

- `lib/questions/references.mjs`: `resolveReferences(text, pages) → { text, cited: [{ docId, title, href }], unknown: [string] }`. Matches `[[…]]` against page `docTitle` with the shared normaliser (`notebookTitleKey`/`notebookLeafKey` in `lib/templates/notebook.mjs`), full path first, then leaf when unambiguous. Appends `\n\nSources: [A](href) · [B](href)` when anything was cited. Pure, tested (exact, leaf, unknown, duplicate, marker inside code/backticks left alone).
- Prose prompt rewritten for the new job: whole Notebook; answer only from it; cite every page used with `[[exact heading]]`; say "I don't know" in one line (naming the closest page as a marker) when it isn't there; keep the existing house rules (numbers, tone, safety) that still apply.
- The progress events still give the working card something true to show (pages read, then "Writing"); keep the event types the UI already handles, or coordinate via the shapes Task B documents.
- [ ] Tests first for `resolveReferences`, the prompt contract (`proseSystemPrompt` contains the whole Notebook first, the citation rule), answer-check sources from cited pages, usage cached-token recording.
- [ ] Implement; delete the dead code listed above; `npm test` green.
- [ ] Live through the dev server: "how do I book a blood test?", "what do I do with a hospital discharge letter?", "what is the parking policy for staff motorbikes?" — report the answer text with its links, input tokens and cached tokens on a second identical-prefix call, the Jev score, ms.

### Task B: Clickable references in the chat

**Owns:** `app/_components/chat/**`, `app/_components/QaApp.jsx`, `app/_components/AppShell.jsx` (only if needed), tests.
**Must not touch:** Task A's files.

- The chat's markdown renderers (`Md.jsx`, `Rich.jsx`, and whatever renders a prose answer — find it; `CiteChip.jsx` may already do citations for `/practice`) render `[text](href)` as links. Allowed hrefs: same-origin paths starting with `/` (open in the same tab via Next `Link`), and `https://` (new tab, `rel="noopener noreferrer"`). Anything else (`javascript:`, `data:`, relative oddities) renders as plain text. Escape everything else as today.
- A "Sources: [A](/notebook/…) · [B](…)" line renders as the existing chip style if one fits (e.g. `CiteChip`), else as links.
- The working card: if Task A replaces the "notes" scan stage with a simple page count, make `WorkingState.jsx` show "Reading the Notebook — N pages" without the grid of matches. Keep backward compatibility with old events in the log viewer if any.
- [ ] Tests for the link sanitiser (allowed/blocked hrefs) if the renderer logic is testable as a pure function (extract it if needed).
- [ ] Implement; `npm test` green; in the built-in browser at `/ask`, render a sample answer with links (a real turn once Task A lands, or a fixture) and confirm clicking a link opens the Notebook page; no console errors.
