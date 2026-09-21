# Typed notes — handoff for the answer-system redesign

Written 2026-09-21 from the notebook export `notebook-backup-2026-09-21.json`
(172 notes, 132 with content, about 180 KB) and the code at version 6.12.1 (main as of the same morning).
Nothing in this document has been built yet. It is the design, the reasons, the
exact places in the code that change, the migration, and the order to do it in.

**One sentence.** A note declares what it is (`kind`); the kind fixes the fields
it holds, how it is validated, how it is rendered and how it is searched; the
model never chooses a format; folder position means nothing.

---

## 1. Why we are doing this

### The three problems in the pipeline as it stands

1. **Every question ships the whole Notebook to the model.** `fullNotebookContext()`
   loads every page and `selectionPrompt` puts it all in one `generateObject`
   call (`app/api/agent/route.js` around line 1005 and 1085). One call, but a
   large one, on every turn, and since 6.12.0 (`f05251d`) there is no trim or
   catalogue fallback at all: every page, whole, every time.
2. **A formatted page costs a second model call at answer time.** When the
   chosen page sits under a tagged folder, `applyOutputTag` (route.js ~1040)
   runs `readValues` against `outputTagPrompt` to lift the e-RS or AccurX values
   out of the page's prose. That runs again for every question and can read the
   same page differently on different days. It is the single biggest threat to
   "the same referral is always formatted the same way".
   Since 6.12.0 (`557f2da`) referral turns carry a second such read:
   `lib/agent/referral-read.mjs` asks the model for the route, speciality and
   clinic type off the page, then `groundReferralRead` deletes any value not
   found verbatim in it. Careful work, and exactly the work a structured field
   makes unnecessary: a typed note *is* the grounded read, done once, by a
   person, on save.
3. **The format is inherited from the folder.** `noteOutputTag` in
   `lib/knowledge-context.mjs` walks up the tree to the nearest tagged section.
   Drag a page out of "ERS referrals" and it silently stops being an e-RS
   answer; drag a prose page in and it silently becomes one. Nobody is told.

The retrieval router that would answer without any model call exists
(`lib/routing/`) but ships **off**. Measured 2026-09-18 (`evals/routing/results.md`):
5.8% answered instantly, 0% wrong page, 84.6% fell through to the picker.

### What "solid" means here

- The format of an answer must be a property of **the record that answers it**,
  chosen by a person at creation, validated on save, and immune to where the
  record sits in the tree.
- Rendering must be a pure function of stored fields. No model in the render
  path, ever.
- A record that cannot be rendered correctly (missing speciality, missing email)
  must be impossible to serve, not merely unlikely.
- Drift must be surfaced, not silently tolerated: a plain note that looks like
  a referral card gets a suggestion, never an automatic conversion.

---

## 2. The design

### 2.1 Kinds

A closed registry, `lib/notebook/kinds.mjs`. Four kinds to start:

| kind | What it is | Rendered as |
| --- | --- | --- |
| `note` | Free prose, exactly what exists today | The page verbatim (`notebookPageAnswer`) |
| `ersReferral` | One e-RS pathway | The e-RS screen (`ers()` block) above the note text |
| `emailReferral` | One referral sent by AccurX professional message / email | The AccurX window (`profMessage()` block) above the note text |
| `bloodTestSet` | The blood tests one review type needs | The EMIS Test Requests screen (`pathology()` block) above the note text |

Each kind is one object:

```js
{
  id: 'ersReferral',
  label: 'e-RS referral',
  colour: TAG_COLOURS.blue,           // reuse from lib/templates/output-tags.mjs
  schema: z.object({...}),            // the fields, all strings/arrays, all defaulted
  required: ['specialty', 'clinicType'],   // what "live" needs
  validate(fields) -> [{ field, message }],   // beyond required: enums, email shape
  render(fields, note) -> block | null,       // pure; the block goes above the body
  searchText(fields, note) -> string,         // what the router/picker index sees
  toProse(fields) -> markdown,                // used when downgrading to `note`
  extractPrompt(note) -> string,              // model prefill on upgrade from `note` (the only model use)
}
```

