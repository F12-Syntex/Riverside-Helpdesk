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
  `list_practice_sources`, `open_practice_source` and `search_web`. The
  practice's own material always gets first refusal — a web search with no
  practice lookup behind it triggers one automatically.
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
- **`lib/lookup/`** + **`/lookup`** — Instant Lookup. The practice's own numbers
  (`directory.js`, `fuzzy.js`) are held on the device and filter on every
  keystroke. Beneath them sits the CQC register of every service registered in
  England — ~57k rows in `cqc.data.json.gz`, far too large for a phone, so
  `cqc.js` searches it on the server behind `/api/cqc` and it appears as a
  separate second section. Rebuild it from a newer CQC CSV export with
  `npm run data:cqc -- <path-to-csv>`; numbers there are read verbatim from the
  export (the script only restores the leading zero the spreadsheet drops).
- **`lib/knowledge.js`** + **`/knowledge`** — the canonical Postgres knowledge
  layer and localhost-only backend screen. The source types share storage and
  conflict review, while the live assistant keeps their context paths separate.
- **`public/assets/`** — logos, EMIS screenshots, and served document copies.

## Knowledge paths

The assistant keeps each source type predictable:

- **Documents:** PostgreSQL full-text (`GIN`) and semantic (`pgvector` HNSW)
  rankings retrieve the most relevant original passages from the document set.
- **Notebook:** every non-empty page is loaded fresh from the live Notebook
  tables on every request and is never chunked or shortened. The agent searches
  those whole pages lexically and can pull any of them into the answer in full
  via `open_practice_source`, so a long process is never truncated to a snippet.
- **Contacts:** a separate full-text + semantic search retrieves matching
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
| `OPENROUTER_AI_MODEL` | Chat/vision model slug, e.g. `anthropic/claude-sonnet-4.6`. Must be vision-capable. |
| `OPENROUTER_EMBED_MODEL` | Embedding model (default `openai/text-embedding-3-small`). |
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
