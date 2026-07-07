# Supplementary context

Extra practice notes and triage instructions that the assistant reads **at
request time** and injects into its answers as citable sources — so it can act
on your own guidance (for example "sore throat → signpost to Pharmacy First")
without re-ingesting the knowledge base.

Unlike the main knowledge base in `rag/sources/` (which is embedded ahead of time
by `npm run rag:ingest`), supplementary context is **read live on every request**
(with a short cache). That means you can change it without a rebuild.

## Where it can come from

Three sources, gathered together:

1. **The Notebook (main, no redeploy).** Write notes at **`/notebook`** in the
   app. They're stored in Postgres and used on the next request — no keys, no
   setup. This is the recommended place for anything you edit often.

2. **URLs (no redeploy).** Any direct text/markdown/JSON links in
   `SUPPLEMENTARY_CONTEXT_URLS` (comma or newline separated) — a published note, a
   gist, or a file with a direct-download link.

3. **This folder (baseline).** `.md`, `.txt`, `.json`, `.csv`, `.yaml` files
   committed here ship with the app and are always available. Changing them needs
   a redeploy, so use this only for stable defaults. (`README.md` and `*.example`
   files are ignored.)

## How it is used

- Each note is split into chunks. **Short notes are treated as standing
  instructions and are always applied**; **longer notes are matched to the
  request** and only relevant parts are pulled in — so a large notebook stays
  affordable.
- Selected chunks are added as extra numbered **Sources**. The assistant must
  quote them, and the server verifies the quote — the same grounding every answer
  gets. Citations show as "Practice note: <name>".

## Keep it safe

- These notes are treated as authoritative. Write them as clear practice policy
  ("what to do"), not speculation.
- Do **not** put patient-identifiable information or secrets in here or in the
  Notebook.
- This is care navigation / routing guidance, not clinical advice — the assistant
  still never diagnoses.