`note` has an empty schema, no `required`, `render` returns null.

### 2.2 Fields per kind

**ersReferral** (mirrors `ers()` in `lib/templates/blocks.mjs:97`)

| field | type | live-required | notes |
| --- | --- | --- | --- |
| `service` | string | yes | Display name, e.g. "Audiology / hearing test". Defaults from the title. |
| `aliases` | string[] | no | How staff ask for it: "hearing test", "audiology". Feeds the router as exact triggers. |
| `specialty` | string | yes | Exactly as e-RS spells it. |
| `clinicType` | string | yes* | *Either this or `clinicTypeOptions` non-empty. |
| `clinicTypeOptions` | string[] | no | Only when the card records a choice. |
| `clinicTypeCondition` | string | no | Rule against the clinic type. |
| `hospital` | string | no | A named site. |
| `hospitalRule` | string | no | "First hospital that isn't a telederm". |
| `pathway` | string | no | A named RAS service to search for. |
| `priority` | enum `Routine` / `Urgent` / `2WW` | yes | Default `Routine`. |
| `requestType` | enum `Referral` / `Advice and Guidance` | yes | Default `Referral`. Community gynaecology uses A&G. |
| `form` | string | no | Letter template name, e.g. "AQP Direct Access". |

**emailReferral** (mirrors `profMessage()` in `blocks.mjs:140`)

| field | type | live-required | notes |
| --- | --- | --- | --- |
| `service` | string | yes | |
| `aliases` | string[] | no | |
| `to` | string | yes* | Email address. *Or `toRule` — see below. |
| `toRule` | string | no | "Fills in from the document" / "Same address as ECG". Live requires `to` OR `toRule`. |
| `org` | string | no | Organisation name. |
| `form` | string | no | "RP Echo". |
| `attach` | string | no | Default "EMIS file". |
| `body` | string | no | Wording, only if the practice dictates it; otherwise `referralEmailBody()` in `lib/templates/referrals.mjs:297` builds it from `service`. |

**bloodTestSet** (mirrors `pathology()` in `blocks.mjs:174`)

| field | type | live-required | notes |
| --- | --- | --- | --- |
| `review` | string | yes | "Diabetes review". |
| `aliases` | string[] | no | |
| `ordered` | string[] | yes (non-empty) | Test names exactly as the EMIS screen lists them. |
| `clinicalDetails` | string | no | |
| `timing` | string | no | "Before 1 pm for the AM slot". |

**Every typed note keeps `body`.** It becomes the "Differences from the standard
process / notes" free text and is rendered under the screen, exactly as the
tagged card does today. So Audiology's letter-creation steps are not lost, and
every existing reader of `body` (defrag, analyse, coherence, snapshots,
export) keeps working unchanged.

### 2.3 Status: live or draft

`status` is `live` or `draft`. A save that fails `required` or `validate` is
stored as `draft` with its issues, never rejected (people must be able to save
half a card). **Drafts are never served**: `buildFullNotebookSources` skips
them, the router never indexes them, `readPathways` never reads them. The
notebook UI shows a draft banner with the exact missing fields.

### 2.4 The invariant that makes formatting safe

> The template for a Notebook answer is `kinds[note.kind].render`. Nothing else
> in the pipeline may pick a screen block for a Notebook page.

Consequences:

- `taggedNotebookPage` / `applyOutputTag` / `outputTagPrompt` / `withTaggedOutput`
  are deleted, along with `output_tag` inheritance. One code path renders a
  page whether the router or the picker chose it.
- The model's job in a Notebook turn is only "which note id". The picker's
  `pages: z.array(z.string())` in `SELECTION_SCHEMA` (`lib/templates/route.mjs:121`)
  stays a title, resolved in code.
