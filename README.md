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
- **`public/assets/`** — logos, EMIS screenshots, and served document copies.

## Configuration

Set these in `.env.local` (see `.env.local.example`):

| Variable | Purpose |
| --- | --- |
| `OPENROUTER_API_KEY` | OpenRouter API key (server-side only). |
| `OPENROUTER_AI_MODEL` | Chat/vision model slug, e.g. `anthropic/claude-sonnet-4.6`. Must be vision-capable. |
| `OPENROUTER_EMBED_MODEL` | Embedding model (default `openai/text-embedding-3-small`). |

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
