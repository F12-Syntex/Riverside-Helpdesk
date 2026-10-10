# Referrals Front Page and Jev Answer Check — Plan

> **For agentic workers:** two independent tasks, run in parallel on disjoint files. Steps use checkbox (`- [ ]`) syntax.

**Why.** The question log (423 questions, 24 Aug – 10 Oct 2026) shows referrals dominate: of 234 typed questions, 52% were answered with a referral card and 64% mention referral words. Receptionists arrive with a task — "complete this referral" — and type the referral the way they'd say it ("skin", "cancer skin", "nurse to visit at home"). Separately, the Q&A must say "I don't know" rather than give an answer that doesn't answer the question; the owner chose TypeSafe's **Jev** (OpenRouter decision model) to check that.

**Decided (owner said "implement whatever you think is best"; these are the orchestrator's calls):**
- `/` becomes the Referrals page; the Q&A moves to `/ask`. Menu: "Referrals" first, then "Ask a question".
- The referrals list is the Notebook's **Referrals** section only (70 pages, 38 typed `ersReferral`/`emailReferral` cards), minus hub pages. Not the 533-form NEL tree (`/form` keeps that).
- Search understands plain words: meaning (pgvector) first, keywords for instant results and exact names.
- UI matches the app's existing pages (AppShell, `app/lookup/page.js` look and classes). The brainstorm mockups were rejected — do not copy their styling.
- Jev checks every Q&A answer that came from the Notebook (page card, referral card, prose). Constants, no flags: below **0.5** → the turn answers "I don't know" with the closest pages and files the question as unanswered; **0.5–0.8** → the answer shows with a "check this" line; ≥ 0.8 → unchanged. A failed or slow check (> 3 s) never blocks or changes the answer.

## Global constraints

- No feature flags or env switches. Constants in code.
- Do not commit; do not change `package.json` `version`. The orchestrator commits.
- Never send patient data anywhere new beyond what the turn already sends: Jev gets the question, the answer and the source page text only, with `provider: { zdr: true, data_collection: 'deny' }` (verified accepted by TypeSafe on 2026-10-10).
- Match surrounding code style (ESM, explanatory comments, `node:test` tests in `test/*.test.mjs`). Baseline `npm test`: 890/890.
- Do not read `evals/routing/pages.md`, `cases.md`, `cases-hard.md`.
- Dev server: http://127.0.0.1:3000 (HMR). If AVG intercepts TLS in a scratch node script, set `NODE_EXTRA_CA_CERTS=C:\ProgramData\AVG\Antivirus\wscert.pem`.

---

### Task R: Referrals front page

**Owns:** `app/page.js`, new `app/ask/page.js`, new `app/api/referrals/route.js`, new `lib/search/referrals.mjs`, new `app/_components/ReferralsPage.jsx` (or similar), `app/_components/AppShell.jsx` (nav), `app/_components/QaApp.jsx` (only: accept an initial question from `/ask?q=`), `lib/routes.js` (route catalogue), `ARCHITECTURE.md` (a short section), new tests.
**Must not touch:** `app/api/agent/route.js`, `lib/settings.js`, `app/settings/**`, `app/api/settings/**`, `lib/templates/route.mjs`, `lib/ai/**`.

**Behaviour:**
- One search box, autofocused, results as you type (debounce ~250 ms; no button). Instant client-side keyword filter over the referral list (titles, typed fields, aliases), replaced by the server's ranked results when they arrive.
- Server ranking (`lib/search/referrals.mjs`): restrict to entries for pages in the Referrals section, excluding hubs (decide the rule from the data — e.g. pages with child pages, or the known index pages "Pathway index", "All specialities and clinic types", "Cancer referrals (2WW)"; justify in a comment). Rank by meaning first (pgvector cosine over the passages, best passage per page), then keyword matches. Typed cards are already indexed by their fields (`notebookIndexText` → `noteSearchText`). Reuse `queryVector` (budgeted) from `lib/search/search.mjs`. Must work lexical-only if embedding fails.
- Quality bar, checked live: "skin" → all four dermatology cards first; "cancer skin" → the 2WW dermatology card(s) in the top 2; "nurse to visit at home" → District Nurse first; "2ww breast lump" → 2WW Breast first; "heart tracing" → ECG in the top 2. If ranking falls short, improve it (e.g. weight title + typed fields over body text, or score against a per-page "referral text" of title + fields + aliases) — don't add synonyms lists in code; the cards' `aliases` field is where practice words go.
- Each result row: title, route chip (e-RS / Email, from `kind`), 2WW/urgent tag from `priority`. Top result expanded; clicking another expands it. The expanded card renders exactly as the Q&A renders that card (reuse the existing typed-card renderer used by `withKindCard`/the chat card components; plain pages render their page text the way a Notebook page answer does). Link to the page in Practice notes (`/notebook/...`).
- Empty box: the most-used referrals over the last 30 days from `question_log` (referral templates' sources), falling back to an A–Z list.
- Footer: "Not what you need? Ask a question" → `/ask?q=<typed text>`, which pre-fills (does not auto-send) the Q&A box.
- Pages are read via `fullNotebookContext()` (memoised) so results reflect live edits.

- [ ] Tests (pure parts): hub exclusion rule, result shaping (route chip, tag), ranking merge (meaning-first + keyword), empty-state fallback.
- [ ] Implement; `npm test` green.
- [ ] Live check the quality bar above against the dev server's `/api/referrals?q=…` and report the top 4 for each query.
- [ ] Load `/` and `/ask` in the dev server; confirm no console errors and the nav works. Report.

### Task J: Jev answer check

**Owns:** new `lib/ai/decisions.mjs`, new `lib/questions/answer-check.mjs` (or similar), `app/api/agent/route.js`, `lib/settings.js`, `app/settings/page.js`, `app/api/settings/route.js`, `lib/templates/route.mjs` (prose "I don't know" rule), `ARCHITECTURE.md` (DPIA/data-flow lines for Jev), new tests.
**Must not touch:** `app/page.js`, `app/ask/**`, `app/_components/**`, `lib/search/referrals.mjs`, `app/api/referrals/**`.

**Behaviour:**
- `lib/ai/decisions.mjs`: `decide({ model, state, questions, timeoutMs })` → POST `https://openrouter.ai/api/alpha/decisions` with the OpenRouter key and `provider: { zdr: true, data_collection: 'deny' }`; returns `answers`; throws on non-2xx/timeout. Request shape: `{ model, state, questions: { name: { type: 'noul', instructions, criteria: { true, false } } } }`; response `answers.name.noul` (0–1). Record usage cost via the existing usage recorder if it fits (role `check`).
- New settings role `check` ("Answer check"), default `typesafe/jev-latest`, stored like the other roles (`ROLE_SETTING_KEY`), shown on `/settings`. It is a decision model, not a chat model: it is NOT in OpenRouter's chat `/models` list, so the picker must allow typing the id (or offer the known TypeSafe ids) — read how the settings page picks models and fit in.
- In the agent route, after the final Notebook-based answer is decided (page card, referral card, prose) and before it is sent: one `noul` question — "Does the answer actually answer the question that was asked, using the practice information it was given?", criteria true "It gives the reader what they asked for", false "It answers a different question, is vague or generic, or does not give what was asked." `state`: `{ question, answer (the text the reader will see), sources (the cited/chosen pages' text, trimmed to fit ~20k tokens) }`. Timeout 3000 ms. Not for slash commands, `/accurx`, clarify questions, or turns that are already a "not recorded"/failure answer.
  - `< 0.5`: replace the answer with an honest "I don't know" in the house tone: says the Notebook doesn't cover this, lists the closest shortlisted pages as links, and files the question with `noteUnansweredQuestion` (lib/questions/open.js) like other unanswered turns. Log `outcome`/`template` so stats can tell it apart (e.g. template `unknown:check`).
  - `0.5–0.8`: keep the answer, append a short markdown line asking the reader to check it against the page.
  - Always: record `{ check: { score, model, ms } }` in the turn's provenance; on failure `{ check: { error } }` and the answer is unchanged.
- Prose prompt (`PROSE_SYSTEM_WITH_NOTEBOOK`): add the rule that when the shown pages don't contain what was asked, the writer says it doesn't know, in one line, and names the closest page — never a generic answer.
- Thresholds 0.5 / 0.8 as named constants with a comment that they are starting values to tune on labelled turns.

- [ ] Tests: decisions client (request body incl. provider ZDR, timeout, error), the band logic (0.49 / 0.5 / 0.79 / 0.8 / failure), the "I don't know" answer shape, settings role default.
- [ ] Implement; `npm test` green.
- [ ] Live: one real `decide` call; then through the dev server one answerable question and one the Notebook can't answer (e.g. "what is the practice's parking policy for staff motorbikes?"); report scores and what the reader saw.