- A test iterates every kind's fixture and asserts the block type equals the
  kind's block type, and that a `note` renders no screen block.

### 2.5 Retrieval, cheapest first

Already built, needs switching on and feeding:

1. **Exact triggers.** `aliases` and `service` become exact-match rows in the
   trigger index (`addTapTrigger`/`replaceGeneratedTriggers`, source
   `'field'`, a third `TRIGGER_SOURCES` value) so "hearing test referral"
   hits Audiology on rung 1 (`routeQuestion`, `lib/routing/router.mjs:58`)
   with no model call.
2. **Scored router.** Generated phrases as now (`npm run routing:seed`), but
   `searchText` for typed notes is fields plus body, so the embedding is of
   the card, not of screenshots and steps.
3. **Per-kind thresholds.** Typed notes are named entities and can take a
   lower `hitCos` than prose. Add `routing_hit_cos_typed` beside the existing
   keys in `lib/routing/thresholds.mjs`; `decide()` reads the kind of the top
   candidate. Start prose at the stored 0.88 and typed at 0.82, then re-run the
   bench.
4. **Picker on a shortlist.** Replace the whole-Notebook prompt with the top
   N (start at 12) candidates from `searchTriggers` plus every typed note's
   one-line `searchText`, and keep the full text only for those N. This is the
   latency win for the 85% that still reach the model. Do it last; it is
   independent of the typing work and needs its own bench run.

### 2.6 Suggestions (the AI helper, kept passive)

- On save of a `note`, a cheap deterministic check runs first: does the body
  contain two or more of the card labels (`Route:`, `Speciality:`, `Clinic
  type:`, `Send to`, an email address, a `Test | Code` table)? If yes, mark
  `suggested_kind`. No model call.
- The notebook page shows a banner: "This looks like an e-RS referral. Convert?"
  Clicking runs `extractPrompt` once, shows the prefilled form, the person
  edits and saves. The old body stays as the notes text.
- A "Needs attention" list on `/notebook` shows: drafts with their issues,
  notes with a `suggested_kind`, empty pages, and duplicate typed notes (same
  `specialty` + `clinicType`, or same `to`).
- Nothing converts automatically. A suggestion never changes how a note is
  answered.

---

## 3. Data model

```sql
ALTER TABLE notes ADD COLUMN IF NOT EXISTS kind           text  NOT NULL DEFAULT 'note';
ALTER TABLE notes ADD COLUMN IF NOT EXISTS fields         jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS status         text  NOT NULL DEFAULT 'live';   -- live | draft
ALTER TABLE notes ADD COLUMN IF NOT EXISTS issues         jsonb NOT NULL DEFAULT '[]'::jsonb; -- [{field,message}]
ALTER TABLE notes ADD COLUMN IF NOT EXISTS suggested_kind text  NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS notes_kind_idx ON notes (kind) WHERE kind <> 'note';
```

Goes in `ensureNotebookSchema()` (`lib/db.js:164`) next to the existing
`ALTER TABLE … output_tag` line. Leave `output_tag` in place until step 7 of
the rollout, then drop it.

Every `SELECT` in `lib/notebook.js` that lists the note columns (lines 18, 39,
63, 96, 138, 794, 899) gains `kind, fields, status, issues, suggested_kind
AS "suggestedKind"`. `createNote` takes `kind`; `updateNote` takes `fields`
and runs the kind's validation, writing `status` and `issues`.

Export/import (`app/api/notebook/export/route.js`, `importNotebook` in
`lib/notebook.js:533`): bump `version` to 2 and carry the five new columns. A
version 1 file still imports with `kind = 'note'`.

Snapshots (`lib/notebook/snapshot-payload.mjs:41`) carry `kind` and `fields`
alongside `outputTag` so a revert restores the type too.

---

## 4. Code changes, file by file

### New

