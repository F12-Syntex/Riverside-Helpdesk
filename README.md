# Riva — EMIS Helper (The Riverside Practice)

A reception Q&A assistant for The Riverside Practice, implemented from the
Claude Design `Riva - EMIS Helper.dc.html`. Staff ask how to do something in
EMIS Web (or what to do at the front desk) and get a step-by-step answer.

Answers are drawn first from a curated set of practice guides (with EMIS Web
screenshots) and the practice's EMIS PDFs. Anything not covered is answered by
an LLM via **OpenRouter**, grounded in those same guides/PDFs and constrained
to admin/reception tasks (never clinical advice).

## Architecture

- **`app/page.js`** — the whole UI + logic (ported from the design's `DCLogic`
  component to a React class component). Runs in the browser; persists chat and
  custom guides to `localStorage`.
- **`app/api/ask/route.js`** — server route that proxies to OpenRouter. The
  client builds the full prompt (with retrieved guide/PDF context) and POSTs it
  here; the route relays it to OpenRouter and returns the model's text. The API
  key stays on the server and never reaches the browser.
- **`lib/emis-knowledge.js`** — `EMIS_KB`, searchable passages generated from
  the practice EMIS PDFs, used to ground AI answers.
- **`public/assets/`** — NHS logo and the EMIS Web screenshots used by guides.

## Configuration

Set these in `.env.local` (already present; see `.env.local.example`):

| Variable | Purpose |
| --- | --- |
| `OPENROUTER_API_KEY` | Your OpenRouter API key (server-side only). |
| `OPENROUTER_AI_MODEL` | The OpenRouter model slug to use, e.g. `anthropic/claude-sonnet-4.6`. |

## Run

```bash
npm install
npm run dev     # http://localhost:3000
```

For production:

```bash
npm run build
npm run start
```

## Notes

- This is administrative help for receptionists. It must not be used for
  clinical or medical advice; the assistant is instructed to refuse clinical
  questions and to escalate possible emergencies (call 999 / alert a clinician).
- One screenshot from the original design (`p42_1.png`, "add a consultation")
  was not part of the importable assets, so that step renders without an image.
