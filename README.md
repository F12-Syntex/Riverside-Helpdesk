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
- The tools it has: `search_practice` (documents + Notebook),
  `list_practice_sources`, `open_practice_source`, `search_web` and
  `find_contact`. The practice's own material always gets first refusal — a web
  search with no practice lookup behind it triggers one automatically.
- **A contact question is answered with a contact.** `find_contact` tries the
  practice directory, then the CQC register, then reads the actual web pages and
  lifts the number off them. What it finds is shown in the contacts card as
  structured data, with a line saying where it came from — never retyped through
  the model's prose, where an unverified number is stripped out.
- **The model chooses the files.** Nothing is pre-selected for it by embedding
  similarity: `list_practice_sources` shows every Notebook page and every
  document with a summary, and `open_practice_source` reads the one it picks.
  Notebook pages come back whole; documents come back a part at a time with an
  outline of the rest, and the parsed file is cached between calls, so reading
  a long policy costs the parts that were needed rather than the whole file.
- Every tool call is **streamed to the browser as it happens** (newline-delimited
  JSON), so the chat shows which search ran and what it returned instead of a
  silent spinner. The timeline collapses to one line once the answer arrives.
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
  practice's notes and must be checked against the doctor's task.
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
- **`lib/agent/`** — `tools.mjs` (the four tools), `evidence.mjs` (what the tools
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
- **`lib/settings.js`** + **`/settings`** — runtime settings in Postgres
  (`app_settings`), not the environment. Today that is the AI model: `/settings`
  fuzzy-searches the live OpenRouter catalogue (`/api/settings/models`) and
  stores the chosen slug, so the model can be changed without a redeploy.
- **`lib/knowledge.js`** + **`/knowledge`** — the canonical Postgres knowledge
  layer and localhost-only backend screen. The source types share storage and
  conflict review, while the live assistant keeps their context paths separate.
- **`public/assets/`** — logos, EMIS screenshots, and served document copies.

## Knowledge paths

The assistant keeps each source type predictable:

- **Documents:** chosen by the agent, not by a vector. PostgreSQL full-text
  (`GIN`) search points it at a title; the catalogue lists every document with a
  summary; `open_practice_source` serves one ~6k-character part at a time with
  an outline of the rest, from a cache keyed on the document's revision.
- **Notebook:** every non-empty page is loaded fresh from the live Notebook
  tables on every request and is never chunked or shortened. The agent searches
  those whole pages lexically and can pull any of them into the answer in full
  via `open_practice_source`, so a long process is never truncated to a snippet.
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
| ~~`OPENROUTER_AI_MODEL`~~ | **Gone.** The chat/vision model is a practice setting now: change it at `/settings`, where it is picked from the live OpenRouter catalogue and stored in Postgres (`app_settings`). Defaults to `google/gemini-3.5-flash-lite`. Must be vision-capable — the ingester reads images with it. |
| `OPENROUTER_EMBED_MODEL` | Embedding model for the contact directory and the committed `rag/` index (default `openai/text-embedding-3-small`). Documents and Notebook pages are no longer embedded. |
| `DATABASE_URL` | Neon Postgres. Powers the staff rota and the Notebook. |
| `SUPPLEMENTARY_CONTEXT_URLS` | Optional. Direct text/markdown/JSON URLs to inject as extra supplementary context (the Notebook is the main channel and needs no config). |

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
