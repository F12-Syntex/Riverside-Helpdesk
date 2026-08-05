# Riverside Practice Q&A

A document-grounded reception Q&A assistant for The Riverside Practice. Staff ask
how to do something in EMIS Web (or what to do at the front desk) and get a
step-by-step answer drawn strictly from the practice's own documents, with
clickable sources they can open in-browser.

## How it works

- Questions go to `POST /api/agent`, an **agentic loop** built on the Vercel AI
  SDK and routed through **OpenRouter**. Retrieval is a *tool the model calls*,
  not a fixed step that happens before it: it searches the practice's material
  as many times as the question needs, opens a whole Notebook page when a
  fragment is not enough, and can search the web when the practice's own
  material genuinely does not cover the question. The API key and server-side
  knowledge never reach the browser.
- The tools it has: `search_practice` (documents + Notebook + EMIS guides),
  `list_practice_sources`, `outline_practice_sources`, `open_practice_sources`,
  `search_web`, `read_web_page`, `find_contact`, `check_rota` and
  `suggest_ers_referral_route`. The practice's own material always gets first
  refusal — a web search with no practice lookup behind it triggers one
  automatically.
- **Every tool takes a list.** Three wordings of a search, or four files to
  read, go in one call: the loop is capped at six steps, and a step spent
  asking for something already decided on is a step not spent reading.
- **A contact question is answered with a contact.** `find_contact` tries the
  practice directory, then the CQC register, then reads the actual web pages and
  lifts the number off them. What it finds is shown in the contacts card as
  structured data, with a line saying where it came from — never retyped through
  the model's prose, where an unverified number is stripped out.
- **The model chooses the files.** Nothing is pre-selected for it by embedding
  similarity: `list_practice_sources` shows every Notebook page, document and
  guide with a summary, `outline_practice_sources` shows a document's headings
  without its text so the wrong part is never paid for, and
  `open_practice_sources` reads the ones it picks — several at a time.
  Notebook pages come back whole; documents come back a part at a time with an
  outline of the rest, and the parsed file is cached between calls, so reading
  a long policy costs the parts that were needed rather than the whole file.
- Every tool call is **streamed to the browser as it happens** (newline-delimited
  JSON), so the chat shows which search ran and what it returned instead of a
  silent spinner. The timeline collapses to one line once the answer arrives.
- **The same question is not researched twice.** An answered question is kept in
  Postgres (`answer_cache`) and served again in milliseconds — matched exactly
  when the wording only differs in case, punctuation or politeness, and by
  embedding similarity when it is genuinely reworded, so "what's the process for
  reporting a significant event" finds the answer given to "how do I report a
  significant event". The card says **"Answered from cache"** with when it was
  saved and, when the wording differed, the question it was written for; a
  **Reload** button on the card asks it again for real. Answers are only ever
  served while the Notebook they were written from and the model that wrote them
  are unchanged (see `lib/answer-cache/`), and follow-ups, messages with images,
  triage, filing titles and "I could not find anything" are never cached.
- Answers go through a **validation loop**: each section must carry a verbatim
  quote that really appears in the source it names, checked in code against what
  the tools actually returned. Failures go back to the model once with the
  specific reason, and anything still unverified is dropped rather than shown.
- Provenance is explicit. Practice-backed sections carry an openable citation;
  anything from a web page is marked "from the web" with a link and never
  presented as practice policy; whatever the practice's material does not cover
  is stated plainly, with who to ask, rather than filled in from model knowledge.
- **A referral the Notebook does not cover still gets a speciality and a clinic
  type.** They are determined from the practice's own e-RS referral-types export
  (via SNOMED), filled into the e-RS card, and shown with what they were
  determined from — the concept, the list, the closeness of the match and the
  other close pairings — under a heading saying they are not recorded in the
  practice's notes and must be checked against the doctor's task. **Only for a
  referral somebody is actually sending on e-RS**: a referral arriving from a
  hospital, one already sent and being chased, a waiting time or a policy that
  merely uses the word gets no e-RS card and no referral steps
  (`lib/referrals/scope.mjs`).
