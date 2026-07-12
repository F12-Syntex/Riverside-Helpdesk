# Riverside Practice Q&A

A document-grounded reception Q&A assistant for The Riverside Practice. Staff ask
how to do something in EMIS Web (or what to do at the front desk) and get a
step-by-step answer drawn strictly from the practice's own documents, with
clickable sources they can open in-browser.

## How it works

- Questions go to `POST /api/ask`, which retrieves the most relevant passages
  from the knowledge base, builds the prompt, calls the model via **OpenRouter**,
  and returns a structured answer with citations. The API key and the full
  knowledge base never reach the browser.
- Answers are grounded **strictly** in the documents: every answer cites the
  source(s) it used, and if the answer isn't in the knowledge base it says so
  rather than guessing.
- One message box, no modes to pick. The assistant works out for itself whether
  a message is a **how-to question** or an **incoming patient request to triage**
  (for example an Accurx online consultation) and replies with the matching
  shape — the model returns a `kind` of `"answer"` or `"triage"`:
  - **answer** — the step-by-step how-to described above.
  - **triage** — grounded *action notes*: an urgency band, the actions to take,
    who to route it to, safety-net red flags and an optional draft reply. This
    is **care navigation / routing only** — it applies the practice's own triage,
    duty-doctor and signposting protocols and never diagnoses or gives clinical
    advice. Same `POST /api/ask` request path, same source-checked citations.

## Layout

- **`app/page.js`** — the chat UI (React). Persists chat + custom guides to
  `localStorage`.
- **`app/api/ask/route.js`** — server endpoint: retrieval + prompt + model call
  + citation resolution.
- **`lib/guides/`** — the built-in practice guides, categories and helpers.
- **`lib/ai/`** — prompt builder + response parser (server) and the client
  `askQuestion` helper.
- **`rag/`** — the document knowledge base: ingest pipeline, parsers (including
  vision image reading and PDF page rendering), and the runtime retrieval store.
  See `rag/README.md`.
- **`app/notebook/`** + **`app/api/notebook/`** + **`lib/notebook.js`** — the
  in-app Notebook: practice notes/instructions (with sub-notes) stored in
  Postgres, edited at `/notebook`, and fed to the assistant automatically at
  request time as citable sources (no rebuild).
- **`lib/ai/context.mjs`** + **`rag/context/`** — optional extra supplementary
  context (direct URLs, or committed files in `rag/context/`), injected the same
  way. See `rag/context/README.md`.
- **`lib/contacts.js`** + **`lib/contacts.data.json`** — the deterministic
  telephone directory (exact numbers shown verbatim, never authored by the AI).
- **`lib/knowledge.js`** + **`/knowledge`** — the canonical Postgres knowledge
  layer and management screen. Documents, Notebook pages and contacts share one
  entry/passage model, hybrid retrieval, authority, claims and contradictions.
- **`public/assets/`** — logos, EMIS screenshots, and served document copies.

## Unified knowledge

The live assistant retrieves from one canonical Postgres store. Embeddings are
only an indexed search signal; the model reasons over the retrieved source text,
and document-backed output still requires a verified verbatim quote.

- PostgreSQL full-text (`GIN`) and semantic (`pgvector` HNSW) indexes are fused
  for fast exact and meaning-based retrieval.
- Notebook saves and future `rag:ingest` runs write through to the same store.
- Contacts remain structured data inside their canonical entries, so telephone
  numbers and emails are displayed deterministically rather than copied by AI.
- Source prose is analysed into explicit claims. Different active sources making
  incompatible claims appear under `/knowledge` → **Contradictions**; the
  assistant will not silently pick a side while a contradiction is open.
- `/api/knowledge/sync` is the idempotent migration bridge for the previous file
  RAG, Notebook and contacts stores. A legacy read fallback remains only so a
  deployment stays available before its first migration.

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
