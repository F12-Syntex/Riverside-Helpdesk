# TODO — Riverside Helpdesk

Open work for the Riverside Practice Q&A assistant.

Every item below is traceable to something already written down in this
repository — nothing here is invented. The **Source** on each line points at the
document that records it. If a task has no source yet, write the source first.

**Last reviewed:** 2026-08-05

---

## Contents

- [Legend](#legend)
- [Security and access](#security-and-access)
- [Data protection](#data-protection)
- [Engineering](#engineering)
- [Open questions](#open-questions)
- [Backlog](#backlog)
- [Conventions](#conventions)

---

## Legend

| Label | Meaning |
| --- | --- |
| `security` | Access control, exposure of data or documents |
| `data-protection` | DPIA actions, retention, lawful basis, processor assurance |
| `governance` | Review, sign-off, consultation |
| `infra` | Build, deploy, CI, schema |
| `docs` | Documentation only |

Priority is shown as `P0` (blocking), `P1` (needed before wider rollout) or
`P2` (should be done, not blocking).

---

## Security and access

- [ ] **Put authentication in front of the open routes** — the audit log, the
      Notebook, the staff records and the model settings are reachable by anyone
      who has the URL. This is also not yet listed as a risk in `lib/dpia.js`.
      <br>`security` `P0` · Source: `ARCHITECTURE.md` §15.5

- [ ] **Review what is served publicly** — practice documents in
      `public/assets/rag/` are public, and Notebook attachments are stored in
      Vercel Blob with `access: 'public'`. Neither is recorded in the DPIA.
      <br>`security` `data-protection` `P0` · Source: `ARCHITECTURE.md` §15.6

---

## Data protection

- [ ] **Add automatic screening for patient data** in questions and notes —
      recorded as the single control that would move DPIA risks #1 and #2 off
      "High". Currently only the on-screen warning is in place.
      <br>`data-protection` `P0` · Source: `ARCHITECTURE.md` §15.12, `lib/dpia.js` step 6

- [ ] **Write staff guidance for the Notebook** — that it is for practice
      procedures and never patient information.
      <br>`data-protection` `docs` `P1` · Source: `lib/dpia.js` step 6

- [ ] **Set up a periodic review of notes** for personal data.
      <br>`data-protection` `P1` · Source: `lib/dpia.js` step 6

- [ ] **Decide the withdrawn rota tool's future** — `staff`, `rotas` and
      `medications` are still populated. Either return the tool or delete the
      stored records. Flagged as DPIA risk #6; the decision is outstanding.
      <br>`data-protection` `P1` · Source: `ARCHITECTURE.md` §15.11, `lib/dpia.js` steps 5–6

- [ ] **Obtain written data-handling assurance from OpenRouter** — provider
      routing is already pinned to zero-retention providers, but the written
      confirmation is still outstanding in DPIA steps 3 and 4.
      <br>`data-protection` `P1` · Source: `ARCHITECTURE.md` §15.4, `lib/dpia.js` steps 3, 4, 6

- [ ] **Give the audit log a retention policy** — it currently has none and
      stores staff question text verbatim for the unguarded routes.
      <br>`data-protection` `P1` · Source: `ARCHITECTURE.md` §15.8

- [ ] **Time-limit the answer cache** — `answer_cache.question` holds question
      text verbatim plus its embedding, and is invalidated but not otherwise
      time-limited beyond `MAX_AGE_DAYS`.
      <br>`data-protection` `P2` · Source: `ARCHITECTURE.md` §15.9

- [ ] **Record Vercel Analytics and Google Fonts in the DPIA** — both receive
      staff device data, including IP, on every page load. Google Fonts is
      removable by self-hosting the font.
      <br>`data-protection` `P2` · Source: `ARCHITECTURE.md` §15.7

- [ ] **Name Exa in the DPIA** — it receives model-composed web-search queries
      through OpenRouter's `web_search` server tool.
      <br>`data-protection` `P2` · Source: `ARCHITECTURE.md` §15.10

- [ ] **Review source documents for unnecessary personal data before indexing**,
      to limit staff and third-party names sent as answer context.
      <br>`data-protection` `P2` · Source: `lib/dpia.js` step 6

- [ ] **Set up a periodic review of the document set** so answers do not go
      out of date.
      <br>`data-protection` `P2` · Source: `lib/dpia.js` step 6

### Governance

- [ ] **Confirm the lawful basis with the practice** — expected to be legitimate
      interest / performance of the employment relationship, but not yet
      confirmed.
      <br>`governance` `P1` · Source: `lib/dpia.js` step 4

- [ ] **Run the IG review and the staff pilot** — the information-governance
      review by the partners / practice manager and structured feedback from a
      staff pilot are both outstanding. DPIA step 3 is `pending`.
      <br>`governance` `P1` · Source: `lib/dpia.js` step 3

- [ ] **Complete DPIA sign-off** — measures and residual risks are both "Not yet
      approved", no DPO is appointed, and consultation responses are "Not yet
      started". If the patient-data risk is accepted as a residual high risk, the
      ICO must be consulted first.
      <br>`governance` `P1` · Source: `lib/dpia.js` step 7

---

## Engineering

- [ ] **Add CI with an automated test gate before deploy** — there is none
      today. *(marked "to confirm" in the source.)*
      <br>`infra` `P1` · Source: `ARCHITECTURE.md` §15.13

- [ ] **Introduce schema migrations** — the schema is created lazily with
      `IF NOT EXISTS` and there is no migration history.
      <br>`infra` `P1` · Source: `ARCHITECTURE.md` §15.13

---

## Open questions

Facts that could not be established from the repository. These need an answer
before they can become tasks — they are not work items yet.

- [ ] **Hosting platform settings** — project, region, and whether any
      deployment protection is enabled.
      <br>Source: `ARCHITECTURE.md` §15.1

- [ ] **Neon database region** — held in the git-ignored connection string. This
      is the residency question for all stored data.
      <br>Source: `ARCHITECTURE.md` §15.2

- [ ] **GitHub repository visibility** — if the repository is public, every
      practice document in `rag/sources/` and the contact directory are public
      too.
      <br>Source: `ARCHITECTURE.md` §15.3

- [ ] **Geographic location of the providers** that `data_collection: 'deny'`
      routes to.
      <br>Source: `ARCHITECTURE.md` §15.4

---

## Backlog

Nothing here yet — add new items below.

<!-- Add new items here. Move them into a section above once they have a source. -->

---

## Conventions

- One checkbox per item, `- [ ]` open and `- [x]` done.
- Bold the action, then a sentence of context — enough to act on without
  opening another file.
- Every item carries at least one label, a priority, and a **Source**.
- Tick items rather than deleting them; clear the ticked ones when you bump
  **Last reviewed** at the top.
- Keep the sections in the order above so the contents list stays valid.