- `lib/notebook/kinds.mjs` — the registry (section 2.1). Schemas move here from
  `OUTPUT_TAGS` in `lib/templates/output-tags.mjs`; the three `render`
  functions there are already the right shape and can be lifted almost verbatim.
- `lib/notebook/card-parser.mjs` — deterministic parser for the practice's
  "Pathway card template" lines (`**Route:** …`, `**Speciality:** …`) and the
  Dermatology-style table (`Category | Specialty | Clinic Type | Hospital
  Selection Rule`). Used by the migration and by the suggestion check. Much of
  this exists in `readPathways` (`lib/referrals/pathways.mjs:348`); reuse the
  label and table readers, drop the folder regex.
- `scripts/notebook-typed-migrate.mjs` — section 5.
- `app/api/notebook/lint/route.js` — the "Needs attention" data.
- `app/api/notebook/convert/route.js` — `POST { id, kind }` runs
  `extractPrompt` once and returns prefilled fields; does not save.
- `app/_components/notebook/KindForm.jsx` — the typed editor (one component,
  driven by the kind's schema).
- `test/notebook-kinds.test.mjs`, `test/card-parser.test.mjs`,
  `test/typed-render.test.mjs`.

### Changed

- `lib/knowledge-context.mjs` — `buildFullNotebookSources` skips
  `status === 'draft'`, carries `kind` and `fields`, sets `text` to
  `kinds[kind].searchText(fields, row)` followed by the body. Delete
  `noteOutputTag`.
- `lib/templates/route.mjs` — replace `taggedNotebookPage` (line 669) with
  `typedNotebookPage(selection, pages)` that returns `{ page, kind }`;
  `renderSelection`'s `notebook` case calls `notebookPageAnswer` then, if the
  kind renders a block, prepends it. No model.
- `app/api/agent/route.js` — delete `applyOutputTag` (line 1039) and both
  call sites. The `format` phase disappears from usage logging. The
  `referralRead` phase (`lib/agent/referral-read.mjs`, added in `557f2da`)
  goes at step 6 once `ersReferral` notes cover the pathways, because the
  values it reads and grounds are then stored fields.
- `lib/templates/referrals.mjs` and `lib/referrals/pathways.mjs` —
  `findPathwayReferral` reads `ersReferral` notes by `service`/`aliases`
  instead of regex-parsing pages under a folder named "pathway". Same for
  `findEmailedReferral` against `emailReferral` notes. `REFERRAL_SERVICES`
  (line 36) becomes a fallback only and is retired once the migration shows
  every entry is covered by a typed note.
- `lib/templates/bloods.mjs` — `bloodFormAnswer` reads `bloodTestSet` notes.
- `lib/routing/triggers.mjs` — add `'field'` to `TRIGGER_SOURCES`; a
  `replaceFieldTriggers({ targetRef, phrases })` that rewrites the alias rows
  on every typed-note save. `lib/routing/thresholds.mjs` — per-kind hit
  threshold. `lib/routing/decision.mjs` — `decide()` takes the kind of the
  top candidate.
- `app/api/notebook/route.js` — `POST` accepts `kind`; `PATCH` accepts
  `fields`; both return `{ note, issues }`. Remove the `outputTag` branch.
- `app/notebook/page.js` — the "New page" action (line 641) becomes a menu:
  Note / e-RS referral / Email referral / Blood test set. Typed notes open
  `KindForm` above the existing body editor. Remove the "Format answers as"
  context menu (line 1229). Add the draft banner, the convert banner and the
  Needs attention panel. `TagChip` becomes a kind chip on the tree row (same
  colours).
- `app/_components/templates/TemplateView.jsx` — no change; it already draws
  `ers`, `profMessage` and `pathology` blocks.
- `ARCHITECTURE.md` §8 and the mermaid diagram: the FORMAT step goes; the
  Notebook load says "live notes only, typed notes rendered from fields".

### Deleted (rollout step 7)

- `lib/templates/output-tags.mjs` (keep `TAG_COLOURS` by moving it to kinds).
- `test/output-tags.test.mjs` (its shape-vs-answer assertions move to
  `typed-render.test.mjs`).
- The `output_tag` column and `setNoteOutputTag`.
- The `PATHWAY_SECTION` folder regex in `lib/referrals/pathways.mjs`.

---

## 5. Migration of the existing Notebook

`scripts/notebook-typed-migrate.mjs`, run once against Postgres (or against an
export file with `--file`, which is how to rehearse it locally without the
database):

1. For every page under the sections currently tagged `ers`, `profMessage`
   and `pathology` (22 + 13 + 7 pages), run `card-parser`.
2. Set `kind` from the folder tag **for this one migration only**, `fields`
   from the parser, `status` from validation.
3. Print a table: page, kind, status, missing fields. Commit nothing until the
   table has been read.
4. `--apply` writes it. Then `npm run routing:seed -- --force` so triggers are
   regenerated from `searchText`.

What the parser will get, from the export as it is today:

| Page | Expected result | Why |
| --- | --- | --- |
| Audiology, RACPC, Endoscopy, Fertility, Hernias, Maxfax, Orthopaedics, Pain management, ESP physio, Podiatry, Sleep apnoea, Foot Health, Community gynaecology | **live** | Card lines present with speciality and clinic type |
| Chronic fatigue | draft | Speciality reads "Accessed via physio unless otherwise specified (C16)". Needs a real value. |
| Community ENT | draft | Clinic type is "The appropriate ENT clinic". |
| Physiotherapy (standard) | draft | No card lines at all; it is prose with three sub-pathways. Probably becomes three notes. |
| Normal Dermatology, Normal Teledermatology, Normal Community Dermatology, 2WW Dermatology, 2WW Teledermatology | live if the table reader lands, else draft | Table format `Category / Specialty / Clinic Type / Hospital Selection Rule`. Worth a dedicated parser branch: five pages. |
| New page (empty, under ERS) | delete | Empty body. |
| Social prescriber, Falls Clinic | live | Addresses present in the body. |
| BCG, EDDI, Retinal, District Nurse, ECG, Echo, Minor surgery, Asthma, Gym | draft | No email address on the page. Echo says the ECG address "is not currently recorded". `toRule: "Fills in from the document"` is acceptable where that is genuinely how it works (Step 2b says the address fills in from the attached form), and a person should set it deliberately per note. |
| CAMHS | draft | Every field says "Standard" and the page itself flags conflict C7 (e-RS or email). Someone has to decide. |
| Minor eye service (styes) | neither kind | Patient self-refers. Leave as `note`. |
| Seven "BT items" pages | live | Test names are in a `Test | Code` table; `ordered` is the first column. |

Also generate "Pathway index" from typed notes rather than maintaining it by
hand; it already disagrees with the cards in two places (CAMHS, Community ENT).

---

## 6. Tests

- `card-parser.test.mjs`: every shape above (bold labels, plain labels, the
  Dermatology table, the BT table, a numbered-steps page that must yield
  nothing).
- `notebook-kinds.test.mjs`: each kind validates its fixtures; a missing
  required field yields `draft` with the field named; an unknown kind is
  rejected; `toProse(schema.parse(x))` round-trips through the parser.
- `typed-render.test.mjs`: for every kind, `render` on a live fixture yields
  exactly its block type; `note` yields null; a draft is absent from
  `buildFullNotebookSources`; `renderSelection` for a typed page puts the block
  first and the body after.
- Keep `answerToText` coverage (`lib/questions/flatten.mjs`) so the question
  log still flattens a typed card.
- Re-run `node evals/routing/bench-pages.mjs report.json --repeats 5` after
  migration and after each threshold change; the headline metric is still
  "wrong page rendered", which must stay at 0.

---

## 7. Rollout order

Each step is a separate commit, each ships green, each is independently
revertable.

1. **Schema + registry + validation** (`feat`). Columns, `kinds.mjs`, `createNote`/`updateNote`
   changes, API accepting `kind`/`fields`. Nothing renders differently yet.
2. **Notebook editor** (`feat`). Create menu, `KindForm`, draft banner, kind chip.
3. **Migration script + rehearsal on the export** (`feat`). Read the table; fix
   the Dermatology parser branch until those five pages are live.
4. **Run the migration on the live database**, then seed triggers.
5. **Swap the render path** (`feat`). `typedNotebookPage` replaces
   `taggedNotebookPage`; delete `applyOutputTag`. From this commit the FORMAT
   model call is gone.
6. **Referrals and bloods read typed notes** (`refactor`). Retire the folder
   regex and, when covered, `REFERRAL_SERVICES`.
7. **Delete folder tags** (`refactor`, `feat!` if the export format is treated
   as a contract). Column, menu, module, test.
8. **Turn the router on** for typed notes only (per-kind threshold), watch
   `npm run routing:stats` for a week, then consider prose.
9. **Shortlist picker** (`perf`). Separate bench.

Steps 1 to 5 deliver the formatting guarantee. Steps 8 and 9 deliver the speed.

---

## 8. Decisions still open

- **Sub-pathways on one page.** Physiotherapy (standard) and Maxfax describe
  several pairings. Recommendation: one typed note per pairing, grouped in a
  folder; the folder is organisation only. A single note with a list of
  pairings would put a choice back into the render step.
- **`toRule` versus requiring a real address.** Step 2b says AccurX fills the
  address from the attached form. If that is reliably true, `toRule` is
  legitimate; if not, make `to` required and chase the addresses.
- **Who can change a kind.** Today the notebook has no auth (`TODO.md`, P0).
  Conversion is destructive-ish (fields replace formatting); it should sit
  behind the same gate as delete once auth lands.
- **Export format bump.** Version 2 is additive, so `feat` not `feat!`, unless
  something outside this repo reads the backup.

---

## 9. Quick reference: where things are today

| Thing | Where |
| --- | --- |
| Notes table | `lib/db.js:164` `ensureNotebookSchema` |
| Notebook data access | `lib/notebook.js` |
| Folder-tag inheritance | `lib/knowledge-context.mjs` `noteOutputTag` |
| Tag schemas and renderers | `lib/templates/output-tags.mjs` |
| Screen blocks | `lib/templates/blocks.mjs` `ers` (97), `profMessage` (140), `pathology` (174) |
| Block drawing in the chat | `app/_components/templates/TemplateView.jsx` |
| Tag applied to a chosen page | `lib/templates/route.mjs` `taggedNotebookPage` (669) |
| The second model call | `app/api/agent/route.js` `applyOutputTag` (1039) |
| The referral pairing read | `lib/agent/referral-read.mjs`, `referralCardFromRead` in `lib/templates/referrals.mjs`, `test/referral-read.test.mjs` |
| Picker schema | `lib/templates/route.mjs` `SELECTION_SCHEMA` (84) |
| Router | `lib/routing/router.mjs` `routeQuestion`; thresholds in `thresholds.mjs`; `/settings` |
| Router bench and results | `evals/routing/bench-pages.mjs`, `evals/routing/results.md` |
| Folder-regex pathway reader | `lib/referrals/pathways.mjs` `readPathways`, `PATHWAY_SECTION` (52) |
| Hard-coded referral list | `lib/templates/referrals.mjs` `REFERRAL_SERVICES` (36) |
| Notebook UI | `app/notebook/page.js` (create at 641, tag menu at 1229) |
| Notebook API | `app/api/notebook/route.js` |
| Export / import | `app/api/notebook/export/route.js`, `importNotebook` in `lib/notebook.js:533` |
| Trigger seeding | `scripts/routing-seed.mjs`, `lib/routing/generate.mjs` |