- One message box, no modes to pick. The assistant works out for itself whether
  a message is a **how-to question** or an **incoming patient request to triage**
  (for example an Accurx online consultation) and replies with the matching
  shape. A pasted document or an incoming patient request is recognised by the
  agent and handed to `POST /api/ask`, which still produces those two cards
  unchanged — the model returns a `kind` of `"answer"`, `"triage"` or
  `"docfile"`:
  - **answer** — the step-by-step how-to described above.
  - **triage** — grounded *action notes*: an urgency band, the actions to take,
    who to route it to, safety-net red flags and an optional draft reply. This
    is **care navigation / routing only** — it applies the practice's own triage,
    duty-doctor and signposting protocols and never diagnoses or gives clinical
    advice. Same `POST /api/ask` request path, same source-checked citations.

## Layout

- **`app/page.js`** — the chat UI (React). Persists chat + custom guides to
  `localStorage`.
- **`app/api/agent/route.js`** — the assistant's brain: the research tool loop,
  the compose + validate phases, and the NDJSON event stream the chat reads.
- **`lib/agent/`** — `tools.mjs` (the tools, every one of them list-taking), `evidence.mjs` (what the tools
  actually returned, and quote verification against it), `compose.mjs` (the
  structured answer + the validate-and-repair loop), `web-search.mjs`
  (OpenRouter's web-search server tool).
- **`app/api/ask/route.js`** — the previous single-shot endpoint, still used for
  the document-filing and triage card shapes the agent hands off to.
- **`lib/guides/`** — the built-in practice guides, categories and helpers.
- **`lib/ai/`** — prompt builder + response parser for the hand-off endpoint
  (server), the streaming `askAgent` client (`agent-client.js`) and the older
  `askQuestion` helper.
- **`rag/`** — the document knowledge base: ingest pipeline, parsers (including
  vision image reading and PDF page rendering), and the runtime retrieval store.
  See `rag/README.md`.
- **`app/notebook/`** + **`app/api/notebook/`** + **`lib/notebook.js`** — the
  in-app Notebook: practice notes/instructions (with sub-notes) stored in
  Postgres and edited at `/notebook`. Every non-empty page is read fresh and
  supplied in full to every Q&A request (no rebuild or retrieval cutoff).
- **`lib/ai/context.mjs`** + **`rag/context/`** — optional extra supplementary
  context (direct URLs, or committed files in `rag/context/`), reconciled into
  the same store. See `rag/context/README.md`.
- **`lib/contacts.js`** + **`lib/contacts.data.json`** — the deterministic
  telephone directory (exact numbers shown verbatim, never authored by the AI).
- **`lib/lookup/`** + **`/lookup`** — Instant Lookup, a search of the **CQC
  register**: every service registered in England, ~57k rows in
  `cqc.data.json.gz`. Far too large for a phone, so `cqc.js` searches it on the
  server behind `/api/cqc`. Matches on name, town, postcode (either half),
  service type, phone number, and **acronyms** taken from the initials of each
  name — HUH reaches Homerton University Hospital, MEH reaches Moorfields.
  Rebuild from a newer CQC CSV export with `npm run data:cqc -- <path-to-csv>`;
  numbers are verbatim from the export (the script only restores the leading
  zero the spreadsheet drops). The practice's own directory
  (`lib/contacts.data.json`, `/api/directory`) is no longer searched here — it
  still backs the assistant's contacts card.
- **`lib/lookup/contact-extract.mjs`** + **`lib/lookup/web-contact.mjs`** — how a
  number is found for something neither the directory nor the register holds.
  The web search picks the pages; the pages are then **fetched and read**, and
  their `tel:`/`mailto:` links and visible numbers are pulled out verbatim
  (`/api/lookup-web`, and the agent's `find_contact`). Runs that are not numbers
  to ring — a charity registration, an NHS number, a date — are rejected by
  shape and by the words around them. No digit anywhere on this path is written
  by a model, so the guarantee is the same as for the committed directory.
- **`lib/referrals/`** + **`scripts/ingest-snomed-ers.mjs`** — the referral-routing
  fallback. `ereferrals.csv` is the closed list of Specialty + Clinic Type
  pairings e-RS accepts (406 of them); the SNOMED CT description snapshot gives
  the clinical wording to reach them. `npm run data:ers` loads both into Postgres
  (`ers_directory`, `snomed_terms`). A note resolves to a SNOMED concept, then the
  concept and the note's own words are scored against the pairings, weighted by
  how rare each word is across the list. **The Notebook comes first** — this runs
  only when the Notebook records no speciality and clinic type, and everything it
  returns is labelled a suggestion to check against the doctor's task. There is
  no published SNOMED-to-e-RS mapping (no edition of the UK release carries an
  e-RS refset), so the join is made on text and is never presented as authoritative.
  `route-determination.mjs` settles which of the two the e-RS card is showing
  after the answer is written: a pairing the Notebook records is shown as it
  stands, while one determined here fills the card in and carries its provenance
  onto it — the SNOMED concept, the e-RS referral-types list, how close the match
  was and what else was close. A determined pairing the writer labelled as the
  practice's own is relabelled, so it can never reach the reader unmarked.
  `scope.mjs` decides whether any of this applies: it tells a referral being
  *made* from one arriving, one being chased, or the word simply appearing in a
  policy question, and it reads the written answer for whether the referral goes
  on e-RS at all. Every stage is gated on it — the lookup, the research tool, the
  card the writer produced and the card filled in afterwards — so four e-RS
  fields never appear above an answer with no e-RS form behind it.
- **`lib/answer-cache/`** — answers already given, so the same question is not
  researched twice. `match.mjs` holds the free half (the canonical form of a
  question, hashed to a key, and the rules for what may be cached at all);
  `store.js` holds the Postgres half (exact key, then nearest question by
  embedding, both filtered on the Notebook fingerprint and the model that wrote
  the answer). Read before the agent runs and written after it, and never on the
  critical path: if the cache is unavailable the question is simply answered the
  slow way.
- **`lib/settings.js`** + **`lib/model-id.mjs`** + **`/settings`** — runtime
  settings in Postgres (`app_settings`), not the environment. Today that is the
  AI model: `/settings` fuzzy-searches the live OpenRouter catalogue
  (`/api/settings/models`) and stores the chosen slug, so the model can be
  changed without a redeploy. `model-id.mjs` is the id itself — validation plus
  the split/join of the routing variant (`openai/gpt-oss-120b:nitro`), with no
  database import, so the browser validates with exactly the rule the save uses.
- **`lib/knowledge.js`** + **`/knowledge`** — the canonical Postgres knowledge
  layer and localhost-only backend screen. The source types share storage and
  conflict review, while the live assistant keeps their context paths separate.
- **`lib/routes.js`** + **`/index`** — one registry of every route the app
  serves, and the deep index built from it. The landing page at `/` stays two
  links on purpose; `/index` is the whole list — pages and API endpoints, with
  what each is for and which are kept off the front. (The page lives in
  `app/site-index/` and is rewritten onto `/index` in `next.config.mjs`:
  `index` is a reserved route name in the App Router.) Add a route here and it
  appears on the index and reads properly in the audit log.
- **`lib/audit/`** + **`/stats`** — the activity audit log: pages opened,
  questions asked, actions taken and requests that failed, **grouped by machine
  rather than by IP address**. Every machine at the practice shares one public
  address and a laptop changes address between the car park and the consulting
  room, so the browser mints a random id per machine instead and keeps it
  (`machine.js`); no IP address is stored. `client.js` wraps `window.fetch`
  once, so every route is covered without a line of logging in any of them, and
  batches are flushed with `sendBeacon` so the last thing done before a machine
  is switched off still reaches the log. `describe.js` holds the privacy rule
  that matters: for the tools patient text is pasted into (`/api/signpost`,
  `/api/reason`, `/api/docfile` and the rest of `CONTENT_NEVER_RECORDED`) the
  log records that the tool was used and how much text was pasted — never the
  text. Stored in `audit_machines` / `audit_events`; `/stats` is deliberately
  not linked from the tools page or the menu.
- **`public/assets/`** — logos, EMIS screenshots, and served document copies.

## Knowledge paths

The assistant keeps each source type predictable:

- **Documents:** chosen by the agent, not by a vector. PostgreSQL full-text
  (`GIN`) search points it at a title; the catalogue lists every document with a
  summary; `open_practice_sources` serves one ~6k-character part at a time with
  an outline of the rest, from a cache keyed on the document's revision.
- **Notebook:** every non-empty page is loaded fresh from the live Notebook
  tables on every request and is never chunked or shortened. The agent searches
  those whole pages lexically and can pull any of them into the answer in full
  via `open_practice_sources`, so a long process is never truncated to a snippet.
- **Contacts:** the one remaining embedded corpus, because a caller asks for
  "the district nurses" rather than a title. A full-text + semantic search
  retrieves matching
  structured directory entries. Telephone numbers and emails are displayed
  deterministically rather than copied by the AI.
- Document and Notebook output still requires a server-verified verbatim quote.
- `rag:ingest` updates portable parsed artefacts; a persisted bundle fingerprint
  automatically reconciles only changed documents on the next runtime check.
- Source passages are analysed into exact-quote claims once per content hash.
  Candidate disagreements are reasoned over and only high-confidence, mutually
  exclusive claims appear as contradictions.
- `/knowledge` and `/api/knowledge/**` are deliberately available only from a
  loopback host in development; they return 404 in deployed production. The
  public app contains no link to this backend.
- `/api/knowledge/sync` idempotently reconciles the processed file bundle,
  Notebook and contacts. A legacy document/contact fallback keeps a fresh
  deployment available while its first canonical index builds in the background.

## Configuration

Set these in `.env.local` (see `.env.local.example`):

| Variable | Purpose |
| --- | --- |
| `OPENROUTER_API_KEY` | OpenRouter API key (server-side only). |
| ~~`OPENROUTER_AI_MODEL`~~ | **Gone.** The chat/vision model is a practice setting now: change it at `/settings`, where it is picked from the live OpenRouter catalogue and stored in Postgres (`app_settings`). Defaults to `google/gemini-3.5-flash-lite`. Should be vision-capable — the ingester reads images with it whenever the fast model cannot. A **routing variant** can be pinned to it there too — `:nitro` (fastest provider), `:floor` (cheapest), `:free`, `:online`, or anything else typed, e.g. `openai/gpt-oss-120b:nitro` — and a full id can be typed straight into the search box when the catalogue does not list it. |
| `OPENROUTER_EMBED_MODEL` | Embedding model for the contact directory, the committed `rag/` index and the answer cache's question matching (default `openai/text-embedding-3-small`). Documents and Notebook pages are no longer embedded. |
| `OPENROUTER_ANALYSIS_MODEL` | Optional default for the **fast** role — the reading: the agent's research loop, claim extraction, the medicine-name extractor, the ingester's image transcription. Wants a cheap model that calls tools reliably. |
| `OPENROUTER_WEB_MODEL` | Optional default for the **web search** role — searching the internet and reading a page for a phone number. A search-grounded model such as `perplexity/sonar` belongs here. Falls back to `OPENROUTER_MEDICATION_MODEL`, then `OPENROUTER_ANALYSIS_MODEL`. |
| `DATABASE_URL` | Neon Postgres. Powers the staff rota and the Notebook. |
| `SUPPLEMENTARY_CONTEXT_URLS` | Optional. Direct text/markdown/JSON URLs to inject as extra supplementary context (the Notebook is the main channel and needs no config). |

### Model roles

One turn is not one job, and it splits cleanly in two. **Reading** — searching
the practice's material, skimming what comes back, choosing the next file to
open, pulling the names out of a pasted list, transcribing a screenshot — is most
of the model calls in a turn and none of its output. **Deciding** is the answer
itself and every judgement in it: one call, and the only thing anybody reads.

So `/settings` picks the model the practice runs on — the **reasoning** role,
which decides and writes — and two optional overrides sit beside it: **fast**,
which does the reading (the agent's research loop, claim extraction, the
medicine-name extractor, the ingester's image transcription), and **web search**,
a search-grounded model such as `perplexity/sonar` for the internet and for
reading a page to lift a number off it. Each is stored in `app_settings`, so
changing one needs no redeploy. There is no separate vision role: the ingester
reads images with the fast model and falls back to the reasoning model if that
one cannot see.

Every role is optional. Unset, it falls back to the environment variable that
used to carry it and then to the reasoning model, so an install that has only
ever chosen one model is completely unaffected.

**The answer is always written by the reasoning model.** That is deliberate and
not a tunable: writing is the one job that needs the whole context held at once —
every source, the conversation, which claims the practice's own material actually
backs, and what the reader will do next. The cheaper roles exist to keep work
*away* from that model (the reading, fewer sources put in front of it, background
jobs); they never take the writing, or a judgement inside it, off it.

The one risk in moving the research loop off the reasoning model is a fast model
too weak to drive tools: it answers in prose instead of searching, and the turn
reports "the practice has nothing on this" for a question the Notebook covers in
full. That failure is silent, so it is caught in code — a loop that ends without
having called a single tool, or one that fails outright, is run again on the
reasoning model (`lib/agent/research-model.mjs`). A loop that searched and found
nothing is *not* re-run: that is a finding, and "the practice's material does not
cover this" is the right answer to it.

### What a question costs

Each row on `/settings` shows its model's advertised rate — input and output per
1M tokens, live from the OpenRouter catalogue — and, underneath, the tokens a
question really used on that role. A rate is not a cost: what a question costs is
the rate multiplied by how many tokens *this* practice's questions use, and that
depends on its Notebook, its documents and how staff word things. Two installs on
one model differ by more than two models on one install.

So it is measured, not assumed. Every phase of every turn writes a row to
`ai_usage` — role, model, tokens in, tokens out, no question text — and the page
averages the last 30 days *per question* (not per call, so a repaired answer
counts as the one question it was).

**Measurements belong to the model that produced them.** Tokens measured on one
model say nothing about the next: a terser model writes fewer, a hungrier one
reads more, and pricing yesterday's counts at today's rate reports a number that
was never true of either. So a change of model shows nothing until it has been
used — and changing back brings the old model's record back untouched, because
nothing is ever reset or deleted. A **cost per question, by model** table lists
every model that has answered anything, marking the ones in use.

A role nobody has run on its current model, or one whose model publishes no
price, is excluded from the total and named as excluded. Unpriced models sort
last in the table rather than cheapest — unknown is not $0.

The writer is also given less to read than the research loop found: sources are
ranked against the question and the weakest held back (`lib/agent/select.mjs`),
because the loop opens sources for the price of a database query while the
writer pays the reasoning model's input rate for every character. Nothing is
lost — the full set stays in the evidence registry, which is what quotes are
still validated against.

## Run

```bash
npm install
npm run dev        # http://localhost:3000
npm run build && npm run start
```

## Knowledge base

```bash
npm run rag:status    # what's indexed / pending
npm run rag:ingest    # process new or changed documents in rag/sources/
```

See `rag/README.md` for the data standard, parsers, citations and storage notes.

## Notes

- Administrative help for receptionists only — never clinical or medical advice.
  It refuses clinical questions and escalates possible emergencies (call 999 /
  alert a clinician).
