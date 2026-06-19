# Riverside knowledge base (RAG)

This folder is the practice's knowledge base. Drop documents of any type into
`sources/`, run one command, and the app's AI assistant (Riva) can find and cite
them. Raw documents live here, **outside** `public/`, so they are never served to
the browser.

## Workflow

```bash
npm run rag:status          # what's indexed, what's new/changed/unsupported
npm run rag:ingest          # process new or changed files only
npm run rag:ingest -- -f    # force re-process everything
npm run rag:migrate-legacy  # one-time import of lib/emis-knowledge.js
```

1. Copy files into `rag/sources/` (subfolders are fine).
2. `npm run rag:status` to see what will be processed.
3. `npm run rag:ingest`.
4. Commit the regenerated `rag/processed/` (and any new `public/assets/rag/` images).

Ingestion is idempotent — each file is hashed, so re-running only touches what
actually changed.

## The data standard

Every file type is converted by a **parser** into the same normalised *chunk*
record, so nothing downstream cares about the original format:

```jsonc
{
  "id": "safeguarding__c3",                 // stable, deterministic
  "docId": "safeguarding",
  "docTitle": "Safeguarding",
  "source": { "type": "pdf", "path": "rag/sources/safeguarding.pdf", "page": 4 },
  "headingPath": ["Reporting", "Out of hours"],
  "section": "Out of hours",
  "text": "…clean extracted text…",
  "images": ["assets/rag/safeguarding/page4.png"],
  "tokens": 180
}
```

Embeddings are stored separately (`embeddings.json`) keyed by chunk `id`.

### Processed artifacts (`processed/`)

| File | What |
|------|------|
| `catalog.json` | One entry per document: `title`, `summary`, `tags`. The always-on "awareness" layer (Tier A). |
| `chunks.jsonl` | One chunk record per line. |
| `embeddings.json` | `{ model, dim, ids, vectors }`, aligned to chunk order. |
| `manifest.json` | Per-document `{ path, sha256, size, mtime, chunks, title, processedAt }` — drives `rag:status`. |

## How retrieval works (two tiers)

- **Tier A — catalogue.** Every request includes the compact `catalog.json`
  (title + summary + tags per document), so Riva is *aware of everything* even
  when a specific chunk wasn't retrieved.
- **Tier B — semantic retrieval.** The question is embedded and the top few
  chunks by cosine similarity are pulled in full (with their images).

Both happen server-side in `app/api/ask/route.js` via `rag/lib/store.mjs`.

## Parsers (add a file type in one place)

Each module in `parsers/` exports `exts` and `async parse(filePath, ctx)` →
array of `{ text, headingPath?, section?, page?, images? }`. Register it in
`parsers/index.mjs`. That's the only change needed for a new format.

- **Images** (`.png/.jpg/.jpeg/.gif/.webp`) — read by the vision-capable chat
  model (`OPENROUTER_AI_MODEL`). **No OCR engine**, for consistency: one model
  understands every input. A display copy is written to `public/assets/rag/`.
- **Text / Markdown** (`.txt/.md`) — Markdown is split on headings.
- **PDF** (`.pdf`) — text extraction via `pdfjs-dist` (install on demand:
  `npm i pdfjs-dist`). This is extraction, not OCR; a scanned/image-only PDF has
  no selectable text — export its pages as images and ingest those, or add a
  page renderer here.
- **DOCX** (`.docx`) — raw text via `mammoth` (`npm i mammoth`).

## Storage: when to change approach

Chunk **count** (number of vectors), not total tokens, decides the tier:

| Approach | Good up to | Breaks because |
|----------|-----------|----------------|
| Keyword scoring | ~20–50 docs | recall — synonyms/paraphrases stop matching |
| **In-repo vector index (current)** | ~1,000–2,000 docs (≈50k chunks) | serverless memory + cold-start load (switch `embeddings.json` to Float32 binary at ~10k chunks) |
| Hosted vector DB (pgvector) | unbounded | crossed ~50k chunks, or need metadata filtering / live updates without redeploy |

The chunk schema is storage-agnostic, so moving to a database later is just
"write the same chunks to a different sink" — parsers, chunker and the retrieval
interface don't change.

## Embeddings

`openai/text-embedding-3-small` via OpenRouter (same `OPENROUTER_API_KEY`),
1536-dim, ~$0.02 per million tokens. Override with `OPENROUTER_EMBED_MODEL`.
